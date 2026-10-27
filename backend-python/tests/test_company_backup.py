from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select

from app.models import (
    AuditLog,
    CompanyProfile,
    Customer,
    Order,
    ProjectProgressPhoto,
    ProjectProgressUpdate,
    RagChunk,
    RagSource,
    SaasTenant,
    Site,
    UserAccount,
)
from app.routers.auth import require_company_manager
from app.services.company_backup import (
    create_company_backup,
    restore_company_backup,
    safe_company_backup_path,
)
from tests.postgres_test_utils import create_session


class CompanyBackupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine, self.TestingSession, self.db = create_session()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.backup_root = self.root / "backups"
        self.uploads_root = self.root / "uploads"
        self.uploads_root.mkdir(parents=True)

        self.tenant_a = SaasTenant(id="tenant-a", company_name="Company A", status="active")
        self.tenant_b = SaasTenant(id="tenant-b", company_name="Company B", status="active")
        self.manager_a = UserAccount(
            id="manager-a",
            email="manager-a@example.com",
            display_name="Manager A",
            password_hash="original-password-hash",
            session_token_hash="original-session-hash",
            tenant_id=self.tenant_a.id,
            tenant_name=self.tenant_a.company_name,
            account_level="company_manager",
            role="company_manager",
            permissions_json='["manage_company"]',
        )
        self.manager_b = UserAccount(
            id="manager-b",
            email="manager-b@example.com",
            password_hash="manager-b-password",
            tenant_id=self.tenant_b.id,
            tenant_name=self.tenant_b.company_name,
            account_level="company_manager",
            role="company_manager",
            permissions_json='["manage_company"]',
        )
        self.profile_a = CompanyProfile(
            id="profile-a",
            owner_user_id=self.manager_a.id,
            company_name="Company A",
            legal_name="Company A GmbH",
            country="DE",
        )
        self.customer_a = Customer(
            id="customer-a",
            tenant_id=self.tenant_a.id,
            company_name="Original Customer A",
            country="DE",
        )
        self.customer_b = Customer(
            id="customer-b",
            tenant_id=self.tenant_b.id,
            company_name="Original Customer B",
            country="DE",
        )
        self.order_a = Order(
            id="order-a",
            tenant_id=self.tenant_a.id,
            customer_id=self.customer_a.id,
            order_number="A-001",
            title="Original Project A",
            status="open",
            currency="EUR",
        )
        self.order_b = Order(
            id="order-b",
            tenant_id=self.tenant_b.id,
            customer_id=self.customer_b.id,
            order_number="B-001",
            title="Original Project B",
            status="open",
            currency="EUR",
        )
        self.site_a = Site(id="site-a", order_id=self.order_a.id, site_name="Site A")
        self.update_a = ProjectProgressUpdate(
            id="update-a",
            order_id=self.order_a.id,
            site_id=self.site_a.id,
            title="Original progress",
            status="in_progress",
            progress_percent=35,
            update_date=datetime.now(timezone.utc),
        )
        self.photo_path = self.uploads_root / "project-progress" / self.order_a.id / self.update_a.id / "photo.png"
        self.photo_path.parent.mkdir(parents=True)
        self.photo_path.write_bytes(b"original-photo")
        self.photo_a = ProjectProgressPhoto(
            id="photo-a",
            update_id=self.update_a.id,
            stored_filename=self.photo_path.name,
            original_filename="site-photo.png",
            content_type="image/png",
            size_bytes=len(b"original-photo"),
            storage_path=str(self.photo_path),
        )
        self.rag_path = self.uploads_root / "rag" / "rag-source-a" / "project.txt"
        self.rag_path.parent.mkdir(parents=True)
        self.rag_path.write_text("original RAG source", encoding="utf-8")
        self.rag_source_a = RagSource(
            id="rag-source-a",
            tenant_id=self.tenant_a.id,
            order_id=self.order_a.id,
            customer_id=self.customer_a.id,
            site_id=self.site_a.id,
            source_type="uploaded_file",
            source_entity_type="file",
            source_entity_id="file-source-a",
            title="project.txt",
            original_file_name="project.txt",
            mime_type="text/plain",
            storage_path=str(self.rag_path),
            ingestion_status="ready",
            created_by_user_id=self.manager_a.id,
        )
        self.rag_chunk_a = RagChunk(
            id="rag-chunk-a",
            source_id=self.rag_source_a.id,
            order_id=self.order_a.id,
            customer_id=self.customer_a.id,
            site_id=self.site_a.id,
            source_type="uploaded_file",
            source_entity_type="file",
            source_entity_id="file-source-a",
            chunk_type="text_chunk",
            trust_level="extracted_unconfirmed",
            chunk_text="original RAG source",
            chunk_text_hash="chunk-hash",
            chunk_index=0,
            embedding_model="local-hash-v1",
            embedding_dim=768,
            is_active=True,
        )
        self.original_audit = AuditLog(
            id="audit-before-backup",
            action="order.created",
            entity_type="Order",
            entity_id=self.order_a.id,
            actor_user_id=self.manager_a.id,
            tenant_id=self.tenant_a.id,
            summary="Existing audit history",
        )
        self.db.add_all(
            [
                self.tenant_a,
                self.tenant_b,
                self.manager_a,
                self.manager_b,
                self.profile_a,
                self.customer_a,
                self.customer_b,
                self.order_a,
                self.order_b,
                self.site_a,
                self.update_a,
                self.photo_a,
                self.rag_source_a,
                self.rag_chunk_a,
                self.original_audit,
            ]
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _create_backup_and_extract(self) -> tuple[dict, Path]:
        backup = create_company_backup(
            self.db,
            tenant_id=self.tenant_a.id,
            manager_user_id=self.manager_a.id,
            company_name=self.tenant_a.company_name,
            backup_root=self.backup_root,
            uploads_root=self.uploads_root,
        )
        archive_path = safe_company_backup_path(self.backup_root, self.tenant_a.id, backup["fileName"])
        extract_dir = self.root / f"extract-{backup['fileName']}"
        extract_dir.mkdir()
        with zipfile.ZipFile(archive_path, "r") as archive:
            archive.extractall(extract_dir)
        return backup, extract_dir

    def test_company_restore_is_tenant_scoped_and_preserves_accounts_and_audit(self) -> None:
        backup, extract_dir = self._create_backup_and_extract()

        with zipfile.ZipFile(
            safe_company_backup_path(self.backup_root, self.tenant_a.id, backup["fileName"]), "r"
        ) as archive:
            payload = json.loads(archive.read("data.json").decode("utf-8"))
        self.assertNotIn("UserAccount", payload["tables"])
        self.assertNotIn("AuditLog", payload["tables"])
        self.assertNotIn("SaasInvoice", payload["tables"])

        self.customer_a.company_name = "Changed Customer A"
        self.customer_b.company_name = "Changed Customer B"
        self.profile_a.legal_name = "Changed Company A"
        self.manager_a.password_hash = "new-password-hash"
        self.manager_a.session_token_hash = "new-session-hash"
        self.db.add(
            Customer(
                id="customer-a-after-backup",
                tenant_id=self.tenant_a.id,
                company_name="Remove during restore",
                country="DE",
            )
        )
        self.db.add(
            AuditLog(
                id="audit-after-backup",
                action="order.updated",
                entity_type="Order",
                entity_id=self.order_a.id,
                actor_user_id=self.manager_a.id,
                tenant_id=self.tenant_a.id,
                summary="Audit created after backup",
            )
        )
        self.db.commit()
        self.photo_path.write_bytes(b"changed-photo")
        self.rag_path.write_text("changed RAG source", encoding="utf-8")

        result = restore_company_backup(
            self.db,
            extract_dir=extract_dir,
            original_file_name=backup["fileName"],
            tenant_id=self.tenant_a.id,
            manager_user_id=self.manager_a.id,
            company_name=self.tenant_a.company_name,
            backup_root=self.backup_root,
            uploads_root=self.uploads_root,
        )
        self.db.expire_all()

        self.assertTrue(result["ok"])
        self.assertEqual(result["scope"], "company")
        customers_a = self.db.scalars(
            select(Customer).where(Customer.tenant_id == self.tenant_a.id).order_by(Customer.id)
        ).all()
        self.assertEqual([(item.id, item.company_name) for item in customers_a], [("customer-a", "Original Customer A")])
        self.assertEqual(self.db.get(Customer, "customer-b").company_name, "Changed Customer B")
        self.assertEqual(
            self.db.scalar(select(CompanyProfile).where(CompanyProfile.owner_user_id == self.manager_a.id)).legal_name,
            "Company A GmbH",
        )
        restored_manager = self.db.get(UserAccount, self.manager_a.id)
        self.assertEqual(restored_manager.password_hash, "new-password-hash")
        self.assertEqual(restored_manager.session_token_hash, "new-session-hash")
        self.assertIsNotNone(self.db.get(AuditLog, "audit-before-backup"))
        self.assertIsNotNone(self.db.get(AuditLog, "audit-after-backup"))
        self.assertIsNotNone(
            self.db.scalar(
                select(AuditLog).where(
                    AuditLog.action == "company.backup.restored",
                    AuditLog.tenant_id == self.tenant_a.id,
                )
            )
        )
        self.assertEqual(self.photo_path.read_bytes(), b"original-photo")
        self.assertEqual(self.rag_path.read_text(encoding="utf-8"), "original RAG source")
        self.assertTrue(result["safetyBackup"]["fileName"].startswith("omran-company-pre-restore-"))

    def test_company_cannot_restore_another_company_backup(self) -> None:
        backup, extract_dir = self._create_backup_and_extract()
        with self.assertRaises(HTTPException) as caught:
            restore_company_backup(
                self.db,
                extract_dir=extract_dir,
                original_file_name=backup["fileName"],
                tenant_id=self.tenant_b.id,
                manager_user_id=self.manager_b.id,
                company_name=self.tenant_b.company_name,
                backup_root=self.backup_root,
                uploads_root=self.uploads_root,
            )
        self.assertEqual(caught.exception.status_code, 403)
        self.assertEqual(self.db.get(Customer, self.customer_b.id).company_name, "Original Customer B")

    def test_only_company_manager_can_use_company_backup_dependency(self) -> None:
        self.assertIs(require_company_manager(self.manager_a), self.manager_a)
        company_user = UserAccount(
            email="user@example.com",
            password_hash="hash",
            tenant_id=self.tenant_a.id,
            account_level="company_user",
            role="project_user",
        )
        with self.assertRaises(HTTPException) as caught:
            require_company_manager(company_user)
        self.assertEqual(caught.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
