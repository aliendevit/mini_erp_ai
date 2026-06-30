from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from ..models import Proposal, ProposalMessage, RagChunk, RagIngestionJob, RagSource
from ..utils import ensure, json_dumps, json_loads
from .gemini_client import generate_text
from .rag_constants import (
    RAG_TRUST_EXTRACTED_UNCONFIRMED,
    RAG_TRUST_MANAGER_SAVED,
    RAG_TRUST_RAW_USER_INPUT,
)

RAG_EMBEDDING_DIM = 768
RAG_EMBEDDING_MODEL = "local-hash-v1"
RAG_EXTRACTOR_VERSION = "rag-native-2026-06-20"
MAX_UPLOAD_BYTES = 2_000_000
SUPPORTED_TEXT_MIME_TYPES = {
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml",
}
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "rag"

_TOKEN_RE = re.compile(r"[\w\u0600-\u06ff]+", re.UNICODE)
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{6,}\d")
_EMAIL_RE = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
_MONEY_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:eur|euro|usd|dollar|\$|€)\b", re.IGNORECASE)
_DATE_RE = re.compile(r"\b\d{1,4}[-./]\d{1,2}[-./]\d{1,4}\b")
_MEASURE_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:m|meter|meters|sqm|m2|cm|mm|hours|stunden)\b", re.IGNORECASE)
_DURABLE_KEYWORDS = {
    "address",
    "amount",
    "bench",
    "budget",
    "call",
    "city",
    "company",
    "contact",
    "contractor",
    "customer",
    "date",
    "diameter",
    "email",
    "fence",
    "garden",
    "invoice",
    "landscaping",
    "lighting",
    "material",
    "payment",
    "phone",
    "road",
    "scope",
    "site",
    "solar",
    "start",
    "street",
    "workshop",
    "yard",
    "ورشة",
    "حديقة",
    "سياج",
    "هاتف",
    "مقاول",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _tokens(text_value: str) -> list[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text_value or "") if token.strip()]


def deterministic_embedding(text_value: str, dim: int = RAG_EMBEDDING_DIM) -> list[float]:
    vector = [0.0] * dim
    for token in _tokens(text_value):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if not norm:
        return vector
    return [round(value / norm, 8) for value in vector]


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


def _json_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return json_dumps(value)


def _json_safe_datetime(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _hash_text(text_value: str) -> str:
    return hashlib.sha256(text_value.strip().encode("utf-8")).hexdigest()


def _safe_filename(filename: str | None) -> str:
    candidate = Path(filename or "upload.txt").name.strip() or "upload.txt"
    safe = _SAFE_FILENAME_RE.sub("-", candidate).strip(".-_")
    return safe[:120] or "upload.txt"


def _token_count(text_value: str) -> int:
    return len(_tokens(text_value))


def _chunk_text(text_value: str, max_chars: int = 1200) -> list[str]:
    cleaned = re.sub(r"\r\n?", "\n", text_value or "").strip()
    if not cleaned:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", cleaned) if part.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for start in range(0, len(paragraph), max_chars):
                chunks.append(paragraph[start : start + max_chars].strip())
            continue
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) > max_chars and current:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = candidate
    if current:
        chunks.append(current.strip())
    return chunks


def _has_pgvector_embedding_column(db: Session) -> bool:
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    try:
        inspector = inspect(bind)
        if "RagChunk" not in inspector.get_table_names():
            return False
        return any(column["name"] == "embedding" for column in inspector.get_columns("RagChunk"))
    except Exception:
        return False


def _set_pgvector_embedding(db: Session, chunk: RagChunk, embedding: list[float]) -> None:
    if not _has_pgvector_embedding_column(db):
        return
    db.flush()
    db.execute(
        text('UPDATE "RagChunk" SET "embedding" = CAST(:embedding AS vector) WHERE id = :id'),
        {"embedding": _vector_literal(embedding), "id": chunk.id},
    )


