# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Early-stage project — scaffold only. No application architecture is implemented yet. The project declares a FastAPI + SQLAlchemy + PostgreSQL stack in `pyproject.toml` but contains only a placeholder `main.py`.

**Key Characteristics:**
- Project is pre-implementation; only a hello-world entry point exists
- Dependencies declare intent for a layered async web API (FastAPI, SQLAlchemy, asyncpg, Alembic)
- Authentication is planned to be externalized to ZITADEL (https://auth.civpulse.org)
- Deployment target is Kubernetes
- Development methodology follows Specification-Driven Development (SDD) as documented in `docs/spec_driven_dev(SDD).md`

## Planned Stack (from `pyproject.toml`)

**Web Framework:** FastAPI (`fastapi>=0.135.1`) with Uvicorn (`uvicorn[standard]>=0.41.0`)
**ORM:** SQLAlchemy (`sqlalchemy>=2.0.48`) with async driver asyncpg (`asyncpg>=0.31.0`)
**Migrations:** Alembic (`alembic>=1.18.4`)
**Validation/Settings:** Pydantic (`pydantic[email]>=2.12.5`, `pydantic-settings>=2.13.1`)
**CLI:** Typer (`typer>=0.24.1`)
**Logging:** Loguru (`loguru>=0.7.3`)
**Database Driver (sync):** psycopg2-binary (`psycopg2-binary>=2.9.11`) — likely for Alembic migrations

## Intended Layers (not yet built)

Based on the declared dependencies and `init.md` feature list, the following architectural layers are anticipated:

**API Layer:**
- Purpose: HTTP endpoints via FastAPI
- Location: Not yet created (typical: `app/api/` or `app/routers/`)
- Framework: FastAPI with Pydantic request/response models

**Service/Business Logic Layer:**
- Purpose: Campaign management, constituent management, event management, etc.
- Location: Not yet created (typical: `app/services/`)
- Contains: Business rules, orchestration logic

**Data Access Layer:**
- Purpose: Database models and queries via SQLAlchemy
- Location: Not yet created (typical: `app/models/`, `app/repositories/`)
- Database: PostgreSQL with async access via asyncpg

**Migration Layer:**
- Purpose: Schema migrations via Alembic
- Location: Not yet created (typical: `alembic/`)
- Tool: Alembic with psycopg2-binary for sync migration execution

**Authentication Layer:**
- Purpose: Token validation and user identity
- Location: Not yet created
- Provider: ZITADEL (external, at https://auth.civpulse.org)

**CLI Layer:**
- Purpose: Management commands (likely DB seeding, admin tasks)
- Location: Not yet created
- Tool: Typer

## Planned Domain Areas (from `init.md`)

The API is intended to serve as a political campaign management platform with these domain areas, listed by priority:

1. **Authentication & User Management** — ZITADEL integration, user CRUD, role/permission assignment
2. **Campaign Management** — Campaign CRUD, owner assignment, multi-tenancy
3. **Third-party Integrations** — Mailgun, Stripe, Facebook, X (Twitter), Twilio
4. **Constituent Management** — Voter CRUD, CSV import, contact info
5. **Canvassing Management** — Canvassing effort CRUD, volunteer assignment, progress tracking
6. **Phone Banking Management** — Phone bank CRUD, volunteer assignment, progress tracking
7. **Volunteer Management** — Volunteer CRUD, skill tracking, event/task assignment
8. **Event Management** — Event CRUD, RSVP, volunteer assignment
9. **Donation Management** — Donation CRUD, donor tracking, reporting
10. **CRM** — Relationship tracking, interaction history, segmentation
11. **Analytics & Reporting** — Performance reports, visualizations
12. **Campaign Website Management** — Cloudflare domain/hosting, CNAME to civipulse.org subdomain

## Entry Points

**Current Entry Point:**
- Location: `main.py`
- Triggers: `uv run main.py` or `uv run python main.py`
- Responsibilities: Prints "Hello from run-api!" — placeholder only

**Intended Entry Points (not yet created):**
- FastAPI application (likely `app/main.py` or `app/__init__.py`) served by Uvicorn
- Typer CLI for management commands
- Alembic for database migrations

## Error Handling

**Strategy:** Not yet implemented. Loguru is declared as the logging dependency, suggesting structured logging is planned. FastAPI's exception handler pattern is the expected approach.

## Cross-Cutting Concerns

**Logging:** Loguru declared but not yet configured
**Validation:** Pydantic declared (including email validation via `pydantic[email]`)
**Configuration:** pydantic-settings declared for environment-based config
**Authentication:** ZITADEL (external OpenID Connect / OAuth2 provider)

## Development Methodology

The project follows Specification-Driven Development (SDD) as documented in `docs/spec_driven_dev(SDD).md`. Key implications for architecture:

- Features should be specified in `specs/` directories before implementation
- Implementation plans are generated from specifications
- Test-first development is mandated
- Specifications are the source of truth, not code

---

*Architecture analysis: 2026-03-09*
