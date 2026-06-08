# API Testing Guide

This guide explains how the frontend developer or tester can validate the backend without using Swagger.

Use it with this Postman collection:

```text
docs/documentaion/postman-omran-api-collection.json
```

## 1. Start The Backend

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001
```

Base URL:

```text
http://localhost:3001/api
```

Health check:

```http
GET http://localhost:3001/api/health
```

Expected result:

```json
{ "ok": true, "time": "..." }
```

## 2. Import Collection In Postman

1. Open Postman.
2. Click Import.
3. Select `docs/documentaion/postman-omran-api-collection.json`.
4. Open the collection variables.
5. Confirm these values:

| Variable | Value |
| --- | --- |
| `base_url` | `http://localhost:3001/api` |
| `locale` | `ar` |
| `intake_id` | empty before creating an intake |
| `order_id` | set after confirming/choosing an order |
| `site_id` | set when testing site-specific tracking |
| `workshop_id` | set after creating or choosing a workshop |

Important: Postman sends the `Current value`, not only the `Initial value`.

## 3. AI Intake Test Order

Run these requests in order:

| Step | Request | Expected Result |
| --- | --- | --- |
| 1 | Health Check | Backend returns `ok: true`. |
| 2 | Create Intake Session | Response contains `id`; test script saves it as `intake_id`. |
| 3 | Get Intake Session | Returns the created intake draft. |
| 4 | Send Arabic Chat Message | Assistant returns a streamed Arabic reply. |
| 5 | Send Follow-up Chat Message | Assistant updates the same intake context. |
| 6 | Generate Proposal | Returns structured proposal data and proposed sites. |
| 7 | Recommend Workshop Assignments | Returns workshop suggestions and missing workshop warnings. |
| 8 | Get Proposal PDF | Returns PDF; use Send and Download if preview is blank. |

## 4. Workshop Tests

Run:

1. List Available Workshops.
2. Create Workshop.
3. List Available Workshops again.

The created workshop request sets `workshop_id` automatically if the response includes an id.

## 5. Tracking And AI Monitoring Tests

These endpoints need a real `order_id`.

Get an `order_id` from:

- the frontend Orders page,
- `GET /api/orders`,
- or the intake confirmation response.

Then run:

| Request | Purpose |
| --- | --- |
| Get Order Tracking | Reads tracking dashboard, tasks, issues, materials, warnings, baselines, and progress values. |
| Suggest Baseline | Creates draft baseline schedule suggestions. |
| Analyze AI Monitoring | Generates project health explanation from tracking data. |
| Get Monitoring Alerts | Reads open/resolved/dismissed monitoring alerts. |

## 6. Common Errors

| Error | Cause | Fix |
| --- | --- | --- |
| `404 Not Found` on chat | `intake_id` is empty or wrong | Run Create Intake Session again. |
| URL contains `/intakes//messages` | `intake_id` current value is empty | Set current value or rerun Create Intake. |
| `422 Unprocessable Entity` | JSON body does not match schema | Check required body fields. |
| AI request fails | Provider key missing or provider error | Check backend `.env` and terminal logs. |
| PDF preview blank | Postman preview limitation | Use Send and Download. |
| Arabic text broken | Encoding issue | Use the new collection file in this folder; it stores Arabic safely. |

## 7. Frontend Integration Notes

- Frontend does not need Gemini, OpenRouter, or AssemblyAI keys.
- Frontend calls backend endpoints only.
- Backend handles AI providers, transcription, proposal generation, and monitoring analysis.
- Chat uses the streaming endpoint.
- PDF should be opened in a new tab or downloaded as a blob.

## 8. Minimal Acceptance Checklist

- Intake session can be created.
- Arabic chat message returns assistant text.
- Proposal generation returns sites/work packages.
- Workshop recommendation returns available workshop suggestions.
- Proposal PDF downloads correctly.
- Tracking endpoint returns order dashboard data.
- AI Monitoring endpoint returns analysis for the selected order.
