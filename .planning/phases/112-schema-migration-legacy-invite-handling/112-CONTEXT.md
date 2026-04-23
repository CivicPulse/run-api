# Phase 112: Schema Migration + Legacy-Invite Handling — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 112 delivers a single, reversible Alembic migration that:

1. Adds five provisioning columns to the `invites` table: `zitadel_user_id`, `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at`, `legacy_flow` — all datetime columns use `DateTime(timezone=True)` (MIG-01).
2. Marks every pre-v1.19 pending-and-unexpired invite as `legacy_flow=true` via a single SQL `UPDATE` so the migration runs without contacting ZITADEL (MIG-02).
3. Is reversible — downgrade drops the columns, the check constraint, and the partial unique index cleanly (MIG-03).
4. Ships a structural guard against naive-datetime regressions across the whole codebase (SEC-04, O6 mitigation).

**In scope:**
- One Alembic revision under `alembic/versions/` adding columns, the `identity_provisioning_status` CHECK constraint, and one partial unique index on `zitadel_user_id`.
- SQL-only data migration inside the same revision marking legacy invites.
- SQLAlchemy model updates in `app/models/invite.py` to declare the five new columns.
- `ruff` configuration change enabling the `DTZ` ruleset project-wide.
- New unit test (`tests/unit/test_no_naive_datetime.py`) that AST-scans `app/` for `datetime.utcnow()` usage as a CI backstop.
- Integration test proving upgrade + downgrade both apply cleanly against the dev Postgres (TEST-02).

**Out of scope (belongs to later phases):**
- Writing to the new columns from any application code (Phase 113 wires `send_campaign_invite_email`).
- Querying by `zitadel_user_id` or `legacy_flow` from application code (Phases 113–115 use them).
- Admin UI filters on `legacy_flow` (Phase 115).
- Recovery CTA wired up on `/invites/<token>` for legacy-flow rows (Phase 115 — RECOV-04).
- Backfilling ZITADEL identities for pre-v1.19 invites (explicitly rejected in REQUIREMENTS.md; legacy-flow routing replaces it).
- Revising `identity_provisioning_status` permitted values — the enum string set is locked here and any additions ship in a new migration.

</domain>

<decisions>
## Implementation Decisions

### Status Column Shape

- **D-STATUS-01:** **`identity_provisioning_status` is `VARCHAR(32)` with a named CHECK constraint** restricting values to `('not_started', 'provisioning', 'provisioned', 'failed', 'legacy')`. This mirrors the existing `email_delivery_status` precedent on the same table (plain varchar) but adds the CHECK for type safety. Rationale: pg_enum values can only be added (never removed) without a dump/restore, which conflicts with MIG-03's clean-downgrade requirement.
- **D-STATUS-02:** **Server default for `identity_provisioning_status` is `'not_started'`** for new rows; the same migration backfills existing rows to `'not_started'` except the legacy-flow cohort which gets `'legacy'`. Phase 113 transitions rows from `'not_started'` → `'provisioning'` → `'provisioned'` | `'failed'`.
- **D-STATUS-03:** **Permitted value set is LOCKED for this phase.** Phase 115's recovery / resend paths reuse existing values (e.g., a failed re-mint flips back to `'failed'`); any NEW status value ships in its own migration with its own CHECK-constraint swap. The planner does not introduce speculative values today.
- **D-STATUS-04:** **CHECK constraint is named** (e.g. `ck_invites_identity_provisioning_status`) so downgrade can drop it by name. Anonymous constraints are a downgrade footgun.

### SEC-04: Naive-Datetime Enforcement

