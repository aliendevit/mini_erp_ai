from __future__ import annotations

import asyncio
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.routers import system
from app.routers.auth import _hash_password


class SystemBackupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.db_path = self.root / "app.db"
        self.db_path.write_bytes(b"original database")
        self.uploads_dir = self.root / "uploads"
        self.uploads_dir.mkdir()
        (self.uploads_dir / "photo.txt").write_text("original upload", encoding="utf-8")
        self.backups_dir = self.root / "backups"

        self.patches = [
            patch.object(system, "BACKUP_ROOT", self.backups_dir),
            patch.object(system, "UPLOADS_ROOT", self.uploads_dir),
            patch.object(system, "get_settings", lambda: SimpleNamespace(database_url=f"sqlite:///{self.db_path}")),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def test_create_backup_archive_contains_database_uploads_and_manifest(self) -> None:
        backup = system._create_backup_archive()
        archive_path = self.backups_dir / backup["fileName"]

        self.assertTrue(archive_path.exists())
        with zipfile.ZipFile(archive_path, "r") as archive:
            names = set(archive.namelist())
            self.assertIn("manifest.json", names)
            self.assertIn("app.db", names)
            self.assertIn("uploads.zip", names)
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))

        self.assertEqual(manifest["databaseFile"], "app.db")
        self.assertEqual(manifest["uploadsArchive"], "uploads.zip")
        self.assertEqual(manifest["uploadFileCount"], 1)
        self.assertEqual(backup["uploadFileCount"], 1)

    def test_restore_backup_replaces_database_and_uploads_after_confirmation(self) -> None:
        backup = system._create_backup_archive()
        archive_bytes = (self.backups_dir / backup["fileName"]).read_bytes()

        self.db_path.write_bytes(b"changed database")
        (self.uploads_dir / "photo.txt").write_text("changed upload", encoding="utf-8")

        upload = UploadFile(file=io.BytesIO(archive_bytes), filename=backup["fileName"])
        current_user = SimpleNamespace(id="user-id", password_hash=_hash_password("AdminPass1!"))
        result = asyncio.run(system.restore_backup(
            backupFile=upload,
            confirmation="RESTORE",
            currentPassword="AdminPass1!",
            current_user=current_user,
        ))

        self.assertTrue(result["ok"])
        self.assertEqual(self.db_path.read_bytes(), b"original database")
        self.assertEqual((self.uploads_dir / "photo.txt").read_text(encoding="utf-8"), "original upload")
        self.assertTrue(result["safetyBackup"]["fileName"].startswith("omran-backup-pre-restore-"))

    def test_restore_backup_requires_confirmation(self) -> None:
        upload = UploadFile(file=io.BytesIO(b"not used"), filename="omran-backup-test.zip")
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(system.restore_backup(
                backupFile=upload,
                confirmation="NO",
                currentPassword="AdminPass1!",
                current_user=SimpleNamespace(id="user-id", password_hash=_hash_password("AdminPass1!")),
            ))

        self.assertEqual(caught.exception.status_code, 400)

    def test_restore_rejects_oversized_upload(self) -> None:
        upload = UploadFile(file=io.BytesIO(b"x" * 32), filename="omran-backup-test.zip")
        current_user = SimpleNamespace(id="user-id", password_hash=_hash_password("AdminPass1!"))
        with patch.object(system, "MAX_BACKUP_UPLOAD_BYTES", 16), self.assertRaises(HTTPException) as caught:
            asyncio.run(system.restore_backup(
                backupFile=upload,
                confirmation="RESTORE",
                currentPassword="AdminPass1!",
                current_user=current_user,
            ))
        self.assertEqual(caught.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