def _add_chunk(
    db: Session,
    source: RagSource,
    chunk_text: str,
    *,
    chunk_index: int,
    chunk_type: str,
    trust_level: str,
    metadata: dict[str, Any] | None = None,
    layout: dict[str, Any] | None = None,
    heading_path: list[str] | None = None,
    page_start: int | None = None,
    page_end: int | None = None,
) -> RagChunk:
    embedding = deterministic_embedding(chunk_text)
    chunk = RagChunk(
        source=source,
        proposal_id=source.proposal_id,
        order_id=source.order_id,
        customer_id=source.customer_id,
        site_id=source.site_id,
        source_type=source.source_type,
        source_entity_type=source.source_entity_type,
        source_entity_id=source.source_entity_id,
        chunk_type=chunk_type,
        trust_level=trust_level,
        chunk_text=chunk_text.strip(),
        chunk_text_hash=_hash_text(chunk_text),
        chunk_index=chunk_index,
        token_count=_token_count(chunk_text),
        language=source.language,
        page_start=page_start,
        page_end=page_end,
        layout_json=_json_or_none(layout),
        heading_path_json=_json_or_none(heading_path),
        metadata_json=_json_or_none(metadata),
        embedding_model=RAG_EMBEDDING_MODEL,
        embedding_dim=RAG_EMBEDDING_DIM,
        embedding_json=json.dumps(embedding, separators=(",", ":")),
    )
    db.add(chunk)
    db.flush()
    _set_pgvector_embedding(db, chunk, embedding)
    return chunk


def _existing_source(db: Session, source_type: str, source_entity_type: str, source_entity_id: str) -> RagSource | None:
    return db.scalar(
        select(RagSource).where(
            RagSource.source_type == source_type,
            RagSource.source_entity_type == source_entity_type,
            RagSource.source_entity_id == source_entity_id,
        )
    )


def delete_rag_for_proposal(db: Session, proposal_id: str) -> int:
    sources = db.scalars(select(RagSource).where(RagSource.proposal_id == proposal_id)).all()
    for source in sources:
        db.delete(source)
    db.flush()
    return len(sources)


def delete_rag_for_proposal_messages(db: Session, proposal_id: str, message_ids: list[str] | None = None) -> int:
    stmt = select(RagSource).where(
        RagSource.proposal_id == proposal_id,
        RagSource.source_type == "chat_fact",
        RagSource.source_entity_type == "ProposalMessage",
    )
    if message_ids is not None:
        if not message_ids:
            return 0
        stmt = stmt.where(RagSource.source_entity_id.in_(message_ids))

    sources = db.scalars(stmt).all()
    for source in sources:
        db.delete(source)
    db.flush()
    return len(sources)


def delete_rag_source(db: Session, source: RagSource) -> None:
    storage_path = source.storage_path
    db.delete(source)
    db.flush()
    if storage_path:
        try:
            stored = Path(storage_path)
            source_dir = stored.parent
            if UPLOAD_ROOT in stored.resolve().parents and source_dir.exists():
                shutil.rmtree(source_dir, ignore_errors=True)
        except Exception:
            # Database deletion is the source of truth; file cleanup can be retried manually.
            pass


def _heuristic_durable(text_value: str) -> bool:
    lowered = text_value.lower()
    if "structured intake answers:" in lowered or "please save these answers as project facts" in lowered:
        return True
    if _PHONE_RE.search(text_value) or _EMAIL_RE.search(text_value) or _MONEY_RE.search(text_value):
        return True
    if _DATE_RE.search(text_value) or _MEASURE_RE.search(text_value):
        return True
    return any(keyword in lowered for keyword in _DURABLE_KEYWORDS)


