# E2E Known Bugs Sprint Plan

## Sprint Goal
Remove bug-driven E2E skips and stabilize flaky assignment flows so the suite validates real behavior, not contingencies.

### Target outcomes
- `PB-10` no longer skipped.
- `UI-03` no longer skipped.
- `FIELD-07/08/09/10` no longer skipped for data exhaustion.
- Table sort bug suite no longer skipped.
- Reduced duplicate-key noise in logs for caller/canvasser assignment paths.

## Sprint Length and Capacity
- 10 working days (1 sprint), 1 developer
- Estimated total: **8-10 dev days** + **1 day buffer**

---

## Backlog (Sprint-ready Tickets)

### Ticket 1: Implement session delete endpoint (PB-10 blocker)
- **Priority:** P0
- **Estimate:** 1.0-1.5 days
- **Why:** `PB-10` is skipped because backend DELETE endpoint is missing (`web/e2e/phone-banking.spec.ts:480`).

#### Change details
- Add service method in `app/services/phone_bank.py`:
  - `delete_session(session, session_id, campaign_id)`:
    - verify session exists and belongs to campaign
    - release in-progress call list entries tied to session's call list
    - delete associated `session_callers`
    - delete session
    - raise `ValueError` if not found
- Add API route in `app/api/v1/phone_banks.py`:
  - `DELETE /campaigns/{campaign_id}/phone-bank-sessions/{session_id}`
  - auth: `require_role("manager")`
  - returns `204`, `404` on missing
- Frontend already has delete mutation in `web/src/hooks/usePhoneBankSessions.ts:91`; validate wiring.
- Unskip `PB-10` in `web/e2e/phone-banking.spec.ts`.

#### Acceptance criteria
- Session can be deleted from UI.
- `PB-10` passes without skip.
- No orphaned `session_callers` rows remain.

---

### Ticket 2: Make assignment endpoints idempotent (flake/root-cause hardening)
- **Priority:** P0
- **Estimate:** 1.5-2.0 days
- **Why:** Docker logs show repeated unique constraint collisions (`uq_session_caller`, `walk_list_canvassers_pkey`) under parallel runs.

#### Change details
- `app/services/phone_bank.py` and/or `app/api/v1/phone_banks.py:203`:
  - replace insert-only caller assignment with Postgres upsert (`ON CONFLICT (session_id, user_id)`).
  - return existing assignment when already present (idempotent success).
- `app/services/walk_list.py:317` and `app/api/v1/walk_lists.py:254`:
  - same idempotent upsert behavior for `(walk_list_id, user_id)`.
- Keep role checks and campaign scoping intact.
- Standardize response semantics (document whether first create vs existing assignment differs).

#### Acceptance criteria
- Repeated assignment calls do not throw integrity errors.
- Duplicate assignment attempts are harmless and deterministic.
- Duplicate-key log noise materially decreases.

---

### Ticket 3: Fix and verify table sorting across 8 surfaces
- **Priority:** P1
- **Estimate:** 2.0 days
- **Why:** 8 known-bug sort tests are skipped in `web/e2e/table-sort.spec.ts:125`.

#### Target files/pages
- `web/src/routes/campaigns/$campaignId/settings/members.tsx`
- `web/src/routes/campaigns/$campaignId/voters/lists/index.tsx`
- `web/src/routes/campaigns/$campaignId/voters/tags/index.tsx`
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx`
- `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/index.tsx`
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx`
- `web/src/routes/campaigns/$campaignId/volunteers/roster/index.tsx`
- `web/src/routes/campaigns/$campaignId/volunteers/tags/index.tsx`

#### Change details
- For each page:
  - add `const [sorting, setSorting] = useState<SortingState>([])`
  - pass `sorting` and `onSortingChange` into `DataTable`
- Ensure sortable columns have valid `accessorKey`/`accessorFn`.
- Validate `aria-sort` updates for click and keyboard sort interactions.
- Unskip table sort bug suite after fixes.

#### Acceptance criteria
- 8 previously skipped table-sort tests run and pass.
- `aria-sort` changes as expected for sortable columns.

---

### Ticket 4: Fix invalid campaign error state (UI-03 blocker)
- **Priority:** P1
- **Estimate:** 1.0 day
- **Why:** `UI-03` is skipped due empty main area + retry interaction (`web/e2e/cross-cutting.spec.ts:517`).

#### Change details
- In `web/src/routes/campaigns/$campaignId.tsx`:
  - set explicit query retry strategy for campaign fetch:
    - no retry for 403/404/permanent authorization/not-found errors
    - optional retry only for transient network/5xx
  - ensure invalid campaign consistently renders deterministic error UI (`Campaign not found` + recovery link).
- Optionally tune global QueryClient defaults in `web/src/main.tsx` if needed.
- Unskip `UI-03` in `web/e2e/cross-cutting.spec.ts`.

#### Acceptance criteria
- Invalid campaign route always shows explicit error state.
- `UI-03` runs and passes.

