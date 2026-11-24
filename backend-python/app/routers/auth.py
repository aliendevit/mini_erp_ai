from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from fastapi.params import Depends as DependsParam
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CompanyProfile, SaasTenant, UserAccount
from ..schemas import (
    AccountControlFeatureResponse,
    AccountControlPermissionsPayload,
    AccountControlResponse,
    AccountControlUserResponse,
    AuthChangePasswordPayload,
    AuthLoginPayload,
    AuthRegisterPayload,
    AuthResponse,
    AuthUserResponse,
    CompanyProfilePayload,
    CompanyProfileResponse,
    ManagerCreateUserPayload,
)
from ..services.audit import actor_id, record_audit

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+?[0-9]{8,15}$")
PASSWORD_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]).{12,128}$"
)
HASH_ITERATIONS = 210_000
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOGIN_LOCK_MINUTES = 15
SESSION_TTL_HOURS = 8
SESSION_COOKIE_NAME = "omran_session"
LOGIN_RATE_WINDOW_SECONDS = 60
LOGIN_RATE_LIMIT = max(1, int(os.getenv("LOGIN_RATE_LIMIT_PER_MINUTE", "20")))
_login_rate_buckets: dict[str, deque[float]] = {}
_login_rate_lock = Lock()
PLATFORM_DEFAULT_PERMISSIONS = [
    "manage_platform",
    "manage_tenants",
    "manage_subscriptions",
    "manage_saas_invoices",
    "view_platform_audit",
    "view_audit_log",
    "restore_backups",
]
MANAGER_DEFAULT_PERMISSIONS = [
    "manage_company",
    "manage_users",
    "use_ai_intake",
    "use_rag",
    "use_ai_monitoring",
    "manage_invoices",
    "view_audit_log",
    "view_projects",
    "update_tracking",
    "upload_photos",
]
USER_DEFAULT_PERMISSIONS = [
    "use_ai_intake",
    "use_rag",
    "view_projects",
    "update_tracking",
    "upload_photos",
]
VIEWER_DEFAULT_PERMISSIONS = [
    "view_projects",
]
AI_PERMISSION_FEATURES = [
    {
        "key": "ai_intake",
        "title": "AI Intake",
        "description": "Create project requests, continue intake conversations, and generate structured proposal drafts.",
        "permission": "use_ai_intake",
    },
    {
        "key": "rag_memory",
        "title": "RAG Knowledge",
        "description": "Use approved project memory and uploaded knowledge sources inside AI answers.",
        "permission": "use_rag",
    },
    {
        "key": "ai_monitoring",
        "title": "AI Monitoring",
        "description": "Analyze project progress, warnings, delay risks, and monitoring history.",
        "permission": "use_ai_monitoring",
    },
]
AI_PERMISSION_KEYS = {feature["permission"] for feature in AI_PERMISSION_FEATURES}


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_email(email: str) -> str:
    normalized = _normalize_email(email)
    if len(normalized) > 254 or not EMAIL_RE.match(normalized):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid email address.")
    return normalized


def _validate_password(password: str) -> str:
    if not PASSWORD_RE.match(password or ""):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Password must be 12-128 characters and include uppercase, lowercase, number, and special characters.",
        )
    return password


def _validate_phone(phone: str | None) -> str | None:
    if phone is None or phone.strip() == "":
        return None
    normalized = phone.strip()
    if not PHONE_RE.match(normalized):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Phone must contain only numbers and optional +.")
    return normalized


def _validate_display_name(value: str | None) -> str:
    name = (value or "").strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "User name is required.")
    if len(name) > 120:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "User name is too long.")
    return name


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hash_password(password: str, salt: str | None = None) -> str:
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_value.encode("utf-8"), HASH_ITERATIONS)
    return f"pbkdf2_sha256${HASH_ITERATIONS}${salt_value}${digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)).hex()
    return hmac.compare_digest(digest, expected)


