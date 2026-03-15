# Phase 27: Wire Advanced Filters to Backend - Research

**Researched:** 2026-03-15
**Domain:** Full-stack API wiring (FastAPI + TanStack Query + Playwright E2E)
**Confidence:** HIGH

## Summary

Phase 27 closes the critical "BREAK 1" from the v1.3 milestone audit: advanced filter fields (propensity ranges, demographic multi-select, mailing address) are silently dropped by the GET /voters endpoint because it only accepts 7 hardcoded query parameters. The backend `build_voter_query()` already correctly handles all 32 VoterFilter fields, and the VoterFilterBuilder UI already emits them. The gap is purely in the transport layer -- the frontend uses GET with query params but must switch to POST with a JSON body.

The fix requires: (1) a new VoterSearchBody Pydantic schema wrapping VoterFilter with pagination/sort fields, (2) updating the POST /voters/search endpoint to accept it, (3) implementing sort support in search_voters, (4) migrating all frontend voter-fetching hooks to POST, (5) fixing buildFilterChips to cover new filter dimensions, and (6) validating with Playwright E2E tests.

**Primary recommendation:** Follow the 3-plan sequencing from CONTEXT.md -- backend first (schema + endpoint + sort), frontend second (hooks + page components + filter chips), E2E tests third.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Always use POST /voters/search -- all frontend voter fetching migrates to POST
- GET /voters endpoint stays as-is with its 7 params for external API consumers -- no changes
- New Pydantic model VoterSearchBody wraps VoterFilter with pagination and sorting fields
- Structure: `{ filters: VoterFilter, cursor?: str, limit?: int, sort_by?: str, sort_dir?: str }`
- `limit` naming (not page_size) to match existing backend conventions
- `sort_by` validated against whitelist of allowed sortable columns (Literal type or validator)
- `sort_dir` validated as Literal['asc', 'desc']
- POST /voters/search endpoint updated from `body: VoterFilter` to `body: VoterSearchBody`
- Remove VoterSearchRequest TypeScript type entirely -- it was the broken `{ filters, query }` envelope
- Create matching TypeScript VoterSearchBody interface for the POST body
- Delete useVotersQuery (GET-based) -- replaced entirely
- Delete useSearchVoters (orphaned mutation) -- replaced entirely
- Create new useVoterSearch hook (useQuery-based, POST)
- Migrate useVoters (infinite scroll in AddVotersDialog) to also use POST with VoterSearchBody
- Frontend adopts 'limit' naming everywhere (not pageSize)
- VoterFilterBuilder keeps emitting VoterFilter via onChange -- no change to component contract
- Voter list page wraps VoterFilter into VoterSearchBody when passing to the hook
- Fix sorting in search_voters (currently hardcoded to created_at DESC -- sorting has never worked)
- Dynamic cursor encoding: cursor encodes sort_column_value|id (not just created_at|id)
- Toast notification for POST validation errors (matches existing pattern)
- Keep previous results visible during error state (TanStack Query keepPreviousData)
- Filter panel stays open so user can fix the value
- 4 Playwright E2E test scenarios (propensity range, demographic multi-select, mailing address, combined filter)
- Dual test data approach: create test voters with known values AND validate against seed data
- Verify HTTP method: Playwright intercepts network requests to confirm POST is used
- Separate Playwright E2E test confirming GET /voters still works for legacy API consumers
- Plan 1: Backend (VoterSearchBody, sort support, dynamic cursor, POST endpoint update)
- Plan 2: Frontend (hooks, page components, type cleanup, deletion of old hooks)
- Plan 3: E2E tests (Playwright tests for all 4 scenarios + GET backward compat test)

