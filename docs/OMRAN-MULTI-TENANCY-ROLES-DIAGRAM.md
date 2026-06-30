# OMRAN Multi-Tenancy And Roles Architecture

This document explains how the current OMRAN system is structured for platform administration, company-level management, normal users, viewer access, and isolated company data.

## 1. High-Level Multi-Tenant Architecture

```mermaid
flowchart TB
    PA[OMRAN Platform Admin]
    Platform[OMRAN Platform Layer]
    TenantA[Company Tenant: OMRAN Demo Company]
    TenantB[Company Tenant: Company B]
    TenantC[Company Tenant: Company C]

    PA --> Platform
    Platform --> TenantA
    Platform --> TenantB
    Platform --> TenantC

    TenantA --> AManager[Company Manager]
    TenantA --> AUser[Normal Company User]
    TenantA --> AViewer[Viewer Mode / Read-Only]

    TenantB --> BManager[Company Manager]
    TenantB --> BUser[Normal Company User]
    TenantB --> BViewer[Viewer Mode / Read-Only]

    TenantC --> CManager[Company Manager]
    TenantC --> CUser[Normal Company User]
    TenantC --> CViewer[Viewer Mode / Read-Only]

    classDef platform fill:#16233a,stroke:#6d8cff,color:#fff;
    classDef tenant fill:#eef6ff,stroke:#4f83ff,color:#0f172a;
    classDef user fill:#f8fafc,stroke:#94a3b8,color:#0f172a;

    class PA,Platform platform;
    class TenantA,TenantB,TenantC tenant;
    class AManager,AUser,AViewer,BManager,BUser,BViewer,CManager,CUser,CViewer user;
```

**Meaning:** OMRAN owns the platform. Each subscribed company is a separate tenant. Company data must stay inside its own tenant and must not appear inside another company account.

## 2. Role Hierarchy And Responsibility

```mermaid
flowchart LR
    PlatformAdmin[Platform Admin<br/>OMRAN internal account]
    CompanyManager[Company Manager<br/>Company admin account]
    CompanyUser[Normal User<br/>Operational account]
    Viewer[Viewer<br/>Read-only exploration]

    PlatformAdmin -->|Creates companies| CompanyManager
    PlatformAdmin -->|Sets user allowance| CompanyManager
    PlatformAdmin -->|Resets manager password| CompanyManager
    PlatformAdmin -->|Manages SaaS billing| CompanyManager

    CompanyManager -->|Creates users within allowance| CompanyUser
    CompanyManager -->|Controls AI permissions| CompanyUser
    CompanyManager -->|Views company audit| CompanyUser
    CompanyManager -->|Can create viewer users| Viewer

    CompanyUser -->|Works inside assigned company only| TenantData[Company Data]
    Viewer -->|Can view limited/read-only areas only| TenantData
```

## 3. Access Control Matrix

| Capability | Platform Admin | Company Manager | Normal User | Viewer |
|---|---:|---:|---:|---:|
| Create subscribed companies | Yes | No | No | No |
| Generate/reset company manager password | Yes | No | No | No |
| Set company user limit | Yes | No | No | No |
| Manage platform SaaS invoices | Yes | No | No | No |
| View platform audit log | Yes | No | No | No |
| Create company users | No | Yes, within limit | No | No |
| Change own password | Yes | Yes | Yes | If registered viewer, yes |
| Manage company invoices | No | Yes | Permission-based | Read-only/no |
| Use AI Intake | No by default | Yes | Permission-based | No |
| Use RAG knowledge | No by default | Yes | Permission-based | No |
| Use AI Monitoring | No by default | Yes | Permission-based | No |
| Add/edit project tracking | No | Yes | Permission-based | No |
| Upload photos | No | Yes | Permission-based | No |
| View company audit log | Company tab only | Own company only | If permitted | No |

## 4. Tenant Data Isolation

