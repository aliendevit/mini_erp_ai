# OMRAN ERP - Deployment Operations Checklist

This checklist covers the first practical deployment-readiness work for backups, restore, logging, Arabic/RTL review, and performance cleanup.

## 1. Backups

### PostgreSQL backup

Run from `backend-python`:

```powershell
.\.venv\Scripts\python.exe scripts\backup_data.py
```

This creates a timestamped folder in `backend-python/backups/` containing:

- `database.dump`
- `uploads.zip`
- `manifest.json`

The script reads `DATABASE_URL`. When `DATABASE_URL` points to PostgreSQL, it uses `pg_dump --format=custom --no-owner`.

### PostgreSQL restore

Stop the backend first, then run:

```powershell
.\.venv\Scripts\python.exe scripts\restore_data.py .\backups\omran-backup-YYYYMMDD-HHMMSS --yes
```

Restore uses `pg_restore --clean --if-exists --no-owner` and overwrites uploaded files. Test restore on a copied/staging database before using it on real production data.

### SQLite local demo backup

SQLite is still supported for local demos and automated tests. When `DATABASE_URL=sqlite:///./app.db`, backups contain `app.db` instead of `database.dump`.

### Production backup requirement

For a real deployment, use PostgreSQL managed backups in addition to the app backup feature. Uploaded project photos and generated documents must also be backed up through server storage snapshots or object-storage versioning.

## 2. Error Logging

Backend request/error logs are written to:

```text
backend-python/logs/app.log
```

Each API request logs:

- request ID
- method
- path
- status code
- duration in milliseconds

Unhandled backend exceptions are logged with the request path and error message. The API response includes an `x-request-id` header so a frontend failure can be matched to backend logs.

Optional environment setting:

```env
LOG_LEVEL=INFO
```

## 3. Health Check

Use this endpoint after deployment:

```text
GET /api/health
```

Expected:

```json
{ "ok": true, "database": "postgresql" }
```

## 4. Arabic / RTL QA

Review these pages in Arabic mode:

- `/`
- `/ai-intake`
- `/orders`
- `/orders/{id}`
- `/orders/{id}/tracking`
- `/orders/{id}/monitoring`
- `/monitoring`
- `/invoices`
- proposal PDF output
- invoice PDF output

Check for:

- overlapping text
- broken Arabic characters
- reversed mixed Arabic/English numbers
- unreadable form fields
- buttons with clipped labels
- tables that overflow mobile width
- PDF Arabic text that is disconnected, reversed, or missing

## 5. Performance Checks

High-risk areas as data grows:

- AI Intake session history
- project/order lists
- invoice lists
- tracking photos
- global AI monitoring project list

Current first cleanup:

- The global `/monitoring` page now reads saved open alerts without forcing alert resynchronization for every project row.

Recommended next cleanup:

- Add server-side pagination for orders, invoices, customers, workshops, and AI intake sessions.
- Lazy-load tracking photos.
- Limit global monitoring list summaries to visible rows or add backend summary endpoint.

## 6. Minimum Release Verification

Run before demo/internal pilot:

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m unittest discover tests
```

```powershell
cd frontend
npm run build
```

Also manually test:

- AI Intake to proposal
- proposal confirmation to order
- workshop assignment
- tracking tabs
- AI Monitoring
- invoice PDF/Word export
- backup creation
- restore on a copied/staging database
