---
phase: 110-offline-queue-connectivity-hardening
plan: 02
subsystem: offline-queue
tags: [offline, idempotency, client_uuid, door-knock, alembic]
requirements: [OFFLINE-01, TEST-01, TEST-02]
dependency_graph:
  requires:
    - 110-01 (audit findings — identified this gap as OFFLINE-01 critical path)
  provides:
    - "DoorKnock idempotency end-to-end (client_uuid field + DB unique + 409 path)"
    - "Offline queue double-enqueue guard for door_knock (entry, voter, result) triple"
  affects:
    - "110-04 (sync robustness — now has stable client_uuid across retries)"
    - "110-05 (connectivity pill — reads the same offlineQueueStore that now stamps client_uuid)"
tech_stack:
  added:
    - "Partial UNIQUE index on voter_interactions (campaign_id, client_uuid) WHERE type='DOOR_KNOCK'"
    - "DuplicateClientUUIDError domain exception in app/services/canvass.py"
  patterns:
    - "IntegrityError → rollback → domain exception → RFC 7807 409 at the route"
    - "Client-generated UUID stamped once into both QueueItem.id AND payload.client_uuid"
key_files:
  created:
    - alembic/versions/040_door_knock_client_uuid.py
    - tests/integration/test_walk_list_door_knock_idempotency.py
    - .planning/phases/110-offline-queue-connectivity-hardening/110-02-SUMMARY.md
  modified:
    - app/schemas/canvass.py
    - app/models/voter_interaction.py
    - app/services/voter_interaction.py
    - app/services/canvass.py
    - app/api/v1/walk_lists.py
    - tests/integration/test_door_knocks.py
    - tests/unit/test_canvassing.py
    - web/src/types/walk-list.ts
    - web/src/stores/offlineQueueStore.ts
    - web/src/stores/offlineQueueStore.test.ts
    - web/src/hooks/useCanvassingWizard.ts
    - web/src/hooks/useCanvassingWizard.test.ts
decisions:
  - "client_uuid stored on voter_interactions (not a new DoorKnock table) because door knocks are already polymorphic VoterInteraction rows"
  - "Partial UNIQUE index scoped to type='DOOR_KNOCK' so other interaction types (notes/tags/imports/etc) keep NULL client_uuid without a constraint penalty"
  - "Partial index predicate uses the uppercase enum NAME 'DOOR_KNOCK' not the StrEnum value 'door_knock' — SQLAlchemy native_enum=False stores the member name on disk; discovered via direct DB inspection during RED→GREEN"
  - "IntegrityError handled in service layer with explicit rollback() before raising DuplicateClientUUIDError — route layer's later db.commit() would otherwise fail on the aborted transaction"
  - "Double-enqueue guard checks (walk_list_entry_id, voter_id, result_code) only, not client_uuid itself — the guard must fire BEFORE the new UUID is generated to protect against rapid double-tap"
  - "Online path (useCanvassingWizard.submitDoorKnock) stamps client_uuid at the call site so online mutateAsync AND TypeError offline fallback share the SAME UUID — a dropped-connection retry reuses the ID and hits the 409 dedup path"
metrics:
  duration: "~55 min"
  completed_date: 2026-04-11
  tasks_completed: 3
  files_created: 3
  files_modified: 12
---

# Phase 110 Plan 02: client_uuid Idempotency End-to-End Summary

**One-liner:** Added a required client-generated `client_uuid` field to door-knock POSTs, enforced exactly-once delivery via a partial UNIQUE index on `voter_interactions(campaign_id, client_uuid) WHERE type='DOOR_KNOCK'`, and wired the offline queue store to stamp the same UUID onto `QueueItem.id` and `payload.client_uuid` so mid-flight retries collapse into 409s consumed by the existing `isConflict` branch.

## What shipped

### Server (Task 1 — TDD RED → GREEN, commit 79595eb6)

