# Presentation Creation Prompt: Construction ERP With AI Features

Use this document as a prompt to create a professional customer-facing presentation for the ERP prototype. The audience is potential customers, business users, mentors, and non-technical stakeholders. The presentation should explain the business value, main ERP scope, AI capabilities, and what the user can do with the system.

## Presentation Goal
Create a clear, professional, and visually modern presentation that shows how the system helps renovation and construction businesses manage projects from first customer conversation to proposal, workshop execution, tracking, monitoring, and invoicing.

Tone: professional, practical, customer-focused, not overly technical.

Recommended length: 10-12 slides.

## Product Name
**Omran Billing / Construction ERP Prototype**

## One-Line Description
A construction-focused ERP system that helps managers collect project requirements, generate proposals, assign workshops, track execution, monitor project health with AI, and manage invoices in one workflow.

## Target Users
- Small and medium renovation/construction companies
- Project managers
- Office managers handling customers, proposals, workshops, and invoices
- Businesses that work mainly with external workshops/subcontractors

## Business Problem
Construction managers often collect project details through informal conversations, then manually convert them into proposals, site tasks, workshop plans, and invoices. This creates delays, missing details, unclear responsibility, weak tracking, and poor visibility into project risks.

## Proposed Solution
The system centralizes the renovation workflow:
- Capture project details through AI Intake chat or voice
- Convert requirements into structured proposal data
- Manage customers, orders, sites/work packages, workshops, and invoices
- Assign external workshops to sites based on required trades
- Track progress, photos, tasks, issues, materials, and workshop schedules
- Use AI Monitoring to explain project health and highlight delays or missing information

## Main ERP Scope
### Included In Current Scope
- Dashboard overview
- Customer management
- Order management
- Site/work-package management
- Workshop partner management
- Workshop assignment per site
- Project tracking with photos, tasks, issues, materials, baseline, and workshop schedule
- AI Monitoring page for project health analysis
- Drafts and invoice management
- AI Intake for requirement collection and proposal generation
- Proposal PDF generation
- Voice-to-text support for intake messages
- Multilingual interface support: Arabic, English, German
- Dark/light theme support
- Responsive mobile-friendly layout

### Not Included In Current Scope
- Full accounting system
- Payroll management
- Workshop payroll or subcontractor financial settlement
- Inventory warehouse management
- Full calendar scheduling engine
- Deep image analysis for progress estimation
- Production-level authentication, authorization, and audit logging
- OCR + RAG document Q&A as production-ready feature

## AI Features And Status
| AI Feature | What It Does | Status |
|---|---|---|
| AI Intake Chat | Collects project/customer/site requirements through a guided conversation and asks only relevant follow-up questions. | Implemented |
| Construction Domain Guidance | Uses hidden construction checklist knowledge for flooring, painting, electrical, plumbing, insulation, gypsum, carpentry, and civil renovation details. | Implemented |
| Proposal Generation | Converts chat information into structured proposal data: customer, dates, sites, work scope, payments, workshops, and notes. | Implemented |
| Proposal PDF | Generates a professional PDF proposal including Arabic text support and project details. | Implemented |
| Voice-to-Text | Allows the manager to speak project information and convert it into text for the AI Intake flow. | Implemented |
| Multilingual AI Assistant | Supports Arabic conversation and keeps generated fields close to the language used by the manager. | Implemented |
| Workshop-Aware Planning | Focuses execution on external workshops/subcontractors instead of internal employees. | Implemented |
| AI Monitoring | Reviews project tracking data, compares planned vs actual progress, explains warnings, risks, missing information, and suggested actions. | Implemented / Improving |
| Smart Baseline And Delay Forecasting | Uses confirmed baseline dates, task progress, task weights, and rule-based delay prediction to support AI Monitoring. | Implemented / Improving |
| OCR For Documents | Extracts text from uploaded contracts, invoices, quotations, or scanned reports. | Planned |
| OCR + RAG Document Q&A | Lets users ask questions based on uploaded project documents and scanned files. | Planned |

