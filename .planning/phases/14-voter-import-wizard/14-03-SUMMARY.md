---
phase: 14-voter-import-wizard
plan: "03"
subsystem: ui
tags: [react, tanstack-router, tanstack-query, typescript, vitest, radix-ui, shadcn]

# Dependency graph
requires:
  - phase: 14-01
    provides: import-job.ts types (ImportJob, ImportStatus, ImportUploadResponse, ImportDetectResponse, ImportConfirmRequest, ImportTemplate)
  - phase: 14-02
    provides: useImports hooks (useInitiateImport, useDetectColumns, useConfirmMapping, useImportJob, deriveStep), uploadToMinIO XHR helper
provides:
  - Four-step import wizard page at /campaigns/$campaignId/voters/imports/new
  - Step URL persistence via ?jobId= and ?step= search params with validateSearch
  - Auto-restore: loads job status on mount and navigates to correct step
  - DropZone component: drag-and-drop CSV upload with XHR progress bar
  - ColumnMappingTable component: per-column Select with canonical field options and confidence badges
  - MappingPreview component: source-column to voter-field summary table excluding skipped columns
  - ImportProgress component: polling-based progress bar with counters and auto-advance on completion
  - 11 passing component tests (7 ColumnMappingTable, 4 MappingPreview)
affects:
  - 14-04 (import history page navigates to this wizard)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SKIP_VALUE sentinel pattern: Radix UI SelectItem requires non-empty string value — use '__skip__' internally and translate to/from '' at the boundary"
    - "URL search param persistence for multi-step wizards: validateSearch + useSearch + navigate({ search: (prev) => ... })"
    - "useRef guard for single-fire useEffect callbacks (onComplete/onFailed in ImportProgress)"

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/voters/imports/new.tsx
    - web/src/components/voters/DropZone.tsx
    - web/src/components/voters/ColumnMappingTable.tsx
    - web/src/components/voters/MappingPreview.tsx
    - web/src/components/voters/ImportProgress.tsx
  modified:
    - web/src/components/voters/ColumnMappingTable.test.tsx
    - web/src/components/voters/MappingPreview.test.tsx

key-decisions:
  - "SKIP_VALUE='__skip__' sentinel replaces empty string for Radix UI SelectItem compatibility — translated back to '' at onMappingChange boundary"
  - "Step 2.5 (preview) stored as numeric 2.5 in URL step param — TanStack Router validateSearch preserves it as a number"
  - "useRef guard in ImportProgress prevents onComplete/onFailed double-fire in React StrictMode"

patterns-established:
  - "Radix UI SelectItem skip/none option: use named sentinel value, translate at callback boundary"
  - "Multi-step wizard URL persistence: validateSearch declares search shape, navigate({ search: (prev) => ({...prev, step: N}) }) for incremental updates"

requirements-completed: [IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05, IMPT-07]

# Metrics
duration: 6min
completed: 2026-03-11
---

# Phase 14 Plan 03: Import Wizard UI Summary

**Four-step CSV import wizard (upload → column mapping → preview → progress) with URL-persisted state, four step components, and 11 passing Vitest component tests**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-11T04:12:47Z
- **Completed:** 2026-03-11T04:17:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created four step components: DropZone (XHR upload progress), ColumnMappingTable (Select + confidence badges), MappingPreview (mapping summary table), ImportProgress (polling progress bar with auto-advance)
- Built `new.tsx` import wizard route with validateSearch (`jobId`, `step`), step orchestration, auto-restore from job status on mount, and RequireRole("admin") gate
- Promoted all 9 component test stubs to 11 passing tests (ColumnMappingTable: 7, MappingPreview: 4); full Vitest suite now shows 110 passing tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Step components** - `4d09181` (feat)
2. **Task 2: Import wizard route and component tests** - `6a87ede` (feat)

**Plan metadata:** (docs commit — next)

## Files Created/Modified
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` - Four-step wizard page; validateSearch, auto-restore, uploadToMinIO XHR, RequireRole("admin")
- `web/src/components/voters/DropZone.tsx` - Drag-and-drop + click-to-browse, Progress bar during upload, error state with try-again
- `web/src/components/voters/ColumnMappingTable.tsx` - One row per column, shadcn Select with CANONICAL_FIELDS + skip option, CheckCircle2/AlertTriangle confidence badges, skeleton loading state
- `web/src/components/voters/MappingPreview.tsx` - Source-column to voter-field table, excludes skipped/empty mappings, empty state message
- `web/src/components/voters/ImportProgress.tsx` - Progress component with row counters, Loader2 spinner during processing, useRef guard on onComplete/onFailed
- `web/src/components/voters/ColumnMappingTable.test.tsx` - 7 passing tests (column names, Select pre-population, green/yellow badges, skip option, onChange callback, skeleton state)
- `web/src/components/voters/MappingPreview.test.tsx` - 4 passing tests (mapped rows shown, skipped rows excluded, empty state, column headers)

## Decisions Made
- **SKIP_VALUE sentinel:** Radix UI `SelectItem` throws if `value=""` — use `"__skip__"` internally and translate to/from `""` at the `onMappingChange` boundary so the parent's mapping state stays `""` for skip (matching the plan spec and `MappingPreview` filter logic).
- **Step 2.5 in URL:** Preview is internally step 2.5 (numeric) in the `?step=` param. `validateSearch` coerces to Number which preserves it correctly.
- **useRef guard in ImportProgress:** Prevents `onComplete`/`onFailed` double-fire in React StrictMode by using a `firedRef` that is set on first invocation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Radix UI SelectItem rejects empty string value for the (skip) option**
- **Found during:** Task 2 (running ColumnMappingTable tests)
- **Issue:** Plan spec says `"(skip)"` SelectItem should have `value=""`. Radix UI enforces a non-empty string constraint, throwing "A SelectItem must have a value prop that is not an empty string."
- **Fix:** Introduced `SKIP_VALUE = "__skip__"` sentinel constant in `ColumnMappingTable.tsx`. Internally the Select uses this value; `onValueChange` translates it back to `""` before calling `onMappingChange`. The parent mapping state and all downstream logic (MappingPreview filter, confirm payload builder) continue using `""` for skip.
- **Files modified:** `web/src/components/voters/ColumnMappingTable.tsx` (included in Task 2 commit)
- **Verification:** All 7 ColumnMappingTable tests pass; TypeScript compiles clean
- **Committed in:** `6a87ede` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correctness — Radix UI constraint. No scope creep. External API (mapping uses `""` for skip) unchanged.

## Issues Encountered
- Radix UI SelectItem empty-string constraint surfaced at test runtime (not TypeScript compilation). Fixed by introducing the SKIP_VALUE sentinel pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wizard UI is complete and functional: upload → mapping → preview → progress/completion
- Plan 14-04 (import history page) can build on `useImports` and `useImportJob` hooks from Plan 02
- TypeScript compiles cleanly with no errors
- Full Vitest suite green: 110 passing, 5 todos (XHR-related, pre-existing from Plan 02)

---
*Phase: 14-voter-import-wizard*
*Completed: 2026-03-11*
