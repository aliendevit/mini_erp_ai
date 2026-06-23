from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from typing import Iterator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import Base, get_db
from app.models import Customer, Order, Proposal, RagSource
from app.routers import rag
from app.routers.auth import get_current_user
from postgres_test_utils import create_session


def _user() -> object:
    return type("User", (), {"id": "user-1", "email": "manager@example.com"})()


def _client(db: Session, authenticated: bool = True) -> TestClient:
    app = FastAPI()
    app.include_router(rag.router, prefix="/api")

    def override_get_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    if authenticated:
        app.dependency_overrides[get_current_user] = _user

    return TestClient(app)


class RagApiE2ETests(unittest.TestCase):
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

    def _add_proposals(self) -> None:
        self.db.add_all(
            [
                Proposal(id="proposal-1", order_title="Proposal 1"),
                Proposal(id="proposal-2", order_title="Proposal 2"),
            ]
        )
        self.db.flush()

    def _add_orders(self) -> None:
        customer = Customer(id="customer-1", company_name="RAG Customer")
        self.db.add(customer)
        self.db.flush()
        self.db.add_all(
            [
                Order(id="order-1", customer_id=customer.id, title="Order 1"),
                Order(id="order-2", customer_id=customer.id, title="Order 2"),
            ]
        )
        self.db.flush()

    def test_rag_sources_endpoint_requires_authentication(self) -> None:
        response = _client(self.db, authenticated=False).get("/api/rag/sources?proposalId=proposal-1")

        self.assertEqual(response.status_code, 401)

    def test_rag_query_endpoint_requires_authentication(self) -> None:
        response = _client(self.db, authenticated=False).post(
            "/api/rag/query",
            json={"proposalId": "proposal-1", "question": "What context do we have?"},
        )

        self.assertEqual(response.status_code, 401)

    def test_rag_sources_endpoint_requires_proposal_or_order_scope(self) -> None:
        response = _client(self.db).get("/api/rag/sources")

        self.assertEqual(response.status_code, 400)
        self.assertIn("proposalId oder orderId ist erforderlich.", response.text)

    def test_rag_sources_endpoint_filters_by_proposal_scope(self) -> None:
        self._add_proposals()
        matching = RagSource(
            proposal_id="proposal-1",
            source_type="uploaded_file",
            title="Proposal upload",
            metadata_json='{"kind":"proposal"}',
        )
        other = RagSource(proposal_id="proposal-2", source_type="chat_fact", title="Other proposal")
        self.db.add_all([matching, other])
        self.db.commit()

        response = _client(self.db).get("/api/rag/sources?proposalId=proposal-1")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["id"], matching.id)
        self.assertEqual(payload["items"][0]["proposalId"], "proposal-1")
        self.assertEqual(payload["items"][0]["metadata"], {"kind": "proposal"})

    def test_rag_sources_endpoint_filters_by_order_scope(self) -> None:
        self._add_orders()
        matching = RagSource(order_id="order-1", source_type="uploaded_file", title="Order upload")
        other = RagSource(order_id="order-2", source_type="chat_fact", title="Other order")
        self.db.add_all([matching, other])
        self.db.commit()

        response = _client(self.db).get("/api/rag/sources?orderId=order-1")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([item["id"] for item in payload["items"]], [matching.id])
        self.assertEqual(payload["items"][0]["orderId"], "order-1")

    def test_rag_query_endpoint_returns_safe_empty_result_until_retrieval_exists(self) -> None:
        response = _client(self.db).post(
            "/api/rag/query",
            json={"proposalId": "proposal-1", "question": "Which rooms are mentioned?", "limit": 5},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"items": []})

    def test_rag_upload_source_endpoint_ingests_file_and_exposes_chunks(self) -> None:
        self._add_proposals()

        response = _client(self.db).post(
            "/api/rag/sources/upload",
            data={"proposalId": "proposal-1"},
            files={"file": ("garden-notes.txt", b"Garden fence height is 1.5 meters.\n\nInstall solar lights.", "text/plain")},
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["proposalId"], "proposal-1")
        self.assertEqual(payload["sourceType"], "uploaded_file")
        self.assertEqual(payload["ingestionStatus"], "ready")
        self.assertTrue(payload["chunks"])
        self.assertEqual(payload["jobs"][0]["status"], "complete")
        self.assertTrue(payload["chunks"][0]["hasEmbedding"])

    def test_rag_query_endpoint_returns_uploaded_scoped_context(self) -> None:
        self._add_proposals()
        client = _client(self.db)
        upload_response = client.post(
            "/api/rag/sources/upload",
            data={"proposalId": "proposal-1"},
            files={"file": ("garden-notes.txt", b"Garden fence height is 1.5 meters.\n\nInstall solar lights.", "text/plain")},
        )
        self.assertEqual(upload_response.status_code, 201)

        response = client.post(
            "/api/rag/query",
            json={"proposalId": "proposal-1", "question": "What is the fence height?", "limit": 5},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["items"])
        self.assertTrue(any("fence height is 1.5 meters" in item["text"].lower() for item in payload["items"]))
        self.assertTrue(all(item["proposalId"] == "proposal-1" for item in payload["items"]))

    def test_rag_query_endpoint_validates_request_shape(self) -> None:
        missing_question = _client(self.db).post("/api/rag/query", json={"proposalId": "proposal-1"})
        invalid_limit = _client(self.db).post(
            "/api/rag/query",
            json={"proposalId": "proposal-1", "question": "Find context", "limit": 99},
        )

        self.assertEqual(missing_question.status_code, 422)
        self.assertEqual(invalid_limit.status_code, 422)


if __name__ == "__main__":
    unittest.main()