---

### Ticket 5: Stabilize field-mode tests with deterministic data setup
- **Priority:** P1
- **Estimate:** 2.0 days
- **Why:** `FIELD-07/08/09/10` skip when walk list/call list is exhausted (`web/e2e/field-mode.volunteer.spec.ts`).

#### Change details
- Update `web/e2e/field-mode.volunteer.spec.ts` `beforeAll` to create dedicated fresh resources:
  - call list with guaranteed callable entries
  - active phone-bank session assigned to volunteer
  - walk list with at least one incomplete household
  - optional attached survey script for positive survey path
- Avoid shared seeded sessions/lists that parallel runs deplete.
- Split FIELD-07 into deterministic cases if needed:
  - survey-present
  - survey-absent
- Remove BUG-01 skip branches once setup is deterministic.

#### Acceptance criteria
- FIELD-08/09/10 always have callable entry context.
- FIELD-07 no longer depends on incidental data state.
- Field-mode tests pass reliably across repeated runs.

---

### Ticket 6 (Optional): Automate "Deleted list" fallback test
- **Priority:** P2
- **Estimate:** 0.5-1.0 day
- **Why:** currently manual-only skip (`web/e2e/phase21-integration-polish.spec.ts:409`).

#### Change details
- Create throwaway call list + session via API.
- Delete call list.
- Verify `Deleted list` fallback text in:
  - sessions index
  - my sessions
  - session detail
- Clean up leftover data.

#### Acceptance criteria
- Manual skip replaced by reliable automated regression test.

---

## Recommended Implementation Order

1. Ticket 1 (DELETE session API)
2. Ticket 2 (idempotent assignment hardening)
3. Ticket 5 (field-mode deterministic fixtures)
4. Ticket 4 (UI-03 invalid campaign behavior)
5. Ticket 3 (table sorting across 8 pages)
6. Ticket 6 optional (deleted-list automation)

**Rationale:** unblock hard backend dependency first, then remove flake roots, then re-enable skipped coverage.

---

## Junior Developer Runbook (End-to-End)

1. Create branch:
   - `git checkout -b fix/e2e-known-bugs-sprint`
2. Start services:
   - `docker compose up -d`
   - `docker compose ps`
3. Seed baseline:
   - `docker compose exec api bash -c "PYTHONPATH=/home/app python /home/app/scripts/seed.py"`
4. Capture baseline skips:
   - `cd web && ./scripts/run-e2e.sh`
5. Implement Ticket 1 and run:
   - `uv run pytest tests/unit/test_phone_bank.py`
   - `cd web && ./scripts/run-e2e.sh phone-banking.spec.ts`
6. Implement Ticket 2 and run:
   - `uv run pytest tests/unit/test_phone_bank.py tests/unit/test_walk_lists.py`
   - `docker compose logs --tail=200 postgres api`
7. Implement Ticket 5 and run:
   - `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts`
8. Implement Ticket 4 and run:
   - `cd web && ./scripts/run-e2e.sh cross-cutting.spec.ts`
9. Implement Ticket 3 and run:
   - `cd web && ./scripts/run-e2e.sh table-sort.spec.ts`
10. Full regression:
   - `uv run ruff check .`
   - `uv run pytest`
   - `cd web && ./scripts/run-e2e.sh`
   - `docker compose logs --tail=400`

---

## Test Plan (Definition of Done)

### Unit/backend
- Add or update tests for:
  - session delete success + 404 case
  - idempotent assign caller
  - idempotent assign canvasser

Likely test files:
- `tests/unit/test_phone_bank.py`
- `tests/unit/test_walk_lists.py`

### E2E targeted
- `web/e2e/phone-banking.spec.ts` (`PB-10`)
- `web/e2e/cross-cutting.spec.ts` (`UI-03`)
- `web/e2e/field-mode.volunteer.spec.ts` (`FIELD-07/08/09/10`)
- `web/e2e/table-sort.spec.ts` (8 routes)

### Stability checks
- Run each targeted spec 3 times.
- Require:
  - zero unexpected skips in targeted specs
  - no duplicate-key bursts in postgres logs for these flows

---

## Effort Summary
- Ticket 1: 1.0-1.5d
- Ticket 2: 1.5-2.0d
- Ticket 3: 2.0d
- Ticket 4: 1.0d
- Ticket 5: 2.0d
- Ticket 6 optional: 0.5-1.0d

**Total:** 8-10 days (fits one sprint)

---

## Risks and Mitigations
- **Risk:** field-mode flakes persist due shared mutable fixtures  
  **Mitigation:** per-spec dedicated resource creation + strict cleanup.
- **Risk:** idempotent assignment semantics affect clients expecting 409  
  **Mitigation:** document behavior clearly and align tests/docs.
- **Risk:** sorting behavior differs by table dataset  
  **Mitigation:** validate expected sortable columns per page and add explicit checks.
