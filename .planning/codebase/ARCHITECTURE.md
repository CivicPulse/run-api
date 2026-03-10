# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Layered Service Architecture with FastAPI dependency injection

**Key Characteristics:**
- Three-tier layered backend: API routes -> Service classes -> SQLAlchemy models
- Multi-tenant isolation via PostgreSQL Row-Level Security (RLS) with `app.current_campaign_id` session variable
- ZITADEL as external identity provider; JWT validation via OIDC/JWKS
- Campaign = tenant boundary; each campaign maps 1:1 to a ZITADEL organization
- Application factory pattern (`create_app`) with async lifespan for resource initialization
- Cursor-based pagination throughout (created_at|id compound cursors)
- React SPA frontend (TanStack Router + React Query) communicates via REST API

## Layers

**API Layer (Routes):**
- Purpose: HTTP request handling, input validation, auth enforcement, response serialization
- Location: `app/api/`
- Contains: FastAPI routers with endpoint functions
- Depends on: Service layer, Schemas, Security (via `Depends()`), DB session
- Used by: HTTP clients (web frontend, external consumers)
- Pattern: Each router module instantiates a module-level service singleton (e.g., `_service = CampaignService()`) and delegates all business logic to it

**Service Layer:**
- Purpose: Business logic, data access orchestration, external service integration
- Location: `app/services/`
- Contains: Service classes with async methods accepting `AsyncSession` and domain parameters
- Depends on: Models, Schemas, external clients (ZITADEL, S3)
- Used by: API layer, background tasks
- Pattern: Stateless service classes; DB session passed as parameter (not injected). Services are instantiated as module-level singletons in route modules.

**Model Layer:**
- Purpose: Database schema definition and ORM mapping
- Location: `app/models/`
- Contains: SQLAlchemy 2.0 declarative models using `Mapped` type annotations
- Depends on: `app/db/base.py` (DeclarativeBase)
- Used by: Service layer, Alembic migrations
- Pattern: One model file per domain entity; all models registered in `app/db/base.py` for Alembic auto-detection and re-exported via `app/models/__init__.py`

**Schema Layer:**
- Purpose: Request/response validation and serialization
- Location: `app/schemas/`
- Contains: Pydantic v2 models (Create, Update, Response variants per entity)
- Depends on: Model enums (imported for reuse)
- Used by: API layer for type validation and OpenAPI documentation
- Pattern: All schemas inherit from `BaseSchema` (`app/schemas/common.py`) which enables `from_attributes=True` for ORM mode

**Core Layer:**
- Purpose: Cross-cutting configuration, authentication, error handling
- Location: `app/core/`
- Contains: Settings, JWT/JWKS validation, role enforcement, domain exceptions
- Depends on: External config (env vars), Authlib, httpx
- Used by: All other layers

**Database Layer:**
- Purpose: Engine/session management, RLS context helpers
- Location: `app/db/`
- Contains: Async engine, session factory, RLS helper, declarative base
- Depends on: Core config
- Used by: API deps, Service layer, background tasks

**Task Layer:**
- Purpose: Background job processing (voter file imports)
- Location: `app/tasks/`
- Contains: TaskIQ broker config and task functions
- Depends on: Service layer, DB session factory, RLS helpers
- Used by: API endpoints (kick off tasks), TaskIQ worker

**Frontend Layer:**
- Purpose: React SPA for campaign management UI
- Location: `web/`
- Contains: TanStack Router routes, React Query hooks, Zustand stores, shadcn/ui components
- Depends on: Backend REST API, ZITADEL OIDC (via oidc-client-ts)
- Used by: End users in browser

## Data Flow

**Authenticated API Request:**

1. Client sends HTTP request with Bearer JWT token
2. `HTTPBearer` extracts token; `get_current_user()` validates JWT via `JWKSManager` (caches JWKS, retries on unknown kid)
3. `_extract_role()` reads ZITADEL role claims from nested URN structure
4. `require_role()` dependency enforces minimum role level (VIEWER < VOLUNTEER < MANAGER < ADMIN < OWNER)
5. `ensure_user_synced()` upserts local User record and ensures CampaignMember exists
6. For campaign-scoped resources: `set_campaign_context()` sets PostgreSQL session variable `app.current_campaign_id` for RLS
7. Route handler delegates to service class method with `AsyncSession` and validated input
8. Service executes SQLAlchemy queries, returns model instances
9. Route handler converts to Pydantic response schema via `model_validate()`

**Campaign Creation (Compensating Transaction):**

1. Route calls `CampaignService.create_campaign()`
2. Service creates ZITADEL organization first (external system call)
3. Service creates local Campaign + CampaignMember records in DB
4. If DB write fails: compensating transaction deletes the ZITADEL org
5. If ZITADEL cleanup fails: error is logged (manual reconciliation needed)

**Voter File Import:**

1. Client requests pre-signed S3 upload URL via API
2. Client uploads CSV directly to S3 (MinIO local / R2 production)
3. API creates ImportJob record, dispatches `process_import` TaskIQ task
4. Background task creates own DB session, sets RLS context, streams file from S3
5. ImportService parses CSV, maps fields, bulk-inserts Voter records
6. Job status updated to COMPLETED or FAILED

**State Management (Frontend):**
- Authentication state: Zustand store (`web/src/stores/authStore.ts`) wrapping oidc-client-ts UserManager
- Server state: React Query hooks (`web/src/hooks/`) with automatic caching/invalidation
- API client: ky HTTP client (`web/src/api/client.ts`) with automatic Bearer token injection and 401 redirect-to-logout

