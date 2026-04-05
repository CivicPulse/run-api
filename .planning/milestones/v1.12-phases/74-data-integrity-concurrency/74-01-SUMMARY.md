---
phase: 74-data-integrity-concurrency
plan: 01
subsystem: database
tags: [postgres, alembic, sqlalchemy, indexes, unique-constraints, partial-index, concurrency]

requires:
  - phase: 72-rls-hardening
    provides: migration 026_rls_hardening (down_revision chain anchor)
provides:
  - Migration 027_data_integrity with indexes, unique constraints, and partial unique index
  - __table_args__ on VoterInteraction, VoterEmail, VolunteerTag (ORM mirrors DB)
  - Removed unconditional UniqueConstraint from Invite model (replaced by DB partial index)
  - Integration test scaffold tests/integration/test_data_integrity.py (7 active + 1 skipped)
affects: [74-02, 74-03, 74-04, phone-banking, invites, voter-contacts, volunteer-tags]

tech-stack:
  added: []
  patterns:
    - "Partial unique index via raw op.execute (matches procrastinate 017 pattern)"
    - "Duplicate backfill in migration (DELETE USING self-join keeping MIN(id))"
    - "asyncio.gather concurrent test with per-coroutine async_sessionmaker"

key-files:
  created:
    - alembic/versions/027_data_integrity.py
    - tests/integration/test_data_integrity.py
  modified:
    - app/models/voter_interaction.py
    - app/models/voter_contact.py
    - app/models/volunteer.py
    - app/models/invite.py

key-decisions:
  - "Partial unique index on pending invites uses raw SQL (matches procrastinate 017; SQLAlchemy cannot express partial constraints declaratively)"
  - "Backfill strategy: DELETE duplicates keeping lowest id (dev-only DB, no production data at risk)"
  - "Kept existing Index in VolunteerTag __table_args__ alongside new UniqueConstraint"
  - "Removed __table_args__ entirely from Invite model rather than keeping empty tuple"

patterns-established:
  - "Pattern 1: Partial unique index via op.execute with inline WHERE predicate"
  - "Pattern 2: Idempotent duplicate-dedup backfill inside migration upgrade()"
  - "Pattern 3: Integration test scaffold with per-test campaign+user seed/teardown helpers"

requirements-completed: [DATA-04, DATA-05, DATA-06, DATA-07, DATA-08]

duration: 3 min
completed: 2026-04-05
---

# Phase 74 Plan 01: Migration 027 + Model __table_args__ + Integration Test Scaffold Summary

**Composite indexes on voter_interactions, unique constraints on voter_emails / volunteer_tags, partial unique index on pending invites, and 7 integration tests scaffolded for phase 74 wave 0.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05T00:41:43Z
- **Completed:** 2026-04-05T00:45:19Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Migration 027_data_integrity applies and reverses cleanly on dev DB
- SQLAlchemy metadata (`__table_args__`) on 4 models now mirrors DB schema
- Partial unique index on `invites (email, campaign_id) WHERE accepted_at IS NULL AND revoked_at IS NULL` enables re-invite after accept/revoke
- 7 integration tests green (1 intentionally skipped for Plan 02)
- Verified pre-existing `uq_dnc_campaign_phone` prerequisite for C10 ON CONFLICT fix in Plan 02

## Task Commits

1. **Task 1: Update 4 models with __table_args__** - `f7d986a` (feat)
2. **Task 2: Create migration 027_data_integrity.py** - `1fcf377` (feat)
3. **Task 3: Create tests/integration/test_data_integrity.py** - `98cdf3f` (test)

## Files Created/Modified

- `alembic/versions/027_data_integrity.py` - Indexes, unique constraints, partial unique invite index (115 lines)
- `tests/integration/test_data_integrity.py` - 8 test functions (7 active, 1 skipped) with seed/teardown helpers
- `app/models/voter_interaction.py` - Added 2 composite indexes in `__table_args__`
- `app/models/voter_contact.py` - VoterEmail `__table_args__` with unique constraint
- `app/models/volunteer.py` - VolunteerTag `__table_args__` gains unique constraint alongside existing index
- `app/models/invite.py` - Dropped `UniqueConstraint`; comment points to migration 027 partial index

## Decisions Made

- **Partial unique index via raw SQL (`op.execute`)** — matches procrastinate migration 017 pattern. SQLAlchemy cannot declaratively express partial constraints, so the ORM stays silent and Postgres enforces.
- **Dup backfill inside migration** — DELETE with self-join keeping MIN(id) for voter_emails and volunteer_tags. Safe on dev-only DB; no production data exists yet for phase 74 target tables.
- **Invite `__table_args__` removed entirely** — cleaner than keeping an empty tuple. Inline comment documents the DB-side partial index.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Local pytest port mismatch** — `TEST_DB_PORT` defaults to `5433` but compose maps postgres to an ephemeral port (currently `49374`). Tests must be run with `TEST_DB_PORT=<exposed-port> uv run pytest ...`. Not a code issue; pre-existing test infrastructure behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 74-02 (concurrency code fixes)** — migration + schema + test scaffold in place
  - C9: `_get_shift_raw` needs `.with_for_update()` (DATA-01, `test_shift_signup_race_no_overflow` will strengthen)
  - C10: DNC bulk import ON CONFLICT rewrite — prerequisite `uq_dnc_campaign_phone` verified present
  - C11: invite accept + transfer_ownership compensating transactions
- **No blockers** — all DDL prerequisites for Plans 02/03/04 are live.

## Self-Check: PASSED

- alembic/versions/027_data_integrity.py — FOUND
- tests/integration/test_data_integrity.py — FOUND
- app/models/voter_interaction.py — FOUND (modified)
- app/models/voter_contact.py — FOUND (modified)
- app/models/volunteer.py — FOUND (modified)
- app/models/invite.py — FOUND (modified)
- Commits f7d986a, 1fcf377, 98cdf3f — FOUND in git log

---
*Phase: 74-data-integrity-concurrency*
*Completed: 2026-04-05*
