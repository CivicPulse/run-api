---
phase: 74-data-integrity-concurrency
type: phase-summary
milestone: v1.12-hardening-remediation
wave: 3
status: complete

requirements-closed:
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
  - DATA-05
  - DATA-06
  - DATA-07
  - DATA-08

issues-closed:
  - C9  # shift signup capacity overflow (TOCTOU race)
  - C10 # DNC bulk import per-row race
  - C11 # accept_invite + transfer_ownership orphaned ZITADEL grants
  - C12 # missing composite indexes on voter_interactions
  - C13 # missing uniqueness on VoterEmail / VolunteerTag / pending invites
  - H3  # empty transfer_ownership compensation block
  - H18 # pending-invite re-invite blocked
  - H19 # voter_interactions hot-path index gap

plans:
  - 74-01  # migration 027 + model __table_args__ + test scaffold
  - 74-02  # C9 shift SELECT FOR UPDATE + C10 DNC ON CONFLICT DO NOTHING
  - 74-03  # C11 invite + transfer_ownership compensating transactions
  - 74-04  # regression sweep + phase summary (this plan)

tech-stack:
  added:
    - sqlalchemy.dialects.postgresql.insert (pg_insert) for batched upsert
  patterns-established:
    - "Pessimistic row lock via .with_for_update() at query chokepoint"
    - "Batched ON CONFLICT DO NOTHING for idempotent bulk upserts"
    - "Compensating-transaction: try/except around db.commit() + reverse ZITADEL side-effects"
    - "Partial unique index via raw op.execute (SQLAlchemy cannot declaratively express)"
    - "asyncio.gather concurrent test with per-coroutine async_sessionmaker"

key-files:
  created:
    - alembic/versions/027_data_integrity.py
    - tests/integration/test_data_integrity.py
  modified:
    - app/services/shift.py
    - app/services/dnc.py
    - app/services/invite.py
    - app/api/v1/members.py
    - app/models/voter_interaction.py
    - app/models/voter_contact.py
    - app/models/volunteer.py
    - app/models/invite.py
    - tests/unit/test_dnc.py
    - tests/unit/test_invite_service.py
    - tests/unit/test_api_members.py

metrics:
  plans_completed: 4
  duration: ~40min total (3m + 8m + 25m + 4m)
  commits: 15
  tests_added: 12 (8 integration + 4 unit)
  completed: 2026-04-05
---

# Phase 74: Data Integrity & Concurrency — Summary

**Concurrent writes can no longer corrupt shift capacity, DNC uniqueness, invite state, or campaign ownership. All 8 DATA-* requirements closed across 4 plans using pessimistic locking, ON CONFLICT upserts, compensating transactions, and a single atomic DDL migration.**

## One-liner

Closed 8 data-integrity issues (C9-C13, H3, H18, H19) with row-level locking on shift signup, batched ON CONFLICT imports for DNC, compensating ZITADEL rollback on accept_invite + transfer_ownership commit failure, and migration 027 adding composite indexes, unique constraints, and a partial unique index for re-invite semantics.

## Requirements Closed

| Req ID  | Description                                                      | Plan   | Fix                                                   |
| ------- | ---------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| DATA-01 | Shift signup capacity cannot be exceeded under concurrent writes | 74-02  | `SELECT ... FOR UPDATE` on `_get_shift_raw`           |
| DATA-02 | DNC bulk import handles overlapping rows without IntegrityError  | 74-02  | `pg_insert().on_conflict_do_nothing()` batched upsert |
| DATA-03 | accept_invite + transfer_ownership compensate ZITADEL on failure | 74-03  | try/except around `db.commit()` with reverse grants   |
| DATA-04 | voter_interactions composite indexes                             | 74-01  | Migration 027 + `__table_args__`                      |
| DATA-05 | Re-invite after accept/revoke allowed                            | 74-01  | Partial unique index (WHERE pending)                  |
| DATA-06 | VoterEmail unique(campaign_id, voter_id, value)                  | 74-01  | Migration 027 + `__table_args__`                      |
| DATA-07 | VolunteerTag unique(campaign_id, name)                           | 74-01  | Migration 027 + `__table_args__`                      |
| DATA-08 | Single atomic migration for all schema changes                   | 74-01  | `alembic/versions/027_data_integrity.py`              |

## Codebase Review Issues Closed

| Issue | Description                                         | Closed By |
| ----- | --------------------------------------------------- | --------- |
| C9    | Shift signup capacity TOCTOU race                   | 74-02     |
| C10   | DNC bulk import per-row SELECT+INSERT race          | 74-02     |
| C11   | accept_invite + transfer_ownership orphaned grants  | 74-03     |
| C12   | Missing composite indexes on voter_interactions     | 74-01     |
| C13   | Missing uniqueness on VoterEmail / VolunteerTag     | 74-01     |
| H3    | Empty `pass` in transfer_ownership compensation     | 74-03     |
| H18   | Pending-invite email could not be re-invited        | 74-01     |
| H19   | voter_interactions hot-path scan without index      | 74-01     |

## Key Decisions

1. **Pessimistic over optimistic locking** — `SELECT FOR UPDATE` at the single `_get_shift_raw` chokepoint (all 8 writers use it) rather than per-row version columns or retry loops. Matches existing `_promote_from_waitlist` pattern. If contention becomes a problem, optimistic locking is deferred as a follow-up (noted in 74-CONTEXT.md).

