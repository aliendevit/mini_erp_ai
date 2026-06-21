# Python backend

This folder contains a FastAPI-based backend that mirrors the existing TypeScript API shape closely enough for phased migration.

What is included:

- Core CRUD routes for customers, employees, orders, sites, assignments, work entries
- Invoice list/detail/update/delete and draft merge/grouping logic
- Timesheet JSON endpoint
- Timesheet PDF and Word exports
- Invoice PDF and Word exports
- Reporting endpoint for hour aggregation
- Invoice sequence settings endpoint
- An AI-ready endpoint for work-entry summaries
- AI intake workflow for Gemini-backed proposal drafting and staffing recommendations

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3001
```

Required environment:

- `DATABASE_URL=postgresql://omran:change-me-local@localhost:5432/omran`
- `CORS_ORIGIN=http://localhost:3000`
- `GEMINI_API_KEY=...`
- `GEMINI_MODEL=gemini-2.5-flash`

Docker/deployment should use PostgreSQL. The app automatically rewrites `postgresql://` to SQLAlchemy's `postgresql+pg8000://`.

## Run without Docker

You can run the project outside Docker, but PostgreSQL is still required. Start PostgreSQL locally and set `DATABASE_URL` to the PostgreSQL connection string.

Backend prerequisites:

- Python 3.12+

Frontend prerequisites:

- Node.js 20+
- npm

Recommended setup on Windows PowerShell:

```powershell
cd backend-python
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 3001
```

In a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Then open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:3001/api/health`

## PostgreSQL and backups

The Docker compose file starts PostgreSQL and passes a PostgreSQL `DATABASE_URL` to the backend. Configure these values before real deployment:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_PORT`

Backup and restore are PostgreSQL-only:

- PostgreSQL backups use `pg_dump` and restore with `pg_restore`.
- Uploaded files are included in `uploads.zip`.

The backend Docker image installs `postgresql-client` so UI backup/restore works against PostgreSQL inside Docker. If you run backup scripts outside Docker, install PostgreSQL client tools on that machine first.

## Why this layout helps AI

FastAPI plus SQLAlchemy gives you a clean place to add:

- LLM endpoints
- retrieval or embeddings services
- OCR / document parsing jobs
- background workers for invoice automation

AI endpoints now include:

- `/api/ai/work-summary`
- `/api/ai/intakes`
- `/api/ai/intakes/{id}/messages/stream`
- `/api/ai/intakes/{id}/proposal`
- `/api/ai/intakes/{id}/recommend-assignments`
- `/api/ai/intakes/{id}/confirm`
