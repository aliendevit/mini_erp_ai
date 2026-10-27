"""Establish the managed schema and tenant-owned payments."""

from alembic import op
import sqlalchemy as sa

from app.database import Base
from app import models  # noqa: F401

revision = "20260711_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    inspector = sa.inspect(bind)
    if "PaymentRecord" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("PaymentRecord")}
    if "tenantId" not in columns:
        op.add_column("PaymentRecord", sa.Column("tenantId", sa.String(length=36), nullable=True))
        op.create_index("PaymentRecord_tenantId_idx", "PaymentRecord", ["tenantId"])
    op.execute(
        '''
        UPDATE "PaymentRecord"
        SET "tenantId" = COALESCE(
            (SELECT "tenantId" FROM "Invoice" WHERE "Invoice".id = "PaymentRecord"."invoiceId"),
            (SELECT "tenantId" FROM "Order" WHERE "Order".id = "PaymentRecord"."orderId"),
            (SELECT "tenantId" FROM "Proposal" WHERE "Proposal".id = "PaymentRecord"."proposalId"),
            (SELECT "tenantId" FROM "Customer" WHERE "Customer".id = "PaymentRecord"."customerId")
        )
        WHERE "tenantId" IS NULL
        '''
    )
    workshop_columns = {column["name"] for column in inspector.get_columns("Workshop")}
    if "tenantId" not in workshop_columns:
        op.add_column("Workshop", sa.Column("tenantId", sa.String(length=36), nullable=True))
        op.create_index("Workshop_tenantId_idx", "Workshop", ["tenantId"])
    op.execute(
        '''
        UPDATE "Workshop"
        SET "tenantId" = (
            SELECT orders."tenantId"
            FROM "WorkshopSiteAssignment" assignments
            JOIN "Order" orders ON orders.id = assignments."orderId"
            WHERE assignments."workshopId" = "Workshop".id
            LIMIT 1
        )
        WHERE "tenantId" IS NULL
        '''
    )


def downgrade() -> None:
    # Baseline migrations are intentionally irreversible in production.
    pass
