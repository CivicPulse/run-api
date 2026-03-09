# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- Python 3.13 - All application code (pinned via `.python-version` and `pyproject.toml` requires-python `>=3.13`)

## Runtime

**Environment:**
- CPython 3.13
- Virtual environment managed by `uv` (`.venv/` present, `uv.lock` committed)

**Package Manager:**
- uv (inferred from `uv.lock` and `.python-version` conventions)
- Lockfile: present (`uv.lock`, revision 3)

**Important:** Always use `uv run` to execute Python commands. Never use system Python directly. Use `uv add` / `uv add --dev` / `uv remove` for dependency management.

## Frameworks

**Core:**
- FastAPI >=0.135.1 - Async web framework for the REST API
- Uvicorn[standard] >=0.41.0 - ASGI server to run FastAPI

**ORM / Database:**
- SQLAlchemy >=2.0.48 - ORM and database toolkit
- Alembic >=1.18.4 - Database migration management
- asyncpg >=0.31.0 - Async PostgreSQL driver (for SQLAlchemy async engine)
- psycopg2-binary >=2.9.11 - Sync PostgreSQL driver (for Alembic migrations)

**Data Validation:**
- Pydantic >=2.12.5 (with email extra) - Request/response models and validation
- Pydantic-Settings >=2.13.1 - Configuration management via environment variables

**CLI:**
- Typer >=0.24.1 - CLI tool framework (management commands)

**Logging:**
- Loguru >=0.7.3 - Structured logging

**Testing:**
- Not yet configured (no dev dependencies declared in `pyproject.toml`)

**Linting:**
- Use `ruff` for all Python linting (per project conventions, not yet in dev dependencies)

**Build/Dev:**
- No build tools configured yet (no Dockerfile, no CI config)

## Key Dependencies

**Critical:**
- `fastapi` >=0.135.1 - Core web framework; all API routes depend on this
- `sqlalchemy` >=2.0.48 - All database models and queries
- `pydantic` >=2.12.5 - All request/response schemas and validation
- `pydantic-settings` >=2.13.1 - Application configuration from env vars

**Infrastructure:**
- `alembic` >=1.18.4 - Database schema migrations
- `asyncpg` >=0.31.0 - Production async PostgreSQL connectivity
- `psycopg2-binary` >=2.9.11 - Sync PostgreSQL connectivity (migrations, scripts)
- `uvicorn[standard]` >=0.41.0 - ASGI server with lifespan support

**Utilities:**
- `loguru` >=0.7.3 - Structured logging replacement for stdlib logging
- `typer` >=0.24.1 - CLI commands (management, seeding, etc.)

## Configuration

**Environment:**
- Use `pydantic-settings` for environment variable loading
- `.env` file is gitignored (`.gitignore` includes `.env` and `.envrc`)
- No `.env` file exists yet (project is early-stage)

**Build:**
- `pyproject.toml` - Project metadata and dependencies
- `.python-version` - Python version pinning (3.13)
- No Dockerfile or docker-compose yet

## Platform Requirements

**Development:**
- Python 3.13+
- uv package manager
- PostgreSQL database (local or remote)
- ruff linter

**Production:**
- Kubernetes (stated in `init.md` as deployment target)
- PostgreSQL database
- ZITADEL authentication service at `https://auth.civpulse.org`

## Project Status

This project is in its **initial bootstrapping phase**. The only source file is the placeholder `main.py`. All dependencies are declared in `pyproject.toml` but no application structure (routes, models, services, config) has been implemented yet. The `init.md` file describes the planned feature set and priority order.

---

*Stack analysis: 2026-03-09*
