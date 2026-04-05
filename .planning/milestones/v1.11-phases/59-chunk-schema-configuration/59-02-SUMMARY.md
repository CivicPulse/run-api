---
phase: 59-chunk-schema-configuration
plan: 02
subsystem: imports
tags: [chunking, imports, routing, testing]
requires:
  - phase: 59-chunk-schema-configuration
    provides: "ImportChunk schema, settings, and RLS groundwork from 59-01"
provides:
  - "Shared bind-limit-aware row sizing helper for batch and future chunk planning"
  - "Explicit serial-routing seam in the import task without child-task fan-out"
  - "Regression coverage proving Phase 59 still uses one serial worker path"
affects: [60-parent-split-parallel-processing, 61-completion-aggregation-error-merging]
tech-stack:
  added: []
  patterns:
    - "Reuse one bind-limit formula for both write batching and future chunk sizing"
    - "Route unknown or below-threshold imports to the serial path conservatively"
key-files:
  created:
    - .planning/phases/59-chunk-schema-configuration/59-02-SUMMARY.md
  modified:
    - app/services/import_service.py
    - app/tasks/import_task.py
    - tests/unit/test_import_service.py
    - tests/unit/test_import_task.py
key-decisions:
  - "Keep chunk routing at the background task boundary while preserving one serial process_import_file call in Phase 59."
  - "Treat missing or malformed total_rows values as unknown and keep them on the serial path."
patterns-established:
  - "Future chunk fan-out should call shared sizing helpers rather than reimplement bind-limit math."
  - "Above-threshold imports may log deferred chunking while still using the proven serial worker path until Phase 60."
requirements-completed: [CHUNK-05, CHUNK-06]
duration: 8min
completed: 2026-04-03
---

# Phase 59 Plan 02 Summary

**Reusable bind-limit-aware chunk sizing helpers and a deferred fan-out routing seam for serial imports**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-03T16:20:00Z
- **Completed:** 2026-04-03T16:28:22Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Extracted reusable sizing helpers from `ImportService` so batch writes and future chunk planning share one bind-limit formula.
- Added an explicit serial-routing decision in `process_import()` that logs above-threshold imports without creating chunks or child jobs.
- Added regression coverage for helper behavior and for `None`, `5000`, and `20000` row-count routing scenarios.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract bind-limit-aware chunk sizing helpers** - `eebd53c` (feat)
2. **Task 2: Add a serial-routing seam in the import task without enabling chunk fan-out** - `cc7073f` (feat)
3. **Task 3: Add helper and routing regression tests for Phase 59 behavior** - `80268ce` (test)

## Files Created/Modified
- `app/services/import_service.py` - Adds pure sizing and serial-routing helpers and routes existing batch math through the shared helper.
- `app/tasks/import_task.py` - Evaluates the serial-routing seam and logs deferred chunk fan-out while preserving one serial service invocation.
- `tests/unit/test_import_service.py` - Covers bind-limit clamping, deterministic chunk ranges, empty totals, and serial-threshold decisions.
- `tests/unit/test_import_task.py` - Verifies unknown, below-threshold, and above-threshold imports still call `process_import_file()` exactly once.
- `.planning/phases/59-chunk-schema-configuration/59-02-SUMMARY.md` - Records plan outcomes, decisions, verification, and self-check state.

## Decisions Made

- Kept the routing seam in the background task rather than the API layer so Phase 60 can add fan-out without changing user-facing import flows.
- Reused the same bind-limit helper for both existing batch sizing and future chunk planning to avoid diverging formulas.
- Logged above-threshold imports as deferred Phase 60 work instead of partially simulating chunk orchestration in Phase 59.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fallback missing or malformed row counts to the serial path**
- **Found during:** Task 2 (serial-routing seam verification)
- **Issue:** Existing task mocks and any unexpected non-integer `total_rows` value could raise before routing completed.
- **Fix:** Hardened `should_use_serial_import()` and the task seam to treat missing or malformed row counts as unknown and keep them on the conservative serial path.
- **Files modified:** `app/services/import_service.py`, `app/tasks/import_task.py`
- **Verification:** `uv run pytest tests/unit/test_import_task.py -x`
- **Committed in:** `cc7073f`

---

**Total deviations:** 1 auto-fixed (1 Rule 1)
**Impact on plan:** The fix preserved the plan’s intended runtime behavior and made the new seam safer without expanding scope.

## Issues Encountered

- Initial helper tests used chunk-size expectations that ignored the shared bind-limit formula’s extra per-row columns. The assertions were corrected to the deterministic values produced by the helper.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 60 can now add pre-scan and child-task fan-out on top of shared sizing helpers and the task-level routing seam instead of changing batch math and routing logic at the same time.

No blockers were introduced. Phase 59 still creates no chunks, enqueues no child import work, and preserves the existing serial import runtime.

## Self-Check: PASSED

- Verified `.planning/phases/59-chunk-schema-configuration/59-02-SUMMARY.md` exists.
- Verified task commits `eebd53c`, `cc7073f`, and `80268ce` exist in git history.
