---
phase: 65-chunk-planning-concurrency-cap-closure
plan: 02
subsystem: backend
tags: [imports, orchestration, concurrency, integration-tests]
requires:
  - phase: 65-chunk-planning-concurrency-cap-closure
    provides: file-size-aware planner
provides:
  - capped initial chunk fan-out
  - successor promotion with skip-locked selection
  - regression coverage for rolling-window dispatch
affects: [phase-65-runtime, import-task-runtime, parallel-processing-tests]
tech-stack:
  added: []
  patterns:
    [rolling-window dispatch, defer-then-mark-queued successor promotion]
key-files:
  created:
    - .planning/phases/65-chunk-planning-concurrency-cap-closure/65-02-SUMMARY.md
  modified:
    - app/tasks/import_task.py
    - tests/unit/test_import_task.py
    - tests/integration/test_import_parallel_processing.py
key-decisions:
  - "Applied the concurrency cap only to primary chunk workers so deferred secondary work does not block new primary slots."
  - "Used `with_for_update(skip_locked=True)` to prevent two workers from claiming the same pending successor."
patterns-established:
  - "Chunk workers now refill the capped concurrency window durably from `PENDING` chunk rows."
requirements-completed: [CHUNK-06, CHUNK-07]
duration: 16min
completed: 2026-04-03
---

# Phase 65 Plan 02: Chunk Planning & Concurrency Cap Closure Summary

**Rolling-window chunk dispatch and successor promotion**

## Accomplishments

- Updated `process_import()` to fetch object size, pass it into `plan_chunk_ranges()`, and defer only the first `import_max_chunks_per_import` chunk workers.
- Added `_promote_next_pending_chunk()` so each finished primary chunk worker claims and defers the next pending chunk in row order with `skip_locked` protection.
- Added unit and integration coverage for capped fan-out, successor promotion, failure rollback to `PENDING`, and full rolling-window defer history.

## Verification

- `uv run pytest tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x`

## Next Phase Readiness

- The backend runtime now enforces bounded chunk concurrency without disturbing the Phase 63 secondary-work lifecycle.
