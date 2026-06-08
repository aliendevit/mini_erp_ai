# Developer Guide

## Repository Layout

```text
simple-accounting-v2-fk-strict/
  backend-python/
    app/
      routers/
      services/
      models.py
      schemas.py
      database.py
      main.py
    tests/
    scripts/
  frontend/
    src/app/
    src/lib/
    public/
  docs/
```

## Backend Setup

From the project root:

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001
```

Backend local URL:

```text
http://localhost:3001
```

Swagger/OpenAPI is available in local FastAPI development mode.

## Frontend Setup

From the project root:

```powershell
cd frontend
npm run dev
```

Frontend local URL is typically:

```text
http://localhost:3000
```

## Environment Variables

Backend environment file:

```text
backend-python/.env
```

Frontend local environment file:

```text
frontend/.env.local
```

Important rule:

Do not commit real `.env`, `.env.local`, or API keys.

Common backend variables:

```text
DATABASE_URL=sqlite:///./app.db
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=...
GEMINI_MODEL=...
ASSEMBLYAI_API_KEY=...
ASSEMBLYAI_API_BASE=https://api.assemblyai.com
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
OPENROUTER_API_BASE=https://openrouter.ai/api/v1
```

## Running Tests

Backend tests:

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m unittest discover tests
```

Frontend build check:

```powershell
cd frontend
npm run build
```

## Development Rules

### Backend

- Keep request/response contracts in `schemas.py`.
- Keep database entities in `models.py`.
- Keep route orchestration in `routers/`.
- Put reusable business logic in `services/`.
- Keep AI provider calls isolated in provider service files.
- Do not place provider keys in frontend code.

### Frontend

- Keep pages under `frontend/src/app`.
- Keep shared UI under `frontend/src/app/ui` when possible.
- Keep translations/messages in `frontend/src/lib/messages.ts`.
- Ensure Arabic UI remains readable and RTL-aware.
- Avoid rendering very large lists without pagination/collapse.

### Documentation

- New feature documentation belongs in `docs/`.
- API behavior should be reflected in `docs/api-reference.md`.
- Architecture changes should be reflected in `docs/architecture.md`.
- AI behavior changes should be reflected in `docs/ai-features.md`.
- user-guide should be reflected in `docs/user-guide/user-guide.md`.


## Main Feature Areas

### AI Intake

Frontend:

```text
frontend/src/app/ai-intake/page.tsx
```

Backend:

```text
backend-python/app/routers/ai.py
```

### Project Tracking

Frontend:

```text
frontend/src/app/orders/[id]/tracking
```

Backend:

```text
backend-python/app/routers/core.py
```

### AI Monitoring

Frontend:

```text
frontend/src/app/orders/[id]/monitoring
frontend/src/app/monitoring
```

Backend:

```text
backend-python/app/services/tracking_ai.py
backend-python/app/routers/core.py
```

### Workshops

Frontend:

```text
frontend/src/app/workshops
```

Backend:

```text
backend-python/app/models.py
backend-python/app/routers/core.py
```

### Invoices

Frontend:

```text
frontend/src/app/invoices
frontend/src/app/invoices/[id]
```

Backend:

```text
backend-python/app/routers/invoices.py
backend-python/app/services/invoice_documents.py
```

## Git Hygiene

Before committing:

```powershell
git status --short
```

Do not stage:

- `.env`
- `.env.local`
- real secrets
- temporary build output
- unrelated local IDE files

Recommended checks before push:

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m unittest discover tests

cd ..\frontend
npm run build
```
