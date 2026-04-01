---
phase: 50-per-batch-commits-crash-resilience
plan: 01
subsystem: database, api, infra
tags: [sqlalchemy, alembic, s3, rls, postgresql, aioboto3, crash-resilience]

# Dependency graph
requires:
  - phase: 49-background-job-queue
    provides: "Procrastinate schema and import job model"
provides:
  - "last_committed_row column on ImportJob for batch progress tracking"
  - "import_batch_size config setting (default 1000)"
  - "StorageService.list_objects and delete_objects for per-batch error files"
  - "commit_and_restore_rls helper for safe mid-import commits"
  - "Alembic migration 018 adding last_committed_row to import_jobs"
affects: [50-02-per-batch-commit-loop, import-service, worker]

# Tech tracking
tech-stack:
  added: []
  patterns: ["commit_and_restore_rls pattern for transaction-scoped RLS with mid-process commits"]

key-files:
  created:
    - alembic/versions/018_add_last_committed_row.py
  modified:
    - app/models/import_job.py
    - app/schemas/import_job.py
    - app/core/config.py
    - app/services/storage.py
    - app/db/rls.py

key-decisions:
  - "last_committed_row defaults to 0 (not NULL) to distinguish 'no rows committed' from 'unknown'"
  - "server_default='0' on migration column to backfill existing rows"
  - "commit_and_restore_rls is a standalone function (not a method) for use across services"

patterns-established:
  - "commit_and_restore_rls: always call after session.commit() when RLS context is needed for subsequent queries"

requirements-completed: [RESL-01, RESL-02, RESL-03, RESL-04, RESL-05]

# Metrics
duration: 2min
completed: 2026-03-29
---

# Phase 50 Plan 01: Foundation Artifacts Summary

**last_committed_row column, import_batch_size config, S3 list/delete methods, and commit_and_restore_rls helper for per-batch crash-resilient imports**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-29T00:29:57Z
- **Completed:** 2026-03-29T00:31:52Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added last_committed_row column to ImportJob model and schema for batch progress tracking
- Added import_batch_size setting (default 1000, configurable via IMPORT_BATCH_SIZE env var)
- Added StorageService.list_objects (paginated) and delete_objects (batched) for per-batch error file management
- Added commit_and_restore_rls helper that safely commits and restores RLS context in one call
- Created Alembic migration 018 to add last_committed_row to the database

## Task Commits

Each task was committed atomically:

1. **Task 1: Add last_committed_row column, import_batch_size setting, and response schema update** - `b5243d1` (feat)
2. **Task 2: Add StorageService list_objects/delete_objects and commit_and_restore_rls helper** - `054fe50` (feat)

## Files Created/Modified
- `alembic/versions/018_add_last_committed_row.py` - Migration adding last_committed_row column to import_jobs
- `app/models/import_job.py` - Added last_committed_row: Mapped[int | None] with default=0
- `app/schemas/import_job.py` - Added last_committed_row field to ImportJobResponse
- `app/core/config.py` - Added import_batch_size: int = 1000 setting
- `app/services/storage.py` - Added list_objects(prefix) and delete_objects(keys) methods
- `app/db/rls.py` - Added commit_and_restore_rls(session, campaign_id) helper

## Decisions Made
- last_committed_row defaults to 0 (not NULL) to clearly distinguish "no rows committed yet" from "unknown state"
- Migration uses server_default="0" to backfill existing import_jobs rows
- commit_and_restore_rls is a module-level function rather than a method, keeping it usable from any service

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundation artifacts are in place for Plan 02 (per-batch commit loop refactor)
- commit_and_restore_rls is ready to be called from the import service after each batch commit
- StorageService list/delete methods are ready for per-batch error file cleanup
- import_batch_size setting is ready to control batch size in the processing loop

## Self-Check: PASSED

- All 7 files verified present on disk
- Both task commits (b5243d1, 054fe50) verified in git log
- 553 unit tests pass unchanged

---
*Phase: 50-per-batch-commits-crash-resilience*
*Completed: 2026-03-29*