## Key Abstractions

**AuthenticatedUser:**
- Purpose: JWT claims extracted into a typed context object
- Defined in: `app/core/security.py`
- Pattern: Pydantic BaseModel with `id`, `org_id`, `role`, `email`, `display_name`
- Used everywhere via `Depends(get_current_user)` or `Depends(require_role("..."))`

**CampaignRole (IntEnum):**
- Purpose: Hierarchical role enforcement (numeric comparison)
- Defined in: `app/core/security.py`
- Values: VIEWER(0) < VOLUNTEER(1) < MANAGER(2) < ADMIN(3) < OWNER(4)
- Pattern: `require_role("manager")` returns a FastAPI dependency that checks `user.role >= CampaignRole.MANAGER`

**RLS Campaign Context:**
- Purpose: PostgreSQL session-level tenant isolation
- Defined in: `app/db/rls.py`
- Pattern: `set_campaign_context(session, campaign_id)` calls `set_config('app.current_campaign_id', ...)` so RLS policies filter all queries to the active campaign
- Must be called for any campaign-scoped query (voters, voter lists, interactions, etc.)

**PaginatedResponse[T]:**
- Purpose: Generic cursor-based pagination wrapper
- Defined in: `app/schemas/common.py`
- Pattern: `PaginatedResponse[VoterResponse]` with `items: list[T]` and `pagination: PaginationResponse` (next_cursor + has_more)
- Cursor format: `{created_at.isoformat()}|{id}` (compound sort key)

**BaseSchema:**
- Purpose: Common Pydantic base with ORM mode
- Defined in: `app/schemas/common.py`
- Pattern: All domain schemas inherit from `BaseSchema` which sets `from_attributes=True`

**Domain Exception Classes:**
- Purpose: Typed business errors mapped to RFC 7807 Problem Details responses
- Defined in: `app/core/errors.py`
- Pattern: Custom exception classes (e.g., `CampaignNotFoundError`, `VoterNotFoundError`) registered with `fastapi-problem-details` handlers in `init_error_handlers()`

## Entry Points

**API Server:**
- Location: `main.py` -> `app/main.py`
- Triggers: `uvicorn main:app` or `uvicorn app.main:create_app --factory`
- Responsibilities: Creates FastAPI app, mounts routers, initializes lifespan resources (JWKS, ZITADEL service, S3, TaskIQ broker)

**Lifespan Handler:**
- Location: `app/main.py` (`lifespan()` async context manager)
- Triggers: App startup/shutdown
- Responsibilities: Initializes JWKSManager, validates ZITADEL credentials, creates StorageService + ensures bucket, starts/stops TaskIQ broker. Resources stored on `app.state`.

**V1 API Router:**
- Location: `app/api/v1/router.py`
- Triggers: All `/api/v1/*` requests
- Responsibilities: Aggregates 19 sub-routers (campaigns, voters, imports, dashboard, etc.)

**Health Check:**
- Location: `app/api/health.py`
- Triggers: `GET /health`
- Responsibilities: Returns `{"status": "ok"}` (no auth required)

**Background Worker:**
- Location: `app/tasks/import_task.py`
- Triggers: TaskIQ broker dispatch from import API endpoint
- Responsibilities: Processes voter file imports asynchronously

**Web Frontend:**
- Location: `web/src/main.tsx`
- Triggers: Browser page load
- Responsibilities: Bootstraps React app with TanStack Router, React Query, and OIDC auth

**Alembic Migrations:**
- Location: `alembic/` (6 migration files)
- Triggers: `alembic upgrade head`
- Responsibilities: Database schema versioning (uses sync psycopg2 connection)

## Error Handling

**Strategy:** Domain exceptions mapped to RFC 7807 Problem Details via `fastapi-problem-details`

**Patterns:**
- Services raise domain-specific exceptions (`CampaignNotFoundError`, `VoterNotFoundError`, `InsufficientPermissionsError`, `ZitadelUnavailableError`)
- Exception handlers in `app/core/errors.py` map each to a `ProblemResponse` with appropriate HTTP status, title, detail, and type URI
- JWT validation failures raise `HTTPException(401)` directly
- Role enforcement failures raise `HTTPException(403)` directly
- Service-to-external-system errors (ZITADEL, S3) are caught and wrapped in domain exceptions
- Background task failures are caught, logged, and job status is updated to FAILED

## Cross-Cutting Concerns

**Logging:** Loguru (`loguru.logger`) used throughout. Structured format with `{}` placeholders.

**Validation:** Pydantic v2 schemas for all request/response bodies. Field-level constraints (e.g., `min_length`, `max_length`). SQLAlchemy model-level constraints (unique, foreign keys).

**Authentication:** ZITADEL OIDC with JWT Bearer tokens. JWKS auto-discovery and caching with rotation support. Service-to-service auth via client_credentials grant.

**Multi-Tenancy:** PostgreSQL RLS policies keyed on `app.current_campaign_id` session variable. Campaign determined from user's ZITADEL org_id claim. Every campaign-scoped endpoint must call `set_campaign_context()`.

**CORS:** Configured in `create_app()` via `CORSMiddleware`. Allowed origins from `settings.cors_allowed_origins` (default: `http://localhost:5173`).

---

*Architecture analysis: 2026-03-10*