### Claude's Discretion
- Cache key strategy for TanStack Query (whether to include HTTP method indicator)
- Exact whitelist of sortable columns
- Dynamic cursor encoding implementation details
- Test file organization and naming

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILT-01 | VoterFilter supports propensity_general_min/max, propensity_primary_min/max, propensity_combined_min/max range filters | Backend build_voter_query already implements these (lines 86-101 of voter.py). VoterFilter schema already has fields (lines 36-41 of voter_filter.py). Gap is transport: POST endpoint + frontend hook must transmit them. |
| FILT-02 | VoterFilter supports ethnicity, spoken_language, military_status as multi-select list filters | Backend build_voter_query implements case-insensitive IN (lines 105-122). VoterFilter has ethnicities/spoken_languages/military_statuses fields. Gap is transport only. |
| FILT-03 | VoterFilter supports mailing_city, mailing_state, mailing_zip as exact-match filters | Backend build_voter_query implements case-insensitive equality (lines 124-136). VoterFilter has fields. Gap is transport only. |
| FILT-04 | build_voter_query handles all new filter dimensions following existing pattern | Already complete in backend. This phase wires frontend to backend to make it functional end-to-end. |
| FILT-05 | Voting history filter maintains backward compatibility | Already working via GET endpoint for year-only values. POST migration must preserve this. Year expansion logic in build_voter_query (lines 139-158) is correct. |
| FRNT-02 | VoterFilterBuilder includes controls for propensity ranges, ethnicity, language, military status with collapsible filter groups | UI is complete (VoterFilterBuilder.tsx, 671 lines). Missing: (1) filter chips in buildFilterChips() for new dimensions, (2) transport via POST hook. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | existing | API framework | Already in use; Pydantic model validation for VoterSearchBody |
| Pydantic | existing | Request body validation | VoterSearchBody schema with Literal validators |
| SQLAlchemy | existing | ORM query building | search_voters already uses it; add dynamic sort |
| TanStack Query | ^5.90.21 | Frontend data fetching | useQuery with POST for voter search |
| ky | ^1.14.3 | HTTP client | `api.post()` with `json:` body for POST requests |
| Playwright | ^1.58.2 | E2E testing | Network interception, filter validation |
| sonner | ^2.0.7 | Toast notifications | Error feedback on validation failures |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | existing | Runtime validation | Not needed -- Pydantic handles backend validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| POST /voters/search | Expanding GET params | REJECTED by user -- GET with 32+ query params is unwieldy, error-prone for lists |

**Installation:**
No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Current vs. Target Data Flow

**Current (broken):**
```
VoterFilterBuilder → onChange(VoterFilter)
  → voter list page state
  → useVotersQuery(filters)
  → GET /voters?party=DEM&city=Austin  (7 params only -- 25 filter fields silently dropped)
  → list_voters handler
  → search_voters(VoterFilter(party="DEM", registration_city="Austin"))
```

**Target (fixed):**
```
VoterFilterBuilder → onChange(VoterFilter)
  → voter list page state
  → useVoterSearch(VoterSearchBody { filters, cursor, limit, sort_by, sort_dir })
  → POST /voters/search  (full VoterFilter JSON body, all 32 fields preserved)
  → search_voters_endpoint handler
  → search_voters(VoterFilter, sort_by, sort_dir, cursor, limit)
```

### Pattern 1: VoterSearchBody Wrapper Schema
**What:** New Pydantic model that wraps VoterFilter with pagination/sort metadata
**When to use:** All POST /voters/search requests
**Example:**
```python
# Source: CONTEXT.md decision + existing app/schemas/ pattern
from typing import Literal
from pydantic import BaseModel, Field
from app.schemas.voter_filter import VoterFilter

SORTABLE_COLUMNS = Literal[
    "last_name", "first_name", "party", "age",
    "registration_city", "registration_state", "registration_zip",
    "created_at", "updated_at",
    "propensity_general", "propensity_primary", "propensity_combined",
]

class VoterSearchBody(BaseModel):
    filters: VoterFilter = Field(default_factory=VoterFilter)
    cursor: str | None = None
    limit: int = Field(default=50, ge=1, le=200)
    sort_by: SORTABLE_COLUMNS | None = None
    sort_dir: Literal["asc", "desc"] | None = None
```

### Pattern 2: useQuery with POST (TanStack Query)
**What:** Using useQuery (not useMutation) for POST-based data fetching
**When to use:** When POST is used for querying, not side effects
**Example:**
```typescript
// Source: TanStack Query docs -- useQuery is for data fetching regardless of HTTP method
export function useVoterSearch(campaignId: string, body: VoterSearchBody) {
  return useQuery({
    queryKey: ["voters", campaignId, "search", body],
    queryFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/search`, { json: body })
        .json<PaginatedResponse<Voter>>(),
    placeholderData: keepPreviousData,
    enabled: !!campaignId,
  })
}
```

### Pattern 3: Dynamic Cursor Encoding
**What:** Cursor encodes the sort column value plus ID for stable cursor pagination
**When to use:** When sort_by is dynamic (not always created_at)
**Example:**
```python
# When sort_by="last_name", cursor becomes "Smith|<uuid>"
# When sort_by="age", cursor becomes "45|<uuid>"
# When sort_by=None or "created_at", cursor becomes "<iso-timestamp>|<uuid>"
def encode_cursor(item, sort_by: str | None) -> str:
    col = sort_by or "created_at"
    val = getattr(item, col)
    if isinstance(val, datetime):
        val = val.isoformat()
    return f"{val}|{item.id}"