def _extract_facts_locally(text_value: str) -> list[str]:
    facts: list[str] = []
    for match in _PHONE_RE.findall(text_value):
        facts.append(f"Phone/contact number mentioned: {match.strip()}")
    for match in _EMAIL_RE.findall(text_value):
        facts.append(f"Email mentioned: {match.strip()}")
    for match in _MONEY_RE.findall(text_value):
        facts.append(f"Payment or budget amount mentioned: {match.strip()}")
    for match in _MEASURE_RE.findall(text_value):
        facts.append(f"Measurement mentioned: {match.strip()}")
    if not facts and _heuristic_durable(text_value):
        facts.append(text_value.strip())
    return facts[:8]


def _classify_chat_message(text_value: str) -> dict[str, Any]:
    if not _heuristic_durable(text_value):
        return {"save": False, "facts": []}

    prompt = "\n".join(
        [
            "Decide whether this construction ERP manager message contains durable project knowledge worth saving to retrieval memory.",
            "Durable knowledge includes scope, measurements, contacts, payment facts, dates, addresses, contractor/workshop assignments, constraints, or manager decisions.",
            "Return JSON only: {\"save\": boolean, \"facts\": [\"short exact fact strings\"]}.",
            "Keep names, phone numbers, dates, amounts, dimensions, and manager wording exact.",
            "",
            f"Manager message: {text_value}",
        ]
    )
    try:
        raw = generate_text(prompt, response_mime_type="application/json")
        parsed = json.loads(raw)
        facts = [str(item).strip() for item in parsed.get("facts", []) if str(item).strip()]
        return {"save": bool(parsed.get("save")) and bool(facts or text_value.strip()), "facts": facts[:8]}
    except Exception:
        return {"save": True, "facts": _extract_facts_locally(text_value)}


def capture_chat_message_for_rag(
    db: Session,
    proposal: Proposal,
    message: ProposalMessage,
    *,
    created_by_user_id: str | None = None,
) -> RagSource | None:
    if message.role != "user" or not message.content.strip():
        return None
    existing = _existing_source(db, "chat_fact", "ProposalMessage", message.id)
    if existing:
        return existing

    decision = _classify_chat_message(message.content)
    if not decision.get("save"):
        return None

    metadata = {
        "decision": "save",
        "messageId": message.id,
        "messageRole": message.role,
        "capturedAt": _utcnow().isoformat(),
    }
    source = RagSource(
        tenant_id=proposal.tenant_id,
        proposal_id=proposal.id,
        order_id=proposal.converted_order_id,
        customer_id=proposal.converted_customer_id,
        source_type="chat_fact",
        source_entity_type="ProposalMessage",
        source_entity_id=message.id,
        document_type="chat",
        title="AI intake chat fact",
        language=None,
        ingestion_status="processing",
        extraction_method="llm_or_local_chat_fact_classifier",
        extractor_version=RAG_EXTRACTOR_VERSION,
        metadata_json=json_dumps(metadata),
        created_by_user_id=created_by_user_id,
    )
    job = RagIngestionJob(source=source, status="running", stage="classify_chat_message", started_at=_utcnow())
    db.add_all([source, job])
    db.flush()

    facts = [str(item).strip() for item in decision.get("facts", []) if str(item).strip()]
    raw_text = f"Manager said: {message.content.strip()}"
    _add_chunk(
        db,
        source,
        raw_text,
        chunk_index=0,
        chunk_type="raw_chat_message",
        trust_level=RAG_TRUST_RAW_USER_INPUT,
        metadata={"messageId": message.id},
    )
    for index, fact in enumerate(facts, start=1):
        _add_chunk(
            db,
            source,
            fact,
            chunk_index=index,
            chunk_type="extracted_chat_fact",
            trust_level=RAG_TRUST_EXTRACTED_UNCONFIRMED,
            metadata={"messageId": message.id, "extractor": source.extraction_method},
        )

    source.ingestion_status = "ready"
    job.status = "complete"
    job.stage = "complete"
    job.finished_at = _utcnow()
    db.add_all([source, job])
    db.flush()
    return source


