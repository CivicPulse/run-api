# Phase 6: Operational Dashboards - Research

**Researched:** 2026-03-09
**Domain:** Read-only aggregation endpoints over existing campaign operations data
**Confidence:** HIGH

## Summary

Phase 6 is a pure read-only aggregation layer. No new models, no new migrations (beyond optional indexes), and no new write paths. The work consists of building three domain-specific services that execute SQL aggregation queries against existing tables (voter_interactions, walk_lists, walk_list_entries, walk_list_canvassers, turfs, call_lists, call_list_entries, phone_bank_sessions, session_callers, volunteers, shifts, shift_volunteers), exposing results through 12 new dashboard endpoints.

The existing codebase provides all necessary building blocks: service class pattern, RLS context scoping, cursor-based pagination via PaginatedResponse, role-based access via require_role(), and Pydantic BaseSchema for response models. The technical challenge is writing correct and performant SQLAlchemy aggregation queries (GROUP BY, COUNT, SUM, CASE WHEN) rather than introducing new infrastructure.

**Primary recommendation:** Structure as three services (CanvassingDashboardService, PhoneBankingDashboardService, VolunteerDashboardService) plus one thin routes file. Use SQLAlchemy `func.count()`, `func.sum()`, `case()` for aggregations. No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Summary + drilldown pattern: one summary endpoint per domain, separate endpoints for dimensional breakdowns
- Campaign overview endpoint (`/dashboard/overview`) combines top-line numbers from all three domains
- Personal stats endpoint (`/dashboard/my-stats`) returns authenticated user's own activity
- Full endpoint map: 12 endpoints under /dashboard prefix (overview, canvassing, canvassing/by-turf, canvassing/by-canvasser, phone-banking, phone-banking/by-session, phone-banking/by-caller, phone-banking/by-call-list, volunteers, volunteers/by-volunteer, volunteers/by-shift, my-stats)
- Optional `start_date`/`end_date` query parameters on ALL endpoints
- No dates = all-time campaign totals
- Live queries on every request -- no materialized views or caching
- Direct SQLAlchemy queries against existing models -- no new database views
- Separate services per domain: CanvassingDashboardService, PhoneBankingDashboardService, VolunteerDashboardService
- Campaign-wide dashboard endpoints: manager+ role required
- `/dashboard/my-stats`: any campaign member (volunteer+ role)
- `/my-stats` uses auth user_id to query created_by, ShiftVolunteer, SessionCaller records
- Returns zeros if no activity found (not 404)
- Standard RLS scoping, no cross-campaign views
- Cursor-based pagination on all drilldown list endpoints (PaginatedResponse pattern)

### Claude's Discretion
- Database indexes for aggregation query performance
- Exact Pydantic response schema field names and nesting
- Whether to add a migration for indexes or rely on existing ones
- Error handling for edge cases (no turfs, no sessions, etc.)
- Query optimization strategies (subqueries vs joins for breakdowns)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | API provides canvassing progress data (doors knocked, contacts made, outcomes by turf and canvasser) | Aggregation over voter_interactions (type=DOOR_KNOCK), walk_list_entries (status=VISITED), walk_list_canvassers join. DoorKnockResult enum provides outcome categories. |
| DASH-02 | API provides phone banking progress data (calls made, contacts reached, outcomes by type) | Aggregation over voter_interactions (type=PHONE_CALL), call_list_entries (status counts), session_callers, phone_bank_sessions. CallResultCode enum provides outcome categories. |
| DASH-03 | API provides volunteer activity summary (active volunteers, scheduled shifts, total hours) | COUNT on volunteers (status=ACTIVE), shifts, shift_volunteers. Hours computed from check_in_at/check_out_at with adjusted_hours override (on-read pattern from Phase 5). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.135.1 | Route definitions, dependency injection | Already in project |
| SQLAlchemy | >=2.0.48 | Async ORM, aggregation queries (func.count, func.sum, case) | Already in project |
| Pydantic | >=2.12.5 | Response schemas for dashboard data | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastapi-problem-details | >=0.1.4 | RFC 9457 error responses | Error edge cases |

### Alternatives Considered
No new libraries needed. This phase is pure aggregation over existing infrastructure.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
app/
  services/
    dashboard/
      __init__.py              # Exports all three services
      canvassing.py            # CanvassingDashboardService
      phone_banking.py         # PhoneBankingDashboardService
      volunteer.py             # VolunteerDashboardService
  schemas/
    dashboard.py               # All dashboard response schemas
  api/v1/
    dashboard.py               # All dashboard route handlers
