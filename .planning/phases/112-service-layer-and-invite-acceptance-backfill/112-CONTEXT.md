# Phase 112: Service Layer & Invite-Acceptance Backfill - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the backend service-layer machinery that makes the Phase 111 dual-identity schema usable:

1. **Unified person DTO + resolver** — every service method that reads `session_callers` / `walk_list_canvassers` rows returns a discriminated `AssignmentPerson` DTO instead of raw ORM rows. A single helper module (`app/services/assignment_person.py`) resolves either `user_id` or `volunteer_id` against the `users` / `volunteers` tables and hands back a consistent shape (ASSIGN-03).
2. **Assignment write signature rewrite** — `WalkListService.assign_canvasser`, `PhoneBankService.add_caller` (and any other mutation path) take a `PersonRef` discriminated Pydantic model (`{kind: "user" | "volunteer", id}`) instead of a bare `user_id: str`. Pydantic enforces exactly-one at the boundary; the DB CHECK is the safety net.
3. **accept_invite backfill** — extend `InviteService.accept_invite` so that after the existing `Volunteer.user_id` backfill runs, two additional UPDATEs promote any outstanding `session_callers` / `walk_list_canvassers` rows whose `volunteer_id` resolves to the invitee's email-in-campaign. Collisions with an existing `user_id`-keyed row on the same session/walk_list are resolved by a partial-unique-index-driven `DO NOTHING` + DELETE of the pre-signup row. All of it happens inside the same transaction that already wraps accept_invite, before the ZITADEL project-role assignment (BACKFILL-01 / BACKFILL-02).
4. **Integration tests** — the resolver, the rewritten assignment writes, and the accept_invite backfill all land with pytest integration coverage against the real test database (TEST-01 / TEST-02).

Out of scope: runtime API 422 gating (Phase 113), picker UI and disabled-button UX (Phase 114), E2E journey coverage (Phase 115), any new ZITADEL integration change.

</domain>

<decisions>
## Implementation Decisions

### Unified Person DTO (Area 1)
- **D-01:** DTO type lives in **`app/schemas/assignment_person.py`** — new schemas module, mirrors existing `app/schemas/` layout.
- **D-02:** DTO is a **Pydantic `AssignmentPerson`** with a `kind: Literal["user", "volunteer"]` discriminator, plus `id: str`, `display_name: str`, `email: str | None`, `phone: str | None`, `volunteer_id: UUID | None`, `user_id: str | None`, `is_pre_signup: bool`. The two optional IDs are populated per row so the frontend (Phase 114) can key off either. `is_pre_signup` is the derived convenience flag (`kind == "volunteer"`).
- **D-03:** Resolver helper lives in **`app/services/assignment_person.py`** — standalone module exporting `resolve_person(db, row) -> AssignmentPerson` and `resolve_people(db, rows) -> list[AssignmentPerson]`. The plural form does a single batched `selectinload`-style query per identity type to avoid N+1. Both `SessionCaller` and `WalkListCanvasser` rows are handled by the same helper via a tiny protocol (they share the `user_id` / `volunteer_id` shape).
- **D-04:** Display name fallback: **prefer `User.full_name`**, fall back to `Volunteer.first_name + " " + Volunteer.last_name` (trim empties), final fallback to email local-part. Rationale: once an invite is accepted the `users` row becomes canonical; pre-acceptance we only have the volunteer row.

