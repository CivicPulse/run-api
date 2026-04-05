# Phase 74: Data Integrity & Concurrency — Research

**Researched:** 2026-04-04
**Domain:** PostgreSQL concurrency, SQLAlchemy async locking, alembic migrations
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Concurrency Fix Strategies**
- **C9 shift signup (DATA-01)**: Add `.with_for_update()` to `_get_shift_raw` in `app/services/shift.py` — matches existing `_promote_from_waitlist` pattern. Simple pessimistic lock.
- **C10 DNC bulk import (DATA-02)**: Replace per-row SELECT+INSERT loop with single `INSERT ... ON CONFLICT (campaign_id, phone_number) DO NOTHING` in `app/services/dnc.py`.
- **C11 invite compensation (DATA-03)**: Wrap `db.commit()` in try/except in `accept_invite`. On failure, call `zitadel.remove_project_role` to roll back the grant. Matches existing `join.py` compensating pattern.
- **C11 transfer_ownership (DATA-03)**: Same try/except pattern applied to `transfer_ownership` service method.

**Schema Changes & Test Strategy**
- **DATA-04 voter_interactions indexes (C12)**: Add `__table_args__` with `Index("ix_voter_interactions_campaign_voter", "campaign_id", "voter_id")` and `Index("ix_voter_interactions_campaign_created", "campaign_id", "created_at")`.
- **DATA-05 re-invite uniqueness**: Partial unique index on `(campaign_id, email)` WHERE status = 'pending' — allows re-invite once previous is accepted/revoked.
- **DATA-06 VoterEmail**: Add unique constraint on `(campaign_id, voter_id, value)`.
- **DATA-07 VolunteerTag**: Add unique constraint on `(campaign_id, name)`.
- **DATA-08 migration**: Single migration `027_data_integrity.py` covering all indexes/constraints above. Atomic, reversible.
- **Test strategy**: `asyncio.gather` with 2 concurrent signup requests against shared DB — proves C9 race fix. Constraint violations tested via direct DB session attempts. All tests marked `@pytest.mark.integration` (require real Postgres).

### Claude's Discretion
- Whether to also test C10 concurrency with multiple DNC import jobs running simultaneously — at Claude's discretion based on test runtime budget.
- How to name the test file(s): one `test_data_integrity.py` vs. extending `test_shifts.py`, `test_dnc.py`, etc. — Claude to follow existing test layout conventions.

### Deferred Ideas (OUT OF SCOPE)
- Broader index audit across all tables — out of scope (focused on known-problematic tables per review).
- Optimistic locking strategy as alternative to SELECT FOR UPDATE — deferred unless pessimistic lock causes contention issues.
</user_constraints>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Shift signup race fix (C9) | `app/services/shift.py:137-144` (`_get_shift_raw`), signup at :334, :364-371 (count check). Reference: `_promote_from_waitlist` at :515-545 uses `.with_for_update()`. |
| DATA-02 | DNC bulk import TOCTOU fix (C10) | `app/services/dnc.py:100-129` (loop). ON CONFLICT reference: `app/api/deps.py:170,204`, `app/services/shift.py:629`. |
| DATA-03 | Invite accept + transfer_ownership compensating tx (C11) | `app/services/invite.py:220-230`, `app/api/v1/members.py:253-380`. Reference: `app/services/join.py:200-225` (complete try/except with ZITADEL cleanup). |
| DATA-04 | voter_interactions indexes (C12) | `app/models/voter_interaction.py` has no `__table_args__` at all. |
| DATA-05 | Invite partial unique index (C13) | `app/models/invite.py:22-26` has unconditional `UniqueConstraint`. Partial-index reference: `alembic/versions/017_procrastinate_schema.py:124-126`. |
| DATA-06 | VoterEmail uniqueness (H18) | `app/models/voter_contact.py:42-59` lacks `__table_args__`. Peer: `VoterPhone` at `:14-39` has `uq_voter_phone_campaign_voter_value`. |
| DATA-07 | VolunteerTag uniqueness (H19) | `app/models/volunteer.py:86-97` — index exists but no unique constraint. Peer: `VoterTag` in `app/models/voter.py:143`. |
| DATA-08 | Migration `027_data_integrity.py` | Next sequential: 026 is HEAD (`026_rls_hardening`). See `alembic/versions/026_rls_hardening.py:18-20` pattern. |

