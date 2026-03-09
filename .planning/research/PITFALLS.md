# Pitfalls Research

**Domain:** Multi-tenant political campaign management API (voter CRM, canvassing, field operations)
**Researched:** 2026-03-09
**Confidence:** MEDIUM-HIGH (domain-specific patterns verified across multiple sources; some areas rely on architectural inference)

## Critical Pitfalls

### Pitfall 1: Multi-Tenant Data Leaks via Missing or Bypassed Row-Level Security

**What goes wrong:**
Campaign A's voter data, canvassing results, or survey responses become visible to Campaign B. In political campaigns this is catastrophic -- exposing voter contact strategies, opposition research targets, or supporter lists to rival campaigns. A single leak could destroy platform trust permanently.

**Why it happens:**
- Application-level filtering (`WHERE campaign_id = :id`) is fragile. A single missed filter in one query, one new endpoint, or one admin tool leaks data across tenants.
- PostgreSQL superusers and table owners bypass RLS by default. If the application connects as the table owner (common in early development), RLS policies have zero effect.
- Connection pooling with async SQLAlchemy can share session state between requests. If tenant context is set via `SET app.current_tenant` on a pooled connection and the next request reuses that connection without resetting the variable, it inherits the previous tenant's context.
- Alembic migrations typically run as a privileged user that bypasses RLS, which is correct -- but developers may accidentally use the same connection string for the application, silently disabling all tenant isolation.
- Referential integrity checks can leak information across tenant boundaries (covert channel attacks via foreign key constraint errors).

**How to avoid:**
1. Implement PostgreSQL RLS as the **primary** isolation mechanism, not application-level WHERE clauses. RLS is a database-level guardrail that protects even when application code has bugs.
2. Create a dedicated PostgreSQL role for the application (e.g., `civicpulse_app`) that is NOT the table owner and NOT a superuser. The migration user owns tables; the app user is subject to RLS.
3. Set tenant context at the start of every database session using `SET app.current_campaign_id = :id` via an SQLAlchemy session event (`after_begin` or via middleware). Reset it when the session closes.
4. Use `after_begin` session events rather than middleware-level SET statements to ensure the tenant context is always set before any query executes, even in background tasks.
5. Write integration tests that explicitly attempt cross-tenant data access and assert failure. Run these on every PR.

**Warning signs:**
- No separate database roles for migrations vs. application
- `campaign_id` filtering only in Python code, not in database policies
- Tests that only verify "correct data returned" without verifying "incorrect data NOT returned"
- Connection pool warnings or stale session issues in logs

**Phase to address:**
Phase 1 (Foundation/Multi-tenancy). RLS must be designed into the schema from day one. Retrofitting RLS onto an existing schema is painful because every table needs policies, every query path needs testing, and every connection needs role separation.

---

### Pitfall 2: Voter Data Normalization Treated as a Simple Field-Mapping Problem

**What goes wrong:**
The team builds a CSV field mapper ("L2's column 'Lattitude' maps to our 'latitude' field") and considers voter import solved. Then real-world data arrives: state SOS files with completely different schemas, voting history encoded as columns vs. rows, percentage-formatted likelihood scores, ethnicity as "Likely African-American" (modeled, not self-reported), addresses with inconsistent parsing, and phone numbers with varying confidence codes. The "simple mapper" becomes an unmaintainable mess of special cases.

**Why it happens:**
- L2 provides a standardized format, but it standardizes **their** output -- each state's raw SOS data underneath has different fields, different voter ID formats, different voting history structures, and different demographic categories.
- L2 data contains modeled/estimated fields (ethnicity, marital status, likelihood scores) mixed with administrative fields (name, address, voting history). These have fundamentally different reliability levels but look identical in the CSV.
- Voting history varies wildly: L2 uses boolean columns per election year (e.g., `General_2024`, `Voted in 2022`), but state SOS files may provide a separate history table with election dates and vote methods. The canonical model must accommodate both.
- Address normalization is deceptively complex: "112 Tee Dr" vs "112 Tee Drive" vs "112 Tee Dr." are the same address. USPS standardization is needed for deduplication but adds a dependency.
- The National Voter File open-source project stalled after processing only 9 states, demonstrating exactly how this complexity compounds.

