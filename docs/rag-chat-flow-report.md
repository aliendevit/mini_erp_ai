# RAG Chat Flow And Capture Report

Generated: 2026-06-21
Branch: A22UI

## Executive Summary

The AI intake chat flow captures durable user-provided project information into RAG storage. The current implementation stores:

- Raw user chat messages as `chat_fact` RAG sources.
- Extracted facts from those chat messages as separate chunks.
- Saved UI draft state as a `proposal_snapshot` RAG source.
- Uploaded text documents from the RAG memory strip as `uploaded_file` RAG sources.
- Local hash embeddings in `RagChunk.embeddingJson`.
- PostgreSQL pgvector embeddings in `RagChunk.embedding` when PostgreSQL and pgvector are available.

The persisted test scenario confirmed PostgreSQL pgvector is active and all scenario chunks received vector embeddings.

## Relevant Code Paths

- RAG DB models: `backend-python/app/models.py`
  - `RagSource`
  - `RagChunk`
  - `RagIngestionJob`
- pgvector setup: `backend-python/app/database.py`
  - creates extension `vector`
  - adds `RagChunk.embedding vector(768)`
  - creates `RagChunk_embedding_hnsw_idx`
- API router: `backend-python/app/routers/rag.py`
  - `GET /api/rag/sources`
  - `GET /api/rag/sources/{sourceId}`
  - `POST /api/rag/sources/upload`
  - `POST /api/rag/query`
- Chat integration: `backend-python/app/routers/ai.py`
  - `POST /api/ai/intakes/{proposalId}/messages/stream`
  - `PUT /api/ai/intakes/{proposalId}`
  - `POST /api/ai/intakes/{proposalId}/proposal`
  - `POST /api/ai/intakes/{proposalId}/confirm`
- RAG service: `backend-python/app/services/rag.py`
  - `capture_chat_message_for_rag`
  - `capture_proposal_snapshot_for_rag`
  - `ingest_uploaded_text_file`
  - `query_rag_chunks`
  - `rag_context_for_prompt`
- UI controls: `frontend/src/app/ai-intake/page.tsx`
  - RAG memory strip
  - capture draft button
  - upload text button
  - chat composer
- Playwright E2E: `frontend/e2e/ai-intake-rag.spec.ts`

## Chat Flow

1. The manager opens AI Intake in the frontend.
2. The UI uses the auth token from `localStorage.omran_auth_token`.
3. The manager creates or selects an intake.
4. The manager sends a chat message.
5. The UI posts the message to:
   - `POST /api/ai/intakes/{proposalId}/messages/stream`
6. Backend stores the user message in `ProposalMessage`.
7. Backend refreshes local proposal memory.
8. Backend calls `capture_chat_message_for_rag`.
9. RAG capture creates:
   - one `RagSource` with `sourceType = chat_fact`
   - one raw message chunk with `chunkType = raw_chat_message`
   - zero or more extracted fact chunks with `chunkType = extracted_chat_fact`
   - one `RagIngestionJob`, ending as `complete`
10. Backend builds the assistant prompt and calls `rag_context_for_prompt`.
11. RAG query retrieves scoped chunks for the same proposal/order.
12. Assistant streams a reply.
13. Assistant reply is stored in `ProposalMessage`, but is not currently stored as a RAG fact source.

Important behavior: RAG captures user messages, not assistant replies. Assistant replies are still visible in conversation history.

## UI Draft Capture Flow

When the manager saves or explicitly captures the draft:

1. UI sends:
   - `PUT /api/ai/intakes/{proposalId}`
2. Backend applies the draft values to `Proposal`.
3. Backend calls `capture_proposal_snapshot_for_rag`.
4. Existing proposal snapshot for that proposal is replaced.
5. RAG stores a new `proposal_snapshot` source and chunks the current structured proposal fields.

Captured fields include:

- summary
- order title
- order description
- proposed sites JSON
- required skills JSON
- external workshops JSON
- payment drafts JSON

## Uploaded Text Capture Flow

When the manager uploads a text-like file from the RAG memory strip:

1. UI posts multipart form data to:
   - `POST /api/rag/sources/upload`
2. Backend validates the file as text-like content.
3. Backend stores the raw upload under `backend-python/uploads/rag/{sourceId}/`.
4. Backend creates:
   - one `RagSource` with `sourceType = uploaded_file`
   - one or more `RagChunk` rows with `chunkType = text_chunk`
   - one complete `RagIngestionJob`

