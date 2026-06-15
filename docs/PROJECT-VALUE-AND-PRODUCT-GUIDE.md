# OMRAN ERP — Complete Project Value & Product Guide

**Document purpose:** A single, detailed reference for what this project is, who it serves, what value it delivers, and how managers use it — without technical backend or frontend implementation details.

**Last updated:** June 2026  
**Project context:** MozaicAI Internship 2026 — Construction ERP  
**Team:** Team-1  
**Product name:** OMRAN ERP (also referred to as Mini ERP AI)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Identity](#2-project-identity)
3. [Product Vision & Mission](#3-product-vision--mission)
4. [Who This Product Is For](#4-who-this-product-is-for)
5. [Core Value Proposition](#5-core-value-proposition)
6. [Problems the Product Solves](#6-problems-the-product-solves)
7. [Complete Feature Catalog](#7-complete-feature-catalog)
8. [End-to-End Business Workflow](#8-end-to-end-business-workflow)
9. [AI Features — Business Value](#9-ai-features--business-value)
10. [Workshop-Based Execution Model](#10-workshop-based-execution-model)
11. [Project Tracking — Business Value](#11-project-tracking--business-value)
12. [AI Monitoring — Business Value](#12-ai-monitoring--business-value)
13. [Invoicing & Financial Management](#13-invoicing--financial-management)
14. [Multilingual & Accessibility Value](#14-multilingual--accessibility-value)
15. [User Experience & Interface Value](#15-user-experience--interface-value)
16. [Business Rules & Manager Governance](#16-business-rules--manager-governance)
17. [Information the System Manages](#17-information-the-system-manages)
18. [Manager Daily Workflow](#18-manager-daily-workflow)
19. [Feature Status Matrix](#19-feature-status-matrix)
20. [Achievements & Milestones](#20-achievements--milestones)
21. [Current Limitations](#21-current-limitations)
22. [Release Readiness — Business View](#22-release-readiness--business-view)
23. [Planned Future Features](#23-planned-future-features)
24. [Best Practices for Managers](#24-best-practices-for-managers)
25. [Common Situations & Solutions](#25-common-situations--solutions)
26. [Recommended Rollout Path](#26-recommended-rollout-path)

---

## 1. Executive Summary

OMRAN ERP is an **AI-powered construction and renovation project management system** designed for companies that coordinate multiple work sites, external workshops (subcontractors), customer relationships, proposals, execution tracking, and invoicing.

The product brings together:

- **AI-assisted project intake** — turn informal conversations (text or voice) into structured project requirements
- **Proposal generation** — convert intake data into reviewable proposals and professional PDF documents
- **Workshop coordination** — assign external trades to each work site with schedule conflict protection
- **Execution tracking** — document progress through photos, tasks, issues, materials, and timelines
- **AI monitoring** — explain project health, delays, risks, and recommended next actions
- **Invoicing** — create, manage, and export invoices tied to projects and work

**Core business value in one sentence:**  
Faster project setup, clearer coordination across sites and workshops, and earlier visibility of execution problems — while keeping the manager in full control of every final decision.

**Current maturity:** A functional, integrated prototype suitable for demonstrations and controlled internal or customer pilots. Not yet ready for full production use without additional security, access control, and operational safeguards.

---

## 2. Project Identity

| Attribute | Detail |
| --- | --- |
| **Official product name** | OMRAN ERP |
| **Alternative name** | Mini ERP AI |
| **Program** | MozaicAI Internship 2026 |
| **Team** | Team-1 |
| **Industry focus** | Construction, renovation, and building trades |
| **Geographic / language focus** | Multilingual — Arabic, German, and English as first-class languages |
| **Business model** | Single-company ERP (one renovation/construction business) |
| **Execution model** | External workshops and subcontractors (not internal employee staffing as the primary flow) |
| **AI role** | Assistive — helps collect, organize, explain, and recommend; does not replace manager approval |

---

## 3. Product Vision & Mission

### Vision

**From project request to controlled execution** — in one clear management workspace.

### Mission

- Centralize customers, orders, sites, workshops, invoices, and project details in one place
- Convert natural manager–client conversations into structured, reviewable project proposals
- Give managers clear visibility into execution progress, risks, and next actions
- Reduce repetitive administration while preserving manager authority over all official decisions

### Strategic product direction

The system evolved from a basic accounting/ERP prototype into a **construction-oriented management platform** where:

1. Projects start through conversation, not rigid forms
2. Execution is planned around **workshops** (external specialists), not internal staffing
3. Progress is tracked with real site evidence (photos, tasks, issues)
4. AI explains what the data means — it does not invent official numbers

---

## 4. Who This Product Is For

### Primary user: The Project Manager

The manager is responsible for:

- Registering new renovation/construction projects
- Reviewing and approving AI-generated proposals
- Selecting and scheduling workshops per site
- Tracking day-to-day execution
- Responding to delays, blockers, and material issues
- Reviewing project health through AI Monitoring
- Managing invoices and payment records

### Secondary stakeholders (indirect beneficiaries)

| Stakeholder | How they benefit |
| --- | --- |
| **Company owner / leadership** | Earlier risk visibility, standardized project records, exportable proposals and invoices |
| **Workshop partners** | Clear site assignments, defined trades, visible schedules |
| **Customers / clients** | Faster, more complete proposals; better-documented project scope |
| **Operations staff** | Structured task lists, material tracking, photo documentation |
| **Finance / billing** | Invoice drafts, grouping, merging, PDF/Word exports |

### Typical company profile

- Renovation or construction business (example context: German renovation company)
- Multiple simultaneous projects with several work areas per project
- Reliance on external workshops for specialized trades (tiling, plumbing, electrical, painting, waterproofing, etc.)
- Need to support Arabic-speaking clients and managers alongside German and English

---

## 5. Core Value Proposition

### Speed

| Before (typical manual process) | With OMRAN |
| --- | --- |
| Manager writes notes, re-types into forms | Manager speaks or chats; AI structures the input |
| Proposal built manually in Word/Excel | Proposal draft generated from conversation, editable before approval |
| Progress scattered across calls, messages, photos | Central tracking with timeline, tasks, and warnings |

### Clarity

- Each project has defined **sites** (work areas) with scope, workshops, and schedules
- **Warnings** surface overdue tasks, missing schedules, blocked sites, and workshop conflicts
- **AI Monitoring** translates raw tracking data into plain-language health summaries

### Control

- AI suggests and organizes — **the manager approves**
- Unknown information stays marked as *missing* or *needs confirmation* — never silently invented
- Official progress, delay, and financial values are calculated by the system and explained by AI — not fabricated by AI

### Coordination

- Workshop assignments per site with overlap prevention on the same site
- Materials, tasks, and issues linked to specific work areas
- One dashboard connects intake → proposal → order → tracking → monitoring → invoice

---

## 6. Problems the Product Solves

| Business problem | How OMRAN addresses it |
| --- | --- |
| **Incomplete project intake** | AI asks targeted follow-up questions based on construction-domain knowledge |
| **Lost context between sales and execution** | Intake conversation becomes structured proposal, then official order |
| **Unclear scope per room/area** | Sites/work packages with trade requirements and workshop needs |
| **Workshop scheduling conflicts** | System rejects overlapping workshop schedules on the same site |
| **No single view of project health** | Tracking dashboard + smart warnings + AI Monitoring |
| **Late discovery of delays** | Planned vs actual progress comparison, delay status, predicted finish |
| **Administrative repetition** | Voice-to-text, proposal PDF, invoice exports reduce manual document work |
| **Language barriers** | Arabic, German, and English support in UI and AI conversation |
| **Informal decisions without records** | Tasks, issues, materials, photos, and baselines create an audit trail of execution |

---

## 7. Complete Feature Catalog

### 7.1 Dashboard & Executive Workspace

**What it does:** Provides a single entry point for the manager's daily operations.

**Value delivered:**

- Quick access to AI Intake, Orders, Workshops, Tracking, Monitoring, and Invoices
- Clear visualization of the main workflow: Intake → Workshops → Tracking → Monitoring
- Billing setup access for invoice sequence management
- Multilingual labels (Arabic, German, English)

---

### 7.2 Customer Management

**What it does:** Stores company and contact master data for all projects and invoices.

**Information captured:**

- Company name
- Contact person
- Address and location
- Phone and email
- Relationship to orders and invoices

**Value delivered:** One customer record reused across multiple projects and billing documents.

---

### 7.3 Order / Project Management

**What it does:** Container for an entire customer project.

**Information captured:**

- Linked customer
- Project title and description
- Start and end dates
- Multiple work sites
- Workshop assignments
- Connection to tracking, monitoring, and invoices

**Value delivered:** Every active renovation project has a single official record from proposal confirmation onward.

---

### 7.4 Site / Work Package Management

**What it does:** Breaks a project into physical or logical work areas.

**Examples of sites:**

- Kitchen
- Main bathroom
- Living room
- Exterior facade

**Per-site information:**

- Work scope and required trades
- Assigned workshop
- Schedule (start/end dates)
- Progress percentage
- Tasks, issues, and materials

**Value delivered:** Large projects become manageable units with clear responsibility per area.

---

### 7.5 AI Intake Chat

**What it does:** Conversational assistant for registering new projects.

**Capabilities:**

- Natural multilingual conversation (Arabic, German, English)
- Collects customer, contact, location, dates, work areas, scope, payments, and workshop needs
- Asks only for **missing** information — not a rigid full questionnaire
- Scope-first behavior: if basics exist but work scope is missing, focuses on work areas and work types first
- Per-intake isolated memory — each project conversation stays separate
- Individual message deletion and full intake session reset controls

**Anti-hallucination protections:**

- Does not invent phone numbers, dates, prices, quantities, payment methods, materials, or workshop names
- Marks unknown fields as missing or needs confirmation

**Value delivered:** Transforms informal manager or client input into clearer, more complete project requirements with less manual typing.

---

### 7.6 Voice-to-Text Intake

**What it does:** Allows managers to record spoken project notes and convert them to text for the AI Intake flow.

**Value delivered:** Managers can register projects using whichever communication method is fastest — typing or speaking — especially useful on site or while multitasking.

---

### 7.7 Proposal Generation

**What it does:** Converts the AI Intake conversation into structured, editable proposal data.

**Proposal includes:**

- Customer and contact information
- Project overview and summary
- Site/work package breakdown
- Required skills and trades
- Workshop needs and known workshop names
- Payment drafts and commercial terms
- Notes and missing-information flags

**Editable before confirmation:** Manager can correct any field before converting to an official order.

**Value delivered:** Dramatically reduces time from first client conversation to a reviewable, structured proposal.

---

### 7.8 Proposal PDF Export

**What it does:** Generates a professional PDF document from the proposal draft.

**PDF sections include:**

- Project overview cards
- Customer and project data
- Summary block
- Scope matrix
- Detailed site/work-package sections
- External workshop table
- Commercial/payment summary
- Staffing section (where applicable)
- **Arabic text support**

**Value delivered:** Customer-ready proposal documents without manual layout work.

---

### 7.9 Workshop Partner Management

**What it does:** Maintains a directory of external workshops and subcontractors.

**Per workshop:**

- Name and contact details
- Specialties (trades): tiling, painting, electrical, plumbing, waterproofing, carpentry, gypsum, structural, etc.
- Active/inactive state
- Availability: Available or Not Available
- Notes

**Value delivered:** Central registry of execution partners; unavailable workshops are excluded from active recommendations.

---

### 7.10 Workshop Assignment & Scheduling

**What it does:** Links a workshop to a specific site with defined coverage and dates.

**Assignment includes:**

- Which workshop covers which site
- Covered trades/skills
- Start and end dates
- Status and notes

**Business rule:** Two different workshops **cannot** have overlapping schedules on the **same site**. Overlap on different sites is allowed.

**Value delivered:** Prevents double-booking of workshop time on one work area; clarifies who is responsible for each site.

---

### 7.11 Order Confirmation (Intake → Order)

**What it does:** Converts an approved proposal into official ERP records.

**Creates:**

- Customer (if new)
- Order
- Sites
- Workshop assignments
- Related project structure for tracking and invoicing

**Value delivered:** Clean handoff from sales/intake phase to operational execution — no re-entry of data.

---

### 7.12 Project Tracking

**What it does:** Manual execution documentation center per order.

**Tracking areas (tabs):**

| Area | Purpose |
| --- | --- |
| **Overview** | High-level status, progress %, open issues, completed tasks, warnings |
| **Timeline** | Chronological progress updates |
| **Photos** | Site documentation images |
| **Tasks** | Action items per site with weight, progress, due dates |
| **Issues** | Blockers and problems with severity and resolution |
| **Materials** | Supply tracking from needed through delivered/used |
| **Workshops** | Schedule visibility per site |
| **Baseline** | Official planned schedule per site |

**Progress update fields:**

- Site/area
- Title and description
- Status
- Progress percentage
- Next action
- Photos

**Value delivered:** Manager can quickly answer: *What is done? What is delayed? What needs action next?*

---

### 7.13 Smart Warnings (Rule-Based)

**What it does:** Automatically surfaces execution problems without waiting for AI analysis.

**Warning types include:**

- Overdue tasks
- High-severity open issues
- Blocked sites
- Missing workshop schedule
- Unavailable workshop assigned
- No workshop assigned to a site
- Progress/status mismatch

**Each warning includes:** Explanation of what should be fixed and navigation to the relevant area.

**Value delivered:** Proactive alerts reduce the chance that problems are discovered only at project deadline.

---

### 7.14 Baseline Schedule Planning

**What it does:** Defines the official planned timeline per site.

**Workflow:**

1. Manager opens Baseline in Tracking
2. System can suggest an initial draft
3. Manager reviews and adjusts start/end dates per site
4. Manager confirms — baseline becomes the official reference for delay analysis

**Important rule:** Delay analysis depends on a **confirmed** baseline, not a draft only.

**Value delivered:** Creates a shared plan against which actual progress is measured.

---

### 7.15 AI Monitoring

**What it does:** Order-level AI review of structured tracking data.

**Inputs reviewed:**

- Confirmed baseline dates
- Planned progress vs actual progress
- Progress delta
- Predicted finish date
- Delay status (on track / watch / delayed / unknown)
- Tasks and task progress
- Open issues and blockers
- Materials status
- Workshop schedules
- Smart warnings

**Outputs provided:**

- Project health summary
- Delay and blocker explanation in business language
- Missing information explanation (e.g., no baseline, no tasks)
- Recommended manager actions

**Critical rule:** AI **explains** system-calculated values — it does **not** invent official dates, percentages, or delay figures.

**Value delivered:** Reduces time to understand project health; helps identify problems earlier.

---

### 7.16 Invoice Management

**What it does:** Creates and manages project-linked invoices.

**Capabilities:**

- Invoice creation and line items
- Draft invoices
- Invoice grouping and merging
- Status management
- PDF and Word export
- Payment tracking
- Invoice sequence numbering

**Orientation:** Invoices are tied to projects, sites, and line items — aligned with workshop-based execution rather than internal employee hour billing as the primary model.

**Value delivered:** Billing stays connected to project structure; exportable documents for customers and finance.

---

### 7.17 Timesheet & Hour Reports (Legacy / Supporting)

**What it does:** Supports work entry logging, timesheet exports (JSON, PDF, Word), and hour reports.

**Note:** Employee-based staffing exists as legacy/supporting capability; the **primary product direction** is workshop-based execution.

---

## 8. End-to-End Business Workflow

### Phase 1 — Project Intake

```
Manager receives client request
    → Opens AI Intake (New session)
    → Types or records project details (text or voice)
    → AI asks targeted follow-up questions for missing scope
    → Manager provides work areas, trades, dates, payments
```

**Outcome:** Complete enough intake context to generate a proposal.

---

### Phase 2 — Proposal & Review

```
Manager clicks Generate Proposal
    → System structures customer, sites, scope, workshops, payments
    → Manager reviews and edits all fields
    → Optional: Generate Proposal PDF for client
    → Manager assigns or confirms workshops per site
```

**Outcome:** Approved proposal ready for conversion.

---

### Phase 3 — Order Creation

```
Manager clicks Confirm / Convert to Order
    → Official customer, order, sites, and workshop assignments created
    → Project becomes available in Orders, Tracking, Monitoring, Invoices
```

**Outcome:** Project moves from sales/intake to active execution.

---

### Phase 4 — Execution Tracking

```
Manager opens Order → Project Tracking
    → Sets/confirms Baseline schedule
    → Adds progress updates and photos
    → Creates and updates tasks (with weights and progress %)
    → Logs issues and material status
    → Reviews smart warnings and resolves root causes
```

**Outcome:** Living execution record with evidence and accountability.

---

### Phase 5 — Health Review

```
Manager opens AI Monitoring
    → Reviews planned vs actual progress
    → Reads delay status and blocker explanations
    → Acts on recommended next steps
    → Returns to Tracking to update tasks/issues/materials
```

**Outcome:** Informed management decisions based on structured data.

---

### Phase 6 — Billing

```
Manager opens Invoices
    → Creates or merges invoice drafts
    → Exports PDF/Word
    → Tracks payments
```

**Outcome:** Financial documents aligned with completed or in-progress work.

---

## 9. AI Features — Business Value

### AI's role in the business

| Principle | Meaning for the manager |
| --- | --- |
| **Assistive, not authoritative** | AI helps collect and explain; manager approves all official records |
| **No invented facts** | Prices, dates, phone numbers, materials, and workshops are never fabricated |
| **Isolated sessions** | Each intake conversation's facts stay separate from other projects |
| **Hidden construction expertise** | AI uses trade-specific renovation knowledge internally to ask better questions — not shown as a checklist form to the user |
| **Explains, doesn't calculate official values** | In monitoring, AI narrates what the system already calculated |

### Construction domain knowledge (used internally by AI)

The intake assistant understands renovation scope across:

- Flooring and tile
- Painting
- Electrical work
- Plumbing and sanitary work
- Aluminum and carpentry
- Waterproofing, thermal insulation, and sound insulation
- Gypsum and decor
- Civil and structural renovation

**Business value:** Better follow-up questions and more complete proposals without forcing the manager through a 50-field form.

### AI feature summary

| AI Feature | Business value |
| --- | --- |
| **AI Intake Chat** | Faster, more complete project registration from natural conversation |
| **Proposal Generation** | Structured draft from chat — hours of manual data entry saved |
| **Voice-to-Text** | Capture details hands-free on site or by phone |
| **Construction Scope Guidance** | Fewer missed trades and scope gaps in proposals |
| **Workshop-Oriented Planning** | Aligns AI suggestions with real execution model (external trades) |
| **AI Monitoring** | Early risk visibility; plain-language project health summaries |

### What AI explicitly does NOT do (by design)

- Replace manager sign-off on proposals, orders, or invoices
- Invent financial figures, official progress percentages, or delay dates
- Act as legal or contractual authority
- Automatically fix tracking problems — it recommends actions; manager executes them

---

## 10. Workshop-Based Execution Model

### Why workshops, not internal employees?

The product **pivoted** from internal employee staffing to **external workshop/subcontractor execution** because this matches how many renovation companies actually operate: specialized trades are outsourced to trusted workshop partners.

### How it works for the manager

1. **Register workshops** with specialties and availability
2. **Per site**, assign the responsible workshop and covered trades
3. **Set schedule dates** — system prevents conflicting workshops on the same site
4. **Track execution** through workshop lens in Project Tracking
5. **Unavailable workshops** are not suggested for new assignments

### Workshop lifecycle states

| State | Meaning |
| --- | --- |
| **Active** | Workshop can be assigned to projects |
| **Inactive** | Workshop hidden from new assignments |
| **Available** | Ready for scheduling |
| **Not Available** | Excluded from active recommendations |

### Business value

- Reflects real-world renovation operations
- Clear accountability: *which workshop owns which site*
- Schedule conflict prevention reduces on-site chaos
- Scales without maintaining a large internal workforce database as the core model

---

## 11. Project Tracking — Business Value

### What tracking answers for the manager

| Question | Where to find the answer |
| --- | --- |
| How far along is the project overall? | Overview — progress %, status cards |
| What happened this week on site? | Timeline updates |
| Is there visual evidence? | Photos tab |
| What work remains? | Tasks — open items, weights, due dates |
| What is blocking progress? | Issues — severity, status, resolution notes |
| Are materials ready? | Materials — Needed / Ordered / Delivered / Used |
| Is the workshop on schedule? | Workshops schedule per site |
| Are we ahead or behind plan? | Baseline vs actual progress (with Monitoring) |

### Task weighting — why it matters

Tasks can carry **weight** reflecting their importance to site progress.

**Example:**

- Waterproofing installation → high weight (critical path)
- Final cleaning → lower weight

**Value:** Progress percentages reflect real project impact, not just task count.

### Issue severity levels

| Level | Typical use |
| --- | --- |
| **Low** | Minor inconvenience, no schedule impact |
| **Medium** | Noticeable delay risk |
| **High** | Significant blocker — surfaces in warnings and AI Monitoring |

---

## 12. AI Monitoring — Business Value

### When to use AI Monitoring

- Weekly project review meetings
- Before client status updates
- When warnings appear in Tracking
- When a site falls behind baseline
- When multiple open issues accumulate

### What the manager sees

- **Planned Progress** — where the project should be per baseline and tasks
- **Actual Progress** — where the project really is per logged updates
- **Delta** — the gap between plan and reality
- **Delay Status** — on track, watch, delayed, or unknown
- **Predicted Finish** — estimated completion based on current trajectory
- **Open Issues & Blockers** — explained in context
- **Missing Information** — e.g., "no confirmed baseline" or "insufficient task data"
- **Recommended Actions** — practical next steps for the manager

### Dependency on data quality

AI Monitoring is only as strong as the tracking data behind it.

**For best results, ensure:**

- Baseline is confirmed (not draft only)
- Tasks exist with progress percentages
- Issues are logged when problems occur
- Progress updates are added regularly
- Workshop schedules are set

---

## 13. Invoicing & Financial Management

### Invoice workflow (business view)

1. Work and project milestones generate or inform invoice line items
2. Multiple drafts can be **grouped** (by employee, site, or order — where applicable)
3. Compatible drafts can be **merged** into a final invoice
4. Manager exports **PDF** or **Word** for customer delivery
5. Payment status is tracked against the invoice

### Invoice states (conceptual)

- Draft → under review
- Final → approved for sending
- Sent → delivered to customer
- Paid → payment received
- Canceled → voided

### Business value

- Billing stays linked to project structure
- Reduces manual document preparation
- Supports Arabic document output alongside German/English
- Invoice sequence settings prevent numbering conflicts

---

## 14. Multilingual & Accessibility Value

### Supported languages

| Language | Support level |
| --- | --- |
| **Arabic** | First-class — UI labels, RTL layout, AI conversation, PDF output, tracking warnings, monitoring |
| **German** | Full UI and workflow support |
| **English** | Full UI and workflow support |

### Why multilingual support is a product value, not just a feature

- Renovation companies in multilingual markets can serve Arabic-speaking clients with Arabic proposals
- Managers can work in their preferred language
- AI Intake responds in the user's language when possible
- RTL (right-to-left) layout ensures Arabic screens are readable, not broken

### Accessibility improvements

- Readable field colors in light and dark themes
- Clear status indicators and progress charts
- Mobile-responsive layouts with bottom navigation
- Collapsible history lists to reduce visual overload

---

## 15. User Experience & Interface Value

### Design principles applied

- **Consistent visual system** — cards, colors, spacing, icons, actions
- **Multiple themes** — user preference support
- **Professional appearance** — suitable for customer demonstrations
- **Mobile support** — managers can review on phone/tablet on site
- **Safer destructive actions** — clear controls for deleting messages and intake sessions

### Main application areas (8 core operation pages)

1. Dashboard
2. AI Intake
3. Customers
4. Orders
5. Sites
6. Workshops
7. Invoices
8. AI Monitoring (+ Project Tracking per order)

### User benefit summary

Managers can:

- Understand the system faster (clear workflow cards and navigation)
- Complete tasks with fewer steps
- See immediately what requires attention (warnings, monitoring alerts)
- Work in Arabic, German, or English without switching tools

---

## 16. Business Rules & Manager Governance

### Non-negotiable business rules

| Rule | Rationale |
| --- | --- |
| Manager approves before order creation | Prevents AI errors from becoming official records |
| Unknown data stays marked missing | No silent assumptions on prices, dates, or contacts |
| Workshop overlap blocked on same site | Prevents scheduling conflicts |
| Unavailable workshops excluded from suggestions | Reflects real partner capacity |
| Baseline must be confirmed for delay analysis | Official schedule reference required |
| AI explains monitoring values only | Financial and progress integrity |
| Referenced records have strict change rules | Prevents breaking billing and assignment integrity |

### Manager responsibility checklist (before any approval)

Before confirming a proposal, order, invoice, or baseline, review:

- [ ] Prices and payment terms
- [ ] Start and end dates
- [ ] Work scope per site
- [ ] Selected workshops and their availability
- [ ] Contact details (phone, email, address)
- [ ] Active warnings in tracking

---

## 17. Information the System Manages

### Customer domain

- Company name, contacts, address, phone, email

### Project / order domain

- Project title, description, dates, status, linked customer

### Site domain

- Work area name, scope, trades, progress, workshop assignment, schedule

### Workshop domain

- Partner name, specialties, contact, availability, active state

### Intake / proposal domain

- Chat messages, extracted facts (hidden from normal view), proposal draft fields

### Tracking domain

- Progress updates, photos, tasks, issues, materials, baseline dates, warnings

### Monitoring domain

- Health summaries, delay explanations, recommended actions, alerts

### Financial domain

- Invoices, line items, draft groups, payments, invoice sequence

---

## 18. Manager Daily Workflow

### Recommended daily routine

| Step | Action |
| --- | --- |
| 1 | Open **Dashboard** — review overall situation |
| 2 | Open **Orders** — check active projects |
| 3 | For priority project: open **Tracking** — add updates, photos, tasks |
| 4 | Review **Warnings** — resolve overdue tasks, missing schedules, blockers |
| 5 | Open **AI Monitoring** for at-risk projects |
| 6 | Update **Materials** and **Workshop** schedules as needed |
| 7 | Review **Invoices** and payment status |

### Weekly routine additions

- Confirm or update **Baseline** schedules
- Review all open **Issues** across projects
- Generate **Proposal PDFs** for new client opportunities
- Check **Workshop availability** for upcoming assignments

---

## 19. Feature Status Matrix

| Feature | Description | Status |
| --- | --- | --- |
| **Project / Order Management** | Customers, orders, sites, workshops, invoices | ✅ Implemented |
| **AI Intake Chat** | Conversational construction-focused requirement collection | ✅ Implemented |
| **Proposal Generation** | Structured editable proposal + PDF | ✅ Implemented |
| **Voice-to-Text Intake** | Spoken notes → text → intake flow | ✅ Implemented |
| **Workshop Management** | Partner registry, specialties, availability | ✅ Implemented |
| **Workshop Assignment** | Per-site assignment with schedule conflict rules | ✅ Implemented |
| **Project Tracking** | Tasks, issues, photos, materials, timeline, baseline | ✅ Implemented |
| **Smart Warnings** | Rule-based execution alerts | ✅ Implemented |
| **AI Monitoring** | Progress/delay/risk analysis and recommendations | ✅ Implemented (continuous improvement) |
| **Invoice Management** | Drafts, merge, PDF/Word export, payments | ✅ Implemented |
| **Multilingual UI** | Arabic, German, English + RTL | ✅ Implemented |
| **Authentication & Roles** | Login, permissions, access control | ❌ Not implemented |
| **Audit Log** | Who changed what and when | ❌ Not implemented |
| **OCR for Documents** | Extract text from uploaded contracts/invoices | 📋 Planned |
| **OCR + RAG Q&A** | Ask questions against project documents | 📋 Planned |
| **Progress AI from Photos** | Automated progress from site images | 📋 Planned (future) |

---

## 20. Achievements & Milestones

### Product evolution

| Stage | Achievement |
| --- | --- |
| **Initial** | Basic accounting/ERP prototype |
| **Current** | Full construction-management workflow with AI intake, workshops, tracking, monitoring |

### Validated capabilities (as of June 2026)

- AI Intake chat prompt rules and multilingual behavior
- Proposal extraction with construction-domain guidance
- Speech transcription for voice intake
- Hybrid workshop/internal planning flows (workshop-primary direction)
- Recommendation explanations for staffing context (where applicable)
- Professional proposal PDF with Arabic support
- Project tracking with photos, tasks, issues, materials, baseline
- AI Monitoring connected to tracking data
- Invoice and document export flows
- 76+ automated backend tests passing
- Production frontend build passing

### Presentation-ready message (June 2026)

> OMRAN already connects AI-assisted intake with real project execution management. The next phase focuses on making the experience faster, clearer, and ready for practical customer use.

---

## 21. Current Limitations

### Business limitations (what managers should know)

| Limitation | Impact |
| --- | --- |
| **Single-tenant** | Designed for one company, not multi-tenant SaaS |
| **No login/roles** | Anyone with system access sees all data — not suitable for untrusted environments |
| **No audit trail** | Cannot see who changed orders, invoices, or baselines |
| **AI is assistive** | Manager must review all AI outputs before approval |
| **Monitoring depends on manual tracking** | Sparse tracking data → weaker monitoring insights |
| **Baseline planning is simple** | Manager-confirmed dates, not advanced critical-path scheduling |
| **Prototype data storage** | Local/demo-oriented; production needs proper backup and file storage strategy |
| **OCR and document Q&A not yet available** | Contracts and quotations must be read manually |

### What is explicitly planned but NOT yet delivered

- Progress tracking with photos + OCR
- OCR + RAG for document question answering
- Progress Monitoring AI from photo analysis
- Full production security and deployment hardening

---

## 22. Release Readiness — Business View

### Ready for

| Release type | Suitable? | Notes |
| --- | --- | --- |
| **Demo to mentors/customers** | ✅ Yes | With test data; main flows work |
| **Internal pilot** | ✅ Yes | Controlled test data; manager review required |
| **Production with real customer data** | ❌ Not yet | Needs auth, audit, backup, deployment security |

### Strong / ready areas

- Project and order management
- AI Intake and proposal generation
- Voice-to-text intake
- Workshop-based execution
- Project tracking with warnings
- AI Monitoring (improving)
- Responsive UI direction
- Arabic and multilingual support

### Required before live production release

| Gap | Why it matters |
| --- | --- |
| Authentication and roles | Protect real business data |
| Audit log | Accountability for financial and schedule changes |
| Production database | Reliable multi-user operation |
| Managed file storage | Photos and documents must not be lost |
| Backup and restore | Prevent catastrophic data loss |
| Secret management | Protect AI API keys |
| Error monitoring | Detect failures after release |
| AI governance | Usage limits, traceability, fallback policies |
| Performance hardening | Stay fast as project history grows |
| End-to-end QA | Validate full intake → invoice workflow |

---

## 23. Planned Future Features

| Feature | Expected business value |
| --- | --- |
| **OCR for documents** | Auto-extract text from contracts, invoices, quotations — less manual reading |
| **OCR + RAG document Q&A** | Ask questions against uploaded project files — faster contract review |
| **Richer progress intelligence** | Deeper analysis from structured tracking history |
| **Photo-based progress AI** | Estimate completion from site photos — less manual progress entry |
| **Authentication & roles** | Secure multi-user production deployment |
| **Audit logging** | Compliance and accountability |
| **Alert automation** | Proactive notifications for delays without manual monitoring visits |

---

## 24. Best Practices for Managers

### For AI Intake

- Start with a natural description: client name, location, contact, dates, then scope
- Answer follow-up questions with short, direct details
- Use voice on site when typing is inconvenient
- Use "New intake" for each separate project — don't mix conversations
- Delete incorrect messages rather than trying to "talk around" errors

### For Proposals

- Review every field before Confirm — especially prices, dates, and workshop names
- Export PDF only after manual review
- Mark unclear items and fix them before client delivery

### For Workshops

- Keep availability status current
- Assign workshops as soon as sites are confirmed
- Set realistic start/end dates — warnings depend on them

### For Tracking

- Add at least one progress update per site per week on active projects
- Upload photos at key milestones (before/after critical trades)
- Log issues immediately when blockers appear — don't wait
- Confirm baseline before relying on delay analysis

### For AI Monitoring

- Run monitoring after updating tracking data, not before
- Treat recommendations as suggestions — verify against site reality
- If analysis is weak, add tasks, baseline, and issues first, then re-run

---

## 25. Common Situations & Solutions

| Situation | Likely cause | What to do |
| --- | --- | --- |
| AI keeps asking for missing information | Scope or contact details incomplete | Provide short, specific answers for the exact field asked |
| No suitable workshop appears | No available workshop with required specialty | Add a new workshop or update availability status |
| AI Monitoring gives weak analysis | Insufficient tasks, baseline, or updates | Add tasks with progress %, confirm baseline, log issues |
| Warning won't disappear | Root cause not fixed | Click warning info button; complete the required action |
| PDF doesn't display in browser | Browser PDF viewer limitation | Download file or open in new tab |
| Workshop assignment rejected | Overlapping schedule on same site | Adjust dates or choose a different time window |
| Proposal has blank/unknown fields | Information was never provided in intake | Return to intake chat or edit proposal fields manually |

---

## 26. Recommended Rollout Path

### Stage 1 — Prototype Demo Release

**Audience:** Mentors, stakeholders, potential customers  
**Data:** Test/sample data only  
**Focus:** Demonstrate intake → proposal → order → tracking → monitoring → invoice flow

### Stage 2 — Internal Pilot

**Audience:** Internal team members acting as managers  
**Data:** Realistic test projects, not live customer contracts  
**Focus:** Validate workflows, Arabic UI, workshop rules, monitoring quality

### Stage 3 — Controlled Customer Pilot

**Audience:** Limited trusted users at one renovation company  
**Data:** Real projects with manager oversight  
**Focus:** Daily usability, data quality habits, invoice accuracy

### Stage 4 — Production Release

**Prerequisites:** Authentication, roles, audit log, backup, production deployment, AI governance  
**Audience:** Full company operations  
**Focus:** Secure, accountable, reliable daily use

---

## Appendix A — Example Intake Conversation (Arabic)

**Opening message:**

```
عندي مشروع ترميم لشركة إعمار الشام. الموقع في دمشق، حي المزة، بناء رقم ١٥. المسؤول أحمد منصور، الهاتف ٠٩٣٣٤٤٥٥٦٦، والبريد ahmad@example.com. بدنا نبدأ ١٠-٠٦-٢٠٢٦ وننتهي ٢٥-٠٦-٢٠٢٦.
```

**Scope message:**

```
المطبخ يحتاج إزالة البلاط القديم وتركيب سيراميك ٦٠ في ٦٠ مع إصلاح تمديدات المياه وترميم خزائن خشبية. الحمام الرئيسي يحتاج عزل مائي سائل مرن وتبديل مغسلة وخلاط دش. غرفة الجلوس تحتاج دهان داخلي عادي مع معجون كامل وطبقتين.
```

---

## Appendix B — Example Progress Update

```
تم الانتهاء من إزالة البلاط القديم في الحمام، وتجهيز الأرضية للعزل المائي. الإجراء التالي: تنفيذ طبقة العزل الأولى.
```

---

## Appendix C — Example Issue Log

```
تأخر تسليم السيراميك من المورد، وهذا قد يؤثر على موعد تنفيذ الحمام.
```

**Severity:** Medium or High  
**Status:** Open → In Progress → Resolved

---

## Appendix D — Key Pages Reference (Manager View)

| Page | Purpose |
| --- | --- |
| **Dashboard** | Executive entry point and workflow overview |
| **AI Intake** | New project registration via chat or voice |
| **Customers** | Client master data |
| **Orders** | Active and completed projects |
| **Sites** | Work areas across projects |
| **Workshops** | External partner directory |
| **Order Detail** | Single project overview and workshop assignments |
| **Project Tracking** | Execution documentation per order |
| **AI Monitoring** | Project health analysis per order |
| **Invoices** | Billing and exports |
| **Invoice Drafts** | Pre-final invoice preparation |

---

## Appendix E — Glossary

| Term | Definition |
| --- | --- |
| **Intake** | Initial project registration phase via AI conversation |
| **Proposal** | Structured draft of project scope, customer, sites, and commercial terms |
| **Order** | Official project record after proposal confirmation |
| **Site** | A work area within a project (e.g., kitchen, bathroom) |
| **Work package** | Synonym for site — a defined unit of work |
| **Workshop** | External subcontractor or trade specialist |
| **Baseline** | Confirmed official schedule per site — reference for delay measurement |
| **Tracking** | Ongoing manual documentation of execution |
| **Monitoring** | AI analysis of tracking data for health, risk, and recommendations |
| **Warning** | Rule-based alert about a specific execution problem |
| **Trade / Skill** | Type of construction work (tiling, plumbing, painting, etc.) |

---

## Document Control

| Field | Value |
| --- | --- |
| **Title** | OMRAN ERP — Complete Project Value & Product Guide |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Scope** | Product value, business workflows, manager usage — no technical implementation |
| **Related manager guide (Arabic)** | `docs/documentaion/user-guide/user-guide-manager-ar.md` |
| **Related progress presentation** | `docs/project-progress-presentation-june-2026.md` |
| **Related achievements report** | `docs/ai-backend-achievements-report.md` |

---

*This document describes what OMRAN ERP delivers to renovation and construction managers. For setup, APIs, and engineering details, see the separate technical documentation in `docs/documentaion/`.*
