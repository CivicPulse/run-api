# Architecture Research

**Domain:** Multi-tenant political campaign management API
**Researched:** 2026-03-09
**Confidence:** MEDIUM-HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Gateway Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Campaign │  │  Voter   │  │  Field   │  │   Dashboard      │   │
│  │  Router  │  │  Router  │  │ Ops Rtr  │  │   Router (SSE)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘   │
├───────┴──────────────┴────────────┴──────────────┴─────────────────┤
│                    Cross-Cutting Middleware                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ ZITADEL Auth │  │ Tenant Ctx   │  │ Request Logging          │ │
│  │ (JWT/JWKS)   │  │ (campaign_id)│  │ (Loguru)                 │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘ │
├─────────┴──────────────────┴──────────────────────────────────────┤
│                       Service Layer                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Campaign │  │  Voter   │  │  Turf    │  │  Canvass/Phone   │  │
│  │ Service  │  │ Import   │  │ Cutting  │  │  Bank Service    │  │
│  │          │  │ Service  │  │ Service  │  │                  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘  │
├───────┴──────────────┴────────────┴──────────────┴────────────────┤
│                     Data Access Layer                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  SQLAlchemy Async ORM + PostgreSQL RLS (tenant isolation)   │  │
│  └─────────────────────┬───────────────────────────────────────┘  │
├────────────────────────┴──────────────────────────────────────────┤
│                      Storage Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  PostgreSQL   │  │   PostGIS    │  │   Redis              │    │
│  │  (core data)  │  │  (geo ops)   │  │  (cache/pub-sub)     │    │
│  └──────────────┘  └──────────────┘  └──────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘

External:
  ┌──────────────┐
  │   ZITADEL    │  auth.civpulse.org
  │  (OIDC/JWT)  │  Organizations = Campaigns
  └──────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| ZITADEL Auth Middleware | Validate JWT via JWKS, extract org/role claims, set user context | `fastapi-zitadel-auth` library with custom claims model |
| Tenant Context Middleware | Extract campaign_id from ZITADEL org claims, set PostgreSQL session variable for RLS | ASGI middleware + SQLAlchemy `after_begin` event |
| Campaign Service | Campaign CRUD, member management, settings | Standard service layer, owner/admin logic |
| Voter Import Service | Parse L2/SOS/CSV files, normalize to canonical model, deduplicate | Background task processing with field mapping configs |
| Turf Cutting Service | Geographic clustering of voter addresses into walkable turfs | PostGIS `ST_ClusterDBSCAN` + boundary constraints |
| Canvass/Phone Bank Service | Walk list generation, door-knock outcome recording, call tracking | Service layer with survey script engine |
| Dashboard Router | Real-time canvassing progress streams | SSE via `sse-starlette` with Redis pub/sub backend |
| Redis | Cache pre-aggregated dashboard metrics, pub/sub for SSE fan-out | Dashboard counters, turf completion percentages |

## Recommended Project Structure