def capture_proposal_snapshot_for_rag(
    db: Session,
    proposal: Proposal,
    *,
    created_by_user_id: str | None = None,
) -> RagSource | None:
    entity_id = proposal.id
    existing = _existing_source(db, "proposal_snapshot", "Proposal", entity_id)
    if existing:
        db.delete(existing)
        db.flush()

    snapshot_parts = [
        proposal.summary or "",
        proposal.order_title or "",
        proposal.order_description or "",
        proposal.proposed_sites_json or "",
        proposal.required_skills_json or "",
        proposal.external_workshops_json or "",
        proposal.payment_drafts_json or "",
    ]
    text_value = "\n".join(part for part in snapshot_parts if part and part.strip()).strip()
    if not text_value:
        return None

    source = RagSource(
        tenant_id=proposal.tenant_id,
        proposal_id=proposal.id,
        order_id=proposal.converted_order_id,
        customer_id=proposal.converted_customer_id,
        source_type="proposal_snapshot",
        source_entity_type="Proposal",
        source_entity_id=entity_id,
        document_type="proposal_snapshot",
        title=proposal.order_title or "Proposal snapshot",
        ingestion_status="processing",
        extraction_method="structured_proposal_snapshot",
        extractor_version=RAG_EXTRACTOR_VERSION,
        metadata_json=json_dumps({"proposalStatus": proposal.status.value if hasattr(proposal.status, "value") else str(proposal.status)}),
        created_by_user_id=created_by_user_id,
    )
    job = RagIngestionJob(source=source, status="running", stage="chunk_snapshot", started_at=_utcnow())
    db.add_all([source, job])
    db.flush()
    for index, chunk in enumerate(_chunk_text(text_value)):
        _add_chunk(
            db,
            source,
            chunk,
            chunk_index=index,
            chunk_type="proposal_snapshot",
            trust_level=RAG_TRUST_MANAGER_SAVED,
            metadata={"proposalId": proposal.id},
        )
    source.ingestion_status = "ready"
    job.status = "complete"
    job.stage = "complete"
    job.finished_at = _utcnow()
    db.flush()
    return source


def _decode_upload_text(raw: bytes, content_type: str | None, filename: str) -> str:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is too large for RAG ingestion.")
    suffix = Path(filename or "").suffix.lower()
    allowed_suffix = suffix in {".txt", ".md", ".csv", ".json", ".xml", ".log"}
    if (content_type or "").split(";")[0].strip().lower() not in SUPPORTED_TEXT_MIME_TYPES and not allowed_suffix:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only text-like files are supported for RAG ingestion in this pass.")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


async def ingest_uploaded_text_file(
    db: Session,
    upload: UploadFile,
    *,
    proposal_id: str | None = None,
    order_id: str | None = None,
    customer_id: str | None = None,
    site_id: str | None = None,
    tenant_id: str | None = None,
    created_by_user_id: str | None = None,
) -> RagSource:
    ensure(bool(proposal_id or order_id), "proposalId oder orderId ist erforderlich.")
    raw = await upload.read()
    file_name = _safe_filename(upload.filename)
    file_hash = hashlib.sha256(raw).hexdigest()
    text_value = _decode_upload_text(raw, upload.content_type, file_name)
    ensure(bool(text_value.strip()), "Uploaded file is empty.")

    source = RagSource(
        tenant_id=tenant_id,
        proposal_id=proposal_id,
        order_id=order_id,
        customer_id=customer_id,
        site_id=site_id,
        source_type="uploaded_file",
        source_entity_type="file",
        source_entity_id=file_hash[:36],
        document_type="text",
        title=file_name,
        original_file_name=file_name,
        mime_type=upload.content_type,
        file_hash=file_hash,
        language=None,
        ingestion_status="processing",
        extraction_method="text_decode",
        extractor_version=RAG_EXTRACTOR_VERSION,
        metadata_json=json_dumps({"sizeBytes": len(raw)}),
        created_by_user_id=created_by_user_id,
    )
    job = RagIngestionJob(source=source, status="running", stage="decode_text", started_at=_utcnow())
    db.add_all([source, job])
    db.flush()

    target_dir = UPLOAD_ROOT / source.id
    target_dir.mkdir(parents=True, exist_ok=True)
    storage_path = target_dir / file_name
    storage_path.write_bytes(raw)
    source.storage_path = str(storage_path)
    for index, chunk in enumerate(_chunk_text(text_value)):
        _add_chunk(
            db,
            source,
            chunk,
            chunk_index=index,
            chunk_type="text_chunk",
            trust_level=RAG_TRUST_EXTRACTED_UNCONFIRMED,
            layout={"extraction": "plain_text", "chunkIndex": index},
            metadata={"fileName": file_name, "fileHash": file_hash},
        )
    source.ingestion_status = "ready"
    job.status = "complete"
    job.stage = "complete"
    job.finished_at = _utcnow()
    db.flush()
    return source


