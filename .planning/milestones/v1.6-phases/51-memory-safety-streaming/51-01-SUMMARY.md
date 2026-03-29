---
phase: 51-memory-safety-streaming
plan: 01
subsystem: api
tags: [streaming, csv, async-generator, encoding-detection, s3, minio]

# Dependency graph
requires:
  - phase: 50-per-batch-commits
    provides: StorageService.download_file async iterator and per-batch commit loop
provides:
  - stream_csv_lines async generator for incremental CSV line parsing from S3
  - _detect_encoding helper for first-chunk encoding detection
  - download_file chunk_size parameter (64KB default) for efficient S3 streaming
affects: [51-02-streaming-integration, import-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-byte-to-line-iterator, first-chunk-encoding-detection, remainder-buffer-line-reconstruction]

key-files:
  created:
    - tests/unit/test_streaming_csv.py
  modified:
    - app/services/storage.py
    - app/services/import_service.py

key-decisions:
  - "Module-level functions (_detect_encoding, stream_csv_lines) above ImportService class for reusability"
  - "utf-8-sig tried first for encoding detection (handles BOM); latin-1 as universal fallback"
  - "64KB chunk size default replaces aiobotocore's 1024-byte default (460 vs 30,000 chunks for 30MB file)"

patterns-established:
  - "Remainder buffer pattern: bytes.split(b'\\n') with pop() to carry incomplete lines across chunks"
  - "Encoding detection from first chunk only, applied to all subsequent chunks"

requirements-completed: [MEMD-01]

# Metrics
duration: 2min
completed: 2026-03-29
---

# Phase 51 Plan 01: Streaming CSV Line Iterator Summary

**Async generator streaming CSV lines from S3 byte chunks with first-chunk encoding detection, BOM stripping, and 64KB chunking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-29T01:04:36Z
- **Completed:** 2026-03-29T01:07:08Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created `stream_csv_lines()` async generator that yields decoded text lines from arbitrary S3 byte chunks, reconstructing lines split across chunk boundaries
- Created `_detect_encoding()` helper that probes the first chunk for utf-8-sig (with BOM handling) and falls back to latin-1
- Added `chunk_size` parameter to `StorageService.download_file()` (default 64KB), reducing chunk count from ~30,000 to ~460 for a 30MB file
- 9 comprehensive unit tests covering multi-chunk reconstruction, encoding detection, BOM stripping, CRLF handling, empty lines, single chunk, incremental yielding, and no-trailing-newline

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for streaming CSV** - `61c8b92` (test)
2. **Task 1 (GREEN): Implement streaming CSV line iterator** - `f6b9a3a` (feat)

## Files Created/Modified
- `tests/unit/test_streaming_csv.py` - 9 unit tests for stream_csv_lines and _detect_encoding
- `app/services/storage.py` - Added chunk_size parameter to download_file (default 64KB)
- `app/services/import_service.py` - Added _detect_encoding, stream_csv_lines, _STREAM_CHUNK_SIZE constant, AsyncIterator import

## Decisions Made
- Module-level functions placed above ImportService class for clean separation and reusability
- utf-8-sig codec handles BOM stripping automatically even on per-line decode -- no manual BOM removal needed
- Remainder buffer pattern (`bytes.split(b"\n")` + `pop()`) chosen over `iter_lines()` which is CSV-incompatible (breaks on quoted fields with embedded newlines)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Minor lint fix: removed unused `asyncio` import from test file (auto-fixed during GREEN phase)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `stream_csv_lines` and `_detect_encoding` are ready for Plan 02 to wire into `process_import_file()`
- Existing batch resilience tests (13 tests) pass unchanged -- download_file signature is backward-compatible via default chunk_size
- No stubs or placeholder implementations

## Self-Check: PASSED

---
*Phase: 51-memory-safety-streaming*
*Completed: 2026-03-29*
