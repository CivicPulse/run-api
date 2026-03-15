---
phase: 27-wire-advanced-filters-to-backend
plan: 01
subsystem: api
tags: [fastapi, pydantic, sqlalchemy, cursor-pagination, sorting]

# Dependency graph
requires:
  - phase: 25-voter-filter-backend
    provides: build_voter_query with all 32 filter conditions
  - phase: 23-voter-model-rename
    provides: Voter model with renamed fields and mailing columns
provides:
  - VoterSearchBody Pydantic schema with Literal-validated sort_by and sort_dir
  - POST /voters/search accepting VoterSearchBody wrapper
  - Dynamic sort column support in search_voters with NULLS LAST
  - Dynamic cursor encoding/decoding for any sort column type
affects: [27-02-frontend-hooks, 27-03-e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic cursor pagination, Literal type validation for sort columns]

key-files:
  created: []
  modified:
    - app/schemas/voter_filter.py
    - app/api/v1/voters.py
    - app/services/voter.py
    - tests/unit/test_voter_search.py

key-decisions:
  - "SORTABLE_COLUMNS uses Literal type with 12 columns for compile-time validation"
  - "encode_cursor/decode_cursor as module-level helpers for independent testability"
  - "NULLS LAST for ascending sort only (PostgreSQL default puts NULLs first for DESC which is acceptable)"
  - "NULL cursor values use is_(None)/is_not(None) SQL comparisons instead of equality"

patterns-established:
  - "Dynamic cursor encoding: sort_value|id format with type-aware decode"
  - "VoterSearchBody wrapper pattern: filters + pagination + sorting in single body"

requirements-completed: [FILT-01, FILT-02, FILT-03, FILT-04, FILT-05]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 27 Plan 01: VoterSearchBody Schema and Dynamic Sort Summary

**VoterSearchBody Pydantic schema with Literal-validated sort columns, dynamic cursor pagination, and POST endpoint accepting wrapped filters**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T03:35:40Z
- **Completed:** 2026-03-15T03:39:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- VoterSearchBody schema validates sort_by against 12-column whitelist using Literal type
- POST /voters/search updated from bare VoterFilter to VoterSearchBody (cursor/limit/sort now in body)
- search_voters supports dynamic sorting by any whitelisted column with NULLS LAST for ascending
- Dynamic cursor encode/decode handles string, integer, datetime, and NULL value types
- GET /voters endpoint completely unchanged (backward compatible)
- 24 new unit tests (8 schema + 16 cursor) all passing, 414 total unit tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: VoterSearchBody schema and POST endpoint update** - `e2f63e5` (feat)
2. **Task 2: Dynamic sort and cursor encoding in search_voters** - `a9c4154` (feat)

_Both tasks used TDD: RED (failing tests) -> GREEN (implementation) -> verified_

## Files Created/Modified
- `app/schemas/voter_filter.py` - Added SORTABLE_COLUMNS Literal type and VoterSearchBody class
- `app/api/v1/voters.py` - Updated POST endpoint to accept VoterSearchBody, removed cursor/limit query params
- `app/services/voter.py` - Added encode_cursor/decode_cursor helpers, dynamic sort in search_voters
- `tests/unit/test_voter_search.py` - Added TestVoterSearchBody (8 tests) and TestDynamicCursor (16 tests)

## Decisions Made
- SORTABLE_COLUMNS uses Literal type with 12 columns: last_name, first_name, party, age, registration_city, registration_state, registration_zip, created_at, updated_at, propensity_general, propensity_primary, propensity_combined
- encode_cursor/decode_cursor placed as module-level functions (not class methods) for independent testability
- Integer sort columns (age, propensity_*, household_size) grouped in _INT_SORT_COLUMNS frozenset for clean type dispatch
- NULL cursor values handled with is_(None)/is_not(None) SQL for correct three-valued logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend fully supports POST /voters/search with all 32 filter fields, dynamic sorting, and cursor pagination
- Ready for Plan 02 (frontend hooks migration to POST) and Plan 03 (E2E tests)
- GET /voters unchanged for backward compatibility verification in Plan 03

## Self-Check: PASSED

All 4 files verified present. Both commit hashes (e2f63e5, a9c4154) confirmed in git log.

---
*Phase: 27-wire-advanced-filters-to-backend*
*Completed: 2026-03-15*