```
app/
├── main.py                    # FastAPI application factory
├── config.py                  # pydantic-settings configuration
├── middleware/                 # Cross-cutting concerns
│   ├── auth.py                # ZITADEL JWT validation + user context
│   ├── tenant.py              # Campaign tenant context injection
│   └── logging.py             # Request/response logging
├── api/                       # Route definitions (thin)
│   ├── v1/
│   │   ├── campaigns.py       # Campaign CRUD endpoints
│   │   ├── voters.py          # Voter/constituent endpoints
│   │   ├── imports.py         # Voter data import endpoints
│   │   ├── turfs.py           # Turf management endpoints
│   │   ├── canvassing.py      # Canvassing operations
│   │   ├── phonebanking.py    # Phone bank operations
│   │   ├── volunteers.py      # Volunteer management
│   │   ├── dashboards.py      # SSE dashboard streams
│   │   └── router.py          # Aggregated v1 router
│   └── deps.py                # Shared dependencies (DB session, current user)
├── services/                  # Business logic
│   ├── campaign.py
│   ├── voter_import/          # Complex enough for subdirectory
│   │   ├── base.py            # Abstract importer
│   │   ├── l2.py              # L2 format parser
│   │   ├── sos.py             # State SOS format parser
│   │   ├── csv_generic.py     # Generic CSV with field mapping
│   │   └── normalizer.py      # Canonical voter model mapping
│   ├── turf.py                # Turf cutting logic
│   ├── canvassing.py
│   ├── phonebanking.py
│   ├── volunteer.py
│   └── dashboard.py           # Aggregation + SSE event generation
├── models/                    # SQLAlchemy ORM models
│   ├── base.py                # Base model with campaign_id mixin
│   ├── campaign.py
│   ├── voter.py               # Canonical voter model
│   ├── voter_source.py        # Import source metadata + raw field storage
│   ├── turf.py                # Turf geometry + voter assignments
│   ├── canvass.py             # Canvass efforts, results, surveys
│   ├── phonebank.py
│   ├── volunteer.py
│   └── interaction.py         # CRM interaction history
├── schemas/                   # Pydantic request/response models
│   ├── campaign.py
│   ├── voter.py
│   ├── turf.py
│   ├── canvass.py
│   └── ...
├── core/                      # Framework-level utilities
│   ├── database.py            # Async engine, session factory, RLS setup
│   ├── security.py            # Auth helpers, permission checks
│   └── events.py              # SSE event bus (Redis pub/sub wrapper)
└── cli/                       # Typer management commands
    ├── main.py
    ├── db.py                  # Migration helpers, seed data
    └── import_voters.py       # CLI voter import command
alembic/                       # Migrations (separate from app)
├── versions/
├── env.py
└── alembic.ini
specs/                         # SDD specifications
tests/                         # Mirrors app/ structure
```

### Structure Rationale

- **`api/v1/`:** Versioned API routes. Routers are thin -- they validate input, call services, return responses. No business logic here. Version prefix allows future breaking changes without disruption.
- **`services/`:** All business logic lives here. Services receive validated data and a database session, return domain objects. This separation makes services testable without HTTP.
- **`models/`:** SQLAlchemy models only. Every tenant-scoped model inherits a `TenantMixin` that adds `campaign_id` (UUID, FK, indexed, non-nullable). This is the RLS anchor column.
- **`services/voter_import/`:** Gets its own subdirectory because import normalization is the most complex domain -- multiple source formats, field mapping configs, deduplication logic.
- **`core/`:** Framework plumbing that isn't business logic. Database session management, RLS configuration, auth utilities, event bus.

## Architectural Patterns

### Pattern 1: Row-Level Security with Application-Layer Tenant Context

**What:** PostgreSQL RLS policies automatically filter all queries by `campaign_id`. The application sets a session variable (`app.current_campaign_id`) on every database connection, and RLS policies use `current_setting('app.current_campaign_id')` to enforce isolation.

**When to use:** Every request that touches tenant-scoped data (which is nearly everything except user profile and platform admin).

**Trade-offs:**
- PRO: Defense-in-depth -- even if application code omits a WHERE clause, RLS blocks cross-tenant data access
- PRO: Developers write queries without thinking about tenant filtering
- CON: Adds ~1-2ms per query for policy evaluation
- CON: Debugging is harder when queries silently return empty results due to wrong tenant context
- CON: Superuser and migration roles bypass RLS, requiring careful role management

**Implementation approach:**

```python
# models/base.py -- Tenant mixin for all campaign-scoped models
class TenantMixin:
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False, index=True
    )

# core/database.py -- Set tenant context on every connection
@event.listens_for(async_session_factory, "after_begin")
def set_tenant_context(session, transaction, connection):
    tenant_id = get_current_tenant_id()  # from context var
    if tenant_id:
        connection.execute(
            text(f"SET app.current_campaign_id = '{tenant_id}'")
        )
```