**How to avoid:**
1. Design a two-layer data model: a **raw import** layer that preserves source data verbatim (with source type, import timestamp, confidence metadata), and a **canonical voter** layer with normalized fields. Never discard the raw data.
2. Build source-specific adapters as pluggable classes (L2Adapter, StateSOS_GA_Adapter, GenericCSVAdapter), not a single configurable mapper. Each adapter knows its source's quirks.
3. Separate "administrative facts" (name, address, registration) from "modeled estimates" (ethnicity, likelihood scores) in the data model. Tag every field with its provenance and confidence level.
4. Use a voter matching/deduplication strategy that handles the same person appearing in multiple data sources. Match on a composite of (name similarity + address + date of birth) rather than any single field.
5. Normalize addresses using USPS standards (consider the `usaddress` Python library or a geocoding service) during import, storing both raw and normalized forms.
6. Represent voting history as rows (voter_id, election_date, election_type, voted_boolean) rather than columns. Column-per-election schemas become unmanageable as election cycles accumulate.

**Warning signs:**
- A single "field mapping" configuration table or JSON blob trying to handle all sources
- Import tests using only the example L2 file, not real state SOS formats
- No distinction between modeled and administrative data in the schema
- Deduplication based on exact string matching (misses "Bob" vs "Robert")
- Voting history stored as wide columns rather than normalized rows

**Phase to address:**
Phase 2 (Voter Data Import). This is the foundational data layer -- get it wrong and every downstream feature (canvassing lists, segmentation, CRM) inherits the problems. Design the canonical model before writing import code.

---

### Pitfall 3: PostGIS Spatial Queries That Degrade Catastrophically at Scale

**What goes wrong:**
Turf cutting and walk list generation work fine with 1,000 test voters but take minutes or time out with 500,000+ voters in a real county. Spatial queries that should use indexes fall back to sequential scans. The team ends up with a system that can import voter data but cannot efficiently query it geographically -- defeating the core value proposition of canvassing management.

**Why it happens:**
- Using `ST_Distance()` instead of `ST_DWithin()` for proximity queries. `ST_Distance` computes exact distance for every row and cannot use spatial indexes. `ST_DWithin` uses the bounding box index (via the `&&` operator internally) to filter first, then computes exact distance only on candidates.
- Storing coordinates as `geography` type when `geometry` with SRID 4326 would suffice. Geography type computations are significantly more expensive (geodesic math vs. planar math). For campaign operations within a single state or county, the accuracy difference is negligible but the performance cost is real.
- Missing or incorrect spatial indexes. A GiST index on a geometry column is not automatically created -- it must be explicitly added. Without it, every spatial query is a full table scan.
- Querying raw point data when the use case calls for pre-computed aggregates. "How many target voters in this precinct?" should hit a materialized view, not count individual voter points each time.
- Running `ST_Contains()` or `ST_Intersects()` with complex polygon boundaries (hand-drawn turfs with many vertices) against millions of points without simplifying the polygon first.

**How to avoid:**
1. Always use `ST_DWithin()` for proximity/radius queries, never `ST_Distance() < threshold`.
2. Use `geometry` type with SRID 4326, not `geography`, for voter point data. The computational savings are substantial and the accuracy loss is negligible at campaign-district scale.
3. Create GiST spatial indexes on all geometry columns. Include them in Alembic migrations as first-class schema objects.
4. Pre-compute voter counts per precinct/census block as materialized views. Refresh on data import, not on query.
5. For turf cutting operations, simplify polygon boundaries with `ST_Simplify()` before running containment queries against voter points.
6. Cluster the table on the spatial index using `CLUSTER voters USING idx_voters_geom` after bulk imports. This physically reorders rows on disk to match spatial proximity, dramatically improving range query performance.
7. Set appropriate PostgreSQL memory parameters: increase `work_mem` for complex spatial operations, increase `maintenance_work_mem` for spatial index builds.