## Summary

All four concurrency bugs (C9-C12) have precise, locally-scoped fixes with established in-repo patterns. C9 mirrors `_promote_from_waitlist`; C10 mirrors `deps.py` ON CONFLICT; C11 mirrors `join.py` compensating rollback; C12 is pure DDL. The partial unique index pattern exists at `017_procrastinate_schema.py:124-126` using raw `op.execute("CREATE UNIQUE INDEX ... WHERE ...")`. No circular deadlock risk between shift signup lock and waitlist promotion (they lock disjoint rows — `Shift` vs `ShiftVolunteer`).

**Primary recommendation:** Apply the 4 code fixes in one branch, write migration `027_data_integrity.py` covering DATA-04/05/06/07, and add one integration test file `tests/integration/test_data_integrity.py` using `asyncio.gather` against the superuser engine.

## Exact Fix Sites (Verified Line Numbers)

| Fix | File | Line | Current State |
|-----|------|------|---------------|
| C9 lock | `app/services/shift.py` | 137-144 | `_get_shift_raw` — add `.with_for_update()` to select |
| C9 callers affected | `app/services/shift.py` | 165, 205, 283, 334, 429, 479, 578, 667 | All 8 callers will acquire row lock — verify non-blocking (short txs) |
| C10 rewrite | `app/services/dnc.py` | 100-129 | loop body: replace per-row SELECT+INSERT with batched ON CONFLICT |
| C11 invite | `app/services/invite.py` | 220-230 | `assign_project_role` precedes `db.commit()`; no try/except |
| C11 transfer_ownership | `app/api/v1/members.py` | 355-374 | try/except already wraps commit but compensation block is empty `pass` (H3) |
| C12 indexes | `app/models/voter_interaction.py` | after line 57 | no `__table_args__` exists |
| DATA-05 partial UQ | `app/models/invite.py` | 22-26 | unconditional `UniqueConstraint` — must drop + replace |
| DATA-06 VoterEmail UQ | `app/models/voter_contact.py` | 42-59 | no `__table_args__` |
| DATA-07 VolunteerTag UQ | `app/models/volunteer.py` | 86-97 | `Index` exists but no unique |

**`transfer_ownership` location:** `app/api/v1/members.py:258-380` (route handler, not a service method). The route itself contains inline DB logic. Fix target: the empty `try: pass` block at `:364-366` must call `zitadel.remove_project_role` / `assign_project_role` to invert the four ZITADEL ops performed at `:302-328`.

## Standard Stack

Already in the repo — no new dependencies needed.

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| SQLAlchemy[async] | 2.x | ORM + `.with_for_update()`, `on_conflict_do_nothing` | Used throughout |
| asyncpg | existing | Async Postgres driver | Used throughout |
| alembic | existing | Migrations (sync via psycopg) | 26 existing migrations |
| pytest-asyncio | existing | `asyncio_mode=auto` | `pyproject.toml` |

## Architecture Patterns

### Pattern 1: Pessimistic Row Lock (reference for C9)
**Source:** `app/services/shift.py:531-540` (`_promote_from_waitlist`)
```python
result = await session.execute(
    select(ShiftVolunteer)
    .where(...)
    .order_by(ShiftVolunteer.waitlist_position)
    .limit(1)
    .with_for_update()
)
```

**Apply to `_get_shift_raw`:**
```python
async def _get_shift_raw(self, session, shift_id):
    result = await session.execute(
        select(Shift).where(Shift.id == shift_id).with_for_update()
    )
    return result.scalar_one_or_none()
```

Note: `with_for_update()` on every `_get_shift_raw` call locks the Shift row for the duration of the transaction. Callers like `get_shift` (read-only) use `get_shift`, not `_get_shift_raw`, so READ-only paths are unaffected. All 8 callers of `_get_shift_raw` are write paths — locking is correct.

