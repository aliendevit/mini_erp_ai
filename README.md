# Simple Accounting System (V2 – Strict FK deletes)

This is a minimal accounting / time-tracking system for a German renovation/construction company.

- **GUI language:** German
- **Tech:** PostgreSQL + Node/TypeScript (Express + Prisma) + Next.js
- **DB integrity (V2):** **strict foreign keys**. If a record is referenced, **PostgreSQL blocks the delete**.

---

## 0) Prerequisites (once)

1) Install **Docker Desktop**
2) Start Docker Desktop and wait until it says it is running.

> Tip (Windows): use **PowerShell**.

---

## 1) Start with an EMPTY database (recommended)

If you already ran any previous version, do this once to ensure an empty DB:

```bash
docker compose down -v
```

`-v` deletes the database volume (all data).

---

## 2) Run V2

Open a terminal **in this folder** (where `docker-compose.yml` is) and run:

```bash
docker compose up --build
```

Keep this terminal open (it shows logs).

---

## 3) Open the system

- **Frontend (GUI):** http://localhost:3000
- **Backend health:** http://localhost:3001/api/health

Database is empty at first.

---

## 4) Stop the system

Press **CTRL + C** in the terminal.

Then run:

```bash
docker compose down
```

---

## 5) Reset the database (delete all data)

```bash
docker compose down -v
```

Then start again:

```bash
docker compose up --build
```

---

## 6) Remove old V1 project safely

### A) Stop and delete the old containers + DB

Open a terminal **in the old V1 folder** and run:

```bash
docker compose down -v --rmi all
```

This removes:
- containers
- the DB volume (data)
- images built by that compose project

### B) Delete the old folder

Now you can delete the old project folder normally.

> If Docker says something is still in use, ensure you ran `docker compose down` successfully and Docker Desktop is running.

---

## Notes about Deletes (V2 behavior)

The GUI shows **Löschen** buttons everywhere.

- If the record is **not referenced**, it will be deleted.
- If the record **is referenced** (e.g., an Auftrag has Baustellen, or Arbeitszeiten exist), **PostgreSQL blocks the delete**.
- The backend returns a **German explanation** (HTTP 409), and the GUI shows it.

Typical examples:
- Auftrag löschen → blocked if Baustellen/Arbeitszeiten exist
- Baustelle löschen → blocked if Arbeitszeiten exist
- Mitarbeiter löschen → blocked if Arbeitszeiten/Zuordnungen exist

---

## Quick sanity test (optional)

1) Create **Kunde**
2) Create **Auftrag**
3) Open Auftrag → create **Baustelle**
4) Create **Mitarbeiter**
5) Open Auftrag → **Mitarbeiter zuweisen**
6) Create **Arbeitszeit** (creates Entwurf-Rechnung)
7) Open **Entwurf-Rechnungen** → group → merge/split → see new invoices
8) Open invoice → **PDF öffnen**
