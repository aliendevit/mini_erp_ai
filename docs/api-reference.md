# API Reference

## Base URL

Local development backend:

```text
http://localhost:3001
```

Most endpoints are under:

```text
/api
```

Example:

```text
POST http://localhost:3001/api/ai/intakes
```

## General Notes

- Request and response bodies are JSON unless the endpoint uploads files or streams output.
- AI provider keys stay in backend environment variables only.
- The frontend should call the backend endpoints, not AI providers directly.
- Swagger is available through FastAPI during local development.
- A Postman collection exists at `docs/postman-ai-intake-collection.json`.

## AI Intake Endpoints

### Create Intake Session

```http
POST /api/ai/intakes
```

Creates a new AI intake draft.

Typical response includes an intake/proposal id used in later requests.

### List Intake Sessions

```http
GET /api/ai/intakes
```

Returns saved intake drafts for the sidebar/history view.

### Get Intake Session

```http
GET /api/ai/intakes/{proposal_id}
```

Returns the selected intake draft, messages, extracted facts, proposal data, and status.

### Update Intake Draft

```http
PUT /api/ai/intakes/{proposal_id}
```

Updates editable proposal/intake fields from the UI.

### Delete Intake Session

```http
DELETE /api/ai/intakes/{proposal_id}
```

Deletes one intake draft and its related messages/facts.

### Clear Intake Messages

```http
DELETE /api/ai/intakes/{proposal_id}/messages
```

Removes all chat messages for one intake session.

### Delete One Intake Message

```http
DELETE /api/ai/intakes/{proposal_id}/messages/{message_id}
```

Deletes a single message from the intake chat history.

### Send Chat Message

```http
POST /api/ai/intakes/{proposal_id}/messages/stream
```

Sends a manager message and streams the assistant response.

Example body:

```json
{
  "content": "عندي مشروع ترميم لمطبخ وحمام وغرفة معيشة"
}
```

### Transcribe Voice Note

```http
POST /api/ai/intakes/{proposal_id}/messages/transcribe
```

Uploads an audio file and returns transcription details.

### Generate Proposal

```http
POST /api/ai/intakes/{proposal_id}/proposal
```

Generates structured proposal data from the intake conversation.

### Recommend Workshop Assignments

```http
POST /api/ai/intakes/{proposal_id}/recommend-assignments
```

Returns workshop-oriented assignment suggestions and missing workshop information.

### Confirm Proposal To Order

```http
POST /api/ai/intakes/{proposal_id}/confirm
```

Converts a reviewed intake proposal into an order.

### Proposal PDF

```http
GET /api/ai/intakes/{proposal_id}/pdf
```

Returns a generated proposal PDF.

## Workshop Endpoints

### List Workshops

```http
GET /api/workshops
```

Returns global workshop partners.

### Create Workshop

```http
POST /api/workshops
```

Creates a workshop partner.

Example body:

```json
{
  "name": "Al Sham Tile Workshop",
  "contactPerson": "Ahmad",
  "phone": "0930000000",
  "email": "workshop@example.com",
  "specialties": ["tile", "waterproofing"],
  "active": true,
  "available": true,
  "notes": "Trusted partner for bathrooms and balconies"
}
```

### Update Workshop

```http
PUT /api/workshops/{workshop_id}
```

Updates workshop details, specialties, active state, or availability.

### Delete Workshop

```http
DELETE /api/workshops/{workshop_id}
```

Deletes or deactivates a workshop depending on backend behavior.

## Order And Site Endpoints

### List Orders

```http
GET /api/orders
```

### Get Order

```http
GET /api/orders/{order_id}
```

### Create Order

```http
POST /api/orders
```

### Update Order

```http
PUT /api/orders/{order_id}
```

### Delete Order

```http
DELETE /api/orders/{order_id}
```

### List Sites

```http
GET /api/sites
```

### Create Site

```http
POST /api/sites
```

### Update Site

```http
PUT /api/sites/{site_id}
```

### Delete Site

```http
DELETE /api/sites/{site_id}
```

## Workshop Assignment Endpoints

### List Assignments For Order

```http
GET /api/orders/{order_id}/workshop-assignments
```

### Assign Workshop To Site

```http
POST /api/orders/{order_id}/workshop-assignments
```

Example body:

```json
{
  "siteId": 1,
  "workshopId": 3,
  "coveredSkills": ["tile", "waterproofing"],
  "status": "planned",
  "startDate": "2026-06-10",
  "endDate": "2026-06-15",
  "notes": "Bathroom floor and waterproofing"
}
```

### Update Assignment

```http
PUT /api/workshop-assignments/{assignment_id}
```

### Delete Assignment

```http
DELETE /api/workshop-assignments/{assignment_id}
```

Scheduling rule:

Two different workshops cannot be scheduled on the same site with overlapping date ranges.

## Project Tracking Endpoints

### Get Tracking Data

```http
GET /api/orders/{order_id}/tracking
```

Returns dashboard, site progress, warnings, tasks, issues, materials, photos, workshop schedules, and baseline data.

### Suggest Baseline

```http
POST /api/orders/{order_id}/tracking/baseline/suggest
```

Creates draft baseline dates for sites. Draft baselines must be confirmed by the manager.

### Confirm/Edit Baseline

```http
PUT /api/orders/{order_id}/tracking/baseline/{site_id}
```

Updates planned start/end dates and confirmation status.

### Analyze Tracking With AI

```http
POST /api/orders/{order_id}/tracking/analyze
```

Generates AI monitoring explanation based on backend tracking values.

### Monitoring History

```http
GET /api/orders/{order_id}/tracking/monitoring-history
```

Returns previous monitoring reports if stored.

### Monitoring Alerts

```http
GET /api/orders/{order_id}/tracking/alerts
PATCH /api/orders/{order_id}/tracking/alerts/{alert_id}
```

Reads and updates monitoring alerts.

### Progress Updates

```http
POST /api/orders/{order_id}/progress-updates
PUT /api/progress-updates/{update_id}
DELETE /api/progress-updates/{update_id}
```

### Photos

```http
POST /api/progress-updates/{update_id}/photos
```

Uploads progress photos for a progress update.

### Tasks

```http
POST /api/orders/{order_id}/tasks
PUT /api/tasks/{task_id}
DELETE /api/tasks/{task_id}
```

Tasks can include weight and progress values used in actual progress calculation.

### Issues

```http
POST /api/orders/{order_id}/issues
PUT /api/issues/{issue_id}
DELETE /api/issues/{issue_id}
```

### Materials

```http
POST /api/orders/{order_id}/materials
PUT /api/materials/{material_id}
DELETE /api/materials/{material_id}
```

## Invoice Endpoints

### List Invoices

```http
GET /api/invoices
```

### Get Invoice

```http
GET /api/invoices/{invoice_id}
```

### Update Invoice

```http
PUT /api/invoices/{invoice_id}
```

### Delete Invoice

```http
DELETE /api/invoices/{invoice_id}
```

### Invoice PDF / Word

```http
GET /api/invoices/{invoice_id}/pdf
GET /api/invoices/{invoice_id}/word
```

### Draft Invoice Groups

```http
GET /api/draft-invoice-groups
POST /api/draft-invoice-groups/{group_id}/merge
```

## Recommended Postman Test Flow

1. Create intake session.
2. Send Arabic chat message.
3. Send follow-up chat message.
4. Generate proposal.
5. Recommend workshop assignments.
6. Confirm proposal to order.
7. Open order tracking.
8. Add tasks/issues/materials.
9. Suggest and confirm baseline.
10. Run AI monitoring analysis.
11. Generate proposal or invoice PDF.