**Warning signs:**
- Spatial queries taking > 1 second for a single turf/precinct
- `EXPLAIN ANALYZE` showing sequential scans on voter tables
- Dashboard showing "generating walk list..." spinners for > 5 seconds
- Memory spikes during turf cutting operations

**Phase to address:**
Phase 2 (Voter Data Import) for index creation and table clustering. Phase 3 (Canvassing) for turf cutting query optimization. Performance test with realistic data volumes (100K+ voters) during both phases.

---

### Pitfall 4: Canvassing Turf Cutting Edge Cases That Produce Unusable Walk Lists

**What goes wrong:**
Auto-generated turfs look reasonable on a map but are impractical for canvassers in the field: turfs split by rivers or highways that require a 20-minute detour, apartment buildings assigned to multiple turfs splitting the same hallway, rural areas where "nearby" addresses are miles apart by road, or turf sizes that give one volunteer 200 doors and another 15.

**Why it happens:**
- Turf cutting by geographic proximity (nearest-neighbor clustering) ignores road networks, natural barriers, and building access patterns. Two houses 50 meters apart on a map may be on opposite sides of a freeway with the nearest crossing 2 miles away.
- Apartment/condo buildings require household clustering -- all units at the same address should be in the same turf. Naive point-based clustering treats each unit as independent.
- Equal-area geographic splits do not produce equal-workload splits. Urban blocks may have 500 voters per square mile while rural areas have 5.
- Odd/even address splitting (a common canvassing optimization to keep walkers on one side of the street) breaks when the data source does not reliably provide the odd/even flag or when the street has irregular numbering.
- Manual turf drawing on a map (the NationBuilder approach) is flexible but labor-intensive and requires GIS knowledge that most campaign staff lack.

