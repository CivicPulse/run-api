---
phase: 24-import-pipeline-enhancement
plan: 02
subsystem: database
tags: [alembic, postgresql, jsonb, import-pipeline, l2-mapping]

# Dependency graph
requires:
  - phase: 23-schema-foundation
    provides: "Expanded voter model with mailing/propensity/demographic columns and L2 template with renamed registration fields"
provides:
  - "phones_created column on import_jobs table for tracking phone records created during import"
  - "ImportJob model and ImportJobResponse schema with phones_created field"
  - "L2 mapping template with 21 new field mappings for propensity, demographics, household, phone, and mailing"
affects: [24-03-import-pipeline-enhancement]

# Tech tracking
tech-stack:
  added: []
  patterns: ["JSONB concatenation (||) for template updates", "JSONB - ARRAY[]::text[] for key removal in downgrade"]

key-files:
  created:
    - alembic/versions/007_import_phone_propensity.py
  modified:
    - app/models/import_job.py
    - app/schemas/import_job.py

key-decisions:
  - "Used JSONB || concatenation for L2 template update (no-op if template missing, idempotent)"
  - "Used ARRAY[]::text[] cast for downgrade key removal (cleaner than chained - operators)"

patterns-established:
  - "JSONB merge pattern: UPDATE ... SET mapping = mapping || CAST(:new AS jsonb) for adding template keys"

requirements-completed: [IMPT-05]

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 24 Plan 02: Migration & Schema Summary

**Alembic migration 007 adding phones_created tracking column and 21 new L2 mapping template entries for propensity, demographics, household, phone, and mailing fields**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T22:50:38Z
- **Completed:** 2026-03-13T22:52:31Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created migration 007 adding phones_created nullable integer column to import_jobs
- Updated L2 system mapping template with 21 new field mappings covering all Phase 23+24 voter columns
- Added phones_created field to ImportJob model and ImportJobResponse schema
- All 284 existing unit tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Alembic migration 007 and update ImportJob model/schema** - `ca16888` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `alembic/versions/007_import_phone_propensity.py` - Migration adding phones_created column and updating L2 template with 21 new mappings
- `app/models/import_job.py` - Added phones_created field to ImportJob model
- `app/schemas/import_job.py` - Added phones_created field to ImportJobResponse schema

## Decisions Made
- Used JSONB `||` concatenation operator for L2 template update -- this is a no-op if the template doesn't exist (handles fresh installs where migration 002 seed hasn't run)
- Used `ARRAY[]::text[]` cast for downgrade key removal instead of chaining 21 individual `-` operators

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TDD RED test (test_import_parsing.py from Plan 24-01) fails at import time since `normalize_phone` is not yet implemented -- excluded from test run as expected behavior for TDD RED phase

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Migration 007 ready to apply -- phones_created column and L2 template updates are prerequisites for Plan 03
- ImportJob model and schema ready for Plan 03's phone creation tracking in process_import_file

## Self-Check: PASSED

All artifacts verified:
- alembic/versions/007_import_phone_propensity.py: FOUND
- app/models/import_job.py (phones_created): FOUND
- app/schemas/import_job.py (phones_created): FOUND
- Commit ca16888: FOUND

---
*Phase: 24-import-pipeline-enhancement*
*Completed: 2026-03-13*
