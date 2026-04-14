# Phase 111: Reconciliation & Dual-Identity Schema - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the data foundation for v1.19's dual-identity assignment model:

1. **Reconciliation migration** — one-time, idempotent Alembic data migration that links existing "Julia-style" dual-row volunteers (a `volunteers` row with an email but no `user_id`, where a matching `users` / `campaign_members` row exists on the same campaign).
2. **Dual-identity schema** — `session_callers` and `walk_list_canvassers` each accept a row with *either* `user_id` set *or* `volunteer_id` set, exactly one, enforced by a DB-level CHECK constraint. Both migrations are reversible.
3. **Pytest coverage** (MIGRATE-02) for the reconciliation migration against link / ambiguous / no-match seeded cases, asserting idempotent re-runs produce zero new links.

Out of scope: service-layer DTO unification (Phase 112), invite-acceptance backfill (Phase 112), runtime API gating (Phase 113), picker / disabled-button UI (Phase 114), cross-phase E2E (Phase 115).

</domain>

<decisions>
## Implementation Decisions

### Reconciliation matching
- **D-01:** Primary match key is **case-insensitive email only** — `LOWER(volunteers.email) = LOWER(users.email)`. No phone fallback, no name tiebreaker.
- **D-02:** Match is **campaign-scoped** — a `volunteers` row is only linked to a `users` row that is a `campaign_members` row for the same campaign. Global cross-campaign matching is explicitly rejected for tenant hygiene.
- **D-03:** When email + campaign match returns **multiple candidate users**, the volunteer row is **left untouched** and counted in the report's `ambiguous` bucket. Humans resolve later. No flag column added to `volunteers`, no fail-fast behavior — aligns with Phase 111 success criterion 1 ("leaves ambiguous rows unchanged").
- **D-04:** The migration is **idempotent** — re-running produces zero new links. Only rows where `volunteers.user_id IS NULL` are candidates; an already-linked row is counted as `unchanged`.

