---
phase: 62-resilience-cancellation
plan: 03
subsystem: api
tags: [imports, postgres, deadlocks, testing]
requires:
  - phase: 62-resilience-cancellation
    provides: stable chunk lifecycle and cancellation-aware fan-in
provides:
  - deterministic voter upsert ordering on the real conflict key
  - deterministic inline phone upsert ordering on the phone uniqueness key
  - regression coverage for ordered batch processing
affects: [phase-62-resilience, import-batch-processing]
tech-stack:
  added: []
  patterns:
    [
      deterministic conflict-key ordering before ON CONFLICT writes,
      single-pass ordering that preserves voter-phone association,
    ]
key-files:
  created:
    - .planning/phases/62-resilience-cancellation/62-03-SUMMARY.md
  modified:
    - app/services/import_service.py
    - tests/unit/test_import_service.py
key-decisions:
  - "Sorted voter upsert payloads on campaign_id/source_type/source_id before INSERT ... ON CONFLICT."
  - "Sorted phone upsert payloads on campaign_id/voter_id/value while keeping voter-phone pairing derived from the already ordered voter batch."
patterns-established:
  - "Deadlock mitigation belongs inside process_csv_batch(), not in worker orchestration."
requirements-completed: [RESL-04]
duration: 6min
completed: 2026-04-03
---

# Phase 62 Plan 03: Resilience & Cancellation Summary

**Deterministic conflict-key ordering inside the batch upsert path to reduce cross-chunk deadlocks**

## Accomplishments

- Added `_voter_conflict_sort_key()` and `_phone_conflict_sort_key()` helpers and applied them inside `process_csv_batch()` before the voter and phone upserts.
- Preserved voter-phone association by sorting the combined voter/phone payload once before deriving both upsert lists.
- Added unit coverage that proves ordered batch processing rather than input-order writes.

## Verification

- `uv run pytest tests/unit/test_import_service.py -x`

## Next Phase Readiness

- Phase 62 now leaves the parallel import path with stable lock ordering ahead of Phase 63’s secondary-work offloading.
