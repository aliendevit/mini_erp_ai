# System Architecture

## Architecture Statement

The system follows a layered client-server architecture implemented as a modular monolith with integrated AI services.

It keeps the prototype simple enough to develop quickly, while still separating UI, API routing, business logic, persistence, document generation, and external AI integrations.

## High-Level Diagram

```text
Next.js / React UI
        |
        v
FastAPI REST API
        |
        +--> Business services
        |       - AI intake and prompt orchestration
        |       - Proposal extraction and confirmation
        |       - Workshop planning and assignment rules
        |       - Project tracking and monitoring rules
        |       - Invoice and PDF/Word document generation
        |
        +--> SQLAlchemy models
        |       - SQLite in prototype
        |
        +--> Local file storage
        |       - Uploaded project photos and generated documents
        |
        +--> External AI providers
                - Gemini / OpenRouter for text intelligence
                - AssemblyAI for speech-to-text
```

## Main Layers

### 1. Presentation Layer

Location: `frontend/src/app`

Technology:

- Next.js
- React
- TypeScript
- CSS-based responsive UI

Responsibilities:

- Dashboard and navigation.
- AI Intake chat and proposal review.
- Customer, order, site, workshop, invoice, tracking, and monitoring pages.
- Mobile-friendly layout direction.
- Theme and language switching.

### 2. Application/API Layer

Location: `backend-python/app/routers`

Technology:

- FastAPI
- Pydantic schemas
- REST endpoints

Responsibilities:

- Expose API endpoints to the frontend.
- Validate request payloads.
- Coordinate database operations and service calls.
- Keep the frontend away from AI provider keys and backend secrets.

Main routers:

- `ai.py`: AI intake, chat, proposal generation, transcription, AI assignment/explanation endpoints.
- `core.py`: customers, orders, sites, workshops, tracking, monitoring, reports, payments.
- `invoices.py`: draft invoices, invoice merging, invoice documents, invoice exports.

### 3. Business Logic Layer

Location: `backend-python/app/services`

Responsibilities:

- Build AI prompts and summarize tracking context.
- Generate proposal documents and invoice documents.
- Run deterministic tracking and monitoring calculations.
- Integrate with AssemblyAI and text AI providers.
- Keep official calculations rule-based when correctness matters.

Important services:

- `ai_summary.py`
- `gemini_client.py`
- `assemblyai_client.py`
- `proposals.py`
- `proposal_documents.py`
- `tracking_ai.py`
- `invoice_documents.py`
- `timesheets.py` and legacy employee services

### 4. Persistence Layer

Location:

- `backend-python/app/models.py`
- `backend-python/app/database.py`

Technology:

- SQLAlchemy ORM
- SQLite for prototype storage

Main data areas:

- Customers and orders.
- Sites / work packages.
- Workshop partners and site workshop assignments.
- AI intake drafts, messages, and facts.
- Tracking updates, photos, tasks, issues, materials, baselines, monitoring reports, and alerts.
- Invoices, invoice lines, payments, and sequences.

### 5. External AI Integration Layer

External providers are called only from the backend.
The frontend never needs AI API keys.

Used providers:

- Gemini / OpenRouter: chat, proposal generation, analysis text.
- AssemblyAI: voice-to-text transcription.

## Core Product Flows

### AI Intake To Order

```text
Manager chat input or voice note
        -> AI intake message
        -> extracted draft facts
        -> proposal generation
        -> site/work package review
        -> workshop review/assignment
        -> order confirmation
```

### Project Tracking To AI Monitoring

```text
Manual tracking data
        -> tasks, weights, issues, materials, photos, workshop schedules
        -> confirmed baseline schedule
        -> backend progress and delay calculations
        -> AI monitoring explanation
        -> manager actions
```

### Invoicing

```text
Order / site data
        -> draft or manual invoice lines
        -> invoice review
        -> PDF / Word export
        -> payment tracking
```

## Design Boundaries

- AI assists the manager; it does not make final business decisions.
- Official delay and progress calculations are deterministic backend values.
- AI monitoring explains backend values and missing information instead of inventing numbers.
- Workshop execution is site-level and schedule-aware, but not a full subcontractor payroll or capacity scheduler.
- Employee modules are legacy compatibility areas and are not the main visible product direction.
