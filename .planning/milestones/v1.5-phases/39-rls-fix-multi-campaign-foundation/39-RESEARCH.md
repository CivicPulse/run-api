# Phase 39: RLS Fix & Multi-Campaign Foundation - Research

**Researched:** 2026-03-24
**Domain:** PostgreSQL Row-Level Security, SQLAlchemy async pool events, FastAPI middleware
**Confidence:** HIGH

## Summary

Phase 39 addresses a critical production data isolation bug: `set_config('app.current_campaign_id', :id, false)` uses session-scoped config that persists across connection pool reuse, allowing campaign A's data to leak to campaign B when the same pooled connection is reused. The fix changes the third parameter to `true` (transaction-scoped), adds a pool checkout event to defensively reset context, and replaces 147 scattered `set_campaign_context()` calls across 17 route files with centralized middleware.

The secondary goal is multi-campaign membership: `ensure_user_synced()` currently uses `.limit(1)` to create a CampaignMember for only one campaign per org, breaking the campaign list for users in orgs with multiple campaigns. The fix removes this limit and adds an Alembic data migration to backfill missing membership records.

**Primary recommendation:** Fix the `set_config` third parameter first (one-line change with maximum security impact), then add pool checkout event, then centralize middleware, then fix membership. Test-first approach: write cross-campaign isolation tests before applying fixes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Fix `set_config('app.current_campaign_id', :id, false)` to `true` (transaction-scoped) globally -- applies to both web requests and background tasks (single function, one semantic)
- **D-02:** Add SQLAlchemy pool checkout event to reset `app.current_campaign_id` to null UUID on every connection acquisition -- defense-in-depth alongside transaction scoping
- **D-03:** If `set_campaign_context()` fails (null campaign_id), hard fail with 403 -- no request should ever run without valid RLS context on a campaign-scoped endpoint
- **D-04:** Replace `get_db_with_rls()` with centralized middleware that sets RLS on the request's main session -- no endpoint can skip it
- **D-05:** Middleware uses path-based convention: endpoints under `/campaigns/{campaign_id}/*` get RLS context automatically from the path parameter; everything else (health, auth, campaign list, future `/org/*`) skips RLS
- **D-06:** Design the middleware/pool reset to be forward-compatible with org-level context (`app.current_org_id`) -- don't implement org switching, but ensure the pattern supports adding a second context variable in Phase 41 without rework
- **D-07:** Fix `ensure_user_synced()` to create CampaignMember records for ALL campaigns in the user's org -- remove `.limit(1)`
- **D-08:** Fix `get_campaign_from_token()` -- campaign-scoped endpoints require `campaign_id` in the URL path; `get_campaign_from_token()` becomes a fallback for the campaign list page only
- **D-09:** Campaign list endpoint returns only campaigns where a CampaignMember record exists for the authenticated user
- **D-10:** Create Alembic data migration to backfill missing CampaignMember records for existing users in prod
- **D-11:** Full audit of all 51 RLS policies across 6 migrations to confirm each correctly uses `current_setting('app.current_campaign_id')`
- **D-12:** Investigate DATA-05 (campaigns not visible in prod) systematically: check CampaignMember records first, then verify ZITADEL org_id mapping
- **D-13:** Settings button fix: fix root cause (campaign resolution) AND add defensive UI guard -- hide/disable settings button when campaignId is unavailable
- **D-14:** Frontend campaign switching UI deferred to Phase 43 -- Phase 39 is backend-only fixes
- **D-15:** Test-first approach: write failing RLS isolation tests that prove cross-campaign data leaks BEFORE the fix, then verify they pass after
- **D-16:** Both test levels: unit tests with mocked sessions for middleware/pool logic, plus integration tests against live PostgreSQL for actual RLS policy behavior
- **D-17:** Background tasks (TaskIQ) already call `set_campaign_context()` directly -- the transaction-scope fix applies globally, so tasks get the fix automatically
- **D-18:** Rollback via Alembic downgrade + ArgoCD deployment revert -- standard GitOps rollback

### Claude's Discretion
- Pool event implementation: Claude picks the specific SQLAlchemy event type (checkout vs checkin vs connect) and whether to use raw DBAPI or ORM, based on async engine semantics and codebase patterns

