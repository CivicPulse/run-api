# Phase 47: Integration Consistency & Documentation Cleanup - Research

**Researched:** 2026-03-25
**Domain:** FastAPI rate limiting (SlowAPI), SQLAlchemy RLS dependency centralization, requirements traceability
**Confidence:** HIGH

## Summary

This phase closes two integration gaps (INT-01, INT-02) identified in the v1.5 milestone audit plus a documentation verification task. The work is mechanical and well-scoped: (1) swap `Depends(get_db)` to `Depends(get_campaign_db)` in 2 turf endpoints, (2) add `@limiter.limit()` decorators to all 169 API endpoints across 24 route files, and (3) verify REQUIREMENTS.md traceability completeness.

The largest piece of work is rate limiting deployment. SlowAPI requires every rate-limited endpoint function to have a `request: Request` parameter in its signature -- currently only 12 of 169 endpoints have this. Adding `request: Request` to ~157 endpoint functions is the bulk of the mechanical work. The rate limiting infrastructure (limiter instance, key functions, middleware, error handler) is already fully built and tested.

**Primary recommendation:** Apply rate limiting file-by-file in a systematic sweep, adding `request: Request` parameter and `@limiter.limit()` decorator to each endpoint. Use `get_user_or_ip_key` as `key_func` for authenticated endpoints (OBS-04 compliance).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tiered rate limits by operation type: reads (GET) ~60/min, writes (POST/PUT/DELETE) ~30/min, auth-sensitive (join/invite) 5-20/min
- **D-02:** Bulk/import endpoints (CSV voter import, bulk DNC) get stricter limits (~5-10/min) since they're expensive operations
- **D-03:** Use both IP-based and per-user (JWT sub) rate limiting for authenticated endpoints. The existing `get_user_or_ip_key` function should be wired up to fulfill OBS-04
- **D-04:** IP-only rate limiting for unauthenticated endpoints (join, health)
- **D-05:** Mechanical swap of `Depends(get_db)` + inline `set_campaign_context` to `Depends(get_campaign_db)` in `get_turf_overlaps` (line 117) and `get_turf_voters` (line 166) in `app/api/v1/turfs.py`
- **D-06:** Add targeted unit test confirming `get_campaign_db` is used in both endpoints (not just relying on existing E2E coverage)
- **D-07:** Programmatic verification pass confirming all 48 REQUIREMENTS.md rows have plan references and "Satisfied" status, and all checkboxes are checked. Document the verification -- no code changes expected since table already appears correct.

### Claude's Discretion
- Specific rate limit numbers within the tiers (e.g., exact 60 vs 50 for reads)
- Rate limit decorator placement pattern (per-endpoint vs shared decorator helper)
- Unit test structure for RLS verification

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-03 | Campaign context setting is centralized so no endpoint can skip it | INT-01 fix: swap `get_db` to `get_campaign_db` in 2 turf endpoints (turfs.py lines 117, 166) |
| OBS-03 | Rate limiting uses real client IP with proxy header guard | INT-02 fix: apply `@limiter.limit()` to all endpoints; limiter already uses `get_real_ip` as default key_func |
| OBS-04 | Authenticated endpoints have user-ID-based rate limiting in addition to IP-based | INT-02 fix: wire `get_user_or_ip_key` as `key_func` on authenticated endpoint decorators |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| slowapi | 0.1.9 | Per-endpoint rate limiting for FastAPI/Starlette | Already installed and configured; only lib with per-endpoint decorator pattern for FastAPI |
| FastAPI | (existing) | Web framework | Project standard |
| SQLAlchemy | (existing) | Async ORM with RLS context | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| limits | (slowapi dep) | Rate limit parsing and storage backend | Automatically used by slowapi |

No new packages are needed for this phase. All infrastructure is already built.

## Architecture Patterns

### Pattern 1: Rate Limit Decorator with Request Parameter (SlowAPI Requirement)

**What:** SlowAPI's `@limiter.limit()` decorator inspects the decorated function's signature at import time. It raises an `Exception` if no `request` or `websocket` parameter is found (source: slowapi/extension.py lines 708-715).

**When to use:** Every endpoint that gets a `@limiter.limit()` decorator.

