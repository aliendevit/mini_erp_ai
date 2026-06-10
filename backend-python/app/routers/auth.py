from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import UserAccount
from ..schemas import AuthLoginPayload, AuthRegisterPayload, AuthResponse, AuthUserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+?[0-9]{8,15}$")
PASSWORD_RE = re.compile(r"^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]).{8,}$")
HASH_ITERATIONS = 210_000


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


def _auth_payload(user: UserAccount, token: str) -> AuthResponse:
    return AuthResponse(
        token=token,
        user=AuthUserResponse(
            id=user.id,
            email=user.email,
            phone=user.phone,
            createdAt=user.created_at,
            lastLoginAt=user.last_login_at,
        ),
    )


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


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: AuthRegisterPayload, db: Session = Depends(get_db)) -> AuthResponse:
    email = _validate_email(payload.email)
    password = _validate_password(payload.password)
    phone = _validate_phone(payload.phone)

    user = UserAccount(email=email, password_hash=_hash_password(password), phone=phone)
    token = _issue_session(user)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered.") from exc
    db.refresh(user)
    return _auth_payload(user, token)


@router.post("/login", response_model=AuthResponse)
def login(payload: AuthLoginPayload, db: Session = Depends(get_db)) -> AuthResponse:
    email = _validate_email(payload.email)
    user = db.scalar(select(UserAccount).where(UserAccount.email == email))
    if not user or not user.is_active or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    token = _issue_session(user)
    db.commit()
    db.refresh(user)
    return _auth_payload(user, token)


@router.get("/me", response_model=AuthUserResponse)
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> AuthUserResponse:
    token_hash = _hash_token(_bearer_token(authorization))
    user = db.scalar(select(UserAccount).where(UserAccount.session_token_hash == token_hash, UserAccount.is_active == True))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        phone=user.phone,
        createdAt=user.created_at,
        lastLoginAt=user.last_login_at,
    )


@router.post("/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict[str, bool]:
    token_hash = _hash_token(_bearer_token(authorization))
    user = db.scalar(select(UserAccount).where(UserAccount.session_token_hash == token_hash))
    if user:
        user.session_token_hash = None
        user.session_created_at = None
        db.commit()
    return {"ok": True}
