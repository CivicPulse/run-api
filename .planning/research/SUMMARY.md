# Project Research Summary

**Project:** CivicPulse Run API
**Domain:** Multi-tenant political campaign management API (voter CRM, canvassing, field operations)
**Researched:** 2026-03-09
**Confidence:** MEDIUM-HIGH

## Executive Summary

CivicPulse Run API is a multi-tenant campaign field operations platform built on FastAPI, PostgreSQL/PostGIS, and Redis. The existing codebase already establishes the core stack (FastAPI, SQLAlchemy 2.x async, Alembic, Pydantic). The recommended additions -- GeoAlchemy2/Shapely for spatial operations, TaskIQ for async background processing, ZITADEL for auth, and SSE for real-time dashboards -- are all well-supported, async-native choices that align with the existing stack. The architecture follows a standard layered pattern (API routers, service layer, data access with RLS) that is well-documented for this exact technology combination.

The recommended approach is to build outward from two foundational pillars: multi-tenant isolation via PostgreSQL Row-Level Security, and ZITADEL-based authentication with local campaign-role authorization. Every feature depends on these being correct. Once the tenant boundary is airtight, the voter data import pipeline (the most performance-critical and complex subsystem) should be built next, followed by canvassing field operations that consume that data. The architecture research confirms this dependency chain: campaigns are the tenant anchor, voter data enables field ops, and dashboards aggregate field ops results.

The top risks are: (1) multi-tenant data leaks from misconfigured RLS or shared connection pools -- this is existential for a political campaign tool and must be designed in from day one; (2) voter data normalization being underestimated -- L2/SOS files have wildly different schemas and the canonical voter model must handle modeled vs. administrative data, voting history normalization, and address standardization; (3) PostGIS spatial query performance degrading at production scale (100K+ voters) without proper indexing, table clustering, and query patterns (ST_DWithin not ST_Distance). All three risks have well-documented prevention strategies but require deliberate upfront design rather than retrofit.

## Key Findings

### Recommended Stack

The existing stack (FastAPI, SQLAlchemy 2.x async, Alembic, Pydantic, asyncpg, Uvicorn) is solid and non-negotiable. The recommended additions fill specific gaps without introducing unnecessary complexity.

**Core additions:**
- **GeoAlchemy2 + Shapely:** PostGIS integration for turf cutting, walk list generation, and spatial voter queries. GeoAlchemy2 is the only maintained SQLAlchemy-PostGIS bridge. Shapely handles application-layer geometry (turf splitting, validation) without the heavy GeoPandas dependency chain.
- **TaskIQ + taskiq-fastapi + taskiq-redis:** Async-native task queue for bulk voter imports, turf generation, and geocoding. Shares FastAPI's dependency injection pattern, avoids the sync/async impedance mismatch of Celery, and benchmarks 10x faster than ARQ.
- **fastapi-zitadel-auth + Authlib:** ZITADEL JWT validation with JWKS caching. Purpose-built for the ZITADEL + FastAPI combination. Authlib as fallback for machine-to-machine flows.
- **sse-starlette:** Server-Sent Events for dashboard real-time updates. Simpler than WebSocket for the unidirectional server-to-client pattern. Redis pub/sub handles cross-instance fan-out.
- **Redis 7.x:** Single infrastructure dependency serving both task queue broker and real-time pub/sub. No need for RabbitMQ.

**Critical version requirements:** PostGIS 3.x on PostgreSQL 15+, Redis 7.x+, Python 3.13+.