### Reconciliation report
- **D-05:** Report destination is **alembic log + JSONL artifact**. The migration prints aggregate counts (linked / ambiguous / unchanged) to the alembic output stream, AND writes a per-row JSONL artifact inside the API container (e.g., `/tmp/reconciliation-{revision}.jsonl` — exact path is planner's call, but must be predictable and operator-retrievable via `docker cp`). No new DB report tables.
- **D-06:** Per-ambiguous-row detail is **minimal**: `{ volunteer_id, email, candidate_user_ids: [...] }`. Enough for an operator to open the volunteer in the admin UI and pick the right user. No full row dumps (reduces PII footprint in logs/artifacts).
- **D-07:** Linked rows and unchanged rows are counted only — no per-row detail in the artifact for those buckets.

### Schema shape — `walk_list_canvassers`
- **D-08:** Restructure to **surrogate uuid `id` PK** (drop the existing composite `(walk_list_id, user_id)` PK). Both `user_id` and `volunteer_id` are nullable FKs; exactly-one enforcement via `CHECK (num_nonnulls(user_id, volunteer_id) = 1)`.
- **D-09:** Recover the "one assignment per person per walk list" invariant with **two partial unique indexes**:
  - `UNIQUE (walk_list_id, user_id) WHERE user_id IS NOT NULL`
  - `UNIQUE (walk_list_id, volunteer_id) WHERE volunteer_id IS NOT NULL`
- **D-10:** Preview SQL shape (planner may adjust column types to match existing conventions):
  ```sql
  CREATE TABLE walk_list_canvassers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    walk_list_id uuid NOT NULL REFERENCES walk_lists(id),
    user_id text NULL REFERENCES users(id),
    volunteer_id uuid NULL REFERENCES volunteers(id),
    assigned_at timestamptz DEFAULT now(),
    CHECK (num_nonnulls(user_id, volunteer_id) = 1)
  );
  ```

### Schema shape — `session_callers`
- **D-11:** Mirror the same shape. `session_callers` already has a surrogate `id uuid` PK, so the migration:
  - drops `NOT NULL` on `user_id`
  - adds `volunteer_id uuid NULL REFERENCES volunteers(id)`
  - adds `CHECK (num_nonnulls(user_id, volunteer_id) = 1)`
  - **replaces** `uq_session_caller` (`UNIQUE (session_id, user_id)`) with two partial unique indexes:
    - `UNIQUE (session_id, user_id) WHERE user_id IS NOT NULL`
    - `UNIQUE (session_id, volunteer_id) WHERE volunteer_id IS NOT NULL`
- **D-12:** Symmetric schema between the two tables is a **hard requirement** — Phase 112's DTO helper is written once and used for both surfaces.

### Downgrade policy
- **D-13:** `downgrade()` **blocks with a clear error** if any `volunteer_id IS NOT NULL` rows exist in either `session_callers` or `walk_list_canvassers`. Operator must resolve (run the invite-acceptance backfill from Phase 112, or delete the pre-signup rows explicitly) before downgrade can proceed. No silent data loss, no business logic in downgrade.
- **D-14:** When zero volunteer_id rows exist, the downgrade restores:
  - composite PK `(walk_list_id, user_id)` on `walk_list_canvassers` (surrogate `id` column dropped)
  - `NOT NULL` on `session_callers.user_id` and the original `uq_session_caller` unique constraint
  - Both `volunteer_id` columns dropped
  - CHECK constraints and partial indexes dropped

### Reconciliation scope
- **D-15:** Reconciliation only updates the **`volunteers` table** (sets `user_id`). It does NOT rewrite existing `session_callers` / `walk_list_canvassers` rows, because those rows are currently `user_id`-only — there's nothing to re-key. Any future `volunteer_id → user_id` swap on assignment tables is Phase 112's job (invite-acceptance backfill).

### Cross-identity uniqueness (deferred to Phase 112)
- **D-16:** The partial unique indexes guarantee uniqueness *per identity column* (a user can't be assigned twice as a user; a volunteer can't be assigned twice as a volunteer). They do NOT prevent the edge case where the same person appears once as `volunteer_id` AND once as `user_id` on the same session/walk list after reconciliation. This cross-identity uniqueness is **Phase 112's responsibility** — handled by the accept_invite backfill via `ON CONFLICT DO NOTHING` + delete of the pre-signup row when collapsing duplicates. Phase 111 stays pure schema.

### Test coverage (MIGRATE-02)
- **D-17:** Pytest coverage for the reconciliation migration exercises three seeded cases against a real test database:
  - **link case** — one volunteer, one matching user in same campaign → linked, count = 1
  - **ambiguous case** — one volunteer, two matching users in same campaign → untouched, ambiguous count = 1
  - **no-match case** — one volunteer, zero matching users → untouched, unchanged count = 1
- **D-18:** Plus an **idempotency test** — run the migration twice; second run produces zero new links and the same report counts (linked = 0 on second run, unchanged includes the previously linked rows).
- **D-19:** Schema-level tests (CHECK constraint rejects `(NULL, NULL)` and `(set, set)`; partial unique indexes enforce expected uniqueness; downgrade blocks when pre-signup rows exist) belong here too — they lock ASSIGN-01 / ASSIGN-02 at the DB level.

### Claude's Discretion
- Exact Alembic revision filename and migration `down_revision` chain (planner picks based on current head).
- JSONL artifact exact path inside the container (must be documented in the migration docstring and REVIEW).
- Whether the reconciliation step and the schema widen live in one Alembic revision or two sequential revisions — planner's call based on atomicity vs reviewability tradeoff. Both approaches satisfy the success criteria.
- Exact SQLAlchemy model updates on `SessionCaller` / `WalkListCanvasser` (surrogate id, nullable FKs, relationship to `Volunteer`) — standard ORM mapping.
- Test fixture seeding mechanics (factory-boy vs raw inserts vs existing `scripts/seed.py` hooks).

</decisions>

<specifics>
## Specific Ideas

- The driving example throughout the milestone is the **"Julia Callahan pattern"**: the same human exists as a `volunteers` row (approved via the v1.17 signup-link / application flow) AND as a `users` + `campaign_members` row (they logged in independently), with the same email but no linkage. Reconciliation must catch this.
- The CHECK constraint should use Postgres's **`num_nonnulls(user_id, volunteer_id) = 1`** idiom rather than `(a IS NOT NULL) <> (b IS NOT NULL)` — shorter, reads cleanly in `pg_dump`, supported since PG 9.5.
- "Shippable on its own" is a non-negotiable from roadmap success criterion 5 — after Phase 111 lands, the production schema is valid with or without any Phase 112+ work.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase scope
- `.planning/ROADMAP.md` §v1.19 / Phase 111 — Phase goal, requirements list (MIGRATE-01, MIGRATE-02, ASSIGN-01, ASSIGN-02), success criteria.
- `.planning/REQUIREMENTS.md` — Full text of MIGRATE-01, MIGRATE-02, ASSIGN-01, ASSIGN-02, TEST-01/02/03.
- `.planning/PROJECT.md` — Project vision, constraints, and non-negotiables that bound all phases.

### Existing models being modified
- `app/models/phone_bank.py` (`SessionCaller`, lines ~54-70) — current `session_callers` shape; surrogate `id`, `user_id NOT NULL`, `UNIQUE (session_id, user_id)`.
- `app/models/walk_list.py` (`WalkListCanvasser`, lines ~86-96) — current `walk_list_canvassers` shape; composite PK `(walk_list_id, user_id)`, no surrogate id.
- `app/models/volunteer.py` (`Volunteer`, line ~39) — target of reconciliation; `user_id` already nullable, `email` nullable, `ix_volunteers_user_id` already present.

### Alembic conventions
- `alembic/env.py` and existing revisions under `alembic/versions/` — async migration conventions, how prior reversible migrations handle NOT NULL drops and CHECK constraints in this codebase.

### Prior-art: v1.17 signup/invite flow
- `.planning/phases/101-*` through `.planning/phases/105-*` — defines where pre-signup `volunteers` rows come from (the Julia pattern exists because of the v1.17 flow).
- Current `InviteService.accept_invite` implementation (find via `grep -r accept_invite app/services`) — Phase 112 will extend this; Phase 111 decisions must not conflict with its existing transaction boundary.

No external specs or ADRs — requirements are fully captured in `REQUIREMENTS.md` and the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Async SQLAlchemy + asyncpg + Alembic** pipeline already in place; prior migrations have done reversible NOT NULL drops, CHECK adds, and partial indexes — planner should grep for prior examples rather than invent a new pattern.
- **`Volunteer.user_id`** column and index already exist (`ix_volunteers_user_id`). Reconciliation only writes to an existing column — no schema change on the `volunteers` table itself.
- **`campaign_members`** join already links `users` to `campaigns`. The campaign-scoped match query is a straightforward three-way join: `volunteers JOIN users ON LOWER(email)=LOWER(email) JOIN campaign_members ON user_id AND campaign_id`.
- **`docker compose exec api`** flow and the `scripts/seed.py` idempotent Macon-Bibb dataset give the reconciliation test a reliable fixture base.

### Established Patterns
- **Multi-tenant isolation** (see v1.12 + v1.13 remediation work) — every query that crosses identity must be scoped by `campaign_id`. This is why D-02 rejects global email matching.
- **Pytest markers** `integration` + `e2e`; `asyncio_mode=auto`. Migration tests typically run as integration tests against the real docker-compose Postgres.
- **`uv run`** for all python / pytest / ruff operations; `uv run ruff check .` is a pre-commit expectation.

### Integration Points
- Phase 112's `InviteService.accept_invite` extension will consume both new `volunteer_id` columns and the CHECK constraint's exactly-one rule. Phase 111 must not introduce any constraint that would block Phase 112's `UPDATE ... SET user_id = ?, volunteer_id = NULL` swap.
- Phase 113's runtime API gating reads `volunteer_id IS NOT NULL` to decide whether to 422. The nullable FK shape from D-08/D-11 is what makes that predicate possible.
- Phase 114's picker UI reads the same columns via the Phase 112 DTO helper. No direct picker dependency on 111 beyond "both columns exist."

</code_context>

<deferred>
## Deferred Ideas

- **Cross-identity uniqueness enforcement at DB level** (trigger or deferred constraint preventing the same resolved person from being assigned under both identities simultaneously) — suggested during discussion, deferred to Phase 112's service-layer backfill (`ON CONFLICT DO NOTHING` + delete on link).
- **Adding a `reconciliation_ambiguous` flag column on `volunteers`** — considered during ambiguity handling; rejected in favor of leaving rows untouched and reporting via JSONL artifact. Could be revisited in a later phase if operators need in-app triage UI.
- **Durable reconciliation report DB table** — considered for long-term auditability; rejected in favor of JSONL artifact to keep Phase 111 pure schema. Revisit if operations needs queryable history.
- **Phone-number fallback matching** and **name tiebreaker disambiguation** — suggested during matching discussion; rejected. Could become a follow-up reconciliation pass if post-phase ambiguous-bucket size is non-trivial.
- **FK cascade / ON DELETE behavior and Alembic revision ordering** — not discussed in depth; treated as planner discretion within the constraints above.

</deferred>

---

*Phase: 111-reconciliation-and-dual-identity-schema*
*Context gathered: 2026-04-14*