### Assignment Write Signature (Area 2)
- **D-05:** Replace `user_id: str` param with **`person_ref: PersonRef`** — a small Pydantic model in `app/schemas/assignment_person.py` shaped `{kind: Literal["user","volunteer"], id: str}` (the `id` is `str` because user IDs are ZITADEL strings and volunteer IDs are UUIDs; service routes `uuid.UUID(id)` when `kind=="volunteer"`).
- **D-06:** **No backwards-compat shim.** The old `user_id`-only signatures on `WalkListService.assign_canvasser`, `WalkListService.remove_canvasser`, and `PhoneBankService.add_caller` / related mutations are deleted. All call sites are internal (routes + tests) and migrated in the same commit.
- **D-07:** Exactly-one validation is enforced at the **Pydantic `PersonRef` boundary** (`kind` discriminator plus a field validator ensuring `id` is non-empty). Service trusts the model; the DB CHECK from Phase 111 is the final safety net. No redundant checks in the service layer.
- **D-08:** Cross-identity duplicate on assign (same person resolvable as both a `user` and a `volunteer` on the same session/walk_list before invite acceptance) raises a **`ConflictError`** with structured code `ASSIGNMENT_DUPLICATE_IDENTITY`. The API layer translates to **409**. Assign-time is strict; merging happens **only** through the `accept_invite` backfill, which is the one place we have authoritative signal.

### accept_invite Backfill (Area 3)
- **D-09:** The backfill runs as **two UPDATE statements** (one per table) issued immediately after the existing `Volunteer.user_id` backfill and before the ZITADEL project-role call. Shape:
  ```sql
  UPDATE session_callers
     SET user_id = :new_user_id, volunteer_id = NULL
   WHERE volunteer_id IN (
     SELECT id FROM volunteers
      WHERE LOWER(email) = LOWER(:invitee_email)
        AND campaign_id = :campaign_id
   )
  ```
  Same shape for `walk_list_canvassers`. Campaign-scoped, email-matched, entirely in SQL — no Python row loops.
- **D-10:** **Collision handling:** if the invitee is already assigned under `user_id` on the same session/walk_list (the Julia-pattern post-reconciliation case), the partial unique index from Phase 111 (`UNIQUE (session_id, user_id) WHERE user_id IS NOT NULL`) would reject the UPDATE. Handle this by issuing the UPDATE with an `ON CONFLICT ... DO NOTHING` equivalent — since UPDATE can't take `ON CONFLICT` directly, the planner is free to choose between:
  - two-pass approach: (a) `DELETE` pre-signup rows whose (session, resolved_user) already exists under `user_id`; (b) `UPDATE` the survivors to promote them; OR
  - a single CTE/statement that filters out would-conflict rows before the UPDATE and DELETEs them.
  Either approach is fine as long as (1) no unique-violation exception escapes, (2) the post-state has zero `volunteer_id` rows for the invitee in either table, and (3) an INFO-level log records the collapse count (`logger.info("accept_invite: collapsed {n} duplicate pre-signup assignments", ...)`).
- **D-11:** **Transaction ordering:** the backfill is inserted between the existing `Volunteer.user_id` backfill and the `zitadel.assign_project_role` call, inside the same `AsyncSession` scope. The existing compensating-rollback logic around ZITADEL is unchanged — it already rolls back the DB on ZITADEL failure.
- **D-12:** **Failure semantics:** any DB error during the backfill causes the entire transaction to roll back. ZITADEL has not yet been called, so no compensation is needed. BACKFILL-02 is satisfied by placing the backfill inside the existing `async with session` scope that accept_invite already uses.

### Test Strategy (Area 4)
- **D-13:** `AssignmentPerson` resolver coverage is **integration-only** (pytest `integration` marker) against the real test DB via the existing `db_session` fixture. Rationale: the resolver exists specifically to eliminate N+1 and load `users`/`volunteers` in one pass — mocking the session would hide the load pattern the helper is built to enforce.
- **D-14:** `accept_invite` backfill coverage is **integration** at the `InviteService` layer. A fixture seeds: an `Invite`, a pre-signup `Volunteer` with matching email, one `SessionCaller` row with `volunteer_id` set, one `WalkListCanvasser` row with `volunteer_id` set. Test calls `InviteService.accept_invite(...)` with a ZITADEL spy fake. Assertions: both assignment rows now have `user_id` set and `volunteer_id NULL`, `Volunteer.user_id` is set, `CampaignMember` exists, ZITADEL spy was called once with the expected role, all in a single committed transaction.
- **D-15:** **Cross-identity collision** has its own dedicated integration test. Fixture seeds the Julia pattern: the invitee is already present as a `CampaignMember` + `session_callers` row (`user_id` set) AND as a pre-signup `Volunteer` + `session_callers` row (`volunteer_id` set) on the SAME session. `accept_invite` runs. Assertions: the `user_id` row survives, the `volunteer_id` row is deleted, no `UniqueViolation` is raised, the `logger.info` collapse count is 1.
- **D-16:** Assignment write tests cover the **PersonRef path for both identity types** — unit-of-behavior integration tests for `assign_canvasser(person_ref={kind:"user",...})` and `assign_canvasser(person_ref={kind:"volunteer",...})`. Plus negative tests for the `ASSIGNMENT_DUPLICATE_IDENTITY` 409 path.
- **D-17:** **Fixture seeding approach:** reuse existing pytest async fixtures in `tests/conftest.py` plus raw SQLAlchemy inserts, matching the pattern in `tests/services/test_invite.py`. No factory-boy — the codebase doesn't use it and adding it would be inconsistent.