**Example (authenticated endpoint -- per-user key):**
```python
from fastapi import Request
from app.core.rate_limit import limiter, get_user_or_ip_key

@router.get("/campaigns/{campaign_id}/turfs")
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_turfs(
    request: Request,  # REQUIRED by SlowAPI
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    ...
```

**Example (unauthenticated endpoint -- IP-only key, uses default):**
```python
@router.get("/join/{slug}")
@limiter.limit("20/minute")  # default key_func=get_real_ip
async def get_campaign_public_info(
    request: Request,
    slug: SlugParam,
    db: AsyncSession = Depends(get_db),
):
    ...
```

### Pattern 2: Centralized RLS Dependency

**What:** `Depends(get_campaign_db)` automatically calls `set_campaign_context()` for any endpoint with `campaign_id` in the URL path.

**When to use:** All campaign-scoped endpoints. Replaces `Depends(get_db)` + inline `set_campaign_context()` calls.

**Example (the fix for INT-01):**
```python
# BEFORE (inconsistent):
async def get_turf_overlaps(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),  # <-- wrong
):
    from app.db.rls import set_campaign_context
    await set_campaign_context(db, str(campaign_id))  # <-- inline, fragile

# AFTER (centralized):
async def get_turf_overlaps(
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),  # <-- centralized
):
    # No manual set_campaign_context needed
```

### Anti-Patterns to Avoid
- **Adding `request: Request` to decorator kwargs instead of function params:** SlowAPI needs it as a positional/keyword argument in the function signature, not in `Depends()`.
- **Using `get_user_or_ip_key` on unauthenticated endpoints:** `get_user_or_ip_key` gracefully falls back to IP, but semantically unauthenticated endpoints (join, health) should use IP-only per D-04.
- **Forgetting `@limiter.limit()` goes BETWEEN `@router.method()` and `async def`:** Decorator order matters -- `@router.get(...)` must be outermost, then `@limiter.limit(...)`, then the function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-user rate limiting | Custom middleware tracking | `get_user_or_ip_key` with `@limiter.limit(key_func=...)` | Already built and tested in `app/core/rate_limit.py` |
| RLS context setting | Inline `set_campaign_context` calls | `Depends(get_campaign_db)` | Centralizes RLS; prevents future regressions |
| Rate limit storage | Redis/database backend | SlowAPI default in-memory | Sufficient for single-process deployment; upgrade to Redis only if scaling horizontally |

## Common Pitfalls

### Pitfall 1: Missing `request: Request` Parameter
**What goes wrong:** SlowAPI raises `Exception` at import time if decorated function lacks `request` parameter.
**Why it happens:** Only 12 of 169 endpoints currently have `request: Request`.
**How to avoid:** Add `request: Request` as the first parameter (after `self` if applicable) to every rate-limited endpoint function.
**Warning signs:** Application fails to start after adding decorator.

### Pitfall 2: Decorator Order
**What goes wrong:** Rate limiting silently doesn't apply or route registration breaks.
**Why it happens:** `@router.get()` must wrap `@limiter.limit()` which wraps the function.
**How to avoid:** Always: `@router.method(...)` then `@limiter.limit(...)` then `async def`.
**Warning signs:** No rate limit headers in response, or 405 Method Not Allowed.

### Pitfall 3: `ensure_user_synced` Left Behind After RLS Fix
**What goes wrong:** `ensure_user_synced` is still called in the two endpoints being fixed, which is correct -- it handles user sync, not RLS context.
**Why it happens:** Temptation to remove it along with `set_campaign_context`.
**How to avoid:** Keep `ensure_user_synced(user, db)` -- only remove the `from app.db.rls import set_campaign_context` and `await set_campaign_context(db, str(campaign_id))` lines.
**Warning signs:** User sync failures after fix.

### Pitfall 4: Import of `get_db` Left Unused After RLS Fix
**What goes wrong:** Ruff linter flags unused import.
**Why it happens:** After swapping `get_db` to `get_campaign_db`, the `get_db` import in turfs.py may become unused.
**How to avoid:** Check if any remaining endpoints in turfs.py use `get_db`. Currently none do after the fix, so remove the import.
**Warning signs:** Ruff F401 error.

