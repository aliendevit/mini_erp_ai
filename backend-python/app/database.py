from __future__ import annotations

import hashlib
import json
from collections.abc import Generator
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine, delete, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .settings import get_settings


def _normalize_database_url(url: str) -> str:
    if url.startswith("sqlite:///"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+pg8000://", 1)
    return url

DATABASE_URL = _normalize_database_url(get_settings().database_url)


class Base(DeclarativeBase):
    pass


engine_kwargs = {"future": True}
if DATABASE_URL.startswith("sqlite:///"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _is_postgresql() -> bool:
    return DATABASE_URL.startswith("postgresql")


def _ensure_pgvector_extension() -> None:
    if not _is_postgresql():
        return
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception:
        # RAG still works through JSON embeddings; pgvector is an acceleration path.
        return


def _ensure_rag_pgvector_columns_and_indexes() -> None:
    if not _is_postgresql():
        return
    inspector = inspect(engine)
    if "RagChunk" not in inspector.get_table_names():
        return

    try:
        with engine.begin() as conn:
            conn.execute(text('ALTER TABLE "RagChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(768)'))
            conn.execute(
                text(
                    'CREATE INDEX IF NOT EXISTS "RagChunk_embedding_hnsw_idx" '
                    'ON "RagChunk" USING hnsw ("embedding" vector_cosine_ops)'
                )
            )
    except Exception:
        return


def _ensure_employee_staffing_columns() -> None:
    inspector = inspect(engine)
    if "Employee" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("Employee")}
    statements: list[str] = []

    if "weeklyCapacityHours" not in column_names:
        statements.append('ALTER TABLE "Employee" ADD COLUMN "weeklyCapacityHours" NUMERIC(10, 2)')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_ai_intake_columns() -> None:
    inspector = inspect(engine)
    if "Proposal" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("Proposal")}
    statements: list[str] = []
    column_statements = {
        "memorySummaryJson": 'ALTER TABLE "Proposal" ADD COLUMN "memorySummaryJson" TEXT',
        "paymentDraftsJson": 'ALTER TABLE "Proposal" ADD COLUMN "paymentDraftsJson" TEXT',
        "externalWorkshopsJson": 'ALTER TABLE "Proposal" ADD COLUMN "externalWorkshopsJson" TEXT',
        "staffingPlanJson": 'ALTER TABLE "Proposal" ADD COLUMN "staffingPlanJson" TEXT',
    }
    for column_name, statement in column_statements.items():
        if column_name not in column_names:
            statements.append(statement)

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_workshop_columns() -> None:
    inspector = inspect(engine)
    if "Workshop" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("Workshop")}
    statements: list[str] = []
    if "availabilityStatus" not in column_names:
        statements.append("ALTER TABLE \"Workshop\" ADD COLUMN \"availabilityStatus\" VARCHAR DEFAULT 'available' NOT NULL")
    if "availabilityNote" not in column_names:
        statements.append('ALTER TABLE "Workshop" ADD COLUMN "availabilityNote" TEXT')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_workshop_assignment_columns() -> None:
    inspector = inspect(engine)
    if "WorkshopSiteAssignment" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("WorkshopSiteAssignment")}
    statements: list[str] = []
    if "startDate" not in column_names:
        statements.append('ALTER TABLE "WorkshopSiteAssignment" ADD COLUMN "startDate" TIMESTAMP')
    if "endDate" not in column_names:
        statements.append('ALTER TABLE "WorkshopSiteAssignment" ADD COLUMN "endDate" TIMESTAMP')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_project_task_columns() -> None:
    inspector = inspect(engine)
    if "ProjectTask" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("ProjectTask")}
    statements: list[str] = []
    if "weightPercent" not in column_names:
        statements.append('ALTER TABLE "ProjectTask" ADD COLUMN "weightPercent" NUMERIC(6, 2)')
    if "progressPercent" not in column_names:
        statements.append('ALTER TABLE "ProjectTask" ADD COLUMN "progressPercent" INTEGER')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_invoice_columns() -> None:
    inspector = inspect(engine)
    if "Invoice" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("Invoice")}
    statements: list[str] = []
    if "dueDate" not in column_names:
        statements.append('ALTER TABLE "Invoice" ADD COLUMN "dueDate" TIMESTAMP')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_user_access_columns() -> None:
    inspector = inspect(engine)
    if "UserAccount" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("UserAccount")}
    statements: list[str] = []
    if "accountLevel" not in column_names:
        statements.append("ALTER TABLE \"UserAccount\" ADD COLUMN \"accountLevel\" VARCHAR DEFAULT 'company_manager' NOT NULL")
    if "tenantName" not in column_names:
        statements.append('ALTER TABLE "UserAccount" ADD COLUMN "tenantName" VARCHAR')
    if "tenantId" not in column_names:
        statements.append('ALTER TABLE "UserAccount" ADD COLUMN "tenantId" VARCHAR')
    if "role" not in column_names:
        statements.append("ALTER TABLE \"UserAccount\" ADD COLUMN role VARCHAR DEFAULT 'company_manager' NOT NULL")
    if "permissionsJson" not in column_names:
        statements.append('ALTER TABLE "UserAccount" ADD COLUMN "permissionsJson" TEXT')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _demo_password_hash(password: str, salt: str) -> str:
    iterations = 210_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${digest.hex()}"


