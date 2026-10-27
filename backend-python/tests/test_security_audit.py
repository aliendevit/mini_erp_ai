from __future__ import annotations

import sys
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import AuditLog, Customer, Invoice, Order, PaymentRecord, SaasTenant, TenantInvoiceSequence, UserAccount, Workshop
from app.routers import ai, core, invoices, platform, system
from app.routers.auth import _hash_password, _issue_session, get_current_user, login, register, require_platform_admin, reset_company_user_login_attempts, verify_current_password_with_lockout
from app.routers.core import create_order, create_payment, list_payments
from app.routers.platform import reset_company_manager_password
from app.schemas import AuthLoginPayload, AuthRegisterPayload, InvoiceSequenceUpdatePayload, OrderPayload, PaymentRecordPayload
from app.services.invoice_documents import _safe_text
from app.utils import get_invoice_sequence_state


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

    def test_platform_router_requires_platform_administrator(self) -> None:
        dependencies = [item.dependency for item in platform.router.dependencies]
        self.assertIn(require_platform_admin, dependencies)

    def test_progress_photo_validation_uses_file_signature(self) -> None:
        upload = SimpleNamespace(filename="photo.png", content_type="image/png")
        self.assertEqual(core._progress_photo_type_and_suffix(upload, b"\x89PNG\r\n\x1a\ncontent"), ("image/png", ".png"))

        with self.assertRaises(HTTPException):
            core._progress_photo_type_and_suffix(upload, b"MZ executable content")

        with self.assertRaises(HTTPException):
            core._progress_photo_type_and_suffix(upload, b"\xff\xd8\xffjpeg content")

    def test_order_create_writes_audit_log(self) -> None:
        tenant = SaasTenant(id="tenant-audit", company_name="Audit Tenant")
        customer = Customer(company_name="Audit Customer", country="DE", tenant_id=tenant.id)
        user = UserAccount(id="user-1", email="audit@example.com", password_hash="hash", tenant_id=tenant.id, account_level="company_manager")
        self.db.add_all([tenant, customer, user])
        self.db.commit()
        self.db.refresh(customer)

        result = create_order(
            OrderPayload(customerId=customer.id, title="Audit Order", status="open"),
            db=self.db,
            current_user=user,
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

    def test_failed_login_attempts_use_temporary_lock(self) -> None:
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
        login_result = login(AuthLoginPayload(email=user.email, password="CorrectPass1!"), db=self.db)
        self.assertEqual(login_result.user.email, user.email)

        reset_result = reset_company_user_login_attempts(user.id, manager=manager, db=self.db)
        self.assertEqual(reset_result.failedLoginAttempts, 0)
        self.assertEqual(reset_result.remainingLoginAttempts, 5)
        self.assertIsNone(reset_result.lockedUntil)

        login_result = login(AuthLoginPayload(email=user.email, password="CorrectPass1!"), db=self.db)
        self.assertEqual(login_result.user.email, user.email)

    def test_public_registration_is_disabled_by_default(self) -> None:
        with patch.dict("os.environ", {"ALLOW_PUBLIC_REGISTRATION": "false"}):
            with self.assertRaises(HTTPException) as caught:
                register(AuthRegisterPayload(email="new@example.com", password="SecurePass1!"), db=self.db)
        self.assertEqual(caught.exception.status_code, 403)

    def test_expired_session_is_revoked(self) -> None:
        tenant = SaasTenant(id="tenant-session", company_name="Session Tenant", status="active")
        user = UserAccount(
            email="session@example.com",
            password_hash=_hash_password("SecurePass1!"),
            tenant_id=tenant.id,
            account_level="company_user",
            role="project_user",
            is_active=True,
        )
        token = _issue_session(user)
        user.session_created_at = datetime.now(timezone.utc) - timedelta(hours=9)
        self.db.add_all([tenant, user])
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            get_current_user(authorization=f"Bearer {token}", session_cookie=None, db=self.db)
        self.assertEqual(caught.exception.status_code, 401)
        self.db.refresh(user)
        self.assertIsNone(user.session_token_hash)

    def test_payments_are_isolated_by_tenant(self) -> None:
        tenant_a = SaasTenant(id="tenant-a", company_name="Tenant A")
        tenant_b = SaasTenant(id="tenant-b", company_name="Tenant B")
        user_a = UserAccount(email="a@example.com", password_hash="hash", tenant_id=tenant_a.id, account_level="company_manager")
        user_b = UserAccount(email="b@example.com", password_hash="hash", tenant_id=tenant_b.id, account_level="company_manager")
        customer_a = Customer(company_name="A", country="DE", tenant_id=tenant_a.id)
        customer_b = Customer(company_name="B", country="DE", tenant_id=tenant_b.id)
        self.db.add_all([tenant_a, tenant_b, user_a, user_b, customer_a, customer_b])
        self.db.commit()
        created = create_payment(PaymentRecordPayload(customerId=customer_a.id, amount=100), _=user_a, db=self.db, current_user=user_a)
        filters = {"customer_id": None, "order_id": None, "invoice_id": None, "proposal_id": None}
        self.assertEqual(len(list_payments(**filters, _=user_a, db=self.db, current_user=user_a)), 1)
        self.assertEqual(len(list_payments(**filters, _=user_b, db=self.db, current_user=user_b)), 0)
        with self.assertRaises(HTTPException) as caught:
            create_payment(PaymentRecordPayload(customerId=customer_b.id, amount=100), _=user_a, db=self.db, current_user=user_a)
        self.assertEqual(caught.exception.status_code, 404)
        self.assertIsNotNone(self.db.get(PaymentRecord, created["id"]).tenant_id)

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
            session_token_hash="active-session",
            session_created_at=datetime.now(timezone.utc),
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
        self.assertIsNone(manager.session_token_hash)
        self.assertIsNone(manager.session_created_at)
        login_result = login(AuthLoginPayload(email=manager.email, password=reset_result.managerPassword), db=self.db)
        self.assertEqual(login_result.user.email, manager.email)

    def test_step_up_password_uses_durable_lockout(self) -> None:
        user = UserAccount(
            id="step-up-user",
            email="step-up@example.com",
            password_hash=_hash_password("CorrectPass1!"),
            account_level="company_manager",
            role="company_manager",
            tenant_id="tenant-step-up",
            is_active=True,
        )
        tenant = SaasTenant(id="tenant-step-up", company_name="Step-up Tenant")
        self.db.add_all([tenant, user])
        self.db.commit()

        for _ in range(4):
            with self.assertRaises(HTTPException) as caught:
                verify_current_password_with_lockout(self.db, user, "wrong")
            self.assertEqual(caught.exception.status_code, 401)
        with self.assertRaises(HTTPException) as caught:
            verify_current_password_with_lockout(self.db, user, "wrong")
        self.assertEqual(caught.exception.status_code, 429)
        with self.assertRaises(HTTPException) as caught:
            verify_current_password_with_lockout(self.db, user, "CorrectPass1!")
        self.assertEqual(caught.exception.status_code, 429)

    def test_workshop_lookup_and_delete_are_tenant_scoped(self) -> None:
        tenant_a = SaasTenant(id="tenant-workshop-a", company_name="Workshop A")
        tenant_b = SaasTenant(id="tenant-workshop-b", company_name="Workshop B")
        user_a = UserAccount(email="manager-a@example.com", password_hash="hash", tenant_id=tenant_a.id, account_level="company_manager")
        workshop_b = Workshop(id="workshop-b", tenant_id=tenant_b.id, name="Other Company Workshop")
        self.db.add_all([tenant_a, tenant_b, user_a, workshop_b])
        self.db.commit()

        with self.assertRaises(HTTPException) as caught:
            core.get_workshop(workshop_b.id, db=self.db, current_user=user_a)
        self.assertEqual(caught.exception.status_code, 404)
        with self.assertRaises(HTTPException) as caught:
            core.delete_workshop(workshop_b.id, db=self.db, current_user=user_a)
        self.assertEqual(caught.exception.status_code, 404)
        self.assertIsNotNone(self.db.get(Workshop, workshop_b.id))

    def test_invoice_sequence_and_payment_references_are_tenant_scoped(self) -> None:
        tenant_a = SaasTenant(id="tenant-invoice-a", company_name="Invoice A")
        tenant_b = SaasTenant(id="tenant-invoice-b", company_name="Invoice B")
        user_a = UserAccount(email="invoice-a@example.com", password_hash="hash", tenant_id=tenant_a.id, account_level="company_manager")
        customer_a = Customer(id="customer-invoice-a", company_name="Customer A", country="DE", tenant_id=tenant_a.id)
        customer_b = Customer(id="customer-invoice-b", company_name="Customer B", country="DE", tenant_id=tenant_b.id)
        order_b = Order(id="order-invoice-b", tenant_id=tenant_b.id, customer_id=customer_b.id, order_number="B-1", title="Tenant B", status="open", currency="EUR")
        invoice_a = Invoice(id="invoice-a", tenant_id=tenant_a.id, customer_id=customer_a.id, status="draft")
        self.db.add_all([tenant_a, tenant_b, user_a, customer_a, customer_b, order_b, invoice_a])
        self.db.commit()

        core.update_invoice_sequence(
            InvoiceSequenceUpdatePayload(year=2026, nextSeq=25),
            db=self.db,
            current_user=user_a,
        )
        self.assertEqual(get_invoice_sequence_state(self.db, tenant_a.id, 2026)["configuredNextSeq"], 25)
        self.assertIsNone(get_invoice_sequence_state(self.db, tenant_b.id, 2026)["configuredNextSeq"])
        self.assertIsNotNone(self.db.get(TenantInvoiceSequence, {"tenant_id": tenant_a.id, "year": 2026}))

        with self.assertRaises(HTTPException) as caught:
            invoices.create_invoice_payment(
                invoice_a.id,
                PaymentRecordPayload(orderId=order_b.id, amount=100),
                db=self.db,
                current_user=user_a,
            )
        self.assertEqual(caught.exception.status_code, 404)

    def test_pdf_text_is_escaped_before_reportlab_rendering(self) -> None:
        self.assertEqual(_safe_text('<img src="http://127.0.0.1/internal.png"/>'), '&lt;img src=&quot;http://127.0.0.1/internal.png&quot;/&gt;')


if __name__ == "__main__":
    unittest.main()
