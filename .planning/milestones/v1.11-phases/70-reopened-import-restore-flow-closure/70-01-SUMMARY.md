---
phase: 70-reopened-import-restore-flow-closure
plan: 01
subsystem: ui
tags: [typescript, react, tanstack-query, import-wizard]

requires:
  - phase: 66-import-wizard-flow-recovery-progress-accuracy
    provides: Import wizard flow with step-restore effect and deriveStep
provides:
  - Extended ImportJob TypeScript interface with detected_columns, suggested_mapping, format_detected
  - Step-restore hydration logic for reopened uploaded imports
affects: [import-wizard, voter-imports]

tech-stack:
  added: []
  patterns: [once-guard hydration via length check to prevent query refetch overwrites]

key-files:
  created: []
  modified:
    - web/src/types/import-job.ts
    - web/src/routes/campaigns/$campaignId/voters/imports/new.tsx

key-decisions:
  - "Guard hydration with detectedColumns.length === 0 to prevent refetch overwrites of user edits"

patterns-established:
  - "Once-guard hydration: use local state length check to prevent re-hydration on query refetches"

requirements-completed: []

duration: 1min
completed: 2026-04-04
---

# Phase 70 Plan 01: Import Restore Flow Closure Summary

**Extended ImportJob frontend type with detect-column fields and added once-guarded hydration to step-restore effect for reopened uploaded imports**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-04T14:07:40Z
- **Completed:** 2026-04-04T14:08:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added detected_columns, suggested_mapping, and format_detected to ImportJob TypeScript interface to match backend response
- Added mapping state hydration to the step-restore useEffect so reopened uploaded imports populate the column mapping wizard
- Guarded hydration with detectedColumns.length === 0 to prevent overwriting user edits on query refetches

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ImportJob type with detect-column fields** - `b3a2ee2` (feat)
2. **Task 2: Add mapping state hydration to step-restore effect** - `a6d4de5` (feat)

## Files Created/Modified
- `web/src/types/import-job.ts` - Added three nullable fields to ImportJob interface
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` - Extended step-restore useEffect with hydration logic

## Decisions Made
- Guard hydration with detectedColumns.length === 0 rather than a separate ref flag, keeping the approach simple and avoiding extra state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Import type contract and wizard restore logic complete
- Ready for 70-02 plan (if applicable) or milestone closure

---
*Phase: 70-reopened-import-restore-flow-closure*
*Completed: 2026-04-04*
