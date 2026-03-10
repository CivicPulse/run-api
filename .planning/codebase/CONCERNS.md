# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**InMemoryBroker for Background Tasks:**
- Issue: TaskIQ uses `InMemoryBroker` which loses all queued tasks on process restart and does not distribute across workers
- Files: `app/tasks/broker.py`
- Impact: Import jobs queued via `process_import.kiq()` are lost if the server restarts mid-import. No horizontal scaling of background work. The comment says "Swap to a Redis or RabbitMQ broker for production" but this has not been done.
- Fix approach: Replace `InMemoryBroker` with `RedisAsyncBroker` or `RabbitBroker` from TaskIQ. Requires adding a Redis/RabbitMQ dependency and connection string to `app/core/config.py`.

**No Campaign Ownership Verification on Path Parameter:**
- Issue: Endpoints accept `campaign_id` as a URL path parameter but never verify the authenticated user belongs to that campaign. RLS only filters query results -- it does not prevent a user from setting RLS context to a campaign they do not belong to. The `set_campaign_context` call trusts the path parameter blindly.
- Files: All route handlers in `app/api/v1/` (e.g., `app/api/v1/voters.py`, `app/api/v1/shifts.py`, `app/api/v1/volunteers.py`), `app/db/rls.py`
- Impact: A user with a valid JWT for Campaign A could potentially call endpoints for Campaign B by changing the `campaign_id` path parameter. The RLS policy scope depends entirely on whether PostgreSQL RLS policies are enforced at the database level (which they are), but the application sets `app.current_campaign_id` to whatever the client sends -- no membership check occurs.
- Fix approach: Add a dependency that validates the user's `org_id` claim maps to the requested `campaign_id` before setting RLS context. Extract this into a shared FastAPI dependency in `app/api/deps.py`.

**Inconsistent Transaction Boundaries (Service vs. Route Layer):**
- Issue: Some services call `db.commit()` internally (e.g., `app/services/voter.py:234`, `app/services/campaign.py:91`, `app/services/voter_list.py`), while others leave commit to the route handler (e.g., `app/services/shift.py`, `app/services/phone_bank.py`). This creates an inconsistent pattern where some service methods are atomic and some are not.
- Files: `app/services/voter.py`, `app/services/campaign.py`, `app/services/voter_list.py` (commit internally); `app/services/shift.py`, `app/services/phone_bank.py`, `app/services/volunteer.py` (no commit)
- Impact: Composing service calls becomes error-prone. If a route calls two services where one commits and one does not, partial commits can occur. Harder to reason about transactional guarantees.
- Fix approach: Standardize on route-layer commits. Remove all `db.commit()` calls from service methods and have route handlers own the transaction boundary. This is the more common pattern and matches what the newer services already do.

**`ensure_user_synced` Called on Every Request:**
- Issue: Every authenticated endpoint calls `ensure_user_synced()`, which executes 1-3 database queries per request (user lookup, optional campaign lookup, optional member lookup) plus potential `db.commit()` calls. This runs on every single API request.
- Files: `app/api/deps.py:37-104`, all route handlers (149 call sites across 17 files)
- Impact: Adds significant per-request database overhead. The user sync rarely changes anything after first login, yet it runs every time.
- Fix approach: Cache synced user state in-memory (e.g., a TTL dict) or move sync to a login/token-refresh hook. At minimum, skip the campaign_member check on read-only operations.

**Duplicate RLS Context Pattern (Boilerplate):**
- Issue: Every route handler manually imports and calls `set_campaign_context(db, str(campaign_id))`. Some import it at module top, others use inline imports. This is repeated across 50+ endpoints.
- Files: All `app/api/v1/*.py` route files
- Impact: Boilerplate makes it easy to forget RLS setup. A missed `set_campaign_context` call would silently return data from all campaigns or no campaigns depending on the RLS policy default.
- Fix approach: Create a FastAPI dependency that accepts `campaign_id` path param and returns a session with RLS already configured. Replace all manual calls with this dependency.

**Service Instantiation as Module-Level Singletons:**
- Issue: Services like `PhoneBankService`, `ShiftService`, `VolunteerService` are instantiated once at module level (e.g., `_service = VoterService()` in `app/api/v1/voters.py`). Some services compose other services in `__init__` (e.g., `PhoneBankService.__init__` creates `VoterInteractionService`, `SurveyService`, `DNCService`).
- Files: `app/api/v1/voters.py:21`, `app/api/v1/shifts.py:28-29`, `app/services/phone_bank.py:64-67`
- Impact: No dependency injection makes testing harder (must mock at import time). No lifecycle management. Works today because services are stateless, but fragile if state is ever added.
- Fix approach: Register services as FastAPI dependencies or use a simple DI container. This also enables proper mocking in tests.

## Security Considerations

