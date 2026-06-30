from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import RagChunk, RagIngestionJob, RagSource
from ..routers.auth import get_current_user, require_permission, tenant_id_for_user
from ..schemas import RagQueryPayload
from ..services.rag import delete_rag_source, ingest_uploaded_text_file, query_rag_chunks, reingest_rag_source
from ..utils import ensure, json_loads

router = APIRouter(prefix="/rag", tags=["rag"], dependencies=[Depends(get_current_user), Depends(require_permission("use_rag"))])


def rag_source_payload(source: RagSource) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": source.id,
            "proposalId": source.proposal_id,
            "orderId": source.order_id,
            "customerId": source.customer_id,
            "siteId": source.site_id,
            "sourceType": source.source_type,
            "sourceEntityType": source.source_entity_type,
            "sourceEntityId": source.source_entity_id,
            "documentType": source.document_type,
            "title": source.title,
            "originalFileName": source.original_file_name,
            "mimeType": source.mime_type,
            "storagePath": source.storage_path,
            "fileHash": source.file_hash,
            "language": source.language,
            "ingestionStatus": source.ingestion_status,
            "extractionMethod": source.extraction_method,
            "extractorVersion": source.extractor_version,
            "metadata": json_loads(source.metadata_json, {}),
            "createdByUserId": source.created_by_user_id,
            "createdAt": source.created_at,
            "updatedAt": source.updated_at,
        }
    )


def _tenant_id(user) -> str | None:
    return tenant_id_for_user(user)


def _ensure_source_tenant(source: RagSource, user) -> None:
    tenant_id = _tenant_id(user)
    if tenant_id and source.tenant_id != tenant_id:
        ensure(False, "RAG source not found.", 404)


def rag_chunk_payload(chunk: RagChunk) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": chunk.id,
            "sourceId": chunk.source_id,
            "proposalId": chunk.proposal_id,
            "orderId": chunk.order_id,
            "customerId": chunk.customer_id,
            "siteId": chunk.site_id,
            "sourceType": chunk.source_type,
            "sourceEntityType": chunk.source_entity_type,
            "sourceEntityId": chunk.source_entity_id,
            "chunkType": chunk.chunk_type,
            "trustLevel": chunk.trust_level,
            "text": chunk.chunk_text,
            "chunkIndex": chunk.chunk_index,
            "tokenCount": chunk.token_count,
            "language": chunk.language,
            "metadata": json_loads(chunk.metadata_json, {}),
            "layout": json_loads(chunk.layout_json, {}),
            "headingPath": json_loads(chunk.heading_path_json, []),
            "embeddingModel": chunk.embedding_model,
            "embeddingDim": chunk.embedding_dim,
            "hasEmbedding": bool(chunk.embedding_json),
            "createdAt": chunk.created_at,
            "updatedAt": chunk.updated_at,
        }
    )


def rag_job_payload(job: RagIngestionJob) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "id": job.id,
            "sourceId": job.source_id,
            "status": job.status,
            "stage": job.stage,
            "errorMessage": job.error_message,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "createdAt": job.created_at,
            "updatedAt": job.updated_at,
        }
    )


@router.get("/sources")
def list_rag_sources(
    proposalId: str | None = None,
    orderId: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    ensure(bool(proposalId or orderId), "proposalId oder orderId ist erforderlich.")
    stmt = select(RagSource).order_by(RagSource.created_at.desc())
    tenant_id = _tenant_id(current_user)
    if tenant_id:
        stmt = stmt.where(RagSource.tenant_id == tenant_id)
    if proposalId:
        stmt = stmt.where(RagSource.proposal_id == proposalId)
    if orderId:
        stmt = stmt.where(RagSource.order_id == orderId)
    return {"items": [rag_source_payload(item) for item in db.scalars(stmt).all()]}


@router.get("/sources/{source_id}")
def get_rag_source(source_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict:
    source = db.get(RagSource, source_id)
    ensure(source is not None, "RAG source not found.", 404)
    assert source is not None
    _ensure_source_tenant(source, current_user)
    chunks = db.scalars(select(RagChunk).where(RagChunk.source_id == source.id).order_by(RagChunk.chunk_index.asc())).all()
    jobs = db.scalars(select(RagIngestionJob).where(RagIngestionJob.source_id == source.id).order_by(RagIngestionJob.created_at.asc())).all()
    payload = rag_source_payload(source)
    payload["chunks"] = [rag_chunk_payload(chunk) for chunk in chunks]
    payload["jobs"] = [rag_job_payload(job) for job in jobs]
    return payload


@router.get("/sources/{source_id}/chunks")
def list_rag_source_chunks(source_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict:
    source = db.get(RagSource, source_id)
    ensure(source is not None, "RAG source not found.", 404)
    assert source is not None
    _ensure_source_tenant(source, current_user)
    chunks = db.scalars(select(RagChunk).where(RagChunk.source_id == source.id).order_by(RagChunk.chunk_index.asc())).all()
    return {"items": [rag_chunk_payload(chunk) for chunk in chunks]}


@router.delete("/sources/{source_id}")
def delete_rag_source_endpoint(source_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict:
    source = db.get(RagSource, source_id)
    ensure(source is not None, "RAG source not found.", 404)
    assert source is not None
    _ensure_source_tenant(source, current_user)
    delete_rag_source(db, source)
    db.commit()
    return {"ok": True}


@router.post("/sources/{source_id}/reingest")
def reingest_rag_source_endpoint(
    source_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    source = db.get(RagSource, source_id)
    ensure(source is not None, "RAG source not found.", 404)
    assert source is not None
    _ensure_source_tenant(source, current_user)
    next_source = reingest_rag_source(db, source, created_by_user_id=getattr(current_user, "id", None))
    db.commit()
    db.refresh(next_source)
    return get_rag_source(next_source.id, db=db, current_user=current_user)


@router.post("/sources/upload", status_code=201)
async def upload_rag_source(
    proposalId: str | None = Form(default=None),
    orderId: str | None = Form(default=None),
    customerId: str | None = Form(default=None),
    siteId: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    source = await ingest_uploaded_text_file(
        db,
        file,
        proposal_id=proposalId,
        order_id=orderId,
        customer_id=customerId,
        site_id=siteId,
        tenant_id=_tenant_id(current_user),
        created_by_user_id=getattr(current_user, "id", None),
    )
    db.commit()
    db.refresh(source)
    return get_rag_source(source.id, db=db, current_user=current_user)


@router.post("/query")
def query_rag(payload: RagQueryPayload, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict:
    items = query_rag_chunks(
        db,
        question=payload.question,
        proposal_id=payload.proposalId,
        order_id=payload.orderId,
        limit=payload.limit,
    )
    tenant_id = _tenant_id(current_user)
    if tenant_id:
        source_ids = {source.id for source in db.scalars(select(RagSource).where(RagSource.tenant_id == tenant_id)).all()}
        items = [item for item in items if item.get("sourceId") in source_ids]
    return {"items": jsonable_encoder(items)}