DUMMY_PASSWORD_HASH = _hash_password("Not-A-Real-Password1!")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _enforce_login_rate_limit(request: Request | None) -> None:
    if request is None or request.client is None:
        return
    key = request.client.host or "unknown"
    now = time.monotonic()
    with _login_rate_lock:
        bucket = _login_rate_buckets.setdefault(key, deque())
        while bucket and now - bucket[0] >= LOGIN_RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= LOGIN_RATE_LIMIT:
            retry_after = max(1, int(LOGIN_RATE_WINDOW_SECONDS - (now - bucket[0])))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many login attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)


def permissions_for_user(user: UserAccount) -> list[str]:
    try:
        explicit = [str(item) for item in json.loads(getattr(user, "permissions_json", None) or "[]") if str(item).strip()]
    except Exception:
        explicit = []
    if getattr(user, "account_level", None) != "platform_admin":
        explicit = [permission for permission in explicit if permission != "restore_backups"]
    if explicit:
        return explicit
    account_level = getattr(user, "account_level", "company_manager")
    if account_level == "platform_admin":
        return PLATFORM_DEFAULT_PERMISSIONS.copy()
    if account_level == "company_viewer":
        return VIEWER_DEFAULT_PERMISSIONS.copy()
    if account_level == "company_user":
        return USER_DEFAULT_PERMISSIONS.copy()
    return MANAGER_DEFAULT_PERMISSIONS.copy()


def has_permission(user: UserAccount, permission: str) -> bool:
    permissions = set(permissions_for_user(user))
    return permission in permissions


def tenant_id_for_user(user: UserAccount | None) -> str | None:
    if isinstance(user, DependsParam):
        # Direct unit calls may leave FastAPI's dependency placeholder in place.
        return None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication is required.")
    if getattr(user, "account_level", None) == "platform_admin":
        return None
    tenant_id = getattr(user, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is not assigned to a company tenant.")
    return str(tenant_id)


def require_permission(permission: str):
    def dependency(user: UserAccount = Depends(get_current_user)) -> UserAccount:
        if not has_permission(user, permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}")
        return user

    return dependency


def require_any_permission(*permissions: str):
    def dependency(user: UserAccount = Depends(get_current_user)) -> UserAccount:
        if not any(has_permission(user, permission) for permission in permissions):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing required permission.")
        return user

    return dependency


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _profile_response(profile: CompanyProfile) -> CompanyProfileResponse:
    return CompanyProfileResponse(
        id=profile.id,
        ownerUserId=profile.owner_user_id,
        companyName=profile.company_name,
        legalName=profile.legal_name,
        street=profile.street,
        zipCode=profile.zip_code,
        city=profile.city,
        country=profile.country,
        vatId=profile.vat_id,
        taxNumber=profile.tax_number,
        bankName=profile.bank_name,
        iban=profile.iban,
        bic=profile.bic,
        phone=profile.phone,
        email=profile.email,
        website=profile.website,
        notes=profile.notes,
        createdAt=profile.created_at,
        updatedAt=profile.updated_at,
    )


def _company_profile_complete(user_id: str, db: Session) -> bool:
    profile = db.scalar(select(CompanyProfile).where(CompanyProfile.owner_user_id == user_id))
    return bool(
        profile
        and profile.company_name.strip()
        and (profile.street or "").strip()
        and (profile.city or "").strip()
        and (profile.phone or "").strip()
        and (profile.email or "").strip()
    )


def _user_response(user: UserAccount, db: Session) -> AuthUserResponse:
    permissions = permissions_for_user(user)
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        displayName=user.display_name,
        phone=user.phone,
        tenantId=user.tenant_id,
        accountLevel=user.account_level,
        tenantName=user.tenant_name,
        role=user.role,
        permissions=permissions,
        createdAt=user.created_at,
        lastLoginAt=user.last_login_at,
        companyProfileComplete=_company_profile_complete(user.id, db),
    )


def _auth_payload(user: UserAccount, db: Session) -> AuthResponse:
    return AuthResponse(user=_user_response(user, db))


def _ai_feature_response(user: UserAccount) -> list[AccountControlFeatureResponse]:
    permissions = set(permissions_for_user(user))
    return [
        AccountControlFeatureResponse(
            key=feature["key"],
            title=feature["title"],
            description=feature["description"],
            permission=feature["permission"],
            enabled=feature["permission"] in permissions,
        )
        for feature in AI_PERMISSION_FEATURES
    ]


