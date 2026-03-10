# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Authentication & Identity - ZITADEL:**
- Purpose: OIDC authentication, organization management, role-based access control
- SDK/Client: `authlib` (JWKS/JWT validation), `httpx` (Management API calls)
- Service class: `app/services/zitadel.py` - `ZitadelService`
- JWT validation: `app/core/security.py` - `JWKSManager`
- Auth env vars: `ZITADEL_ISSUER`, `ZITADEL_PROJECT_ID`, `ZITADEL_SERVICE_CLIENT_ID`, `ZITADEL_SERVICE_CLIENT_SECRET`

**ZITADEL API Operations:**
- Create organization: `POST {issuer}/management/v1/orgs`
- Deactivate organization: `POST {issuer}/management/v1/orgs/{id}/_deactivate`
- Delete organization: `DELETE {issuer}/management/v1/orgs/{id}`
- Assign project role: `POST {issuer}/management/v1/users/{id}/grants`
- Remove project role: `DELETE {issuer}/management/v1/users/{id}/grants/{grantId}`
- Token exchange: `POST {issuer}/oauth/v2/token` (client_credentials grant)
- OIDC discovery: `GET {issuer}/.well-known/openid-configuration`

**ZITADEL JWT Claims Used:**
- `sub` - User ID
- `urn:zitadel:iam:user:resourceowner:id` - Organization ID (maps to campaign)
- `urn:zitadel:iam:org:project:{projectId}:roles` - Role claims (nested dict)
- `email`, `name` - User profile data

## Data Storage

**Primary Database - PostgreSQL 17 with PostGIS 3.5:**
- Docker image: `postgis/postgis:17-3.5` (`docker-compose.yml`)
- Async driver: `asyncpg` via `postgresql+asyncpg://` connection string
- Sync driver: `psycopg2-binary` via `postgresql+psycopg2://` (Alembic only)
- ORM: SQLAlchemy 2.0 async with `DeclarativeBase` (`app/db/base.py`)
- Session factory: `app/db/session.py` - `async_session_factory`
- Connection env vars: `DATABASE_URL` (async), `DATABASE_URL_SYNC` (sync)
- Pool: `pool_pre_ping=True`, echo controlled by `DEBUG` setting
- Row-Level Security: `app/db/rls.py` - `set_campaign_context()` sets `app.current_campaign_id` via `set_config()`

**Database Models (16 tables):**
- `app/models/user.py` - Users (synced from ZITADEL JWT)
- `app/models/campaign.py` - Campaigns (linked to ZITADEL orgs)
- `app/models/campaign_member.py` - Campaign membership
- `app/models/invite.py` - Campaign invitations
- `app/models/voter.py` - Voter records
- `app/models/voter_contact.py` - Voter contact info
- `app/models/voter_interaction.py` - Voter interaction logs
- `app/models/voter_list.py` - Voter list groupings
- `app/models/import_job.py` - Voter file import jobs
- `app/models/turf.py` - Geographic canvassing turfs (PostGIS geometry)
- `app/models/walk_list.py` - Canvassing walk lists
- `app/models/survey.py` - Survey definitions
- `app/models/call_list.py` - Phone banking call lists
- `app/models/phone_bank.py` - Phone bank sessions
- `app/models/dnc.py` - Do-Not-Call registry
- `app/models/volunteer.py` - Volunteer records
- `app/models/shift.py` - Volunteer shift scheduling

**Migrations:**
- Tool: Alembic (`alembic.ini`, `alembic/versions/`)
- 6 migration files:
  - `001_initial_schema.py`
  - `002_invites_table.py`
  - `002_voter_data_models.py`
  - `003_canvassing_operations.py`
  - `004_phone_banking.py`
  - `005_volunteer_management.py`

**Object Storage - S3-Compatible (MinIO dev / Cloudflare R2 production):**
- Client: `aioboto3` (async boto3 wrapper) (`app/services/storage.py`)
- Service class: `app/services/storage.py` - `StorageService`
- Operations: pre-signed upload URLs, pre-signed download URLs, streaming download, direct byte upload
- Bucket: configurable via `S3_BUCKET` (default: `voter-imports`)
- Auto-creates bucket on startup via `ensure_bucket()`
- Docker: MinIO on ports 9000 (API) / 9001 (console) (`docker-compose.yml`)
- Env vars: `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`