### Pattern 2: Batched Upsert with ON CONFLICT (reference for C10)
**Source:** `app/services/shift.py:614-634`, `app/api/deps.py:163-171`
```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

stmt = (
    pg_insert(DoNotCallEntry)
    .values(rows)  # list of dicts
    .on_conflict_do_nothing(index_elements=["campaign_id", "phone_number"])
)
result = await session.execute(stmt)
added = result.rowcount
```

Collect validated rows in a list during CSV iteration, then one `execute` call. `skipped` = `len(rows) - added`.

**Pre-req:** There must be a unique constraint/index on `(campaign_id, phone_number)` for ON CONFLICT to target. Verify this exists in `app/models/dnc.py` before relying on it — if missing, add to migration 027.

### Pattern 3: Compensating Transaction (reference for C11)
**Source:** `app/services/join.py:199-225`
```python
try:
    await db.commit()
except Exception as commit_exc:
    logger.error("DB commit failed ...", ...)
    await db.rollback()
    try:
        await zitadel.remove_project_role(
            settings.zitadel_project_id,
            user.id,
            invite.role,
            org_id=zitadel_org_id,
            project_grant_id=project_grant_id,
        )
    except Exception as cleanup_exc:
        logger.error("Failed to remove orphaned ZITADEL role ...", ...)
    raise
```

For `accept_invite`: compensate both the new role grant AND (if `old_role` branch fired at `:212-218`) re-assign the old role. The full inverse is complex — simplest safe approach: remove the new role only; surface a warning log for the rare role-swap case.

For `transfer_ownership` at `members.py:364-366`: fill the `pass` with 4 inverse ZITADEL calls mirroring `:302-328` (re-grant `owner` to current user, remove `admin`; re-grant `target_old_role` to target, remove `owner`).

### Pattern 4: Partial Unique Index (reference for DATA-05)
**Source:** `alembic/versions/017_procrastinate_schema.py:124-126`
```python
op.execute(
    "CREATE UNIQUE INDEX procrastinate_jobs_queueing_lock_idx_v1 "
    "ON procrastinate_jobs (queueing_lock) WHERE status = 'todo'"
)
```

Project uses raw SQL for partial indexes rather than `op.create_index(postgresql_where=...)`. **Follow this pattern** (raw SQL is the only verified in-repo approach).

