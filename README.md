# Construction ERP - MozaicAI Internship 2026

Construction ERP for team development and testing. The default Docker Compose file runs the current Python backend, PostgreSQL, and frontend.

For a fresh checkout, follow the [team Docker setup guide](docs/DOCKER-TEAM-SETUP.md). Docker installs the Python and Node dependencies during the build; host Python and Node installations are optional for local development.

## Team Name

Team-1.

# Mini ERP AI Prototype

Mini ERP AI is a prototype ERP for a renovation/construction company. It combines classic ERP workflows with AI-assisted project intake, proposal generation, staffing recommendations, speech-to-text, and professional PDF exports.

The active stack is:

- `frontend/` - Next.js + React + TypeScript UI (For Now)
- `backend-python/` - FastAPI + SQLAlchemy backend
- PostgreSQL for Docker/deployment runtime; SQLite only as a local/test fallback
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
    S --> DB[(PostgreSQL runtime / SQLite local fallback)]
    S --> AI[Gemini / OpenRouter]
    S --> STT[AssemblyAI]
    S --> DOC[PDF and Word Services]
```

Layers:

- Presentation layer: Next.js UI, AI Intake page, proposal editing, staffing selection, voice controls
- API/application layer: FastAPI routers for ERP, invoices, AI, and documents
- Business logic layer: proposal extraction, staffing recommendation, PDF generation, transcription integration
- Persistence layer: SQLAlchemy models on PostgreSQL, with SQLite fallback for local/test runs
- External AI integration layer: Gemini/OpenRouter for text, AssemblyAI for speech-to-text

---

## Local Development Without Docker

### Backend

Requirements:

- Python 3.12+
- SQLite is used automatically if `DATABASE_URL` is not changed from the local default

```powershell
cd backend-python
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 3001
```

Before the first login, open another terminal in `backend-python`, activate the same environment, and provision the first platform administrator:

```powershell
python -m app.bootstrap --email admin@example.com
```

The command prompts for a password of 12-128 characters with uppercase, lowercase, a number and a special character. It refuses to create another administrator once one exists. No default administrator password is installed. Sign in with this account, create a company in the platform dashboard, then sign in with that company's manager account and complete Company setup, including its invoice/payment details.

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

## Run the Full Project With Docker

The root Compose file builds and starts PostgreSQL with pgvector, the FastAPI backend, and the production Next.js frontend.

For a new checkout, create the local Docker environment file, set a strong letters-and-numbers `POSTGRES_PASSWORD`, and add any AI provider keys you use. Compose refuses to start without a database password. Keep an existing deployment's `.env` and database credentials unchanged:

```powershell
Copy-Item docker-compose.env.template .env
```

Build and start the complete application:

```powershell
docker compose up --build -d
```

On a new deployment, create the first administrator interactively after the backend is healthy:

```powershell
docker compose exec backend python -m app.bootstrap --email admin@example.com
```

Public registration remains disabled by default. To populate a disposable local demo, explicitly set `ENABLE_DEMO_SEED=true` in `.env`; demo data is only inserted when missing and does not overwrite existing company/account settings. Do not enable demo accounts on a public deployment.

Check container health and view backend/frontend logs:

```powershell
docker compose ps
docker compose logs -f backend frontend
```

Default URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

Expected health response includes the active database type:

```json
{ "ok": true, "database": "postgresql" }
```

Stop the application while preserving PostgreSQL data, uploads, backups, and logs:

```powershell
docker compose down
```

Do not add `-v` when stopping a deployment whose data you need. That option permanently removes its Docker volumes. Fresh clones use their own empty database; cloning this repository does not copy existing company records or accounts.

`docker-compose.python.yml` remains available as a compatibility alias and uses the same service configuration.

For a remote server, set `FRONTEND_ORIGIN` and `NEXT_PUBLIC_API_BASE` to browser-accessible HTTPS addresses before building. Also set `SESSION_COOKIE_SECURE=true` when HTTPS is enabled.

---

## Environment Variables

Backend (`backend-python/.env`):

```env
DATABASE_URL=postgresql://omran:change-me-local@localhost:5432/omran
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
ASSEMBLYAI_API_KEY=
```

Local-only SQLite fallback:

```env
DATABASE_URL=sqlite:///./app.db
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

Browser workflow check (from `frontend`):

```powershell
npx playwright install chromium
$env:E2E_BACKEND_PYTHON = (Resolve-Path ..\backend-python\.venv\Scripts\python.exe).Path
npm run e2e
```

The browser test uses a dedicated `backend-python/e2e.db`, fake AI, and public registration enabled only for its test backend. Its API calls and browser share the same HttpOnly session cookie. On Linux/macOS, set `E2E_BACKEND_PYTHON` to the virtual environment's `bin/python` path instead.

Invoice exports use the issuing company's profile and optional tax/bank fields from Company setup; exporting is blocked with a clear message until the required company profile is complete. Docker installs DejaVu fonts for Arabic proposal PDFs. For other operating systems, install DejaVu or set `PROPOSAL_FONT_DIR` to a directory containing `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`.

Recently verified areas include:

- AI Intake chat prompt rules
- proposal extraction and hidden construction guidance
- speech transcription error handling
- hybrid workshop/internal employee recommendation
- recommendation explanation context
- professional proposal PDF generation with Arabic support

---

## Current Constraints

- Company data is scoped by tenant. Create a separate account for each teammate and review role permissions for your deployment.
- Login, backend endpoint protection, and audit logs are implemented. Role-based permissions still need production hardening.
- AI is assistive, not authoritative.
- Progress tracking with photos, OCR, OCR + RAG, and Progress Monitoring AI are planned ideas, not fully implemented.
- Docker/deployment should use PostgreSQL. SQLite is only for local demos and automated tests.

---

## Repository Notes

-  `.env`, `.env.local`, API keys, or real customer secrets NOT commited.
- The current active backend is `backend-python/`.
- The most active prototype screen is `frontend/src/app/ai-intake/page.tsx`.
- AI services live mainly under `backend-python/app/services/`.
- Proposal PDF generation lives in `backend-python/app/services/proposal_documents.py`.