def reingest_rag_source(db: Session, source: RagSource, *, created_by_user_id: str | None = None) -> RagSource:
    for chunk in list(source.chunks):
        db.delete(chunk)
    for job in list(source.ingestion_jobs):
        db.delete(job)
    db.flush()

    if source.source_type == "uploaded_file":
        ensure(bool(source.storage_path), "Uploaded source has no stored file.")
        storage_path = Path(source.storage_path or "")
        ensure(storage_path.exists(), "Stored upload file was not found.", 404)
        raw = storage_path.read_bytes()
        text_value = _decode_upload_text(raw, source.mime_type, source.original_file_name or source.title or "upload.txt")
        ensure(bool(text_value.strip()), "Uploaded file is empty.")
        source.ingestion_status = "processing"
        source.file_hash = hashlib.sha256(raw).hexdigest()
        source.extractor_version = RAG_EXTRACTOR_VERSION
        source.updated_at = _utcnow()
        if created_by_user_id:
            source.created_by_user_id = source.created_by_user_id or created_by_user_id
        job = RagIngestionJob(source=source, status="running", stage="reingest_text", started_at=_utcnow())
        db.add(job)
        db.flush()
        for index, chunk in enumerate(_chunk_text(text_value)):
            _add_chunk(
                db,
                source,
                chunk,
                chunk_index=index,
                chunk_type="text_chunk",
                trust_level=RAG_TRUST_EXTRACTED_UNCONFIRMED,
                layout={"extraction": "plain_text", "chunkIndex": index, "reingested": True},
                metadata={"fileName": source.original_file_name or source.title, "fileHash": source.file_hash},
            )
        source.ingestion_status = "ready"
        job.status = "complete"
        job.stage = "complete"
        job.finished_at = _utcnow()
        db.flush()
        return source

    if source.source_type == "proposal_snapshot" and source.proposal_id:
        proposal = db.get(Proposal, source.proposal_id)
        ensure(proposal is not None, "Linked proposal was not found.", 404)
        assert proposal is not None
        next_source = capture_proposal_snapshot_for_rag(db, proposal, created_by_user_id=created_by_user_id)
        ensure(next_source is not None, "Proposal snapshot has no content to reprocess.")
        assert next_source is not None
        return next_source

    if source.source_type == "chat_fact" and source.proposal_id and source.source_entity_id:
        proposal = db.get(Proposal, source.proposal_id)
        message = db.get(ProposalMessage, source.source_entity_id)
        ensure(proposal is not None and message is not None, "Linked chat message was not found.", 404)
        db.delete(source)
        db.flush()
        next_source = capture_chat_message_for_rag(db, proposal, message, created_by_user_id=created_by_user_id)
        ensure(next_source is not None, "Chat message has no durable facts to reprocess.")
        assert next_source is not None
        return next_source

    ensure(False, "This RAG source type cannot be reprocessed yet.", 400)
    return source


