# Omran Language Lock And RAG Capture Flow Report

Generated: 2026-06-21
Branch: A22UI

## Scope

This report documents a fresh AI intake conversation flow after adding Omran's language-lock behavior and translated persona prompts.

The flow was executed through the real FastAPI routes against the configured local PostgreSQL database. The assistant text generation was deterministic for the test run, but authentication, intake creation, chat persistence, RAG capture, RAG upload, pgvector storage, and RAG query were real.

## Implemented Language Behavior

Omran now locks the conversation language from the first manager message.

Rules:

- The first manager message establishes the conversation language.
- Isolated foreign words do not switch the conversation language.
- Names, addresses, workshop names, quoted text, technical terms, and RAG snippets do not switch the language.
- Omran switches language only when the manager directly asks for a switch.

The system prompt now exists in:

- English
- German
- Arabic

Canonical prompt reference:

`docs/omran-system-prompt.md`

## Scenario Metadata

Scenario key:

`OMRAN-LANG-RAG-20260621-192059`

User:

| Field | Value |
| --- | --- |
| Email | `aa@gmal.com` |
| User id | `c0b7ba36-727a-4f29-a000-c8362fcf8a51` |

Proposal:

| Field | Value |
| --- | --- |
| Proposal id | `6fd73045-cb7e-4264-9c7a-052f39de6cd9` |
| Title | `OMRAN-LANG-RAG-20260621-192059 Language lock renovation` |
| Status | `draft` |
| Database | `postgresql` |

## Conversation Flow

### Turn 1

Manager:

```text
OMRAN-LANG-RAG-20260621-192059: We have a new project for Atlas Dental GmbH in Hamburg. Renovate reception and treatment room two. Budget target is 96000 EUR, start 2026-09-14.
```

Prompt language mode:

`english`

Omran replied:

```text
Omran captured this in English and will keep the intake language as English unless you explicitly ask to switch.
```

RAG captured:

- raw manager message
- conversation language started in English
- customer is Atlas Dental GmbH
- project is reception and treatment-room renovation in Hamburg
- budget target is 96000 EUR

### Turn 2

Manager:

```text
The site is the Hamburg reception Baustelle, also called الموقع by the client. Keep treatment room two open. Weekend drilling only, dust containment required. This is just terminology, no language switch.
```

Prompt language mode:

`english`

Omran replied:

```text
Omran captured this in English and will keep the intake language as English unless you explicitly ask to switch.
```

What this proves:

- The German word `Baustelle` did not switch the language.
- The Arabic word `الموقع` did not switch the language.
- Omran stayed in English because there was no direct switch request.

RAG captured:

- raw manager message
- mixed Arabic/German terms appeared inside an English conversation without a switch request
- site referred to as `Hamburg reception Baustelle / الموقع`
- weekend drilling only
- dust containment required
- treatment room two remains open

### Turn 3

Manager:

```text
Please switch to Arabic for the rest of this intake, but keep Atlas Dental GmbH and 96000 EUR exactly as written.
```

Prompt language mode:

`arabic`

Omran replied:

```text
تم التحويل إلى العربية بناءً على طلبك الصريح. سجّلت أن المشروع ما زال خاصاً بعيادة Atlas Dental، مع إبقاء الأسماء والمبالغ كما ذكرتها.
```

What this proves:

- A direct switch request changes the locked language.
- Omran switched to Arabic after the manager explicitly asked.
- Exact names and amounts stayed unchanged.

RAG captured:

- raw manager message
- manager explicitly requested switching the conversation language to Arabic
- Omran should answer in Arabic after this request

## RAG Storage Summary

| Area | Count |
| --- | ---: |
| RAG sources | 5 |
| RAG chunks | 15 |
| RAG ingestion jobs | 5 |
| Non-null pgvector embeddings | 15 |

Sources:

| Source type | Count | Meaning |
| --- | ---: | --- |
| `chat_fact` | 3 | One RAG source for each manager chat message |
| `proposal_snapshot` | 1 | Saved UI/draft snapshot |
| `uploaded_file` | 1 | Uploaded text note from the RAG memory flow |

Chunks:

| Chunk type | Count | Trust level |
| --- | ---: | --- |
| `raw_chat_message` | 3 | `raw_user_input` |
| `extracted_chat_fact` | 9 | `extracted_unconfirmed` |
| `proposal_snapshot` | 2 | `manager_saved` |
| `text_chunk` | 1 | `extracted_unconfirmed` |

Jobs:

All five ingestion jobs completed:

- `status = complete`
- `stage = complete`
- `errorMessage = null`

All RAG sources were created by:

`c0b7ba36-727a-4f29-a000-c8362fcf8a51`

## Uploaded RAG Note

Uploaded text source:

`OMRAN-LANG-RAG-20260621-192059-language-rag-note.txt`

Captured text:

```text
OMRAN-LANG-RAG-20260621-192059: RAG upload note. Reception access is blocked on Sundays after 18:00. The dust curtain inspection must be logged before each drilling window. Language note: initial language English, mixed terms do not switch language unless directly requested.
```

## RAG Retrieval Result

RAG query used:

```text
What language behavior and site constraints were captured?
```

Top retrieved chunks included:

| Source type | Chunk type | Score | Retrieved text |
| --- | --- | ---: | --- |
| `chat_fact` | `extracted_chat_fact` | `0.196116` | Work constraints include weekend drilling, dust containment, and keeping treatment room two open. |
| `chat_fact` | `extracted_chat_fact` | `0.182574` | Mixed Arabic and German terms appeared inside an English conversation without a language switch request. |
| `chat_fact` | `extracted_chat_fact` | `0.158114` | Conversation language started in English. |
| `uploaded_file` | `text_chunk` | `0.147087` | Reception access is blocked on Sundays after 18:00. The dust curtain inspection must be logged before each drilling window. Language note: initial language English, mixed terms do not switch language unless directly requested. |
| `proposal_snapshot` | `proposal_snapshot` | `0.141711` | Mixed Arabic/German site terms were terminology only; language stayed English until explicit Arabic switch. |
| `chat_fact` | `extracted_chat_fact` | `0.117851` | Manager explicitly requested switching the conversation language to Arabic. |

## Important Note

RAG captures manager/user messages and derived facts. Omran assistant replies are stored in `ProposalMessage` conversation history, but they are not currently captured as `chat_fact` RAG sources.

## Final RAG Table Query And Result

SQL query:

```sql
SELECT
  s."sourceType",
  c."chunkType",
  c."trustLevel",
  COUNT(*) AS chunk_count,
  BOOL_AND(c."embedding" IS NOT NULL) AS pgvector_ready
FROM "RagSource" s
JOIN "RagChunk" c ON c."sourceId" = s.id
WHERE s."proposalId" = '6fd73045-cb7e-4264-9c7a-052f39de6cd9'
GROUP BY s."sourceType", c."chunkType", c."trustLevel"
ORDER BY s."sourceType", c."chunkType", c."trustLevel";
```

Result:

| sourceType | chunkType | trustLevel | chunk_count | pgvector_ready |
| --- | --- | --- | ---: | --- |
| `chat_fact` | `extracted_chat_fact` | `extracted_unconfirmed` | 9 | `true` |
| `chat_fact` | `raw_chat_message` | `raw_user_input` | 3 | `true` |
| `proposal_snapshot` | `proposal_snapshot` | `manager_saved` | 2 | `true` |
| `uploaded_file` | `text_chunk` | `extracted_unconfirmed` | 1 | `true` |
