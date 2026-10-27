# Self-Evaluation

## What works

- The system supports the main Mini-ERP workflow for construction projects: customers, orders, sites, workshops, draft invoices, invoices, and project details.
- The AI Intake Chat works as a guided conversational assistant for collecting project requirements in Arabic and other supported languages.
- Proposal Generation converts intake conversation data into structured proposal/order information, including sites, work scope, payment details, and workshop needs.
- Voice-to-Text Intake is implemented and allows spoken notes to be converted into text for faster project intake.
- Workshop-based execution is implemented: the manager can manage workshop partners, assign workshops to sites, and track covered trades.
- Project Tracking works manually through progress updates, photos, tasks, issues/blockers, materials, baseline planning, and workshop schedules.
- AI Monitoring is implemented as a separate feature/page that reviews tracking data, compares planned vs actual progress, detects risks, and explains delays or incomplete work based on available project data.
- Proposal PDF generation works and supports Arabic content.
- The frontend has a redesigned UI, responsive mobile navigation, improved settings/theme options, pagination for larger lists, and stricter client-side form validation.

## What does not work yet

- OCR for uploaded documents is not implemented yet.
- OCR + RAG document question answering is not implemented yet.
- Full production authentication, user roles, permissions, and audit logs are not complete.
- AI Monitoring does not perform image analysis on uploaded progress photos (And it's not schuduled as priority feature).
- Workshop availability is basic and does not include full capacity planning, pricing, payroll, or advanced scheduling optimization (And it's not schuduled as priority feature)..
- Some performance and UI/UX improvements are still in progress before a final production release.

## Known limitations

- This is still a prototype/demo version, not a production-ready ERP release.
- The current backend uses SQLite .
- AI responses depend on the configured provider, prompt quality, and the information provided by the user.
- AI Monitoring is based on structured tracking data and deterministic rules; it does not independently understand real construction progress without entered tasks, progress values, issues, and baseline dates.
- Progress percentages depend on manually entered task progress and weights.
- File/photo storage is local in the current version.

## Main technical contribution

- The project delivers an AI-assisted Mini-ERP for construction project management named Omran.
- The main technical contribution is connecting a traditional ERP workflow with AI-supported project intake, proposal generation, workshop planning, project tracking, and AI monitoring.
- The system follows a layered client-server architecture using a Next.js/React frontend, a FastAPI/Python backend, SQLAlchemy persistence, and external AI integrations for chat and transcription.
- A construction-domain AI intake flow was designed to collect renovation details in a practical way, especially for Arabic-speaking users.
- The project pivoted from internal employee staffing to a workshop/subcontractor execution model, which better matches the target construction workflow.
- The frontend was improved with a more professional UI, responsive mobile layout, better validation, readable field states, and a more user-friendly AI Intake experience.