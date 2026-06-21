# Construction ERP - MozaicAI Internship 2026

This is the starter template for the Construction ERP project.

## Team Name

Team-1.

# Mini ERP AI Prototype

Mini ERP AI is a prototype ERP for a renovation/construction company. It combines classic ERP workflows with AI-assisted project intake, proposal generation, staffing recommendations, speech-to-text, and professional PDF exports.

The active stack is:

- `frontend/` - Next.js + React + TypeScript UI (For Now)
- `backend-python/` - FastAPI + SQLAlchemy backend
- PostgreSQL + pgvector for all runtime and test database work
- Gemini / OpenRouter for text AI workflows
- AssemblyAI for speech-to-text
- ReportLab / python-docx for document exports

> The current active backend is `backend-python/`. The old TypeScript `backend/` folder is not the active runtime path.

---

## Main Features

### Core ERP

- Customers, orders, sites, employees, assignments, and work entries
- Invoice drafts, invoice grouping/merging, final invoices, PDF/Word exports
- Timesheet JSON, PDF, and Word exports
- Hour reports and invoice sequence settings
- Strict business rules around deleting or changing referenced records

### AI Intake

- Chat-based intake for new construction/renovation projects
- Multilingual behavior with Arabic, German, and English support
- Hidden per-intake facts/memory so project facts stay isolated per chat
- Hidden construction-domain checklist for renovation scope guidance
- Scope-first behavior: if project basics exist but work scope is missing, the assistant asks only for work areas and work types first
- Anti-hallucination rules for numbers, dates, phone numbers, payment methods, materials, and workshops
- Clear messages / clear fields / new intake controls for resetting the intake flow

### Proposal Generation

- Generates structured proposal drafts from the AI Intake conversation
- Preserves customer, contact, dates, sites/work packages, skills, workshops, payment drafts, and notes
- Keeps unknown fields as missing / needs confirmation instead of inventing details
- Proposal fields stay editable before confirmation
- Generates a professional proposal PDF with:
  - project overview cards
  - customer and project data
  - summary block
  - scope matrix
  - detailed site/work-package sections
  - external workshop table
  - commercial/payment summary
  - staffing section
  - Arabic text support

### Employee Recommendation

- Hybrid staffing around workshop usage
- Manager decides whether a site is internal-only, workshop-only, or mixed
- Workshop-covered skills are subtracted from internal employee matching
- AI-recommended internal headcount is calculated by the backend from scope, hours, schedule, skills, and workshop coverage
-   AI-explain its decision why this number of suggested employees is recommended
- Manager-selected internal headcount remains separate from the calculated recommendation
- UI auto-checks the top ranked employees based on the selected internal headcount
- Workshop-only sites can be confirmed with zero internal employees
- Recommendation uses deterministic factors:
  - skills and certifications
  - availability blocks
  - remaining weekly capacity
  - recent work history

### Voice-to-Text

- AI Intake supports voice recording and transcription
- Browser speech can be used when available
- Native audio upload uses AssemblyAI when configured
- Debug information is shown for audio duration, peak, provider, and transcription issues

---

## Architecture

The system follows a layered client-server architecture implemented as a modular monolith with external AI service integrations.

```mermaid
flowchart LR
    U[Manager / Browser] --> F[Next.js Frontend]
    F -->|REST /api/*| B[FastAPI Backend]
    B --> S[Business Services]
    S --> DB[(PostgreSQL + pgvector)]
    S --> AI[Gemini / OpenRouter]
    S --> STT[AssemblyAI]
    S --> DOC[PDF and Word Services]
```

Layers:

- Presentation layer: Next.js UI, AI Intake page, proposal editing, staffing selection, voice controls
- API/application layer: FastAPI routers for ERP, invoices, AI, and documents
- Business logic layer: proposal extraction, staffing recommendation, PDF generation, transcription integration
- Persistence layer: SQLAlchemy models on PostgreSQL
- External AI integration layer: Gemini/OpenRouter for text, AssemblyAI for speech-to-text

---

## Local Development Without Docker

### Backend

Requirements:

- Python 3.12+
- PostgreSQL 16+ with pgvector

```powershell
cd backend-python
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 3001
```

For local development outside Docker, run PostgreSQL locally and set:

```env
DATABASE_URL=postgresql://omran:change-me-local@localhost:5432/omran
```