def decode_cursor(cursor: str, sort_by: str | None) -> tuple:
    val_str, id_str = cursor.split("|", 1)
    cursor_id = uuid.UUID(id_str)
    col = sort_by or "created_at"
    if col == "created_at" or col == "updated_at":
        cursor_val = datetime.fromisoformat(val_str)
    elif col == "age":
        cursor_val = int(val_str) if val_str != "None" else None
    else:
        cursor_val = val_str if val_str != "None" else None
    return cursor_val, cursor_id
```

### Pattern 4: Filter Chip Coverage for New Dimensions
**What:** buildFilterChips() needs entries for all 12 new filter types
**When to use:** Always -- chips provide visual feedback for active filters
**Example:**
```typescript
// New chip entries needed:
// propensity_general_min/max, propensity_primary_min/max, propensity_combined_min/max
// ethnicities, spoken_languages, military_statuses
// mailing_city, mailing_state, mailing_zip
if (filters.propensity_general_min !== undefined || filters.propensity_general_max !== undefined) {
  chips.push({
    label: `General: ${filters.propensity_general_min ?? 0}–${filters.propensity_general_max ?? 100}`,
    onDismiss: () => update({ propensity_general_min: undefined, propensity_general_max: undefined }),
  })
}
```

### Anti-Patterns to Avoid
- **Using useMutation for POST search:** useMutation is for side effects. POST /voters/search is idempotent query -- use useQuery. The orphaned useSearchVoters made this mistake.
- **Serializing VoterFilter to query params:** The whole point of this phase is to stop doing this. Always use JSON body.
- **Modifying GET /voters endpoint:** Locked decision -- GET stays as-is for backward compatibility with external API consumers.
- **Sending cursor/limit/sort as query params on POST:** All pagination/sort fields go inside VoterSearchBody JSON body. No query params on the POST endpoint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| POST body validation | Manual field checking | Pydantic VoterSearchBody with Literal validators | Automatic 422 errors with field-level messages |
| Query key serialization | Custom cache key builder | TanStack Query auto-serialization of body object | Objects in queryKey are deep-compared automatically |
| Network request interception in tests | Custom fetch spy | Playwright `page.route()` / `page.waitForRequest()` | Built-in, handles async correctly |
| Sort column whitelist | if/elif chain | `Literal["col1", "col2", ...]` type annotation | Pydantic validates automatically, FastAPI generates OpenAPI schema |

**Key insight:** The backend already handles all 32 filter conditions correctly. This phase is about plumbing, not logic. Avoid introducing new filter logic -- just transport what already works.

## Common Pitfalls

### Pitfall 1: Breaking the POST endpoint's existing consumers
**What goes wrong:** The POST /voters/search endpoint currently accepts a bare VoterFilter body. Changing it to VoterSearchBody breaks any existing callers.
**Why it happens:** Forgetting that dynamic voter lists use search_voters internally.
**How to avoid:** Verify dynamic list code path (`GET /lists/{id}/members`) uses a separate code path. The CONTEXT.md confirms it does. The POST endpoint's only current consumer is the orphaned useSearchVoters (which sends the wrong envelope anyway and is being deleted).
**Warning signs:** Any 422 errors on list member endpoints after the change.

### Pitfall 2: Cursor format mismatch across sort columns
**What goes wrong:** Cursor encoded with `created_at|id` format breaks when sort_by changes to `last_name`.
**Why it happens:** Cursor decode assumes ISO timestamp format for the first value.
**How to avoid:** Dynamic cursor decode must check sort_by to determine how to parse the cursor value. Handle None/null sort column values (voters with NULL last_name).
**Warning signs:** 500 errors when paginating with non-default sort, or `fromisoformat` parse errors.

### Pitfall 3: NULL sort values causing cursor breakage
**What goes wrong:** When sorting by `age` or `propensity_general`, many voters have NULL values. Cursor pagination breaks on NULLs.
**Why it happens:** SQL NULL comparisons (NULL < 45) always return NULL/false.
**How to avoid:** Use NULLS LAST in ORDER BY. Encode NULL in cursor as literal "None" string. Add NULL-aware comparison in WHERE clause.
**Warning signs:** Voters with NULL sort column values disappearing from results, or infinite loops at page boundaries.

### Pitfall 4: TanStack Query cache key object comparison
**What goes wrong:** Filter changes don't trigger refetch because VoterFilter object reference changes but content is identical, or vice versa.
**Why it happens:** queryKey includes object with undefined fields that serialize inconsistently.
**How to avoid:** Clean the VoterFilter before including in queryKey -- strip undefined/null/empty values. TanStack Query v5 uses structural comparison, so this mostly works, but empty arrays vs undefined can cause issues.
**Warning signs:** Stale data after filter changes, or unnecessary refetches.

### Pitfall 5: keepPreviousData import location
**What goes wrong:** `keepPreviousData` is imported from wrong location or used incorrectly in TanStack Query v5.
**Why it happens:** API changed between v4 and v5.
**How to avoid:** In TanStack Query v5, use `import { keepPreviousData } from "@tanstack/react-query"` and set `placeholderData: keepPreviousData` (not `keepPreviousData: true` which was the v4 API).
**Warning signs:** TypeScript error on `keepPreviousData` option, or flash of empty state during filter changes.

### Pitfall 6: ky POST with `json:` option
**What goes wrong:** Sending body as `body: JSON.stringify(data)` instead of `json: data`.
**Why it happens:** Confusing ky API with fetch API.
**How to avoid:** Always use `api.post(url, { json: bodyObject })` -- ky auto-serializes and sets Content-Type header.
**Warning signs:** 422 errors because backend receives string instead of parsed JSON.

## Code Examples

### Backend: VoterSearchBody Schema
```python
# File: app/schemas/voter_filter.py (append to existing)
# Source: CONTEXT.md locked decision

