# Stack Research

**Domain:** Multi-tenant political campaign management API with field operations and voter CRM
**Researched:** 2026-03-09
**Confidence:** HIGH

## Existing Stack (Already Decided)

These technologies are already declared in `pyproject.toml` and are non-negotiable.

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.13+ | Runtime |
| FastAPI | >=0.135.1 | Async REST API framework |
| SQLAlchemy | >=2.0.48 | ORM and query builder |
| Alembic | >=1.18.4 | Database migrations |
| asyncpg | >=0.31.0 | Async PostgreSQL driver |
| psycopg2-binary | >=2.9.11 | Sync PostgreSQL driver (Alembic) |
| Pydantic | >=2.12.5 | Request/response validation |
| Pydantic-Settings | >=2.13.1 | Configuration from env vars |
| Uvicorn | >=0.41.0 | ASGI server |
| Loguru | >=0.7.3 | Structured logging |
| Typer | >=0.24.1 | CLI commands |
| uv | -- | Package manager |

## Recommended Additions

### PostGIS / Geospatial

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| GeoAlchemy2 | >=0.18.4 | SQLAlchemy extension for PostGIS spatial types and functions | The only maintained SQLAlchemy-PostGIS bridge. Supports SQLAlchemy 2.x, provides `Geometry` and `Geography` column types, and exposes PostGIS functions (`ST_Contains`, `ST_DWithin`, `ST_Intersects`) as SQLAlchemy constructs. Required for turf boundaries, household clustering, and walk-list generation. | HIGH |
| Shapely | >=2.1.2 | Python geometry library for polygon operations in application code | Needed for turf cutting algorithms (splitting precincts into walkable turfs), bounding-box calculations, and geometry validation before database writes. GeoAlchemy2 integrates with Shapely for WKB/WKT serialization. Used in the turf-cutting service layer, not at the database query level. | HIGH |

**Why not GeoPandas:** GeoPandas pulls in numpy, pandas, and heavy C dependencies. Overkill for an API that primarily does geometry operations through PostGIS queries. Shapely alone handles the application-layer geometry needs (turf splitting, validation) without the DataFrame overhead.

### Authentication (ZITADEL Integration)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| fastapi-zitadel-auth | >=0.3.2 | ZITADEL-specific FastAPI auth integration | Purpose-built for ZITADEL + FastAPI. Handles JWKS fetching/caching, token validation, and provides FastAPI dependencies for route protection. Eliminates boilerplate of manual OIDC integration. Actively maintained (Feb 2026 release). | MEDIUM |
| Authlib | >=1.6.9 | OAuth2/OIDC client library (fallback) | ZITADEL's own Python documentation recommends Authlib. Use as the underlying OIDC library if fastapi-zitadel-auth doesn't cover a needed flow (e.g., machine-to-machine tokens, custom scopes). Battle-tested, well-documented. | HIGH |

**Why not python-jose:** Unmaintained since 2022. The PyPI page shows no releases in 3+ years. FastAPI's own docs have moved away from recommending it.

**Why not PyJWT directly:** PyJWT works but is low-level -- you'd manually handle JWKS endpoint discovery, key rotation, issuer validation. Authlib and fastapi-zitadel-auth handle all of this.

### Multi-Tenancy

No additional library needed. Multi-tenancy is an architectural pattern, not a library dependency. The recommended approach:

**Pattern: Shared database with `campaign_id` foreign key + PostgreSQL Row-Level Security (RLS)**

- Every tenant-scoped table includes a `campaign_id` column
- PostgreSQL RLS policies enforce data isolation at the database level (`SET app.current_campaign_id` per connection)
- FastAPI middleware extracts tenant context from the JWT (ZITADEL provides org/project context) and sets `campaign_id` on the database session
- SQLAlchemy events or session-level configuration set the PostgreSQL session variable before queries execute

**Why RLS over application-level filtering:** Even if application code has a bug and forgets a `.filter(campaign_id=...)`, the database refuses to return rows belonging to other tenants. Defense in depth.

**Why not schema-per-tenant:** Schema-per-tenant doesn't scale past ~100 tenants (migration complexity explodes), and campaigns are lightweight tenants -- many will have <1000 records. Shared tables with RLS is the standard for this scale.

**Reference implementation:** The `fastapi-rowsecurity` library on GitHub demonstrates the pattern but is too minimal for production use -- implement the pattern directly.