def _account_control_user_response(user: UserAccount) -> AccountControlUserResponse:
    failed_attempts = int(user.failed_login_attempts or 0)
    return AccountControlUserResponse(
        id=user.id,
        email=user.email,
        displayName=user.display_name,
        phone=user.phone,
        accountLevel=user.account_level,
        role=user.role,
        tenantName=user.tenant_name,
        permissions=permissions_for_user(user),
        aiFeatures=_ai_feature_response(user),
        isActive=user.is_active,
        failedLoginAttempts=failed_attempts,
        remainingLoginAttempts=max(0, MAX_FAILED_LOGIN_ATTEMPTS - failed_attempts),
        lockedUntil=user.locked_until,
        lastLoginAt=user.last_login_at,
        createdAt=user.created_at,
    )


def _tenant_user_usage(db: Session, tenant_id: str | None) -> tuple[SaasTenant | None, int]:
    if not tenant_id:
        return None, 0
    tenant = db.get(SaasTenant, tenant_id)
    used = (
        db.scalar(
            select(func.count())
            .select_from(UserAccount)
            .where(
                UserAccount.tenant_id == tenant_id,
                UserAccount.account_level.in_(["company_user", "company_viewer"]),
            )
        )
        or 0
    )
    return tenant, int(used)


def _issue_session(user: UserAccount) -> str:
    token = secrets.token_urlsafe(32)
    user.session_token_hash = _hash_token(token)
    user.session_created_at = datetime.now(timezone.utc)
    user.last_login_at = datetime.now(timezone.utc)
    return token


def _set_session_cookie(response: Response | None, token: str) -> None:
    if response is None:
        return
    secure_default = "true" if os.getenv("CORS_ORIGIN", "").lower().startswith("https://") else "false"
    secure = os.getenv("SESSION_COOKIE_SECURE", secure_default).strip().lower() in {"1", "true", "yes"}
    same_site = os.getenv("SESSION_COOKIE_SAMESITE", "lax").strip().lower()
    if same_site not in {"lax", "strict", "none"}:
        same_site = "lax"
    if same_site == "none" and not secure:
        raise RuntimeError("SameSite=None session cookies require SESSION_COOKIE_SECURE=true.")
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=SESSION_TTL_HOURS * 60 * 60,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
    )


def _clear_session(user: UserAccount) -> None:
    user.session_token_hash = None
    user.session_created_at = None


def verify_current_password_with_lockout(db: Session, user: UserAccount, password: str) -> None:
    """Verify a destructive-action step-up password with the same durable lockout policy as login."""
    if isinstance(db, DependsParam) or not hasattr(db, "scalar"):
        if not _verify_password(password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect.")
        return
    locked_user = db.scalar(select(UserAccount).where(UserAccount.id == user.id).with_for_update()) or user
    now = datetime.now(timezone.utc)
    locked_until = _as_aware_utc(locked_user.locked_until)
    if locked_until and locked_until > now:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many password attempts. Try again later.",
            headers={"Retry-After": str(max(1, int((locked_until - now).total_seconds())))}
        )
    if _verify_password(password, locked_user.password_hash):
        locked_user.failed_login_attempts = 0
        locked_user.locked_until = None
        db.commit()
        return

    attempts = int(locked_user.failed_login_attempts or 0) + 1
    locked_user.failed_login_attempts = min(attempts, MAX_FAILED_LOGIN_ATTEMPTS)
    if attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
        locked_user.locked_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
    db.commit()
    if locked_user.locked_until:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many password attempts. Try again later.",
            headers={"Retry-After": str(LOGIN_LOCK_MINUTES * 60)},
        )
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect.")


def _session_token(authorization: str | None, session_cookie: str | None = None) -> str:
    if isinstance(session_cookie, str) and session_cookie:
        return session_cookie
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization token.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization token.")
    return token


def _bearer_token(authorization: str | None) -> str:
    return _session_token(authorization)


