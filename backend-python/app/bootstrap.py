"""Provision the first platform administrator from an operator's terminal."""
from __future__ import annotations

import argparse
from getpass import getpass
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import SessionLocal, init_db
from .models import UserAccount
from .routers.auth import PLATFORM_DEFAULT_PERMISSIONS, _hash_password, _validate_email, _validate_password


def create_first_admin(db: Session, email: str, password: str, display_name: str | None = None) -> UserAccount:
    email = _validate_email(email)
    _validate_password(password)
    if db.scalar(select(UserAccount.id).where(UserAccount.account_level == "platform_admin").limit(1)):
        raise ValueError("A platform administrator already exists; use the existing administrator account.")
    if db.scalar(select(UserAccount.id).where(UserAccount.email == email)):
        raise ValueError("That email is already registered; choose an unused administrator email.")
    user = UserAccount(
        email=email,
        display_name=(display_name or email.split("@", 1)[0]).strip(),
        password_hash=_hash_password(password),
        account_level="platform_admin",
        role="platform_admin",
        permissions_json=json.dumps(PLATFORM_DEFAULT_PERMISSIONS),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first platform administrator. Password is prompted, never stored in command history.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name")
    args = parser.parse_args()
    password = getpass("Administrator password: ")
    if password != getpass("Confirm password: "):
        parser.error("Passwords do not match.")
    init_db()
    from fastapi import HTTPException
    with SessionLocal() as db:
        try:
            user = create_first_admin(db, args.email, password, args.display_name)
        except (ValueError, HTTPException) as exc:
            db.rollback()
            parser.error(str(getattr(exc, "detail", exc)))
    print(f"Administrator created: {user.email}. Sign in, then create your company in the platform dashboard.")


if __name__ == "__main__":
    main()