**Caching:**
- None currently implemented

## Authentication & Identity

**Auth Provider: ZITADEL (external OIDC)**
- JWT Bearer token authentication via `HTTPBearer` scheme
- JWKS validation with automatic key rotation handling (`app/core/security.py`)
- Role hierarchy: VIEWER(0) < VOLUNTEER(1) < MANAGER(2) < ADMIN(3) < OWNER(4)
- Role extraction from ZITADEL project-scoped claims
- Service account for Management API operations (org/role management)
- Multi-tenant isolation: ZITADEL org_id maps to campaign_id via database lookup

**Auth Flow:**
1. Frontend authenticates via OIDC (`oidc-client-ts`)
2. Bearer token sent in Authorization header
3. `get_current_user()` dependency validates JWT, extracts `AuthenticatedUser`
4. `require_role("manager")` dependency factory enforces minimum role
5. `get_campaign_from_token()` maps ZITADEL org to local campaign
6. `ensure_user_synced()` creates/updates local User + CampaignMember records

**Key auth files:**
- `app/core/security.py` - JWT validation, role enforcement, `AuthenticatedUser` model
- `app/services/zitadel.py` - ZITADEL Management API client
- `app/api/deps.py` - FastAPI dependencies for auth + campaign context

## Background Tasks

**Framework: TaskIQ**
- Broker: `InMemoryBroker` (dev only) - `app/tasks/broker.py`
- Production recommendation: Redis or RabbitMQ broker (noted in code comments)
- Task registration: `@broker.task` decorator
- Lifecycle: broker started/stopped in FastAPI lifespan (`app/main.py`)

**Registered Tasks:**
- `process_import` (`app/tasks/import_task.py`) - Voter file CSV import processing

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Logging:**
- Framework: Loguru (`loguru`)
- Usage: `from loguru import logger` throughout codebase
- Pattern: `logger.info("Message {}", variable)` (structured format strings)

**Error Responses:**
- RFC 9457 Problem Details via `fastapi-problem-details` (`app/core/errors.py`)
- Custom exception classes with registered handlers

## CI/CD & Deployment

**Hosting:**
- Not configured (no Dockerfile, no deployment config detected)

**CI Pipeline:**
- Not detected (no `.github/workflows/`, no CI config files)

**Local Development:**
- `docker-compose.yml` - PostgreSQL + MinIO
- Frontend dev: `npm run dev` (Vite on port 5173)
- Backend dev: `uvicorn main:app --reload` (implied)

## Environment Configuration

**Required env vars (from `.env.example`):**
- `APP_NAME` - Application display name
- `DEBUG` - Debug mode flag
- `DATABASE_URL` - Async PostgreSQL connection string
- `DATABASE_URL_SYNC` - Sync PostgreSQL connection string (Alembic)
- `ZITADEL_ISSUER` - ZITADEL instance URL
- `ZITADEL_PROJECT_ID` - ZITADEL project ID for role claims
- `ZITADEL_SERVICE_CLIENT_ID` - Service account credentials
- `ZITADEL_SERVICE_CLIENT_SECRET` - Service account credentials
- `CORS_ALLOWED_ORIGINS` - JSON array of allowed origins
- `S3_ENDPOINT_URL` - Object storage endpoint
- `S3_ACCESS_KEY_ID` - Object storage credentials
- `S3_SECRET_ACCESS_KEY` - Object storage credentials
- `S3_BUCKET` - Object storage bucket name
- `S3_REGION` - Object storage region

**Secrets location:**
- `.env` file (gitignored)
- `.env.example` committed as template

**Startup validation:**
- ZITADEL service credentials validated at startup (fail-fast in `app/main.py` lifespan)
- S3 bucket auto-created if missing

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## Frontend-Backend Integration

**API Communication:**
- Frontend uses `ky` HTTP client (`web/src/api/`)
- Server state managed via TanStack React Query
- OIDC tokens from `oidc-client-ts` sent as Bearer tokens
- CORS configured for `http://localhost:5173` (Vite dev server default)

**Frontend Auth:**
- `oidc-client-ts` >=3.1.0 handles OIDC flow against ZITADEL
- Token management and refresh handled client-side

---

*Integration audit: 2026-03-10*
