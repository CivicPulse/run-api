---
phase: 29-integration-polish-tech-debt-cleanup
plan: 01
subsystem: ui
tags: [typescript, react, tanstack-table, import-job]

# Dependency graph
requires:
  - phase: 23-voter-model-rename
    provides: Backend ImportJobResponse with original_filename field
provides:
  - ImportJob TypeScript interface aligned with backend ImportJobResponse
  - Import history table showing correct Filename column
  - Clean ImportProgress without phantom error_count
affects: [voter-imports, import-wizard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frontend type interfaces mirror backend response schemas exactly"

key-files:
  created: []
  modified:
    - web/src/types/import-job.ts
    - web/src/routes/campaigns/$campaignId/voters/imports/index.tsx
    - web/src/components/voters/ImportProgress.tsx
    - web/src/routes/campaigns/$campaignId/voters/imports/new.tsx

key-decisions:
  - "No backward compat aliases -- clean rename from filename to original_filename"

patterns-established:
  - "ImportJob interface as single source of truth for import job shape across all frontend consumers"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 29 Plan 01: ImportJob Interface Alignment Summary

**ImportJob TypeScript interface aligned with backend ImportJobResponse: renamed filename to original_filename, removed phantom error_count, added source_type/field_mapping/error_message/created_by fields**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T06:31:37Z
- **Completed:** 2026-03-15T06:33:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ImportJob interface now matches backend ImportJobResponse with all fields (original_filename, source_type, field_mapping, error_message, created_by)
- Import history table Filename column correctly uses original_filename accessorKey
- Removed blank Errors column from import history table (error_count had no backend source)
- Cleaned error_count references from ImportProgress stats and failed state
- Cleaned error_count reference from import completion view in new.tsx
- Preserved error_report_key download link in completion view

## Task Commits

Each task was committed atomically:

1. **Task 1: Update ImportJob interface and fix import history table** - `7be8468` (feat)
2. **Task 2: Remove error_count references from ImportProgress and new.tsx** - `6c90076` (fix)

## Files Created/Modified
- `web/src/types/import-job.ts` - ImportJob interface: renamed filename to original_filename, removed error_count, added error_message/source_type/field_mapping/created_by
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx` - Import history table: changed accessorKey to original_filename, removed Errors column
- `web/src/components/voters/ImportProgress.tsx` - Removed error_count display span and failed-state error_count conditional
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` - Removed error_count conditional block from completion view

## Decisions Made
- No backward compat aliases -- clean rename from filename to original_filename (frontend-only change, no API contract impact)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ImportJob type is now fully aligned with backend, ready for any future import feature work
- Plan 02 can proceed with remaining tech debt items

## Self-Check: PASSED

All 4 modified files exist. Both task commits (7be8468, 6c90076) verified in git log.

---
*Phase: 29-integration-polish-tech-debt-cleanup*
*Completed: 2026-03-15*
