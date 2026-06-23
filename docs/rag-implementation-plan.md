# RAG Implementation Plan

This plan describes how to add Retrieval-Augmented Generation (RAG) into the existing OMRAN Mini ERP without turning it into a separate side application. The goal is to weave project documents, extracted layout, chat facts, proposal context, tracking notes, and monitoring evidence into the current AI Intake, Order, and AI Monitoring flows.

The current active runtime is:

- Frontend: `frontend/` Next.js App Router
- Backend: `backend-python/` FastAPI + SQLAlchemy
- Database: PostgreSQL + pgvector in every environment
- Current AI entry points: `backend-python/app/routers/ai.py`
- Current project/order/tracking entry points: `backend-python/app/routers/core.py`
- Current Docker runtime: `docker-compose.python.yml`

## 1. Design Goals

RAG must be a native project knowledge layer, not a separate MVP.

Primary goals:

- Attach uploaded documents and extracted context to AI Intake sessions before an order exists.
- Carry those sources forward to the created order after proposal confirmation.
- Retrieve project-scoped evidence during AI Intake chat, proposal generation, and AI Monitoring.
- Let the LLM help decide what chat content is worth vectorizing, while the backend enforces trust, scope, and safety rules.
- Preserve the current ERP source-of-truth model: SQL remains official for invoices, hours, statuses, assignments, payments, and progress numbers.
- Keep the current system working if RAG is disabled or unconfigured.

Non-goals for the first implementation:

- No separate RAG product page as the primary workflow.
- No replacement of SQL reports with semantic search.
- No automatic mutation of official ERP records from RAG retrieval.
- No blind vectorization of every assistant response.

## 2. Current Codebase Fit

The codebase currently creates tables directly through SQLAlchemy:

```python
Base.metadata.create_all(bind=engine)
```

There is no Alembic migration layer. Compatibility changes are handled manually in `backend-python/app/database.py` through `_ensure_*_columns()` helpers.

This means RAG should follow the same style initially:

- Add SQLAlchemy models in `backend-python/app/models.py`.
- Add pgvector setup and missing-index helpers in `backend-python/app/database.py`.
- Avoid destructive schema changes.
- Keep PostgreSQL startup safe by creating pgvector extension/columns/indexes idempotently.

Existing RAG integration points:

- `Proposal`: AI Intake draft/session.
- `ProposalMessage`: raw chat history.
- `ProposalFact`: extracted facts and source message ids.
- `Proposal.memory_summary_json`: current intake memory.
- `Proposal.payment_drafts_json`: payment facts from intake.
- `Proposal.external_workshops_json`: workshop facts from intake.
- `Order`, `Site`, `ProjectProgressUpdate`, `ProjectTask`, `ProjectIssue`, `ProjectMaterialLog`, `ProjectMonitoringReport`: order/tracking context.

## 3. Runtime and Docker Changes

### 3.1 PostgreSQL With pgvector

Current compose uses plain PostgreSQL:

```yaml
db:
  image: postgres:16
```

Change it to:

```yaml
db:
  image: pgvector/pgvector:pg16
```

This keeps PostgreSQL as the only database service and adds the `vector` extension inside the same DB.

Important safety note:

- Do not run `docker compose down -v` unless intentionally deleting local data.
- Before changing the database image in a real environment, create a backup from the current app settings menu or backend backup endpoint.

Recommended local command sequence:

```powershell
git status --short
docker compose -f docker-compose.python.yml ps
docker compose -f docker-compose.python.yml exec backend python -m app.scripts.backup_data
```

If the script path is not available inside the container, use the UI backup flow or:

```powershell
cd backend-python
python scripts\backup_data.py
```

Then change the compose image and rebuild/restart:

```powershell
docker compose -f docker-compose.python.yml pull db
docker compose -f docker-compose.python.yml up --build
```

### 3.2 Backend Dependencies

Add pgvector Python support:

```txt
pgvector
```

Likely document extraction dependencies:

```txt
pypdf
PyMuPDF
```

PaddleOCR should be introduced as an optional/heavy dependency, not immediately forced into the default Docker image unless we accept the image-size and install-time cost:

```txt
paddleocr
paddlepaddle
```

Safer staged approach:

- Phase 1: native text extraction for PDF/DOCX/TXT/MD.
- Phase 2: optional PaddleOCR worker/extractor path for scanned PDFs and images.

## 4. Database Setup Changes

Add an extension setup function in `backend-python/app/database.py`:

```python
def _ensure_pgvector_extension() -> None:
    if not DATABASE_URL.startswith("postgresql"):
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
```

Then call it before table creation:

```python
def init_db() -> None:
    from . import models  # noqa: F401

    _ensure_pgvector_extension()
    Base.metadata.create_all(bind=engine)
    _ensure_rag_indexes()
    ...
```

Why before `create_all()`:

- PostgreSQL must know the `vector` type before creating a table with `vector(768)`.

PostgreSQL behavior:

- Create the `vector` extension before RAG vector setup.
- Store embeddings in the pgvector `embedding` column.
- Keep `embeddingJson` only as optional debug/audit storage.
- Retrieval can return a safe no-op result until embedding generation is active.

## 5. RAG Tables

Use three core tables:

- `RagSource`: original source record, either file-based or database-derived.
- `RagChunk`: searchable chunk with text, metadata, trust, layout provenance, and vector.
- `RagIngestionJob`: status/progress/error record for extraction and embedding.

### 5.1 RagSource

Purpose:

- Track one source of knowledge.
- Examples: uploaded contract, AI Intake fact projection, proposal summary, tracking update projection, company SOP.

PostgreSQL schema:

```sql
CREATE TABLE "RagSource" (
  "id" varchar(36) PRIMARY KEY,
  "proposalId" varchar(36) NULL REFERENCES "Proposal"("id"),
  "orderId" varchar(36) NULL REFERENCES "Order"("id"),
  "customerId" varchar(36) NULL REFERENCES "Customer"("id"),
  "siteId" varchar(36) NULL REFERENCES "Site"("id"),

  "sourceType" varchar NOT NULL,
  "sourceEntityType" varchar NULL,
  "sourceEntityId" varchar(36) NULL,
  "documentType" varchar NULL,
  "title" varchar NULL,

  "originalFileName" varchar NULL,
  "mimeType" varchar NULL,
  "storagePath" text NULL,
  "fileHash" varchar NULL,

  "language" varchar NULL,
  "ingestionStatus" varchar NOT NULL DEFAULT 'pending',
  "extractionMethod" varchar NULL,
  "extractorVersion" varchar NULL,
  "metadataJson" text NULL,

  "createdByUserId" varchar(36) NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE INDEX "RagSource_proposalId_idx" ON "RagSource"("proposalId");
CREATE INDEX "RagSource_orderId_idx" ON "RagSource"("orderId");
CREATE INDEX "RagSource_customerId_idx" ON "RagSource"("customerId");
CREATE INDEX "RagSource_siteId_idx" ON "RagSource"("siteId");
CREATE INDEX "RagSource_status_idx" ON "RagSource"("ingestionStatus");
CREATE INDEX "RagSource_entity_idx" ON "RagSource"("sourceEntityType", "sourceEntityId");
```

Suggested `sourceType` values:

```text
uploaded_file
chat_message
intake_fact
memory_summary
proposal_summary
erp_order_summary
tracking_update
tracking_task
tracking_issue
tracking_material
monitoring_report
invoice_note
work_entry_note
customer_note
workshop_note
company_knowledge
historical_project_summary
```

Suggested `documentType` values:

```text
contract
client_scope
supplier_quote
workshop_offer
drawing
photo_ocr
invoice
timesheet
sop
safety_rule
pricing_guide
construction_checklist
other
```

### 5.2 RagChunk

Purpose:

- Store the actual searchable units.
- Preserve provenance and layout for citation.
- Keep trust/scoping metadata for safe retrieval.

PostgreSQL schema with pgvector:

```sql
CREATE TABLE "RagChunk" (
  "id" varchar(36) PRIMARY KEY,
  "sourceId" varchar(36) NOT NULL REFERENCES "RagSource"("id") ON DELETE CASCADE,

  "proposalId" varchar(36) NULL REFERENCES "Proposal"("id"),
  "orderId" varchar(36) NULL REFERENCES "Order"("id"),
  "customerId" varchar(36) NULL REFERENCES "Customer"("id"),
  "siteId" varchar(36) NULL REFERENCES "Site"("id"),

  "sourceType" varchar NOT NULL,
  "sourceEntityType" varchar NULL,
  "sourceEntityId" varchar(36) NULL,
  "chunkType" varchar NOT NULL,
  "trustLevel" varchar NOT NULL,

  "chunkText" text NOT NULL,
  "chunkTextHash" varchar NOT NULL,
  "chunkIndex" integer NOT NULL,
  "tokenCount" integer NULL,
  "language" varchar NULL,

  "pageStart" integer NULL,
  "pageEnd" integer NULL,
  "boundingBoxesJson" text NULL,
  "layoutJson" text NULL,
  "headingPathJson" text NULL,
  "metadataJson" text NULL,

  "embeddingModel" varchar NOT NULL,
  "embeddingDim" integer NOT NULL,
  "embedding" vector(768) NOT NULL,
  "embeddingJson" text NULL,

  "isActive" boolean NOT NULL DEFAULT true,
  "supersededByChunkId" varchar(36) NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE INDEX "RagChunk_sourceId_idx" ON "RagChunk"("sourceId");
CREATE INDEX "RagChunk_proposalId_idx" ON "RagChunk"("proposalId");
CREATE INDEX "RagChunk_orderId_idx" ON "RagChunk"("orderId");
CREATE INDEX "RagChunk_customerId_idx" ON "RagChunk"("customerId");
CREATE INDEX "RagChunk_siteId_idx" ON "RagChunk"("siteId");
CREATE INDEX "RagChunk_entity_idx" ON "RagChunk"("sourceEntityType", "sourceEntityId");
CREATE INDEX "RagChunk_active_scope_idx"
  ON "RagChunk"("isActive", "proposalId", "orderId", "sourceType", "trustLevel");

CREATE INDEX "RagChunk_embedding_hnsw_idx"
  ON "RagChunk"
  USING hnsw ("embedding" vector_cosine_ops);
```

Notes:

- `embedding` is the actual pgvector column.
- `embeddingJson` is optional debug/audit storage.
- `vector(768)` must match the embedding provider. Make dimension configurable before implementation.
- If the selected model uses 1536, 1024, or 3072 dimensions, change the column and indexes accordingly.

Suggested `chunkType` values:

```text
document_text
document_table
document_title
document_list
document_figure_caption
chat_user_message
chat_assistant_message
intake_fact
memory_summary
proposal_scope
proposal_payment
proposal_workshop
tracking_update
tracking_issue
tracking_task
monitoring_summary
invoice_note
work_entry_note
company_policy
```

Suggested `trustLevel` values, ordered from strongest to weakest:

```text
system_record
manager_confirmed
manager_saved
extracted_unconfirmed
raw_user_input
assistant_draft
```

Retrieval should prefer stronger trust levels when scores are close.

### 5.3 RagIngestionJob

Purpose:

- Track file extraction and embedding status.
- Allow the UI to show processing, ready, or failed.

Schema:

```sql
CREATE TABLE "RagIngestionJob" (
  "id" varchar(36) PRIMARY KEY,
  "sourceId" varchar(36) NOT NULL REFERENCES "RagSource"("id") ON DELETE CASCADE,
  "status" varchar NOT NULL DEFAULT 'pending',
  "stage" varchar NULL,
  "errorMessage" text NULL,
  "startedAt" timestamptz NULL,
  "finishedAt" timestamptz NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE INDEX "RagIngestionJob_sourceId_idx" ON "RagIngestionJob"("sourceId");
CREATE INDEX "RagIngestionJob_status_idx" ON "RagIngestionJob"("status");
```

## 6. SQLAlchemy Model Strategy

Add models to `backend-python/app/models.py`.

For PostgreSQL vector column, use:

```python
from pgvector.sqlalchemy import Vector

embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
```

Because the project is PostgreSQL-only, keep pgvector setup explicit and idempotent. A safe pattern is:

- Use a custom helper/type wrapper, or
- Keep `embeddingJson` as an optional debug column, and add the vector column with raw SQL during PostgreSQL startup.

Recommended robust approach:

- Define `embedding_json` in SQLAlchemy as `Text`.
- Create the PostgreSQL `embedding vector(N)` column and vector index using raw SQL in `_ensure_rag_pgvector_columns_and_indexes()`.
- Retrieval SQL can use raw `text()` queries when PostgreSQL is active.