```sql
-- Migration: RLS policy (applied to every tenant-scoped table)
ALTER TABLE voters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON voters
    USING (campaign_id = current_setting('app.current_campaign_id')::uuid);
```

**Why row-level, not schema-per-tenant:** Schema-per-tenant adds operational complexity (migrations must run N times), connection pooling becomes painful, and campaigns are ephemeral (election cycles end). Row-level with RLS gives isolation guarantees without the operational burden. At CivicPulse's scale (hundreds to low thousands of campaigns, not millions), row-level is the right call.

**Confidence:** HIGH -- this pattern is well-documented for FastAPI + SQLAlchemy + PostgreSQL by multiple authoritative sources including AWS, Crunchy Data, and the FastAPI community.

### Pattern 2: ZITADEL Organizations as Campaign Tenants

**What:** Map each campaign to a ZITADEL Organization. Users authenticate via OIDC, and the JWT contains organization claims (`urn:zitadel:iam:user:resourceowner:id` and `urn:zitadel:iam:org:project:roles`) that the API uses to determine which campaign the user is accessing and what role they hold.

**When to use:** Every authenticated request. The auth middleware extracts claims and populates a request-scoped context with user ID, campaign ID (from org), and roles.

**Trade-offs:**
- PRO: ZITADEL handles user management, password resets, MFA, SSO -- none of this is CivicPulse's problem
- PRO: Organization-scoped roles (admin, field_director, volunteer) are managed in ZITADEL, not in application code
- PRO: Users can belong to multiple organizations (campaigns) with different roles
- CON: Campaign creation requires ZITADEL API calls to create organizations (adds coupling)
- CON: ZITADEL is a runtime dependency -- if it's down, no auth works

**Key ZITADEL JWT claims used:**

| Claim | Maps To | Purpose |
|-------|---------|---------|
| `sub` | User ID | Identify the authenticated user |
| `urn:zitadel:iam:user:resourceowner:id` | Campaign ID | Primary tenant identifier |
| `urn:zitadel:iam:user:resourceowner:name` | Campaign Name | Display purposes |
| `urn:zitadel:iam:org:project:roles` | User Roles | RBAC (admin, field_director, canvasser, phonebanker, volunteer) |

**Library:** Use `fastapi-zitadel-auth` (v0.3.2, MIT, active development) for JWT validation via JWKS. Extend its `JwtClaims` class to extract organization claims.

**Confidence:** MEDIUM-HIGH -- `fastapi-zitadel-auth` is relatively new (released Dec 2025) but actively maintained and purpose-built for this exact use case. ZITADEL's organization model is well-documented.

### Pattern 3: Canonical Voter Model with Source Preservation

**What:** Import voter data from multiple sources (L2, state Secretary of State files, generic CSV) into a normalized canonical voter record, while preserving the original source data and mapping configuration for auditability and re-import.

**When to use:** All voter data imports. The canonical model is the single source of truth for the application; source-specific data is preserved but not queried for operations.

**Implementation approach:**

```
Import Flow:
  CSV/File Upload → Source Parser (L2/SOS/Generic)
       ↓
  Raw Record + Field Mapping Config
       ↓
  Normalizer → Canonical Voter Record
       ↓
  Deduplicator (match on name + address + DOB)
       ↓
  Upsert into voters table + link to voter_sources
```

**Canonical voter fields** (derived from L2 example file analysis):