**No Rate Limiting:**
- Risk: No rate limiting on any endpoint. Authentication endpoints, import uploads, and voter search are all unprotected from abuse.
- Files: `app/main.py` (no rate limit middleware), `app/api/v1/` (no per-route limits)
- Current mitigation: None
- Recommendations: Add `slowapi` or similar middleware. Priority targets: auth-related endpoints, import initiation (`POST /imports`), and voter search (`POST /voters/search`).

**JWKS Cached Without TTL:**
- Risk: The `JWKSManager` caches JWKS keys indefinitely after first fetch. If ZITADEL rotates keys, old tokens could remain valid until a decode failure triggers a refresh. Conversely, a decode failure on a legitimately expired token triggers an unnecessary JWKS refetch.
- Files: `app/core/security.py:40-100`
- Current mitigation: JWKS refresh on decode failure (line 96) acts as a fallback.
- Recommendations: Add a time-based TTL (e.g., 1 hour) to `JWKSManager._jwks` so keys rotate proactively. Consider caching the JWKS URI separately from the key set.

**Broad Exception Handling in JWT Validation:**
- Risk: `validate_token` catches bare `Exception` (line 93), meaning any error (network, JSON parsing, programming bugs) triggers a JWKS refresh and retry instead of failing fast.
- Files: `app/core/security.py:88-100`
- Current mitigation: On second failure, the exception propagates.
- Recommendations: Catch specific `authlib` exceptions (e.g., `InvalidClaimError`, `DecodeError`) to distinguish key rotation issues from genuine validation failures.

**CORS Wildcard Methods and Headers:**
- Risk: `allow_methods=["*"]` and `allow_headers=["*"]` are overly permissive for a production API.
- Files: `app/main.py:87-92`
- Current mitigation: `allow_origins` is configurable via settings.
- Recommendations: Restrict to actual methods used (GET, POST, PATCH, DELETE, OPTIONS) and specific headers (Authorization, Content-Type).

**Import File Processing Has No Size Limit:**
- Risk: The import pipeline downloads the entire file into memory (`b"".join(chunks)` in `app/services/import_service.py:458`). A malicious or accidentally large file could cause OOM.
- Files: `app/services/import_service.py:455-458`, `app/tasks/import_task.py`
- Current mitigation: None
- Recommendations: Add a max file size check (e.g., 500MB) before downloading. Stream-process the CSV instead of loading entirely into memory.

**SQL Injection via ILIKE Search:**
- Risk: Voter name search uses `f"%{filters.search}%"` directly in an ILIKE clause. While SQLAlchemy parameterizes values, the `%` and `_` characters in LIKE patterns are not escaped, allowing users to craft expensive pattern matches.
- Files: `app/services/voter.py:116-122`, `app/services/volunteer.py:306-308`
- Current mitigation: SQLAlchemy parameterization prevents actual SQL injection.
- Recommendations: Escape `%` and `_` in search input before building the LIKE pattern. Consider using full-text search (tsvector) for better performance and control.

## Performance Bottlenecks

**N+1 Potential in Shift Listing:**
- Problem: `list_shifts` returns raw `Shift` objects but the route handler needs signup counts. The get_shift method issues separate count queries per shift.
- Files: `app/services/shift.py:218-268` (list returns raw), `app/services/shift.py:97-135` (get adds counts with extra query)
- Cause: The list endpoint likely fetches counts in a loop if it needs them. Currently the list endpoint returns shifts without counts, but individual shift fetches require 2 queries.
- Improvement path: Use a single query with window functions or subquery joins to get counts alongside the list query.

**Voter Import Loads Entire File Into Memory:**
- Problem: `process_import_file` downloads the complete file before processing batches.
- Files: `app/services/import_service.py:455-458`
- Cause: The S3 download collects all chunks into a list, then joins them.
- Improvement path: Use a streaming approach -- pipe S3 download chunks through a csv reader without buffering the entire file. This would also allow processing files larger than available RAM.

**Phone Bank Progress Query Counts All Campaign Interactions:**
- Problem: The `get_progress` method counts all PHONE_CALL interactions across the entire campaign, not filtered to the specific session.
- Files: `app/services/phone_bank.py:557-565`
- Cause: The query filters by `campaign_id` and `InteractionType.PHONE_CALL` but not by session_id in the interaction payload. This means the count aggregates across all phone bank sessions.
- Improvement path: Store session_id as a column on `VoterInteraction` (not just in payload JSON) or filter by call_list_id membership to scope counts correctly.

**No Database Connection Pool Tuning:**
- Problem: The SQLAlchemy async engine uses default pool settings (pool_size=5, max_overflow=10).
- Files: `app/db/session.py:15-19`
- Cause: No explicit pool configuration.
- Improvement path: Add `pool_size`, `max_overflow`, and `pool_timeout` settings to `app/core/config.py` and pass to `create_async_engine`.

## Fragile Areas

