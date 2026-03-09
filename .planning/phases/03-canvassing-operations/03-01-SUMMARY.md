---
phase: 03-canvassing-operations
plan: 01
subsystem: database
tags: [postgis, geoalchemy2, shapely, sqlalchemy, rls, spatial, canvassing]

# Dependency graph
requires:
  - phase: 02-voter-data-import
    provides: "Voter model with lat/long, VoterList model, InteractionType enum, RLS patterns"
provides:
  - "Turf model with PostGIS Polygon boundary"
  - "WalkList, WalkListEntry, WalkListCanvasser models"
  - "SurveyScript, SurveyQuestion, SurveyResponse models (reusable for Phase 4)"
  - "DoorKnockResult and WalkListEntryStatus enums"
  - "InteractionType DOOR_KNOCK and SURVEY_RESPONSE values"
  - "Voter geom Point column with GiST spatial index"
  - "Pydantic schemas for turfs, walk lists, surveys, canvass operations"
  - "Alembic migration 003 with PostGIS extension, all tables, RLS policies"
affects: [03-canvassing-operations, 04-phone-banking]

# Tech tracking
tech-stack:
  added: [geoalchemy2, shapely, numpy]
  patterns:
    - "PostGIS Geometry columns via geoalchemy2 Mapped[WKBElement]"
    - "geoalchemy2 alembic_helpers for migration env.py"
    - "RLS subquery isolation for child tables without direct campaign_id"
    - "Survey engine decoupled from canvassing (no turf/walk_list FKs)"

key-files:
  created:
    - app/models/turf.py
    - app/models/walk_list.py
    - app/models/survey.py
    - app/schemas/turf.py
    - app/schemas/walk_list.py
    - app/schemas/survey.py
    - app/schemas/canvass.py
    - alembic/versions/003_canvassing_operations.py
    - tests/integration/test_spatial.py
  modified:
    - app/models/voter.py
    - app/models/voter_interaction.py
    - app/db/base.py
    - alembic/env.py
    - pyproject.toml
    - tests/unit/test_turfs.py

key-decisions:
  - "Survey models have no canvassing-specific FKs (reusable by Phase 4 phone banking)"
  - "DoorKnockResult enum placed in walk_list.py (used by walk list entry context)"
  - "Voter geom spatial_index=False in model; GiST index created explicitly in migration"
  - "RLS on child tables (entries, canvassers, questions) uses subquery through parent"
  - "geoalchemy2 alembic_helpers added to both offline and online migration contexts"

patterns-established:
  - "PostGIS geometry columns: Mapped[WKBElement] with geoalchemy2.Geometry type"
  - "Spatial index: created explicitly in migration with postgresql_using='gist'"
  - "Geom backfill: UPDATE SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)"
  - "Child table RLS: subquery through parent's campaign_id column"

requirements-completed: [CANV-01, CANV-02, CANV-03, CANV-04, CANV-05, CANV-06, CANV-07, CANV-08]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 3 Plan 01: Canvassing Data Models Summary

**PostGIS-backed canvassing models (turfs, walk lists, surveys) with spatial indexing, Pydantic schemas, and RLS-isolated migration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T19:59:00Z
- **Completed:** 2026-03-09T20:05:27Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Created 7 new SQLAlchemy models: Turf, WalkList, WalkListEntry, WalkListCanvasser, SurveyScript, SurveyQuestion, SurveyResponse
- Added PostGIS geom column to Voter model with GiST spatial index and lat/long backfill
- Created Pydantic schemas for all canvassing operations (turfs, walk lists, surveys, door knocks)
- Built migration 003 with PostGIS extension, 7 new tables, and RLS policies on all tables
- Survey engine intentionally decoupled from canvassing (no turf/walk_list FKs) for Phase 4 reuse

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all canvassing models and Pydantic schemas** - `1bffe7b` (feat)
2. **Task 2: Create Alembic migration with PostGIS, voter geom backfill, all tables, and RLS** - `a0b33ec` (feat)

## Files Created/Modified
- `app/models/turf.py` - Turf model with PostGIS Polygon boundary, TurfStatus enum
- `app/models/walk_list.py` - WalkList, WalkListEntry, WalkListCanvasser models, DoorKnockResult enum
- `app/models/survey.py` - SurveyScript, SurveyQuestion, SurveyResponse models (reusable)
- `app/models/voter.py` - Added geom: Mapped[WKBElement | None] column
- `app/models/voter_interaction.py` - Added DOOR_KNOCK, SURVEY_RESPONSE to InteractionType
- `app/db/base.py` - Added model imports for Alembic detection
- `app/schemas/turf.py` - TurfCreate, TurfUpdate, TurfResponse, TurfListResponse
- `app/schemas/walk_list.py` - WalkListCreate, WalkListResponse, WalkListEntryResponse, CanvasserAssignment
- `app/schemas/survey.py` - ScriptCreate, ScriptUpdate, QuestionCreate, ResponseCreate, SurveyResponseOut
- `app/schemas/canvass.py` - DoorKnockCreate, DoorKnockResponse
- `alembic/env.py` - Added geoalchemy2 alembic_helpers configuration
- `alembic/versions/003_canvassing_operations.py` - Full migration with PostGIS, tables, RLS
- `tests/unit/test_turfs.py` - 5 unit tests for turf model and schema validation
- `tests/integration/test_spatial.py` - 4 spatial integration tests (PostGIS, geom, ST_Contains, GiST)
- `pyproject.toml` - Added geoalchemy2, shapely dependencies

## Decisions Made
- Survey models have no canvassing-specific FKs (no turf_id, no walk_list_id) to enable reuse by Phase 4 phone banking
- DoorKnockResult enum lives in walk_list.py since it is contextually tied to walk list entry outcomes
- Voter geom has spatial_index=False in model; GiST index created explicitly in migration for precise control
- RLS on child tables (walk_list_entries, walk_list_canvassers, survey_questions) uses subquery through parent table
- geoalchemy2 alembic_helpers configured in both offline and online migration contexts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Database not available in execution environment (no Docker/container runtime). Migration file verified syntactically; integration tests written but require running PostgreSQL with PostGIS to execute. Unit tests (5) all pass.

## User Setup Required
None - no external service configuration required. Run `docker compose up -d postgres` then `uv run alembic upgrade head` to apply migration.

## Next Phase Readiness
- All data models ready for Plan 02 (turf/walk list service layer) and Plan 03 (API endpoints)
- Survey engine ready for Phase 4 phone banking reuse
- Integration tests ready to run once database is available

## Self-Check: PASSED

All 9 created files verified present. Both task commits (1bffe7b, a0b33ec) verified in git log.

---
*Phase: 03-canvassing-operations*
*Completed: 2026-03-09*
