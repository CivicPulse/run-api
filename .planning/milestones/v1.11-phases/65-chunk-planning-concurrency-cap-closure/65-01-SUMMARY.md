---
phase: 65-chunk-planning-concurrency-cap-closure
plan: 01
subsystem: backend
tags: [imports, chunk-planning, storage, testing]
requires:
  - phase: 60-parent-split-parallel-processing
    provides: deterministic chunk planning seam
provides:
  - S3 object-size metadata lookup
  - file-size-aware chunk planning
  - focused unit coverage for CHUNK-06
affects: [phase-65-planning, import-service, storage-service]
tech-stack:
  added: []
  patterns:
    [metadata-backed sizing input, bind-limit plus byte-budget chunk clamping]
key-files:
  created:
    - .planning/phases/65-chunk-planning-concurrency-cap-closure/65-01-SUMMARY.md
  modified:
    - app/services/storage.py
    - app/services/import_service.py
    - tests/unit/test_import_service.py
key-decisions:
  - "Used `head_object` metadata instead of re-downloading CSVs to estimate size."
  - "Kept bind-limit safety as the hard ceiling while adding a byte-budget clamp for wide files."
patterns-established:
  - "Chunk planning now accepts durable file metadata as an explicit input instead of inferring everything from row count."
requirements-completed: [CHUNK-06]
duration: 12min
completed: 2026-04-03
---

# Phase 65 Plan 01: Chunk Planning & Concurrency Cap Closure Summary

**File-size-aware chunk planning and metadata lookup**

## Accomplishments

- Added `StorageService.get_object_size()` so import orchestration can read object byte length without a second full-file stream.
- Extended `plan_chunk_ranges()` to accept `file_size_bytes` and clamp rows per chunk by bind limit, default chunk size, and a byte-budget heuristic.
- Added unit coverage proving identical row counts split differently for materially different file sizes while preserving the existing bind-limit ceiling.

## Verification

- `uv run pytest tests/unit/test_import_service.py -x`

## Next Phase Readiness

- Parent orchestration can now consume a repaired chunk planner that reflects both schema pressure and file characteristics.
