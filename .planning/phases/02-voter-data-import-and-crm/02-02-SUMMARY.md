---
phase: 02-voter-data-import-and-crm
plan: 02
subsystem: api
tags: [rapidfuzz, csv, taskiq, s3, import-pipeline, fuzzy-matching, upsert]

requires:
  - phase: 02-voter-data-import-and-crm
    plan: 01
    provides: Voter model, ImportJob model, FieldMappingTemplate model, StorageService, TaskIQ broker, Pydantic schemas
provides:
  - ImportService with RapidFuzz fuzzy field mapping at 75% threshold
  - CSV column detection with UTF-8/Latin-1 fallback and BOM handling
  - Batch upsert via ON CONFLICT DO UPDATE (1000 rows/batch)
  - 6 import API endpoints (initiate, detect, confirm, status, list, templates)
  - Background TaskIQ task with RLS context for import processing
  - Error report generation and upload to S3
  - StorageService.upload_bytes() for server-side file uploads
affects: [02-03-search-filter, 02-04-interaction-contacts]

tech-stack:
  added: []
  patterns: [fuzzy-field-mapping, batch-csv-upsert, two-step-import-flow, background-task-rls]

key-files:
  created:
    - app/services/import_service.py
    - app/tasks/import_task.py
    - app/api/v1/imports.py
    - tests/unit/test_field_mapping.py
    - tests/unit/test_import_service.py
  modified:
    - app/api/v1/router.py
    - app/services/storage.py

key-decisions:
  - "RapidFuzz 75% threshold with dedup prevention (first match wins when multiple CSV columns map to same field)"
  - "StorageService.upload_bytes() added for server-side error report uploads (Rule 2 - missing critical)"
  - "source_id auto-generated as UUID when missing from CSV row (ensures upsert key exists)"
  - "Import confirm endpoint validates job status before allowing mapping confirmation"

patterns-established:
  - "Two-step import flow: initiate (pre-signed URL) -> detect (auto-suggest) -> confirm (dispatch task)"
  - "Background task creates own session and sets RLS context before DB operations"
  - "Field mapping dedup: once a canonical field is mapped, subsequent CSV columns cannot overwrite it"

requirements-completed: [VOTER-01, VOTER-02, VOTER-03]

duration: 4min
completed: 2026-03-09
---

# Phase 2 Plan 02: Import Pipeline Summary

**RapidFuzz-based CSV field mapping with 6 import API endpoints, TaskIQ background processing, and batch upsert with error reporting**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T17:52:11Z
- **Completed:** 2026-03-09T17:56:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- ImportService with 24-field canonical mapping dictionary including L2-specific aliases
- RapidFuzz fuzzy matching at 75% threshold with duplicate field prevention
- Complete import API: initiate, detect columns, confirm mapping, poll status, list jobs, list templates
- Background task with proper RLS context isolation and error handling
- 25 unit tests covering field mapping and CSV processing

## Task Commits

Each task was committed atomically:

1. **Task 1: ImportService -- field mapping and CSV processing** - `636bdb1` (feat)
2. **Task 2: Import API endpoints and background task** - `3bb4bd1` (feat)

## Files Created/Modified
- `app/services/import_service.py` - ImportService with fuzzy mapping, CSV detection, batch upsert, file processing
- `app/tasks/import_task.py` - Background TaskIQ task with RLS context and error handling
- `app/api/v1/imports.py` - 6 import workflow endpoints
- `app/api/v1/router.py` - Added imports router
- `app/services/storage.py` - Added upload_bytes() for server-side uploads
- `tests/unit/test_field_mapping.py` - 13 tests for fuzzy field mapping
- `tests/unit/test_import_service.py` - 12 tests for CSV processing and mapping

## Decisions Made
- RapidFuzz with 75% score_cutoff and `fuzz.ratio` scorer for column name matching
- Dedup prevention: first CSV column to match a canonical field wins; subsequent matches go to extra_data
- Auto-generated UUID source_id when CSV lacks a source ID column (ensures ON CONFLICT key always exists)
- Confirm endpoint checks job status (must be UPLOADED or PENDING) before accepting mapping
- Added StorageService.upload_bytes() method for error report CSV upload (not in original plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added StorageService.upload_bytes() method**
- **Found during:** Task 1 (process_import_file implementation)
- **Issue:** process_import_file needs to upload error report CSVs to S3, but StorageService only had pre-signed URL generation and download_file
- **Fix:** Added upload_bytes() method to StorageService for direct server-side uploads
- **Files modified:** app/services/storage.py
- **Verification:** Method accessible, follows existing _client_kwargs pattern
- **Committed in:** 636bdb1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for error report upload functionality. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Import pipeline complete: upload -> detect -> confirm -> process -> poll
- Voter records importable from generic CSV and L2 files
- Ready for search/filter endpoints (Plan 03)
- Ready for interaction/contacts (Plan 04)

---
*Phase: 02-voter-data-import-and-crm*
*Completed: 2026-03-09*

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (636bdb1, 3bb4bd1) verified in git log.