| Field Group | Fields | Source Mapping Notes |
|-------------|--------|---------------------|
| Identity | voter_source_id, first_name, last_name, gender, date_of_birth/age | L2: "Voter ID", "First Name", "Last Name", "Gender", "Age" |
| Contact | phone, email, address (structured), mailing_address (structured) | L2: "Cell Phone" + confidence code; address fields are multi-column |
| Location | latitude, longitude, geometry (PostGIS POINT) | L2: "Lattitude", "Longitude" -- note L2 misspells "Latitude" |
| Political | registered_party, likelihood_general, likelihood_primary | L2: percentages as strings ("77%") -- parse to decimals |
| Demographics | ethnicity, spoken_language, marital_status, military_status | L2: "Ethnicity" is estimated ("Likely African-American") |
| Household | household_id, household_party, household_size | L2: "Mailing Family ID", "Household Party Registration" |
| Vote History | Structured voting history per election (general/primary, year, voted Y/N) | L2: separate columns per election -- normalize to rows |

**Key design decision:** Store a `field_mapping` JSON configuration per import source that maps source column names to canonical fields. This allows new data vendors to be supported without code changes -- just a new mapping config.

**Confidence:** HIGH -- this is a well-understood ETL pattern. The L2 file structure is documented and the example file confirms the field layout.

### Pattern 4: PostGIS Turf Cutting via DBSCAN Clustering

**What:** Generate walkable canvassing turfs by clustering voter addresses using PostGIS's `ST_ClusterDBSCAN` function, then constraining clusters by target size (doors per turf) and geographic boundaries (precincts, neighborhoods).

**When to use:** When a field director creates or regenerates turfs for a canvassing effort.

**Algorithm:**

1. Filter voters by campaign universe (targeting criteria)
2. Cluster addresses using `ST_ClusterDBSCAN(geometry, eps := 200, minpoints := 5)` -- 200 meters radius, minimum 5 doors
3. Split oversized clusters (> max_doors_per_turf) using `ST_ClusterKMeans`
4. Merge undersized clusters with nearest neighbor
5. Generate turf boundary polygons using `ST_ConvexHull` or `ST_ConcaveHull` on cluster points
6. Assign turf IDs and store voter-to-turf assignments

