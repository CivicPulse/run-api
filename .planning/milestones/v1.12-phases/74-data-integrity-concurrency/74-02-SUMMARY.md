---
phase: 74-data-integrity-concurrency
plan: 02
subsystem: concurrency
tags: [concurrency, postgres, locking, upsert, dnc, shifts]
requires:
  - 74-01 (migration 027, integration test scaffold)
provides:
  - _get_shift_raw pessimistic row lock (SELECT ... FOR UPDATE)
  - DNC bulk_import batched ON CONFLICT DO NOTHING
affects:
  - signup_volunteer capacity enforcement
  - update_shift / update_status / delete_shift / check_in_volunteer (all write paths use _get_shift_raw)
  - DNC bulk import throughput and correctness
tech-stack:
  added:
    - sqlalchemy.dialects.postgresql.insert (pg_insert) for on_conflict_do_nothing
  patterns:
    - Pessimistic locking via .with_for_update() mirrors _promote_from_waitlist
    - Batched upsert via pg_insert().values(rows).on_conflict_do_nothing(index_elements=...)
key-files:
  created: []
  modified:
    - app/services/shift.py
    - app/services/dnc.py
    - tests/unit/test_dnc.py
decisions:
  - Lock at _get_shift_raw (single chokepoint) rather than per-caller — all 8 callers are write paths.
  - ON CONFLICT DO NOTHING preferred over DO UPDATE (import semantics = leave existing rows alone).
  - rowcount from the batched insert drives added; skipped derived as len(rows) - added.
  - Short-circuit when rows list is empty (no execute call) to avoid an empty VALUES clause.
metrics:
  duration: ~8m
  tasks_completed: 2
  files_modified: 3
  completed: 2026-04-05
requirements:
  - DATA-01
  - DATA-02
---

# Phase 74 Plan 02: Shift Lock + DNC ON CONFLICT Summary

Applied C9 pessimistic row lock to shift signup and rewrote DNC bulk import as a single batched ON CONFLICT DO NOTHING — closes the two highest-impact concurrency races from CODEBASE-REVIEW-2026-04-04.

## Tasks Completed

### Task 1: Add .with_for_update() to _get_shift_raw (C9 / DATA-01)

Added SELECT ... FOR UPDATE to the single chokepoint `_get_shift_raw` in `app/services/shift.py`. All 8 write-path callers (signup_volunteer, update_shift, update_status, delete_shift, check_in_volunteer, etc.) now hold a row-level lock on the target shift for the duration of their transaction, preventing capacity overflow under concurrent signups.

- **Verification:** `test_shift_signup_race_no_overflow` (5/5 iterations, capacity=1, two concurrent signups) — PASSED.
- **No regressions:** all 23 tests in `tests/unit/test_shifts.py` still pass (mocks use execute side_effect lists unaffected by method chaining, per research P2).
- **Commit:** c61db69

### Task 2: Rewrite DNC bulk_import to batched ON CONFLICT (C10 / DATA-02)

Replaced the per-row SELECT+INSERT loop (TOCTOU race) with a single batched `pg_insert(DoNotCallEntry).values(rows).on_conflict_do_nothing(index_elements=["campaign_id","phone_number"])`. Overlapping phone numbers across concurrent imports are now silently skipped at the DB level — no `IntegrityError` surfaces to callers.

- **Semantics:** `added = result.rowcount`; `skipped = len(rows) - added`; `invalid` unchanged (regex pre-filter).
- **Short-circuit:** when every row is invalid (rows empty), no execute call is issued.
- **Unit tests rewritten:** `test_bulk_import_csv` + `test_bulk_import_invalid_phones` updated to batch semantics; added two new tests (`test_bulk_import_with_conflicts`, `test_bulk_import_all_invalid_no_execute`) for conflict + short-circuit paths.
- **Commit:** b7f271c

## Verification Results

| Check | Result |
| --- | --- |
| `tests/unit/test_shifts.py` (23 tests) | PASSED |
| `tests/unit/test_dnc.py` (9 tests, 4 new) | PASSED |
| `tests/integration/test_data_integrity.py::test_shift_signup_race_no_overflow` | PASSED (5/5 iterations) |
| `ruff check app/services/shift.py app/services/dnc.py tests/unit/test_dnc.py` | PASSED |

## Must-Haves Verified

- `_get_shift_raw acquires a row-level lock (SELECT ... FOR UPDATE)` — yes, `.with_for_update()` at app/services/shift.py:143
- `Two concurrent shift signups at capacity=1 never both succeed` — yes, integration test passes
- `DNC bulk import uses single batched INSERT ... ON CONFLICT DO NOTHING` — yes, app/services/dnc.py uses pg_insert + on_conflict_do_nothing
- `DNC bulk import with overlapping rows returns correct added/skipped/invalid counts without surfacing IntegrityError` — yes, verified via unit tests (including rowcount=2 for 3 rows scenario → skipped=1)

## Key Links (contracts)

- `app/services/shift.py:_get_shift_raw` → Postgres shifts row lock via `SQLAlchemy select().with_for_update()`
- `app/services/dnc.py:bulk_import` → `uq_dnc_campaign_phone` constraint via `on_conflict_do_nothing(index_elements=['campaign_id','phone_number'])`

## Deviations from Plan

None — plan executed exactly as written. Optional concurrent DNC integration test (`test_dnc_concurrent_import`) was temporarily added but left skipped (as in the original scaffold) because Plan 74-03 owns overlapping test file edits (parallel wave constraint). Unit test coverage for the conflict path is sufficient.

## Commits

| Task | Hash | Message |
| --- | --- | --- |
| 1 | c61db69 | feat(74-02): add with_for_update to _get_shift_raw (C9/DATA-01) |
| 2 | b7f271c | feat(74-02): batched DNC bulk_import with ON CONFLICT DO NOTHING (C10/DATA-02) |

## Self-Check

Files exist:
- app/services/shift.py (modified, contains `with_for_update`)
- app/services/dnc.py (modified, contains `on_conflict_do_nothing`)
- tests/unit/test_dnc.py (modified, 9 tests)

Commits exist:
- c61db69 on gsd/v1.12-hardening-remediation
- b7f271c on gsd/v1.12-hardening-remediation

## Self-Check: PASSED