Allowed file types in this pass:

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.xml`
- `.log`
- matching text MIME types

## Persisted Scenario

Scenario key:

`A22UI-RAG-UI-SCENARIO-20260621-183227`

User:

- email: `aa@gmal.com`
- user id: `c0b7ba36-727a-4f29-a000-c8362fcf8a51`

Proposal:

- id: `7ad3fa9b-6464-4dec-9308-bda18fcf9c9c`
- status: `draft`
- title: `A22UI-RAG-UI-SCENARIO-20260621-183227 Dental clinic renovation`

Conversation stored in `ProposalMessage`:

1. User: new Orion Klinikum GmbH dental clinic renovation in Berlin Mitte, dates, budget.
2. Assistant: confirmed customer, site, and renovation window.
3. User: clinic stays open during day, HVAC and drilling at night, ISO 14644 awareness, ClinicFit GmbH.
4. Assistant: confirmed HVAC night work, sterile-zone access, and ClinicFit GmbH.
5. User: Lena Hoffmann contact, phone, email, payment plan, Siemens fire alarm must remain live.
6. Assistant: confirmed contact, deposit terms, and fire alarm constraint.

## Persisted RAG Result

Database dialect:

`postgresql`

Counts for the scenario:

| Area | Count |
| --- | ---: |
| Chat messages | 6 |
| User messages | 3 |
| Assistant messages | 3 |
| RAG sources | 5 |
| RAG chunks | 15 |
| RAG ingestion jobs | 5 |
| Non-null pgvector embeddings | 15 |

Source breakdown:

| Source type | Count | Meaning |
| --- | ---: | --- |
| `chat_fact` | 3 | One source per captured user chat message |
| `proposal_snapshot` | 1 | Saved UI draft snapshot |
| `uploaded_file` | 1 | Uploaded text note |

Chunk breakdown:

| Chunk type | Count | Trust level |
| --- | ---: | --- |
| `raw_chat_message` | 3 | `raw_user_input` |
| `extracted_chat_fact` | 9 | `extracted_unconfirmed` |
| `proposal_snapshot` | 2 | `manager_saved` |
| `text_chunk` | 1 | `extracted_unconfirmed` |

Ingestion jobs:

All 5 scenario jobs completed with:

- `status = complete`
- `stage = complete`
- `errorMessage = null`

All 5 RAG sources are attributed to:

`createdByUserId = c0b7ba36-727a-4f29-a000-c8362fcf8a51`

## Captured Facts

The chat flow captured the following facts from manager messages:

- Customer is Orion Klinikum GmbH.
- Project is a dental clinic renovation in Berlin Mitte.
- Preferred start date is 2026-07-15.
- Completion target is 2026-08-09.
- HVAC replacement must happen at night.
- The clinic remains open during the day.
- Sterile-zone access requires ISO 14644 awareness.
- Preferred external workshop is ClinicFit GmbH.
- Project contact is Lena Hoffmann.
- Contact phone is `+49 30 555 0199`.
- Contact email is `lena.hoffmann@orion-klinikum.example`.
- Payment plan is 30 percent deposit, 40 percent after rough-in, and 30 percent after acceptance.
- Existing Siemens fire alarm integration must remain live during renovation.

The uploaded file captured:

- Freight elevator deliveries are only from 06:00 to 08:00.
- Dust containment must be inspected daily.
- Siemens fire alarm vendor must be notified 48 hours before interface work.

The proposal snapshot captured manager-saved draft data:

- project summary
- order title
- order description
- site details
- required skills
- external workshop details
- payment draft details

## Retrieval Behavior

RAG retrieval is scoped by proposal/order. For the scenario, querying:

`What constraints apply to HVAC, sterile access, freight deliveries, and the fire alarm?`

returned relevant chunks from:

- `uploaded_file`
- `proposal_snapshot`
- `chat_fact`

Top retrieved content included:

- freight elevator delivery window
- Siemens fire alarm notice requirement
- night HVAC work
- sterile-zone access requirement
- live fire alarm continuity

When PostgreSQL pgvector is present, retrieval uses:

- `RagChunk.embedding vector(768)`
- cosine distance through pgvector
- HNSW index `RagChunk_embedding_hnsw_idx`

If pgvector is not available, the service falls back to JSON embeddings in `embeddingJson`.

## Playwright E2E Coverage

The Playwright test in `frontend/e2e/ai-intake-rag.spec.ts` validates the same behavior through the real browser UI:

1. Registers a temporary user through the API.
2. Opens `/ai-intake`.
3. Creates an intake from the UI.
4. Fills proposal title and summary.
5. Clicks RAG capture draft.
6. Sends a chat message through the UI composer.
7. Uploads a text file through the hidden RAG file input.
8. Calls RAG API endpoints to verify:
   - `proposal_snapshot` exists
   - `chat_fact` exists
   - `uploaded_file` exists
   - all ingestion jobs are complete
   - chunks have embeddings
   - `/api/rag/query` returns relevant scoped chunks

The E2E server runs the backend with:

`E2E_FAKE_AI=1`

That avoids live Gemini calls while still testing the real browser, API routes, database writes, RAG ingestion, embeddings, and retrieval.

## Current Limitations

- Assistant replies are not currently captured into RAG as facts. Only user messages are captured from chat.
- Chat fact extraction can use the LLM classifier in normal mode or local fallback in error cases.
- Uploaded document ingestion is text-only in this pass.
- The E2E test deletes its temporary proposal after verification, but temporary test users remain unless separately cleaned up.

## Verification Commands

Recently passed:

```powershell
cd D:\work\mini_erp_ai\frontend
npm run e2e
```

```powershell
cd D:\work\mini_erp_ai\backend-python
.\.venv\Scripts\python.exe -m unittest discover tests
```

```powershell
cd D:\work\mini_erp_ai\frontend
npm run build
```

```powershell
cd D:\work\mini_erp_ai
git diff --check
```
