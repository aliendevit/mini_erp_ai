# Team setup with Docker

## Requirements

Install Git and Docker with the Compose v2 plugin. On Windows, start Docker Desktop in Linux-container mode. Docker builds install the application's Node and Python dependencies; you do not need to install them on the host.

## First run on a new computer

```sh
git clone --branch phase2_new_start --single-branch https://github.com/aliendevit/mini_erp_ai.git
cd mini_erp_ai
```

Copy the example configuration once:

```powershell
# Windows PowerShell
Copy-Item docker-compose.env.template .env
```

```sh
# Linux/macOS
cp docker-compose.env.template .env
```

Edit `.env` and set `POSTGRES_PASSWORD` to a strong, unique password using letters and numbers. A long random hexadecimal value also works. This value is interpolated into a database URL, so avoid URL-reserved characters. Leave the default ports and localhost URLs for a local installation. Add `GEMINI_API_KEY` or `OPENROUTER_API_KEY` for live text AI, and `ASSEMBLYAI_API_KEY` for AssemblyAI transcription. Empty provider keys allow the core ERP to start, but provider-dependent features require configuration. `GEMINI_MODEL` is configurable and defaults to `gemini-3.5-flash`.

Never commit `.env`, provider keys, saved login details, database dumps, or customer uploads. Only sanitized example configuration belongs in Git.

```sh
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 300
docker compose ps
```

The first build can take several minutes. Database migrations run before the backend starts. The default Compose file and `docker-compose.python.yml` use the same Python services.

Open the frontend at http://localhost:3000. The backend readiness endpoint is http://localhost:3001/api/ready and reports `"database": "postgresql"` when ready.

## Create the first administrator

On a new, empty installation only:

```sh
docker compose exec backend python -m app.bootstrap --email admin@example.com
```

Use your own email. The command prompts for a password with 12–128 characters, uppercase and lowercase letters, a number, and a special character. No shared default password is installed. Bootstrap refuses to create a second platform administrator, including when an existing one is inactive. For a restored installation, use its existing administrator or recover that account instead.

Sign in, create a company in the platform dashboard, and use its manager account to complete Company setup and the invoice issuer/payment details. Create a separate account for each teammate. One account has one active session, so sharing the same login causes teammates to sign each other out. Public registration and demo seeding remain disabled by default.

## Independent computers or one shared database

Each local installation has its own database and accounts. Git contains the application source and does not distribute migrated company records or passwords.

To work on the same company records, deploy one shared instance and give the team its URL and individual accounts. Before the frontend build, configure `FRONTEND_ORIGIN` and `NEXT_PUBLIC_API_BASE` with addresses reachable from their browsers. `localhost` points to each teammate's own computer. For HTTPS, configure a TLS reverse proxy and set `SESSION_COOKIE_SECURE=true`. Rebuild the frontend when changing its public API address.

## Updates and data preservation

Keep the current `.env`, Compose project name, and Docker volumes. Do not copy a blank template over an existing `.env`, change the database password without a planned rotation, or change the project name accidentally; a different project name uses different volumes.

Take a verified database/upload backup before applying schema updates to an installation containing business data. Then, from its checkout:

```sh
git pull --ff-only origin phase2_new_start
docker compose up -d --build --wait --wait-timeout 300
```

Stop without deleting stored data:

```sh
docker compose down
```

Do not use `docker compose down -v` for a database you need to keep. The `-v` option deletes its volumes. The recovery scripts and private migration backups from an individual workstation are intentionally not included in this repository.

## Troubleshooting

```sh
docker compose ps
docker compose logs --tail 100 backend frontend db
```

- Missing password: set `POSTGRES_PASSWORD` in the root `.env`.
- Port already used: set `FRONTEND_PORT`/`BACKEND_PORT` and update the origin/API URLs to match before rebuilding.
- Invalid login after restoring data: use the credentials for that restored installation; a source checkout does not create the old accounts.
- AI provider error: check the configured key, model availability, and provider account quota. Never paste keys into public issues or logs.

## Automated checks

GitHub Actions runs the backend tests, frontend production build, and a fresh Docker startup with PostgreSQL on pushes to `phase2_new_start`. The Docker check uses disposable CI data and no live AI keys; it does not access or migrate a teammate's database.
