---
phase: 59-chunk-schema-configuration
plan: 01
subsystem: database
tags: [imports, rls, alembic, sqlalchemy, settings]
requires:
  - phase: 56-schema-orphan-detection
    provides: ImportJob recovery metadata and durable progress tracking used by chunk records
provides:
  - Internal ImportChunk ORM and dedicated chunk status enum
  - Conservative chunk configuration defaults in application settings
  - import_chunks table with campaign RLS and app_user grants
  - Regression coverage for chunk model registration and RLS isolation
affects: [60-parent-split-parallel-processing, 61-completion-aggregation-error-merging]
tech-stack:
  added: []
  patterns:
    - Direct campaign_id RLS on internal import tables
    - Internal-only chunk tracking without API surface changes
key-files:
  created:
    - alembic/versions/022_import_chunks.py
  modified:
    - app/models/import_job.py
    - app/models/__init__.py
    - app/db/base.py
    - app/core/config.py
    - tests/unit/test_batch_resilience.py
    - tests/unit/test_model_coverage.py
    - tests/integration/test_voter_rls.py
key-decisions:
  - "Use a dedicated ImportChunkStatus enum instead of coupling chunk state to ImportStatus."
  - "Store campaign_id directly on import_chunks so RLS can follow the existing campaign-table policy pattern."
patterns-established:
  - "Chunk state remains internal to the worker/schema layer until later phases wire fan-out and aggregation."
  - "Chunk tables get explicit app_user grants plus direct campaign_id RLS in Alembic."
requirements-completed: [CHUNK-01, CHUNK-07]
duration: 5min
completed: 2026-04-03
---

# Phase 59 Plan 01: Chunk Schema & Configuration Summary

**Internal ImportChunk records, conservative chunk settings, and campaign-scoped RLS foundation for future parallel imports**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T16:16:00Z
- **Completed:** 2026-04-03T16:20:56Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added `ImportChunk` and `ImportChunkStatus` to the import model layer without changing any user-facing import schema.
- Added conservative chunk configuration defaults for chunk size, serial threshold, and per-import concurrency.
- Created the `import_chunks` Alembic revision with indexes, direct `campaign_id` RLS, and `app_user` grants.
- Extended unit and integration coverage to verify model registration, settings defaults, and `import_chunks` RLS isolation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add internal ImportChunk model and chunk settings** - `a43e4e0` (feat)
2. **Task 2: Create the import_chunks migration with campaign RLS** - `e91ed0d` (feat)
3. **Task 3: Add schema and RLS regression coverage for ImportChunk** - `655d1b2` (test)

## Files Created/Modified
- `app/models/import_job.py` - Added `ImportChunkStatus` and `ImportChunk`.
- `app/models/__init__.py` - Exported the new chunk model and enum.
- `app/db/base.py` - Documented chunk registration via the import job model module.
- `app/core/config.py` - Added default chunk sizing, serial-threshold, and concurrency settings.
- `alembic/versions/022_import_chunks.py` - Created the `import_chunks` table, indexes, RLS policy, and grant statements.
- `tests/unit/test_batch_resilience.py` - Added assertions for chunk defaults and durable chunk fields.
- `tests/unit/test_model_coverage.py` - Added export coverage for `ImportChunk` and `ImportChunkStatus`.
- `tests/integration/test_voter_rls.py` - Added `import_chunks` fixture data and campaign isolation assertions.

## Decisions Made
- Used a dedicated `ImportChunkStatus` enum so later chunk-specific states can evolve without changing parent import semantics.
- Put `campaign_id` directly on `import_chunks` so the migration can use the same direct-policy RLS shape as existing campaign-owned tables.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The integration fixtures target `localhost:5433` by default, while the current Docker Compose stack exposed PostgreSQL on `localhost:49374`. Verification succeeded after running `uv run alembic upgrade head` and invoking pytest with `TEST_DB_PORT=49374`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 60 can build parent split logic on top of the durable `import_chunks` table and internal chunk settings.
- User-facing import responses remain unchanged, preserving the serial import surface until fan-out work is intentionally added.

## Self-Check: PASSED

- Verified `.planning/phases/59-chunk-schema-configuration/59-01-SUMMARY.md` exists on disk.
- Verified task commits `a43e4e0`, `e91ed0d`, and `655d1b2` exist in git history.