### Async Task Queue (Bulk Voter Imports, Background Processing)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| TaskIQ | >=0.12.1 | Async-native distributed task queue | Built for async Python from the ground up. Uses FastAPI-style dependency injection. Benchmarks show ~10x better throughput than ARQ. Supports Redis as broker. The async-first design avoids the impedance mismatch of running Celery in an async application. | HIGH |
| taskiq-fastapi | >=0.4.0 | FastAPI integration for TaskIQ | Allows TaskIQ tasks to use FastAPI dependencies (database sessions, auth context). Tasks can depend on `Request` objects and reuse the same DI container as your API routes. | HIGH |
| taskiq-redis | >=1.2.2 | Redis broker and result backend for TaskIQ | Redis is already needed for real-time features (pub/sub). Using it as the task broker avoids adding another infrastructure dependency like RabbitMQ. | HIGH |
| Redis (server) | 7.x+ | Broker for TaskIQ, pub/sub for real-time | Required infrastructure. Single Redis instance serves both task queue and real-time pub/sub. | HIGH |
| redis (Python) | >=7.3.0 | Python Redis client | Async-native Redis client. Required by taskiq-redis. Supports Redis 7.x and 8.x. | HIGH |

**Why not Celery:** Celery was designed for synchronous Python. Using it with async FastAPI requires running sync workers alongside your async app, creating two execution models. TaskIQ is async-native and shares FastAPI's dependency injection pattern, making the codebase consistent.

**Why not ARQ:** ARQ benchmarks poorly under load (nearly 10x slower than TaskIQ in comparative tests). ARQ is simpler but lacks TaskIQ's middleware system, dependency injection, and ecosystem of integrations.

**Task examples for this project:**
- Bulk voter file import (L2 CSV files with 50+ columns, potentially millions of rows)
- Voter record deduplication after import
- Walk-list generation (geospatial clustering of households into turfs)
- Geocoding voter addresses that lack lat/long
- Aggregating canvassing results for dashboard metrics

### Real-Time Features (Canvassing Dashboards)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| FastAPI SSE (sse-starlette) | >=2.2.1 | Server-Sent Events for dashboard updates | SSE is simpler than WebSocket for the primary use case: server pushes canvassing metrics to dashboards. Works over HTTP/1.1, traverses proxies easily, auto-reconnects. FastAPI supports SSE natively via `StreamingResponse`, but sse-starlette adds proper event formatting and ID tracking. | MEDIUM |
| Redis Pub/Sub | -- | Cross-instance event broadcasting | When running multiple API instances behind a load balancer (Kubernetes), Redis Pub/Sub distributes events to all instances. A canvass result submitted to instance A gets broadcast to dashboard connections on instance B. No additional library needed beyond the redis Python client. | HIGH |

**Why SSE over WebSocket for dashboards:** Campaign dashboards are read-heavy (server pushes updates). SSE is unidirectional server-to-client, which matches this pattern exactly. WebSocket adds complexity (connection management, heartbeats, reconnection logic) without benefit when the client never sends data back through the socket.

**When to use WebSocket:** If the project later adds real-time collaborative features (e.g., two canvassers editing the same turf simultaneously), add WebSocket endpoints then. FastAPI supports `@app.websocket()` natively -- no additional library needed.

### CSV / Data Import

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Python csv (stdlib) | -- | CSV parsing for voter file imports | Voter files (L2, state SOS) are standard CSV. The stdlib `csv` module with `DictReader` handles this without pulling in pandas. For streaming large files (millions of rows), use chunked reading with `itertools.islice`. | HIGH |

**Why not pandas for CSV import:** Pandas loads entire files into memory as DataFrames. L2 voter files can be 500MB+. Streaming with stdlib `csv` + batch inserts via SQLAlchemy's `insert().values([...])` keeps memory constant regardless of file size.

### Testing

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| pytest | >=9.0.2 | Test runner | Standard Python test runner. No alternative is worth considering. | HIGH |
| pytest-asyncio | >=1.1.0 | Async test support | Required for testing async FastAPI endpoints and async SQLAlchemy sessions. Set `asyncio_mode = "auto"` in `pyproject.toml` to avoid decorating every test with `@pytest.mark.asyncio`. | HIGH |
| httpx | >=0.28.1 | Async HTTP client for testing | FastAPI recommends httpx with `ASGITransport` for async test clients. Replaces the sync `TestClient` when testing async endpoints. Also useful as a production HTTP client for calling external APIs (geocoding, ZITADEL introspection). | HIGH |
| factory-boy | >=3.3.3 | Test data factories | Generates realistic test data for models (voters, campaigns, turfs). Supports SQLAlchemy out of the box via `factory.alchemy.SQLAlchemyModelFactory`. Avoids brittle fixture files. | HIGH |
| coverage | >=7.13.4 | Code coverage reporting | Standard coverage tool. Use `pytest-cov` plugin for integration with pytest. | HIGH |