### Deferred Ideas (OUT OF SCOPE)
- Org switcher UI -- Phase 43 (ORG-12)
- Frontend campaign switching component -- Phase 43
- Org-level RLS policies -- Phase 41
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | RLS context is transaction-scoped (`set_config` `true`), not session-scoped, preventing cross-campaign data leaks via connection pool reuse | D-01: single-line fix in `app/db/rls.py` line 21, changing `false` to `true`. Pool checkout event (D-02) via `@event.listens_for(engine.sync_engine, "checkout")` provides defense-in-depth |
| DATA-02 | Pool checkout event resets campaign context to null UUID on every connection acquisition | SQLAlchemy `PoolEvents.checkout` fires on connection acquisition. Attach to `engine.sync_engine` since async engine wraps sync pool events. Execute `SELECT set_config('app.current_campaign_id', '00000000-0000-0000-0000-000000000000', false)` via raw DBAPI |
| DATA-03 | Campaign context setting is centralized (middleware) so no endpoint can skip it | FastAPI middleware extracts `campaign_id` from URL path matching `/campaigns/{campaign_id}/`. Replace 147 inline `set_campaign_context()` calls across 17 route files. Store `campaign_id` in `request.state` for the `get_db` dependency to use |
| DATA-04 | `ensure_user_synced()` creates membership for all campaigns in the user's org, not just most recent | Remove `.limit(1)` at `app/api/deps.py` line 97, iterate over all campaigns. Alembic data migration (D-10) backfills existing records |
| DATA-05 | Campaign list is visible in prod for all authenticated users with valid campaign membership | Root cause investigation (D-12): `/api/v1/me/campaigns` already queries by CampaignMember, so if memberships are missing (DATA-04 bug), no campaigns appear. Fix DATA-04 + data migration fixes this |
| DATA-06 | Settings button navigates correctly to campaign settings page | Frontend `__root.tsx` line 131: settings link uses `campaignId` extracted from URL pathname regex. If user navigates from campaign list (no `campaignId` in path), `campaignId` is `undefined`. Add guard: hide settings button when `campaignId` is unavailable |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | Async ORM + pool events | Pool event system works with async engine via `sync_engine` proxy |
| FastAPI | 0.135.1+ | Middleware + dependency injection | Built-in `BaseHTTPMiddleware` or Starlette middleware for request interception |
| asyncpg | 0.31.0 | PostgreSQL async driver | DBAPI-level connection used in pool events |
| Alembic | 1.18.4 | Data migration for membership backfill | Raw SQL execution via `op.execute()` |
| pytest | 9.0.2 | Test framework | `asyncio_mode=auto`, integration test fixtures already exist |
| pytest-asyncio | 1.3.0+ | Async test support | Already configured in `pyproject.toml` |

No new packages needed for this phase.

## Architecture Patterns

### Pattern 1: SQLAlchemy Pool Checkout Event for Async Engine

**What:** Reset `app.current_campaign_id` to null UUID on every connection checkout from the pool.

**When to use:** Defense-in-depth -- even though transaction-scoped `set_config(true)` auto-resets, the pool event ensures no stale context survives connection reuse.

**Key detail:** SQLAlchemy async engines wrap a synchronous pool. Pool events must be attached to `engine.sync_engine`, not the async engine directly. The event handler receives a raw DBAPI connection (asyncpg connection), not an ORM session.

**Example:**
```python
# Source: SQLAlchemy 2.0 Pool Events documentation
from sqlalchemy import event

@event.listens_for(engine.sync_engine, "checkout")
def _reset_campaign_context(dbapi_connection, connection_record, connection_proxy):
    """Reset RLS context on every connection checkout from pool."""
    cursor = dbapi_connection.cursor()
    cursor.execute(
        "SELECT set_config('app.current_campaign_id', "
        "'00000000-0000-0000-0000-000000000000', false)"
    )
    cursor.close()
```

**Confidence:** HIGH -- verified via SQLAlchemy 2.0 official docs. The `sync_engine` attribute is the standard way to access pool events on async engines. The checkout handler receives the raw DBAPI connection object (not a cursor), so `cursor()` must be called.

**Forward-compatibility note (D-06):** The same handler can reset `app.current_org_id` in Phase 41 by adding a second `set_config` call.

### Pattern 2: FastAPI Middleware for Centralized RLS Context

**What:** Middleware intercepts all requests, extracts `campaign_id` from URL path, and sets RLS context on the request's database session.

