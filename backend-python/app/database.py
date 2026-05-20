from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
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

    Base.metadata.create_all(bind=engine)
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