- **`app/schemas/canvass.py`** — `DoorKnockCreate.client_uuid: UUID` is now required. Missing field returns 422.
- **`app/models/voter_interaction.py`** — `VoterInteraction.client_uuid: Mapped[uuid.UUID | None]` column added. Nullable because non-door-knock interaction types (notes, tags, imports, contact_updated, survey_response) legitimately have no client_uuid; the partial index enforces non-null + uniqueness for door knocks only.
- **`app/services/voter_interaction.py`** — `record_interaction()` accepts an optional `client_uuid: uuid.UUID | None = None` kwarg and writes it to the new column.
- **`app/services/canvass.py`** — New `DuplicateClientUUIDError` exception. `record_door_knock()` wraps the interaction insert in `try/except IntegrityError`; on constraint name match it rolls back the session and raises the domain exception.
- **`app/api/v1/walk_lists.py:332`** — Route catches `DuplicateClientUUIDError` → returns `ProblemResponse(status=409, type="door-knock-duplicate")`, which the client's existing `useSyncEngine.isConflict` branch already drops from the queue.
- **`alembic/versions/040_door_knock_client_uuid.py`** — Idempotent, reversible migration:
  1. `ALTER TABLE voter_interactions ADD COLUMN IF NOT EXISTS client_uuid UUID` (nullable)
  2. Backfill existing `DOOR_KNOCK` rows with `gen_random_uuid()`
  3. `CREATE UNIQUE INDEX IF NOT EXISTS uq_voter_interactions_door_knock_client_uuid ON voter_interactions (campaign_id, client_uuid) WHERE type = 'DOOR_KNOCK'`
  - `downgrade()` drops the index then the column. Verified reversible via `alembic downgrade 039_volunteer_applications && alembic upgrade head` on the dev DB.
- **`tests/integration/test_walk_list_door_knock_idempotency.py`** — 4 new integration tests:
  - `test_duplicate_client_uuid_returns_409` — second POST same UUID → 409
  - `test_different_client_uuids_both_succeed` — no false dedup
  - `test_missing_client_uuid_returns_422` — Pydantic required
  - `test_concurrent_duplicate_posts_exactly_one_201` — race-safe via DB unique index (not app-level check-then-insert)
- **`tests/integration/test_door_knocks.py` + `tests/unit/test_canvassing.py`** — Ripple-update fixtures to supply `client_uuid` (schema change propagation).

### Client (Task 2, commit 77921e26)

- **`web/src/types/walk-list.ts`** — `DoorKnockCreate.client_uuid: string` is now a required field. tsc fails any call site that omits it.
- **`web/src/stores/offlineQueueStore.ts`** — `push()` now:
  1. Generates the UUID once via `crypto.randomUUID()`
  2. Stamps it on BOTH `QueueItem.id` AND `payload.client_uuid` (door_knock only)
  3. Double-enqueue guard: if an existing pending door_knock matches the incoming `(walk_list_entry_id, voter_id, result_code)` triple, early-return with a `console.debug` trace and do NOT push
- **`web/src/hooks/useCanvassingWizard.ts`** — `submitDoorKnock()` stamps `client_uuid` at the call site BEFORE `mutateAsync`, so online path and offline fallback share the SAME UUID. A mid-flight connection drop that retries through the queue carries the same UUID and hits the server-side 409 dedup path.
- **Tests** — `offlineQueueStore.test.ts` adds 3 new tests (stamping, double-enqueue guard, different-triples coexist) and updates 2 baseline tests. `useCanvassingWizard.test.ts` updates 2 `toHaveBeenCalledWith` assertions to use `expect.objectContaining` with `client_uuid: expect.any(String)`.

### Regression sweep (Task 3 — commit for SUMMARY/docs will follow)

- **pytest:** `1122 passed` on full suite (`uv run pytest -q -x`, ~71 s)
- **ruff:** `All checks passed!`
- **vitest:** `741 passed, 21 todo, 6 skipped` across 78 test files (~8.5 s)
- **tsc --noEmit:** clean (0 errors)

## Critical findings discovered during execution

1. **The `type` column stores the enum NAME, not the StrEnum VALUE.** `InteractionType` is a `StrEnum` with value `'door_knock'`, but SQLAlchemy's `Enum(..., native_enum=False)` writes the member *name* `'DOOR_KNOCK'` to disk. The first pass of the migration used `WHERE type = 'door_knock'`, which matched zero rows → the partial index never fired → duplicate POSTs still succeeded. Root-caused via a `psql \d voter_interactions` + direct `SELECT DISTINCT type FROM voter_interactions` inspection during RED→GREEN. Migration predicate corrected to uppercase; verified via `alembic downgrade` + `upgrade` and confirmed index predicate reads `WHERE type::text = 'DOOR_KNOCK'::text`.