**What to avoid:** Celery (sync architecture), pandas for CSV import (memory hog), python-jose (unmaintained), WebSocket for dashboards (unnecessary complexity), schema-per-tenant (doesn't scale).

### Expected Features

**Must have (table stakes):**
- Multi-tenant campaign management with strict RLS data isolation
- ZITADEL auth integration with campaign-scoped RBAC (owner, admin, manager, volunteer, viewer)
- Voter file import (L2 + generic CSV) with configurable field mapping and deduplication
- Canonical voter model with search, filtering, tagging, and list management
- Turf cutting via PostGIS polygon definition with household clustering
- Walk list generation from turf + target criteria, ordered geographically
- Door-knock outcome recording with standard result codes
- Linear survey scripts with response capture
- Interaction history (append-only event log per voter)
- Volunteer registration and profile management
- Basic canvassing progress dashboard endpoints

**Should have (differentiators):**
- Truly nonpartisan access (no party restrictions -- the #1 market differentiator)
- API-first design with full REST API and OpenAPI docs (competitors lock APIs behind paywalls)
- Open-source and self-hostable
- GPS-optimized canvassing routes (20-30% walking time savings)
- Flexible multi-vendor voter data source mapping system
- Offline-ready API sync patterns (changes-since + batch upload)

**Defer (v2+):**
- Multi-campaign organization analytics, donation tracking, event management, email/SMS delivery, OSDI compliance, predictive dialer, AI content generation, voter score modeling

### Architecture Approach

A layered monolith with versioned API routes (thin), a service layer (all business logic), and SQLAlchemy async ORM with PostgreSQL RLS as the primary tenant isolation mechanism. ZITADEL Organizations map to campaigns as tenants. Voter import uses a two-layer data model: raw source preservation in JSONB alongside a normalized canonical voter model. Turf cutting leverages PostGIS DBSCAN clustering. Real-time dashboards use SSE with Redis pub/sub for cross-instance fan-out and pre-aggregated metrics.

**Major components:**
1. **Auth + Tenant Middleware** -- ZITADEL JWT validation, campaign_id extraction from org claims, PostgreSQL RLS session variable injection
2. **Voter Import Pipeline** -- Source-specific adapters (L2, SOS, generic CSV), field mapping configs, canonical normalization, deduplication, background processing via TaskIQ
3. **Turf Cutting Service** -- PostGIS ST_ClusterDBSCAN for geographic clustering, household pre-grouping, boundary polygon generation, configurable turf sizing (50-80 doors)
4. **Canvass/Phone Bank Service** -- Walk/call list generation, outcome recording, branched survey script engine (shared across canvassing and phone banking)
5. **Dashboard SSE Service** -- Redis pub/sub subscription, pre-aggregated counters, EventSourceResponse streaming

### Critical Pitfalls

1. **Multi-tenant data leaks** -- Use PostgreSQL RLS as primary enforcement (not application-level WHERE clauses). Create separate DB roles for migrations vs. app. Set tenant context via SQLAlchemy `after_begin` event, not middleware. Write cross-tenant access tests for every endpoint.
2. **Voter data normalization underestimated** -- Build source-specific adapters (not a universal mapper). Two-layer model: raw preservation + canonical normalization. Separate modeled fields from administrative facts. Normalize voting history as rows, not columns. Address standardization is deceptively hard.
3. **PostGIS performance collapse at scale** -- Always use ST_DWithin (not ST_Distance). Use geometry type with SRID 4326 (not geography). Create GiST spatial indexes explicitly. CLUSTER table on spatial index after bulk imports. Pre-compute aggregates via materialized views.
4. **Bulk import blocking the API** -- Use PostgreSQL COPY protocol (not ORM inserts). Separate connection pool for background tasks. Staging table pattern: COPY to staging, merge to canonical. Return 202 Accepted with job ID, never synchronous.
5. **ZITADEL auth/authz confusion** -- Use local JWT validation with cached JWKS (not token introspection per request). Keep campaign-role authorization in your own database (user_campaign_roles table), not in ZITADEL token claims. Handle JWKS key rotation gracefully.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation and Multi-Tenancy
**Rationale:** Everything depends on the campaign model (tenant anchor) and RLS isolation. Auth must exist before any data is created -- retrofitting RLS is painful and dangerous. The async database session pattern established here gets copied to every endpoint.
**Delivers:** Project structure, async database engine with connection pooling, Campaign CRUD, PostgreSQL RLS policies, ZITADEL JWT auth middleware, tenant context injection, role-based permission framework, user_campaign_roles table
**Addresses:** Multi-tenant campaign management, ZITADEL auth + RBAC, campaign settings
**Avoids:** Pitfalls 1 (data leaks), 6 (ZITADEL integration), 7 (async connection exhaustion)

### Phase 2: Voter Data Import and CRM
**Rationale:** Voter data is the prerequisite for all field operations. The import pipeline is the most performance-critical path -- design for millions of rows from day one. The canonical voter model must be right before downstream features build on it.
**Delivers:** Canonical voter model with PostGIS geometry, voter CRUD + search/filtering, import framework with L2 adapter and generic CSV adapter, field mapping configs, deduplication, background import via TaskIQ, voter tagging and list management, interaction history model
**Addresses:** Voter file import, canonical voter model, voter search/filtering, voter tagging, contact management, interaction history
**Avoids:** Pitfalls 2 (normalization), 3 (PostGIS performance), 5 (bulk import blocking)

### Phase 3: Canvassing Operations
**Rationale:** Core field operations workflow. Depends on voter data (Phase 2) for addresses and targeting. Turf cutting is the geographically complex feature -- start with DBSCAN clustering and manual turf adjustment.
**Delivers:** Turf cutting service (PostGIS clustering), walk list generation with geographic ordering, household clustering, door-knock outcome recording, linear survey scripts with response capture, canvasser assignment to turfs
**Addresses:** Turf cutting, walk list generation, household clustering, door-knock recording, survey scripts, canvasser assignment, attempt tracking
**Avoids:** Pitfall 4 (unusable turfs from naive clustering)

### Phase 4: Volunteer Management
**Rationale:** Semi-independent from field ops -- shares only the campaign FK. Can be built in parallel with Phase 3 but logically follows it because volunteer assignment links to turfs.
**Delivers:** Volunteer CRUD, skill tracking, shift scheduling with self-signup, volunteer assignment to turfs and phone banks, hours tracking
**Addresses:** Volunteer registration, assignment, shift scheduling, hours tracking, basic communication endpoints

### Phase 5: Phone Banking
**Rationale:** Second major field ops channel. Reuses the survey script engine from Phase 3 and the volunteer model from Phase 4. Lower priority than canvassing for v1.
**Delivers:** Call list generation from voter universe, call scripts (reuse engine), call outcome recording, call disposition and survey capture
**Addresses:** Phone banking call lists, call scripts, call outcomes

### Phase 6: Real-Time Dashboards and Monitoring
**Rationale:** Dashboards aggregate data from field ops -- need the data sources first. Redis integration, SSE streaming, and pre-aggregated metrics complete the operational loop.
**Delivers:** Redis integration, pre-aggregated canvassing/phone bank metrics, SSE endpoints via sse-starlette, turf completion tracking, contact rate monitoring, volunteer activity summary
**Addresses:** Real-time canvassing dashboard, phone bank progress, volunteer activity summary

### Phase Ordering Rationale

- **Phases 1 and 2 are strictly sequential:** RLS must exist before voter data, voter data must exist before field ops. No shortcuts here.
- **Phases 3 and 4 can partially overlap:** Volunteer management is independent until the assignment feature links it to turfs.
- **Phase 5 reuses Phase 3 infrastructure:** The survey script engine and outcome recording patterns are shared. Phone banking is canvassing without geography.
- **Phase 6 comes last:** It aggregates data from Phases 3-5. Building it earlier means building against mock data.
- **This order matches the dependency graph from both ARCHITECTURE.md and FEATURES.md** -- both independently arrived at the same build sequence.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (RLS + ZITADEL):** ZITADEL organization-to-campaign mapping needs prototype validation. The `fastapi-zitadel-auth` library is new (Dec 2025) and may have gaps. RLS with async connection pooling needs careful testing.
- **Phase 2 (Voter Import):** L2 field mapping needs validation against real full-state files (not just the example). Deduplication strategy (composite key matching vs. probabilistic) needs design decision. TaskIQ integration with FastAPI DI needs prototyping.
- **Phase 3 (Turf Cutting):** PostGIS DBSCAN clustering applied to political turf cutting has no direct reference implementation found. The algorithm (cluster -> split oversized -> merge undersized -> generate boundaries) is inferred from general spatial patterns and will need iterative tuning with real geographic data.

Phases with standard patterns (skip research-phase):
- **Phase 4 (Volunteer Management):** Standard CRUD with scheduling. Well-documented patterns, no novel complexity.
- **Phase 5 (Phone Banking):** Reuses existing patterns from canvassing. Call list generation is voter filtering with a phone number constraint.
- **Phase 6 (Dashboards):** SSE + Redis pub/sub is thoroughly documented. FastAPI has native SSE docs. Pre-aggregation is a standard caching pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended packages verified on PyPI with version numbers. Compatibility confirmed. Existing stack is established. |
| Features | HIGH | Comprehensive competitor analysis (NGPVAN, NationBuilder, Ecanvasser, GoodParty). Feature dependencies mapped. Clear MVP definition. |
| Architecture | MEDIUM-HIGH | Layered architecture and RLS patterns well-documented by AWS, Crunchy Data, FastAPI community. ZITADEL org mapping is newer (MEDIUM). PostGIS turf cutting algorithm is inferred (MEDIUM). |
| Pitfalls | MEDIUM-HIGH | Multi-tenancy and async pitfalls verified across multiple authoritative sources. Voter data normalization pitfalls confirmed by the National Voter File project's struggles. Turf cutting edge cases are domain-inferred. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **ZITADEL org-to-campaign mapping:** Needs prototype validation during Phase 1. The exact JWT claims structure for multi-organization membership should be tested against a real ZITADEL instance, not just documentation.
- **fastapi-zitadel-auth maturity:** Library is < 18 months old (first release 2024). Have Authlib as a fallback plan if it lacks needed features. Evaluate during Phase 1 implementation.
- **Turf cutting algorithm tuning:** No reference implementation for political turf cutting with PostGIS DBSCAN. Parameters (eps distance, min_points, max doors per turf) need empirical tuning with real voter data. Plan for iteration in Phase 3.
- **Voter deduplication strategy:** Research identified composite key matching (name + address + DOB) but did not evaluate probabilistic matching libraries. For v1 MVP, deterministic matching is likely sufficient; probabilistic matching is a v1.x enhancement.
- **TaskIQ production maturity:** TaskIQ benchmarks well but has a smaller ecosystem than Celery. Monitor for issues during Phase 2 when it handles real bulk imports. Redis broker configuration under load needs testing.
- **Offline sync API design:** Identified as a differentiator but the specific sync protocol (timestamp-based, vector clocks, CRDTs) was not deeply researched. Defer detailed design until mobile client development begins.

## Sources

### Primary (HIGH confidence)
- [GeoAlchemy2 docs](https://geoalchemy-2.readthedocs.io/) -- SQLAlchemy 2.x PostGIS integration
- [PostGIS ST_ClusterDBSCAN](https://postgis.net/docs/ST_ClusterDBSCAN.html) -- spatial clustering
- [Crunchy Data: PostGIS clustering](https://www.crunchydata.com/blog/postgis-clustering-with-dbscan) -- DBSCAN practical guide
- [Crunchy Data: RLS for tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) -- multi-tenancy patterns
- [AWS: Multi-tenant RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) -- RLS best practices
- [ZITADEL claims docs](https://zitadel.com/docs/apis/openidoauth/claims) -- JWT claim structure
- [ZITADEL multi-tenancy with orgs](https://zitadel.com/blog/multi-tenancy-with-organizations) -- org model for SaaS
- [TaskIQ benchmarks](https://stevenyue.com/blogs/exploring-python-task-queue-libraries-with-load-test) -- performance comparison
- [NGPVAN turf cutting best practices](https://www.ngpvan.com/wp-content/uploads/2024/10/Turf-Cutting-OBP.pdf) -- industry standard

### Secondary (MEDIUM confidence)
- [fastapi-zitadel-auth](https://pypi.org/project/fastapi-zitadel-auth/) -- v0.3.2, relatively new library
- [FastAPI multi-tenant discussion](https://github.com/fastapi/fastapi/discussions/6056) -- community patterns
- [L2 voter data documentation](https://libguides.wustl.edu/L2_voter_data) -- data format reference
- [Pew Research: voter file accuracy](https://www.pewresearch.org/methods/2018/02/15/commercial-voter-files-and-the-study-of-u-s-politics/) -- data quality context

### Tertiary (needs validation)
- PostGIS DBSCAN for political turf cutting -- inferred application, no direct reference implementation found
- TaskIQ at production scale for million-row imports -- benchmarks exist but no comparable deployment case study found

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