def _seed_saas_demo_accounts() -> None:
    from .models import SaasTenant, UserAccount

    demo_accounts = [
        {
            "email": "platform@omran.local",
            "password": "OmranAdmin1!",
            "salt": "omran-platform-demo",
            "phone": "+491000000001",
            "account_level": "platform_admin",
            "tenant_name": "OMRAN Platform",
            "role": "platform_admin",
            "permissions": [
                "manage_platform",
                "manage_tenants",
                "manage_subscriptions",
                "manage_saas_invoices",
                "view_platform_audit",
            ],
        },
        {
            "email": "manager@demo.omran.local",
            "password": "CompanyManager1!",
            "salt": "omran-manager-demo",
            "phone": "+491000000002",
            "account_level": "company_manager",
            "tenant_name": "OMRAN Demo Company",
            "role": "company_manager",
            "permissions": [
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
            ],
        },
        {
            "email": "user@demo.omran.local",
            "password": "CompanyUser1!",
            "salt": "omran-user-demo",
            "phone": "+491000000003",
            "account_level": "company_user",
            "tenant_name": "OMRAN Demo Company",
            "role": "project_user",
            "permissions": [
                "use_ai_intake",
                "use_rag",
                "view_projects",
                "update_tracking",
                "upload_photos",
            ],
        },
        {
            "email": "viewer@demo.omran.local",
            "password": "CompanyViewer1!",
            "salt": "omran-viewer-demo",
            "phone": "+491000000004",
            "account_level": "company_viewer",
            "tenant_name": "OMRAN Demo Company",
            "role": "viewer",
            "permissions": [
                "view_projects",
            ],
        },
    ]

    db = SessionLocal()
    try:
        for account in demo_accounts:
            user = db.scalar(select(UserAccount).where(UserAccount.email == account["email"]))
            if not user:
                user = UserAccount(
                    email=account["email"],
                    password_hash=_demo_password_hash(account["password"], account["salt"]),
                    phone=account["phone"],
                )
                db.add(user)
            user.account_level = account["account_level"]
            user.tenant_name = account["tenant_name"]
            if account["account_level"] != "platform_admin":
                tenant = db.scalar(select(SaasTenant).where(SaasTenant.company_name == account["tenant_name"]))
                user.tenant_id = tenant.id if tenant else None
            else:
                user.tenant_id = None
            user.role = account["role"]
            user.permissions_json = json.dumps(account["permissions"], separators=(",", ":"))
            user.is_active = True
        db.commit()
    finally:
        db.close()