```mermaid
flowchart TB
    Login[User Login]
    UserAccount[User Account]
    TenantId[tenantId]

    Login --> UserAccount
    UserAccount --> TenantId

    TenantId --> Customers[Customers]
    TenantId --> Orders[Orders / Projects]
    TenantId --> Sites[Sites]
    TenantId --> Workshops[Workshops]
    TenantId --> Invoices[Company Invoices]
    TenantId --> Payments[Customer Payments]
    TenantId --> AIIntake[AI Intake]
    TenantId --> RAG[RAG Sources]
    TenantId --> Tracking[Tracking / Monitoring]
    TenantId --> Audit[Company Audit Log]

    PlatformAdmin[Platform Admin] --> PlatformData[Platform Data]
    PlatformData --> Tenants[SaaS Tenants]
    PlatformData --> SaaSInvoices[OMRAN SaaS Invoices]
    PlatformData --> PlatformAudit[Platform Audit Log]
```

**Rule:** Company data is filtered by `tenantId`. Platform admin data is separated from company data. Platform audit and company audit should not be mixed.

## 5. Audit Log Isolation

```mermaid
flowchart TB
    Action[System Action]
    Actor[Actor User]
    Resolver[Tenant Resolver]
    AuditRow[Audit Log Row]

    Action --> Actor
    Actor --> Resolver
    Action --> Resolver
    Resolver -->|Platform action| PlatformAudit[Platform Audit<br/>tenantId = null]
    Resolver -->|Company action| CompanyAudit[Company Audit<br/>tenantId = company tenant]

    PlatformAdmin[Platform Admin] --> PlatformAudit
    PlatformAdmin --> CompanyAuditTabs[Company Audit Tabs]
    CompanyAuditTabs --> CompanyAudit

    CompanyManager[Company Manager] --> CompanyAudit
    CompanyUser[Company User] --> CompanyAudit
```

**Meaning:**  
Platform admin can see platform audit and can open a specific company audit tab. Company managers and users only see audit events for their own company.

## 6. Platform Billing Vs Company Billing

```mermaid
flowchart LR
    OMRAN[OMRAN Platform]
    Company[Subscribed Company]
    Customer[Company Customer]

    OMRAN -->|SaaS subscription invoice| SaaSInvoice[Platform SaaS Invoice]
    SaaSInvoice -->|Payment recorded by platform admin| SaaSPayment[SaaS Payment]
    SaaSInvoice --> Company

    Company -->|Construction/project invoice| CustomerInvoice[Company Customer Invoice]
    CustomerInvoice -->|Deposit / partial / final payment| CustomerPayment[Customer Payment]
    CustomerInvoice --> Customer
```

**Two invoice systems exist:**

| Invoice Type | Owner | Receiver | Used For |
|---|---|---|---|
| Platform SaaS invoice | OMRAN | Subscribed company | Subscription, platform usage, SaaS billing |
| Company customer invoice | Company tenant | Customer | Construction work, workshop work, project billing |

## 7. User Creation And Permission Flow

```mermaid
sequenceDiagram
    participant PA as Platform Admin
    participant P as OMRAN Platform
    participant CM as Company Manager
    participant U as Company User
    participant D as Tenant Data

    PA->>P: Create company tenant
    P->>CM: Generate manager email/password
    PA->>P: Set user allowance
    CM->>P: Login and open Account Control
    CM->>U: Create company user/viewer
    CM->>P: Toggle AI permissions
    U->>D: Work only inside assigned tenant
    D->>P: Record tenant-scoped audit log
```

## 8. Recommended Presentation Message

OMRAN uses a multi-tenant SaaS structure. The platform admin controls subscribed companies, company access, and SaaS billing. Each company has its own manager, users, invoices, projects, AI tools, monitoring, RAG memory, and audit log. Tenant isolation keeps every company’s business data separate, while the platform admin can supervise each company through controlled company tabs and platform-level audit records.