**Testing pattern for multi-tenant tests:**
- Create a test fixture that sets up RLS policies and sets `campaign_id` on the session
- Each test gets a transactional session that rolls back after the test
- Use factory-boy factories with a `campaign` trait to generate tenant-scoped test data
- Test that cross-tenant data access is blocked at the database level

### Development Tools

| Tool | Version | Purpose | Notes | Confidence |
|------|---------|---------|-------|------------|
| ruff | >=0.15.5 | Linter and formatter | Replaces flake8, isort, black, and pyflakes. Single tool for all Python code quality. Already specified in project conventions. | HIGH |
| pre-commit | >=4.x | Git hook manager | Run ruff, type checks, and tests before commits. Prevents broken code from entering the repo. | HIGH |
| mypy | >=1.x | Static type checking | FastAPI + Pydantic + SQLAlchemy 2 all have excellent type stub support. Catches bugs at development time, especially important for complex tenant-scoping logic. | MEDIUM |

## Installation

```bash
# Core additions (production dependencies)
uv add "geoalchemy2>=0.18.4" "shapely>=2.1.2" "fastapi-zitadel-auth>=0.3.2" "authlib>=1.6.9" "taskiq>=0.12.1" "taskiq-fastapi>=0.4.0" "taskiq-redis>=1.2.2" "redis>=7.3.0" "sse-starlette>=2.2.1" "httpx>=0.28.1"

# Dev dependencies
uv add --dev "pytest>=9.0.2" "pytest-asyncio>=1.1.0" "factory-boy>=3.3.3" "coverage>=7.13.4" "pytest-cov>=6.0" "ruff>=0.15.5" "pre-commit>=4.0" "mypy>=1.0"
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| TaskIQ | Celery | If the team already knows Celery well and the impedance mismatch with async is acceptable. Celery has more monitoring tools (Flower). |
| TaskIQ | ARQ | If task volume is very low (<100 tasks/day) and simplicity is paramount. ARQ has fewer moving parts. |
| GeoAlchemy2 + Shapely | GeoPandas | If the project needs heavy geospatial analytics (not just CRUD + spatial queries). GeoPandas excels at batch analysis, not per-request API operations. |
| fastapi-zitadel-auth | Manual Authlib OIDC | If ZITADEL-specific features are needed that fastapi-zitadel-auth doesn't expose (custom grant types, device auth flow). |
| SSE (sse-starlette) | WebSocket | If the project adds bidirectional real-time features (collaborative editing, live chat between canvassers). |
| stdlib csv | pandas | If voter file import needs complex transformations (pivot tables, statistical analysis) before database insertion. Unlikely for this project. |
| RLS multi-tenancy | Schema-per-tenant | If tenants need completely independent database schemas (custom fields per tenant). Adds significant migration complexity. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| python-jose | Unmaintained since 2022, security vulnerabilities unfixed | Authlib or fastapi-zitadel-auth |
| pandas for CSV import | Loads entire file into memory; voter files can be 500MB+ | stdlib csv with streaming/chunked reads |
| GeoPandas for API operations | Heavy dependency chain (numpy, pandas, GDAL); overkill for per-request spatial queries | GeoAlchemy2 for DB queries, Shapely for app-layer geometry |
| Celery | Synchronous architecture conflicts with async FastAPI; two execution models in one codebase | TaskIQ (async-native, FastAPI DI compatible) |
| SQLAlchemy sync engine in production | Blocks the async event loop; negates FastAPI's performance advantages | asyncpg with SQLAlchemy async engine (already configured) |
| Flask-* anything | Wrong framework ecosystem | FastAPI equivalents |
| Dramatiq | No native async support; same sync problems as Celery | TaskIQ |
| raw WebSocket for dashboards | Unnecessary complexity for unidirectional server-to-client updates | SSE via sse-starlette |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| GeoAlchemy2 >=0.18.4 | SQLAlchemy >=1.4 | Tested with SQLAlchemy 2.x. Requires PostGIS 2 or 3 on the database server. |
| taskiq >=0.12.1 | Python >=3.10 | Compatible with Python 3.13. taskiq-redis requires redis-py >=7.0.0,<8. |
| taskiq-fastapi >=0.4.0 | FastAPI >=0.93.0, taskiq >=0.8.0 | Compatible with current FastAPI version. |
| pytest-asyncio >=1.1.0 | Python >=3.9 | Breaking change in 1.0: `asyncio_mode` defaults changed. Set `asyncio_mode = "auto"` explicitly. |
| fastapi-zitadel-auth >=0.3.2 | Python >=3.10 | Relatively new library (first release 2024). Evaluate stability during implementation. |
| Shapely >=2.1.2 | Python >=3.9 | Shapely 2.x is a major rewrite using C++ (GEOS). Much faster than Shapely 1.x. |

## Infrastructure Requirements

| Component | Purpose | Notes |
|-----------|---------|-------|
| PostgreSQL 15+ with PostGIS 3.x | Primary database with spatial support | PostGIS extension must be enabled (`CREATE EXTENSION postgis`) |
| Redis 7.x+ | Task queue broker + real-time pub/sub | Single instance serves both purposes. Consider Redis Sentinel or Redis Cluster for HA in production. |
| ZITADEL | Authentication and authorization | External service at auth.civpulse.org. No infrastructure to manage. |

## Stack Patterns by Variant

**If voter file imports are >1M rows:**
- Use TaskIQ with chunked processing (batch size 5000 rows)
- Stream CSV with stdlib, insert batches via `INSERT ... VALUES` with SQLAlchemy Core (not ORM)
- Report progress via Redis pub/sub to the dashboard

**If real-time needs grow beyond dashboards:**
- Add WebSocket endpoints for bidirectional communication
- Use Redis pub/sub as the message layer (already in place)
- Consider adding `broadcaster` library for cleaner pub/sub abstraction

**If turf-cutting algorithms become compute-intensive:**
- Move turf generation to dedicated TaskIQ workers
- Consider adding `scipy` for Voronoi diagrams or k-means clustering
- PostGIS `ST_Subdivide` handles most polygon splitting at the DB level

## Sources

- [GeoAlchemy2 PyPI](https://pypi.org/project/GeoAlchemy2/) -- version 0.18.4 confirmed
- [GeoAlchemy2 Documentation](https://geoalchemy-2.readthedocs.io/) -- SQLAlchemy 2.x compatibility verified
- [TaskIQ PyPI](https://pypi.org/project/taskiq/) -- version 0.12.1 confirmed
- [TaskIQ FastAPI Integration](https://pypi.org/project/taskiq-fastapi/) -- version 0.4.0 confirmed
- [TaskIQ Redis](https://pypi.org/project/taskiq-redis/) -- version 1.2.2 confirmed
- [fastapi-zitadel-auth PyPI](https://pypi.org/project/fastapi-zitadel-auth/) -- version 0.3.2 confirmed
- [ZITADEL FastAPI SDK Docs](https://zitadel.com/docs/sdk-examples/fastapi) -- recommends Authlib
- [Authlib PyPI](https://pypi.org/project/authlib/) -- version 1.6.9 confirmed
- [FastAPI Multi-Tenancy Discussion](https://github.com/fastapi/fastapi/discussions/6056) -- community patterns
- [Multi-Tenancy with RLS Pattern](https://adityamattos.com/multi-tenancy-in-python-fastapi-and-sqlalchemy-using-postgres-row-level-security) -- implementation reference
- [FastAPI Async Tests Documentation](https://fastapi.tiangolo.com/advanced/async-tests/) -- httpx recommended
- [pytest-asyncio PyPI](https://pypi.org/project/pytest-asyncio/) -- version 1.1.0 confirmed
- [Shapely PyPI](https://pypi.org/project/shapely/) -- version 2.1.2 confirmed
- [Redis-py PyPI](https://pypi.org/project/redis/) -- version 7.3.0 confirmed
- [Task Queue Benchmarks](https://stevenyue.com/blogs/exploring-python-task-queue-libraries-with-load-test) -- TaskIQ performance data

---
*Stack research for: CivicPulse Run API -- multi-tenant campaign management*
*Researched: 2026-03-09*
