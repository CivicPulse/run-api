# Phase 111 Research — Reconciliation & Dual-Identity Schema

**Phase:** 111 — Reconciliation & Dual-Identity Schema
**Researcher:** orchestrator (inline; Task tool unavailable in this skill context)
**Date:** 2026-04-14
**Status:** Research complete

---

## 1. Goal Restated

Answer: "What does the planner need to know to write executable PLAN.md files for Phase 111?"

Phase 111 must:
1. Add a one-time, idempotent Alembic data migration that links existing `volunteers` rows to `users` via `volunteers.user_id` when there is exactly one matching `users` row (campaign-scoped, case-insensitive email).
2. Widen `session_callers` and `walk_list_canvassers` to accept *either* `user_id` OR `volunteer_id` (exactly one), enforced by a `CHECK (num_nonnulls(...)=1)` constraint, with reversible downgrades.
3. Ship pytest coverage (integration tier) for the reconciliation migration: link / ambiguous / no-match cases plus an idempotency re-run test.
4. Update SQLAlchemy ORM models to mirror the new column shape so the rest of the codebase (Phase 112+) can consume the new fields.

The five ROADMAP success criteria (1–5) translate directly to MIGRATE-01, MIGRATE-02, ASSIGN-01, ASSIGN-02, plus "shippable on its own" which means: after this phase merges, the schema must be valid even if Phase 112+ never lands.

---

## 2. Existing Code Survey

### 2.1 SQLAlchemy models that change

