---
phase: 23-schema-foundation
plan: 01
subsystem: database
tags: [sqlalchemy, alembic, pydantic, postgres, voter-model, migration]

# Dependency graph
requires: []
provides:
  - Alembic migration 006 with column renames, 22 new columns, indexes, VoterPhone unique constraint
  - Voter ORM model with registration/mailing address, propensity, demographics, household sections
  - VoterPhone model with UniqueConstraint on (campaign_id, voter_id, value)
  - Updated Pydantic schemas (VoterResponse, VoterCreateRequest, VoterUpdateRequest) with all new fields
  - VoterFilter schema with registration_ prefix on address filter fields
affects: [23-02, 24-import-pipeline, 25-filter-enhancements, 26-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registration_ prefix for voter registration address columns"
    - "mailing_ prefix for voter mailing address columns"
    - "SmallInteger for bounded numeric fields (propensity 0-100, household_size 1-20)"
    - "Defensive dedup DELETE before UniqueConstraint in migration"

key-files:
  created:
    - alembic/versions/006_expand_voter_model.py
  modified:
    - app/models/voter.py
    - app/models/voter_contact.py
    - app/schemas/voter.py
    - app/schemas/voter_filter.py

key-decisions:
  - "Single migration for all renames + adds (simpler than splitting)"
  - "Mailing indexes (zip, city, state) created now for Phase 25 filter queries"
  - "No Pydantic aliases for backward compat -- frontend is Phase 26 work"
  - "cell_phone_confidence placed in Demographics section (phone attribute, not contact record)"

patterns-established:
  - "registration_ prefix for registration address fields across model, schema, and filter"
  - "Section comments in model and schemas: Registration Address, Mailing Address, Propensity Scores, Demographics, Household"

requirements-completed: [VMOD-01, VMOD-02, VMOD-03, VMOD-04, VMOD-05, VMOD-06, VMOD-07, VMOD-08, VMOD-09, VMOD-10]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 23 Plan 01: Schema Foundation Summary

**Alembic migration 006 with 6 column renames + 22 new columns, expanded Voter/VoterPhone ORM models, and updated Pydantic schemas for registration/mailing address, propensity scores, demographics, and household fields**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T21:29:31Z
- **Completed:** 2026-03-13T21:32:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Voter model expanded from ~30 to ~54 columns with organized sections (registration address, mailing address, propensity scores, demographics, household)
- Alembic migration 006 handles column renames (metadata-only), new column adds (all nullable), index updates, defensive VoterPhone dedup, and L2 mapping template update
- All 3 Pydantic voter schemas (Response, Create, Update) and VoterFilter updated with registration_ prefix and all new fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Alembic migration and update ORM models** - `8cd2762` (feat)
2. **Task 2: Update Pydantic voter schemas and voter filter** - `a4d1977` (feat)

## Files Created/Modified
- `alembic/versions/006_expand_voter_model.py` - Migration with renames, 22 column adds, index changes, VoterPhone constraint, L2 template update
- `app/models/voter.py` - Expanded Voter model with ~24 new/renamed columns in organized sections
- `app/models/voter_contact.py` - VoterPhone with UniqueConstraint on (campaign_id, voter_id, value)
- `app/schemas/voter.py` - VoterResponse, VoterCreateRequest, VoterUpdateRequest with all new and renamed fields
- `app/schemas/voter_filter.py` - Renamed city/state/zip_code/county to registration_ prefix

## Decisions Made
- Single migration for all renames + adds -- simpler than splitting into multiple migrations
- Created mailing indexes (zip, city, state) now to avoid a second migration for Phase 25 filter queries
- No Pydantic field aliases for backward compatibility -- frontend updates are Phase 26 scope
- cell_phone_confidence placed in Demographics section of model (it's a voter attribute, not a VoterPhone record attribute)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation complete: all new columns exist in model, migration, and schemas
- Plan 02 (downstream code updates) can proceed: voter service, import service, walk_list, turf, and test files need to reference new registration_ column names
- Frontend will break on field name changes until Phase 26

## Self-Check: PASSED

All artifacts verified:
- alembic/versions/006_expand_voter_model.py: FOUND
- .planning/phases/23-schema-foundation/23-01-SUMMARY.md: FOUND
- Commit 8cd2762: FOUND
- Commit a4d1977: FOUND

---
*Phase: 23-schema-foundation*
*Completed: 2026-03-13*