**Model-side:** `Invite.__table_args__` cannot express partial constraints in pure SQLAlchemy declaratively. Two options:
1. Drop `UniqueConstraint` from `__table_args__` entirely; rely on DB-side partial index (SQLAlchemy won't know about it, but Postgres enforces it). **Recommended** — matches procrastinate's approach.
2. Use `Index(..., postgresql_where=text("accepted_at IS NULL AND revoked_at IS NULL"), unique=True)`. Works in recent SQLAlchemy but untested in this repo.

Go with option 1 for consistency.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Row locking | app-level mutex, advisory lock | `.with_for_update()` | Scoped to tx, released on commit/rollback automatically |
| Dedupe on insert | SELECT-then-INSERT loop | `INSERT ... ON CONFLICT DO NOTHING` | Atomic at DB level, immune to TOCTOU |
| Backfill dup detection | app-side scan + Python set | SQL `GROUP BY ... HAVING COUNT(*) > 1` | Single query, runs inside migration |

## Common Pitfalls

### P1: `with_for_update()` on every shift read starves reads under high load
**What:** Adding the lock to `_get_shift_raw` means *every* write path holds the Shift row for the whole tx.
**Mitigation:** All 8 callers complete in a single short transaction (no external API calls between lock acquire and commit). Risk is LOW in practice. Monitor under load if it ever surfaces.
**Warning sign:** Postgres `pg_stat_activity` showing many `ShareLock` waits on `shifts`.

### P2: Existing unit tests mock `db.execute` sequences — adding lock doesn't reorder calls
**What:** `tests/unit/test_shifts.py:301-306` provides a `side_effect` list matching the exact sequence of `db.execute()` calls in `signup_volunteer`. Adding `.with_for_update()` is a chain-method on the `select()` object — it does **not** add a new `execute()` call.
**Verified:** Mocks will continue to pass unchanged. No test breakage expected from C9 fix.

### P3: ON CONFLICT requires a target constraint/index to exist
**What:** `on_conflict_do_nothing(index_elements=["campaign_id", "phone_number"])` will raise at runtime if no unique index/constraint covers those columns.
**Action:** Grep `app/models/dnc.py` during planning — verify `DoNotCallEntry.__table_args__` includes this constraint. If not, add it to migration 027 as prerequisite.

### P4: Partial index backfill — existing duplicate invites could block migration
**What:** If there are multiple `(email, campaign_id)` pending invites today (should be 1 due to existing unconditional UQ, but dropping then creating partial is a window), the new index creation is fine. But if there are rows where `accepted_at IS NOT NULL` with duplicate `(email, campaign_id)` combinations — that's actually the goal (allowed after partial index). No conflict.
**Action:** Drop old constraint first, then create partial index in same migration.

### P5: VoterEmail / VolunteerTag existing duplicate data
**What:** Adding unique constraints to existing tables can fail if duplicates exist.
**Detection queries** (run in migration before creating constraint):
```sql
-- VoterEmail duplicates
SELECT campaign_id, voter_id, value, COUNT(*) FROM voter_emails
GROUP BY campaign_id, voter_id, value HAVING COUNT(*) > 1;
-- VolunteerTag duplicates
SELECT campaign_id, name, COUNT(*) FROM volunteer_tags
GROUP BY campaign_id, name HAVING COUNT(*) > 1;
```
**Action in migration:** Use `op.execute` to delete duplicates (keep MIN(id)) OR abort with clear error message. Recommend deletion with logging since this is a dev-only DB right now (no production data at risk).

### P6: Deadlock risk — shift signup lock vs waitlist promotion (flagged in request)
**Analysis:** `signup_volunteer` locks `Shift` row (via `_get_shift_raw`). `_promote_from_waitlist` locks `ShiftVolunteer` row. Different tables, no overlap. `cancel_signup` calls both: first locks `Shift` via `_get_shift_raw` at `:429`, then locks `ShiftVolunteer` via `_promote_from_waitlist` at `:454`. Always same order. **No deadlock possible.** ✅

## Impact on Existing Tests

| Test File | Impact | Action |
|-----------|--------|--------|
| `tests/unit/test_shifts.py` | None — `db.execute` mocks unaffected by `.with_for_update()` chain | No change |
| `tests/unit/test_dnc.py::test_bulk_import_csv`, `test_bulk_import_invalid_phones` | Mocks `session.execute` per-row; rewriting to batch ON CONFLICT changes call count from N+1 to 1 | **Rewrite these 2 tests** to mock the single batch execute and verify `added`/`skipped`/`invalid` counts |
| `tests/unit/test_invite_service.py` | Adding try/except around commit shouldn't affect success paths | Add one new test: commit fails → `zitadel.remove_project_role` called |
| `tests/unit/test_api_members.py` | transfer_ownership success paths unaffected | Add test: commit fails → compensating ZITADEL calls fire |
| `tests/unit/test_voter_interactions.py` | Schema-only index addition | No change |

## Code Examples

### C9 — Shift signup lock (minimal diff)
```python
# app/services/shift.py:137-144
async def _get_shift_raw(self, session, shift_id):
    result = await session.execute(
        select(Shift).where(Shift.id == shift_id).with_for_update()
    )
    return result.scalar_one_or_none()
```

### C10 — DNC bulk import batched
```python
# app/services/dnc.py:72-139 (rewrite)
from sqlalchemy.dialects.postgresql import insert as pg_insert

async def bulk_import(self, session, campaign_id, csv_content, added_by,
                     default_reason="registry_import"):
    reader = csv.DictReader(io.StringIO(csv_content))
    rows, invalid = [], 0
    now = utcnow()
    for row in reader:
        phone = row.get("phone_number", "").strip()
        reason = row.get("reason", default_reason).strip() or default_reason
        if not PHONE_REGEX.match(phone):
            invalid += 1
            continue
        rows.append({
            "id": uuid.uuid4(),
            "campaign_id": campaign_id,
            "phone_number": phone,
            "reason": reason,
            "added_by": added_by,
            "added_at": now,
        })
    added = 0
    if rows:
        stmt = (
            pg_insert(DoNotCallEntry)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["campaign_id", "phone_number"])
        )
        result = await session.execute(stmt)
        added = result.rowcount or 0
    skipped = len(rows) - added
    logger.info("DNC bulk import for campaign {}: added={}, skipped={}, invalid={}",
                campaign_id, added, skipped, invalid)
    return DNCImportResponse(added=added, skipped=skipped, invalid=invalid)
```

### C11 — Invite accept compensating (final block of accept_invite)
```python
# app/services/invite.py:229-231 (replace)
try:
    invite.accepted_at = utcnow()
    await db.commit()
    await db.refresh(invite)
except Exception as commit_exc:
    logger.error("DB commit failed for invite accept: {}", commit_exc)
    await db.rollback()
    try:
        await zitadel.remove_project_role(
            settings.zitadel_project_id, user.id, invite.role,
            org_id=zitadel_org_id,
        )
    except Exception as cleanup_exc:
        logger.error("Failed to remove orphaned ZITADEL role: {}", cleanup_exc)
    raise
```

### DATA-04 — voter_interactions indexes
```python
# app/models/voter_interaction.py (add after line 43)
from sqlalchemy import Index  # noqa: add to imports

class VoterInteraction(Base):
    __tablename__ = "voter_interactions"
    __table_args__ = (
        Index("ix_voter_interactions_campaign_voter", "campaign_id", "voter_id"),
        Index("ix_voter_interactions_campaign_created", "campaign_id", "created_at"),
    )
    # ... rest unchanged
```

### Migration 027 skeleton
```python
"""Data integrity: indexes + unique constraints + partial unique invite index.

Revision ID: 027_data_integrity
Revises: 026_rls_hardening
"""
from __future__ import annotations
from collections.abc import Sequence
from alembic import op

revision: str = "027_data_integrity"
down_revision: str = "026_rls_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- DATA-04: voter_interactions indexes (C12) ---
    op.create_index(
        "ix_voter_interactions_campaign_voter",
        "voter_interactions", ["campaign_id", "voter_id"],
    )
    op.create_index(
        "ix_voter_interactions_campaign_created",
        "voter_interactions", ["campaign_id", "created_at"],
    )

    # --- DATA-06: VoterEmail uniqueness (H18) ---
    # Remove duplicates first (dev DB; keep lowest id per group)
    op.execute("""
        DELETE FROM voter_emails a USING voter_emails b
        WHERE a.id > b.id
          AND a.campaign_id = b.campaign_id
          AND a.voter_id = b.voter_id
          AND a.value = b.value
    """)
    op.create_unique_constraint(
        "uq_voter_email_campaign_voter_value",
        "voter_emails", ["campaign_id", "voter_id", "value"],
    )

    # --- DATA-07: VolunteerTag uniqueness (H19) ---
    op.execute("""
        DELETE FROM volunteer_tags a USING volunteer_tags b
        WHERE a.id > b.id AND a.campaign_id = b.campaign_id AND a.name = b.name
    """)
    op.create_unique_constraint(
        "uq_volunteer_tag_campaign_name",
        "volunteer_tags", ["campaign_id", "name"],
    )

    # --- DATA-05: Invite partial unique index (C13) ---
    op.drop_constraint(
        "uq_pending_invite_email_campaign", "invites", type_="unique"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_pending_invite_email_campaign "
        "ON invites (email, campaign_id) "
        "WHERE accepted_at IS NULL AND revoked_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_pending_invite_email_campaign")
    op.create_unique_constraint(
        "uq_pending_invite_email_campaign", "invites", ["email", "campaign_id"]
    )
    op.drop_constraint(
        "uq_volunteer_tag_campaign_name", "volunteer_tags", type_="unique"
    )
    op.drop_constraint(
        "uq_voter_email_campaign_voter_value", "voter_emails", type_="unique"
    )
    op.drop_index("ix_voter_interactions_campaign_created", "voter_interactions")
    op.drop_index("ix_voter_interactions_campaign_voter", "voter_interactions")
```

## Concurrent Test Pattern

The repo has **no existing concurrent tests** (verified — `asyncio.gather` doesn't appear anywhere in `tests/`). This is new ground.

### Pattern for integration test
```python
# tests/integration/test_data_integrity.py
import asyncio
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

@pytest.mark.integration
@pytest.mark.asyncio
async def test_shift_signup_race_no_overflow(superuser_engine):
    """Two concurrent signups cannot both succeed past capacity=1."""
    # Setup: create shift with max_volunteers=1, 2 volunteers
    # (use superuser_engine to bypass RLS)
    session_factory = async_sessionmaker(superuser_engine, expire_on_commit=False)

    async def attempt_signup(vol_id):
        async with session_factory() as session:
            svc = ShiftService()
            try:
                await svc.signup_volunteer(session, shift_id, vol_id)
                await session.commit()
                return "signed_up"
            except Exception as e:
                await session.rollback()
                return f"failed: {e}"

    results = await asyncio.gather(
        attempt_signup(vol_a),
        attempt_signup(vol_b),
        return_exceptions=True,
    )
    # With lock: one SIGNED_UP, one WAITLISTED. Without lock: both SIGNED_UP (bug).
    async with session_factory() as session:
        count = await session.execute(
            select(func.count()).where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.status == SignupStatus.SIGNED_UP,
            )
        )
        assert count.scalar() == 1  # capacity enforced
```

**Gotcha:** Each coroutine needs its **own session** (separate transaction). Sharing one session sequences the queries and hides the race. The `session_factory()` per coroutine pattern is essential.

**Reliability note:** Concurrent tests can be flaky (2 coroutines may not actually interleave in a single event-loop). Run the signup path inside each coroutine with a deliberate `await asyncio.sleep(0)` between the count query and the INSERT to force yielding — or simply run it 10 times and assert no run produces 2 SIGNED_UP. This kind of test proves presence of lock, not absence of races, so N>1 iterations is reasonable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 15+ | All integration tests, migration | ✓ (docker compose, :5433) | 15+ | — |
| SQLAlchemy 2.x | All fixes | ✓ | existing | — |
| asyncpg | async DB access | ✓ | existing | — |
| alembic | migration 027 | ✓ | existing | — |
| pytest-asyncio | concurrent test | ✓ (`asyncio_mode=auto`) | existing | — |

No missing dependencies. All code fixes and the migration can run in the standard `docker compose` dev environment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (`asyncio_mode=auto`) |
| Config file | `pyproject.toml` (markers: `integration`, `e2e`) |
| Quick run command | `uv run pytest tests/unit/test_shifts.py tests/unit/test_dnc.py tests/unit/test_invite_service.py -x` |
| Full suite command | `uv run pytest -x` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Shift signup under concurrency stays ≤ capacity | integration | `uv run pytest tests/integration/test_data_integrity.py::test_shift_signup_race_no_overflow -x` | ❌ Wave 0 |
| DATA-01 | Unit: `_get_shift_raw` emits SELECT with `FOR UPDATE` | unit | `uv run pytest tests/unit/test_shifts.py -x` | ✅ (extend) |
| DATA-02 | DNC bulk import: ON CONFLICT skips duplicates | unit | `uv run pytest tests/unit/test_dnc.py::TestDNCBulkImport -x` | ✅ (rewrite 2 tests) |
| DATA-02 | DNC concurrent imports: no IntegrityError surface | integration (optional) | `uv run pytest tests/integration/test_data_integrity.py::test_dnc_concurrent_import -x` | ❌ Wave 0 (optional) |
| DATA-03 | accept_invite: commit failure → ZITADEL role removed | unit | `uv run pytest tests/unit/test_invite_service.py::test_accept_commit_failure_removes_role -x` | ❌ Wave 0 |
| DATA-03 | transfer_ownership: commit failure → ZITADEL inverted | unit | `uv run pytest tests/unit/test_api_members.py::test_transfer_ownership_commit_failure -x` | ❌ Wave 0 |
| DATA-04 | voter_interactions indexes exist in migrated DB | integration | `uv run pytest tests/integration/test_data_integrity.py::test_voter_interactions_indexes -x` | ❌ Wave 0 |
| DATA-05 | Accepted invite allows re-invite to same email | integration | `uv run pytest tests/integration/test_data_integrity.py::test_reinvite_after_accept -x` | ❌ Wave 0 |
| DATA-05 | Two pending invites to same email blocked | integration | `uv run pytest tests/integration/test_data_integrity.py::test_duplicate_pending_invite_blocked -x` | ❌ Wave 0 |
| DATA-06 | VoterEmail duplicate (campaign, voter, value) rejected | integration | `uv run pytest tests/integration/test_data_integrity.py::test_voter_email_unique -x` | ❌ Wave 0 |
| DATA-07 | VolunteerTag duplicate (campaign, name) rejected | integration | `uv run pytest tests/integration/test_data_integrity.py::test_volunteer_tag_unique -x` | ❌ Wave 0 |
| DATA-08 | Migration 027 upgrade + downgrade round-trip clean | manual | `docker compose exec api alembic upgrade head && alembic downgrade -1 && alembic upgrade head` | manual |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_shifts.py tests/unit/test_dnc.py tests/unit/test_invite_service.py tests/unit/test_api_members.py -x`
- **Per wave merge:** `uv run pytest -x` (includes integration)
- **Phase gate:** Full suite green + manual migration round-trip

### Wave 0 Gaps
- [ ] `tests/integration/test_data_integrity.py` — new file covering DATA-01, 04, 05, 06, 07, 08
- [ ] New unit test cases in `tests/unit/test_invite_service.py` (compensating tx)
- [ ] New unit test cases in `tests/unit/test_api_members.py` (transfer_ownership compensating)
- [ ] Rewrite `test_bulk_import_csv` and `test_bulk_import_invalid_phones` in `tests/unit/test_dnc.py` for batched ON CONFLICT semantics

## Open Questions

1. **Does `DoNotCallEntry` already have a unique index on `(campaign_id, phone_number)`?**
   - What we know: `dnc.py:51-56` does explicit SELECT-then-INSERT suggesting there MAY NOT be a DB-level constraint.
   - What's unclear: `app/models/dnc.py` not yet read.
   - Recommendation: Planner verifies in Wave 0; if missing, prepend to migration 027.

2. **How to compensate for `accept_invite` in the role-swap branch (old_role → new_role)?**
   - What we know: Code at `invite.py:212-218` removes old role before assigning new one; if commit fails, both the remove AND the new assign need to be reversed.
   - Recommendation: Simplest correct compensation — on failure, call `remove_project_role(new_role)` AND `assign_project_role(old_role)`. If the secondary assign also fails, log loudly but don't mask the original commit error.

## Sources

### Primary (HIGH confidence)
- `app/services/shift.py:137-144, 515-545` — `_get_shift_raw` and `_promote_from_waitlist`
- `app/services/dnc.py:100-129` — current bulk import loop
- `app/services/invite.py:170-230` — accept_invite flow
- `app/services/join.py:199-225` — compensating tx reference
- `app/api/v1/members.py:253-380` — transfer_ownership route
- `app/models/voter_interaction.py` — no __table_args__ (verified)
- `app/models/invite.py:22-26` — current unconditional UQ
- `app/models/voter_contact.py:14-59` — VoterPhone pattern vs VoterEmail gap
- `app/models/volunteer.py:86-97` — VolunteerTag current state
- `alembic/versions/017_procrastinate_schema.py:124-126` — partial unique index pattern
- `alembic/versions/026_rls_hardening.py` — most recent migration, naming pattern
- `app/api/deps.py:163-205` — ON CONFLICT DO NOTHING pattern
- `app/services/shift.py:614-634` — ON CONFLICT DO UPDATE pattern
- `tests/unit/test_shifts.py:290-333` — existing signup unit tests (won't break)
- `tests/unit/test_dnc.py:140-180` — existing bulk import tests (need rewrite)
- `tests/integration/conftest.py:32-75` — `superuser_engine` / `app_user_engine` fixtures

## Metadata

**Confidence breakdown:**
- Fix site line numbers: HIGH — all verified by Read
- Fix approach: HIGH — all patterns exist in repo
- Test strategy (concurrent): MEDIUM — no precedent in repo; approach is standard but needs tuning for reliability
- Migration pattern: HIGH — mirrors 026, partial index pattern verified in 017
- Deadlock analysis: HIGH — call-order analysis confirms single lock acquisition order

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase areas, no framework upgrades pending)
