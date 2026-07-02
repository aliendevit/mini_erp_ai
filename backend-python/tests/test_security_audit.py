from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import AuditLog, Customer, SaasTenant, UserAccount
from app.routers import ai, core, invoices, system
from app.routers.auth import _hash_password, get_current_user, login, reset_company_user_login_attempts
from app.routers.core import create_order
from app.routers.platform import reset_company_manager_password
from app.schemas import AuthLoginPayload, OrderPayload


class SecurityAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        TestingSession = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=self.engine)
        self.TestingSession = TestingSession
        self.db: Session = TestingSession()

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_business_routers_require_current_user(self) -> None:
        for router in (core.router, invoices.router, ai.router):
            dependencies = [item.dependency for item in router.dependencies]
            self.assertIn(get_current_user, dependencies)

    def test_order_create_writes_audit_log(self) -> None:
        customer = Customer(company_name="Audit Customer", country="DE")
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)

        result = create_order(
            OrderPayload(customerId=customer.id, title="Audit Order", status="open"),
            db=self.db,
            current_user=type("User", (), {"id": "user-1"})(),
        )

        audit = self.db.scalar(select(AuditLog).where(AuditLog.action == "order.created"))

        self.assertIsNotNone(audit)
        assert audit is not None
        self.assertEqual(audit.entity_type, "Order")
        self.assertEqual(audit.entity_id, result["id"])
        self.assertEqual(audit.actor_user_id, "user-1")

    def test_audit_log_endpoint_returns_actor_email_and_stats(self) -> None:
        user = UserAccount(id="user-1", email="admin@example.com", password_hash="hash", is_active=True)
        audit = AuditLog(
            action="invoice.deleted",
            entity_type="Invoice",
            entity_id="invoice-1",
            actor_user_id="user-1",
            summary="Invoice deleted",
            details_json='{"invoiceNumber":"INV-1"}',
        )
        self.db.add_all([user, audit])
        self.db.commit()

        original_session_local = system.SessionLocal
        system.SessionLocal = self.TestingSession
        try:
            result = system.list_audit_logs(
                page=1,
                pageSize=10,
                action="all",
                entityType="all",
                q=None,
                _=user,
            )
        finally:
            system.SessionLocal = original_session_local

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["stats"]["invoiceChanges"], 1)
        self.assertEqual(result["items"][0]["actorEmail"], "admin@example.com")
        self.assertEqual(result["items"][0]["details"]["invoiceNumber"], "INV-1")

    def test_failed_login_attempts_lock_account_until_reset(self) -> None:
        user = UserAccount(
            id="login-user",
            email="login@example.com",
            password_hash=_hash_password("CorrectPass1!"),
            account_level="company_user",
            role="project_user",
            tenant_id="tenant-1",
            is_active=True,
        )
        manager = UserAccount(
            id="manager-1",
            email="manager@example.com",
            password_hash=_hash_password("ManagerPass1!"),
            account_level="company_manager",
            role="company_manager",
            tenant_id="tenant-1",
            is_active=True,
        )
        self.db.add_all([user, manager])
        self.db.commit()

        for _ in range(4):
            with self.assertRaises(HTTPException) as ctx:
                login(AuthLoginPayload(email=user.email, password="wrong"), db=self.db)
            self.assertEqual(ctx.exception.status_code, 401)

        self.db.refresh(user)
        self.assertEqual(user.failed_login_attempts, 4)
        self.assertIsNone(user.locked_until)

        with self.assertRaises(HTTPException) as ctx:
            login(AuthLoginPayload(email=user.email, password="wrong"), db=self.db)
        self.assertEqual(ctx.exception.status_code, 429)

        self.db.refresh(user)
        self.assertEqual(user.failed_login_attempts, 5)
        self.assertIsNotNone(user.locked_until)

        with self.assertRaises(HTTPException) as ctx:
            login(AuthLoginPayload(email=user.email, password="CorrectPass1!"), db=self.db)
        self.assertEqual(ctx.exception.status_code, 429)

        user.locked_until = datetime.now(timezone.utc) - timedelta(days=1)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            login(AuthLoginPayload(email=user.email, password="CorrectPass1!"), db=self.db)
        self.assertEqual(ctx.exception.status_code, 429)

        reset_result = reset_company_user_login_attempts(user.id, manager=manager, db=self.db)
        self.assertEqual(reset_result.failedLoginAttempts, 0)
        self.assertEqual(reset_result.remainingLoginAttempts, 5)
        self.assertIsNone(reset_result.lockedUntil)

        login_result = login(AuthLoginPayload(email=user.email, password="CorrectPass1!"), db=self.db)
        self.assertEqual(login_result.user.email, user.email)

    def test_platform_manager_password_reset_clears_login_lock(self) -> None:
        tenant = SaasTenant(id="tenant-reset", company_name="Reset Tenant", user_count=2)
        manager = UserAccount(
            id="manager-reset",
            email="manager-reset@example.com",
            password_hash=_hash_password("OldPass1!"),
            account_level="company_manager",
            role="company_manager",
            tenant_id=tenant.id,
            failed_login_attempts=5,
            locked_until=datetime.now(timezone.utc) + timedelta(minutes=10),
            is_active=True,
        )
        platform_admin = UserAccount(
            id="platform-admin",
            email="platform@example.com",
            password_hash=_hash_password("AdminPass1!"),
            account_level="platform_admin",
            role="platform_admin",
            is_active=True,
        )
        self.db.add_all([tenant, manager, platform_admin])
        self.db.commit()

        reset_result = reset_company_manager_password(tenant.id, payload=None, db=self.db, current_user=platform_admin)

        self.db.refresh(manager)
        self.assertEqual(reset_result.managerEmail, manager.email)
        self.assertEqual(manager.failed_login_attempts, 0)
        self.assertIsNone(manager.locked_until)
        login_result = login(AuthLoginPayload(email=manager.email, password=reset_result.managerPassword), db=self.db)
        self.assertEqual(login_result.user.email, manager.email)


if __name__ == "__main__":
    unittest.main()
