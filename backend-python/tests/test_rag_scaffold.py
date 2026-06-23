from __future__ import annotations

import asyncio
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session
from starlette.datastructures import Headers, UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import database
from app.database import Base
from app.models import Customer, Order, Proposal, ProposalMessage, RagChunk, RagIngestionJob, RagSource, Site
from app.routers.rag import list_rag_sources, query_rag, rag_source_payload
from app.schemas import RagQueryPayload
from app.utils import json_loads
from app.services.rag import (
    RAG_EMBEDDING_DIM,
    capture_chat_message_for_rag,
    capture_proposal_snapshot_for_rag,
    deterministic_embedding,
    ingest_uploaded_text_file,
)
from app.services.rag_constants import (
    RAG_TRUST_ASSISTANT_DRAFT,
    RAG_TRUST_EXTRACTED_UNCONFIRMED,
    RAG_TRUST_LEVELS,
    RAG_TRUST_MANAGER_CONFIRMED,
    RAG_TRUST_MANAGER_SAVED,
    RAG_TRUST_RAW_USER_INPUT,
    RAG_TRUST_SYSTEM_RECORD,
)
from postgres_test_utils import create_session


def _text_upload(content: str, filename: str = "notes.txt", content_type: str = "text/plain") -> UploadFile:
    raw = content.encode("utf-8")
    return UploadFile(
        file=io.BytesIO(raw),
        size=len(raw),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


class RagScaffoldTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine, _TestingSession, self.db = create_session()
        self.upload_dir = tempfile.TemporaryDirectory()
        self.upload_root_patch = patch("app.services.rag.UPLOAD_ROOT", Path(self.upload_dir.name))
        self.upload_root_patch.start()

    def tearDown(self) -> None:
        self.upload_root_patch.stop()
        self.upload_dir.cleanup()
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def _add_rag_scope(self) -> None:
        customer = Customer(id="customer-1", company_name="RAG Customer")
        proposal_1 = Proposal(id="proposal-1", order_title="Proposal 1")
        proposal_2 = Proposal(id="proposal-2", order_title="Proposal 2")
        order_1 = Order(id="order-1", customer=customer, title="Order 1")
        order_2 = Order(id="order-2", customer=customer, title="Order 2")
        site_1 = Site(id="site-1", order=order_1, site_name="Site 1")
        self.db.add_all([customer, proposal_1, proposal_2, order_1, order_2, site_1])
        self.db.flush()

    def test_rag_tables_are_created_in_postgresql(self) -> None:
        table_names = set(inspect(self.engine).get_table_names())

        self.assertIn("RagSource", table_names)
        self.assertIn("RagChunk", table_names)
        self.assertIn("RagIngestionJob", table_names)

    def test_postgresql_uses_embedding_json_and_pgvector_column(self) -> None:
        chunk_columns = {column["name"] for column in inspect(self.engine).get_columns("RagChunk")}

        self.assertIn("embeddingJson", chunk_columns)
        if self.engine.dialect.name == "postgresql":
            self.assertIn("embedding", chunk_columns)
        else:
            self.assertNotIn("embedding", chunk_columns)

    def test_rag_trust_levels_are_stable_contract_values(self) -> None:
        self.assertEqual(
            RAG_TRUST_LEVELS,
            {
                RAG_TRUST_SYSTEM_RECORD,
                RAG_TRUST_MANAGER_CONFIRMED,
                RAG_TRUST_MANAGER_SAVED,
                RAG_TRUST_EXTRACTED_UNCONFIRMED,
                RAG_TRUST_RAW_USER_INPUT,
                RAG_TRUST_ASSISTANT_DRAFT,
            },
        )
        self.assertEqual(RAG_TRUST_SYSTEM_RECORD, "system_record")
        self.assertEqual(RAG_TRUST_MANAGER_CONFIRMED, "manager_confirmed")
        self.assertEqual(RAG_TRUST_MANAGER_SAVED, "manager_saved")
        self.assertEqual(RAG_TRUST_EXTRACTED_UNCONFIRMED, "extracted_unconfirmed")
        self.assertEqual(RAG_TRUST_RAW_USER_INPUT, "raw_user_input")
        self.assertEqual(RAG_TRUST_ASSISTANT_DRAFT, "assistant_draft")

    def test_list_rag_sources_requires_scope(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            list_rag_sources(db=self.db)

        self.assertEqual(raised.exception.status_code, 400)

    def test_list_rag_sources_filters_by_proposal_and_order(self) -> None:
        customer = Customer(company_name="RAG Customer", country="DE")
        proposal = Proposal(order_title="RAG Intake")
        self.db.add_all([customer, proposal])
        self.db.flush()
        order = Order(customer_id=customer.id, title="RAG Order")
        self.db.add(order)
        self.db.flush()

        proposal_source = RagSource(
            proposal_id=proposal.id,
            source_type="uploaded_file",
            title="Proposal source",
            ingestion_status="ready",
        )
        order_source = RagSource(
            order_id=order.id,
            customer_id=customer.id,
            source_type="uploaded_file",
            title="Order source",
            ingestion_status="ready",
        )
        self.db.add_all([proposal_source, order_source])
        self.db.commit()

        proposal_result = list_rag_sources(proposalId=proposal.id, db=self.db)
        order_result = list_rag_sources(orderId=order.id, db=self.db)

        self.assertEqual([item["id"] for item in proposal_result["items"]], [proposal_source.id])
        self.assertEqual([item["id"] for item in order_result["items"]], [order_source.id])

    def test_list_rag_sources_applies_both_proposal_and_order_scope_when_provided(self) -> None:
        self._add_rag_scope()
        source_matching_both = RagSource(
            proposal_id="proposal-1",
            order_id="order-1",
            source_type="chat_fact",
            title="Scoped fact",
        )
        source_matching_proposal_only = RagSource(
            proposal_id="proposal-1",
            order_id="order-2",
            source_type="chat_fact",
            title="Other order fact",
        )
        self.db.add_all([source_matching_both, source_matching_proposal_only])
        self.db.commit()

        result = list_rag_sources(proposalId="proposal-1", orderId="order-1", db=self.db)

        self.assertEqual([item["id"] for item in result["items"]], [source_matching_both.id])

    def test_rag_source_payload_exposes_metadata_and_file_fields(self) -> None:
        self._add_rag_scope()
        source = RagSource(
            proposal_id="proposal-1",
            order_id="order-1",
            customer_id="customer-1",
            site_id="site-1",
            source_type="uploaded_file",
            source_entity_type="document",
            source_entity_id="document-1",
            document_type="layout_pdf",
            title="Blueprint",
            original_file_name="blueprint.pdf",
            mime_type="application/pdf",
            storage_path="uploads/blueprint.pdf",
            file_hash="sha256:abc",
            language="de",
            ingestion_status="ready",
            extraction_method="paddleocr",
            extractor_version="0.0-test",
            metadata_json='{"pageCount":2,"layoutExtracted":true}',
            created_by_user_id="user-1",
        )
        self.db.add(source)
        self.db.commit()

        payload = rag_source_payload(source)

        self.assertEqual(payload["proposalId"], "proposal-1")
        self.assertEqual(payload["orderId"], "order-1")
        self.assertEqual(payload["customerId"], "customer-1")
        self.assertEqual(payload["siteId"], "site-1")
        self.assertEqual(payload["originalFileName"], "blueprint.pdf")
        self.assertEqual(payload["metadata"], {"pageCount": 2, "layoutExtracted": True})

    def test_rag_source_payload_tolerates_invalid_metadata_json(self) -> None:
        source = RagSource(source_type="chat_fact", title="Broken metadata", metadata_json="{not json")

        self.assertEqual(rag_source_payload(source)["metadata"], {})

    def test_rag_source_chunk_and_ingestion_job_persist_document_layout_metadata(self) -> None:
        self._add_rag_scope()
        source = RagSource(
            proposal_id="proposal-1",
            order_id="order-1",
            customer_id="customer-1",
            site_id="site-1",
            source_type="uploaded_file",
            title="Site layout",
            ingestion_status="processing",
        )
        chunk = RagChunk(
            source=source,
            proposal_id="proposal-1",
            order_id="order-1",
            customer_id="customer-1",
            site_id="site-1",
            source_type="uploaded_file",
            source_entity_type="file",
            source_entity_id="file-1",
            chunk_type="layout_block",
            trust_level=RAG_TRUST_EXTRACTED_UNCONFIRMED,
            chunk_text="Room A: install drywall on the north wall.",
            chunk_text_hash="hash-1",
            chunk_index=0,
            token_count=9,
            language="en",
            page_start=1,
            page_end=1,
            bounding_boxes_json='[{"page":1,"x":10,"y":20,"w":100,"h":40}]',
            layout_json='{"blockType":"paragraph","confidence":0.91}',
            heading_path_json='["Blueprint","Room A"]',
            metadata_json='{"citation":"blueprint.pdf#page=1"}',
            embedding_model="text-embedding-test",
            embedding_dim=768,
            embedding_json="[0.1,0.2,0.3]",
        )
        job = RagIngestionJob(source=source, status="running", stage="extract_layout")
        self.db.add_all([source, chunk, job])
        self.db.commit()

        saved_chunk = self.db.scalar(select(RagChunk).where(RagChunk.source_id == source.id))
        saved_job = self.db.scalar(select(RagIngestionJob).where(RagIngestionJob.source_id == source.id))

        self.assertIsNotNone(saved_chunk)
        assert saved_chunk is not None
        self.assertEqual(saved_chunk.page_start, 1)
        self.assertEqual(saved_chunk.page_end, 1)
        self.assertEqual(saved_chunk.bounding_boxes_json, '[{"page":1,"x":10,"y":20,"w":100,"h":40}]')
        self.assertEqual(saved_chunk.layout_json, '{"blockType":"paragraph","confidence":0.91}')
        self.assertEqual(saved_chunk.heading_path_json, '["Blueprint","Room A"]')
        self.assertEqual(saved_chunk.metadata_json, '{"citation":"blueprint.pdf#page=1"}')
        self.assertEqual(saved_chunk.embedding_json, "[0.1,0.2,0.3]")
        self.assertEqual(saved_chunk.embedding_dim, 768)
        self.assertIsNotNone(saved_job)
        assert saved_job is not None
        self.assertEqual(saved_job.status, "running")
        self.assertEqual(saved_job.stage, "extract_layout")

    def test_rag_source_delete_cascades_chunks_and_ingestion_jobs(self) -> None:
        source = RagSource(source_type="chat_fact", title="Temporary source")
        chunk = RagChunk(
            source=source,
            source_type="chat_fact",
            chunk_type="fact",
            trust_level=RAG_TRUST_MANAGER_SAVED,
            chunk_text="The manager saved this fact.",
            chunk_text_hash="hash-1",
            chunk_index=0,
            embedding_model="text-embedding-test",
        )
        job = RagIngestionJob(source=source, status="complete")
        self.db.add_all([source, chunk, job])
        self.db.commit()
        source_id = source.id
        chunk_id = chunk.id
        job_id = job.id

        self.db.delete(source)
        self.db.commit()

        self.assertIsNone(self.db.get(RagSource, source_id))
        self.assertIsNone(self.db.get(RagChunk, chunk_id))
        self.assertIsNone(self.db.get(RagIngestionJob, job_id))

    def test_deterministic_embedding_is_stable_768_dimensions(self) -> None:
        first = deterministic_embedding("garden fence height 1.5 meters")
        second = deterministic_embedding("garden fence height 1.5 meters")

        self.assertEqual(len(first), RAG_EMBEDDING_DIM)
        self.assertEqual(first, second)
        self.assertAlmostEqual(sum(value * value for value in first), 1.0, places=5)

    def test_chat_message_capture_uses_llm_decision_and_stores_chunks(self) -> None:
        proposal = Proposal(order_title="Garden intake")
        message = ProposalMessage(role="user", content="Garden fence height is 1.5 meters. Call Solarna COM at +963 955 111 222.")
        proposal.messages = [message]
        self.db.add(proposal)
        self.db.commit()

        classifier_json = '{"save":true,"facts":["Garden fence height is 1.5 meters.","Solarna COM phone is +963 955 111 222."]}'
        with patch("app.services.rag.generate_text", return_value=classifier_json):
            source = capture_chat_message_for_rag(self.db, proposal, message, created_by_user_id="user-1")
            self.db.commit()

        self.assertIsNotNone(source)
        chunks = self.db.scalars(select(RagChunk).where(RagChunk.source_id == source.id).order_by(RagChunk.chunk_index.asc())).all()
        self.assertEqual(source.ingestion_status, "ready")
        self.assertEqual([chunk.chunk_type for chunk in chunks], ["raw_chat_message", "extracted_chat_fact", "extracted_chat_fact"])
        self.assertEqual(chunks[0].trust_level, RAG_TRUST_RAW_USER_INPUT)
        self.assertEqual(chunks[1].trust_level, RAG_TRUST_EXTRACTED_UNCONFIRMED)
        self.assertTrue(chunks[0].embedding_json)

    def test_chat_message_capture_is_idempotent_per_message(self) -> None:
        proposal = Proposal(order_title="Garden intake")
        message = ProposalMessage(role="user", content="The garden bench length is 2 meters.")
        proposal.messages = [message]
        self.db.add(proposal)
        self.db.commit()

        classifier_json = '{"save":true,"facts":["Garden bench length is 2 meters."]}'
        with patch("app.services.rag.generate_text", return_value=classifier_json):
            first = capture_chat_message_for_rag(self.db, proposal, message)
            second = capture_chat_message_for_rag(self.db, proposal, message)
            self.db.commit()

        self.assertEqual(first.id, second.id)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(RagSource)), 1)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(RagChunk)), 2)

    def test_structured_widget_answer_is_always_captured_for_rag(self) -> None:
        proposal = Proposal(order_title="Garden intake")
        message = ProposalMessage(
            role="user",
            content=(
                "Structured intake answers:\n"
                "1. What material is preferred?\n"
                "Answer: basalt stone\n\n"
                "Please save these answers as project facts for retrieval memory."
            ),
        )
        proposal.messages = [message]
        self.db.add(proposal)
        self.db.commit()

        with patch("app.services.rag.generate_text", side_effect=RuntimeError("quota")):
            source = capture_chat_message_for_rag(self.db, proposal, message)
            self.db.commit()

        self.assertIsNotNone(source)
        chunks = self.db.scalars(select(RagChunk).where(RagChunk.source_id == source.id).order_by(RagChunk.chunk_index.asc())).all()
        self.assertGreaterEqual(len(chunks), 2)
        self.assertIn("basalt stone", "\n".join(chunk.chunk_text for chunk in chunks))

    def test_rag_query_returns_scoped_pgvector_results(self) -> None:
        proposal = Proposal(id="proposal-1", order_title="Garden intake")
        other = Proposal(id="proposal-2", order_title="Other intake")
        self.db.add_all([proposal, other])
        self.db.flush()
        source = RagSource(proposal_id=proposal.id, source_type="uploaded_file", title="Garden notes")
        other_source = RagSource(proposal_id=other.id, source_type="uploaded_file", title="Other notes")
        self.db.add_all([source, other_source])
        self.db.flush()

        upload = _text_upload("Fence height is 1.5 meters.\n\nSolar lights are required.", "garden-notes.txt")
        asyncio.run(ingest_uploaded_text_file(self.db, upload, proposal_id=proposal.id))
        other_upload = _text_upload("Kitchen tiles are blue.", "kitchen.txt")
        asyncio.run(ingest_uploaded_text_file(self.db, other_upload, proposal_id=other.id))
        self.db.commit()

        result = query_rag(RagQueryPayload(proposalId=proposal.id, question="What is the fence height?"), db=self.db)

        self.assertTrue(result["items"])
        self.assertTrue(any("Fence height is 1.5 meters" in item["text"] for item in result["items"]))
        self.assertTrue(all(item["proposalId"] == proposal.id for item in result["items"]))

    def test_rag_query_returns_empty_items_when_no_scoped_chunks_exist(self) -> None:
        result = query_rag(RagQueryPayload(proposalId="proposal-1", question="What is in the document?"), db=self.db)

        self.assertEqual(result, {"items": []})

    def test_proposal_snapshot_capture_stores_manager_saved_chunks(self) -> None:
        proposal = Proposal(
            order_title="Garden renovation",
            order_description="Install fence, bench, and solar lights.",
            summary="Manager approved the garden scope.",
            proposed_sites_json='[{"siteName":"Garden","estimatedHours":24}]',
        )
        self.db.add(proposal)
        self.db.commit()

        source = capture_proposal_snapshot_for_rag(self.db, proposal, created_by_user_id="manager-1")
        self.db.commit()

        self.assertIsNotNone(source)
        chunks = self.db.scalars(select(RagChunk).where(RagChunk.source_id == source.id)).all()
        self.assertTrue(chunks)
        self.assertTrue(all(chunk.trust_level == RAG_TRUST_MANAGER_SAVED for chunk in chunks))
        self.assertEqual(source.source_entity_id, proposal.id)

    def test_uploaded_text_file_ingestion_persists_source_job_chunks_and_file(self) -> None:
        proposal = Proposal(id="proposal-1", order_title="Garden intake")
        self.db.add(proposal)
        self.db.commit()
        upload = _text_upload("Garden layout:\n\nFence on north side.\n\nBench beside the road.", "../unsafe name.txt")

        source = asyncio.run(ingest_uploaded_text_file(self.db, upload, proposal_id=proposal.id, created_by_user_id="user-1"))
        self.db.commit()

        saved = self.db.get(RagSource, source.id)
        self.assertEqual(saved.original_file_name, "unsafe-name.txt")
        self.assertTrue(Path(saved.storage_path).exists())
        chunks = self.db.scalars(select(RagChunk).where(RagChunk.source_id == source.id).order_by(RagChunk.chunk_index.asc())).all()
        jobs = self.db.scalars(select(RagIngestionJob).where(RagIngestionJob.source_id == source.id)).all()
        self.assertGreaterEqual(len(chunks), 1)
        self.assertEqual(jobs[0].status, "complete")
        self.assertEqual(json_loads(chunks[0].layout_json, {}), {"extraction": "plain_text", "chunkIndex": 0})

    def test_rag_query_payload_validates_question_and_limit(self) -> None:
        with self.assertRaises(ValidationError):
            RagQueryPayload(question="")

        with self.assertRaises(ValidationError):
            RagQueryPayload(question="Find context", limit=0)

        with self.assertRaises(ValidationError):
            RagQueryPayload(question="Find context", limit=21)

        payload = RagQueryPayload(question="Find context")
        self.assertEqual(payload.limit, 8)

    def test_pgvector_extension_is_created_for_postgresql(self) -> None:
        fake_engine = MagicMock()

        with patch.object(database, "DATABASE_URL", "postgresql+pg8000://user:pass@db/app"), patch.object(
            database, "engine", fake_engine
        ):
            database._ensure_pgvector_extension()

        conn = fake_engine.begin.return_value.__enter__.return_value
        conn.execute.assert_called_once()
        self.assertEqual(str(conn.execute.call_args.args[0]), "CREATE EXTENSION IF NOT EXISTS vector")

    def test_pgvector_column_and_hnsw_index_are_created_for_postgresql_rag_chunk_table(self) -> None:
        fake_engine = MagicMock()
        fake_inspector = MagicMock()
        fake_inspector.get_table_names.return_value = ["RagSource", "RagChunk", "RagIngestionJob"]

        with patch.object(database, "DATABASE_URL", "postgresql+pg8000://user:pass@db/app"), patch.object(
            database, "engine", fake_engine
        ), patch.object(database, "inspect", return_value=fake_inspector):
            database._ensure_rag_pgvector_columns_and_indexes()

        conn = fake_engine.begin.return_value.__enter__.return_value
        statements = [str(call.args[0]) for call in conn.execute.call_args_list]
        self.assertEqual(
            statements,
            [
                'ALTER TABLE "RagChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(768)',
                'CREATE INDEX IF NOT EXISTS "RagChunk_embedding_hnsw_idx" ON "RagChunk" USING hnsw ("embedding" vector_cosine_ops)',
            ],
        )

    def test_pgvector_column_and_index_creation_skips_missing_rag_chunk_table(self) -> None:
        fake_engine = MagicMock()
        fake_inspector = MagicMock()
        fake_inspector.get_table_names.return_value = ["Customer"]

        with patch.object(database, "DATABASE_URL", "postgresql+pg8000://user:pass@db/app"), patch.object(
            database, "engine", fake_engine
        ), patch.object(database, "inspect", return_value=fake_inspector):
            database._ensure_rag_pgvector_columns_and_indexes()

        fake_engine.begin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