2. **`IntegrityError` aborts the async session** — without an explicit `await session.rollback()` inside the service catch, the route's later `await db.commit()` would raise `PendingRollbackError: This Session's transaction has been rolled back due to a previous exception during flush`. Fixed by rolling back before raising `DuplicateClientUUIDError`.

3. **`app_user` RLS engine works with the partial index** — the partial UNIQUE index is enforced at the storage/index layer independent of RLS, so the race test (`asyncio.gather` two POSTs with the same client_uuid) correctly returns exactly one 201 and one 409 even through the RLS-wrapped `get_campaign_db` dependency.

## Deviations from plan

Plan 110-02 prescribed "add a new DoorKnock model" / "check the DoorKnock schema" — but the actual codebase has **no DoorKnock table**; door knocks are polymorphic `VoterInteraction` rows with `type = InteractionType.DOOR_KNOCK`. Applied Rule 1 / Rule 3: adapted the plan to the real shape (add column to `voter_interactions`, use a partial UNIQUE index instead of a table-wide one). No user decision needed — the semantic requirement (exactly-once delivery for door-knock POSTs) is met with strictly less schema churn.

All other scope items executed exactly as the plan specified.

**Auto-fixed during execution:**

- **[Rule 3 — Blocking]** Existing `tests/integration/test_door_knocks.py` and `tests/unit/test_canvassing.py` constructed `DoorKnockCreate` fixtures without `client_uuid`. Required-field addition broke them. Fixed inline by adding `client_uuid=str(uuid.uuid4())` to `_base_payload` and each `SimpleNamespace` stub (5 occurrences). Documented with inline comment citing plan 110-02 / OFFLINE-01.
- **[Rule 3 — Blocking]** Existing `web/src/stores/offlineQueueStore.test.ts` had two `.toEqual` assertions that pinned the exact payload shape — broke when push() started stamping client_uuid. Fixed inline to include `client_uuid: <mocked-uuid>`.
- **[Rule 3 — Blocking]** Existing `web/src/hooks/useCanvassingWizard.test.ts` had two `toHaveBeenCalledWith` assertions pinning the exact mutateAsync payload — broke when submitDoorKnock started stamping client_uuid at the call site. Fixed inline to use `expect.objectContaining({ ..., client_uuid: expect.any(String) })`.
- **[Ruff I001]** New `from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID` triggered the project's isort config. Split into two import lines.

## Known Stubs

None. Every stub-like pattern this plan touches (the nullable `client_uuid` column for non-door-knock rows) is intentional and documented inline.

## Threat Flags

None new. The plan's `<threat_model>` already covered the client_uuid trust boundary:

- T-110-01 (Tampering): Mitigated via Pydantic UUID validation + DB unique scoped to `(campaign_id, client_uuid)` — cross-tenant collision impossible.
- T-110-02 (Info Disclosure): Accepted — 409 leaks "some prior door_knock exists"; attacker already authenticated.
- T-110-03 (DoS): Accepted — existing `120/minute` rate limit on the route.
- T-110-04 (Repudiation): Mitigated — client_uuid adds device-level audit correlation on top of existing `created_by` user_id.

## Commits

- `79595eb6` feat(110-02): server-side client_uuid idempotency for door-knock POSTs
- `77921e26` feat(110-02): client-side client_uuid stamping + double-enqueue guard
- `<pending>` docs(110-02): complete client_uuid idempotency plan (this SUMMARY + state)

## Self-Check: PASSED

- FOUND: `alembic/versions/040_door_knock_client_uuid.py`
- FOUND: `tests/integration/test_walk_list_door_knock_idempotency.py`
- FOUND commit `79595eb6` (server-side)
- FOUND commit `77921e26` (client-side)
- VERIFIED: `uv run ruff check .` → `All checks passed!`
- VERIFIED: full pytest → `1122 passed`
- VERIFIED: full vitest → `741 passed`
- VERIFIED: `npx tsc --noEmit` → clean
- VERIFIED: migration reversible (`alembic downgrade 039` then `upgrade head` on dev DB)
- VERIFIED: partial unique index present with correct predicate: `WHERE type::text = 'DOOR_KNOCK'::text`
