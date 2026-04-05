---
phase: 61-completion-aggregation-error-merging
plan: 02
subsystem: api
tags: [imports, postgres, sqlalchemy, procrastinate, testing]
requires:
  - phase: 61-completion-aggregation-error-merging
    provides: chunk-local phones_created persistence and widened completed_with_errors status storage
provides:
  - exactly-once parent chunk finalization behind a transaction advisory lock
  - SQL fan-in for imported_rows, skipped_rows, and phones_created
  - merged parent error artifact and terminal-status fan-in from chunk outcomes
affects: [phase-61-aggregation, phase-62-resilience, import-finalization]
tech-stack:
  added: []
  patterns:
    [
      transaction-scoped advisory locking for short parent finalizers,
      chunk rows as the source of truth for parent counters,
      terminal chunk workers handing off to a shared service finalizer,
    ]
key-files:
  created:
    - .planning/phases/61-completion-aggregation-error-merging/61-02-SUMMARY.md
  modified:
    - app/services/import_service.py
    - app/tasks/import_task.py
    - tests/unit/test_import_service.py
    - tests/unit/test_import_task.py
key-decisions:
  - "Used a transaction-scoped advisory lock for parent fan-in so any terminal chunk can attempt finalization while only one writer proceeds."
  - "Recomputed parent counters and merged error artifacts from durable ImportChunk rows instead of allowing worker-local parent mutation."
patterns-established:
  - "Terminal chunk workers commit their own status first, then hand off to ImportService.maybe_finalize_chunked_import() under restored RLS context."
  - "Chunk-scoped merged error artifacts remain under the chunk prefix while the parent finalizer writes a single parent-level error report."
requirements-completed: [PROG-01, PROG-02, PROG-03, PROG-05]
duration: 14min
completed: 2026-04-03
---

# Phase 61 Plan 02: Completion Aggregation & Error Merging Summary

**Exactly-once parent fan-in over durable chunk rows with merged error artifacts and partial-success terminal state handling**

## Performance

- **Duration:** 14 min
- **Completed:** 2026-04-03T18:18:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added RED/GREEN unit coverage for the locked finalizer, parent status decision tree, and chunk-task handoff after both successful and failed chunk completion.
- Implemented `ImportService.maybe_finalize_chunked_import()` with a transaction-scoped PostgreSQL advisory lock, SQL aggregate fan-in, parent summary-message generation, and merged parent error artifact handling.
- Updated `process_import_chunk()` so terminal chunk workers restore RLS and call the shared finalizer without overwriting already-committed chunk state.
- Corrected chunk-level merged error artifact pathing so chunk merges stay chunk-scoped until the parent finalizer publishes the single user-facing artifact.

## Files Created/Modified

- `app/services/import_service.py` - Added chunk-finalization summary/query helpers, transaction advisory lock claim, parent status/error-message fan-in, and chunk-aware error merge destination handling.
- `app/tasks/import_task.py` - Added shared parent-finalizer handoff after terminal chunk commits on both success and failure paths.
- `tests/unit/test_import_service.py` - Added locked finalizer coverage for non-terminal exits, status fan-in, and lock-loser behavior.
- `tests/unit/test_import_task.py` - Added assertions that chunk workers call the shared finalizer after terminal commit.
- `.planning/phases/61-completion-aggregation-error-merging/61-02-SUMMARY.md` - Execution summary for this plan.

## Verification

- `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x`

## Deviations from Plan

None.

## Next Phase Readiness

- Phase 61 now has one authoritative parent finalizer and a merged parent error artifact contract.
- Phase 62 can build on the same fan-in path for cancellation and crash-resume behavior without reworking parent aggregation ownership.
