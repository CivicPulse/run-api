# Phase 74: Data Integrity & Concurrency - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Concurrent writes cannot corrupt shift capacity, DNC uniqueness, invite state, or campaign ownership. Key tables have the indexes and constraints they need. Closes C9-C12 (capacity overflow, DNC race, invite compensation, missing indexes) and DATA-01..08 from CODEBASE-REVIEW-2026-04-04.md.

</domain>

<decisions>
## Implementation Decisions

### Concurrency Fix Strategies
- **C9 shift signup (DATA-01)**: Add `.with_for_update()` to `_get_shift_raw` in `app/services/shift.py` — matches existing `_promote_from_waitlist` pattern. Simple pessimistic lock.
- **C10 DNC bulk import (DATA-02)**: Replace per-row SELECT+INSERT loop with single `INSERT ... ON CONFLICT (campaign_id, phone_number) DO NOTHING` in `app/services/dnc.py`.
- **C11 invite compensation (DATA-03)**: Wrap `db.commit()` in try/except in `accept_invite`. On failure, call `zitadel.remove_project_role` to roll back the grant. Matches existing `join.py` compensating pattern.
- **C11 transfer_ownership (DATA-03)**: Same try/except pattern applied to `transfer_ownership` service method.

### Schema Changes & Test Strategy
- **DATA-04 voter_interactions indexes (C12)**: Add `__table_args__` with `Index("ix_voter_interactions_campaign_voter", "campaign_id", "voter_id")` and `Index("ix_voter_interactions_campaign_created", "campaign_id", "created_at")`.
- **DATA-05 re-invite uniqueness**: Partial unique index on `(campaign_id, email)` WHERE status = 'pending' — allows re-invite once previous is accepted/revoked.
- **DATA-06 VoterEmail**: Add unique constraint on `(campaign_id, voter_id, value)`.
- **DATA-07 VolunteerTag**: Add unique constraint on `(campaign_id, name)`.
- **DATA-08 migration**: Single migration `027_data_integrity.py` covering all indexes/constraints above. Atomic, reversible.
- **Test strategy**: `asyncio.gather` with 2 concurrent signup requests against shared DB — proves C9 race fix. Constraint violations tested via direct DB session attempts. All tests marked `@pytest.mark.integration` (require real Postgres).

### Claude's Discretion
- Whether to also test C10 concurrency with multiple DNC import jobs running simultaneously — at Claude's discretion based on test runtime budget.
- How to name the test file(s): one `test_data_integrity.py` vs. extending `test_shifts.py`, `test_dnc.py`, etc. — Claude to follow existing test layout conventions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_promote_from_waitlist` in `app/services/shift.py` already uses `.with_for_update()` — direct pattern reference for C9 fix.
- `app/services/join.py` has compensating ZITADEL cleanup — pattern reference for C11.
- Migration 003's `__table_args__` usage as a reference for adding indexes.
- `app.models.invite.Invite.status` enum for partial unique index predicate.

### Established Patterns
- SQLAlchemy async with `session.execute(query)` pattern.
- Migrations use `op.create_index`, `op.create_unique_constraint` (sequential numbering, next is 027).
- Integration tests marked `@pytest.mark.integration`.

### Integration Points
- `app/services/shift.py:364-398` — signup_volunteer, `_get_shift_raw`.
- `app/services/dnc.py:100-130` — bulk import loop.
- `app/services/invite.py:170-230` — accept_invite.
- `app/services/campaign.py` (transfer_ownership location TBD).
- `app/models/voter_interaction.py` — add __table_args__.
- `app/models/voter.py` (VoterEmail) — unique constraint.
- `app/models/volunteer.py` (VolunteerTag) — unique constraint.
- `app/models/invite.py` — partial unique index.

</code_context>

<specifics>
## Specific Ideas

- Follow exact fix snippets from CODEBASE-REVIEW C9-C12.
- Concurrent test uses real Postgres TestClient to validate SELECT FOR UPDATE semantics — mocks won't prove the race fix.
- Migration should include backfill for any existing duplicate data that would violate new unique constraints (detect + abort with clear error if found).

</specifics>

<deferred>
## Deferred Ideas

- Broader index audit across all tables — out of scope (focused on known-problematic tables per review).
- Optimistic locking strategy as alternative to SELECT FOR UPDATE — deferred unless pessimistic lock causes contention issues.

</deferred>
