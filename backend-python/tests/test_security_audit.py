from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import AuditLog, Customer
from app.routers import ai, core, invoices
from app.routers.auth import get_current_user
from app.routers.core import create_order
from app.schemas import OrderPayload


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


if __name__ == "__main__":
    unittest.main()