This keeps startup repeatable and makes tests exercise the real PostgreSQL runtime.

## 7. Backend Service Modules

Add these modules:

```text
backend-python/app/routers/rag.py
backend-python/app/services/rag_sources.py
backend-python/app/services/rag_ingestion.py
backend-python/app/services/rag_extractors.py
backend-python/app/services/rag_chunking.py
backend-python/app/services/rag_embeddings.py
backend-python/app/services/rag_retrieval.py
backend-python/app/services/rag_chat_monitor.py
```

Responsibilities:

- `rag.py`: API endpoints.
- `rag_sources.py`: create/list/delete/link sources.
- `rag_ingestion.py`: ingestion orchestration.
- `rag_extractors.py`: PDF/DOCX/TXT/native/PaddleOCR extraction.
- `rag_chunking.py`: split text/layout into chunks.
- `rag_embeddings.py`: generate embeddings.
- `rag_retrieval.py`: scoped semantic retrieval.
- `rag_chat_monitor.py`: LLM-based decision on what chat content to vectorize.

## 8. API Endpoints

Add router:

```python
app.include_router(rag.router, prefix="/api")
```

Endpoints:

```text
POST   /api/rag/sources
GET    /api/rag/sources?proposalId=...&orderId=...
GET    /api/rag/sources/{source_id}
DELETE /api/rag/sources/{source_id}
POST   /api/rag/sources/{source_id}/reingest
GET    /api/rag/sources/{source_id}/chunks
POST   /api/rag/query
```

All endpoints must use:

```python
router = APIRouter(dependencies=[Depends(get_current_user)])
```

This matches existing protected business routes.

Upload form fields:

```text
file
proposalId optional
orderId optional
customerId optional
siteId optional
documentType optional
title optional
```

Validation rules:

- Require at least one of `proposalId`, `orderId`, or global company knowledge scope.
- Enforce max file size.
- Allow only supported MIME types.
- Verify `siteId` belongs to `orderId` when both are provided.
- Do not allow one user scope to retrieve another project's chunks.

## 9. File Ingestion Pipeline

Pipeline:

```text
upload/register source
-> save original file under backend-python/uploads/rag
-> compute fileHash
-> create RagSource(status=pending)
-> create RagIngestionJob(status=pending)
-> extract text/layout
-> chunk
-> embed
-> write RagChunk rows
-> mark source ready
```

Extraction order:

1. DOCX with `python-docx`.
2. TXT/MD direct read.
3. Born-digital PDF with native parser.
4. If text quality is low, run PaddleOCR.
5. For images, run PaddleOCR.

PaddleOCR should capture:

```text
page
block type
text
table HTML/markdown where possible
bounding boxes
reading order
OCR confidence
layout confidence
```

Store layout fields in chunk:

```text
pageStart
pageEnd
boundingBoxesJson
layoutJson
headingPathJson
metadataJson
```

This enables citations like:

```text
contract.pdf, page 3, payment table
```

## 10. Chat-Derived RAG

The current system already stores:

- Raw messages in `ProposalMessage`.
- Extracted facts in `ProposalFact`.
- Memory/payment/workshop JSON on `Proposal`.

RAG should not blindly vectorize the chat transcript. It should store a searchable projection of useful, active, trusted context.

### 10.1 What Always Stays in Normal DB

Always keep normal chat history:

```text
ProposalMessage
```

This remains the raw event log.

### 10.2 What Can Become RAG Chunks

Vectorize candidates:

- User message containing project facts.
- Active `ProposalFact`.
- Memory summary.
- Payment drafts.
- External workshop drafts.
- Saved proposal summary.
- Confirmed proposal summary.
- Converted ERP summary.

Avoid vectorizing:

- Greetings.
- Small acknowledgements.
- Empty/filler messages.
- Assistant questions.
- Assistant guesses.
- Superseded facts.
- Deleted messages.

### 10.3 LLM Decides What To Vectorize

Add a chat monitor service:

```text
rag_chat_monitor.py
```

After every user message in:

```text
POST /api/ai/intakes/{proposal_id}/messages/stream
```

run:

