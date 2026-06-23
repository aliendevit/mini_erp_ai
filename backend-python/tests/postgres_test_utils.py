from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base


DEFAULT_TEST_DATABASE_URL = "postgresql://omran:change-me-local@localhost:5432/omran_test"


def normalize_postgres_url(database_url: str) -> str:
    if database_url.startswith("postgresql+pg8000://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+pg8000://", 1)
    raise RuntimeError("Tests require PostgreSQL. Set TEST_DATABASE_URL to a PostgreSQL database.")


def test_database_url() -> str:
    return os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL_TEST") or ""


def _admin_url(url: URL) -> URL:
    return url.set(database="postgres")


def ensure_test_database() -> None:
    url = make_url(normalize_postgres_url(test_database_url()))
    database_name = url.database
    if not database_name:
        raise RuntimeError("TEST_DATABASE_URL must include a database name.")

    admin_engine = create_engine(_admin_url(url), isolation_level="AUTOCOMMIT", future=True)
    try:
        with admin_engine.connect() as conn:
            exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": database_name})
            if not exists:
                quoted_name = '"' + database_name.replace('"', '""') + '"'
                conn.execute(text(f"CREATE DATABASE {quoted_name}"))
    finally:
        admin_engine.dispose()


def create_postgres_engine():
    ensure_test_database()
    return create_engine(normalize_postgres_url(test_database_url()), future=True)


def reset_database(engine) -> None:
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text('ALTER TABLE "RagChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(768)'))
            conn.execute(
                text(
                    'CREATE INDEX IF NOT EXISTS "RagChunk_embedding_hnsw_idx" '
                    'ON "RagChunk" USING hnsw ("embedding" vector_cosine_ops)'
                )
            )


def create_session() -> tuple[object, sessionmaker[Session], Session]:
    engine = (
        create_postgres_engine()
        if test_database_url()
        else create_engine(
            "sqlite:///:memory:",
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    )
    reset_database(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return engine, TestingSession, TestingSession()