## Code Examples

### Rate Limit Tiers (per D-01, D-02, D-03, D-04)

```python
# Tier definitions based on CONTEXT.md decisions
# Reads (GET) -- authenticated
@limiter.limit("60/minute", key_func=get_user_or_ip_key)

# Writes (POST/PUT/PATCH/DELETE) -- authenticated
@limiter.limit("30/minute", key_func=get_user_or_ip_key)

# Bulk/Import (CSV import, bulk DNC) -- authenticated, expensive
@limiter.limit("5/minute", key_func=get_user_or_ip_key)

# Auth-sensitive (join, invite) -- mixed auth
@limiter.limit("20/minute")  # public GET (IP-only)
@limiter.limit("5/minute")   # register POST (IP-only per D-04)
```

### Endpoint Classification for Rate Limiting

| File | Endpoints | HTTP Methods | Tier | key_func |
|------|-----------|--------------|------|----------|
| call_lists.py | 8 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| campaigns.py | 5 | GET/POST/PATCH | reads 60/min, writes 30/min | get_user_or_ip_key |
| config.py | 1 | GET | reads 60/min | get_user_or_ip_key |
| dashboard.py | 18 | GET | reads 60/min | get_user_or_ip_key |
| dnc.py | 5 | GET/POST/DELETE | reads 60/min, writes 30/min, bulk POST 5/min | get_user_or_ip_key |
| field.py | 1 | GET | reads 60/min | get_user_or_ip_key |
| imports.py | 7 | GET/POST/DELETE | reads 60/min, bulk POST 5/min, writes 30/min | get_user_or_ip_key |
| invites.py | 4 | GET/POST/DELETE | reads 60/min, auth-sensitive POST 10/min, writes 30/min | get_user_or_ip_key |
| join.py | 2 | GET/POST | ALREADY DONE (20/min, 5/min) | get_real_ip (IP-only, D-04) |
| members.py | 4 | GET/PATCH/POST | reads 60/min, writes 30/min | get_user_or_ip_key |
| org.py | 5 | GET/POST/PATCH | reads 60/min, writes 30/min | get_user_or_ip_key |
| phone_banks.py | 14 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| shifts.py | 14 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| surveys.py | 11 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| turfs.py | 7 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| users.py | 3 | GET/PATCH | reads 60/min, writes 30/min | get_user_or_ip_key |
| volunteers.py | 16 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| voter_contacts.py | 11 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| voter_interactions.py | 2 | GET/POST | reads 60/min, writes 30/min | get_user_or_ip_key |
| voter_lists.py | 8 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| voters.py | 7 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| voter_tags.py | 5 | GET/POST/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |
| walk_lists.py | 11 | GET/POST/PATCH/DELETE | reads 60/min, writes 30/min | get_user_or_ip_key |

**Total:** 169 endpoints across 24 files. 2 (join.py) already have rate limiting. 167 need decorators added.

### `request: Request` Parameter Addition Scope

Only 5 files (12 endpoints) currently have `request: Request`:
- campaigns.py (2), imports.py (4), invites.py (1), join.py (2), members.py (3)

The remaining 19 files (157 endpoints) need `request: Request` added to function signatures.

### RLS Fix (INT-01) -- Exact Changes in turfs.py

**`get_turf_overlaps` (lines 112-155):**
1. Change `db: AsyncSession = Depends(get_db)` to `db: AsyncSession = Depends(get_campaign_db)`
2. Remove `from app.db.rls import set_campaign_context` (line 124)
3. Remove `await set_campaign_context(db, str(campaign_id))` (line 126)

**`get_turf_voters` (lines 162-204):**
1. Change `db: AsyncSession = Depends(get_db)` to `db: AsyncSession = Depends(get_campaign_db)`
2. Remove `from app.db.rls import set_campaign_context` (line 173)
3. Remove `await set_campaign_context(db, str(campaign_id))` (line 175)

**Cleanup:** After both fixes, `from app.db.session import get_db` (line 13) becomes unused -- remove it.

### RLS Unit Test (D-06) -- Recommended Approach

