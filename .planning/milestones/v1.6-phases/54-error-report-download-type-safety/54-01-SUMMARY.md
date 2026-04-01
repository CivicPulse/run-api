---
phase: 54-error-report-download-type-safety
plan: 01
subsystem: ui
tags: [typescript, minio, presigned-url, import-wizard]

# Dependency graph
requires:
  - phase: 50-resumable-batch-commits
    provides: "error_report_key pre-signed URL generation in get_import_status endpoint"
provides:
  - "Corrected ImportUploadResponse TS type with file_key (matching backend schema)"
  - "Working error report download link using MinIO pre-signed URL"
  - "Corrected JSDoc comment for useInitiateImport hook"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-origin MinIO downloads use target=_blank rel=noopener noreferrer (not download attribute)"

key-files:
  created: []
  modified:
    - web/src/types/import-job.ts
    - web/src/hooks/useImports.ts
    - web/src/routes/campaigns/$campaignId/voters/imports/new.tsx

key-decisions:
  - "Removed download attribute from error report link (ignored by browsers for cross-origin URLs per HTML spec)"

patterns-established:
  - "Pre-signed MinIO URLs used directly as href (not proxied through API routes)"

requirements-completed: [RESL-05]

# Metrics
duration: 1min
completed: 2026-03-29
---

# Phase 54 Plan 01: Error Report Download & Type Safety Summary

**Fixed broken error report download link to use MinIO pre-signed URL and aligned ImportUploadResponse type with backend schema (file_key replaces phantom expires_in)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-29T05:36:12Z
- **Completed:** 2026-03-29T05:37:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced phantom `expires_in: number` with `file_key: string` in ImportUploadResponse type to match backend schema
- Fixed error report download link to use `jobQuery.data.error_report_key` (pre-signed MinIO URL) instead of non-existent `/api/v1/.../error-report` API route
- Updated JSDoc comment in useImports.ts to reflect correct response shape

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ImportUploadResponse type and stale JSDoc comment** - `2674324` (fix)
2. **Task 2: Fix error report download link to use pre-signed URL** - `b4bf4d0` (fix)

## Files Created/Modified
- `web/src/types/import-job.ts` - Replaced `expires_in: number` with `file_key: string` in ImportUploadResponse interface
- `web/src/hooks/useImports.ts` - Updated JSDoc comment from `expires_in` to `file_key`
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` - Changed error report link href from fake API route to pre-signed URL, added target="_blank" rel="noopener noreferrer", removed download attribute

## Decisions Made
- Removed `download` attribute from error report link because it is ignored by browsers for cross-origin URLs (MinIO URLs are cross-origin in both dev and prod)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Error report download works end-to-end (pre-signed URL opens in new tab)
- TypeScript compiles clean with zero errors
- All 27 import-related tests pass
- 1 pre-existing test failure in shifts/index.test.tsx (unrelated to this plan, from phase 18)

## Self-Check: PASSED

- All 3 modified files exist on disk
- Commit 2674324 (Task 1) found in git log
- Commit b4bf4d0 (Task 2) found in git log
- SUMMARY.md created at expected path

---
*Phase: 54-error-report-download-type-safety*
*Completed: 2026-03-29*