- **D-SEC04-01:** **Ship BOTH the ruff rule AND the unit test.** Defense in depth for a bug (O6) that shipped once in v1.18.
- **D-SEC04-02:** **Ruff side — enable the `DTZ` ruleset** in `pyproject.toml`'s `[tool.ruff.lint] select = [...]` list. `DTZ003` (call-datetime-utcnow) and `DTZ005` (call-datetime-now-without-tzinfo) are the load-bearing codes. If any existing file violates these, fix them in the same migration commit — this phase owns the one-time sweep.
- **D-SEC04-03:** **Test side — `tests/unit/test_no_naive_datetime.py`** uses `ast.walk` to scan every `.py` under `app/` for `Call(func=Attribute(attr='utcnow', ...))` and asserts zero hits. Test FAILS rather than warns. No allowlist — if a legitimate exception ever appears, the test gets an explicit `# noqa`-style comment marker plus a code comment explaining why.
- **D-SEC04-04:** **Scope = `app/` only.** Test does NOT scan `tests/`, `alembic/`, `scripts/`, or `.planning/`. Rationale: test code legitimately uses frozen/naive dates for fixtures; migration + bootstrap scripts are dev-only; false-positive burden outweighs gain.

### Legacy-Flow Predicate

- **D-LEGACY-01:** **The legacy-flow UPDATE is exactly:**
  ```sql
  UPDATE invites
  SET legacy_flow = true,
      identity_provisioning_status = 'legacy'
  WHERE accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > NOW();
  ```
  Only pending, unrevoked, unexpired invites get flagged. Expired rows stay `legacy_flow=false` with `identity_provisioning_status='not_started'` — Phase 115's recovery CTA ("request a fresh invite") handles them the same way it'll handle any dead invite, legacy or not.
- **D-LEGACY-02:** **`legacy_flow` is non-nullable with a server default of `false`.** No tri-state ambiguity. Rows pre-dating the migration get `false` from the default, then the UPDATE above flips the subset.
- **D-LEGACY-03:** **`NOW()` in the SQL is acceptable** because Postgres evaluates it in the transaction's timezone (which is UTC on our deployment per `postgresql.conf`). We don't need `TIMEZONE('UTC', NOW())` — but if a downgrade+re-upgrade ever ran on a machine with a non-UTC Postgres, the predicate would still be correct because `expires_at` is stored as `TIMESTAMP WITH TIME ZONE`.

### Index Strategy

