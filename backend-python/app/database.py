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


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_employee_staffing_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
