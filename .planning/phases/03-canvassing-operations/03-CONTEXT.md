# Phase 3: Canvassing Operations - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Campaign managers can define geographic turfs, generate walk lists targeting specific voter segments, and canvassers can record door-knock outcomes and survey responses in the field. Turf cutting uses PostGIS spatial queries. Survey scripts are campaign-level reusable entities designed for reuse by Phase 4 (phone banking). GPS routing optimization (CANV-10), branched survey logic (CANV-09), real-time monitoring (CANV-11), and offline sync (CANV-12) are deferred to v2.

</domain>

<decisions>
## Implementation Decisions

### Turf Definition & Spatial Model
- Turfs defined as GeoJSON polygons — campaign manager draws polygon on a map client, sends GeoJSON geometry to API
- Stored as PostGIS `GEOMETRY(Polygon, 4326)` column on a `turfs` table
- Add a PostGIS `GEOMETRY(Point, 4326)` column to the `voters` table, populated from existing `latitude`/`longitude` on import and via migration backfill
- Spatial index (GiST) on both voter points and turf polygons for fast `ST_Contains` queries
- Voters can belong to multiple turfs (overlapping turfs allowed) — membership determined by spatial query, not a FK
- Turf metadata: name (required), optional description, status enum (draft/active/completed)
- geoalchemy2 dependency to be added for SQLAlchemy PostGIS integration

### Walk List Generation
- Walk lists are **frozen snapshots** — generated once from turf + optional voter list filter, voter set does not change after creation
- Generation input: turf_id (required) + optional voter_list_id (reference to Phase 2 target universe). No filter = all voters in turf
- Voters ordered by **street address sort** — sort by street name, then house number. Household clustering per CANV-03 groups same-address voters as a single stop
- Walk list entries table with per-entry status: pending/visited/skipped. Door-knock recording auto-updates entry status to visited
- Walk list tracks completion stats (X of Y entries visited)
- Walk list can be assigned to **multiple canvassers** — shared walk list model, no per-entry locking

### Door-Knock Outcomes
- Result codes enum: not_home, refused, supporter, undecided, opposed, moved, deceased, come_back_later, inaccessible
- Each door knock recorded as a `VoterInteraction` event with type `DOOR_KNOCK` — extends existing append-only interaction log
- JSONB payload includes: result_code, walk_list_id, notes (optional), attempt_number (derived from event count)
- **Unlimited contact attempts** per voter — each knock is a new interaction event, no max limit
- Latest result code is the "current" status for reporting purposes
- Canvasser assignment is **via walk list, not turf** — walk lists have an assigned_to field (but multiple canvassers can share a list)

### Survey Engine
- Survey scripts are **campaign-level reusable entities** — not tied to a specific turf or walk list
- Walk lists reference a script_id (optional). Same script reusable across multiple walk lists and in Phase 4 phone banking
- Separate `survey_questions` table: script_id, position (ordering integer), question_text, question_type enum (multiple_choice/scale/free_text), options JSONB (choices for MC, range for scale)
- **Linear scripts only** in v1 — questions presented in position order. Branched/conditional logic deferred to v2 (CANV-09)
- Script lifecycle: draft (editable, not assignable) → active (locked, can be assigned to walk lists) → archived (historical, not assignable)
- Responses stored in `survey_responses` table: voter_id, question_id, script_id, answer_value, answered_by, answered_at
- Each survey completion also emits a `SURVEY_RESPONSE` interaction event on the voter's history timeline (dual storage: queryable responses + audit trail)

### Claude's Discretion
- Exact GeoJSON validation approach and error handling for invalid polygons
- Walk list splitting strategy when a turf has too many voters for one canvasser
- Household clustering algorithm (exact address matching vs fuzzy)
- Survey question validation rules (min/max options for MC, scale bounds)
- Database indexing strategy beyond spatial indexes
- Walk list entry ordering tiebreakers within same street

</decisions>

<specifics>
## Specific Ideas

- Phase 4 (Phone Banking) explicitly reuses "the same survey engine" (PHONE-04) — the survey model must be decoupled from canvassing (no canvassing-specific FKs on survey tables)
- InteractionType enum uses `native_enum=False` (VARCHAR storage) — adding DOOR_KNOCK and SURVEY_RESPONSE values only requires an Alembic migration, no PostgreSQL enum type change
- Walk list assignment model (multiple canvassers per list) supports the common campaign scenario where a shift team works a turf together

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VoterInteraction` model (app/models/voter_interaction.py): Append-only event log with JSONB payload — extend InteractionType enum for DOOR_KNOCK, SURVEY_RESPONSE
- `InteractionType` enum: Uses `native_enum=False` for easy extension via Alembic
- `build_voter_query()` (standalone function): Composable query builder — reuse for walk list generation targeting
- `VoterListService`: Manages voter lists/target universes — walk list generation can reference list IDs for filtering
- `BaseSchema` (app/schemas/common.py): Base Pydantic model for all schemas
- `PaginatedResponse[T]` (app/schemas/common.py): Generic pagination — use for walk list entries, survey responses
- `set_campaign_context()` (app/db/rls.py): RLS context setter — all new tables need campaign_id + RLS policies
- `CampaignRole` enum (app/core/security.py): Role hierarchy — manager+ for turf/list creation, volunteer+ for recording

### Established Patterns
- SQLAlchemy async with `mapped_column` type annotations
- RFC 9457 Problem Details for errors
- Cursor-based pagination
- `from __future__ import annotations` in all modules
- `native_enum=False` on StrEnum columns for migration extensibility
- Service class pattern for business logic (InviteService, VoterService, etc.)
- Composition pattern for emitting interaction events from other services

### Integration Points
- Voters table: add GEOMETRY(Point, 4326) column via Alembic migration + backfill from lat/long
- InteractionType enum: add DOOR_KNOCK, SURVEY_RESPONSE values
- New routes mount via `app/api/v1/router.py`
- RLS policies on all new tables (turfs, walk_lists, walk_list_entries, survey_scripts, survey_questions, survey_responses)
- geoalchemy2 + shapely dependencies to add to pyproject.toml
- PostGIS extension must be enabled in database (CREATE EXTENSION IF NOT EXISTS postgis)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-canvassing-operations*
*Context gathered: 2026-03-09*
