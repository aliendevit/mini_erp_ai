from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
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


def dump_postgres(database_url: str, target: Path) -> None:
    parts = postgres_connection_parts(database_url)
    env = os.environ.copy()
    if parts["password"]:
        env["PGPASSWORD"] = parts["password"]
    try:
        subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--host",
                parts["host"],
                "--port",
                parts["port"],
                "--username",
                parts["user"],
                "--dbname",
                parts["database"],
                "--file",
                str(target),
            ],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
    except FileNotFoundError as exc:
        raise SystemExit("pg_dump is not installed. Use the Docker backend image or install PostgreSQL client tools.") from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit((exc.stderr or exc.stdout or str(exc)).strip()) from exc


def zip_directory(source: Path, target: Path) -> int:
    count = 0
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in source.rglob("*"):
            if item.is_file():
                archive.write(item, item.relative_to(source))
                count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an OMRAN backup for PostgreSQL data and uploaded files.")
    parser.add_argument("--output-dir", default=str(ROOT / "backups"), help="Directory where backup folders are written.")
    args = parser.parse_args()

    settings = get_settings()
    kind = database_kind(settings.database_url)

    uploads_dir = ROOT / "uploads"
    backup_root = Path(args.output_dir)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_dir = backup_root / f"omran-backup-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)

    db_target = backup_dir / "database.dump"
    dump_postgres(settings.database_url, db_target)

    upload_file_count = 0
    uploads_zip = backup_dir / "uploads.zip"
    if uploads_dir.exists():
        upload_file_count = zip_directory(uploads_dir, uploads_zip)
    else:
        uploads_zip.write_bytes(b"")

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "databaseUrlKind": kind,
        "databaseFile": db_target.name,
        "uploadsArchive": uploads_zip.name,
        "uploadFileCount": upload_file_count,
    }
    (backup_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Backup created: {backup_dir}")
    print(f"- database: {db_target}")
    print(f"- uploads: {uploads_zip} ({upload_file_count} files)")


if __name__ == "__main__":
    main()