def _ensure_business_tenant_columns() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    target_tables = ["Customer", "Order", "Invoice", "Proposal", "RagSource", "Employee"]
    statements: list[str] = []
    for table_name in target_tables:
        if table_name not in table_names:
            continue
        column_names = {column["name"] for column in inspector.get_columns(table_name)}
        if "tenantId" not in column_names:
            statements.append(f'ALTER TABLE "{table_name}" ADD COLUMN "tenantId" VARCHAR')

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _ensure_audit_tenant_column() -> None:
    inspector = inspect(engine)
    if "AuditLog" not in inspector.get_table_names():
        return
    column_names = {column["name"] for column in inspector.get_columns("AuditLog")}
    with engine.begin() as conn:
        if "tenantId" not in column_names:
            conn.execute(text('ALTER TABLE "AuditLog" ADD COLUMN "tenantId" VARCHAR'))
        if _is_postgresql():
            conn.execute(
                text(
                    '''
                    UPDATE "AuditLog" AS audit
                    SET "tenantId" = users."tenantId"
                    FROM "UserAccount" AS users
                    WHERE audit."actorUserId" = users.id
                      AND audit."tenantId" IS NULL
                      AND users."accountLevel" != 'platform_admin'
                      AND users."tenantId" IS NOT NULL
                    '''
                )
            )
        else:
            conn.execute(
                text(
                    '''
                    UPDATE "AuditLog"
                    SET "tenantId" = (
                        SELECT users."tenantId"
                        FROM "UserAccount" AS users
                        WHERE users.id = "AuditLog"."actorUserId"
                    )
                    WHERE "tenantId" IS NULL
                      AND "actorUserId" IS NOT NULL
                      AND EXISTS (
                        SELECT 1
                        FROM "UserAccount" AS users
                        WHERE users.id = "AuditLog"."actorUserId"
                          AND users."accountLevel" != 'platform_admin'
                          AND users."tenantId" IS NOT NULL
                      )
                    '''
                )
            )
        repair_statements = [
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT users."tenantId"
                FROM "UserAccount" AS users
                WHERE users.id = "AuditLog"."entityId"
                  AND users."accountLevel" != 'platform_admin'
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'UserAccount'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT customers."tenantId"
                FROM "Customer" AS customers
                WHERE customers.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'Customer'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT orders."tenantId"
                FROM "Order" AS orders
                WHERE orders.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'Order'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT invoices."tenantId"
                FROM "Invoice" AS invoices
                WHERE invoices.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'Invoice'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT proposals."tenantId"
                FROM "Proposal" AS proposals
                WHERE proposals.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'Proposal'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT COALESCE(invoices."tenantId", orders."tenantId", proposals."tenantId", customers."tenantId")
                FROM "PaymentRecord" AS payments
                LEFT JOIN "Invoice" AS invoices ON invoices.id = payments."invoiceId"
                LEFT JOIN "Order" AS orders ON orders.id = payments."orderId"
                LEFT JOIN "Proposal" AS proposals ON proposals.id = payments."proposalId"
                LEFT JOIN "Customer" AS customers ON customers.id = payments."customerId"
                WHERE payments.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'PaymentRecord'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT orders."tenantId"
                FROM "ProjectProgressUpdate" AS updates
                JOIN "Order" AS orders ON orders.id = updates."orderId"
                WHERE updates.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'ProjectProgressUpdate'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT orders."tenantId"
                FROM "ProjectTask" AS tasks
                JOIN "Order" AS orders ON orders.id = tasks."orderId"
                WHERE tasks.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'ProjectTask'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT orders."tenantId"
                FROM "ProjectIssue" AS issues
                JOIN "Order" AS orders ON orders.id = issues."orderId"
                WHERE issues.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'ProjectIssue'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT orders."tenantId"
                FROM "ProjectMaterialLog" AS materials
                JOIN "Order" AS orders ON orders.id = materials."orderId"
                WHERE materials.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'ProjectMaterialLog'
            ''',
            '''
            UPDATE "AuditLog"
            SET "tenantId" = (
                SELECT orders."tenantId"
                FROM "ProjectMonitoringAlert" AS alerts
                JOIN "Order" AS orders ON orders.id = alerts."orderId"
                WHERE alerts.id = "AuditLog"."entityId"
            )
            WHERE "tenantId" IS NULL
              AND "entityType" = 'ProjectMonitoringAlert'
            ''',
        ]
        for statement in repair_statements:
            conn.execute(text(statement))


def _backfill_demo_tenant_data() -> None:
    from .models import SaasTenant

    db = SessionLocal()
    try:
        tenant = db.scalar(select(SaasTenant).where(SaasTenant.company_name == "OMRAN Demo Company"))
        if not tenant:
            return
        tenant_id = tenant.id
    finally:
        db.close()

    with engine.begin() as conn:
        for table_name in ["Customer", "Order", "Invoice", "Proposal", "RagSource", "Employee"]:
            conn.execute(text(f'UPDATE "{table_name}" SET "tenantId" = :tenant_id WHERE "tenantId" IS NULL'), {"tenant_id": tenant_id})


def _seed_saas_platform_data() -> None:
    from .models import SaasInvoice, SaasPayment, SaasTenant

    tenants = [
        {
            "companyName": "OMRAN Demo Company",
            "contactEmail": "manager@demo.omran.local",
            "planName": "AI Business",
            "status": "active",
            "userCount": 2,
            "invoiceNumber": "OMRAN-SUB-2026-0001",
            "amount": Decimal("1200.00"),
            "paid": Decimal("1200.00"),
            "periodLabel": "June 2026",
            "dueDate": datetime(2026, 6, 30, tzinfo=timezone.utc),
            "paymentReference": "SUB-DEMO-PAID-001",
        },
    ]

    db = SessionLocal()
    try:
        for item in tenants:
            tenant = db.scalar(select(SaasTenant).where(SaasTenant.company_name == item["companyName"]))
            if not tenant:
                tenant = SaasTenant(company_name=item["companyName"])
                db.add(tenant)
                db.flush()
            tenant.contact_email = item["contactEmail"]
            tenant.plan_name = item["planName"]
            tenant.status = item["status"]
            tenant.user_count = item["userCount"]

            invoice = db.scalar(select(SaasInvoice).where(SaasInvoice.invoice_number == item["invoiceNumber"]))
            if not invoice:
                invoice = SaasInvoice(tenant_id=tenant.id, invoice_number=item["invoiceNumber"])
                db.add(invoice)
            invoice.tenant_id = tenant.id
            invoice.status = "paid" if item["paid"] >= item["amount"] else "sent"
            invoice.amount = item["amount"]
            invoice.currency = "EUR"
            invoice.period_label = item["periodLabel"]
            invoice.issue_date = datetime(2026, 6, 1, tzinfo=timezone.utc)
            invoice.due_date = item["dueDate"]

            if item["paid"] > 0:
                db.flush()
                payment = db.scalar(select(SaasPayment).where(SaasPayment.reference == item["paymentReference"]))
                if not payment:
                    payment = SaasPayment(tenant_id=tenant.id, invoice_id=invoice.id)
                    db.add(payment)
                payment.tenant_id = tenant.id
                payment.invoice_id = invoice.id
                payment.amount = item["paid"]
                payment.currency = "EUR"
                payment.paid_date = datetime(2026, 6, 15, tzinfo=timezone.utc)
                payment.method = "bank_transfer"
                payment.reference = item["paymentReference"]

        old_seed_names = ["North Build GmbH", "Al Noor Properties"]
        old_tenants = db.scalars(select(SaasTenant).where(SaasTenant.company_name.in_(old_seed_names))).all()
        for tenant in old_tenants:
            invoice_ids = list(db.scalars(select(SaasInvoice.id).where(SaasInvoice.tenant_id == tenant.id)).all())
            if invoice_ids:
                db.execute(delete(SaasPayment).where(SaasPayment.invoice_id.in_(invoice_ids)))
            db.execute(delete(SaasPayment).where(SaasPayment.tenant_id == tenant.id))
            db.execute(delete(SaasInvoice).where(SaasInvoice.tenant_id == tenant.id))
            db.delete(tenant)
        db.commit()
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401

    _ensure_pgvector_extension()
    Base.metadata.create_all(bind=engine)
    _ensure_user_access_columns()
    _ensure_business_tenant_columns()
    _ensure_audit_tenant_column()
    _ensure_rag_pgvector_columns_and_indexes()
    _ensure_employee_staffing_columns()
    _ensure_ai_intake_columns()
    _ensure_workshop_columns()
    _ensure_workshop_assignment_columns()
    _ensure_project_task_columns()
    _ensure_invoice_columns()
    _seed_saas_platform_data()
    _seed_saas_demo_accounts()
    _backfill_demo_tenant_data()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
