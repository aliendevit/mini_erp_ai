from __future__ import annotations

import argparse
import json
import shutil
import sys
import zipfile
from datetime import datetime, timezone
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


def zip_directory(source: Path, target: Path) -> int:
    count = 0
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in source.rglob("*"):
            if item.is_file():
                archive.write(item, item.relative_to(source))
                count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a local OMRAN demo backup for SQLite data and uploaded files.")
    parser.add_argument("--output-dir", default=str(ROOT / "backups"), help="Directory where backup folders are written.")
    args = parser.parse_args()

    settings = get_settings()
    db_path = sqlite_path(settings.database_url)
    if db_path is None:
        raise SystemExit("Only SQLite backups are supported by this script. Use managed PostgreSQL backups for production.")
    if not db_path.exists():
        raise SystemExit(f"Database file not found: {db_path}")

    uploads_dir = ROOT / "uploads"
    backup_root = Path(args.output_dir)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_dir = backup_root / f"omran-backup-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)

    db_target = backup_dir / db_path.name
    shutil.copy2(db_path, db_target)

    upload_file_count = 0
    uploads_zip = backup_dir / "uploads.zip"
    if uploads_dir.exists():
        upload_file_count = zip_directory(uploads_dir, uploads_zip)
    else:
        uploads_zip.write_bytes(b"")

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "databaseUrlKind": "sqlite",
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
