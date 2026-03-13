---
phase: 14-voter-import-wizard
plan: "02"
subsystem: ui
tags: [react, tanstack-query, typescript, vitest, xhr, minio]

# Dependency graph
requires:
  - phase: 14-01
    provides: import-job.ts types (ImportJob, ImportStatus, ImportUploadResponse, ImportDetectResponse, ImportConfirmRequest, ImportTemplate)
provides:
  - XHR upload helper isolated in lib/ with no React dependency
  - Full useImports hook suite (7 exports) for all import API operations
  - deriveStep pure function mapping all 6 backend statuses to wizard step numbers
  - 16 passing Vitest tests covering IMPT-05, IMPT-06, IMPT-07
affects:
  - 14-03 (wizard UI components import from this hook layer)
  - 14-04 (history page imports useImports and useImportJob)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "uploadToMinIO uses XMLHttpRequest (not ky/fetch) to avoid Authorization header injection on MinIO presigned URLs"
    - "refetchInterval as function pattern: query callback checks data.status to stop polling at terminal states"
    - "Pure function (deriveStep) exported alongside hooks for testability without rendering"
    - "refetchInterval logic extracted as inline function for unit testing without full hook rendering"

key-files:
  created:
    - web/src/lib/uploadToMinIO.ts
    - web/src/hooks/useImports.ts
  modified:
    - web/src/hooks/useImports.test.ts

key-decisions:
  - "uploadToMinIO uses XMLHttpRequest not ky/fetch — ky interceptors add Authorization headers which break MinIO presigned URL auth"
  - "refetchInterval as function (not static number) allows per-query polling decisions based on current data state"
  - "deriveStep exported as standalone pure function (not hook) — enables unit testing without QueryClient wrapper"
  - "XHR upload tests kept as it.todo — JSDOM does not dispatch XMLHttpRequest.upload.onprogress events reliably"
  - "refetchInterval logic tested via extracted inline functions that mirror hook closures — avoids renderHook overhead for pure logic tests"

patterns-established:
  - "Test refetchInterval logic by extracting the decision function inline in tests (mirrors hook closure)"
  - "Keep XHR browser API tests as it.todo with explanatory comment when JSDOM cannot support the behavior"

requirements-completed: [IMPT-01, IMPT-02, IMPT-05, IMPT-06, IMPT-07]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 14 Plan 02: Import Data Layer Summary

**XHR upload helper (uploadToMinIO) and full useImports hook suite with deriveStep — 16 passing Vitest tests covering polling and status-mapping logic**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11T04:05:35Z
- **Completed:** 2026-03-11T04:09:28Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `web/src/lib/uploadToMinIO.ts` — pure XHR PUT upload with progress callback, no Authorization header, no React dependency
- Created `web/src/hooks/useImports.ts` — 7 exports covering all import API operations plus deriveStep status mapping
- Promoted 17 test stubs to 16 passing tests; 5 XHR-related stubs remain as it.todo with JSDOM rationale comment

## Task Commits

Each task was committed atomically:

1. **Task 1: XHR upload helper and useImports hook** - `cfd4840` (feat — included in Plan 01 docs commit)
2. **Task 2: Promote hook test stubs to passing tests** - `b9836c4` (test)

_Note: Implementation files (uploadToMinIO.ts, useImports.ts) were bundled into the Plan 01 final docs commit (cfd4840) by the prior agent session. Task 2 was the primary new work in this plan._

## Files Created/Modified
- `web/src/lib/uploadToMinIO.ts` - XHR PUT upload helper; no Authorization header, onProgress 0-100, resolves on 2xx
- `web/src/hooks/useImports.ts` - Full hook suite: useImports, useImportJob (with polling param), useInitiateImport, useDetectColumns, useConfirmMapping, useImportTemplates, deriveStep
- `web/src/hooks/useImports.test.ts` - 16 passing tests for deriveStep (7), useImportJob polling (5), useImports history polling (4); 5 XHR todos with JSDOM rationale

## Decisions Made
- **XHR over ky/fetch** for MinIO upload: ky interceptors inject `Authorization: Bearer ...` headers which invalidate presigned URL authentication. Raw XHR bypasses all interceptors.
- **refetchInterval as function**: React Query supports a function form that receives the query object, allowing status-aware polling decisions without external state.
- **deriveStep as pure function**: Exported separately from hooks to enable unit testing without QueryClient/React wrappers.
- **XHR tests as it.todo**: JSDOM's XMLHttpRequest implementation does not dispatch `upload.onprogress` events, making reliable XHR upload tests impossible without a browser-like environment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 artifacts pre-existed but were undocumented**
- **Found during:** Pre-task setup
- **Issue:** STATE.md showed Plan 01 as not yet reflected in state, but `git log` revealed Plan 01 was fully executed (commits cfd4840, 116f74d, 5820ed0) including `useImports.ts` and `uploadToMinIO.ts` already committed in the docs commit
- **Fix:** Recognized files were already present and correct; proceeded directly to Task 2 (test promotion) as the primary work
- **Impact:** No re-work needed; implementation files verified correct via TypeScript compilation and export review

---

**Total deviations:** 1 (informational — prior plan work already committed)
**Impact on plan:** No code changes needed; Task 1 was already complete. Task 2 delivered the primary new content.

## Issues Encountered
- Prior agent session (Plan 01) bundled Task 1 implementation files into its docs commit — files existed at session start. Verified correctness via TypeScript compilation and export enumeration before proceeding.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer is complete: `uploadToMinIO.ts` and `useImports.ts` ready to import
- Plan 03 (wizard UI components) can import `useInitiateImport`, `useDetectColumns`, `useConfirmMapping`, `uploadToMinIO`
- Plan 04 (history page) can import `useImports`, `useImportJob`, `deriveStep`
- TypeScript compiles cleanly with no errors

---
*Phase: 14-voter-import-wizard*
*Completed: 2026-03-11*
