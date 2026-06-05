# OMRAN ERP ? Current Project Progress

## Slide 1 ? Title

# OMRAN ERP
### AI-Powered Construction Project Management

**Current Progress, Implemented Features, and Product Improvements**

June 2026

**Presentation message:** OMRAN brings project intake, proposals, workshop coordination, execution tracking, and AI-supported monitoring into one clear management workspace.

---

## Slide 2 ? Product Vision

# From Project Request to Controlled Execution

- Centralize customers, orders, sites, workshops, invoices, and project details.
- Convert natural conversations into structured, reviewable project proposals.
- Give managers clear visibility into execution progress, risks, and next actions.
- Reduce repetitive administration while keeping final decisions under manager control.

**Core value:** Faster project setup, clearer coordination, and earlier visibility of execution problems.

---

## Slide 3 ? What Has Been Built

# Current System Scope

The current prototype supports the main construction-management workflow:

1. Capture project requirements through AI Intake Chat or voice.
2. Generate and review a structured proposal.
3. Identify required trades and assign external workshops.
4. Convert the approved proposal into a managed order.
5. Track execution through tasks, issues, photos, materials, schedules, and progress.
6. Review project health through AI Monitoring.

**Architecture:** Next.js frontend, FastAPI backend, SQLAlchemy persistence, and integrated Gemini/OpenRouter and AssemblyAI services.

---

## Slide 4 ? New User Interface

# A More Professional and User-Friendly Experience

- Introduced a modern visual system with consistent cards, colors, spacing, icons, and actions.
- Added multiple themes, multilingual settings, and Arabic RTL support.
- Redesigned Dashboard, AI Intake, Project Tracking, AI Monitoring, and management pages.
- Added responsive mobile layouts and mobile-style bottom navigation.
- Improved forms, status indicators, progress charts, warnings, and readable field colors.
- Added safer, clearer controls for deleting individual messages and intake sessions.

**User benefit:** Managers can understand the system faster, complete tasks with fewer steps, and clearly see what requires attention.

---

## Slide 5 ? AI Intake Chat

# A Practical Construction-Focused AI Agent

- Holds a natural multilingual conversation instead of using a rigid questionnaire.
- Understands project areas, work scope, customer details, dates, payments, and workshop needs.
- Uses construction-domain guidance to ask relevant follow-up questions.
- Avoids asking every question at once and focuses on missing practical information.
- Maintains intake-specific context while keeping each project conversation isolated.
- Supports individual message deletion and complete intake-session management.

**AI value:** The agent transforms informal manager input into clearer project requirements while reducing missing information and manual entry.

---

## Slide 6 ? Proposal and Voice Workflow

# Faster Intake-to-Proposal Conversion

### Proposal Generation
- Converts the conversation into structured customer, order, site, payment, and workshop data.
- Keeps generated information editable before final confirmation.
- Produces a professionally designed proposal PDF with Arabic support.

### Voice-to-Text Intake
- Allows managers to record spoken project notes.
- Converts voice recordings into text using AssemblyAI.
- Sends transcribed text into the same AI Intake workflow.

**User benefit:** Managers can register projects using the communication method that is fastest for them: text or voice.

---

## Slide 7 ? Project Tracking

# Structured Visibility Across Project Execution

- Records project updates and creates a visual progress timeline.
- Tracks tasks, issues, blockers, materials, workshops, photos, and next actions.
- Shows project and site progress through clear progress charts.
- Supports baseline schedules, actual progress, planned progress, and workshop dates.
- Generates smart rule-based warnings for overdue tasks, missing schedules, blockers, and unavailable workshops.
- Prevents conflicting workshop schedules on the same site.

**User benefit:** The manager can quickly understand what is completed, what is delayed, and what action is needed next.

---

## Slide 8 ? AI Monitoring

# Turning Tracking Data into Management Insight

AI Monitoring reviews structured Project Tracking data to:

- Compare planned progress against actual progress.
- Highlight delays, blockers, risks, and incomplete tasks.
- Explain backend-calculated health indicators in clear business language.
- Identify missing information that limits reliable monitoring.
- Recommend practical next actions for the manager.

**Current status:** Implemented with continuous improvement. The complete monitoring workflow works, while explanation quality and progress intelligence continue to improve.

**AI value:** It reduces the time required to review project health and helps managers identify problems earlier.

---

## Slide 9 ? Implemented Feature Status

# Current Feature Status

| Feature | Description | Status |
|---|---|---|
| **Project / Order Management** | Manage customers, orders, sites, workshops, invoices, and project details. | **Implemented** |
| **AI Intake Chat** | Conversational construction-focused assistant for collecting project requirements. | **Implemented** |
| **Proposal Generation** | Converts intake conversations into structured, editable proposal data and PDF output. | **Implemented** |
| **Voice-to-Text Intake** | Converts spoken project notes into text to accelerate intake. | **Implemented** |
| **Project Tracking** | Tracks tasks, issues, photos, materials, progress, schedules, workshops, and warnings. | **Implemented** |
| **AI Monitoring** | Reviews tracking data to detect delays, risks, blockers, and incomplete tasks. | **Implemented ? Continuous Improvement** |

---

## Slide 10 ? Frontend Improvements

# Frontend Progress and Performance Work

### Completed Improvements
- Responsive desktop and mobile layouts.
- Clearer navigation, fixed header, mobile navigation, and organized settings.
- Collapsible and limited-render AI Intake history to avoid rendering all sessions at once.
- Improved cards, actions, icons, charts, forms, field contrast, and status labels.
- Better Arabic RTL layout and multilingual user experience.

### Performance Improvements in Progress
- Continue optimizing long lists through pagination and lazy loading.
- Reduce unnecessary component rendering and large-page memory usage.
- Improve loading feedback and perceived responsiveness for AI operations.
- Continue testing FPS, memory usage, mobile behavior, and large-data scenarios.

**Goal:** Maintain the new professional interface while keeping the system fast as project data grows.

---

## Slide 11 ? Quality and Validation

# Current Technical Validation

- **76 backend automated tests passing.**
- **Frontend production build passing.**
- AI Intake, proposal generation, voice transcription, workshop flow, project tracking, and monitoring endpoints are connected.
- Existing data remains compatible while new features are introduced incrementally.
- AI responses remain reviewable; managers keep control over final project data and decisions.

**Current position:** A functional, integrated prototype ready for continued performance improvement, UX refinement, and controlled user testing.

---

## Slide 12 ? Next Development Focus

# Next Steps

1. Continue refining the implemented AI Monitoring experience.
2. Improve frontend performance for large histories, lists, and project datasets.
3. Strengthen usability testing across desktop, mobile, English, German, and Arabic.
4. Improve monitoring explanations and project-progress intelligence.
5. Prepare the system for a stable demonstration and controlled pilot release.

**Closing message:** OMRAN already connects AI-assisted intake with real project execution management. The next phase focuses on making the experience faster, clearer, and ready for practical customer use.