```python
"""Verify turf overlap and voter endpoints use centralized get_campaign_db."""
import inspect
from app.api.v1.turfs import get_turf_overlaps, get_turf_voters
from app.api.deps import get_campaign_db

def test_get_turf_overlaps_uses_get_campaign_db():
    sig = inspect.signature(get_turf_overlaps)
    db_param = sig.parameters["db"]
    assert db_param.default.dependency is get_campaign_db

def test_get_turf_voters_uses_get_campaign_db():
    sig = inspect.signature(get_turf_voters)
    db_param = sig.parameters["db"]
    assert db_param.default.dependency is get_campaign_db
```

### REQUIREMENTS.md Verification (D-07)

Current state (already read): The traceability table at lines 78-127 already shows correct plan references and "Satisfied" status for all 48 entries. TEST-01/02/03 checkboxes at lines 72-74 are already checked. The audit document's finding about stale docs appears to have been resolved. The verification task is to confirm this programmatically and document the result.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Depends(get_db)` + inline `set_campaign_context` | `Depends(get_campaign_db)` | Phase 39 (2026-03) | Centralized RLS, no endpoint can skip it |
| No rate limiting | `@limiter.limit()` per-endpoint | Phase 40 infra (2026-03) | Infrastructure built, not deployed to most endpoints |
| IP-only rate limit keys | `get_user_or_ip_key` for per-user + IP | Phase 40 (2026-03) | Function built and tested, not wired to any endpoint |

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` (not pip/poetry)
- **Linting:** `uv run ruff check .` / `uv run ruff format .` -- ruff rules E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` (asyncio_mode=auto)
- **Commits:** Conventional Commits format
- **Context7 MCP:** Always use for library documentation lookups

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (asyncio_mode=auto) |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-03 | `get_turf_overlaps` and `get_turf_voters` use `get_campaign_db` | unit | `uv run pytest tests/unit/test_turf_rls_centralization.py -x` | Wave 0 |
| OBS-03 | Rate limit decorators present on all endpoints | unit | `uv run pytest tests/unit/test_rate_limit_coverage.py -x` | Wave 0 |
| OBS-04 | Authenticated endpoints use `get_user_or_ip_key` | unit | `uv run pytest tests/unit/test_rate_limit_coverage.py -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_turf_rls_centralization.py` -- covers DATA-03 (inspect-based dependency verification)
- [ ] `tests/unit/test_rate_limit_coverage.py` -- covers OBS-03 and OBS-04 (verify all endpoints have decorators with correct key_func)

## Open Questions

1. **join.py rate limit key_func update?**
   - What we know: join.py already has `@limiter.limit("20/minute")` and `@limiter.limit("5/minute")` using the default `get_real_ip` key_func.
   - What's unclear: D-04 says "IP-only rate limiting for unauthenticated endpoints (join, health)" -- join.py endpoints are a mix (GET is public, POST requires auth).
   - Recommendation: Leave join.py as-is since D-04 explicitly says IP-only for join. The register endpoint uses auth but the decision treats join as a special category.

2. **Health endpoint rate limiting?**
   - What we know: Health endpoint is likely in a separate router (not in v1/).
   - What's unclear: Whether health endpoint needs rate limiting.
   - Recommendation: Skip health endpoint per standard practice (monitoring tools need unrestricted access).

## Sources

### Primary (HIGH confidence)
- `app/core/rate_limit.py` -- limiter instance, key functions, already built
- `app/api/deps.py` -- `get_campaign_db` dependency, the centralized pattern
- `app/api/v1/turfs.py` -- exact lines needing INT-01 fix
- `app/api/v1/join.py` -- reference pattern for `@limiter.limit()` usage
- `.venv/lib/python3.13/site-packages/slowapi/extension.py` lines 708-715 -- Request parameter requirement
- `.planning/v1.5-MILESTONE-AUDIT.md` -- INT-01, INT-02 gap definitions
- `.planning/REQUIREMENTS.md` -- current traceability table state (already correct)

### Secondary (MEDIUM confidence)
- SlowAPI 0.1.9 source code -- decorator behavior, key_func override support

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use
- Architecture: HIGH - patterns already established in codebase, just need wider application
- Pitfalls: HIGH - verified SlowAPI Request requirement directly from source code

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- no library changes expected)
