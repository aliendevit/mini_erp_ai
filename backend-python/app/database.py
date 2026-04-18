from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _normalize_database_url(url: str) -> str:
    if url.startswith("sqlite:///"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+pg8000://", 1)
    return url


DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", "sqlite:///./app.db")
)


class Base(DeclarativeBase):
    pass


engine_kwargs = {"future": True}
if DATABASE_URL.startswith("sqlite:///"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