**Import Task Double-Status-Update Race:**
- Files: `app/tasks/import_task.py:45-46`, `app/services/import_service.py:448`
- Why fragile: Both `process_import` task (line 45) and `ImportService.process_import_file` (line 448) set `job.status = ImportStatus.PROCESSING`. The task sets it and flushes, then the service sets it again. If the service method is called independently (not via the task), it also sets RLS context, creating overlapping responsibility.
- Safe modification: Choose one owner for status transitions. The task should own job lifecycle; the service should focus on data processing only.
- Test coverage: `tests/unit/test_import_service.py` exists but integration between task and service may have gaps.

**ShiftService.check_in Side Effects:**
- Files: `app/services/shift.py:544-623`
- Why fragile: The `check_in` method has inline imports and creates `WalkListCanvasser` and `SessionCaller` records as side effects. It queries walk lists by turf, takes the most recent one, and creates a canvasser record. If walk list structure changes, this breaks silently (just logs a warning).
- Safe modification: Extract side effects into dedicated methods. Add explicit error handling instead of silent warning-and-continue.
- Test coverage: `tests/unit/test_shifts.py` (729 lines) likely covers this, but the walk list query assumption is fragile.

**httpx Client Created Per-Request in ZitadelService:**
- Files: `app/services/zitadel.py:48`, `app/services/zitadel.py:91`, `app/services/zitadel.py:122`, `app/services/zitadel.py:145`
- Why fragile: Every ZITADEL API call creates a new `httpx.AsyncClient()` via `async with`. This means no connection pooling, no keep-alive, and TCP handshake overhead on every call.
- Safe modification: Create a shared `httpx.AsyncClient` in `__init__` and close it on application shutdown. Store it on `app.state` alongside the service.
- Test coverage: `tests/unit/test_lifespan.py` tests initialization but likely not connection reuse.

## Scaling Limits

**InMemoryBroker Task Queue:**
- Current capacity: Single process, in-memory
- Limit: All queued import tasks lost on restart. No concurrent worker scaling. No retry semantics.
- Scaling path: Migrate to Redis-backed TaskIQ broker. Add worker processes.

**Voter Import Single-Threaded Processing:**
- Current capacity: One import at a time per worker process (synchronous batch processing within async)
- Limit: Large voter files (1M+ records) block the worker for extended periods. No progress reporting granularity below 1000-row batches.
- Scaling path: Chunk files and distribute across multiple workers. Add progress websocket/SSE for real-time updates.

**Single-Database Architecture:**
- Current capacity: Single PostgreSQL instance
- Limit: All campaigns share one database. Large campaigns with millions of voters will compete for connection pool and query resources.
- Scaling path: Read replicas for dashboard/reporting queries. Consider per-campaign schema isolation if tenant count grows significantly.

## Dependencies at Risk

**None critical**, but notable:
- `geoalchemy2` ties the project to PostgreSQL + PostGIS. No abstraction layer for spatial queries.
- `authlib` for JWT validation -- relatively stable but the ZITADEL-specific claim structure (`urn:zitadel:iam:...`) is hardcoded in `app/core/security.py:103-136`.

## Missing Critical Features

**No Pagination on Several List Endpoints:**
- Problem: `list_sessions` in `app/services/phone_bank.py:126-145` returns all sessions for a campaign with no pagination.
- Blocks: Will degrade as campaigns accumulate sessions.

**No Audit Trail for Destructive Operations:**
- Problem: Deletions (shift delete, campaign soft-delete, DNC entry removal) are not logged to an audit table. Only the application logs capture these events.
- Blocks: Compliance and accountability for campaign operations.

**No Health Check for Database or External Dependencies:**
- Problem: `app/api/health.py` likely provides a basic health endpoint but does not verify database connectivity, S3 reachability, or ZITADEL availability.
- Blocks: Load balancer health routing and operational monitoring.

## Test Coverage Gaps

**No Integration Tests for Import Pipeline:**
- What's not tested: The full flow from `initiate_import` through `process_import` task to completed job with voter records in the database
- Files: `app/tasks/import_task.py`, `app/services/import_service.py`, `app/api/v1/imports.py`
- Risk: The import task creates its own session, sets RLS context, and processes files -- this composition is not tested end-to-end. The double-status-update issue mentioned above would be caught.
- Priority: High

**No E2E Tests for Authentication Flow:**
- What's not tested: Full JWT validation with real ZITADEL tokens, role extraction, and campaign membership resolution
- Files: `app/core/security.py`, `app/api/deps.py`
- Risk: JWT claim structure changes from ZITADEL would not be caught until production
- Priority: Medium

**Dashboard Services Partially Tested:**
- What's not tested: Complex aggregate queries in dashboard services may not cover edge cases (zero data, partial data)
- Files: `app/services/dashboard/phone_banking.py`, `app/services/dashboard/volunteer.py`, `app/services/dashboard/` (overview presumed)
- Risk: Dashboard queries with empty campaigns or unusual data distributions could error or return misleading results
- Priority: Low

---

*Concerns audit: 2026-03-10*