### Claude's Discretion
- Exact SQL shape of the collision-safe backfill (single CTE vs two-statement) — planner picks whichever is cleanest, both satisfy the post-state requirement in D-10.
- Whether `resolve_people` uses `selectinload`, `joinedload`, or a separate `IN (...)` query — planner's judgment based on the actual query shape in `list_callers` / `list_canvassers`.
- Whether `PersonRef` lives in the same file as `AssignmentPerson` or a separate module — both acceptable.
- Exact signature of `ConflictError` (reuse existing app error class if present, otherwise create a minimal one in `app/core/errors.py`).
- Exact test file layout (one file per service vs one combined file) — match existing convention in `tests/services/`.

</decisions>

<specifics>
## Specific Ideas

- The driving collision case is the **Julia Callahan pattern**: the same human exists as both a `campaign_members` row (user_id) AND a pre-signup `volunteers` row (email match) on the same campaign, already assigned to the same session under two different identity columns. The Phase 111 reconciliation migration links the volunteer to the user, but it explicitly defers cross-identity assignment collapse to this phase (D-16 in Phase 111 context). Phase 112 closes that gap via the `accept_invite` backfill.
- `logger` is `loguru.logger` throughout `app/services/` — use the same style `logger.info("message {}", arg)`.
- The existing `accept_invite` flow already has compensating rollback logic around ZITADEL (see `app/services/invite.py` lines ~278-300). The backfill must not interfere with that.
- `app/services/field.py` also references session_callers and walk_list_canvassers — any mutation paths in `FieldService` need the same PersonRef treatment. Planner should grep `field.py` during research.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase scope
- `.planning/ROADMAP.md` §v1.19 / Phase 112 — Phase goal, success criteria, dependencies.
- `.planning/REQUIREMENTS.md` — ASSIGN-03, BACKFILL-01, BACKFILL-02, TEST-01, TEST-02.
- `.planning/phases/111-reconciliation-and-dual-identity-schema/111-CONTEXT.md` — Phase 111 schema decisions (especially D-08 through D-16) that this phase builds on.

### Existing service-layer surfaces being rewritten
- `app/services/invite.py` — `InviteService.accept_invite` (lines ~176-310). Current `Volunteer.user_id` backfill already lives at lines 231-239; new assignment backfill slots in right after it, before the ZITADEL call.
- `app/services/phone_bank.py` — `PhoneBankService.add_caller` / `PhoneBankService.list_callers` (line ~776) / `_get_caller` (line ~814). All current signatures take `user_id: str`; all become `person_ref: PersonRef`.
- `app/services/walk_list.py` — `WalkListService.assign_canvasser` (line ~321), `remove_canvasser` (line ~360), `list_canvassers` (line ~381). Same rewrite pattern.
- `app/services/field.py` — cross-domain check-in logic that auto-creates canvasser/caller records (see v1.0 requirement "Cross-domain check-in"). Needs PersonRef treatment too.
- `app/services/shift.py` — also references both tables; grep for `session_caller|walk_list_canvasser` during research.

