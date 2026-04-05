---
phase: 70-reopened-import-restore-flow-closure
plan: 02
subsystem: testing
tags: [playwright, e2e, import-wizard, reopen-flow]

requires:
  - phase: 70-reopened-import-restore-flow-closure-01
    provides: "ImportJob type extension with detected_columns, suggested_mapping, format_detected; wizard hydration logic"
provides:
  - "E2E test proving reopen-from-history restores mapping columns without re-uploading"
  - "E2E test proving reopened import can proceed from mapping to preview step"
  - "Retired audit evidence for the import-job restore seam gap"
affects: [v1.11-milestone-audit]

tech-stack:
  added: []
  patterns: ["Route-level E2E testing with Playwright page.route mocks for wizard reopen flows"]

key-files:
  created: []
  modified:
    - web/e2e/l2-import-wizard.spec.ts
    - .planning/v1.11-MILESTONE-AUDIT.md

key-decisions:
  - "Used .first() selector for column name assertions that appear both as labels and select values"

patterns-established:
  - "Reopen-flow E2E pattern: navigate with jobId+step=1 and assert step-restore hydration"

requirements-completed: []

duration: 9min
completed: 2026-04-04
---

# Phase 70 Plan 02: Reopen-Flow E2E Coverage and Audit Closure Summary

**E2E tests prove reopened imports restore mapping columns from job data and proceed through the wizard; audit gap for import-job restore seam retired**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-04T14:10:24Z
- **Completed:** 2026-04-04T14:19:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added two E2E tests proving the Plan 01 hydration fix works end-to-end via direct wizard URL navigation with jobId
- Verified column mapping table renders with detected columns (Voter ID, First Name, Last Name) and L2 banner appears
- Verified reopened import proceeds from mapping step through to preview step
- Retired the import-job restore seam audit gap with Phase 70 evidence (type extension + hydration + E2E coverage)
- Updated PROG-04 requirement from "satisfied with flow risk" to "satisfied"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add E2E test for reopened import mapping restoration** - `6ca485e` (test)
2. **Task 2: Retire audit evidence for the import-job restore seam** - `eba159d` (docs)

## Files Created/Modified
- `web/e2e/l2-import-wizard.spec.ts` - Added two reopen-flow E2E test cases
- `.planning/v1.11-MILESTONE-AUDIT.md` - Marked restore seam integration as Wired, flow as Complete, updated scores

## Decisions Made
- Used `.first()` selector for column name assertions since "Voter ID" etc. appear both as table labels and as combobox select values in the mapping table

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed strict mode violation in column assertions**
- **Found during:** Task 1 (E2E test for reopened import)
- **Issue:** `getByText("Voter ID")` resolved to 2 elements (label + select value), causing strict mode violation
- **Fix:** Changed to `getByText("Voter ID").first()` for all column name assertions
- **Files modified:** web/e2e/l2-import-wizard.spec.ts
- **Verification:** All 4 E2E tests pass
- **Committed in:** 6ca485e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor selector adjustment for correct Playwright strict mode behavior. No scope creep.

## Issues Encountered
- Playwright webServer config could not auto-detect the Docker-hosted Vite dev server due to random port mapping; resolved by starting a local Vite instance for testing

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 70 is complete (both plans executed)
- The import-job restore seam audit gap is closed
- v1.11 milestone audit still has the queued-cancellation-finalization seam open (Phase 69 scope)

---
*Phase: 70-reopened-import-restore-flow-closure*
*Completed: 2026-04-04*