**Design:**
```python
import re
from starlette.middleware.base import BaseHTTPMiddleware

CAMPAIGN_PATH_RE = re.compile(r"/api/v1/campaigns/([0-9a-f-]{36})/")

class RLSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        match = CAMPAIGN_PATH_RE.search(request.url.path)
        if match:
            request.state.campaign_id = match.group(1)
        else:
            request.state.campaign_id = None
        return await call_next(request)
```

**Alternative approach (recommended):** Use a FastAPI dependency instead of `BaseHTTPMiddleware` to avoid the well-known issue where `BaseHTTPMiddleware` wraps the response body in a `StreamingResponse`, which can cause issues with WebSocket connections and SSE. A shared dependency that reads from `request.state` (set in a lighter Starlette-native middleware or by the dependency itself) is more idiomatic for FastAPI.

**Recommended pattern:** Create a dependency `get_db_with_campaign_context()` that:
1. Extracts `campaign_id` from the request path
2. Creates an async session
3. Calls `set_campaign_context()` on it
4. Yields the session
5. Routes that need RLS use this dependency; routes that don't use plain `get_db()`

This avoids middleware entirely while still centralizing the logic. The key difference from the current `get_db_with_rls()` is that campaign_id comes from the URL path (not passed as a parameter), making it impossible for endpoints to skip.

```python
async def get_campaign_db(
    request: Request,
    campaign_id: uuid.UUID,  # FastAPI extracts from path
) -> AsyncGenerator[AsyncSession]:
    """Centralized DB session with RLS context from URL path."""
    async with async_session_factory() as session:
        await set_campaign_context(session, str(campaign_id))
        yield session
```

Then all campaign-scoped routes use `db: AsyncSession = Depends(get_campaign_db)` instead of `db: AsyncSession = Depends(get_db)` + inline `set_campaign_context()`.

**Key insight:** D-04 says "middleware" but D-05 says "path-based convention." A shared dependency that reads `campaign_id` from FastAPI's path parameter achieves both goals with less complexity than actual middleware. The user's intent is centralization -- no endpoint can skip RLS. A dependency achieves this: if the route takes `campaign_id` in its path, it MUST use `get_campaign_db` which auto-sets RLS.

### Pattern 3: Endpoint Classification

Based on codebase analysis, endpoints fall into two categories:

**Campaign-scoped (need RLS -- 147 calls across 17 files):**
- `/api/v1/campaigns/{campaign_id}/voters/*` (voters.py -- 7 calls)
- `/api/v1/campaigns/{campaign_id}/dashboard/*` (dashboard.py -- 18 calls)
- `/api/v1/campaigns/{campaign_id}/volunteers/*` (volunteers.py -- 16 calls)
- `/api/v1/campaigns/{campaign_id}/shifts/*` (shifts.py -- 14 calls)
- `/api/v1/campaigns/{campaign_id}/phone-banks/*` (phone_banks.py -- 14 calls)
- `/api/v1/campaigns/{campaign_id}/surveys/*` (surveys.py -- 11 calls)
- `/api/v1/campaigns/{campaign_id}/voter-contacts/*` (voter_contacts.py -- 11 calls)
- `/api/v1/campaigns/{campaign_id}/walk-lists/*` (walk_lists.py -- 11 calls)
- `/api/v1/campaigns/{campaign_id}/call-lists/*` (call_lists.py -- 8 calls)
- `/api/v1/campaigns/{campaign_id}/voter-lists/*` (voter_lists.py -- 8 calls)
- `/api/v1/campaigns/{campaign_id}/imports/*` (imports.py -- 7 calls)
- `/api/v1/campaigns/{campaign_id}/voters/{voter_id}/interactions/*` (voter_interactions.py -- 2 calls)
- `/api/v1/campaigns/{campaign_id}/turfs/*` (turfs.py -- 5 calls)
- `/api/v1/campaigns/{campaign_id}/dnc/*` (dnc.py -- 5 calls)
- `/api/v1/campaigns/{campaign_id}/voter-tags/*` (voter_tags.py -- 5 calls)
- `/api/v1/campaigns/{campaign_id}/members` (members.py -- 1 call)
- `/api/v1/campaigns/{campaign_id}/field/me` (field.py -- 1 call)

**Not campaign-scoped (skip RLS):**
- `/api/v1/campaigns` (list/create -- no `campaign_id` in path)
- `/api/v1/campaigns/{campaign_id}` (get/update/delete -- uses campaign_id as direct query, RLS on `campaigns` table would block cross-campaign access anyway)
- `/api/v1/me` and `/api/v1/me/campaigns` (user info)
- `/api/v1/invites/{token}/accept` (invite accept)
- `/api/v1/join/{slug}/*` (join flow)
- `/api/v1/config/public` (public config)
- `/health/*` (health checks)