### Existing schema + models
- `app/schemas/` — existing Pydantic schema conventions (camelCase vs snake_case, BaseModel config). Match whatever's already there.
- `app/models/phone_bank.py` — `SessionCaller` (post-111 shape: nullable `user_id`, nullable `volunteer_id`, CHECK + partial indexes).
- `app/models/walk_list.py` — `WalkListCanvasser` (post-111 shape: surrogate `id`, nullable FKs, CHECK + partial indexes).
- `app/models/volunteer.py` — `Volunteer` (target of the existing `user_id` backfill that this phase extends).
- `app/core/errors.py` — existing app exception hierarchy. Reuse `ConflictError` if it exists; otherwise add a minimal one there.

### Test conventions
- `tests/conftest.py` — async fixtures (`db_session`, `test_client`, etc.).
- `tests/services/test_invite.py` — existing style for `InviteService` integration tests; the new backfill tests slot alongside.
- `pytest.ini` / `pyproject.toml` — `asyncio_mode=auto`, markers: `integration`, `e2e`.

### Existing test data fixtures
- `scripts/seed.py` — the Macon-Bibb dataset. Not a replacement for fixtures, but useful as a reference for how the codebase constructs realistic multi-tenant rows.

No external specs or ADRs — requirements are fully captured in REQUIREMENTS.md and the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Existing accept_invite transaction scope** — already wraps `Volunteer.user_id` backfill + `CampaignMember` upsert + ZITADEL role assignment + commit/rollback compensation. The new assignment backfill is an additive two-UPDATE statement inside the same scope — no new transaction management needed.
- **Pydantic v2 discriminated unions** — the codebase already uses `Literal[...]` discriminators (see existing schemas for the import wizard and filter builder). `PersonRef` follows the same pattern.
- **`app/core/errors.py`** — existing custom error hierarchy (`InsufficientPermissionsError`, etc.) that the API layer already translates to HTTP status codes. New `ConflictError` (if not already present) fits cleanly here.
- **`db_session` pytest fixture + raw SQLAlchemy insert style** — established in `tests/services/test_invite.py` and `tests/test_invites*.py`.

### Established Patterns
- Services own their own transactions via `AsyncSession` passed in from routes/tests — no service creates its own session.
- Routes translate custom exceptions (`ConflictError`, `ValueError`, `InsufficientPermissionsError`) to HTTP status codes at the API layer. Phase 112 should not introduce HTTP concerns into services.
- `loguru.logger` with f-string-style `logger.info("message {}", arg)` throughout service layer.
- `uv run ruff check .` + `uv run ruff format .` are pre-commit expectations.
- Integration tests hit the real docker-compose Postgres via `db_session` fixture — no mocking of the database.

### Integration Points
- **Phase 113** (Runtime API Gating) will consume the `AssignmentPerson.is_pre_signup` flag to decide whether to 422 a runtime call. Phase 112 must produce this field correctly on every read path.
- **Phase 114** (Picker UI) will call new list endpoints that return `list[AssignmentPerson]` serialized to JSON. Phase 112 does not ship the endpoints themselves — just the service-layer helpers that those future endpoints will call. Phase 114 can assume the resolver is ready.
- **Phase 115** (E2E) assumes the full backfill flow works end-to-end at the service layer; Phase 112 is where the underlying mechanism is proven by integration tests.

</code_context>

<deferred>
## Deferred Ideas

- **Factory-boy fixture library** — discussed during test strategy; rejected because the codebase doesn't use it and introducing a new dependency for one phase is churn.
- **Runtime API 422 gating** — belongs to Phase 113; Phase 112 produces the `is_pre_signup` signal but does not act on it at the API layer.
- **New API endpoints for the picker UI** — Phase 114's responsibility; Phase 112 only ships service-layer helpers.
- **Refactoring `FieldService` cross-domain check-in** beyond the PersonRef signature swap — any behavioral change is out of scope.
- **Bulk assignment API** (multiple volunteers in one call) — listed as a Future Requirement in REQUIREMENTS.md; not Phase 112.

</deferred>

---

*Phase: 112-service-layer-and-invite-acceptance-backfill*
*Context gathered: 2026-04-14*