- **D-IDX-01:** **One new index: partial unique on `zitadel_user_id`.** Exact DDL:
  ```sql
  CREATE UNIQUE INDEX ix_invites_zitadel_user_id
    ON invites(zitadel_user_id)
    WHERE zitadel_user_id IS NOT NULL;
  ```
  Rationale: (a) enforces one invite per ZITADEL user (defends Phase 113's `ensure_human_user` reuse path against a race that creates two invite rows pointing at the same ZITADEL identity); (b) speeds up the Phase 113 reuse lookup; (c) partial keeps NULL rows out, so billions of pre-provision rows don't bloat the index.
- **D-IDX-02:** **No `legacy_flow` index this phase.** The legacy cohort is bounded by the v1.18 user count (tens to low hundreds), and the only query against `legacy_flow=true` today is Phase 115's admin pending-invite list, which will sequentially scan a small filtered cardinality fine. If Phase 115 measures a real plan issue, add the index there with justification.
- **D-IDX-03:** **No `(email, legacy_flow)` composite or `identity_provisioning_status` index.** Not reaching for speculative indexes; add on evidence, not anticipation.

### Migration Shape

- **D-MIG-01:** **Single Alembic revision file** at `alembic/versions/042_invite_provisioning_columns.py` (or whatever the next sequential number is — verify at plan time). Contains: (1) `op.add_column()` calls for the 5 columns, (2) `op.create_check_constraint()` for the status CHECK, (3) `op.create_index()` for the partial unique index, (4) `op.execute()` with the legacy-flow UPDATE, in that order. Downgrade inverts in reverse: drop index → drop check → drop columns; no need to undo the UPDATE because the columns are gone.
- **D-MIG-02:** **All new `Mapped[datetime | None]` columns in `app/models/invite.py` use `DateTime(timezone=True)`** and mirror the existing `email_delivery_queued_at` pattern. The new `identity_provisioning_at` is `nullable=True, default=None` (it's not set until provisioning happens in Phase 113).
- **D-MIG-03:** **Dry-run verification requirement (MIG-03):** the phase MUST run `alembic upgrade head` followed by `alembic downgrade -1` followed by `alembic upgrade head` against a dev-DB loaded from a recent prod snapshot (or the seed dataset if no snapshot access). Evidence: a `112-MIGRATION-DRY-RUN.md` artifact capturing the three commands + exit codes + row counts before/after.

### Claude's Discretion

- **Column ordering in the DDL** — planner chooses an order that keeps related columns grouped (e.g. `zitadel_user_id`, `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at` together; `legacy_flow` last or alongside other booleans). Postgres doesn't care; readability is the only criterion.
- **Fix-naive-datetime sweep** — if enabling `DTZ` codes surfaces violations in existing `app/` code, the planner decides whether the fix lives in this phase's migration commit (preferred: atomic "turn on the rule + fix what it catches") or a companion commit in the same PR. Default: single commit.
- **`tests/unit/test_no_naive_datetime.py` style** — `ast.walk` over all `.py` files under `app/` is the sketched approach. Planner picks exact assertion style (e.g., accumulate violations and assert empty list with filenames in the error message for diagnostics).
- **`ruff check` output on this branch** — if pre-existing `DTZ`-adjacent lint warnings surface that are NOT `utcnow` calls (e.g., `DTZ007`), planner decides: fix in scope if trivial, else add to `ignore` with a comment pointing at a follow-up issue. Do NOT defer `DTZ003` or `DTZ005` — those are the load-bearing checks.

### Folded Todos

None — `gsd-sdk query todo.match-phase 112` not re-run this session; discuss was already started. Planner should re-check before writing plans.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap (load first)
- `.planning/ROADMAP.md` §Phase 112 — success criteria
- `.planning/REQUIREMENTS.md` §MIG-01, §MIG-02, §MIG-03, §SEC-04 — acceptance wording; SEC-04's "ruff rule or unit test" is answered here as BOTH
- `.planning/REQUIREMENTS.md` §RECOV-04 — informs what legacy-flow rows get later (recovery CTA) without re-scoping it into this phase

### Upstream Phase Context
- `.planning/phases/111-urltemplate-spike-zitadel-service-surface/111-CONTEXT.md` — confirms `zitadel_user_id` holds strings returned by `ensure_human_user`, tz-aware convention, and that SEC-04 formally starts here (mentioned in 111 code_context)

### Research Pack (load for pitfalls + stack)
- `.planning/research/PITFALLS.md` — O6 naive-datetime regression (the bug SEC-04 prevents)
- `.planning/research/ARCHITECTURE.md` — where the new columns fit in the invite flow
- `.planning/research/SUMMARY.md` — v1.18 retrospective on tz-aware datetime convention

### Existing Code the Phase Extends
- `app/models/invite.py` — the model the 5 new `Mapped[...]` columns land in. Mirror the `email_delivery_queued_at` pattern for tz-aware datetime columns.
- `alembic/versions/041_invite_email_delivery_tz_aware.py` — most recent migration; precedent for `op.add_column()` + `op.alter_column()` style and downgrade symmetry
- `alembic/versions/027_data_integrity.py` — precedent for partial unique index DDL (the existing `WHERE accepted_at IS NULL AND revoked_at IS NULL` partial index on `(campaign_id, email)`)
- `alembic/env.py` — async engine config (asyncpg); migration must be compatible
- `pyproject.toml` §`[tool.ruff.lint]` — where `DTZ` codes get added
- `tests/unit/` — target directory for `test_no_naive_datetime.py`; follows existing `test_zitadel_*.py` layout

### Project Conventions
- `CLAUDE.md` — `uv` for Python ops, ruff rules line 88 char limit, asyncio_mode=auto for pytest
- `.planning/codebase/CONVENTIONS.md` — tz-aware datetime convention
- `.planning/codebase/TESTING.md` — unit vs integration test placement

### External Docs (verify syntax during planning)
- `https://docs.astral.sh/ruff/rules/#flake8-datetimez-dtz` — canonical DTZ rule list; confirms DTZ003 and DTZ005 names
- `https://docs.sqlalchemy.org/en/20/core/constraints.html#check-constraint` — SQLAlchemy 2.x named CHECK constraint API
- `https://alembic.sqlalchemy.org/en/latest/ops.html#alembic.operations.Operations.create_check_constraint` — Alembic CHECK constraint op

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`email_delivery_status` column** (`app/models/invite.py:40`) — precedent for `VARCHAR(32) NOT NULL DEFAULT 'pending'` on `invites`. Copy pattern for `identity_provisioning_status`.
- **`email_delivery_queued_at` column** (`app/models/invite.py:46`) — precedent for `DateTime(timezone=True), nullable=True, default=None`. Copy pattern for `identity_provisioning_at`.
- **Partial unique index on `(campaign_id, email)`** (`alembic/versions/027_data_integrity.py`) — precedent for the `WHERE zitadel_user_id IS NOT NULL` partial index syntax in Alembic.
- **`tests/unit/test_zitadel_token.py`** — layout + pytest-asyncio style to copy for `test_no_naive_datetime.py`, but the new test is synchronous (pure AST walk, no async).

### Established Patterns
- **Async asyncpg Alembic config** — migrations must not call blocking APIs. Pure SQL (`op.execute(...)`) and `op.add_column()` are safe.
- **Migration numbering is zero-padded 3-digit** (`041_invite_email_delivery_tz_aware.py`). Next sequential is `042`.
- **Downgrade symmetry is enforced** — every `op.add_column` in `upgrade()` has a matching `op.drop_column` in `downgrade()`. Planner verifies by eyeballing pairs.
- **`op.execute()` for data migrations** — the existing codebase uses raw SQL via `op.execute()` for non-DDL in migrations (e.g., `042` will be the first with a `UPDATE` data migration of meaningful scope, but `027` used it for check constraints).

### Integration Points
- **`app/models/invite.py`** — the only application-code file that changes in this phase (declarative model update). No routes, services, or tasks touched.
- **`pyproject.toml`** — `[tool.ruff.lint]` `select` list gets `"DTZ"` added. If a pre-existing `ignore` list excludes any DTZ rule specifically, planner decides whether to un-ignore.
- **Integration test runner** — `uv run pytest tests/integration/ -m integration` is the command that validates the migration against dev Postgres.

</code_context>

<specifics>
## Specific Ideas

- **Legacy UPDATE is inside the same migration, run after column creation.** Alembic allows multiple `op.*` calls in one `upgrade()`; the order is DDL → backfill → index. No transactional split.
- **Ruff `DTZ` sweep happens in the same commit as the rule enablement.** "Turn on rule, fix what it catches, commit" is one atomic change. Don't ship a broken-lint interim state.
- **`test_no_naive_datetime.py` explicitly names the AST pattern it catches in the failure message** — e.g., "Found 3 uses of `datetime.utcnow()` in app/: [list with filename:line]." This turns a future regression into a pointer, not a grep hunt.
- **`identity_provisioning_at` is set ONCE** per invite, when provisioning succeeds or fails (Phase 113). Not a "last touched" timestamp. Name is locked by MIG-01 so we live with it even if "provisioning_completed_at" would read better.

</specifics>

<deferred>
## Deferred Ideas

- **Index on `legacy_flow`** — deferred to Phase 115 when admin-list query patterns are concrete. If 115's query plan shows seq-scan pain, add a partial index there (`WHERE legacy_flow = true`).
- **Composite index on `(campaign_id, identity_provisioning_status)`** — not speculated today. If Phase 115's admin dashboard groups invites by status per campaign and shows a plan issue, add then.
- **Enum migration tooling (if we ever regret VARCHAR+CHECK)** — not a real deferred idea, more of a record: if we ever want pg_enum later, it's a new migration that creates the type and swaps the column. Non-trivial but bounded.
- **Auditable history of `identity_provisioning_status` changes** — a separate `invite_provisioning_events` table could log transitions. Not needed today (Loguru logs suffice for Phase 113/115 debugging); revisit if compliance or SLA dashboards need replay.
- **Naive-datetime enforcement for `scripts/` and `alembic/`** — deliberately out of scope per D-SEC04-04. If a future script ships to prod as a long-running job (not dev-time), revisit scope.

</deferred>

---

*Phase: 112-schema-migration-legacy-invite-handling*
*Context gathered: 2026-04-23*