2. **Single migration 027** — one atomic, reversible DDL file covers all 8 schema changes (composite indexes, unique constraints, partial index) rather than 5+ micro-migrations. Includes inline backfill (DELETE duplicates keeping MIN(id)) safe on dev-only DB.

3. **Raw-SQL partial unique index** — SQLAlchemy cannot declaratively express partial constraints, so the `invites (email, campaign_id) WHERE pending` index is emitted via `op.execute(...)` (Option 1 from RESEARCH). Matches procrastinate migration 017's pattern.

4. **Compensating-transaction pattern codified** — now used in 3 code paths (join, accept_invite, transfer_ownership). Each inverse ZITADEL call wrapped in its own try/except so partial compensation failure doesn't block subsequent reversal steps. Original commit exception always re-raised.

5. **Role-swap compensation boundary** — in transfer_ownership, the role-swap edge case compensates only the *new* role grant (per RESEARCH Open Question 2). Documented in 74-03 summary.

## Test Additions

- **8 integration tests** (`tests/integration/test_data_integrity.py`):
  - `test_shift_signup_race_no_overflow` (asyncio.gather concurrent signups at capacity=1)
  - `test_dnc_concurrent_import` (overlapping CSVs, union row count)
  - `test_voter_interactions_indexes_exist`
  - `test_reinvite_after_accept_allowed`
  - `test_duplicate_pending_invite_blocked`
  - `test_voter_email_unique_violation`
  - `test_volunteer_tag_unique_violation`
  - `test_dnc_has_unique_constraint`

- **4 new unit tests**:
  - `test_bulk_import_with_conflicts` (74-02)
  - `test_bulk_import_all_invalid_no_execute` (74-02)
  - `test_accept_commit_failure_removes_role` (74-03)
  - `test_accept_commit_failure_cleanup_also_fails` (74-03)
  - `test_transfer_ownership_partial_compensation_failure` (74-03)

## Verification

| Check                                                                    | Result |
| ------------------------------------------------------------------------ | ------ |
| `pytest tests/integration/test_data_integrity.py` (8 tests)              | PASSED |
| Phase-74 touched unit tests (shifts + dnc + invite + members transfer)   | PASSED |
| Migration 027 round-trip (downgrade -1 → upgrade head)                   | PASSED |
| Ruff on all phase-74 touched files                                       | PASSED |
| Regression delta vs baseline (pre-phase-74)                              | 0 new failures, 8 pre-existing tests fixed |

Full `pytest tests/unit/` shows 61 pre-existing failures (down from 69 on baseline `fd5a5bc`). Phase 74 introduced **zero regressions** — the 8 tests that went green are `TestTransferOwnership` / `TestUpdateMemberRole` / `TestRemoveMember` fixed by the RLS-scalar-mock addition in 74-03.

## Follow-ups / Deferred

- **Broader index audit** across remaining tables — out of scope, focused on known-problematic tables per CODEBASE-REVIEW-2026-04-04.md.
- **Optimistic locking alternative** — deferred unless pessimistic `FOR UPDATE` causes contention issues in production.
- **Pre-existing test infrastructure gaps** (61 unit test failures unrelated to phase 74) — tracked in `.planning/phases/74-data-integrity-concurrency/deferred-items.md`. Requires dedicated test-infra phase to fix `ensure_user_synced` RLS-scalar mock coverage globally.
- **Full `alembic downgrade base`** fails on an unrelated pre-existing column reference (`zip_code` in an earlier migration). Not introduced by phase 74; does not affect 027 round-trip.

## Patterns Established

1. **Pessimistic lock at chokepoint** — one `.with_for_update()` call at a shared loader function protects all callers.
2. **Batched ON CONFLICT upserts** — replaces per-row SELECT+INSERT loops for any idempotent bulk import.
3. **Compensating-transaction template** — try/except around `db.commit()`, rollback, then reverse each external side-effect in individual try/except blocks, always re-raise original.
4. **Concurrent integration test harness** — `asyncio.gather` + per-coroutine `async_sessionmaker` proves real race fixes (mocks can't).
5. **Raw-SQL partial indexes in alembic** — `op.execute("CREATE UNIQUE INDEX ... WHERE ...")` with explicit `DROP INDEX` in downgrade.

## Self-Check: PASSED

Files created/modified verified present:
- alembic/versions/027_data_integrity.py — FOUND
- tests/integration/test_data_integrity.py — FOUND (8 tests, all active)
- app/services/shift.py — FOUND (contains `with_for_update`)
- app/services/dnc.py — FOUND (contains `on_conflict_do_nothing`)
- app/services/invite.py — FOUND (contains compensating try/except)
- app/api/v1/members.py — FOUND (4 inverse ZITADEL calls)
- app/models/voter_interaction.py, voter_contact.py, volunteer.py, invite.py — FOUND (all with __table_args__ changes)

Commits verified in git log:
- f7d986a, 1fcf377, 98cdf3f (74-01)
- c61db69, b7f271c (74-02)
- 22eeca8, db3f0e7, 628a198, 9103cb2 (74-03)
- 4eedb03 (74-04 DNC concurrent test unskip)

---
*Phase: 74-data-integrity-concurrency*
*Milestone: v1.12 Hardening & Remediation*
*Completed: 2026-04-05*