from typing import Literal

SORTABLE_COLUMNS = Literal[
    "last_name", "first_name", "party", "age",
    "registration_city", "registration_state", "registration_zip",
    "created_at", "updated_at",
    "propensity_general", "propensity_primary", "propensity_combined",
]

class VoterSearchBody(BaseModel):
    """Wrapper for POST /voters/search with pagination and sorting."""
    filters: VoterFilter = Field(default_factory=VoterFilter)
    cursor: str | None = None
    limit: int = Field(default=50, ge=1, le=200)
    sort_by: SORTABLE_COLUMNS | None = None
    sort_dir: Literal["asc", "desc"] | None = None
```

### Backend: Updated POST Endpoint
```python
# File: app/api/v1/voters.py -- updated search_voters endpoint
# Source: existing endpoint pattern + CONTEXT.md decision

@router.post(
    "/campaigns/{campaign_id}/voters/search",
    response_model=PaginatedResponse[VoterResponse],
)
async def search_voters(
    campaign_id: uuid.UUID,
    body: VoterSearchBody,  # Changed from VoterFilter
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context
    await set_campaign_context(db, str(campaign_id))
    return await _service.search_voters(
        db, body.filters,
        cursor=body.cursor,
        limit=body.limit,
        sort_by=body.sort_by,
        sort_dir=body.sort_dir,
    )
```

### Backend: Dynamic Sort in search_voters
```python
# File: app/services/voter.py -- updated search_voters method
# Source: existing cursor pattern + CONTEXT.md decision for dynamic sort

async def search_voters(
    self,
    db: AsyncSession,
    filters: VoterFilter,
    cursor: str | None = None,
    limit: int = 50,
    sort_by: str | None = None,
    sort_dir: str | None = None,
) -> PaginatedResponse[VoterResponse]:
    query = build_voter_query(filters)

    # Determine sort column
    sort_col = getattr(Voter, sort_by) if sort_by else Voter.created_at
    is_desc = (sort_dir or "desc") == "desc"

    # Apply ordering
    if is_desc:
        query = query.order_by(sort_col.desc(), Voter.id.desc())
    else:
        query = query.order_by(sort_col.asc(), Voter.id.asc())

    # Cursor-based pagination with dynamic column
    if cursor:
        cursor_val, cursor_id = decode_cursor(cursor, sort_by)
        if is_desc:
            query = query.where(
                (sort_col < cursor_val)
                | ((sort_col == cursor_val) & (Voter.id < cursor_id))
            )
        else:
            query = query.where(
                (sort_col > cursor_val)
                | ((sort_col == cursor_val) & (Voter.id > cursor_id))
            )

    # ... rest same as current
```

### Frontend: VoterSearchBody TypeScript Type
```typescript
// File: web/src/types/voter.ts
// Source: mirrors backend VoterSearchBody

export interface VoterSearchBody {
  filters: VoterFilter
  cursor?: string
  limit?: number
  sort_by?: string
  sort_dir?: "asc" | "desc"
}
```

### Frontend: useVoterSearch Hook
```typescript
// File: web/src/hooks/useVoters.ts (new hook replacing useVotersQuery + useSearchVoters)
// Source: TanStack Query v5 useQuery + ky POST pattern

import { keepPreviousData } from "@tanstack/react-query"

export function useVoterSearch(campaignId: string, body: VoterSearchBody) {
  return useQuery({
    queryKey: ["voters", campaignId, "search", body],
    queryFn: () =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/search`, { json: body })
        .json<PaginatedResponse<Voter>>(),
    placeholderData: keepPreviousData,
    enabled: !!campaignId,
  })
}
```

### Frontend: Voter List Page Integration
```typescript
// In VotersPage component -- wrap VoterFilter into VoterSearchBody
const searchBody: VoterSearchBody = {
  filters,
  cursor,
  limit: 50,
  sort_by: sortBy,
  sort_dir: sortDir,
}
const { data, isLoading } = useVoterSearch(campaignId, searchBody)
```

### Playwright: Network Interception Pattern
```typescript
// File: web/e2e/phase27-filter-wiring.spec.ts
// Source: Playwright docs -- request interception

test("propensity filter sends POST with correct body", async ({ page }) => {
  // Intercept to verify POST method and body
  const searchRequests: Request[] = []
  await page.route("**/voters/search", (route) => {
    searchRequests.push(route.request())
    route.continue()
  })

  // Apply filter via UI...
  // Verify request used POST
  expect(searchRequests.length).toBeGreaterThan(0)
  expect(searchRequests[0].method()).toBe("POST")
  const body = searchRequests[0].postDataJSON()
  expect(body.filters.propensity_general_min).toBeDefined()
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GET with many query params | POST with JSON body for complex search | Ongoing best practice | Avoids URL length limits, supports nested structures |
| keepPreviousData: true (TanStack v4) | placeholderData: keepPreviousData (TanStack v5) | v5 release | API change -- must use v5 syntax |
| useMutation for POST queries | useQuery with POST (queryFn uses POST) | TanStack v5 convention | useMutation is for side effects only |

**Deprecated/outdated:**
- `useSearchVoters` (useMutation pattern): Wrong abstraction for search queries. Delete.
- `VoterSearchRequest` TS type: Broken envelope `{ filters, query }` that doesn't match backend. Delete.
- `useVotersQuery` (GET-based): Cannot transmit 32 filter fields. Delete.

## Open Questions

1. **Exact sort column whitelist**
   - What we know: DataTable enables sorting on columns with `enableSorting: true` (full_name, party, city, age). The Voter model has ~40 columns.
   - What's unclear: Should the whitelist match exactly what the DataTable exposes, or be broader?
   - Recommendation: Start with columns that have indexes for performance: `last_name, first_name, party, age, registration_city, registration_state, registration_zip, created_at, updated_at, propensity_general, propensity_primary, propensity_combined`. Map DataTable column IDs to Voter model columns (e.g., "full_name" -> "last_name", "city" -> "registration_city").

2. **NULL handling in cursor pagination for nullable sort columns**
   - What we know: Columns like `age`, `propensity_general`, `last_name` can be NULL.
   - What's unclear: Exact behavior desired when sorting by a nullable column.
   - Recommendation: Use `NULLS LAST` for ascending, `NULLS FIRST` for descending (PostgreSQL default for DESC). Encode NULL in cursor as literal "None" string.

3. **Cache key strategy for POST-based queries**
   - What we know: TanStack Query v5 deep-compares objects in queryKey.
   - What's unclear: Whether to add a "method" discriminator to avoid collisions with any future GET-based voter queries.
   - Recommendation: Use `["voters", campaignId, "search", body]` -- the "search" segment already discriminates from `["voters", campaignId, voterId]` used by useVoter. No method indicator needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | pytest (existing) |
| Framework (E2E) | Playwright ^1.58.2 |
| Config file (backend) | pyproject.toml (existing pytest config) |
| Config file (E2E) | web/playwright.config.ts |
| Quick run command (backend) | `cd /home/kwhatcher/projects/run-api && uv run pytest tests/unit/test_voter_search.py -x` |
| Full suite command (backend) | `cd /home/kwhatcher/projects/run-api && uv run pytest tests/unit/ -x` |
| E2E command | `cd /home/kwhatcher/projects/run-api/web && npx playwright test e2e/phase27-filter-wiring.spec.ts` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-01 | Propensity range filters work end-to-end | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "propensity"` | No - Wave 0 |
| FILT-02 | Demographic multi-select filters work | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "demographic"` | No - Wave 0 |
| FILT-03 | Mailing address filters work | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "mailing"` | No - Wave 0 |
| FILT-04 | All filter dimensions handled correctly | unit + E2E | `uv run pytest tests/unit/test_voter_search.py -x` | Yes (backend unit tests exist) |
| FILT-05 | Voting history backward compatibility | unit | `uv run pytest tests/unit/test_voter_search.py -k "voted_in" -x` | Yes (existing) |
| FRNT-02 | VoterFilterBuilder controls + filter chips | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "combined"` | No - Wave 0 |

### Backend Unit Tests for New Code
| Behavior | Test Type | File |
|----------|-----------|------|
| VoterSearchBody schema validation | unit | tests/unit/test_voter_search.py (append) |
| VoterSearchBody sort_by whitelist rejects invalid column | unit | tests/unit/test_voter_search.py (append) |
| VoterSearchBody sort_dir validates asc/desc only | unit | tests/unit/test_voter_search.py (append) |
| Dynamic cursor encode/decode roundtrip | unit | tests/unit/test_voter_search.py (append) |
| search_voters with sort_by=last_name | unit | tests/unit/test_voter_search.py (append) |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_voter_search.py -x` (backend tasks)
- **Per wave merge:** `uv run pytest tests/unit/ -x` (full unit suite)
- **Phase gate:** Full unit suite + Playwright E2E suite before /gsd:verify-work

### Wave 0 Gaps
- [ ] `web/e2e/phase27-filter-wiring.spec.ts` -- covers FILT-01, FILT-02, FILT-03, FRNT-02 (E2E validation)
- [ ] Backend unit tests for VoterSearchBody schema, dynamic cursor, sort support (append to existing test_voter_search.py)

## Sources

### Primary (HIGH confidence)
- `app/schemas/voter_filter.py` -- VoterFilter has all 32 fields, validated with ge/le for propensity
- `app/services/voter.py` -- build_voter_query (lines 27-214) handles all filters; search_voters (lines 220-273) has cursor pagination but hardcoded created_at sort
- `app/api/v1/voters.py` -- GET endpoint (lines 24-61) accepts only 7 params; POST endpoint (lines 64-85) accepts VoterFilter body
- `web/src/hooks/useVoters.ts` -- useVotersQuery (lines 114-142) uses GET; useSearchVoters (lines 167-178) orphaned useMutation
- `web/src/types/voter.ts` -- VoterSearchRequest (lines 165-168) is broken envelope type
- `web/src/components/voters/VoterFilterBuilder.tsx` -- complete UI with all filter controls (671 lines)
- `web/src/routes/campaigns/$campaignId/voters/index.tsx` -- voter list page, buildFilterChips missing new types
- `.planning/v1.3-MILESTONE-AUDIT.md` -- documents BREAK 1 root cause and affected requirements

### Secondary (MEDIUM confidence)
- TanStack Query v5 keepPreviousData API (verified against installed version ^5.90.21)
- ky POST `json:` option (verified against installed version ^1.14.3)
- Playwright request interception API (verified against installed version ^1.58.2)

### Tertiary (LOW confidence)
- None -- all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use
- Architecture: HIGH - follows existing patterns, mostly plumbing/wiring
- Pitfalls: HIGH - derived from direct code inspection of current implementation
- Dynamic cursor: MEDIUM - NULL handling edge cases need implementation-time validation

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependency changes expected)