**How to avoid:**
1. Implement household clustering as a pre-processing step: group all voters at the same physical address into a household unit. Use the household as the atomic unit for turf assignment, not individual voters.
2. Default turf size to 50-80 doors per turf (NGPVAN's recommended range for a 2-3 hour canvassing shift). Allow campaigns to configure this.
3. Support both auto-generated and manually-drawn turfs. Auto-generation should produce a starting point that staff can adjust, not a final assignment.
4. When auto-cutting, use census block boundaries or precinct boundaries as initial cut lines rather than arbitrary geographic splits. These boundaries already follow roads and natural features.
5. Include a "turf quality" check that flags turfs spanning natural barriers (using road network data or known boundary polygons) or turfs with extreme voter density imbalances.
6. Store the L2 `Street Number Odd/Even` field and use it for walk-sheet ordering (canvass one side of the street, then the other) but do not rely on it for turf splitting.

**Warning signs:**
- Turf generation produces turfs with highly variable voter counts (>2x standard deviation from target)
- No household grouping logic -- each apartment unit is a separate "door"
- Turf boundaries that cross highways, rivers, or railroad tracks
- Walk lists ordered by voter ID or alphabetically instead of geographic routing

**Phase to address:**
Phase 3 (Canvassing Management). But household clustering logic belongs in Phase 2 (Voter Data Import) as part of the canonical data model. The `Mailing Family ID` and household fields from L2 should be captured during import.

---

### Pitfall 5: Bulk Voter File Import That Blocks the API or Corrupts Data

**What goes wrong:**
Importing a full state voter file (5-15 million rows) locks the database, exhausts connection pool, causes API timeouts for other users, or partially completes leaving the database in an inconsistent state. Alternatively, imports succeed but silently produce duplicate records, lose voting history, or mangle Unicode characters in voter names.

**Why it happens:**
- Using SQLAlchemy ORM `session.add()` in a loop for bulk inserts. ORM overhead (identity map, change tracking, event hooks) makes this 10-100x slower than raw COPY.
- Running imports in the same database connection pool as the API. A long-running import transaction holds connections and blocks API requests.
- No transactional strategy for partial imports. If an import fails at row 3 million of 5 million, is the database in a consistent state?
- Not disabling indexes during bulk loads. Maintaining spatial and B-tree indexes during a multi-million row insert dramatically slows the import and fragments indexes.
- Processing the entire file in memory. A 15-million-row CSV can consume 10+ GB of RAM if loaded into Python objects.

**How to avoid:**
1. Use PostgreSQL `COPY` protocol (via asyncpg's `copy_to_table` or psycopg's `copy_expert`) for bulk imports. COPY is 10-100x faster than INSERT because it bypasses SQL parsing and transaction per-row overhead.
2. Run imports as a background task (Celery, ARQ, or a dedicated worker process) with a separate database connection pool from the API. Never import in an API request handler.
3. Implement chunk-based processing: read the CSV in chunks of 10,000-50,000 rows, validate each chunk, COPY it to a staging table, then merge from staging to the canonical table in a single transaction.
4. Use a staging table pattern: COPY raw data into `voter_import_staging`, run validation/normalization queries, then `INSERT INTO voters SELECT ... FROM voter_import_staging ON CONFLICT DO UPDATE`. This keeps the canonical table consistent.
5. Drop and recreate spatial indexes around bulk imports. For initial loads, build indexes after all data is loaded. For incremental updates, consider partial index rebuilds.
6. Stream CSV files line-by-line using Python's `csv` module or `pandas` chunked reader rather than loading the entire file into memory.
7. Track import progress (rows processed, rows skipped, rows errored) and make it queryable so campaigns can monitor long-running imports.

**Warning signs:**
- Import endpoint returns HTTP response (should be 202 Accepted with a job ID, not a synchronous response)
- SQLAlchemy `session.add()` calls in a loop during import code
- No staging table in the schema
- Import tests using only the 50-row example file, never a file with 100K+ rows
- No background task infrastructure (no Celery/ARQ/task queue)

**Phase to address:**
Phase 2 (Voter Data Import). The import pipeline is the most performance-critical path in the entire system. Design it for millions of rows from day one -- retrofitting a synchronous ORM-based import into an async COPY-based pipeline is a significant rewrite.

---

### Pitfall 6: ZITADEL OIDC Integration That Breaks Multi-Tenancy or Fails Under Load

**What goes wrong:**
Authentication works in development but breaks in production: tokens validated against the wrong ZITADEL project, campaign-level authorization not enforced (a user authenticated for Campaign A can access Campaign B's data), token introspection calls to ZITADEL add 50-100ms latency to every API request, or JWKS key rotation causes a brief authentication outage.

**Why it happens:**
- Confusing authentication (who is this user?) with authorization (what campaigns can this user access?). ZITADEL handles authentication. Campaign-level authorization (user X is an admin of Campaign A and a volunteer for Campaign B) must be enforced by CivicPulse, not by ZITADEL.
- Using token introspection (HTTP call to ZITADEL on every request) instead of local JWT validation with cached JWKS. Introspection is authoritative but adds network latency. At 100 requests/second, this means 100 HTTP calls/second to ZITADEL.
- Not caching the JWKS (JSON Web Key Set). ZITADEL publishes its signing keys at a well-known endpoint. If the application fetches this on every request instead of caching it (with TTL-based refresh), it creates unnecessary latency and a ZITADEL dependency for every API call.
- ZITADEL can issue both JWT and opaque tokens depending on client configuration. If the API only handles one format, it silently fails for the other.
- Custom claims mapping: ZITADEL's default token claims may not include campaign-specific roles. Getting custom claims (like `campaign_roles`) into tokens requires ZITADEL Actions (server-side hooks) or metadata, which are non-trivial to configure.

**How to avoid:**
1. Use local JWT validation with cached JWKS as the primary authentication method. Use the `fastapi-zitadel-auth` library which implements this pattern. Cache JWKS with a 1-hour TTL and background refresh.
2. Build a separate authorization layer in CivicPulse that maps authenticated users to campaign roles. Store campaign membership (`user_campaign_roles` table) in your database, not in ZITADEL tokens.
3. Configure ZITADEL to issue JWT tokens (not opaque tokens) for all API clients to enable local validation.
4. Implement a `get_current_user` FastAPI dependency that: validates the JWT, looks up the user's campaign roles from the local database, and returns a context object with both identity and permissions.
5. Use ZITADEL's organization concept to map to campaigns if appropriate, but keep the authoritative campaign-role mapping in your own database for flexibility and to avoid ZITADEL vendor lock-in.
6. Handle JWKS rotation gracefully: if a token's `kid` (key ID) is not in the cached JWKS, fetch a fresh JWKS before rejecting the token.

**Warning signs:**
- Every API request makes an HTTP call to ZITADEL (should be local JWT validation)
- No `user_campaign_roles` or equivalent table in the schema
- Authorization logic checking ZITADEL token claims for campaign permissions
- No JWKS caching or refresh strategy
- Tests mocking ZITADEL entirely rather than testing actual token validation paths

**Phase to address:**
Phase 1 (Foundation/Authentication). Authentication is the first thing to build, and getting the auth-vs-authz boundary wrong here means every subsequent phase builds on a broken foundation.

---

### Pitfall 7: FastAPI Async Patterns That Exhaust Connections or Deadlock Under Load

**What goes wrong:**
The API handles 10 concurrent requests fine but deadlocks or throws `QueuePool limit overflow` errors at 50+ concurrent requests. Or worse: it appears to work but silently leaks database connections until the pool is exhausted and the entire API becomes unresponsive. This typically happens during peak campaign moments (election day, debate nights, volunteer training sessions) -- exactly when reliability matters most.

**Why it happens:**
- Mixing sync and async code in FastAPI. Calling a synchronous database operation inside an `async def` endpoint blocks the event loop thread. FastAPI runs sync endpoints in a thread pool, but async endpoints run directly on the event loop -- a blocking call in an async endpoint blocks ALL concurrent requests.
- Not using `async with` for database sessions. If an async session is created but not properly closed (e.g., an exception occurs before the `finally` block), the connection is never returned to the pool. With asyncpg, connections are NOT returned via garbage collection -- they leak permanently until the pool is exhausted.
- Creating multiple SQLAlchemy engine instances instead of a single shared engine. Each engine has its own pool, and multiple engines multiply the total connections to PostgreSQL, potentially exceeding `max_connections`.
- Background tasks (imports, report generation) sharing the same connection pool as the API. A long-running import holds connections that the API needs for request handling.
- Not configuring pool size, max overflow, and pool timeout to match the expected concurrency and PostgreSQL's `max_connections`.

**How to avoid:**
1. Use `async def` endpoints with `AsyncSession` consistently. Never mix sync SQLAlchemy calls in async endpoints. If you must call sync code, use `run_in_executor`.
2. Always use context managers for sessions: `async with async_session() as session:`. Implement a FastAPI dependency that yields sessions with proper cleanup:
   ```python
   async def get_db():
       async with async_session_maker() as session:
           try:
               yield session
               await session.commit()
           except Exception:
               await session.rollback()
               raise
   ```
3. Create exactly ONE `AsyncEngine` instance at application startup (in the lifespan handler). Configure pool size based on deployment:
   - `pool_size`: number of persistent connections (start with 5-10)
   - `max_overflow`: temporary connections under load (start with 10)
   - `pool_timeout`: seconds to wait for a connection (30 seconds default)
   - `pool_recycle`: seconds before recycling connections (3600 to avoid stale connections)
4. Use a separate connection pool (or a separate database) for background tasks. Configure this in the task worker, not in the API process.
5. Add connection pool monitoring: log pool checkout/checkin events and alert when pool utilization exceeds 80%.

**Warning signs:**
- `TimeoutError` or `QueuePool limit overflow` in logs
- API response times increasing over time (connection leak)
- Sync database calls visible in async endpoint code paths
- Multiple `create_async_engine()` calls in the codebase
- No pool size configuration (relying on defaults)

**Phase to address:**
Phase 1 (Foundation). The database session pattern is established in the first endpoint and copied everywhere. Getting it wrong in Phase 1 means fixing it requires touching every endpoint.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Application-level tenant filtering instead of RLS | Faster initial development, no need for multiple DB roles | One missed WHERE clause = data leak; no defense in depth | Never for multi-tenant campaign data |
| SQLAlchemy ORM for bulk imports | Consistent code style, familiar patterns | 10-100x slower imports; cannot handle state-sized voter files | Only for imports under 10K rows (test data) |
| Storing voting history as columns | Matches L2 CSV format directly | Schema changes every election cycle; cannot query "all elections where voter participated" efficiently | Never -- normalize from the start |
| Synchronous voter file import in API request | No background task infrastructure needed | Blocks API, times out on real files, no progress tracking | Only in local development for testing |
| Hardcoded L2 field mappings | Works for the first data source | Adding state SOS support requires code changes, not configuration | MVP if L2 is explicitly the only source for v1 |
| Campaign authorization in ZITADEL claims | Single source of truth for auth | Tight coupling to ZITADEL; claim size limits; requires ZITADEL Actions for updates | Never -- keep campaign roles in your own database |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ZITADEL OIDC | Using token introspection for every request (HTTP call per request) | Local JWT validation with cached JWKS; introspection only for revocation checks |
| ZITADEL OIDC | Assuming tokens are always JWT format | Configure ZITADEL project to issue JWT tokens explicitly; handle both formats defensively |
| ZITADEL OIDC | Not handling JWKS key rotation | Cache JWKS with TTL; on unknown `kid`, refetch once before rejecting |
| PostgreSQL RLS | Connecting as table owner (bypasses all RLS policies) | Separate DB roles: `civicpulse_migrations` (owner), `civicpulse_app` (subject to RLS) |
| PostgreSQL RLS | Setting tenant via middleware but session reused from pool | Use SQLAlchemy `after_begin` event to SET tenant context on every new transaction |
| asyncpg | Using psycopg2 connection string format with asyncpg | asyncpg uses `postgresql+asyncpg://` scheme and does not support all psycopg2 parameters |
| PostGIS | Assuming PostGIS extension is auto-created | Include `CREATE EXTENSION IF NOT EXISTS postgis` in first Alembic migration |
| L2 Voter Data | Treating modeled fields (ethnicity, likelihood) as ground truth | Tag modeled fields with source and confidence; never use for legal/compliance purposes |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| ST_Distance for proximity queries | Walk list generation takes minutes | Use ST_DWithin with spatial index | > 50K voters in query area |
| No spatial index on voter geometry | All spatial queries slow, CPU-bound | CREATE INDEX USING GIST in migration | > 10K voters |
| ORM bulk insert for voter imports | Import hangs, memory spikes, 30+ minute imports | Use COPY protocol via asyncpg/psycopg | > 50K rows per import |
| Unclustered spatial data on disk | Spatial range queries read scattered disk pages | CLUSTER table ON spatial index after bulk import | > 200K voters |
| Complex turf polygons in containment queries | Turf assignment takes 10+ seconds per turf | ST_Simplify polygon before ST_Contains | Turfs with > 100 vertices |
| No connection pool limits | Works in dev, pool exhaustion under load | Configure pool_size, max_overflow, pool_timeout | > 20 concurrent API requests |
| Materialized views not used for aggregates | Dashboard queries scan full voter table | Materialized views for precinct/district rollups | > 100K voters per campaign |
| Indexes maintained during bulk import | Import slows exponentially as table grows | Drop/recreate indexes around bulk loads | > 500K row imports |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| RLS policies not covering all tables | Voter contact data, survey responses, or canvassing results leak across campaigns | Audit every table with campaign-scoped data; automated test that attempts cross-tenant access on all endpoints |
| Voter PII in API response logs | Voter names, addresses, phone numbers in log files; compliance violation | Structured logging with PII field redaction; never log request/response bodies for voter endpoints |
| Bulk export endpoints without rate limiting | Competitor campaign scrapes entire voter universe via API | Rate limit exports; require explicit campaign authorization; log all bulk data access |
| Storing raw voter file on disk after import | PII at rest without encryption; accessible if server compromised | Delete source file after successful import; or store in encrypted object storage with TTL |
| No audit trail for voter data access | Cannot demonstrate compliance with state voter data use agreements | Log every query that returns voter PII with user ID, campaign ID, timestamp, and query purpose |
| Campaign staff credentials shared across campaigns | User authenticated for one campaign accesses another | Per-campaign role assignment; session-level tenant enforcement; no "global admin" role without explicit justification |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Synchronous import with no progress feedback | Campaign staff uploads voter file, stares at spinner for 30 minutes, assumes it failed | Return 202 with job ID; provide polling endpoint for progress (rows processed, errors, ETA) |
| Walk lists ordered by database ID | Canvassers zigzag across streets instead of walking a logical route | Order by street name, then house number, with odd/even grouping for same-side-of-street walking |
| Turf maps showing all voters regardless of targeting | Volunteer overwhelmed with 500 doors when only 80 are targets | Filter map to show only voters matching campaign's target universe (party, likelihood, voting history) |
| Survey scripts without skip logic | Volunteer asks irrelevant follow-up questions to uninterested voters | Branched scripts: "Not interested" should skip all policy questions and go to "thank you" |
| No offline capability documentation | Canvassers lose data in areas with poor cell coverage | If API-only, clearly document expected client-side caching and sync patterns for mobile app developers |

## "Looks Done But Isn't" Checklist

- [ ] **Voter import:** Often missing deduplication logic -- verify that re-importing the same file does not create duplicate voter records (need ON CONFLICT handling)
- [ ] **Multi-tenancy:** Often missing RLS on junction/association tables -- verify that `campaign_volunteers`, `turf_assignments`, and similar linking tables have RLS policies, not just the primary entity tables
- [ ] **Turf cutting:** Often missing household clustering -- verify that apartment buildings are treated as single stops, not 50 separate doors
- [ ] **Walk lists:** Often missing geographic ordering -- verify that lists are ordered by walking route, not alphabetically or by ID
- [ ] **Auth integration:** Often missing token refresh handling -- verify that expired tokens return 401 (not 500) and that clients can refresh without re-login
- [ ] **Canvassing results:** Often missing conflict resolution for concurrent updates -- verify that two canvassers assigned overlapping turfs do not overwrite each other's survey responses
- [ ] **Voter search:** Often missing fuzzy matching -- verify that searching "Bob Smith" finds "Robert Smith" and "Roberto Smith-Garcia"
- [ ] **Import error handling:** Often missing partial failure reporting -- verify that a file with 1 bad row out of 100K does not reject the entire import

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cross-tenant data leak discovered | HIGH | Immediate incident response; audit all data access logs; notify affected campaigns; patch RLS policies; re-test all endpoints; consider security audit |
| Voter data model cannot accommodate new source format | MEDIUM | Add new columns to raw import layer; write new adapter; migrate canonical model if needed; re-import affected data |
| Spatial queries too slow for production | MEDIUM | Add missing indexes; cluster table; create materialized views; may require schema migration and full re-index |
| Connection pool exhaustion in production | LOW | Restart API pods (Kubernetes); tune pool_size/max_overflow; separate background task pools; monitor and alert |
| Bulk import corrupted data (duplicates, missing fields) | HIGH | Identify affected import batch by timestamp; delete and re-import from staging data; validate all downstream records (turf assignments, canvassing results) |
| ZITADEL integration breaking after key rotation | LOW | Clear JWKS cache; force re-fetch; add retry logic on unknown kid |
| Turf cutting producing unusable walk lists | MEDIUM | Allow manual turf adjustment overlay; re-cut with adjusted parameters; household clustering fix requires data model change |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Multi-tenant data leaks | Phase 1 (Foundation) | Cross-tenant integration tests on every endpoint; separate DB roles verified in deployment |
| Voter data normalization | Phase 2 (Voter Data Import) | Import tests with multiple source formats; canonical model review; deduplication tests |
| PostGIS performance degradation | Phase 2 (Import) + Phase 3 (Canvassing) | Performance tests with 100K+ voters; EXPLAIN ANALYZE on all spatial queries |
| Canvassing turf cutting edge cases | Phase 3 (Canvassing Management) | User acceptance testing with real geographic data; household clustering verified |
| Bulk import blocking API | Phase 2 (Voter Data Import) | Load test: import 500K rows while API handles concurrent requests; import progress tracking works |
| ZITADEL OIDC integration | Phase 1 (Foundation) | Token validation works with JWT; JWKS cache verified; campaign authorization separated from ZITADEL |
| Async connection pool exhaustion | Phase 1 (Foundation) | Load test: 50+ concurrent requests sustained; pool metrics monitored; no leaked connections after 1 hour soak test |

## Sources

- [L2 Voter Data Documentation - Penn Libraries](https://guides.library.upenn.edu/L2/documentation)
- [L2 Voter Data FAQ - UC Berkeley](https://guides.lib.berkeley.edu/c.php?g=1381940&p=10332633)
- [PostGIS Spatial Query Documentation](https://postgis.net/docs/using_postgis_query.html)
- [PostGIS Performance: Indexing and EXPLAIN - Crunchy Data](https://www.crunchydata.com/blog/postgis-performance-indexing-and-explain)
- [PostGIS Performance Tuning - Crunchy Data](https://www.crunchydata.com/blog/postgis-performance-postgres-tuning)
- [FastAPI Multi-Tenant RLS Pattern - GitHub Discussion](https://github.com/fastapi/fastapi/discussions/6056)
- [fastapi-rowsecurity - Row-Level Security in SQLAlchemy](https://github.com/JWDobken/fastapi-rowsecurity)
- [SQLAlchemy QueuePool Exhaustion - FastAPI Discussion](https://github.com/fastapi/fastapi/discussions/10450)
- [Row Level Security for Tenants - Crunchy Data](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [ZITADEL Token Introspection Docs](https://zitadel.com/docs/guides/integrate/token-introspection)
- [fastapi-zitadel-auth Library](https://github.com/cleanenergyexchange/fastapi-zitadel-auth)
- [ZITADEL OIDC Recommended Flows](https://zitadel.com/docs/guides/integrate/login/oidc/oauth-recommended-flows)
- [PostgreSQL COPY for Bulk Loading](https://www.postgresql.org/docs/current/populate.html)
- [NGPVAN Turf Cutting Best Practices](https://www.ngpvan.com/wp-content/uploads/2024/10/Turf-Cutting-OBP.pdf)
- [GoodParty.org Turf Cutting Guide](https://goodparty.org/blog/article/turf-cutting)
- [Pew Research: Voter File Accuracy](https://www.pewresearch.org/methods/2018/02/15/commercial-voter-files-and-the-study-of-u-s-politics/)
- CivicPulse competitive research: `docs/campaign_platforms_research.md` (internal)
- CivicPulse L2 example file: `data/example-2026-02-24.csv` (internal)

---
*Pitfalls research for: Multi-tenant political campaign management API*
*Researched: 2026-03-09*