## Key Value For Customers
- Faster proposal preparation from real conversations
- Less manual data entry
- Better project visibility from one place
- Clearer workshop responsibility per site
- Earlier detection of delays, blockers, and missing project information
- Better documentation through photos, tasks, issues, materials, and tracking history
- More professional customer proposals and PDFs
- Easier use on mobile devices for managers on site

## Suggested Slide Structure
### Slide 1: Title
Title: **Construction ERP With AI-Assisted Project Management**
Subtitle: From project intake to proposal, workshop execution, tracking, monitoring, and invoicing.

### Slide 2: Business Problem
Show the pain points:
- Project details are collected manually and often incomplete
- Proposals take time to prepare
- Workshop responsibility is not always clear
- Progress tracking is scattered across messages/photos
- Delays are noticed too late

### Slide 3: Solution Overview
Explain the system as one connected workflow:
AI Intake -> Proposal -> Workshop Assignment -> Project Tracking -> AI Monitoring -> Invoice.

### Slide 4: ERP Scope
Show main modules:
- Dashboard
- Customers
- Orders
- Sites
- Workshops
- Drafts
- Invoices
- AI Intake
- Project Tracking
- AI Monitoring

### Slide 5: AI Intake
Explain:
- Manager writes or speaks project details
- AI extracts customer, location, dates, work areas, scope, materials, payments, and workshops
- AI asks practical follow-up questions only when information is missing

### Slide 6: Proposal Generation And PDF
Explain:
- AI converts conversation into proposal draft
- Manager reviews and edits before confirmation
- System generates organized proposal PDF
- Supports Arabic content

### Slide 7: Workshop-Based Execution
Explain:
- System is designed for businesses that work with external workshops
- Manager manages workshop partners
- Assigns workshops to sites/work packages
- Tracks covered trades, schedule dates, status, and notes

### Slide 8: Project Tracking
Explain manual tracking features:
- Timeline updates
- Site progress cards
- Tasks and task progress
- Photos by site and date
- Issues/blockers
- Materials
- Workshop schedules
- Baseline dates

### Slide 9: AI Monitoring
Explain how AI Monitoring adds value:
- Reviews tracking data
- Compares planned vs actual progress
- Highlights delayed or blocked sites
- Explains why risks appear
- Suggests what the manager should fix next

Important: AI does not invent official numbers. Backend rules calculate progress, delay, and warnings; AI explains them in user-friendly language.

### Slide 10: Mobile And Multilingual Experience
Show:
- Responsive mobile layout
- Bottom navigation for mobile use
- Arabic/English/German UI
- Dark/light theme
- Useful for office and site work

### Slide 11: Technical Architecture
Use a simple architecture diagram:
Next.js Frontend -> FastAPI Backend -> SQLAlchemy/SQLite Database -> AI Provider Services.

Architecture description:
The system follows a layered client-server architecture implemented as a modular monolith, with integrated AI services for chat, proposal generation, speech transcription, and project monitoring explanations.

### Slide 12: Roadmap
Show planned next steps:
- Improve AI Monitoring explanations
- Add stored monitoring reports/history
- Add notifications for delays/blockers
- Add OCR for documents
- Add OCR + RAG document Q&A
- Prepare production security: authentication, roles, audit log

## Visual Style Guidance
- Use a modern ERP/SaaS style
- Prefer blue/purple accents matching the system theme
- Use clean diagrams and process flows
- Avoid heavy text blocks
- Use icons for AI, tracking, workshop, invoice, document, voice, and monitoring
- Keep the presentation customer-focused, not code-focused

## Important Messaging
The key message is not only that the system has AI. The real value is that AI is connected to ERP workflow: it helps turn messy project conversations into structured business actions, then supports tracking and monitoring during execution.

## Short Customer Pitch
This ERP prototype helps renovation companies move from scattered conversations and manual project handling to a structured workflow. AI assists with intake, proposal generation, voice input, and project monitoring, while the ERP manages customers, orders, workshops, tracking, and invoices.