```text
save user message
-> refresh local proposal memory/facts
-> call LLM vectorization decision
-> backend validates decision
-> create/deactivate RAG chunks
-> retrieve relevant chunks for response
-> stream assistant reply
```

The LLM should return strict JSON:

```json
{
  "shouldVectorize": true,
  "reason": "contains payment and scope facts",
  "candidateChunks": [
    {
      "chunkType": "intake_fact",
      "trustLevel": "extracted_unconfirmed",
      "text": "Payment fact: the manager stated a 500 EUR cash deposit.",
      "category": "payment",
      "sourceMessageIds": ["..."],
      "confidence": 0.88
    }
  ],
  "supersedes": [
    {
      "sourceEntityType": "ProposalFact",
      "sourceEntityId": "..."
    }
  ]
}
```

Backend acceptance rules:

- LLM may propose candidate chunks.
- Backend decides final persistence.
- Candidate source ids must belong to the current proposal.
- Candidate text cannot introduce facts not present in source messages/facts.
- Assistant messages default to `assistant_draft` and are normally not vectorized.
- If the LLM fails, skip chat vectorization and continue normal chat.

This keeps current chat reliable even if the monitor is unavailable.

### 10.4 Prompt For Vectorization Decision

The decision prompt should say:

```text
You classify the latest manager message and active intake facts for RAG storage.
Return only JSON.
Do not invent facts.
Use only the latest message and active facts.
Vectorize only durable project facts, decisions, corrections, payment details,
scope details, dates, customer/contact details, workshop names, constraints,
or manager approvals.
Do not vectorize greetings, assistant questions, vague filler, or uncertain assumptions.
If a correction supersedes an older fact, identify the older fact id.
```

The response must be parsed and validated with Pydantic.

## 11. Retrieval Integration

### 11.1 AI Intake Chat

Current route:

```text
POST /api/ai/intakes/{proposal_id}/messages/stream
```

New behavior:

```text
append user message
refresh proposal memory
sync/monitor RAG chunks
retrieve top chunks for proposalId
build prompt with retrieved context
stream assistant reply
save assistant reply
```

Prompt sections should be explicit:

```text
Current proposal fields
Current intake facts
Retrieved project source excerpts
Conversation history
Known available workshops
```

Retrieved excerpts should include citation metadata:

```text
[Source 1]
sourceId: ...
sourceType: uploaded_file
file: contract.pdf
page: 2
trustLevel: manager_saved
text: ...
```

The assistant must cite sources when using retrieved evidence.

### 11.2 Proposal Generation

Current route:

```text
POST /api/ai/intakes/{proposal_id}/proposal
```

New behavior:

```text
retrieve proposal-scoped chunks
include chunks in proposal extraction prompt
extract proposal
save draft
sync proposal summary chunks
```

This lets uploaded contracts/specs influence proposal generation without replacing manager review.

### 11.3 Confirm Intake To Order

Current route:

```text
POST /api/ai/intakes/{proposal_id}/confirm
```

After `confirm_proposal()` returns `orderId` and `customerId`:

```text
update RagSource where proposalId = current proposal:
  orderId = created order id
  customerId = created customer id

update RagChunk where proposalId = current proposal:
  orderId = created order id
  customerId = created customer id
```

Do not remove `proposalId`; it remains useful provenance.

### 11.4 AI Monitoring

Current route:

```text
POST /api/orders/{order_id}/tracking/analyze
```

New behavior:

```text
build SQL tracking context
retrieve order-scoped chunks
include source excerpts in monitoring prompt
save monitoring report with used source ids
```

The monitoring prompt must state:

```text
SQL tracking data is official for progress, status, dates, issues, tasks, and alerts.
Retrieved documents are evidence/context only.
Explain conflicts instead of silently changing official values.
```

## 12. Retrieval Queries

PostgreSQL project-scoped retrieval:

```sql
SELECT
  "id",
  "sourceId",
  "chunkText",
  "sourceType",
  "chunkType",
  "trustLevel",
  "pageStart",
  "pageEnd",
  "metadataJson",
  ("embedding" <=> :query_embedding) AS distance
FROM "RagChunk"
WHERE "isActive" = true
  AND "proposalId" = :proposal_id
ORDER BY "embedding" <=> :query_embedding
LIMIT :limit;
```

Order-scoped retrieval:

```sql
SELECT
  "id",
  "sourceId",
  "chunkText",
  "sourceType",
  "chunkType",
  "trustLevel",
  "pageStart",
  "pageEnd",
  "metadataJson",
  ("embedding" <=> :query_embedding) AS distance
FROM "RagChunk"
WHERE "isActive" = true
  AND "orderId" = :order_id
ORDER BY "embedding" <=> :query_embedding
LIMIT :limit;
```

Ranking should combine:

- Vector distance.
- Trust level.
- Source type.
- Recency.
- Current scope match.

Example trust weights:

```text
system_record: 1.00
manager_confirmed: 0.95
manager_saved: 0.85
extracted_unconfirmed: 0.70
raw_user_input: 0.60
assistant_draft: 0.30
```

## 13. Frontend Integration

### 13.1 AI Intake Page

Modify:

```text
frontend/src/app/ai-intake/page.tsx
```

Add:

- Document upload panel inside the intake workspace.
- Source list with status: pending, processing, ready, failed.
- Delete/reingest actions.
- Citation display under assistant messages.
- Optional "use project documents" toggle, default on when ready sources exist.

No separate RAG page is needed for normal manager work.

### 13.2 Order Detail Page

Modify:

```text
frontend/src/app/orders/[id]/page.tsx
```

Add:

- Project documents section.
- Upload/list/delete sources attached to `orderId`.
- Show source status and document type.

### 13.3 Monitoring Page

Modify:

```text
frontend/src/app/orders/[id]/ProjectMonitoringSection.tsx
```

Add:

- Display source citations used by the latest monitoring analysis.
- Show if analysis was based only on SQL/rules or also project documents.

## 14. Safe Rollout Phases

### Phase 0: Branch and Baseline

Commands:

```powershell
git status --short --branch
git switch feature/rag-system
cd backend-python
python -m unittest discover tests
cd ..\frontend
npm run build
```

Do not continue implementation if baseline tests/build are unexpectedly broken.

### Phase 1: Schema and Docker Preparation

Changes:

- Add `pgvector` dependency.
- Change Docker DB image to `pgvector/pgvector:pg16`.
- Add pgvector extension setup in `database.py`.
- Add RAG models/tables without enabling runtime retrieval yet.

Verification:

```powershell
docker compose -f docker-compose.python.yml up --build
docker compose -f docker-compose.python.yml exec db psql -U omran -d omran -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose -f docker-compose.python.yml exec db psql -U omran -d omran -c "\dx"
```

Expected:

```text
vector extension listed
backend health still works
existing pages still load
```

### Phase 2: Source Upload and Listing

Changes:

- Add `rag.py` router.
- Add upload/list/delete endpoints.
- Store files under `uploads/rag`.
- Create `RagSource` and `RagIngestionJob`.
- Do not yet inject into AI prompts.

Verification:

```powershell
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/rag/sources
```

Frontend:

- Add source panel to AI Intake.
- Upload a small TXT/PDF.
- Confirm source appears as pending/ready.

### Phase 3: Native Extraction, Chunking, Embedding

Changes:

- Implement extraction for TXT/MD/DOCX/PDF.
- Implement chunking.
- Implement embedding generation.
- Store chunks.
- Add PostgreSQL vector search.

Verification:

```powershell
docker compose -f docker-compose.python.yml exec db psql -U omran -d omran -c "select count(*) from \"RagChunk\";"
```

Add backend tests:

```text
tests/test_rag_ingestion.py
tests/test_rag_retrieval.py
```

### Phase 4: AI Intake Retrieval Injection

Changes:

- Retrieve chunks by `proposalId`.
- Inject source excerpts into `build_intake_chat_prompt()`.
- Keep behavior unchanged if no chunks exist.
- Add citation metadata to stream response payload if feasible.

Safety:

- If retrieval fails, log warning and continue current chat flow.
- Do not block AI Intake on RAG.

### Phase 5: LLM Chat Vectorization Decision

Changes:

- Add `rag_chat_monitor.py`.
- Add Pydantic schema for decision JSON.
- Run monitor after user messages.
- Create/update chunks from accepted candidate facts.
- Mark superseded/deleted chunks inactive.

Safety:

- LLM decision cannot create official ERP records.
- LLM decision cannot vectorize facts outside current proposal.
- Failure means "skip vectorization", not "fail chat".

### Phase 6: Proposal Generation With RAG

Changes:

- Retrieve proposal chunks before proposal extraction.
- Add source excerpts to proposal prompt.
- Sync generated/saved proposal summary back into RAG.

Safety:

- Proposal remains editable.
- Unknown fields remain unknown.
- Retrieved docs are evidence, not automatic final truth.

### Phase 7: Confirmed Order Linking

Changes:

- On intake confirmation, copy `orderId/customerId` onto proposal-scoped sources/chunks.
- Add order document section.

Verification:

```sql
select "proposalId", "orderId", count(*)
from "RagChunk"
group by "proposalId", "orderId";
```

### Phase 8: AI Monitoring With RAG

Changes:

- Retrieve order chunks during monitoring analysis.
- Include them in `tracking_ai.py` prompt.
- Store used source ids in monitoring report metadata.

Safety:

- SQL tracking values remain authoritative.
- The AI explains conflicts rather than overwriting official state.

### Phase 9: PaddleOCR Layout Extraction

Changes:

- Add optional PaddleOCR extractor.
- Use only for images/scans/poor text extraction.
- Store layout/table/bounding box metadata.

Safety:

- Keep OCR failures isolated to source status `failed`.
- Native document ingestion remains working without OCR.

## 15. Testing Plan

Backend tests:

```text
test_rag_source_upload_requires_auth
test_rag_source_requires_scope
test_rag_ingests_txt_into_chunks
test_rag_deletes_source_and_chunks
test_rag_retrieval_filters_by_proposal
test_rag_retrieval_filters_by_order
test_chat_monitor_skips_greeting
test_chat_monitor_accepts_payment_fact
test_chat_monitor_marks_superseded_fact_inactive
test_ai_intake_still_streams_when_rag_retrieval_fails
test_confirm_intake_links_rag_sources_to_order
test_monitoring_analysis_includes_rag_context_when_available
```

Run:

```powershell
cd backend-python
python -m unittest discover tests
```

Frontend checks:

```powershell
cd frontend
npm run build
```

Manual smoke flow:

```text
1. Register/login.
2. Create AI Intake.
3. Upload project TXT/PDF.
4. Ask chat about uploaded document.
5. Generate proposal.
6. Confirm proposal to order.
7. Open order detail and verify document is linked.
8. Run AI Monitoring and verify source context is used.
```

## 16. Operational Safety

Rules to avoid damaging the current system:

- RAG features are additive.
- Existing endpoints keep their old behavior when no RAG sources exist.
- RAG failures degrade gracefully.
- No destructive database commands in normal setup.
- No `down -v` in documentation except explicit reset instructions.
- Back up before changing DB image in persistent environments.
- Keep local tests on PostgreSQL test databases.
- Use `isActive=false` instead of deleting superseded chunks unless deleting the whole source.
- Keep source provenance for auditability.
- Respect auth dependencies on all RAG endpoints.

## 17. Environment Variables

Add later:

```env
RAG_ENABLED=true
RAG_UPLOAD_MAX_MB=25
RAG_EMBEDDING_PROVIDER=gemini
RAG_EMBEDDING_MODEL=
RAG_EMBEDDING_DIM=768
RAG_RETRIEVAL_TOP_K=8
RAG_CHAT_MONITOR_ENABLED=true
RAG_PADDLEOCR_ENABLED=false
```

Use conservative defaults:

- RAG disabled unless explicitly enabled in deployment.
- Chat monitor enabled only after tests are stable.
- PaddleOCR disabled until installed and verified.

## 18. Summary Architecture

Final woven-in flow:

```text
AI Intake page
  -> upload docs to proposalId
  -> ingest docs into RagSource/RagChunk
  -> chat messages monitored for vector-worthy facts
  -> retrieved chunks added to existing AI prompt
  -> proposal generation uses chat + facts + documents
  -> confirmation creates Order and links RAG sources/chunks
  -> Order page manages project documents
  -> AI Monitoring uses SQL tracking + retrieved project evidence
```

The boundary stays clear:

```text
SQL = official ERP truth
RAG = evidence/context/searchable memory
LLM = assistant that proposes, explains, and cites
Manager = final approval
```