**Trade-offs:**
- PRO: DBSCAN naturally handles irregular address distributions (doesn't force equal-size clusters)
- PRO: All computation happens in PostgreSQL -- no external service needed
- PRO: `eps` parameter (distance) is tunable per campaign context (urban vs. rural)
- CON: Large voter files (100K+ addresses) may take seconds to cluster -- run as background task
- CON: DBSCAN doesn't guarantee walkability -- may need post-processing for route optimization

**Confidence:** MEDIUM -- PostGIS clustering functions are well-documented and suited for this. The specific application to political turf cutting is an inference from general spatial clustering patterns; no direct reference implementation was found. This area likely needs phase-specific deeper research.

### Pattern 5: SSE for Real-Time Dashboards

**What:** Use Server-Sent Events (not WebSockets) for streaming real-time canvassing progress to dashboards. SSE is simpler, HTTP-native, and sufficient because data flows one direction (server to client).

**When to use:** Dashboard endpoints that display live canvassing/phone banking progress (doors knocked, contact rates, turf completion percentages).

**Data flow:**

```
Canvasser submits door-knock result via POST
    ↓
Canvass Service persists result + updates counters
    ↓
Publishes event to Redis pub/sub channel (campaign:{id}:canvass_progress)
    ↓
Dashboard SSE endpoint subscribes to channel
    ↓
Streams EventSourceResponse to connected dashboard clients
```

**Trade-offs:**
- PRO: SSE works over standard HTTP -- no WebSocket upgrade needed, simpler on Kubernetes
- PRO: Automatic reconnection built into browser EventSource API
- PRO: `sse-starlette` is mature and well-integrated with FastAPI
- CON: Server-to-client only -- but dashboards don't need to send data upstream
- CON: Redis becomes a runtime dependency for real-time features

**Pre-aggregation strategy:** Don't query raw canvass results for every dashboard refresh. Instead, maintain counters in Redis (or a `campaign_stats` materialized view) that are incremented on each door-knock result. SSE streams these pre-aggregated values.

**Confidence:** HIGH -- FastAPI now has native SSE documentation, and `sse-starlette` is the established library. Redis pub/sub for fan-out is a standard pattern.

## Data Flow

### Request Flow (Standard CRUD)

```
Client Request (with JWT Bearer token)
    ↓
FastAPI Router
    ↓
Auth Middleware → Validate JWT via JWKS (cached from ZITADEL)
    ↓                Extract: user_id, campaign_id (org), roles
Tenant Middleware → Set contextvars: current_user, current_campaign
    ↓
Route Handler → Validate request body (Pydantic)
    ↓
Service Layer → Business logic, authorization checks
    ↓
Database Session → SET app.current_campaign_id (RLS context)
    ↓
PostgreSQL → RLS policy filters rows automatically
    ↓
Response ← Pydantic schema serialization ← Service result
```

### Voter Import Flow

```
Upload CSV/File via POST /api/v1/imports/
    ↓
Validate file format, detect source type (L2/SOS/generic)
    ↓
Create ImportJob record (status: pending)
    ↓
Enqueue background task (FastAPI BackgroundTasks or task queue)
    ↓
Background Worker:
  ├── Read file in chunks (streaming, not load-all-to-memory)
  ├── For each chunk:
  │   ├── Parse raw records using source-specific parser
  │   ├── Apply field mapping → canonical voter fields
  │   ├── Validate (Pydantic model)
  │   ├── Deduplicate against existing voters (name + address hash)
  │   └── Bulk upsert canonical records + store source linkage
  ├── Update ImportJob progress (row count, error count)
  └── Set ImportJob status: completed/failed
    ↓
Client polls GET /api/v1/imports/{id}/status (or SSE stream)
```

### Canvassing Operation Flow

```
Field Director:
  1. Define voter universe (filters: party, likelihood, geography)
  2. Request turf generation → Turf Cutting Service
     → PostGIS ST_ClusterDBSCAN on filtered voter addresses
     → Returns N turfs with boundaries and door counts
  3. Assign volunteers to turfs

Canvasser (mobile client):
  1. GET /api/v1/turfs/{id}/walklist → Ordered list of doors
  2. For each door:
     POST /api/v1/canvass/results → {voter_id, outcome, survey_responses}
     → Service persists result
     → Increments Redis counters
     → Publishes to Redis pub/sub

Dashboard (web client):
  1. GET /api/v1/dashboards/canvassing (SSE)
     → Streams: doors_knocked, contact_rate, turf_completion, ...
```

### Key Data Flows

1. **Authentication:** Client -> ZITADEL (get token) -> API (validate token via JWKS) -> Extract tenant context -> Set RLS session variable
2. **Voter Import:** File upload -> Background processing -> Normalize -> Deduplicate -> Bulk upsert with source preservation
3. **Turf Generation:** Universe filter -> PostGIS clustering -> Boundary generation -> Volunteer assignment
4. **Real-time Progress:** Canvass result POST -> Redis counter increment -> Redis pub/sub -> SSE stream to dashboards

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 campaigns, <500K voters | Monolith is fine. Single PostgreSQL instance. FastAPI BackgroundTasks for imports. Redis for caching/SSE only. |
| 50-500 campaigns, 5M voters | Add connection pooling (PgBouncer). Move voter imports to a proper task queue (Celery/ARQ with Redis). Add read replicas for dashboard queries. Partition voter table by state or region. |
| 500+ campaigns, 50M+ voters | Consider separating voter data service. Table partitioning on campaign_id. Dedicated PostGIS instance for geo queries. CDN for static walk sheet PDFs. |

### Scaling Priorities

1. **First bottleneck: Voter imports.** Large L2 files (millions of rows) will be the first thing to choke. Streaming chunk processing and bulk upserts (`INSERT ... ON CONFLICT`) are essential from day one. Use `COPY` for initial loads when possible.
2. **Second bottleneck: Turf cutting on large universes.** `ST_ClusterDBSCAN` on 100K+ points takes noticeable time. Run as background task, cache results, only regenerate when universe changes.
3. **Third bottleneck: Dashboard queries during active canvassing.** Pre-aggregate metrics in Redis or materialized views. Never query raw canvass_results for dashboard counts.

## Anti-Patterns

### Anti-Pattern 1: Application-Layer-Only Tenant Filtering

**What people do:** Add `WHERE campaign_id = :id` to every query manually, relying on developers to never forget.
**Why it's wrong:** One missed WHERE clause = data leak between campaigns. This is a political campaign tool -- cross-campaign data exposure is catastrophic.
**Do this instead:** PostgreSQL RLS as the primary enforcement layer. Application-layer filtering as a convenience, not as the security boundary.

### Anti-Pattern 2: Schema-Per-Campaign Tenancy

**What people do:** Create a separate PostgreSQL schema for each campaign.
**Why it's wrong:** Campaigns are ephemeral (election cycles). You'd accumulate hundreds of schemas. Alembic migrations must run against each schema. Connection pooling becomes a nightmare. Cross-campaign analytics (platform-level) requires querying across schemas.
**Do this instead:** Shared schema with row-level security. Single migration path. Single connection pool.

### Anti-Pattern 3: Storing Voter Data in Source Format

**What people do:** Store L2 data in L2's column structure, SOS data in SOS's column structure.
**Why it's wrong:** Every feature that queries voters must handle N different schemas. Deduplication across sources is nearly impossible. Reporting is a mess.
**Do this instead:** Normalize to a canonical voter model on import. Preserve source data in a separate `voter_sources` table with JSONB for the raw fields. Query the canonical model; reference source data only for audit/debugging.

### Anti-Pattern 4: WebSockets for Dashboard Streams

**What people do:** Use WebSockets for real-time dashboards because "real-time = WebSockets."
**Why it's wrong:** Dashboards are server-to-client only. WebSockets add bidirectional complexity, require sticky sessions on Kubernetes (complicates scaling), and need explicit reconnection logic.
**Do this instead:** SSE via `sse-starlette`. Works over standard HTTP, auto-reconnects, simpler on Kubernetes, and handles the dashboard use case perfectly.

### Anti-Pattern 5: Synchronous Voter File Import

**What people do:** Process voter file imports in the request/response cycle.
**Why it's wrong:** L2 files can have millions of rows. A synchronous import will timeout, block workers, and give no progress feedback.
**Do this instead:** Accept the upload, create an import job, process in background, stream progress via SSE or poll a status endpoint.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ZITADEL (auth.civpulse.org) | OIDC/JWT -- validate tokens via JWKS endpoint, create orgs via ZITADEL Management API | JWKS is cached locally (refresh every ~24h). Org creation is a server-to-server call using a service account JWT. |
| Redis | Direct connection via `redis-py` async client | Used for: dashboard metric caching, SSE pub/sub fan-out, optional rate limiting. Not a primary data store. |
| L2 Data / State SOS | File-based import (CSV upload) | No live API integration -- campaigns upload files they've purchased. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API Layer <-> Service Layer | Direct function calls (same process) | Services are injected via FastAPI Depends(). No network boundary. |
| Service Layer <-> Database | SQLAlchemy async sessions | All DB access goes through SQLAlchemy. No raw SQL in services (except PostGIS functions via `func.ST_*`). |
| Canvass Service -> Dashboard Service | Redis pub/sub | Loose coupling. Canvass service publishes events; dashboard service subscribes. Neither knows about the other directly. |
| API -> ZITADEL | HTTPS (OIDC/.well-known, Management API) | Auth middleware fetches JWKS. Campaign creation triggers org creation via Management API. |
| CLI -> Database | Direct SQLAlchemy (sync, via psycopg2) | CLI commands (seeding, maintenance) use sync sessions. Separate from async API sessions. |

## Build Order (Dependencies)

The following build order reflects hard dependencies between components:

```
Phase 1: Foundation (no dependencies)
  ├── Project structure (app/, models/, etc.)
  ├── Database setup (async engine, session factory, Alembic)
  ├── Configuration (pydantic-settings)
  └── Campaign model (the tenant anchor -- everything depends on this)

Phase 2: Auth + Tenancy (depends on: Phase 1)
  ├── ZITADEL JWT validation middleware (fastapi-zitadel-auth)
  ├── Tenant context middleware (extract campaign_id from JWT org claims)
  ├── PostgreSQL RLS policies on campaign table
  └── Role-based permission checks

Phase 3: Voter Data (depends on: Phase 2 for tenant isolation)
  ├── Canonical voter model + PostGIS geometry column
  ├── Voter CRUD endpoints
  ├── Import framework (base parser, field mapping config model)
  ├── L2 parser (first source -- example file available)
  └── Generic CSV parser with configurable mappings

Phase 4: Field Operations (depends on: Phase 3 for voter data)
  ├── Turf cutting service (PostGIS clustering)
  ├── Walk list generation (ordered by geography)
  ├── Canvassing effort CRUD
  ├── Door-knock result recording
  ├── Survey script engine (branched question flows)
  └── Phone banking (parallel to canvassing, shares volunteer model)

Phase 5: Volunteer Management (depends on: Phase 2, can parallel with Phase 4)
  ├── Volunteer CRUD
  ├── Skill tracking
  ├── Shift scheduling
  └── Assignment to turfs / phone banks

Phase 6: Real-Time Dashboards (depends on: Phase 4 for canvass data)
  ├── Redis integration
  ├── Pre-aggregated metrics (counters, rates)
  ├── SSE endpoints via sse-starlette
  └── Dashboard data models (turf completion, contact rates)
```

**Build order rationale:**
- Campaign model is the tenant anchor -- literally every other model has a FK to it
- Auth + RLS must exist before any data is created, otherwise retrofit is painful
- Voter data is prerequisite for field ops (can't cut turfs without addresses)
- Volunteer management can run in parallel with field ops since it shares only the campaign FK
- Dashboards come last because they aggregate data from field ops -- need the data sources first

## Sources

- [ZITADEL FastAPI Integration](https://zitadel.com/docs/sdk-examples/fastapi) -- Official ZITADEL docs
- [fastapi-zitadel-auth on PyPI](https://pypi.org/project/fastapi-zitadel-auth/) -- v0.3.2, MIT license
- [ZITADEL Claims Documentation](https://zitadel.com/docs/apis/openidoauth/claims) -- JWT claim structure
- [ZITADEL Multi-Tenancy with Organizations](https://zitadel.com/blog/multi-tenancy-with-organizations) -- Org model for SaaS
- [Tenant Isolation with PG RLS and SQLAlchemy](https://personal-web-9c834.web.app/blog/pg-tenant-isolation/) -- Implementation pattern
- [AWS: Multi-tenant data isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) -- Best practices
- [Crunchy Data: Row Level Security for Tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) -- RLS patterns
- [PostGIS ST_ClusterDBSCAN](https://postgis.net/docs/ST_ClusterDBSCAN.html) -- Density-based clustering
- [Crunchy Data: PostGIS Clustering with DBSCAN](https://www.crunchydata.com/blog/postgis-clustering-with-dbscan) -- Practical clustering guide
- [FastAPI SSE Documentation](https://fastapi.tiangolo.com/tutorial/server-sent-events/) -- Native SSE support
- [sse-starlette on PyPI](https://pypi.org/project/sse-starlette/) -- SSE library for Starlette/FastAPI
- [FastAPI Multi-Tenant Patterns Discussion](https://github.com/fastapi/fastapi/discussions/6056) -- Community patterns
- [L2 Voter Data Documentation](https://libguides.wustl.edu/L2_voter_data) -- Data format reference

---
*Architecture research for: CivicPulse Run API -- multi-tenant campaign management*
*Researched: 2026-03-09*