**Notable inconsistency:** The invite endpoints under `/campaigns/{campaign_id}/invites` have `campaign_id` in the URL but do NOT call `set_campaign_context()`. They use direct `WHERE campaign_id = :id` filters instead. Since invites have an RLS policy, the middleware will need to set RLS context for these routes too (or they will return empty results).

### Anti-Patterns to Avoid
- **Inline RLS context calls:** The current pattern of `from app.db.rls import set_campaign_context; await set_campaign_context(db, str(campaign_id))` at the top of every handler is error-prone. If a developer forgets it, data leaks.
- **Session-scoped `set_config(false)`:** This is the root cause of the bug. Session scope means the config persists across transaction boundaries on the same pooled connection.
- **`BaseHTTPMiddleware` for DB operations:** Known issue with response body wrapping. Use dependencies or pure ASGI middleware instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pool connection reset | Custom connection wrapper | SQLAlchemy `PoolEvents.checkout` | Built-in event system, works with async engine via `sync_engine` |
| UUID validation in path | Regex + manual parsing | FastAPI's `campaign_id: uuid.UUID` path parameter | Automatic 422 on invalid UUID |
| Transaction scoping | Manual BEGIN/COMMIT | `set_config(..., true)` PostgreSQL built-in | PostgreSQL handles cleanup automatically at transaction end |
| Data migration | Python script | Alembic data migration with `op.execute()` | Tracked in migration chain, reversible, idempotent |

## Common Pitfalls

### Pitfall 1: Async Engine Pool Events Require sync_engine
**What goes wrong:** Attaching pool events directly to the async engine does nothing.
**Why it happens:** SQLAlchemy's async engine wraps a synchronous engine/pool. Pool events fire on the sync layer.
**How to avoid:** Always use `engine.sync_engine` when attaching pool events: `@event.listens_for(engine.sync_engine, "checkout")`
**Warning signs:** Pool event handler never fires during testing.

### Pitfall 2: DBAPI Connection in Pool Events is Not a Cursor
**What goes wrong:** Calling `dbapi_connection.execute()` directly in checkout event handler.
**Why it happens:** Confusion between asyncpg's raw connection API and cursor API.
**How to avoid:** In the checkout event handler, the `dbapi_connection` parameter for asyncpg is an `asyncpg.Connection` wrapped in SQLAlchemy's adapter. Use `dbapi_connection.cursor()` first, then `cursor.execute()`.
**Warning signs:** `AttributeError` or unexpected behavior in pool event handler.

### Pitfall 3: Invite Routes Missing RLS After Middleware
**What goes wrong:** Invite endpoints under `/campaigns/{campaign_id}/invites` currently work without RLS. After adding middleware that sets RLS context for all `/campaigns/{campaign_id}/*` paths, invite queries that rely on direct `WHERE campaign_id = :id` will ALSO have RLS applied. If the RLS context matches the campaign_id parameter, this is fine. If they somehow diverge, results could be filtered unexpectedly.
**How to avoid:** This is actually correct behavior -- the middleware sets RLS from the same `campaign_id` path parameter, so RLS and direct WHERE are consistent. Verify in tests.
**Warning signs:** Invite list returns empty for valid campaigns.

### Pitfall 4: Data Migration Idempotency
**What goes wrong:** Running the CampaignMember backfill migration multiple times creates duplicate records.
**Why it happens:** Simple INSERT without conflict handling.
**How to avoid:** Use `INSERT ... ON CONFLICT (user_id, campaign_id) DO NOTHING` -- the `uq_user_campaign` unique constraint already exists on `campaign_members`.
**Warning signs:** IntegrityError on migration re-run or in prod deployment.

### Pitfall 5: Campaign CRUD Endpoints and RLS
**What goes wrong:** The campaign list endpoint (`GET /api/v1/campaigns`) stops working if middleware blindly sets RLS on all campaign paths.
**Why it happens:** The campaign list has no `campaign_id` in its path and needs to query across campaigns.
**How to avoid:** Only set RLS for paths matching `/campaigns/{uuid}/...` (note the trailing path after the UUID). The list (`/campaigns`) and get-single (`/campaigns/{id}`) endpoints are NOT sub-resource paths.
**Warning signs:** Campaign list returns only one campaign or empty.

