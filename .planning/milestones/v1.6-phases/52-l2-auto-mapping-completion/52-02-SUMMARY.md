---
phase: 52-l2-auto-mapping-completion
plan: 02
subsystem: api
tags: [rapidfuzz, l2, voter-import, field-mapping, detection]

# Dependency graph
requires:
  - phase: 52-01
    provides: "CANONICAL_FIELDS with 55 L2 aliases, _VOTER_COLUMNS with 12 new columns, voting history regex patterns"
provides:
  - "suggest_field_mapping returns dict[str, dict] with field + match_type per column"
  - "detect_l2_format helper returns 'l2' when >80% exact matches"
  - "detect_columns endpoint returns format_detected in ImportJobResponse"
  - "44 unit tests covering L2 mapping, voting history, detection, and field mapping"
affects: [52-03, 52-04, frontend-import-wizard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "match_type classification: exact alias lookup before fuzzy fallback"
    - "format detection heuristic: exact-match ratio > 80% threshold"
    - "transient response field: computed at endpoint, not persisted to DB"

key-files:
  created:
    - tests/unit/test_l2_mapping.py
    - tests/unit/test_voting_history_l2.py
    - tests/unit/test_l2_detection.py
  modified:
    - app/services/import_service.py
    - app/api/v1/imports.py
    - app/schemas/import_job.py
    - tests/unit/test_field_mapping.py

key-decisions:
  - "format_detected is transient (computed at detect time, not persisted) since it derives from suggested_mapping"
  - "Adapted expected L2 mapping: Mailing Household Size maps to mailing_household_size (not household_size) per existing alias table"
  - "Added 3 missing aliases (cell_phone_confidence_code, zip+4, mailing_zip+4) to achieve >80% exact ratio for L2 detection"

patterns-established:
  - "Per-field match_type in suggest_field_mapping: enables frontend confidence badges"
  - "detect_l2_format heuristic: >80% exact threshold distinguishes L2 from generic CSV"

requirements-completed: [L2MP-01, L2MP-02, L2MP-03]

# Metrics
duration: 7min
completed: 2026-03-29
---

# Phase 52 Plan 02: L2 API Shape and Detection Summary

**suggest_field_mapping returns per-field match_type (exact/fuzzy/null), detect_l2_format identifies L2 files via >80% exact alias ratio, 44 unit tests prove all L2 mapping, voting history, and detection requirements**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-29T02:32:56Z
- **Completed:** 2026-03-29T02:40:15Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Changed suggest_field_mapping return shape to include match_type ("exact", "fuzzy", or null) per column, enabling frontend confidence badges
- Added detect_l2_format helper that identifies L2 voter files when >80% of columns have exact alias matches
- Wired format_detected into detect_columns endpoint and ImportJobResponse schema
- Created 24 new unit tests across 3 files covering L2 column mapping completeness, voting history patterns, and detection heuristic
- Updated all 20 existing test_field_mapping.py tests for new dict return shape

## Task Commits

Each task was committed atomically:

1. **Task 1: suggest_field_mapping return shape + detect_l2_format + endpoint + schema + update existing tests** - `cf7be12` (feat)
2. **Task 2: Unit tests for L2 mapping, voting history, and detection** - `ff346cc` (test)

## Files Created/Modified
- `app/services/import_service.py` - suggest_field_mapping returns dict[str, dict], detect_l2_format helper, 3 new exact aliases
- `app/api/v1/imports.py` - detect_columns endpoint computes and returns format_detected
- `app/schemas/import_job.py` - ImportJobResponse gains format_detected field
- `tests/unit/test_field_mapping.py` - All 20 assertions updated for dict return shape, 3 new match_type tests
- `tests/unit/test_l2_mapping.py` - 8 tests: all 47 data columns map, exact match verification, voting history exclusion, typo handling
- `tests/unit/test_voting_history_l2.py` - 10 tests: all 8 L2 voting history patterns (canonical, "Voted in", typo, bare year)
- `tests/unit/test_l2_detection.py` - 6 tests: L2 detection, generic detection, empty, threshold boundary, fuzzy exclusion

## Decisions Made
- format_detected stored transiently: computed from suggested_mapping at detect time, set on response object, not persisted to DB (JSONB column stores the mapping, format can be re-derived)
- Adapted test expectations from plan: "Mailing Household Size" maps to `mailing_household_size` (not `household_size`) because the normalized column name is an exact alias for that canonical field
- Added 3 missing aliases (`cell_phone_confidence_code`, `zip+4`, `mailing_zip+4`) to close the gap from 78% to 83% exact match ratio, ensuring L2 detection works

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added 3 missing L2 exact aliases**
- **Found during:** Task 2 (creating L2 mapping tests)
- **Issue:** "Cell Phone Confidence Code", "Zip+4", and "Mailing Zip+4" were fuzzy matches (not exact) because their normalized forms were missing from the alias table. This dropped the exact ratio to 78%, below the >80% threshold for L2 detection.
- **Fix:** Added `cell_phone_confidence_code`, `zip+4`, and `mailing_zip+4` as exact aliases to their respective canonical fields.
- **Files modified:** app/services/import_service.py
- **Verification:** L2 detection ratio rose from 78% to 83%, detect_l2_format returns "l2" for sample file
- **Committed in:** ff346cc (Task 2 commit)

**2. [Rule 1 - Bug] Corrected plan's expected mapping for Mailing Household Size**
- **Found during:** Task 2 (creating L2 mapping tests)
- **Issue:** Plan expected "Mailing Household Size" -> "household_size", but the normalized form `mailing_household_size` is an exact alias for the `mailing_household_size` canonical field (not `household_size`). This also caused "Mailing_Families_HHCount" to hit the duplicate guard.
- **Fix:** Adapted test expectations to match actual alias table: "Mailing Household Size" -> "mailing_household_size", "Mailing_Families_HHCount" -> None (duplicate guard). Added test documenting the duplicate guard behavior.
- **Files modified:** tests/unit/test_l2_mapping.py
- **Verification:** All 8 L2 mapping tests pass with corrected expectations
- **Committed in:** ff346cc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. Alias additions ensure L2 detection works as designed. Mapping expectation correction aligns tests with existing alias table from Plan 01. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions fully implemented and tested.

## Next Phase Readiness
- API shape change complete: frontend import wizard can now read `format_detected` and per-field `match_type` from detect response
- Plan 03 (frontend integration) can proceed: needs to adapt ColumnMappingTable to consume new `{field, match_type}` shape and show format detection UI
- Plan 04 (integration tests) can proceed: all unit-level contracts verified

---
*Phase: 52-l2-auto-mapping-completion*
*Completed: 2026-03-29*
