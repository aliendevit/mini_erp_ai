# Postman Documentation Guide - AI Intake API

This guide explains how to create a Postman documentation page like the example screenshot for the AI Intake and Proposal Generation APIs.

## What We Need

Postman documentation is generated from a **Postman Collection**.

I created a ready collection file:

```text
docs/postman-ai-intake-collection.json
```

The frontend developer can import this file into Postman and publish documentation from it.

## Base URL

Default local backend URL:

```text
http://localhost:3001/api
```

If the backend runs on FastAPI default port, use:

```text
http://localhost:8000/api
```

In Postman, this is stored as a collection variable:

```text
base_url
```

## How To Import In Postman

1. Open Postman.
2. Click **Import**.
3. Select this file:

```text
docs/postman-ai-intake-collection.json
```

4. Import it as a collection.
5. Open the collection **Mini ERP AI Intake API**.
6. Make sure the collection variable `base_url` is correct.

## How To Test The AI Chat Flow

Run the requests in this order:

### 1. Create Intake Session

```http
POST {{base_url}}/ai/intakes
```

Example body:

```json
{
  "customerCompanyName": "شركة إعمار الشام",
  "orderTitle": "ترميم مطبخ وحمام وغرفة جلوس"
}
```

Expected result:

```json
{
  "id": "..."
}
```

The collection automatically saves this `id` into:

```text
intake_id
```

### 2. Send Arabic Chat Message

```http
POST {{base_url}}/ai/intakes/{{intake_id}}/messages/stream
```

Example body:

```json
{
  "content": "عندي مشروع ترميم في دمشق، حي المزة. المطبخ يحتاج إزالة بلاط قديم وتركيب سيراميك ٦٠ في ٦٠، والحمام يحتاج عزل مائي وتبديل مغسلة."
}
```

Response type:

```text
text/plain
```

This endpoint streams the assistant reply.

### 3. Send Follow-up Message

```http
POST {{base_url}}/ai/intakes/{{intake_id}}/messages/stream
```

Example body:

```json
{
  "content": "الدفع كاش، يوجد عربون ٣٠٠٠ دولار بتاريخ بداية المشروع، وورشة الشام للبلاط والعزل ستنفذ أعمال البلاط والعزل."
}
```

### 4. Generate Proposal

```http
POST {{base_url}}/ai/intakes/{{intake_id}}/proposal
```

This converts the chat conversation into structured proposal data.

Expected proposal fields include:

- customer information
- project title and summary
- proposed sites/work areas
- required trades
- workshop details
- payment drafts
- missing information

### 5. Recommend Workshop Assignments

```http
POST {{base_url}}/ai/intakes/{{intake_id}}/recommend-assignments
```

This returns workshop recommendations for proposal sites based on:

- site requirements
- required trades
- known workshops
- workshop availability

### 6. Generate Proposal PDF

```http
GET {{base_url}}/ai/intakes/{{intake_id}}/pdf?locale=ar
```

This returns the proposal as a PDF.

Use:

```text
locale=ar
```

to test Arabic PDF output.

## How To Publish Postman Documentation

After importing the collection:

1. Open the collection in Postman.
2. Add descriptions/examples if needed.
3. Click the collection menu.
4. Choose **View documentation**.
5. Click **Publish**.
6. Choose public or private visibility.
7. Share the generated documentation link with the frontend developer.

## Important Notes

- The FastAPI Swagger page still exists at:

```text
http://localhost:3001/docs
```

- Postman is optional, but useful for sharing clean API documentation with frontend developers.
- No authentication is currently required for these AI Intake endpoints in the prototype.
- Do not include `.env` or API keys in Postman documentation.

## Included Collection Sections

The Postman collection contains:

- AI Intake
  - Create Intake Session
  - Get Intake Session
  - Send Chat Message
  - Generate Proposal
  - Recommend Workshop Assignments
  - Generate PDF
  - Clear Chat Messages
- Workshops
  - List Available Workshops
  - Create Workshop

