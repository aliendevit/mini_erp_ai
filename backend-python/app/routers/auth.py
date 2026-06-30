from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
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
PASSWORD_RE = re.compile(r"^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]).{8,}$")
HASH_ITERATIONS = 210_000
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
    "restore_backups",
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
    if not EMAIL_RE.match(normalized):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid email address.")
    return normalized


def _validate_password(password: str) -> str:
    if not PASSWORD_RE.match(password or ""):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Password must be at least 8 characters and include a number and special character.",
        )
    return password


def _validate_phone(phone: str | None) -> str | None:
    if phone is None or phone.strip() == "":
        return None
    normalized = phone.strip()
    if not PHONE_RE.match(normalized):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Phone must contain only numbers and optional +.")
    return normalized


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


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def permissions_for_user(user: UserAccount) -> list[str]:
    try:
        explicit = [str(item) for item in json.loads(getattr(user, "permissions_json", None) or "[]") if str(item).strip()]
    except Exception:
        explicit = []
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
    if not user or getattr(user, "account_level", None) == "platform_admin":
        return None
    return getattr(user, "tenant_id", None)


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


def _auth_payload(user: UserAccount, token: str, db: Session) -> AuthResponse:
    return AuthResponse(
        token=token,
        user=_user_response(user, db),
    )


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
    return AccountControlUserResponse(
        id=user.id,
        email=user.email,
        phone=user.phone,
        accountLevel=user.account_level,
        role=user.role,
        tenantName=user.tenant_name,
        permissions=permissions_for_user(user),
        aiFeatures=_ai_feature_response(user),
        isActive=user.is_active,
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


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization token.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization token.")
    return token


def get_current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> UserAccount:
    token_hash = _hash_token(_bearer_token(authorization))
    user = db.scalar(
        select(UserAccount).where(UserAccount.session_token_hash == token_hash, UserAccount.is_active == True)
    )
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
    return user


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: AuthRegisterPayload, db: Session = Depends(get_db)) -> AuthResponse:
    email = _validate_email(payload.email)
    password = _validate_password(payload.password)
    phone = _validate_phone(payload.phone)

    user = UserAccount(
        email=email,
        password_hash=_hash_password(password),
        phone=phone,
        account_level="company_manager",
        tenant_name=None,
        role="company_manager",
        permissions_json=json.dumps(MANAGER_DEFAULT_PERMISSIONS, separators=(",", ":")),
    )
    token = _issue_session(user)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered.") from exc
    db.refresh(user)
    return _auth_payload(user, token, db)


@router.post("/login", response_model=AuthResponse)
def login(payload: AuthLoginPayload, db: Session = Depends(get_db)) -> AuthResponse:
    email = _validate_email(payload.email)
    user = db.scalar(select(UserAccount).where(UserAccount.email == email))
    if not user or not user.is_active or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    token = _issue_session(user)
    db.commit()
    db.refresh(user)
    return _auth_payload(user, token, db)


@router.get("/me", response_model=AuthUserResponse)
def me(user: UserAccount = Depends(get_current_user), db: Session = Depends(get_db)) -> AuthUserResponse:
    return _user_response(user, db)


@router.post("/change-password")
def change_password(
    payload: AuthChangePasswordPayload,
    user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if not _verify_password(payload.currentPassword, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect.")
    new_password = _validate_password(payload.newPassword)
    user.password_hash = _hash_password(new_password)
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
    user: UserAccount = Depends(get_current_user),
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
        summary=f"Company user created: {user.email}",
        details={"accountLevel": account_level, "tenantId": manager.tenant_id},
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


@router.post("/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict[str, bool]:
    token_hash = _hash_token(_bearer_token(authorization))
    user = db.scalar(select(UserAccount).where(UserAccount.session_token_hash == token_hash))
    if user:
        user.session_token_hash = None
        user.session_created_at = None
        db.commit()
    return {"ok": True}