```

**Rationale:** A `services/dashboard/` package keeps the three service files organized without polluting the flat services directory. One route file is sufficient since dashboard endpoints share the same prefix and access patterns.

### Pattern 1: Aggregation Service Methods
**What:** Each service method executes a single-purpose aggregation query and returns a Pydantic schema directly.
**When to use:** All dashboard endpoints.
**Example:**
```python
from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import case, func, select

from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import DoorKnockResult, WalkListEntry, WalkListEntryStatus

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class CanvassingDashboardService:
    async def get_summary(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict:
        query = (
            select(
                func.count().label("total_interactions"),
                func.count()
                .filter(
                    VoterInteraction.type == InteractionType.DOOR_KNOCK
                )
                .label("doors_knocked"),
            )
            .where(VoterInteraction.campaign_id == campaign_id)
            .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
        )
        if start_date:
            query = query.where(VoterInteraction.created_at >= start_date)
        if end_date:
            query = query.where(VoterInteraction.created_at < end_date)
        result = await session.execute(query)
        row = result.one()
        return dict(row._mapping)
```

### Pattern 2: Outcome Breakdown with CASE WHEN
**What:** Use SQLAlchemy `case()` expressions to pivot outcome enums into named columns.
**When to use:** Canvassing outcome breakdown (DoorKnockResult), phone banking outcome breakdown (CallResultCode).
**Example:**
```python
from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import JSONB

# Count outcomes from JSONB payload.result_code
outcome_counts = select(
    func.count().label("total"),
    func.count().filter(
        VoterInteraction.payload["result_code"].astext == DoorKnockResult.SUPPORTER
    ).label("supporters"),
    func.count().filter(
        VoterInteraction.payload["result_code"].astext == DoorKnockResult.NOT_HOME
    ).label("not_home"),
    # ... additional outcomes
).where(
    VoterInteraction.campaign_id == campaign_id,
    VoterInteraction.type == InteractionType.DOOR_KNOCK,
)
```

### Pattern 3: Hours Computation (On-Read)
**What:** Volunteer hours computed from check_in_at/check_out_at timestamps with adjusted_hours override.
**When to use:** Volunteer dashboard total hours and per-volunteer hours.
**Example:**
```python
from sqlalchemy import case, func, extract

hours_expr = func.coalesce(
    ShiftVolunteer.adjusted_hours,
    extract("epoch", ShiftVolunteer.check_out_at - ShiftVolunteer.check_in_at) / 3600.0,
)

total_hours = select(
    func.sum(hours_expr).label("total_hours"),
).select_from(ShiftVolunteer).join(
    Shift, ShiftVolunteer.shift_id == Shift.id
).where(
    Shift.campaign_id == campaign_id,
    ShiftVolunteer.check_out_at.isnot(None),
)
```

### Pattern 4: Date Filtering Mixin
**What:** Reusable date filter application to avoid repetition across 12 endpoints.
**When to use:** All dashboard queries.
**Example:**
```python
from datetime import date, datetime, time

def apply_date_filter(query, column, start_date: date | None, end_date: date | None):
    """Apply optional date range filter to a query."""
    if start_date:
        query = query.where(column >= datetime.combine(start_date, time.min))
    if end_date:
        query = query.where(column < datetime.combine(end_date, time.max))
    return query
```

### Pattern 5: Drilldown with Cursor Pagination
**What:** GROUP BY queries with cursor-based pagination for drilldown endpoints.
**When to use:** by-turf, by-canvasser, by-session, by-caller, by-call-list, by-volunteer, by-shift.
**Example:**
```python
# Canvassing by-turf drilldown
query = (
    select(
        Turf.id.label("turf_id"),
        Turf.name.label("turf_name"),
        func.count(VoterInteraction.id).label("doors_knocked"),
        # ... outcome counts
    )
    .select_from(VoterInteraction)
    .join(WalkList, ...)  # Join chain to get turf
    .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
    .group_by(Turf.id, Turf.name)
    .order_by(Turf.name)
)
# Apply cursor pagination using Turf.id as cursor
```

### Pattern 6: My-Stats via Auth User ID
**What:** `/dashboard/my-stats` queries by authenticated user's ID across all three domains.
**When to use:** Personal stats endpoint.
**Example:**
```python
# Canvassing: created_by == user.id AND type == DOOR_KNOCK
# Phone banking: session_callers.user_id == user.id
# Volunteering: volunteers.user_id == user.id -> shift_volunteers
```

### Anti-Patterns to Avoid
- **Pre-computing/caching aggregates:** The user explicitly decided live queries on every request. Do not add Redis, materialized views, or denormalized counters.
- **One service class for everything:** Use three separate services per the locked decision.
- **Returning 404 for empty data:** Return zeros/empty lists. The user explicitly stated "Returns zeros if no activity found (not 404)."
- **New models or migrations for dashboard tables:** This is read-only aggregation. No new tables. An index-only migration is acceptable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date range filtering | Custom date parsing logic | Python `datetime.date` with FastAPI `Query(default=None)` | FastAPI auto-parses ISO date strings |
| Pagination on drilldowns | Custom offset/limit | Existing `PaginatedResponse[T]` with cursor | Consistent with all other list endpoints |
| Role checking | Custom role middleware | `require_role("manager")` / `require_role("volunteer")` | Already implemented with CampaignRole hierarchy |
| RLS scoping | Manual WHERE campaign_id clauses | `set_campaign_context(db, campaign_id)` | RLS automatically filters at DB level |
| Hours calculation | Stored duration column | On-read `adjusted_hours or (check_out - check_in)` expression | Phase 5 established this pattern |

**Key insight:** This phase should produce zero new infrastructure. Every building block exists. The work is SQL query composition only.

## Common Pitfalls

### Pitfall 1: JSONB Payload Field Access
**What goes wrong:** Canvassing outcomes (result_code) and walk_list_id are stored in the VoterInteraction.payload JSONB column, not as first-class columns. Incorrect JSONB path expressions produce NULL counts.
**Why it happens:** Developer treats payload fields like regular columns.
**How to avoid:** Use `VoterInteraction.payload["result_code"].astext` for string comparison. Test with actual payload data structure.
**Warning signs:** All outcome counts return 0 despite data existing.

### Pitfall 2: Counting Contacts vs Interactions
**What goes wrong:** "Contacts made" is not the same as "interactions recorded." A NOT_HOME door knock is an interaction but not a contact.
**Why it happens:** Ambiguous requirement language.
**How to avoid:** Define "contact" as interactions where result_code indicates actual voter contact (SUPPORTER, UNDECIDED, OPPOSED, REFUSED -- not NOT_HOME, MOVED, DECEASED, COME_BACK_LATER, INACCESSIBLE). Similarly for phone: ANSWERED is a contact, NO_ANSWER/BUSY/VOICEMAIL are not.
**Warning signs:** Contact rate appears unrealistically high (100%).

### Pitfall 3: Volunteer Hours Double-Counting
**What goes wrong:** A volunteer might have both shift_volunteers hours (from check-in/out) and auto-calculated hours from canvassing/phone banking sessions (VOL-06). Summing both over-counts.
**Why it happens:** VOL-06 says "auto-calculates hours from canvassing and phone banking session start/end times" but Phase 5 implementation tracks hours via ShiftVolunteer check_in/check_out.
**How to avoid:** For DASH-03, count hours exclusively from shift_volunteers table (check_in_at/check_out_at with adjusted_hours override). This is the single source of truth established in Phase 5.
**Warning signs:** Total hours seem inflated compared to shift count.

### Pitfall 4: N+1 Queries in Drilldowns
**What goes wrong:** Fetching turf/canvasser/session details in a loop after the aggregation query.
**Why it happens:** Developer separates aggregation from entity lookup.
**How to avoid:** Join entity tables (turfs, users) directly in the aggregation query's SELECT and GROUP BY.
**Warning signs:** Drilldown endpoints are slow; many SQL queries in logs.

### Pitfall 5: Missing RLS Context on Dashboard Queries
**What goes wrong:** Dashboard returns data from all campaigns or no data.
**Why it happens:** Forgetting to call `set_campaign_context()` before aggregation queries.
**How to avoid:** Same pattern as all other endpoints: call `set_campaign_context(db, str(campaign_id))` at the start of each route handler.
**Warning signs:** Query returns unexpected row counts.

### Pitfall 6: Date Filter Timezone Mismatch
**What goes wrong:** `start_date` as a `date` compared to `created_at` as a `datetime` produces off-by-one errors at day boundaries.
**Why it happens:** Naive date-to-datetime conversion.
**How to avoid:** Convert `date` to `datetime` at start of day (time.min) for start and end of day (time.max) or next day start for end. Be consistent with UTC.
**Warning signs:** Data from boundary dates is included/excluded incorrectly.

### Pitfall 7: Canvassing Join Chain Complexity
**What goes wrong:** Getting from VoterInteraction to Turf requires traversing payload.walk_list_id (JSONB) -> walk_lists -> turf_id. The JSONB UUID needs casting.
**Why it happens:** walk_list_id is in the JSONB payload, not a foreign key column.
**How to avoid:** Cast the JSONB text to UUID: `VoterInteraction.payload["walk_list_id"].astext.cast(UUID)`. Alternatively, join through WalkListEntry (voter_id match) then WalkList then Turf, but this may be less precise.
**Warning signs:** Join produces no rows or cartesian products.

## Code Examples

### Dashboard Route Handler Pattern
```python
# Source: Follows app/api/v1/volunteers.py pattern
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.rls import set_campaign_context
from app.db.session import get_db

router = APIRouter()


@router.get("/campaigns/{campaign_id}/dashboard/canvassing")
async def get_canvassing_summary(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    # ... call service
```

### Pydantic Schema Pattern
```python
# Source: Follows app/schemas/common.py pattern
from __future__ import annotations

from app.schemas.common import BaseSchema


class OutcomeBreakdown(BaseSchema):
    supporter: int = 0
    undecided: int = 0
    opposed: int = 0
    not_home: int = 0
    refused: int = 0
    moved: int = 0
    deceased: int = 0
    come_back_later: int = 0
    inaccessible: int = 0


class CanvassingSummary(BaseSchema):
    doors_knocked: int = 0
    contacts_made: int = 0
    contact_rate: float = 0.0
    outcomes: OutcomeBreakdown = OutcomeBreakdown()


class TurfBreakdown(BaseSchema):
    turf_id: str
    turf_name: str
    doors_knocked: int = 0
    contacts_made: int = 0
    outcomes: OutcomeBreakdown = OutcomeBreakdown()
```

### SQLAlchemy Aggregation with JSONB
```python
# Source: SQLAlchemy 2.0 docs + existing project patterns
from sqlalchemy import func, select, cast
from sqlalchemy.dialects.postgresql import UUID as PgUUID

# Count door knocks by result_code from JSONB payload
stmt = (
    select(
        func.count().label("doors_knocked"),
        func.count()
        .filter(
            VoterInteraction.payload["result_code"].astext.in_([
                "supporter", "undecided", "opposed", "refused"
            ])
        )
        .label("contacts_made"),
    )
    .where(
        VoterInteraction.campaign_id == campaign_id,
        VoterInteraction.type == InteractionType.DOOR_KNOCK,
    )
)

# Join to turf via JSONB walk_list_id
stmt = (
    select(
        Turf.id, Turf.name,
        func.count(VoterInteraction.id).label("doors_knocked"),
    )
    .select_from(VoterInteraction)
    .join(
        WalkList,
        WalkList.id == cast(
            VoterInteraction.payload["walk_list_id"].astext, PgUUID
        ),
    )
    .join(Turf, WalkList.turf_id == Turf.id)
    .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
    .group_by(Turf.id, Turf.name)
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Materialized views for dashboards | Live aggregation queries | Project decision | Simpler, no cache invalidation |
| Stored counters/denormalized totals | On-read computation | Phase 5 pattern | Single source of truth |
| Separate API for personal stats | Unified /my-stats endpoint | Phase 6 decision | Better UX for volunteers |

**Deprecated/outdated:**
- None applicable. This phase uses only established project patterns.

## Open Questions

1. **JSONB walk_list_id casting performance**
   - What we know: VoterInteraction.payload contains walk_list_id as a JSON string. Joining via CAST to UUID should work but may not use indexes.
   - What's unclear: Whether PostgreSQL can efficiently join on a CAST of a JSONB field.
   - Recommendation: Test query EXPLAIN plans. If slow, consider a GIN index on `payload->'walk_list_id'` or a partial index. Alternatively, the by-turf breakdown could query through WalkListEntry.voter_id matching VoterInteraction.voter_id + WalkList join, avoiding the JSONB join entirely.

2. **Contact definition for phone banking**
   - What we know: CallResultCode has ANSWERED, NO_ANSWER, BUSY, WRONG_NUMBER, VOICEMAIL, REFUSED, DECEASED, DISCONNECTED.
   - What's unclear: Should REFUSED count as a "contact reached"? The voter was reached but refused to talk.
   - Recommendation: Count ANSWERED and REFUSED as "contacts reached" (person was reached). VOICEMAIL, NO_ANSWER, BUSY, WRONG_NUMBER, DISCONNECTED, DECEASED are non-contacts.

3. **Index needs**
   - What we know: voter_interactions has no index on (campaign_id, type). The table could grow large.
   - What's unclear: Whether existing RLS + sequential scan is sufficient at expected data volumes.
   - Recommendation: Add a migration with indexes on `voter_interactions(campaign_id, type, created_at)` and `shift_volunteers(shift_id, check_in_at)`. Low risk, high benefit.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | pyproject.toml [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Canvassing summary returns doors knocked, contacts, outcomes | unit | `uv run pytest tests/unit/test_dashboard_canvassing.py -x` | No -- Wave 0 |
| DASH-01 | Canvassing by-turf and by-canvasser breakdowns | unit | `uv run pytest tests/unit/test_dashboard_canvassing.py -x` | No -- Wave 0 |
| DASH-02 | Phone banking summary returns calls, contacts, outcomes | unit | `uv run pytest tests/unit/test_dashboard_phone_banking.py -x` | No -- Wave 0 |
| DASH-02 | Phone banking by-session, by-caller, by-call-list breakdowns | unit | `uv run pytest tests/unit/test_dashboard_phone_banking.py -x` | No -- Wave 0 |
| DASH-03 | Volunteer summary returns active count, shifts, hours | unit | `uv run pytest tests/unit/test_dashboard_volunteers.py -x` | No -- Wave 0 |
| DASH-03 | Volunteer by-volunteer and by-shift breakdowns | unit | `uv run pytest tests/unit/test_dashboard_volunteers.py -x` | No -- Wave 0 |
| ALL | Overview endpoint combines all three domains | unit | `uv run pytest tests/unit/test_dashboard_overview.py -x` | No -- Wave 0 |
| ALL | My-stats returns personal activity across domains | unit | `uv run pytest tests/unit/test_dashboard_my_stats.py -x` | No -- Wave 0 |
| ALL | Date filtering works correctly | unit | `uv run pytest tests/unit/test_dashboard_canvassing.py::test_date_filter -x` | No -- Wave 0 |
| ALL | Manager+ role required for campaign dashboards | unit | (tested via route handler mocking) | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_dashboard_*.py -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_dashboard_canvassing.py` -- covers DASH-01 service logic
- [ ] `tests/unit/test_dashboard_phone_banking.py` -- covers DASH-02 service logic
- [ ] `tests/unit/test_dashboard_volunteers.py` -- covers DASH-03 service logic
- [ ] `tests/unit/test_dashboard_overview.py` -- covers overview + my-stats
- No framework install needed (pytest already configured)
- No conftest changes needed (unit tests use AsyncMock pattern)

## Sources

### Primary (HIGH confidence)
- Project codebase -- all models, services, routes, schemas, and tests examined directly
- `app/models/voter_interaction.py` -- VoterInteraction schema, InteractionType enum, JSONB payload structure
- `app/models/walk_list.py` -- WalkList, WalkListEntry, WalkListCanvasser, DoorKnockResult enum
- `app/models/call_list.py` -- CallList, CallListEntry, CallResultCode enum
- `app/models/phone_bank.py` -- PhoneBankSession, SessionCaller
- `app/models/shift.py` -- Shift, ShiftVolunteer, ShiftType, check_in/check_out pattern
- `app/models/volunteer.py` -- Volunteer, VolunteerStatus
- `app/schemas/common.py` -- BaseSchema, PaginatedResponse pattern
- `app/core/security.py` -- CampaignRole, require_role()
- `app/db/rls.py` -- set_campaign_context()

### Secondary (MEDIUM confidence)
- SQLAlchemy 2.0 JSONB access patterns (`.astext`, `.cast()`) -- from training data, consistent with project's existing JSONB usage

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing infrastructure
- Architecture: HIGH -- follows established service/route/schema patterns exactly
- Pitfalls: HIGH -- derived from examining actual model structures and JSONB payload conventions
- Query patterns: MEDIUM -- JSONB join casting needs runtime validation

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- no external dependencies)