Default backend URL:

- `http://localhost:3001`
- health check: `http://localhost:3001/api/health`

### Frontend

Requirements:

- Node.js 20+
- npm

```powershell
cd frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Default frontend URL:

- `http://localhost:3000`

---

## Local Development With Docker

Use the Python backend compose file. This starts PostgreSQL, the FastAPI backend, and the Next.js frontend:

```powershell
$env:POSTGRES_PASSWORD="choose-a-real-password"
docker compose -f docker-compose.python.yml up --build
```

Default URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

Expected health response includes the active database type:

```json
{ "ok": true, "database": "postgresql" }
```

Reset Docker data:

```powershell
docker compose -f docker-compose.python.yml down -v
```

Do not use the default `docker-compose.yml` for the current AI prototype unless you intentionally want the legacy backend configuration.

---

## Environment Variables

Backend (`backend-python/.env`):

```env
DATABASE_URL=postgresql://omran:change-me-local@localhost:5432/omran
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
ASSEMBLYAI_API_KEY=
```

Frontend (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001/api
NEXT_PUBLIC_SHOW_AI_FACTS=false
```

Notes:

- Keep `.env` and `.env.local` out of Git.
- `NEXT_PUBLIC_SHOW_AI_FACTS=true` is only for debugging hidden intake facts.
- Text AI can use Gemini directly or OpenRouter fallback depending on configured keys.
- Voice transcription requires `ASSEMBLYAI_API_KEY` for AssemblyAI mode.

---

## Important API Areas

Core ERP:

- `/api/customers`
- `/api/employees`
- `/api/orders`
- `/api/sites`
- `/api/assignments`
- `/api/work-entries`
- `/api/reports/hours`

Invoices and documents:

- `/api/invoices`
- `/api/invoices/drafts/groups`
- `/api/invoices/merge`
- `/api/invoices/{id}/pdf`
- `/api/invoices/{id}/word`
- `/api/timesheets/pdf`
- `/api/timesheets/word`

AI:

- `/api/ai/work-summary`
- `/api/ai/intakes`
- `/api/ai/intakes/{id}/messages/stream`
- `/api/ai/intakes/{id}/messages/transcribe`
- `/api/ai/intakes/{id}/proposal`
- `/api/ai/intakes/{id}/pdf`
- `/api/ai/intakes/{id}/recommend-assignments`
- `/api/ai/intakes/{id}/recommend-assignments/{site_index}/explain/stream`
- `/api/ai/intakes/{id}/confirm`

---

## AI Intake Flow

Typical manager flow:

1. Create a new AI Intake.
2. Enter or record the client/project conversation.
3. The assistant asks targeted follow-up questions.
4. Generate the proposal draft.
5. Review/edit customer, site, payment, workshop, and staffing fields.
6. Generate proposal PDF if needed.
7. Calculate employee recommendations.
8. Adjust selected employees and coverage mode.
9. Confirm to create real ERP records.

Important behavior:

- Raw facts are hidden from normal users to avoid confusion.
- The assistant should not expose the full construction checklist.
- The manager remains responsible for final approval.
- Final conversion into customer/order/site/assignment records is deterministic backend logic.

---

## Testing

Backend tests:

```powershell
cd backend-python
.venv\Scripts\python.exe -m unittest discover tests
```

Frontend build check:

```powershell
cd frontend
npm run build
```

Recently verified areas include:

- AI Intake chat prompt rules
- proposal extraction and hidden construction guidance
- speech transcription error handling
- hybrid workshop/internal employee recommendation
- recommendation explanation context
- professional proposal PDF generation with Arabic support

---

## Current Constraints

- Prototype is single-tenant.
- Login, backend endpoint protection, and audit logs are implemented. Role-based permissions still need production hardening.
- AI is assistive, not authoritative.
- Progress tracking with photos, OCR, OCR + RAG, and Progress Monitoring AI are planned ideas, not fully implemented.
- PostgreSQL is the only supported database runtime.

---

## Repository Notes

-  `.env`, `.env.local`, API keys, or real customer secrets NOT commited.
- The current active backend is `backend-python/`.
- The most active prototype screen is `frontend/src/app/ai-intake/page.tsx`.
- AI services live mainly under `backend-python/app/services/`.
- Proposal PDF generation lives in `backend-python/app/services/proposal_documents.py`.
