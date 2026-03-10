# Phase 6: Operational Dashboards - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

API endpoints providing aggregated field operations data for campaign leadership. Three domains: canvassing progress (DASH-01), phone banking progress (DASH-02), and volunteer activity summary (DASH-03). Read-only aggregation over data created by Phases 3-5. No new write operations. No new data models — queries aggregate from existing tables (voter_interactions, walk_lists, call_lists, phone_bank_sessions, shifts, shift_volunteers, volunteers).

</domain>

<decisions>
## Implementation Decisions

### Endpoint Structure
- Summary + drilldown pattern across all domains: one summary endpoint per domain returns campaign-wide totals, separate endpoints for dimensional breakdowns
- Campaign overview endpoint (`/dashboard/overview`) combines top-line numbers from all three domains in a single response
- Personal stats endpoint (`/dashboard/my-stats`) returns the authenticated user's own activity across all domains
- Full endpoint map:
  - `GET /dashboard/overview` — cross-domain highlights
  - `GET /dashboard/canvassing` — campaign-wide canvassing totals (doors, contacts, outcome breakdown)
  - `GET /dashboard/canvassing/by-turf` — per-turf breakdown
  - `GET /dashboard/canvassing/by-canvasser` — per-canvasser breakdown
  - `GET /dashboard/phone-banking` — campaign-wide phone banking totals (calls, contacts, outcome breakdown)
  - `GET /dashboard/phone-banking/by-session` — per-session breakdown
  - `GET /dashboard/phone-banking/by-caller` — per-caller breakdown
  - `GET /dashboard/phone-banking/by-call-list` — per-call-list completion stats
  - `GET /dashboard/volunteers` — campaign-wide volunteer totals (active count, scheduled shifts, total hours)
  - `GET /dashboard/volunteers/by-volunteer` — per-volunteer stats
  - `GET /dashboard/volunteers/by-shift` — per-shift fill rates and completion

### Filtering & Time Ranges
- Optional `start_date`/`end_date` query parameters on ALL endpoints including overview — consistent API contract
- No dates = all-time campaign totals
- Drilldown-specific filters: by-turf accepts `turf_id`, by-session accepts `session_id`, by-shift accepts `shift_type` enum filter
- Cursor-based pagination on all drilldown list endpoints (consistent with existing PaginatedResponse pattern)

### Aggregation Approach
- Live queries on every request — aggregate directly from source tables, no materialized views or caching
- Consistent with Phase 5's on-read pattern for volunteer hours (no denormalized counters)
- Direct SQLAlchemy queries against existing models — no new database views
- Separate services per domain: CanvassingDashboardService, PhoneBankingDashboardService, VolunteerDashboardService

### Endpoint Access & Roles
- Campaign-wide dashboard endpoints: manager+ role required (owner, admin, manager)
- `/dashboard/my-stats`: any campaign member (volunteer+ role) — returns personal activity for the authenticated user
- `/my-stats` uses auth user_id to query VoterInteractions.created_by, ShiftVolunteer records, and SessionCaller records — works for any campaign member, no Volunteer record required
- Returns zeros if no activity found (not 404)
- Standard RLS — campaign context scoped as usual, no cross-campaign views (deferred to v2 per VOTER-13)

### Claude's Discretion
- Database indexes for aggregation query performance (likely candidates: voter_interactions(type, campaign_id), shift_volunteers(check_in_at))
- Exact Pydantic response schema field names and nesting
- Whether to add a migration for indexes or rely on existing ones
- Error handling for edge cases (no turfs, no sessions, etc.)
- Query optimization strategies (e.g., subqueries vs joins for breakdowns)

</decisions>

<specifics>
## Specific Ideas

- The overview endpoint is designed as a "pulse check" — campaign leadership can see top-line numbers from all three operational domains without hitting 3 separate endpoints
- Phone banking gets three drilldown dimensions (session, caller, call-list) vs two for canvassing (turf, canvasser) and volunteers (volunteer, shift) — reflects the richer operational structure of phone banking
- `/my-stats` is motivating for volunteers — they can see their own contribution without accessing campaign-wide data

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VoterInteraction` model (app/models/voter_interaction.py): Source table for canvassing (DOOR_KNOCK) and phone banking (PHONE_CALL) metrics — JSONB payload contains result_code, walk_list_id, call_list_id, session_id
- `PaginatedResponse[T]` (app/schemas/common.py): Generic cursor pagination — use for all drilldown endpoints
- `BaseSchema` (app/schemas/common.py): Base Pydantic model for dashboard response schemas
- `set_campaign_context()` (app/db/rls.py): RLS context setter — dashboard queries automatically scoped to campaign
- `CampaignRole` enum (app/core/security.py): Role hierarchy for access control — manager+ for dashboards, volunteer+ for my-stats
- Walk list models (app/models/walk_list.py): WalkListEntry status for completion tracking, WalkListCanvasser for canvasser-to-turf mapping
- Phone bank models (app/models/phone_bank.py): CallListEntry, PhoneBankSession, SessionCaller for call metrics
- Volunteer models (app/models/volunteer.py, app/models/shift.py): Volunteer status, ShiftVolunteer check-in/out for hours

### Established Patterns
- Service class pattern for business logic — one service per domain
- On-read aggregation (Phase 5 volunteer hours computed from timestamps, not stored)
- native_enum=False on StrEnum columns
- RFC 9457 Problem Details for errors
- Cursor-based pagination
- `from __future__ import annotations` in all modules

### Integration Points
- New services: CanvassingDashboardService, PhoneBankingDashboardService, VolunteerDashboardService
- New routes mount via app/api/v1/router.py under /dashboard prefix
- No new models or migrations required (read-only aggregation) — possible index-only migration
- Queries touch: voter_interactions, walk_lists, walk_list_entries, walk_list_canvassers, turfs, call_lists, call_list_entries, phone_bank_sessions, session_callers, volunteers, shifts, shift_volunteers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-operational-dashboards*
*Context gathered: 2026-03-09*