def _scope_filter_sql(proposal_id: str | None, order_id: str | None) -> tuple[str, dict[str, Any]]:
    clauses = ['"isActive" = true']
    params: dict[str, Any] = {}
    if proposal_id:
        clauses.append('"proposalId" = :proposal_id')
        params["proposal_id"] = proposal_id
    if order_id:
        clauses.append('"orderId" = :order_id')
        params["order_id"] = order_id
    return " AND ".join(clauses), params


def query_rag_chunks(
    db: Session,
    *,
    question: str,
    proposal_id: str | None = None,
    order_id: str | None = None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    ensure(bool(proposal_id or order_id), "proposalId oder orderId ist erforderlich.")
    embedding = deterministic_embedding(question)
    where_sql, params = _scope_filter_sql(proposal_id, order_id)
    params.update({"embedding": _vector_literal(embedding), "limit": limit})

    rows = []
    if _has_pgvector_embedding_column(db):
        try:
            rows = db.execute(
                text(
                    f'''
                    SELECT id, "sourceId", "proposalId", "orderId", "customerId", "siteId",
                           "sourceType", "chunkType", "trustLevel", "chunkText", "metadataJson",
                           "layoutJson", "headingPathJson", "createdAt",
                           1 - ("embedding" <=> CAST(:embedding AS vector)) AS score
                    FROM "RagChunk"
                    WHERE {where_sql} AND "embedding" IS NOT NULL
                    ORDER BY "embedding" <=> CAST(:embedding AS vector), "createdAt" DESC
                    LIMIT :limit
                    '''
                ),
                params,
            ).mappings().all()
        except Exception:
            db.rollback()
            rows = []

    if not rows:
        stmt = select(RagChunk).where(RagChunk.is_active == True).order_by(RagChunk.created_at.desc())
        if proposal_id:
            stmt = stmt.where(RagChunk.proposal_id == proposal_id)
        if order_id:
            stmt = stmt.where(RagChunk.order_id == order_id)
        chunks = db.scalars(stmt).all()
        scored = []
        for chunk in chunks:
            stored = json_loads(chunk.embedding_json, [])
            score = sum((stored[i] if i < len(stored) else 0.0) * embedding[i] for i in range(len(embedding)))
            scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "id": chunk.id,
                "sourceId": chunk.source_id,
                "proposalId": chunk.proposal_id,
                "orderId": chunk.order_id,
                "customerId": chunk.customer_id,
                "siteId": chunk.site_id,
                "sourceType": chunk.source_type,
                "chunkType": chunk.chunk_type,
                "trustLevel": chunk.trust_level,
                "text": chunk.chunk_text,
                "score": round(float(score), 6),
                "metadata": json_loads(chunk.metadata_json, {}),
                "layout": json_loads(chunk.layout_json, {}),
                "headingPath": json_loads(chunk.heading_path_json, []),
                "createdAt": _json_safe_datetime(chunk.created_at),
            }
            for score, chunk in scored[:limit]
        ]

    return [
        {
            "id": row["id"],
            "sourceId": row["sourceId"],
            "proposalId": row["proposalId"],
            "orderId": row["orderId"],
            "customerId": row["customerId"],
            "siteId": row["siteId"],
            "sourceType": row["sourceType"],
            "chunkType": row["chunkType"],
            "trustLevel": row["trustLevel"],
            "text": row["chunkText"],
            "score": round(float(row["score"] or 0.0), 6),
            "metadata": json_loads(row["metadataJson"], {}),
            "layout": json_loads(row["layoutJson"], {}),
            "headingPath": json_loads(row["headingPathJson"], []),
            "createdAt": _json_safe_datetime(row["createdAt"]),
        }
        for row in rows
    ]


def rag_context_for_prompt(
    db: Session,
    proposal: Proposal,
    *,
    question: str,
    limit: int = 6,
) -> list[dict[str, Any]]:
    return query_rag_chunks(
        db,
        question=question,
        proposal_id=proposal.id,
        order_id=proposal.converted_order_id,
        limit=limit,
    )
