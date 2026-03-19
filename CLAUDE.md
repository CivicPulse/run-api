# CLAUDE.md

## Project Overview

CivicPulse Run — a multi-tenant political campaign field operations API.

- **Stack:** Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS, ZITADEL (OIDC auth)
- **Frontend:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Package manager:** Always use `uv` (not pip/poetry) for local operations

## Development Environment

```bash
docker compose up -d                # Start all services
docker compose down                 # Stop all services
docker compose logs api --tail=50   # Check API logs
```

Services: API (:8000), PostgreSQL (:5433), MinIO (:9000/:9001), ZITADEL (:8080)

### Seed Data

Idempotent Macon-Bibb County GA demo dataset (safe to run multiple times):

```bash
docker compose exec api bash -c "PYTHONPATH=/home/app python /home/app/scripts/seed.py"
```

Creates: 8 users, 1 org, 1 campaign, 50 voters (with PostGIS coords), 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts, 190 voter interactions, survey responses, tags, DNC entries, invites, and addresses.

Script: `scripts/seed.py`

### TLS Configuration

For local dev, `.env` should have:
```bash
ZITADEL_TLS_MODE=disabled
ZITADEL_EXTERNAL_SECURE=false
ZITADEL_DOMAIN=localhost
DISABLE_TLS=true
```

For Tailscale access, switch to:
```bash
ZITADEL_TLS_MODE=enabled
ZITADEL_EXTERNAL_SECURE=true
ZITADEL_DOMAIN=dev.tailb56d83.ts.net
# Remove DISABLE_TLS or set to false
```

## Code Style

- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` (asyncio_mode=auto, markers: integration, e2e)

## Project Structure

- `app/` — FastAPI application (models, routes, services, core)
- `alembic/` — Database migrations (async via asyncpg)
- `scripts/` — Dev utilities (seed.py, bootstrap-zitadel.py, etc.)
- `tests/` — Unit and integration tests
- `.planning/` — GSD planning directory
