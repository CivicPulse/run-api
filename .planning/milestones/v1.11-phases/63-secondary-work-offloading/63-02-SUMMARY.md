---
phase: 63-secondary-work-offloading
plan: 02
subsystem: api
tags: [imports, procrastinate, manifests, task-orchestration]
requires:
  - phase: 63-secondary-work-offloading
    provides: durable chunk secondary task state and manifests
provides:
  - voter-only primary chunk processing path
  - deferred phone and geometry chunk tasks
  - chunk completion gated on terminal secondary task state
affects: [phase-63-secondary-work, import-processing, import-tasks]
tech-stack:
  added: []
  patterns:
    [
      primary-path voter upsert plus manifest emission,
      post-chunk phone and geometry tasks,
      chunk completion after secondary-task fan-in,
    ]
key-files:
  created:
    - .planning/phases/63-secondary-work-offloading/63-02-SUMMARY.md
  modified:
    - app/services/import_service.py
    - app/tasks/import_task.py
    - tests/unit/test_import_service.py
    - tests/unit/test_import_task.py
key-decisions:
  - "Kept `phones_created` owned by the phone task and removed it from the chunk primary path."
  - "Left chunks non-terminal after primary range processing so parent fan-in cannot complete before secondary work does."
patterns-established:
  - "Secondary task manifests are accumulated during `_process_single_batch()` and finalized by `maybe_complete_chunk_after_secondary_tasks()`."
requirements-completed: [SECW-01, SECW-02]
duration: 14min
completed: 2026-04-03
---

# Phase 63 Plan 02: Secondary Work Offloading Summary

**Primary chunk work now stops at voter durability and hands phones plus geometry to separate tasks**

## Accomplishments

- Added `process_csv_batch_primary()` so chunk primary processing performs voter upserts only and emits durable phone and geometry manifests.
- Added deferred `process_import_chunk_phones` and `process_import_chunk_geometry` task flows that consume chunk manifests and update chunk-scoped secondary task state.
- Added `maybe_complete_chunk_after_secondary_tasks()` so chunk completion and parent fan-in wait for both secondary tasks to reach terminal state.

## Verification

- `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x`

## Next Phase Readiness

- The runtime now exposes a shorter critical path per chunk and a durable lifecycle that integration coverage can validate under concurrent execution.
