---
phase: 23-schema-foundation
plan: 02
subsystem: api
tags: [sqlalchemy, pydantic, voter-model, import-service, walk-list, turf, field-rename]

# Dependency graph
requires:
  - phase: 23-01
    provides: Voter ORM model with registration_ column renames and 22 new columns
provides:
  - All downstream services reference new registration_ column names
  - CANONICAL_FIELDS with 22 new field entries and aliases for import pipeline
  - _VOTER_COLUMNS set with all new column names for field mapping validation
  - Updated unit tests passing with renamed fields (284 tests green)
affects: [24-import-pipeline, 25-filter-enhancements, 26-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Old address field names (address_line1, city, state, zip_code, county) kept as aliases in CANONICAL_FIELDS for backward-compatible CSV import"
    - "registration_ prefix used consistently in service layer filter references, sort keys, and household key generation"

key-files:
  created: []
  modified:
    - app/services/voter.py
    - app/services/import_service.py
    - app/services/walk_list.py
    - app/services/turf.py
    - tests/unit/test_voter_search.py
    - tests/unit/test_field_mapping.py
    - tests/unit/test_import_service.py
    - tests/unit/test_walk_lists.py

key-decisions:
  - "Old field names kept as aliases in CANONICAL_FIELDS so existing CSV files with headers like 'address_line1' or 'city' still map correctly"

patterns-established:
  - "CANONICAL_FIELDS aliases: old column names remain as aliases mapping to new canonical names"
  - "Service layer references Voter.registration_city not Voter.city for all query/filter operations"

requirements-completed: [VMOD-08, VMOD-09]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 23 Plan 02: Downstream Code Updates Summary

**Updated voter query builder, import pipeline CANONICAL_FIELDS with 22 new entries, walk list sorting, and turf household key to use registration_ column names with all 284 unit tests passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T21:35:02Z
- **Completed:** 2026-03-13T21:40:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Voter query builder (build_voter_query) references Voter.registration_city/state/zip/county instead of old names
- Import service CANONICAL_FIELDS expanded from 22 to 43 entries, covering all new voter model columns with reasonable aliases for CSV auto-mapping
- _VOTER_COLUMNS set updated with all 45 column names (removed 6 old, added 27 new)
- Walk list sort key and turf household_key use registration_line1 and registration_zip
- All 284 unit tests pass with updated field references

## Task Commits

Each task was committed atomically:

1. **Task 1: Update downstream services (voter, import, walk_list, turf)** - `728965e` (feat)
2. **Task 2: Update existing unit tests for renamed fields** - `756828f` (test)

## Files Created/Modified
- `app/services/voter.py` - build_voter_query uses registration_city/state/zip/county
- `app/services/import_service.py` - CANONICAL_FIELDS keys renamed + 21 new entries; _VOTER_COLUMNS updated
- `app/services/walk_list.py` - Sort key uses v.registration_line1
- `app/services/turf.py` - household_key uses voter.registration_line1 and registration_zip
- `tests/unit/test_voter_search.py` - VoterFilter constructors use registration_ fields
- `tests/unit/test_field_mapping.py` - Assertions expect registration_ canonical names
- `tests/unit/test_import_service.py` - basic_mapping fixture uses registration_city
- `tests/unit/test_walk_lists.py` - SimpleNamespace mocks use registration_line1/zip

## Decisions Made
- Old field names (address_line1, city, state, zip_code, county) kept as aliases in CANONICAL_FIELDS so existing CSV files with those headers still import correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test_walk_lists.py mock data using old field names**
- **Found during:** Task 2 (unit test updates)
- **Issue:** test_generate_walk_list_from_turf, test_household_clustering, and test_household_key_normalization used SimpleNamespace mocks with address_line1/zip_code attributes that no longer exist on the Voter model
- **Fix:** Updated all 3 tests to use registration_line1 and registration_zip attributes
- **Files modified:** tests/unit/test_walk_lists.py
- **Verification:** uv run pytest tests/unit/ -x -q passes (284 tests)
- **Committed in:** 756828f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Auto-fix was necessary for correctness -- the plan listed only 3 test files but test_walk_lists.py also had old field references. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 23 (Schema Foundation) complete: all model, schema, service, and test code uses new column names
- Phase 24 (Import Pipeline) can proceed: CANONICAL_FIELDS has entries for all new columns with import aliases
- Phase 25 (Filter Enhancements) can proceed: VoterFilter and build_voter_query use registration_ fields
- Frontend will break on field name changes until Phase 26

## Self-Check: PASSED

All artifacts verified:
- app/services/voter.py: FOUND
- app/services/import_service.py: FOUND
- app/services/walk_list.py: FOUND
- app/services/turf.py: FOUND
- tests/unit/test_voter_search.py: FOUND
- tests/unit/test_field_mapping.py: FOUND
- tests/unit/test_import_service.py: FOUND
- tests/unit/test_walk_lists.py: FOUND
- Commit 728965e: FOUND
- Commit 756828f: FOUND

---
*Phase: 23-schema-foundation*
*Completed: 2026-03-13*