### Pitfall 6: Background Tasks and Middleware
**What goes wrong:** Assuming middleware handles background tasks.
**Why it happens:** TaskIQ tasks run outside the FastAPI request lifecycle.
**How to avoid:** Background tasks already call `set_campaign_context()` directly (see `app/tasks/import_task.py` line 42). The `set_config(true)` fix applies globally, so tasks automatically benefit. No middleware interaction needed.
**Warning signs:** None expected -- this is already handled correctly.

## Code Examples

### Fix 1: Transaction-Scoped set_config (DATA-01)
```python
# app/db/rls.py -- change `false` to `true` on line 21
async def set_campaign_context(session: AsyncSession, campaign_id: str) -> None:
    """Set RLS campaign context for the current transaction (not session).

    The third parameter `true` scopes to the current transaction,
    preventing context leakage across connection pool reuse.
    """
    if not campaign_id:
        raise ValueError("campaign_id is required for RLS context")
    await session.execute(
        text("SELECT set_config('app.current_campaign_id', :campaign_id, true)"),
        {"campaign_id": str(campaign_id)},
    )
```

### Fix 2: Pool Checkout Event (DATA-02)
```python
# app/db/session.py -- add after engine creation
from sqlalchemy import event

@event.listens_for(engine.sync_engine, "checkout")
def reset_campaign_context(dbapi_connection, connection_record, connection_proxy):
    """Defense-in-depth: reset RLS context on every pool checkout."""
    cursor = dbapi_connection.cursor()
    cursor.execute(
        "SELECT set_config('app.current_campaign_id', "
        "'00000000-0000-0000-0000-000000000000', false)"
    )
    cursor.close()
```

### Fix 3: Centralized Campaign DB Dependency (DATA-03)
```python
# app/api/deps.py -- new centralized dependency
async def get_campaign_db(
    campaign_id: uuid.UUID,
) -> AsyncGenerator[AsyncSession]:
    """DB session with RLS context auto-set from path parameter.

    All campaign-scoped routes MUST use this instead of get_db().
    """
    async with async_session_factory() as session:
        await set_campaign_context(session, str(campaign_id))
        yield session
```

### Fix 4: ensure_user_synced Multi-Campaign (DATA-04)
```python
# app/api/deps.py -- fix ensure_user_synced
# Replace lines 93-98 (the .limit(1) query) with:
campaign_result = await db.execute(
    select(Campaign).where(Campaign.organization_id == org.id)
)
campaigns = campaign_result.scalars().all()

# Then loop over all campaigns to create membership:
for campaign in campaigns:
    member_result = await db.execute(
        select(CampaignMember).where(
            CampaignMember.user_id == user.id,
            CampaignMember.campaign_id == campaign.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        member = CampaignMember(user_id=user.id, campaign_id=campaign.id)
        db.add(member)
# Single commit after loop
await db.commit()
```

### Fix 5: Alembic Data Migration (DATA-04, D-10)
```python
# alembic/versions/014_backfill_campaign_members.py
def upgrade() -> None:
    op.execute("""
        INSERT INTO campaign_members (id, user_id, campaign_id, synced_at)
        SELECT
            gen_random_uuid(),
            u.id,
            c.id,
            NOW()
        FROM users u
        CROSS JOIN campaigns c
        JOIN organizations o ON c.organization_id = o.id
        WHERE NOT EXISTS (
            SELECT 1 FROM campaign_members cm
            WHERE cm.user_id = u.id AND cm.campaign_id = c.id
        )
        AND c.status != 'deleted'
    """)
```

**Note:** The CROSS JOIN approach is aggressive -- it creates membership for ALL users in ALL campaigns of their org. The actual query needs to scope users to their org via `organization.zitadel_org_id` matching somehow. Since users don't directly reference orgs, the migration needs to join through ZITADEL org_id or another path. This requires investigation during implementation.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `set_config(false)` (session scope) | `set_config(true)` (transaction scope) | PostgreSQL 9.2+ | Transaction scope auto-resets at COMMIT/ROLLBACK |
| Inline RLS calls per endpoint | Centralized dependency/middleware | Best practice | Prevents forgotten RLS context |
| Single campaign membership | Multi-campaign membership | Phase 39 | Users can access all org campaigns |

## Open Questions