def get_current_user(
    authorization: str | None = Header(default=None),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> UserAccount:
    token_hash = _hash_token(_session_token(authorization, session_cookie))
    user = db.scalar(
        select(UserAccount).where(UserAccount.session_token_hash == token_hash, UserAccount.is_active == True)
    )
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
    created_at = _as_aware_utc(user.session_created_at)
    if not created_at or datetime.now(timezone.utc) - created_at > timedelta(hours=SESSION_TTL_HOURS):
        _clear_session(user)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
    if user.account_level != "platform_admin":
        tenant_id = tenant_id_for_user(user)
        tenant = db.get(SaasTenant, tenant_id)
        if not tenant or tenant.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Company tenant is not active.")
    return user


def require_platform_admin(user: UserAccount = Depends(get_current_user)) -> UserAccount:
    if user.account_level != "platform_admin" or not has_permission(user, "manage_platform"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform administrator access is required.")
    return user


def require_company_manager(user: UserAccount = Depends(get_current_user)) -> UserAccount:
    if user.account_level != "company_manager" or not has_permission(user, "manage_company"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Company manager access is required.")
    tenant_id_for_user(user)
    return user


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: AuthRegisterPayload, response: Response = None, db: Session = Depends(get_db)) -> AuthResponse:
    if os.getenv("ALLOW_PUBLIC_REGISTRATION", "false").strip().lower() not in {"1", "true", "yes"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Public registration is disabled. Contact a platform administrator.")
    email = _validate_email(payload.email)
    display_name = _clean_text(payload.displayName) or email.split("@", 1)[0]
    password = _validate_password(payload.password)
    phone = _validate_phone(payload.phone)

    tenant_name = display_name
    if db.scalar(select(SaasTenant.id).where(func.lower(SaasTenant.company_name) == tenant_name.lower())):
        tenant_name = f"{display_name} {secrets.token_hex(3)}"
    tenant = SaasTenant(company_name=tenant_name, contact_email=email, status="active", user_count=1)
    db.add(tenant)
    db.flush()
    user = UserAccount(
        email=email,
        display_name=display_name,
        password_hash=_hash_password(password),
        phone=phone,
        tenant_id=tenant.id,
        account_level="company_manager",
        tenant_name=tenant.company_name,
        role="company_manager",
        permissions_json=json.dumps(MANAGER_DEFAULT_PERMISSIONS, separators=(",", ":")),
    )
    token = _issue_session(user)
    _set_session_cookie(response, token)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered.") from exc
    db.refresh(user)
    return _auth_payload(user, db)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: AuthLoginPayload,
    response: Response = None,
    db: Session = Depends(get_db),
    request: Request = None,
) -> AuthResponse:
    email = _validate_email(payload.email)
    _enforce_login_rate_limit(request)
    if not payload.password or len(payload.password) > 128:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    user = db.scalar(select(UserAccount).where(UserAccount.email == email).with_for_update())
    now = datetime.now(timezone.utc)
    locked_until = _as_aware_utc(user.locked_until) if user else None
    if user and locked_until and locked_until > now:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many login attempts. Try again later.",
            headers={"Retry-After": str(max(1, int((locked_until - now).total_seconds())))},
        )
    if user and locked_until:
        user.locked_until = None
        user.failed_login_attempts = 0

    if not user or not user.is_active:
        _verify_password(payload.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    if not _verify_password(payload.password, user.password_hash):
        user.failed_login_attempts = int(user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
            user.failed_login_attempts = MAX_FAILED_LOGIN_ATTEMPTS
            db.commit()
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many login attempts. Try again later.",
                headers={"Retry-After": str(LOGIN_LOCK_MINUTES * 60)},
            )
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    token = _issue_session(user)
    _set_session_cookie(response, token)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    db.refresh(user)
    return _auth_payload(user, db)


@router.get("/me", response_model=AuthUserResponse)
def me(user: UserAccount = Depends(get_current_user), db: Session = Depends(get_db)) -> AuthUserResponse:
    return _user_response(user, db)


@router.post("/change-password")
def change_password(
    payload: AuthChangePasswordPayload,
    response: Response = None,
    user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if not _verify_password(payload.currentPassword, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect.")
    new_password = _validate_password(payload.newPassword)
    if _verify_password(new_password, user.password_hash):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "New password must be different from the current password.")
    user.password_hash = _hash_password(new_password)
    next_token = _issue_session(user)
    _set_session_cookie(response, next_token)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.updated_at = datetime.now(timezone.utc)
    record_audit(
        db,
        action="user.password.changed",
        entity_type="UserAccount",
        entity_id=user.id,
        actor_user_id=actor_id(user),
        summary=f"Password changed for {user.email}",
        details={"email": user.email, "accountLevel": user.account_level},
    )
    db.commit()
    return {"ok": True}


@router.get("/company-profile", response_model=CompanyProfileResponse | None)
def get_company_profile(
    user: UserAccount = Depends(get_current_user), db: Session = Depends(get_db)
) -> CompanyProfileResponse | None:
    profile = db.scalar(select(CompanyProfile).where(CompanyProfile.owner_user_id == user.id))
    return _profile_response(profile) if profile else None


@router.put("/company-profile", response_model=CompanyProfileResponse)
def upsert_company_profile(
    payload: CompanyProfilePayload,
    user: UserAccount = Depends(require_permission("manage_company")),
    db: Session = Depends(get_db),
) -> CompanyProfileResponse:
    company_name = _clean_text(payload.companyName)
    street = _clean_text(payload.street)
    city = _clean_text(payload.city)
    phone = _clean_text(payload.phone)
    email = _clean_text(payload.email)
    if not company_name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Company name is required.")
    if not street or not city or not phone or not email:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Company name, street, city, phone, and email are required.",
        )

    profile = db.scalar(select(CompanyProfile).where(CompanyProfile.owner_user_id == user.id))
    if not profile:
        profile = CompanyProfile(owner_user_id=user.id, company_name=company_name)
        db.add(profile)

    profile.company_name = company_name
    profile.legal_name = _clean_text(payload.legalName)
    profile.street = street
    profile.zip_code = _clean_text(payload.zipCode)
    profile.city = city
    profile.country = _clean_text(payload.country) or "DE"
    profile.vat_id = _clean_text(payload.vatId)
    for field, attribute in (("taxNumber", "tax_number"), ("bankName", "bank_name"), ("iban", "iban"), ("bic", "bic")):
        if field in payload.model_fields_set:
            setattr(profile, attribute, _clean_text(getattr(payload, field)))
    profile.phone = phone
    profile.email = email
    profile.website = _clean_text(payload.website)
    profile.notes = _clean_text(payload.notes)
    db.commit()
    db.refresh(profile)
    return _profile_response(profile)


@router.get("/account-control", response_model=AccountControlResponse)
def get_account_control(
    user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountControlResponse:
    profile = db.scalar(select(CompanyProfile).where(CompanyProfile.owner_user_id == user.id))
    can_manage_users = has_permission(user, "manage_users") and user.account_level == "company_manager"
    tenant, user_used = _tenant_user_usage(db, user.tenant_id)
    company_users: list[UserAccount] = []
    if can_manage_users and user.tenant_id:
        company_users = db.scalars(
            select(UserAccount)
            .where(
                UserAccount.tenant_id == user.tenant_id,
                UserAccount.account_level.in_(["company_user", "company_viewer"]),
            )
            .order_by(UserAccount.created_at.asc(), UserAccount.email.asc())
        ).all()

    return AccountControlResponse(
        currentUser=_account_control_user_response(user),
        companyProfile=_profile_response(profile) if profile else None,
        companyUsers=[_account_control_user_response(item) for item in company_users],
        canManageUsers=can_manage_users,
        userLimit=tenant.user_count if tenant else None,
        userUsed=user_used,
    )


@router.post("/account-control/users", response_model=AccountControlUserResponse, status_code=status.HTTP_201_CREATED)
def create_company_user(
    payload: ManagerCreateUserPayload,
    manager: UserAccount = Depends(require_permission("manage_users")),
    db: Session = Depends(get_db),
) -> AccountControlUserResponse:
    if manager.account_level != "company_manager" or not manager.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only company managers can create company users.")

    email = _validate_email(payload.email)
    display_name = _validate_display_name(payload.displayName)
    password = _validate_password(payload.password)
    phone = _validate_phone(payload.phone)
    tenant, user_used = _tenant_user_usage(db, manager.tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_409_CONFLICT, "Company tenant is not configured.")
    if user_used >= tenant.user_count:
        raise HTTPException(status.HTTP_409_CONFLICT, "Company user limit reached. Ask OMRAN to increase the user allowance.")
    existing = db.scalar(select(UserAccount).where(UserAccount.email == email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered.")

    account_level = payload.accountLevel
    permissions = USER_DEFAULT_PERMISSIONS if account_level == "company_user" else VIEWER_DEFAULT_PERMISSIONS
    role = "project_user" if account_level == "company_user" else "viewer"
    user = UserAccount(
        email=email,
        display_name=display_name,
        password_hash=_hash_password(password),
        phone=phone,
        tenant_id=manager.tenant_id,
        account_level=account_level,
        tenant_name=tenant.company_name,
        role=role,
        permissions_json=json.dumps(permissions, separators=(",", ":")),
        is_active=True,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        action="user.created",
        entity_type="UserAccount",
        entity_id=user.id,
        actor_user_id=actor_id(manager),
        summary=f"Company user created: {user.display_name or user.email}",
        details={"accountLevel": account_level, "tenantId": manager.tenant_id, "displayName": display_name},
    )
    db.commit()
    db.refresh(user)
    return _account_control_user_response(user)


@router.patch("/account-control/users/{user_id}/ai-permissions", response_model=AccountControlUserResponse)
def update_company_user_ai_permissions(
    user_id: str,
    payload: AccountControlPermissionsPayload,
    manager: UserAccount = Depends(require_permission("manage_users")),
    db: Session = Depends(get_db),
) -> AccountControlUserResponse:
    if manager.account_level != "company_manager" or not manager.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only company managers can update user AI permissions.")

    target = db.get(UserAccount, user_id)
    if not target or target.tenant_id != manager.tenant_id or target.account_level != "company_user":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    requested_ai_permissions = {str(item) for item in payload.permissions if str(item) in AI_PERMISSION_KEYS}
    current_permissions = set(permissions_for_user(target))
    next_permissions = sorted((current_permissions - AI_PERMISSION_KEYS) | requested_ai_permissions)
    target.permissions_json = json.dumps(next_permissions, separators=(",", ":"))
    target.updated_at = datetime.now(timezone.utc)
    record_audit(
        db,
        action="user.ai_permissions.updated",
        entity_type="UserAccount",
        entity_id=target.id,
        actor_user_id=actor_id(manager),
        summary=f"AI permissions updated for {target.email}",
        details={"permissions": sorted(requested_ai_permissions), "email": target.email},
    )
    db.commit()
    db.refresh(target)
    return _account_control_user_response(target)


@router.post("/account-control/users/{user_id}/reset-login-attempts", response_model=AccountControlUserResponse)
def reset_company_user_login_attempts(
    user_id: str,
    manager: UserAccount = Depends(require_permission("manage_users")),
    db: Session = Depends(get_db),
) -> AccountControlUserResponse:
    if manager.account_level != "company_manager" or not manager.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only company managers can reset user login attempts.")

    target = db.get(UserAccount, user_id)
    if not target or target.tenant_id != manager.tenant_id or target.account_level not in {"company_user", "company_viewer"}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    target.failed_login_attempts = 0
    target.locked_until = None
    target.updated_at = datetime.now(timezone.utc)
    record_audit(
        db,
        action="user.login_attempts.reset",
        entity_type="UserAccount",
        entity_id=target.id,
        actor_user_id=actor_id(manager),
        summary=f"Login attempts reset for user: {target.display_name or target.email}",
        details={"tenantId": manager.tenant_id, "targetEmail": target.email},
    )
    db.commit()
    db.refresh(target)
    return _account_control_user_response(target)


@router.post("/logout")
def logout(
    response: Response,
    authorization: str | None = Header(default=None),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    token_hash = _hash_token(_session_token(authorization, session_cookie))
    user = db.scalar(select(UserAccount).where(UserAccount.session_token_hash == token_hash))
    if user:
        _clear_session(user)
        db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}
