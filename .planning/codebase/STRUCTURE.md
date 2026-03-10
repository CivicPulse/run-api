# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
run-api/
├── app/                    # Python backend (FastAPI)
│   ├── __init__.py
│   ├── main.py             # Application factory (create_app + lifespan)
│   ├── api/                # HTTP route layer
│   │   ├── __init__.py
│   │   ├── health.py       # GET /health (no auth)
│   │   ├── deps.py         # Shared dependencies (RLS, user sync, campaign lookup)
│   │   └── v1/             # Versioned API routes
│   │       ├── __init__.py
│   │       ├── router.py   # Aggregates all v1 sub-routers
│   │       ├── campaigns.py
│   │       ├── voters.py
│   │       ├── voter_contacts.py
│   │       ├── voter_interactions.py
│   │       ├── voter_lists.py
│   │       ├── voter_tags.py
│   │       ├── imports.py
│   │       ├── invites.py
│   │       ├── members.py
│   │       ├── surveys.py
│   │       ├── turfs.py
│   │       ├── walk_lists.py
│   │       ├── call_lists.py
│   │       ├── dnc.py
│   │       ├── phone_banks.py
│   │       ├── volunteers.py
│   │       ├── shifts.py
│   │       └── dashboard.py
│   ├── core/               # Cross-cutting: config, auth, errors
│   │   ├── __init__.py
│   │   ├── config.py       # pydantic-settings Settings class
│   │   ├── security.py     # JWT/JWKS validation, role enforcement
│   │   └── errors.py       # Domain exceptions + problem details handlers
│   ├── db/                 # Database infrastructure
│   │   ├── __init__.py
│   │   ├── base.py         # DeclarativeBase + model registry for Alembic
│   │   ├── session.py      # Async engine, session factory, get_db dependency
│   │   └── rls.py          # set_campaign_context() RLS helper
│   ├── models/             # SQLAlchemy ORM models
│   │   ├── __init__.py     # Re-exports all models
│   │   ├── user.py
│   │   ├── campaign.py
│   │   ├── campaign_member.py
│   │   ├── voter.py        # Voter + VoterTag + VoterTagMember
│   │   ├── voter_contact.py # VoterAddress, VoterEmail, VoterPhone
│   │   ├── voter_interaction.py
│   │   ├── voter_list.py   # VoterList + VoterListMember
│   │   ├── import_job.py   # ImportJob + FieldMappingTemplate
│   │   ├── invite.py
│   │   ├── turf.py
│   │   ├── walk_list.py
│   │   ├── survey.py
│   │   ├── call_list.py    # CallList + CallListEntry
│   │   ├── phone_bank.py   # PhoneBankSession + SessionCaller
│   │   ├── dnc.py          # DoNotCallEntry
│   │   ├── volunteer.py    # Volunteer + VolunteerAvailability + VolunteerTag + VolunteerTagMember
│   │   └── shift.py        # Shift + ShiftVolunteer
│   ├── schemas/            # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── common.py       # BaseSchema, PaginationResponse, PaginatedResponse[T]
│   │   ├── campaign.py
│   │   ├── user.py
│   │   ├── voter.py
│   │   ├── voter_filter.py # Composable voter search filter
│   │   ├── voter_contact.py
│   │   ├── voter_interaction.py
│   │   ├── voter_list.py
│   │   ├── voter_tag.py
│   │   ├── import_job.py
│   │   ├── invite.py
│   │   ├── member.py
│   │   ├── turf.py
│   │   ├── walk_list.py
│   │   ├── canvass.py
│   │   ├── survey.py
│   │   ├── call_list.py
│   │   ├── phone_bank.py
│   │   ├── dnc.py
│   │   ├── volunteer.py
│   │   ├── shift.py
│   │   └── dashboard.py
│   ├── services/           # Business logic layer
│   │   ├── __init__.py
│   │   ├── campaign.py
│   │   ├── zitadel.py      # ZITADEL Management API client
│   │   ├── storage.py      # S3-compatible object storage (MinIO/R2)
│   │   ├── import_service.py # CSV import processing
│   │   ├── voter.py
│   │   ├── voter_contact.py
│   │   ├── voter_interaction.py
│   │   ├── voter_list.py
│   │   ├── invite.py
│   │   ├── turf.py
│   │   ├── walk_list.py
│   │   ├── survey.py
│   │   ├── canvass.py
│   │   ├── call_list.py
│   │   ├── dnc.py
│   │   ├── phone_bank.py
│   │   ├── volunteer.py
│   │   ├── shift.py
│   │   └── dashboard/      # Dashboard aggregation sub-package
│   │       ├── __init__.py
│   │       ├── canvassing.py
│   │       ├── phone_banking.py
│   │       └── volunteer.py
│   └── tasks/              # Background tasks (TaskIQ)
│       ├── __init__.py
│       ├── broker.py       # InMemoryBroker config
│       └── import_task.py  # Voter file import worker
├── alembic/                # Database migrations
│   ├── env.py
│   └── versions/           # 6 migration files
├── tests/                  # Test suite
│   ├── __init__.py
│   ├── conftest.py         # Root test fixtures
│   ├── unit/               # Unit tests (mocked DB)
│   │   ├── __init__.py
│   │   ├── conftest.py     # Unit-specific fixtures
│   │   └── test_*.py       # 26 test files
│   └── integration/        # Integration tests (real DB)
│       ├── __init__.py
│       ├── conftest.py     # Integration-specific fixtures
│       └── test_*.py       # 6 test files (RLS, spatial)
├── web/                    # React frontend (SPA)
│   ├── src/
│   │   ├── main.tsx        # App bootstrap (Router + QueryClient + OIDC)
│   │   ├── api/
│   │   │   └── client.ts   # ky HTTP client with auth interceptor
│   │   ├── components/
│   │   │   └── ui/         # shadcn/ui components (20 files)
│   │   ├── hooks/          # React Query data-fetching hooks
│   │   │   ├── useCampaigns.ts
│   │   │   ├── useDashboard.ts
│   │   │   ├── useFieldOps.ts
│   │   │   └── useVoters.ts
│   │   ├── routes/         # TanStack Router file-based routes
│   │   │   ├── __root.tsx
│   │   │   ├── index.tsx
│   │   │   ├── login.tsx
│   │   │   ├── callback.tsx
│   │   │   └── campaigns/
│   │   │       └── $campaignId/
│   │   │           ├── canvassing.tsx
│   │   │           ├── dashboard.tsx
│   │   │           ├── phone-banking.tsx
│   │   │           ├── volunteers.tsx
│   │   │           └── voters/
│   │   │               ├── index.tsx
│   │   │               └── $voterId.tsx
│   │   ├── stores/
│   │   │   └── authStore.ts  # Zustand + oidc-client-ts auth state
│   │   ├── types/          # TypeScript type definitions
│   │   │   ├── auth.ts
│   │   │   ├── campaign.ts
│   │   │   ├── common.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── field-ops.ts
│   │   │   └── voter.ts
│   │   └── test/
│   │       ├── setup.ts
│   │       └── render.tsx
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── playwright.config.ts
├── main.py                 # Uvicorn entry point (imports create_app)
├── pyproject.toml          # Python project config (uv, ruff, pytest)
├── uv.lock                 # Lock file (uv package manager)
├── alembic.ini             # Alembic migration config
├── docker-compose.yml      # PostgreSQL (PostGIS) + MinIO services
├── .env.example            # Environment variable template
├── .python-version         # Python 3.13
└── .gitignore
```

## Directory Purposes

**`app/api/`:**
- Purpose: HTTP endpoint definitions
- Contains: FastAPI routers (one per domain entity), shared dependencies
- Key files: `app/api/v1/router.py` (central router), `app/api/deps.py` (RLS + user sync)

**`app/core/`:**
- Purpose: Application infrastructure shared across all layers
- Contains: Settings, authentication, error handling
- Key files: `app/core/config.py`, `app/core/security.py`, `app/core/errors.py`

**`app/db/`:**
- Purpose: Database connection and ORM infrastructure
- Contains: Engine, session factory, RLS helpers, declarative base
- Key files: `app/db/session.py`, `app/db/rls.py`, `app/db/base.py`

**`app/models/`:**
- Purpose: SQLAlchemy ORM model definitions
- Contains: One file per entity (some files define multiple related models)
- Key files: `app/models/__init__.py` (re-exports all), `app/db/base.py` (registers all for Alembic)

**`app/schemas/`:**
- Purpose: Pydantic v2 request/response schemas
- Contains: Create, Update, Response schema variants per entity
- Key files: `app/schemas/common.py` (BaseSchema, PaginatedResponse)

**`app/services/`:**
- Purpose: Business logic classes
- Contains: Service classes with async methods, external API clients
- Key files: `app/services/zitadel.py`, `app/services/storage.py`, `app/services/campaign.py`

**`app/tasks/`:**
- Purpose: Background job definitions and broker config
- Contains: TaskIQ broker setup and task functions
- Key files: `app/tasks/broker.py`, `app/tasks/import_task.py`

**`alembic/`:**
- Purpose: Database schema migrations
- Contains: Migration scripts (6 versions), env.py configuration
- Key files: `alembic/versions/` (migration files)

**`tests/`:**
- Purpose: Automated test suite
- Contains: Unit tests (mocked DB) and integration tests (real DB + RLS)
- Key files: `tests/conftest.py`, `tests/unit/conftest.py`, `tests/integration/conftest.py`

**`web/`:**
- Purpose: React SPA frontend
- Contains: TanStack Router pages, React Query hooks, shadcn/ui components, Zustand stores
- Key files: `web/src/main.tsx`, `web/src/api/client.ts`, `web/src/stores/authStore.ts`

## Key File Locations

**Entry Points:**
- `main.py`: Uvicorn entry point (thin wrapper)
- `app/main.py`: Application factory (`create_app()` + `lifespan()`)
- `web/src/main.tsx`: Frontend React bootstrap

**Configuration:**
- `app/core/config.py`: `Settings` class (pydantic-settings, loads from `.env`)
- `pyproject.toml`: Python project, dependencies, ruff, pytest config
- `alembic.ini`: Migration runner config
- `docker-compose.yml`: Local development infrastructure (PostgreSQL + MinIO)
- `.env.example`: Environment variable template (note: never read `.env` itself)

**Core Logic:**
- `app/core/security.py`: JWT validation, JWKS management, role system
- `app/api/deps.py`: Shared FastAPI dependencies (RLS context, user sync, campaign lookup)
- `app/db/rls.py`: Row-Level Security context setter
- `app/services/campaign.py`: Campaign CRUD with ZITADEL compensating transactions
- `app/services/voter.py`: Voter CRUD, composable query builder, tag operations
- `app/services/import_service.py`: CSV voter file processing

**Testing:**
- `tests/conftest.py`: Root fixtures
- `tests/unit/conftest.py`: Unit test fixtures (mocked sessions)
- `tests/integration/conftest.py`: Integration fixtures (real DB connections)

## Naming Conventions

**Files:**
- Python modules: `snake_case.py` (e.g., `voter_contact.py`, `import_service.py`)
- Test files: `test_{module_name}.py` (e.g., `test_campaign_service.py`, `test_api_campaigns.py`)
- TypeScript/React: `camelCase.ts` for hooks/stores (e.g., `useCampaigns.ts`), `kebab-case.tsx` for routes (e.g., `phone-banking.tsx`)
- UI components: `kebab-case.tsx` (e.g., `dropdown-menu.tsx`) following shadcn/ui convention

**Directories:**
- Python: `snake_case/` (e.g., `app/services/dashboard/`)
- Frontend routes: `$paramName/` for dynamic segments (TanStack Router convention)

**Classes:**
- Models: PascalCase singular (e.g., `Campaign`, `VoterInteraction`, `ShiftVolunteer`)
- Services: PascalCase with `Service` suffix (e.g., `CampaignService`, `StorageService`)
- Schemas: PascalCase with action suffix (e.g., `CampaignCreate`, `CampaignUpdate`, `CampaignResponse`)
- Enums: PascalCase (e.g., `CampaignStatus`, `CampaignRole`, `InteractionType`)

**Functions:**
- Route handlers: `snake_case` matching HTTP verb + resource (e.g., `create_campaign`, `search_voters`)
- Service methods: `snake_case` matching operation (e.g., `create_campaign`, `search_voters`, `get_by_turf`)

## Where to Add New Code

**New API Domain (e.g., "events"):**
1. Model: `app/models/event.py` - SQLAlchemy model
2. Register model in `app/db/base.py` (import at bottom)
3. Export model in `app/models/__init__.py`
4. Schema: `app/schemas/event.py` - Create, Update, Response schemas inheriting `BaseSchema`
5. Service: `app/services/event.py` - Service class with async methods
6. Route: `app/api/v1/events.py` - FastAPI router
7. Wire router: Add to `app/api/v1/router.py` (import + `router.include_router()`)
8. Migration: `alembic revision --autogenerate -m "add events table"`
9. Tests: `tests/unit/test_events.py` (and optionally `tests/integration/test_event_rls.py`)

**New API Endpoint on Existing Domain:**
1. Add method to existing service class in `app/services/{domain}.py`
2. Add schema(s) to `app/schemas/{domain}.py` if new request/response shapes needed
3. Add route function to `app/api/v1/{domain}.py`

**New Frontend Page:**
1. Route file: `web/src/routes/campaigns/$campaignId/{page-name}.tsx`
2. API hook: Add queries/mutations to relevant hook file in `web/src/hooks/`
3. Types: Add TypeScript interfaces to `web/src/types/`

**New Frontend Component:**
- Reusable UI: `web/src/components/ui/{component-name}.tsx` (shadcn/ui pattern)
- Domain-specific: Create `web/src/components/{domain}/` directory

**New Background Task:**
1. Task function: `app/tasks/{task_name}.py` decorated with `@broker.task`
2. Import broker from `app/tasks/broker.py`
3. Create own DB session via `async_session_factory()` (tasks run outside request lifecycle)
4. Set RLS context if campaign-scoped

**New Dashboard Metric:**
1. Service method: Add to relevant file in `app/services/dashboard/`
2. Schema: Add response model to `app/schemas/dashboard.py`
3. Endpoint: Add route to `app/api/v1/dashboard.py`

## Special Directories

**`alembic/versions/`:**
- Purpose: Auto-generated database migration scripts
- Generated: Yes (via `alembic revision --autogenerate`)
- Committed: Yes

**`web/src/routeTree.gen.ts`:**
- Purpose: Auto-generated route tree for TanStack Router
- Generated: Yes (by TanStack Router plugin)
- Committed: Yes

**`.venv/`:**
- Purpose: Python virtual environment
- Generated: Yes (via `uv venv`)
- Committed: No

**`.planning/`:**
- Purpose: GSD planning documents and codebase analysis
- Generated: By planning tooling
- Committed: Yes

---

*Structure analysis: 2026-03-10*
