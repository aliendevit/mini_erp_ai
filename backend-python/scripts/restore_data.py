from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.settings import get_settings  # noqa: E402


def database_kind(database_url: str) -> str:
    if database_url.startswith("postgresql://") or database_url.startswith("postgresql+pg8000://"):
        return "postgresql"
    raise SystemExit(f"PostgreSQL DATABASE_URL is required: {database_url}")


def postgres_connection_parts(database_url: str) -> dict[str, str]:
    parsed = urlparse(database_url.replace("postgresql+pg8000://", "postgresql://", 1))
    database = parsed.path.lstrip("/")
    if parsed.scheme != "postgresql" or not parsed.hostname or not parsed.username or not database:
        raise SystemExit("PostgreSQL DATABASE_URL is incomplete.")
    return {
        "host": parsed.hostname,
        "port": str(parsed.port or 5432),
        "user": unquote(parsed.username),
        "password": unquote(parsed.password or ""),
        "database": unquote(database),
    }


def restore_postgres(database_url: str, source: Path) -> None:
    parts = postgres_connection_parts(database_url)
    env = os.environ.copy()
    if parts["password"]:
        env["PGPASSWORD"] = parts["password"]
    try:
        subprocess.run(
            [
                "pg_restore",
                "--clean",
                "--if-exists",
                "--no-owner",
                "--host",
                parts["host"],
                "--port",
                parts["port"],
                "--username",
                parts["user"],
                "--dbname",
                parts["database"],
                str(source),
            ],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
    except FileNotFoundError as exc:
        raise SystemExit("pg_restore is not installed. Use the Docker backend image or install PostgreSQL client tools.") from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit((exc.stderr or exc.stdout or str(exc)).strip()) from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore a local OMRAN demo backup.")
    parser.add_argument("backup_dir", help="Path to an omran-backup-* folder.")
    parser.add_argument("--yes", action="store_true", help="Required confirmation because restore overwrites local data.")
    args = parser.parse_args()

    if not args.yes:
        raise SystemExit("Restore overwrites the local database/uploads. Re-run with --yes to confirm.")

    backup_dir = Path(args.backup_dir).resolve()
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Backup manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    settings = get_settings()
    current_kind = database_kind(settings.database_url)
    backup_kind = manifest.get("databaseUrlKind", "postgresql")
    if backup_kind != current_kind:
        raise SystemExit(f"Backup is {backup_kind}, but current database is {current_kind}.")

    source_db = backup_dir / manifest["databaseFile"]
    if not source_db.exists():
        raise SystemExit(f"Backup database file not found: {source_db}")

    restore_postgres(settings.database_url, source_db)
    restored_to = "PostgreSQL database"

    uploads_archive = backup_dir / manifest.get("uploadsArchive", "uploads.zip")
    uploads_dir = ROOT / "uploads"
    if uploads_archive.exists():
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(uploads_archive, "r") as archive:
            archive.extractall(uploads_dir)

    print(f"Backup restored from: {backup_dir}")
    print(f"- database restored to: {restored_to}")
    print(f"- uploads restored to: {uploads_dir}")


if __name__ == "__main__":
    main()
