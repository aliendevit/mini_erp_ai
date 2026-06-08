# AI Features

## AI Role In The System

The AI layer is used to reduce manual work in project intake, proposal preparation, voice note processing, and project health review.

The AI is not treated as the source of truth for financial, schedule, or progress decisions. Official values are stored and calculated by the backend, then reviewed by the manager.

## Implemented AI Features

| Feature | Status | What It Does |
| --- | --- | --- |
| AI Intake Chat | Implemented | Collects project requirements through a guided conversation. |
| Proposal Generation | Implemented | Converts intake conversation into structured proposal data. |
| Voice-to-Text Intake | Implemented | Converts manager voice notes into text using AssemblyAI. |
| Construction Scope Guidance | Implemented | Helps the agent ask better renovation questions based on trade-specific checklist knowledge. |
| Workshop-Oriented Planning | Implemented | Focuses execution planning around external workshops/subcontractors instead of internal employee staffing. |
| Project Tracking AI Monitoring | Implemented / improving | Reviews tracking data, planned vs actual progress, issues, blockers, and delay risk. |
| OCR for Documents | Planned | Extract text from uploaded contracts, invoices, quotations, and reports. |
| OCR + RAG Document Q&A | Planned | Answer questions from uploaded project documents after OCR and indexing. |

## AI Intake Chat

Location:

- Backend: `backend-python/app/routers/ai.py`
- Frontend: `frontend/src/app/ai-intake/page.tsx`

The intake assistant helps the manager collect:

- Customer and contact details.
- Project location.
- Project start and end dates.
- Work areas / sites.
- Construction scope details.
- Payment details.
- Workshop needs and known workshop names.

Behavior rules:

- Ask only relevant follow-up questions.
- Avoid asking every checklist question at once.
- Use the user's language when possible.
- Do not invent materials, prices, quantities, dates, or workshop details.
- Mark unknown information as missing or needs confirmation.
- Keep per-intake memory isolated from other intake sessions.

## Construction Checklist Guidance

The agent has hidden construction-domain guidance covering:

- Flooring and tile.
- Painting.
- Electrical work.
- Plumbing and sanitary work.
- Aluminum and carpentry.
- Waterproofing, thermal insulation, and sound insulation.
- Gypsum and decor.
- Civil and structural renovation.

This checklist is not shown as a user-facing form. It is used only to improve follow-up questions and proposal completeness.

## Proposal Generation

The proposal generator converts the conversation into structured data:

- Customer.
- Contact person.
- Site/work packages.
- Required trades.
- Workshop-related notes.
- Payment records.
- Order description.
- Missing information.

The generated proposal remains editable before confirmation.

## Voice-to-Text Intake

Voice notes are sent to the backend, then transcribed using AssemblyAI.
The transcript can be inserted into the intake flow so the manager can speak project details instead of typing everything.

Important behavior:

- Audio processing happens in the backend.
- Provider errors are surfaced to the UI.
- The frontend does not store or expose the AssemblyAI key.

## Workshop-Oriented AI Direction

The current product direction uses external workshops/subcontractors as the execution model.

The AI should:

- Identify required trades per site.
- Mention when a workshop is needed.
- Use known workshop names only when available.
- Avoid recommending internal employees in the main product flow.
- Let the manager confirm or change workshop choices.

## AI Monitoring

AI Monitoring is a separate order-level page and feature.
It reviews project tracking data and explains project health.

Inputs:

- Confirmed baseline dates.
- Planned progress.
- Actual progress.
- Progress delta.
- Predicted finish date.
- Delay status.
- Tasks and task progress.
- Issues and blockers.
- Materials status.
- Workshop schedules.
- Smart warnings.

Outputs:

- Project health summary.
- Delay and blocker explanation.
- Missing information explanation.
- Recommended manager actions.

Important rule:

The AI explains backend-calculated values. It must not invent official dates, progress percentages, or delay values.

## Current AI Limits

- AI Monitoring depends on the quality of manually entered tracking data.
- Baseline planning is still simple and manager-confirmed.
- Monitoring reports are improving, but long-term alert automation is still limited.
- OCR and RAG are planned, not currently part of the implemented core flow.
