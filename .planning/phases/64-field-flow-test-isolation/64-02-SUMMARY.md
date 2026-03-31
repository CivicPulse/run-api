---
phase: 64-field-flow-test-isolation
plan: 02
subsystem: testing
tags: [playwright, e2e, bash, field-mode, order-isolation]

# Dependency graph
requires:
  - phase: 64-01
    provides: "Disposable FIELD-07 canvassing fixture and client-state reset"
provides:
  - "Strict FIELD-07 order-isolation permutation matrix command (--strict-phase64-field07-order)"
  - "Updated E2E-20 traceability reflecting Phase 64 isolation hardening"
affects: [e2e-testing, field-mode, ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permutation matrix gate pattern in run-e2e.sh for order-independence verification"

key-files:
  created: []
  modified:
    - web/scripts/run-e2e.sh
    - .planning/REQUIREMENTS.md

key-decisions:
  - "4-permutation matrix: solo, forward sequence, reverse then target, target then forward"
  - "Uses --workers 1 and --project=volunteer for deterministic serial ordering"
  - "Fails on both non-zero exit and FIELD-07 skip detection"

patterns-established:
  - "Strict order-matrix gate: single-command permutation verification for test order independence"

requirements-completed: [E2E-20]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 64 Plan 02: FIELD-07 Order-Isolation Permutation Gate Summary

**Strict `--strict-phase64-field07-order` command in run-e2e.sh proving FIELD-07 order independence via 4-run permutation matrix, with E2E-20 traceability updated for Phase 64 isolation closure**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T22:56:11Z
- **Completed:** 2026-03-31T23:01:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `--strict-phase64-field07-order` flag to run-e2e.sh with help text and examples
- Implemented `run_strict_phase64_field07_order` function running 4 deterministic permutations: FIELD-07 solo, FIELD-03..07 forward, FIELD-08..10 then FIELD-07, FIELD-07 then FIELD-08..10
- Updated E2E-20 requirement description and traceability to reflect Phase 64 isolation hardening

## Task Commits

Each task was committed atomically:

1. **Task 1: Add strict FIELD-07 order-matrix mode to run-e2e wrapper** - `42d01cd` (feat)
2. **Task 2: Update E2E-20 traceability after strict order gate wiring** - `835d99f` (docs)

## Files Created/Modified
- `web/scripts/run-e2e.sh` - Added --strict-phase64-field07-order flag, function, and execution wiring
- `.planning/REQUIREMENTS.md` - Updated E2E-20 description and traceability row for Phase 64 closure

## Decisions Made
- 4-permutation matrix covers D-07/D-08 verification bar: solo, forward sequence, later-then-target, target-then-later
- All runs use `--workers 1 --project=volunteer` for deterministic serial ordering
- Skip detection uses grep against run logs to catch FIELD-07 being skipped silently

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FIELD-07 order-isolation is fully gated and verifiable with a single command
- Phase 64 is complete: disposable fixtures (plan 01) + order matrix gate (plan 02)

---
*Phase: 64-field-flow-test-isolation*
*Completed: 2026-03-31*
