from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .settings import get_settings


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgresql+pg8000://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+pg8000://", 1)
    raise RuntimeError("PostgreSQL DATABASE_URL is required.")

DATABASE_URL = _normalize_database_url(get_settings().database_url)


class Base(DeclarativeBase):
    pass


engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _is_postgresql() -> bool:
    return DATABASE_URL.startswith("postgresql")


def _ensure_pgvector_extension() -> None:
    if not _is_postgresql():
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def _ensure_rag_pgvector_columns_and_indexes() -> None:
    if not _is_postgresql():
        return
    inspector = inspect(engine)
    if "RagChunk" not in inspector.get_table_names():
        return

    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE "RagChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(768)'))
        conn.execute(
            text(
                'CREATE INDEX IF NOT EXISTS "RagChunk_embedding_hnsw_idx" '
                'ON "RagChunk" USING hnsw ("embedding" vector_cosine_ops)'
            )
        )


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


def init_db() -> None:
    from . import models  # noqa: F401

    _ensure_pgvector_extension()
    Base.metadata.create_all(bind=engine)
    _ensure_rag_pgvector_columns_and_indexes()
    _ensure_employee_staffing_columns()
    _ensure_ai_intake_columns()
    _ensure_workshop_columns()
    _ensure_workshop_assignment_columns()
    _ensure_project_task_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
