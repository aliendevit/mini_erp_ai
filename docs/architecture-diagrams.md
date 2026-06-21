# Architecture Diagrams - Mini ERP

This file provides a cleaner Mermaid diagram set for the current active system.

## 1. System Context

```mermaid
flowchart LR
    Manager[Manager / Office User]
    Browser[Browser]
    Frontend[Next.js Frontend]
    Backend[FastAPI Backend]
    DB[(PostgreSQL + pgvector)]
    Gemini[Gemini API]
    Docs[PDF / Word Generators]

    Manager --> Browser
    Browser --> Frontend
    Frontend -->|REST /api/*| Backend
    Backend --> DB
    Backend --> Gemini
    Backend --> Docs
```

## 2. Container View

```mermaid
flowchart TB
    subgraph Client
        A[Next.js UI Pages]
        B[api.ts REST Client]
    end

    subgraph Server["FastAPI Monolith (backend-python)"]
        C[main.py]
        D[core router]
        E[invoices router]
        F[ai router]
        G[services]
        H[SQLAlchemy ORM]
    end

    subgraph Persistence
        I[(PostgreSQL)]
    end

    subgraph External
        K[Gemini API]
        L[ReportLab / python-docx]
    end

    A --> B
    B --> C
    C --> D
    C --> E
    C --> F
    D --> G
    E --> G
    F --> G
    G --> H
    H --> I
    F --> K
    E --> L
    D --> L
```

## 3. Backend Component View

```mermaid
flowchart LR
    Main[FastAPI app main.py]
    Core[core.py]
    Invoices[invoices.py]
    AI[ai.py]

    Utils[utils.py]
    Schemas[schemas.py]
    Models[models.py]
    Database[database.py]

    ProposalSvc[proposals.py]
    StaffingSvc[staffing.py]
    GeminiSvc[gemini_client.py]
    InvoiceDocs[invoice_documents.py]
    TimesheetDocs[timesheet_documents.py]
    Reports[ai_summary.py / timesheets.py / invoice_totals.py]

    Main --> Core
    Main --> Invoices
    Main --> AI

    Core --> Schemas
    Core --> Utils
    Core --> Models
    Core --> Database
    Core --> TimesheetDocs
    Core --> Reports

    Invoices --> Schemas
    Invoices --> Utils
    Invoices --> Models
    Invoices --> Database
    Invoices --> InvoiceDocs
    Invoices --> Reports

    AI --> Schemas
    AI --> Utils
    AI --> Models
    AI --> Database
    AI --> ProposalSvc
    AI --> StaffingSvc
    AI --> GeminiSvc
```

## 4. Core Business Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as FastAPI
    participant ORM as SQLAlchemy
    participant DB as Database

    UI->>API: CRUD request
    API->>API: Pydantic validation
    API->>ORM: load / mutate entities
    ORM->>DB: SQL statements
    DB-->>ORM: persisted rows
    ORM-->>API: model objects
    API-->>UI: normalized JSON response
```

## 5. Work Entry to Draft Invoice Flow

```mermaid
sequenceDiagram
    participant User as Manager
    participant UI as Work Entry Page
    participant API as core.py
    participant DB as Database
    participant INV as Draft Invoice Logic

    User->>UI: enter work entry
    UI->>API: POST /api/work-entries
    API->>DB: validate order/site/employee
    API->>DB: insert WorkEntry
    API->>INV: compute billable status + rate
    INV->>DB: create or reuse draft Invoice
    INV->>DB: insert InvoiceLine
    API-->>UI: workEntry + invoice info
```

## 6. Invoice Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Final: merge/finalize
    Final --> Sent: status update
    Sent --> Paid: status update
    Final --> Canceled: status update
    Sent --> Canceled: status update
```

## 7. AI Intake Flow

```mermaid
sequenceDiagram
    participant M as Manager
    participant UI as AI Intake Page
    participant API as ai.py
    participant Proposal as proposals.py
    participant Gemini as Gemini API
    participant Staff as staffing.py
    participant DB as Database

    M->>UI: send project description
    UI->>API: POST /ai/intakes/{id}/messages/stream
    API->>DB: save manager message
    API->>Proposal: build intake prompt
    Proposal->>Gemini: stream chat completion
    Gemini-->>UI: streamed assistant text
    API->>DB: save assistant message

    UI->>API: POST /ai/intakes/{id}/proposal
    API->>Proposal: extract structured proposal
    Proposal->>Gemini: JSON extraction prompt
    Gemini-->>Proposal: proposal JSON
    Proposal->>DB: save Proposal draft

    UI->>API: POST /ai/intakes/{id}/recommend-assignments
    API->>Staff: compute ranked employees
    Staff->>DB: load employees, skills, availability, work history
    Staff-->>API: site recommendations + price preview
    API->>DB: persist recommendedTeam snapshot

    UI->>API: POST /ai/intakes/{id}/confirm
    API->>DB: create customer/order/site/assignments
    API-->>UI: confirmed ERP records
```

## 8. Domain Relationships

```mermaid
erDiagram
    Customer ||--o{ Order : owns
    Customer ||--o{ Invoice : billed_to
    Order ||--o{ Site : contains
    Order ||--o{ WorkEntry : logs
    Site ||--o{ WorkEntry : logs
    Site ||--o{ EmployeeAssignment : plans
    Employee ||--o{ EmployeeAssignment : assigned_to
    Employee ||--o{ WorkEntry : performs
    Employee ||--o{ EmployeeSkill : has
    Employee ||--o{ EmployeeAvailabilityBlock : blocked_by
    Invoice ||--o{ InvoiceLine : contains
    WorkEntry ||--o{ InvoiceLine : billed_as
    Proposal ||--o{ ProposalMessage : stores
```

## 9. Staffing Decision Model

```mermaid
flowchart TD
    A[Proposal site requirements]
    B[Load active employees]
    C[Filter availability overlap]
    D[Compute remaining capacity]
    E[Match skills / certifications]
    F[Compute recent-history signal]
    G[Weighted score]
    H[Rank employees per site]
    I[Frontend preselects top candidate]

    A --> B --> C --> D --> E --> F --> G --> H --> I
```