#### `app/models/phone_bank.py` — `SessionCaller`
Current shape (lines 54-71):
```python
class SessionCaller(Base):
    __tablename__ = "session_callers"
    __table_args__ = (
        Index("ix_session_callers_session_id", "session_id"),
        UniqueConstraint("session_id", "user_id", name="uq_session_caller"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("phone_bank_sessions.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    check_in_at: Mapped[datetime | None]
    check_out_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

**Findings:**
- Surrogate `id uuid` PK already exists — no PK rework needed.
- `user_id` is `String` typed (matches `users.id text`), `nullable=False` today.
- `uq_session_caller` is the table-level unique. It must be replaced with two partial unique indexes when the migration runs.
- No relationship to `Volunteer` exists today; one will be added.

Required ORM changes (Phase 111):
- Make `user_id` nullable: `Mapped[str | None]`, `nullable=True`.
- Add `volunteer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("volunteers.id"), nullable=True)`.
- Drop the `UniqueConstraint("session_id", "user_id")` from `__table_args__`.
- Add a `CheckConstraint("num_nonnulls(user_id, volunteer_id) = 1", name="ck_session_caller_exactly_one_identity")`.
- Add `Index` declarations for the two partial unique indexes via `Index(..., postgresql_where=text(...), unique=True)`.

#### `app/models/walk_list.py` — `WalkListCanvasser`
Current shape (lines 86-95):
```python
class WalkListCanvasser(Base):
    __tablename__ = "walk_list_canvassers"
    walk_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("walk_lists.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

**Findings:**
- Composite PK `(walk_list_id, user_id)`. **Restructure required** — must drop the composite PK and add a surrogate `id uuid` PK because `user_id` becomes nullable (D-08).
- No `__table_args__` block today; will gain `CheckConstraint` + two partial unique `Index` entries.

Required ORM changes (Phase 111):
- Add `id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)`.
- Strip `primary_key=True` from `walk_list_id` and `user_id`.
- Make `user_id` nullable: `Mapped[str | None]`, `nullable=True`.
- Add `volunteer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("volunteers.id"), nullable=True)`.
- Add `__table_args__` with `CheckConstraint`, two partial unique `Index` entries.

#### `app/models/volunteer.py` — `Volunteer`
- `user_id: Mapped[str | None]` already nullable (line 57). FK already references `users.id`.
- `email: Mapped[str | None]` already nullable (line 61).
- Index `ix_volunteers_user_id` already exists (line 50).
- **No schema change to `volunteers`.** The reconciliation migration only writes to existing columns.

### 2.2 Alembic conventions

**Versions directory:** `alembic/versions/`
**Current head:** `040_door_knock_client_uuid` (revises `039_volunteer_applications`).
**Naming convention:** `NNN_short_slug.py` with `revision = "NNN_short_slug"`.

**Phase 111 will add new revision(s) revising `040_door_knock_client_uuid`.** Per D-CLAUDE-DISCRETION, planner picks one or two revisions. **Recommendation: TWO sequential revisions** for reviewability and rollback granularity:
- `041_volunteer_user_reconciliation.py` — pure data migration (UPDATE volunteers SET user_id) + JSONL artifact write.
- `042_dual_identity_assignment_schema.py` — schema widen on session_callers + walk_list_canvassers.

The two-revision split lets ops rerun reconciliation independently and lets the schema migration be analyzed in isolation by reviewers. It also satisfies "shippable on its own" cleanly: 041 is pure data, 042 is pure schema, both are reversible.

**Reference patterns from existing migrations:**

`040_door_knock_client_uuid.py` is the strongest precedent:
- Uses `op.execute("...")` with raw SQL for partial unique indexes (Alembic's `create_index` doesn't expose `postgresql_where` cleanly for unique constraints).
- Uses `IF NOT EXISTS` / `IF EXISTS` guards for idempotent re-runs.
- Backfills existing rows to satisfy a new unique predicate before creating the index.
- Reversible `downgrade()` with `DROP INDEX IF EXISTS` + `DROP COLUMN IF EXISTS`.

`027_data_integrity.py` shows:
- Backfill-then-constrain pattern (delete duplicates, then add unique constraint).
- Mixed `op.execute` raw SQL + Alembic `op.create_unique_constraint` / `op.create_index` calls.
- Drop-and-recreate pattern for replacing an existing constraint with a different shape.

`011_campaign_member_role_check.py` (referenced by Grep) is the prior CHECK-constraint precedent — confirms `op.create_check_constraint` is the canonical add-constraint call in this codebase.

**Async vs sync inside Alembic:** `alembic/env.py` uses async run_migrations under the hood, but individual `upgrade()` / `downgrade()` functions remain synchronous and use `op.execute(...)` which runs against the active connection. The reconciliation UPDATE will be plain `op.execute("UPDATE volunteers SET ...")` — no async coroutine inside the migration.

### 2.3 Reconciliation query shape

The campaign-scoped, case-insensitive, email-only match query (D-01, D-02):

```sql
WITH candidates AS (
    SELECT
        v.id          AS volunteer_id,
        v.email       AS volunteer_email,
        v.campaign_id,
        u.id          AS user_id,
        COUNT(*) OVER (PARTITION BY v.id) AS match_count
    FROM volunteers v
    JOIN users u
        ON LOWER(u.email) = LOWER(v.email)
    JOIN campaign_members cm
        ON cm.user_id = u.id
       AND cm.campaign_id = v.campaign_id
    WHERE v.user_id IS NULL
      AND v.email IS NOT NULL
)
SELECT volunteer_id, volunteer_email, user_id, match_count
FROM candidates
ORDER BY volunteer_id;
```

Then in Python:
- Group by `volunteer_id`. Single-row groups → linked. Multi-row groups → ambiguous.
- `linked_count = len(single_groups)`
- `ambiguous_count = len(multi_groups)`
- `unchanged_count = (count of volunteers WHERE user_id IS NULL AND email IS NULL) + (count of volunteers WHERE user_id IS NULL AND email IS NOT NULL AND no rows in candidates)`

For the actual UPDATE, the migration runs:
```sql
UPDATE volunteers v
SET user_id = sub.user_id
FROM (
    SELECT v2.id AS volunteer_id, MIN(u.id) AS user_id, COUNT(*) AS match_count
    FROM volunteers v2
    JOIN users u
        ON LOWER(u.email) = LOWER(v2.email)
    JOIN campaign_members cm
        ON cm.user_id = u.id
       AND cm.campaign_id = v2.campaign_id
    WHERE v2.user_id IS NULL
      AND v2.email IS NOT NULL
    GROUP BY v2.id
    HAVING COUNT(*) = 1
) sub
WHERE v.id = sub.volunteer_id
RETURNING v.id, sub.user_id;
```

The `HAVING COUNT(*) = 1` predicate enforces D-03 (ambiguous rows untouched) at the SQL level. `RETURNING` lets us count linked rows without a separate query.

For the ambiguous report (D-06), run a parallel query:
```sql
SELECT v.id AS volunteer_id, v.email,
       array_agg(u.id ORDER BY u.id) AS candidate_user_ids
FROM volunteers v
JOIN users u ON LOWER(u.email) = LOWER(v.email)
JOIN campaign_members cm ON cm.user_id = u.id AND cm.campaign_id = v.campaign_id
WHERE v.user_id IS NULL
  AND v.email IS NOT NULL
GROUP BY v.id, v.email
HAVING COUNT(*) > 1;
```

Each row → one JSONL record `{volunteer_id, email, candidate_user_ids}`.

**Idempotency (D-04):** Re-running the migration is safe because the WHERE filter `v2.user_id IS NULL` excludes already-linked rows. Second-run linked count is 0; the JSONL artifact is overwritten with fresh aggregates.

### 2.4 JSONL artifact path (D-05)

Container path: `/tmp/reconciliation-{revision}.jsonl` (e.g., `/tmp/reconciliation-041.jsonl`).
Operator retrieval: `docker compose cp api:/tmp/reconciliation-041.jsonl ./reconciliation-041.jsonl`.

The migration docstring must call out:
- The exact path
- The retrieval command
- That the file is overwritten on every run

Aggregate counts are also `print()`ed to stdout so they show up in alembic output without requiring file retrieval.

### 2.5 CHECK constraint syntax

Postgres `num_nonnulls(VARIADIC "any")` returns the number of non-null arguments. Available since PG 9.5. Project runs Postgres + PostGIS via docker compose; PG version is well above 9.5.

Constraint:
```sql
CHECK (num_nonnulls(user_id, volunteer_id) = 1)
```

Naming convention from `011_campaign_member_role_check.py`: `ck_<table>_<purpose>`. Use:
- `ck_session_callers_exactly_one_identity`
- `ck_walk_list_canvassers_exactly_one_identity`

### 2.6 Partial unique index syntax

For `session_callers`:
```sql
CREATE UNIQUE INDEX uq_session_callers_session_user
    ON session_callers (session_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_session_callers_session_volunteer
    ON session_callers (session_id, volunteer_id)
    WHERE volunteer_id IS NOT NULL;
```

For `walk_list_canvassers`:
```sql
CREATE UNIQUE INDEX uq_walk_list_canvassers_list_user
    ON walk_list_canvassers (walk_list_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_walk_list_canvassers_list_volunteer
    ON walk_list_canvassers (walk_list_id, volunteer_id)
    WHERE volunteer_id IS NOT NULL;
```

Pattern matches `040_door_knock_client_uuid.py`'s use of raw `CREATE UNIQUE INDEX ... WHERE` via `op.execute`.

### 2.7 Test infrastructure

**Markers:** `integration` (requires real DB), `e2e` (requires real DB + ZITADEL).
**Async mode:** `asyncio_mode = auto` in `pyproject.toml` / `pytest.ini`.
**Fixtures available** (from `tests/integration/conftest.py`):
- `superuser_engine` / `superuser_session` — postgres superuser, bypasses RLS, suitable for fixture seeding.
- `app_user_engine` / `app_user_session` — `app_user` role, RLS-enforced.
- `two_campaigns` — pre-built two-campaign fixture (good template for our reconciliation test fixture).
- DB URLs auto-resolve `TEST_DB_PORT` → `PG_HOST_PORT` → `5433`.

**Migration tests:** the existing pattern is to invoke alembic programmatically OR to operate against the already-migrated test DB. The reconciliation test will:
1. Seed `volunteers` + `users` + `campaign_members` rows in the link / ambiguous / no-match shapes via `superuser_session`.
2. Run the reconciliation function (extracted into a helper module so it's importable by both the migration and the test) directly.
3. Assert post-conditions on `volunteers.user_id`.
4. Re-run for idempotency.

**Why extract into a helper module:** Calling `alembic upgrade` inside a test is heavy and conflicts with the already-migrated test DB. Extracting `reconcile_volunteers(connection) -> ReconciliationReport` into `app/services/volunteer_reconciliation.py` (or `scripts/reconcile_volunteers.py`) lets:
- The Alembic migration import and call it.
- The test import and call it directly with seeded fixtures.
- A future ops-rerun script call it without rerunning alembic.

This is the cleanest way to satisfy MIGRATE-02 without inventing a "test alembic against fresh DB" infrastructure.

### 2.8 Schema-level tests (D-19)

Three tests against the test DB after the schema migration has run:

1. **CHECK constraint rejects (NULL, NULL):** `INSERT INTO session_callers (id, session_id, user_id, volunteer_id) VALUES (..., NULL, NULL)` must raise `IntegrityError`. Same for `walk_list_canvassers`.
2. **CHECK constraint rejects (set, set):** `INSERT INTO session_callers (id, session_id, user_id, volunteer_id) VALUES (..., 'user-1', 'vol-uuid')` must raise `IntegrityError`. Same for walk_list_canvassers.
3. **Partial unique indexes enforce:** Insert two rows with the same `(session_id, user_id)` → second raises `IntegrityError`. Insert two with the same `(session_id, volunteer_id)` → second raises. Insert one user-row and one volunteer-row with the same `session_id` → BOTH succeed (cross-identity uniqueness deferred to Phase 112, per D-16).

Downgrade-blocks-on-volunteer-rows test (D-13):
4. Insert a `volunteer_id`-bearing row, run alembic downgrade → must raise an explicit error and leave the table in the upgraded state. Then delete the row and re-run downgrade → succeeds. This test runs in a separate test that resets the migration head after — or we can test the downgrade SQL function directly without invoking alembic, by calling a helper that the downgrade also calls.

**Pragmatic compromise:** For Phase 111 we test the downgrade-block at the SQL level by attempting the column drop directly with a guard query and asserting the guard raises. Full alembic round-trip downgrade testing is over-scope for a single phase (it would require a second isolated test database). The downgrade function itself must include the guard; manual test (documented in REVIEW.md) confirms it works.

### 2.9 Service layer integration points

`grep -r accept_invite app/services` shows `app/services/invite_service.py` already wraps invite acceptance in a transaction. Phase 111 must NOT change this file — the backfill extension is Phase 112's job. But the planner should verify that the new schema (nullable `user_id` on session_callers) does not break any existing query in:
- `app/services/phone_bank_service.py` — searches for `session_callers.user_id`
- `app/services/walk_list_service.py` — searches for `walk_list_canvassers.user_id`

If existing queries assume `user_id IS NOT NULL`, they will keep working today (no `volunteer_id` rows exist yet). If they `INSERT` rows, those inserts must continue to set `user_id` only — Phase 112 will introduce volunteer_id-aware writes. The Phase 111 ORM changes (making user_id nullable in the model) DO NOT break existing inserts because the inserts still pass user_id.

**Validation step in the plan:** After ORM changes, run `uv run pytest tests/integration/test_phone_banks.py tests/integration/test_phone_banking_rls.py tests/integration/test_canvassing_rls.py` to confirm nothing regresses. Also run the full unit suite and ruff.

---

## 3. Risks & Edge Cases

| Risk | Mitigation |
|---|---|
| Existing `walk_list_canvassers` rows have composite PK; recreating PK requires a CONCURRENT-safe approach | Run inside a transaction (Alembic default); the table is small (one row per canvasser per walk list) so a brief lock is acceptable. Document expected lock duration. |
| `num_nonnulls()` not available on older PG | Document required PG version >= 9.5; project runs current PG so this is fine. |
| `volunteers.email` may have leading/trailing whitespace from old data | Use `LOWER(TRIM(v.email))` and `LOWER(TRIM(u.email))` for the match join. Add this nuance to the migration. |
| Two volunteers in the SAME campaign with the same email → still gets matched as two separate volunteers (each potentially ambiguous) | Acceptable; covered by D-03 (ambiguous → untouched). |
| `users` table uses `text` PK (ZITADEL ID), but model declares `String` | No change — ForeignKey columns continue to use `String` / `text`. |
| Alembic downgrade tests are heavy | Skip live downgrade execution; instead unit-test the guard query that the downgrade uses. |
| JSONL artifact PII exposure | D-06 limits per-row detail to `{volunteer_id, email, candidate_user_ids}`. No names, addresses, or phones. Document this in the migration docstring. |
| Container restarts wipe `/tmp/` | Acceptable — JSONL is a one-time operator artifact; the aggregate counts also go to stdout / alembic log. |
| Cross-identity dup (same person as both user and volunteer on the same session) | Explicitly deferred to Phase 112 (D-16). Phase 111 does not enforce. |

---

## 4. Validation Architecture

(Nyquist — required because `nyquist_validation_enabled = true` and research is enabled.)

### Dimension 1 — Functional correctness
- **Reconciliation links the unambiguous case.** Test: seed one volunteer with email `julia@example.com`, one user with same email + campaign_member row → run reconciliation → assert `volunteers.user_id` = the user's id; report `linked = 1`.
- **Reconciliation skips the ambiguous case.** Test: seed one volunteer + two users sharing the email + both as campaign_members → run → assert `volunteers.user_id` IS NULL; report `linked = 0, ambiguous = 1`.
- **Reconciliation skips the no-match case.** Test: seed one volunteer with no matching user → run → assert untouched; report `linked = 0, unchanged = 1`.

### Dimension 2 — Idempotency
- **Re-run produces zero new links.** Test: run reconciliation, capture report, run again → second report has `linked = 0` and same `unchanged` count. Assert no extra `volunteers.user_id` writes.

### Dimension 3 — Constraint enforcement
- CHECK rejects `(NULL, NULL)` and `(set, set)` on both tables.
- Partial unique indexes reject duplicate `(session_id, user_id)` and duplicate `(session_id, volunteer_id)`.
- Cross-identity duplicate ALLOWED (asserts D-16 deferral).

### Dimension 4 — Reversibility
- Downgrade with zero `volunteer_id` rows succeeds (manual / docstring-documented; not auto-tested).
- Downgrade with `volunteer_id` rows blocks with a clear error (auto-tested via direct guard-query unit test).

### Dimension 5 — Multi-tenant isolation
- Reconciliation join includes `campaign_members.campaign_id = volunteers.campaign_id` — verified at the SQL level in tests by including a "wrong campaign" user that should NOT be matched.

### Dimension 6 — Performance
- One-shot migration; expected row count `O(volunteers count)` which is small (hundreds, not millions). No SLO required.

### Dimension 7 — Observability
- Migration prints `linked / ambiguous / unchanged` counts to stdout. JSONL artifact at `/tmp/reconciliation-041.jsonl`. Both documented in migration docstring.

### Dimension 8 — Test coverage
- Integration tests live under `tests/integration/test_reconciliation_migration.py` and `tests/integration/test_dual_identity_schema.py`. Markers: `integration`. Both run via `uv run pytest -m integration`.

---

## 5. Open Questions

None blocking. CONTEXT.md decisions cover every architectural fork. Planner discretion items (D-CLAUDE):
1. **One revision vs two.** Recommendation in §2.2: TWO sequential revisions (`041_volunteer_user_reconciliation`, `042_dual_identity_assignment_schema`).
2. **Helper module location.** Recommendation: `app/services/volunteer_reconciliation.py` exposing `reconcile_volunteers(connection) -> ReconciliationReport` dataclass. Imported by both the Alembic migration and the integration test.
3. **JSONL exact path.** Recommendation: `/tmp/reconciliation-041.jsonl` (revision-numbered).
4. **ORM relationship to Volunteer.** Recommendation: add `volunteer = relationship("Volunteer")` on `SessionCaller` and `WalkListCanvasser` for ORM convenience, but Phase 112 may revise. Phase 111 keeps it minimal — just the FK column, no relationship, to reduce blast radius.

---

## RESEARCH COMPLETE

Phase 111 is well-bounded: two Alembic revisions, two ORM model edits, one new helper module, one new integration test file (or two). All decisions are locked in CONTEXT.md; no clarifying questions for the planner.
