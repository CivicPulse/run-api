---
phase: 51-memory-safety-streaming
plan: 02
subsystem: api
tags: [streaming, csv, memory-safety, async-generator, import-pipeline]

# Dependency graph
requires:
  - phase: 51-memory-safety-streaming
    plan: 01
    provides: stream_csv_lines async generator, _detect_encoding helper, download_file chunk_size parameter
provides:
  - process_import_file streaming integration (memory-bounded CSV import from S3)
  - Updated batch resilience test mocks compatible with streaming download_file signature
affects: [import-pipeline, 52-l2-auto-mapping]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-line-csv-reader-with-header-dict-zip, streaming-csv-integration]

key-files:
  created: []
  modified:
    - app/services/import_service.py
    - tests/unit/test_batch_resilience.py

key-decisions:
  - "Per-line csv.reader([line]) with dict(zip(header, values)) replaces csv.DictReader(io.StringIO(...))"
  - "UnicodeDecodeError from stream_csv_lines caught at process_import_file level to match existing error handling"

patterns-established:
  - "Streaming CSV integration: async for line in stream_csv_lines() with header extraction and per-line parsing"

requirements-completed: [MEMD-01]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 51 Plan 02: Streaming Integration Summary

**Replaced download-all CSV preamble with streaming line iterator in process_import_file, bounding memory to ~2 batches + 1 chunk regardless of file size**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T01:09:29Z
- **Completed:** 2026-03-29T01:13:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the download-all-then-parse pattern (chunks list, b"".join, decode, StringIO, DictReader) with `async for line in stream_csv_lines()` in `process_import_file()`
- CSV rows now parsed one line at a time using `csv.reader([line])` with header dict-zip, never materializing the full file in memory
- Updated all 8 `mock_download` functions in batch resilience tests to accept `chunk_size` keyword argument
- All 575 unit tests pass with zero regressions; per-batch commit loop, crash resume, and error storage unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace download-all preamble with streaming line iterator** - `aed1b56` (feat)
2. **Task 2: Update batch resilience test mocks for streaming compatibility** - `342a042` (fix)

## Files Created/Modified
- `app/services/import_service.py` - Replaced lines 1085-1145 (download/decode/StringIO/DictReader + for loop) with streaming async for loop and try/except UnicodeDecodeError
- `tests/unit/test_batch_resilience.py` - Added `chunk_size=65_536` parameter to all 8 `mock_download` async generator functions

## Decisions Made
- Used `csv.reader([line])` per line with `dict(zip(header, values, strict=False))` instead of `csv.DictReader` -- DictReader is synchronous and requires an iterable of all lines; per-line parsing is more memory-efficient
- Wrapped the entire `async for line in stream_csv_lines(...)` block in try/except UnicodeDecodeError to match the existing encoding error handling behavior (set FAILED status + error message)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 51 (memory-safety-streaming) is complete: both the streaming iterator (Plan 01) and its integration (Plan 02) are done
- Import pipeline now streams CSV files from S3 incrementally with bounded memory
- All existing behavior preserved: per-batch commits, crash resume, error storage, encoding detection
- Ready for Phase 52 (L2 auto-mapping) and Phase 53 (cancellation/concurrency safety)

## Self-Check: PASSED

---
*Phase: 51-memory-safety-streaming*
*Completed: 2026-03-29*