1. **Data migration user-org mapping**
   - What we know: Users have `org_id` in their JWT claims but NOT in the `users` table. The mapping goes through ZITADEL org_id on the Campaign/Organization tables.
   - What's unclear: How to determine which org a user belongs to for the backfill migration (no direct `users.org_id` column).
   - Recommendation: Use `campaign_members` as the source -- for each existing membership, find the campaign's org, then backfill memberships for ALL campaigns in that org. This bootstraps from existing data.

2. **Invite endpoints post-middleware**
   - What we know: 3 invite endpoints under `/campaigns/{campaign_id}/invites` do NOT currently call `set_campaign_context()`. They use direct WHERE clauses.
   - What's unclear: Will adding RLS context via middleware break or improve these endpoints?
   - Recommendation: After middleware sets RLS, the direct WHERE + RLS are additive (both filter by campaign_id). This should be safe but must be explicitly tested.

3. **Pool event handler sync vs async**
   - What we know: SQLAlchemy pool events are synchronous. The handler receives a raw DBAPI connection.
   - What's unclear: Whether asyncpg's adapter connection supports synchronous `cursor.execute()` in this context.
   - Recommendation: Verify in integration tests. The SQLAlchemy docs confirm sync event handlers work with async engines via the sync_engine proxy.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Transaction-scoped set_config prevents cross-campaign leak on pool reuse | integration | `uv run pytest tests/integration/test_rls_isolation.py -x -m integration` | No -- Wave 0 |
| DATA-02 | Pool checkout resets campaign context to null UUID | unit | `uv run pytest tests/unit/test_pool_events.py -x` | No -- Wave 0 |
| DATA-03 | Middleware/dependency sets RLS context automatically | unit | `uv run pytest tests/unit/test_rls_middleware.py -x` | No -- Wave 0 |
| DATA-04 | ensure_user_synced creates membership for all org campaigns | unit | `uv run pytest tests/unit/test_user_sync.py -x` | No -- Wave 0 |
| DATA-05 | Campaign list returns all campaigns with valid membership | unit + integration | `uv run pytest tests/unit/test_campaign_list.py -x` | No -- Wave 0 |
| DATA-06 | Settings button hidden when campaignId unavailable | manual | Manual browser testing | N/A |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/test_rls_isolation.py` -- cross-campaign pool reuse test (DATA-01, DATA-02, TEST-03)
- [ ] `tests/unit/test_pool_events.py` -- pool checkout event fires and resets context (DATA-02)
- [ ] `tests/unit/test_rls_middleware.py` -- middleware/dependency sets context from path (DATA-03)
- [ ] `tests/unit/test_user_sync.py` -- ensure_user_synced creates all memberships (DATA-04)

Note: Existing integration tests in `tests/integration/test_rls.py` use `set_config(false)` in their assertions. These tests should be updated to use `set_config(true)` after the fix to validate the correct behavior.

## Project Constraints (from CLAUDE.md)

- Always use `uv` to manage and run Python environments and tasks (not pip/poetry)
- Conventional Commits for all commit messages
- Python linting: `uv run ruff check .` / `uv run ruff format .`
- Ruff rules: E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- Line length: 88 chars
- Tests: `uv run pytest` with asyncio_mode=auto
- Docker services: API (:8000), PostgreSQL (:5433), MinIO (:9000), ZITADEL (:8080)

## Sources

### Primary (HIGH confidence)
- [SQLAlchemy 2.0 Connection Pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html) -- pool events, checkout/checkin/reset handlers, async engine sync_engine access
- [SQLAlchemy 2.0 Core Events](https://docs.sqlalchemy.org/en/20/core/events.html) -- event.listens_for decorator pattern
- Codebase analysis: `app/db/rls.py`, `app/db/session.py`, `app/api/deps.py`, 17 route files with 147 inline `set_campaign_context()` calls

### Secondary (MEDIUM confidence)
- PostgreSQL `set_config()` documentation -- third parameter `true` = transaction-local, `false` = session-local
- SQLAlchemy async engine pool event compatibility -- sync event handlers work with async engines via `sync_engine` proxy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages needed, all tools already in project
- Architecture: HIGH -- patterns verified against SQLAlchemy 2.0 docs and existing codebase
- Pitfalls: HIGH -- identified from direct codebase analysis (147 inline calls, invite inconsistency, `.limit(1)` bug)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (30 days -- stable domain, no fast-moving dependencies)
