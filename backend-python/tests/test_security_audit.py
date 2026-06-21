from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import Base
from app.models import AuditLog, Customer, UserAccount
from app.routers import ai, core, invoices, rag, system
from app.routers.auth import get_current_user
from app.routers.core import create_order
from app.schemas import OrderPayload
from postgres_test_utils import create_session


class SecurityAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine, TestingSession, self.db = create_session()
        self.TestingSession = TestingSession

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_business_routers_require_current_user(self) -> None:
        for router in (core.router, invoices.router, ai.router, rag.router):
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


if __name__ == "__main__":
    unittest.main()
