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


class SystemBackupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.uploads_dir = self.root / "uploads"
        self.uploads_dir.mkdir()
        (self.uploads_dir / "photo.txt").write_text("original upload", encoding="utf-8")
        self.backups_dir = self.root / "backups"

        self.patches = [
            patch.object(system, "BACKUP_ROOT", self.backups_dir),
            patch.object(system, "UPLOADS_ROOT", self.uploads_dir),
            patch.object(
                system,
                "get_settings",
                lambda: SimpleNamespace(database_url="postgresql://omran:change-me-local@localhost:5432/omran_test"),
            ),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def test_create_backup_archive_contains_database_uploads_and_manifest(self) -> None:
        with patch.object(system, "_dump_postgres_database", side_effect=lambda target: target.write_bytes(b"pg dump")):
            backup = system._create_backup_archive()
        archive_path = self.backups_dir / backup["fileName"]

        self.assertTrue(archive_path.exists())
        with zipfile.ZipFile(archive_path, "r") as archive:
            names = set(archive.namelist())
            self.assertIn("manifest.json", names)
            self.assertIn("database.dump", names)
            self.assertIn("uploads.zip", names)
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))

        self.assertEqual(manifest["databaseUrlKind"], "postgresql")
        self.assertEqual(manifest["databaseFile"], "database.dump")
        self.assertEqual(manifest["uploadsArchive"], "uploads.zip")
        self.assertEqual(manifest["uploadFileCount"], 1)
        self.assertEqual(backup["uploadFileCount"], 1)

    def test_restore_backup_replaces_database_and_uploads_after_confirmation(self) -> None:
        class FakeSession:
            def commit(self) -> None:
                pass

            def close(self) -> None:
                pass

        with patch.object(system, "_dump_postgres_database", side_effect=lambda target: target.write_bytes(b"pg dump")):
            backup = system._create_backup_archive()
        archive_bytes = (self.backups_dir / backup["fileName"]).read_bytes()

        (self.uploads_dir / "photo.txt").write_text("changed upload", encoding="utf-8")

        upload = UploadFile(file=io.BytesIO(archive_bytes), filename=backup["fileName"])
        with patch.object(system, "_dump_postgres_database", side_effect=lambda target: target.write_bytes(b"pg dump")), patch.object(
            system, "_restore_postgres_database"
        ) as restore_postgres, patch.object(system, "init_db"), patch.object(system, "record_audit"), patch.object(
            system, "SessionLocal", return_value=FakeSession()
        ):
            result = asyncio.run(system.restore_backup(backupFile=upload, confirmation="RESTORE", current_user_id="user-id"))

        self.assertTrue(result["ok"])
        restore_postgres.assert_called_once()
        self.assertEqual((self.uploads_dir / "photo.txt").read_text(encoding="utf-8"), "original upload")
        self.assertTrue(result["safetyBackup"]["fileName"].startswith("omran-backup-pre-restore-"))

    def test_restore_backup_requires_confirmation(self) -> None:
        upload = UploadFile(file=io.BytesIO(b"not used"), filename="omran-backup-test.zip")
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(system.restore_backup(backupFile=upload, confirmation="NO", current_user_id="user-id"))

        self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
