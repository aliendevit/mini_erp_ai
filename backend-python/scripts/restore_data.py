from __future__ import annotations

import argparse
import json
import shutil
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.settings import get_settings  # noqa: E402


def sqlite_path(database_url: str) -> Path | None:
    if not database_url.startswith("sqlite:///"):
        return None
    raw = database_url.replace("sqlite:///", "", 1)
    path = Path(raw)
    return path if path.is_absolute() else ROOT / path


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
    db_path = sqlite_path(settings.database_url)
    if db_path is None:
        raise SystemExit("Only SQLite restore is supported by this script. Use managed PostgreSQL restore tools in production.")

    source_db = backup_dir / manifest["databaseFile"]
    if not source_db.exists():
        raise SystemExit(f"Backup database file not found: {source_db}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_db, db_path)

    uploads_archive = backup_dir / manifest.get("uploadsArchive", "uploads.zip")
    uploads_dir = ROOT / "uploads"
    if uploads_archive.exists():
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(uploads_archive, "r") as archive:
            archive.extractall(uploads_dir)

    print(f"Backup restored from: {backup_dir}")
    print(f"- database restored to: {db_path}")
    print(f"- uploads restored to: {uploads_dir}")


if __name__ == "__main__":
    main()
