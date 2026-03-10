---
phase: 01-authentication-and-multi-tenancy
plan: 01
subsystem: auth
tags: [jwt, zitadel, authlib, rls, postgresql, fastapi, sqlalchemy, asyncpg, alembic]

requires:
  - phase: none
    provides: greenfield project

provides:
  - FastAPI app factory with health endpoint and problem details
  - SQLAlchemy models (Campaign, User, CampaignMember) with mapped_column
  - Alembic migration with RLS policies and app_user database role
  - JWT/JWKS validation via Authlib with automatic key rotation
  - Role hierarchy enforcement (viewer < volunteer < manager < admin < owner)
  - RLS session variable helper using set_config()
  - Async database session factory and get_db dependency
  - Pydantic settings configuration
  - Docker Compose for local PostgreSQL with PostGIS

affects: [01-02, 01-03, 02-voter-data-management]

tech-stack:
  added: [authlib, httpx, fastapi-problem-details, ruff, pytest, pytest-asyncio]
  patterns: [app factory, dependency injection, RLS via set_config, JWKS cache with retry]

key-files:
  created:
    - app/main.py
    - app/core/config.py
    - app/core/security.py
    - app/core/errors.py
    - app/db/base.py
    - app/db/session.py
    - app/db/rls.py
    - app/models/campaign.py
    - app/models/user.py
    - app/models/campaign_member.py
    - app/schemas/common.py
    - app/api/health.py
    - app/api/v1/router.py
    - alembic/versions/001_initial_schema.py
    - alembic/env.py
    - docker-compose.yml
    - .env.example
    - tests/conftest.py
    - tests/unit/test_security.py
  modified:
    - pyproject.toml
    - main.py

key-decisions:
  - "Used StrEnum for campaign type/status enums per ruff UP042 recommendation"
  - "JWKS cached indefinitely until decode failure triggers refresh (no TTL timer)"
  - "RLS policies use current_setting with true flag to return NULL on missing instead of error"
  - "app_user role created with DO block to be idempotent on re-runs"

patterns-established:
  - "App factory pattern: create_app() in app/main.py"
  - "Dependency injection: get_current_user and require_role for auth"
  - "RLS context: set_campaign_context() using SELECT set_config()"
  - "Alembic async: async engine via asyncpg for online migrations"

requirements-completed: [AUTH-01, AUTH-04]

duration: 7min
completed: 2026-03-09
---

# Phase 01 Plan 01: Foundation Summary

**FastAPI app skeleton with Authlib JWT/JWKS validation, PostgreSQL RLS via set_config(), and 17 passing auth unit tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T16:31:30Z
- **Completed:** 2026-03-09T16:39:29Z
- **Tasks:** 2
- **Files modified:** 30

## Accomplishments
- Complete FastAPI project structure with app factory, health endpoint, v1 router skeleton
- Three SQLAlchemy models (Campaign, User, CampaignMember) with full field specs from CONTEXT.md
- Alembic migration creating tables, enabling RLS, creating policies, and setting up app_user role
- JWT validation with Authlib JWKS, automatic key rotation on unknown kid, ZITADEL nested role extraction
- 17 unit tests covering valid/expired/bad-signature tokens, role hierarchy, and claim extraction

## Task Commits

Each task was committed atomically:

1. **Task 1: Project skeleton, config, Docker, and database models** - `9f2022d` (feat)
2. **Task 2: JWT validation with Authlib JWKS and role enforcement** - `8cad610` (test)

## Files Created/Modified
- `app/main.py` - FastAPI app factory with lifespan handler for JWKSManager
- `app/core/config.py` - Pydantic settings with database and ZITADEL config
- `app/core/security.py` - JWKSManager, JWT validation, role enforcement, AuthenticatedUser
- `app/core/errors.py` - Problem details init, domain exceptions (CampaignNotFound, etc.)
- `app/db/base.py` - SQLAlchemy DeclarativeBase with model imports for Alembic
- `app/db/session.py` - Async engine, session factory, get_db dependency
- `app/db/rls.py` - set_campaign_context() using set_config() for asyncpg
- `app/models/campaign.py` - Campaign model with all CONTEXT.md fields
- `app/models/user.py` - User model with ZITADEL sub as string PK
- `app/models/campaign_member.py` - Membership join table (no role column)
- `app/schemas/common.py` - BaseSchema, PaginatedResponse generic
- `app/api/health.py` - GET /health returning {"status": "ok"}
- `app/api/v1/router.py` - V1 API router with /api/v1 prefix
- `alembic/versions/001_initial_schema.py` - Tables, RLS policies, app_user role
- `docker-compose.yml` - PostgreSQL with PostGIS 17-3.5
- `tests/conftest.py` - RSA key pair, JWT helper, test app/client fixtures
- `tests/unit/test_security.py` - 17 tests for JWT, roles, JWKS, claims

## Decisions Made
- Used StrEnum for campaign enums (ruff UP042 modernization)
- JWKS cached indefinitely with retry-on-failure (no background timer needed)
- RLS policies use `current_setting('...', true)` for NULL-safe missing config
- app_user role creation wrapped in DO block for idempotent migrations
- B008 ruff rule suppressed globally since Depends() in default args is standard FastAPI pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Docker not available in execution environment -- docker-compose.yml created and validated structurally but not tested with running containers
- uv not on PATH initially -- installed via official installer script

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- Foundation complete: app boots, models defined, auth middleware ready
- Docker PostgreSQL + Alembic migration ready for local testing
- JWT validation tested with 17 unit tests
- Ready for Plan 02 (campaign CRUD endpoints) and Plan 03 (invite flow)

---
*Phase: 01-authentication-and-multi-tenancy*
*Completed: 2026-03-09*
