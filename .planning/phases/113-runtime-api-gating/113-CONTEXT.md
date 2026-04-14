# Phase 113: Runtime API Gating - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the runtime-action API surface refuse authenticated operations on behalf of any assignment whose primary identity is a pre-signup `volunteer_id`. Deliver:

1. **New domain exception + problem-details handler** — `PreSignupRuntimeBlockedError` in `app/core/errors.py`, registered as a FastAPI exception handler that emits RFC 7807 problem-details JSON with `status: 422`, `type: "pre-signup-runtime-blocked"`, and a rich `extra` payload (`volunteer_id`, `assignment_kind`, `resource_id`). Reuses the existing `_problem_response` plumbing — no new contract machinery.
2. **Shared gate helper** — `app/services/runtime_gate.py` exposing `ensure_runtime_capable(assignment_row)` that raises `PreSignupRuntimeBlockedError` when `volunteer_id IS NOT NULL`. Stateless, row-only, trivially testable.
3. **Gate all runtime mutation endpoints** on both domains:
   - Phone banking: `check_in`, `check_out`, `start_call`, `submit_call_record`, `skip_entry`, `release_entry` (any service method that mutates session state under a caller identity).
   - Canvassing: `check_in`, `check_out`, `record_door_knock` (door-knock outcome), `submit_outcome` (if present), `claim_entry`.
   - Cross-domain: shift check-in paths in `app/api/v1/shifts.py` / `app/services/shift.py` that auto-create caller/canvasser rows — gate the mutation entry, not the auto-create itself.
4. **Test coverage** — unit test on the gate helper, plus per-domain integration tests that prove every gated endpoint returns 422 + the stable `type` and the happy path still works for `user_id` assignments (TEST-01 / TEST-02).

Out of scope: UI surfacing the new picker entries (Phase 114), disabled-button UX (Phase 114), E2E coverage of the full journey (Phase 115), any change to read endpoints (list_callers, list_canvassers, dashboards — pre-signup rows MUST remain visible in roster reads so admins can see their work).

</domain>

<decisions>
## Implementation Decisions

### Error Shape & Type (Area 1)
- **D-01:** New exception `PreSignupRuntimeBlockedError` lives in **`app/core/errors.py`** alongside the existing exception hierarchy. Constructor signature: `PreSignupRuntimeBlockedError(volunteer_id: UUID, assignment_kind: Literal["session_caller","walk_list_canvasser"], resource_id: UUID, detail: str | None = None)`. Message default: "Assignment is pre-signup; runtime actions require the volunteer to accept their invite first."
- **D-02:** Problem-details `type_` value is **`"pre-signup-runtime-blocked"`** — kebab-case, matches existing convention (`"zitadel-unavailable"`, `"voter-not-found"`). The frontend maps this string 1:1 to the disabled-tooltip message in Phase 114 without any string matching.
- **D-03:** HTTP status is **422 Unprocessable Content** — aligns with RUNTIME-03 and with existing semantic-validation errors like `InvalidCursorError`. Not 403 (caller has permission), not 409 (no state conflict).
- **D-04:** Problem-details `extra` payload carries **`volunteer_id`, `assignment_kind`, `resource_id`** (where resource_id is the phone bank session id or the walk list id, depending on kind). The frontend uses this to render "Alice (pre-signup)" tooltip and deep-link to the volunteer record.
- **D-05:** Exception handler is registered in `init_error_handlers()` in `app/core/errors.py` next to the other handlers — no separate registration point.

### Gate Placement (Area 2)
- **D-06:** Gate lives in the **service layer**. Every runtime mutation method on `PhoneBankService`, `WalkListService`, `FieldService`, and any shift-check-in path reads the target assignment row first, passes it to `ensure_runtime_capable`, and proceeds only if the row passes. Routes stay thin — they just translate the raised exception via the FastAPI handler.
- **D-07:** **One shared helper** in a new module `app/services/runtime_gate.py`. Signature:
  ```python
  from typing import Protocol

  class _AssignmentRow(Protocol):
      volunteer_id: UUID | None
      user_id: str | None

  def ensure_runtime_capable(
      row: _AssignmentRow,
      *,
      kind: Literal["session_caller", "walk_list_canvasser"],
      resource_id: UUID,
  ) -> None:
      if row.volunteer_id is not None:
          raise PreSignupRuntimeBlockedError(
              volunteer_id=row.volunteer_id,
              assignment_kind=kind,
              resource_id=resource_id,
          )
  ```
  Each service imports and calls this — no copy-paste of the `if volunteer_id:` check anywhere. Avoids drift across 10+ call sites.
- **D-08:** The gate reads **only the assignment row** — not the auth user. The caller-identity check is already handled by the existing auth dependency. The gate answers a different question: "Does this ROW permit runtime ops?" Separation keeps the helper composable and trivially unit-testable (no DB, no mocks).
- **D-09:** **Cross-domain check-in via `FieldService`** — any path that auto-creates a `SessionCaller` or `WalkListCanvasser` row uses the caller's authenticated `user_id`, so the created row is always a `user_id` row and never needs the gate at create-time. The gate only fires on runtime actions against pre-existing rows (which can be pre-signup only if an admin added them via Phase 114's picker). No defensive gate on the create path — it would be dead code.
- **D-10:** **Shift check-in** (`app/api/v1/shifts.py`) — shift check-ins call `FieldService.check_in_to_shift` which upserts `SessionCaller` / `WalkListCanvasser` under the authenticated user. Same logic as D-09: creation path is safe by construction. However, the `check_in` service methods that read existing rows and flip state must still call the gate if the targeted row could be pre-signup. Planner's responsibility to audit `app/services/shift.py` and place gates only on runtime mutation paths.

### Endpoint Coverage (Area 3)
- **D-11:** **Phone-banking runtime endpoints to gate** (planner verifies exhaustively against current routes under `app/api/v1/phone_banks.py` / `app/services/phone_bank.py`):
  - `PhoneBankService.check_in`
  - `PhoneBankService.check_out`
  - `PhoneBankService.start_call`
  - `PhoneBankService.submit_call_record`
  - `PhoneBankService.skip_entry`
  - `PhoneBankService.release_entry`
  - Any additional caller-scoped mutation discovered during research.
- **D-12:** **Canvassing runtime endpoints to gate**:
  - `WalkListService.check_in` (canvasser check-in)
  - `WalkListService.check_out`
  - `WalkListService.record_door_knock` (door-knock outcome)
  - `WalkListService.submit_outcome` (if it exists separately)
  - `WalkListService.claim_entry` (walk list entry claim, if present)
  - Any additional canvasser-scoped mutation discovered during research.
- **D-13:** **Shift / cross-domain endpoints** — yes, gated. Audit `app/services/shift.py` and `app/services/field.py` for any runtime mutation that targets an existing `SessionCaller` or `WalkListCanvasser` row and add the gate.
- **D-14:** **Read-only endpoints DO NOT get gated.** `list_callers`, `list_canvassers`, dashboard drilldowns, roster endpoints — all continue to return pre-signup rows. Admins need them visible to manage assignments. This is a hard requirement from PICKER-01 (the picker must surface existing pre-signup assignments).

### Test Strategy (Area 4)
- **D-15:** **Gate helper unit test** at `tests/services/test_runtime_gate.py` — pure unit, no DB. Uses a small test double that implements the `_AssignmentRow` protocol. Cases:
  - `user_id` set, `volunteer_id` NULL → no raise.
  - `volunteer_id` set, `user_id` NULL → raises `PreSignupRuntimeBlockedError` with correct fields.
  - Both set (invalid row state that shouldn't occur post-111 CHECK constraint, but defensive): raises with `volunteer_id`-led semantics.
  - Both NULL (also invalid): raises `PreSignupRuntimeBlockedError` defensively, since neither identity is actionable.
- **D-16:** **Per-domain integration tests** — `tests/api/test_phone_banks_runtime_gate.py` and `tests/api/test_walk_lists_runtime_gate.py`. Each file seeds a fixture via the real test DB with a pre-signup assignment (one `SessionCaller` with `volunteer_id`; one `WalkListCanvasser` with `volunteer_id`), calls each gated endpoint via the FastAPI test client with an authenticated admin, and asserts:
  - Response status = 422
  - Response body `type` == `"pre-signup-runtime-blocked"`
  - Response body includes `volunteer_id`, `assignment_kind`, `resource_id`
  - The underlying row is unchanged (no partial mutation).
- **D-17:** **Happy path companion tests** — each gated endpoint gets a matching test with a `user_id`-only assignment that asserts the endpoint proceeds and does NOT raise the gate error (it may still fail for unrelated reasons — e.g., "session not started yet" — as long as the failure isn't `"pre-signup-runtime-blocked"`). Guards against false-positive gates.
- **D-18:** Cross-domain shift integration test at `tests/api/test_shifts_runtime_gate.py` covers any shift endpoint that can reach a pre-signup assignment. Planner determines which endpoints qualify during research.
- **D-19:** **Per-endpoint test files, no big parametrized matrix.** Matches existing `tests/api/` layout. Endpoints are short; failures are easier to triage in per-file form.

### Claude's Discretion
- Exact list of service methods to gate once the planner completes the exhaustive grep across `app/services/phone_bank.py`, `app/services/walk_list.py`, `app/services/field.py`, `app/services/shift.py`. D-11/D-12/D-13 establish the shape; the planner is free to add any method discovered.
- Whether `PreSignupRuntimeBlockedError` carries additional fields for logging (e.g., the target session/walk-list id in addition to resource_id) — planner's call.
- Whether the gate helper is called with keyword-only args or positional — style choice.
- Exact fixture factory pattern for integration tests (align with whatever is already in `tests/api/`).
- Whether shift endpoint gating is done inside `FieldService` or `ShiftService` — planner picks based on where mutation logic lives.

</decisions>

<specifics>
## Specific Ideas

- The frontend contract is minimal: the frontend matches on `response.type === "pre-signup-runtime-blocked"` and renders the disabled-tooltip copy. No string parsing of `detail`. Any copy change on the frontend side never requires a backend change.
- The 422 status + `type` pattern already exists in the codebase via `InvalidCursorError` — planner should look at how `init_error_handlers` registers that handler and mirror the shape exactly.
- The existing `_problem_response` helper accepts an `extra: dict[str, Any] | None` parameter — this is where `volunteer_id`, `assignment_kind`, `resource_id` go.
- **Phase 112 dependency:** the gate reads `row.volunteer_id`, which only exists after Phase 112's schema migration lands and Phase 112's service-layer rewrite exposes the column via the ORM. The `AssignmentPerson` DTO from Phase 112 is **not required** by Phase 113 — the gate reads the raw ORM row directly, because the gate exists one level below the DTO layer (the DTO is for reads that go out to the client; the gate fires on writes where the service has already loaded the row by id).
- The ONLY way a pre-signup row can exist in production at Phase 113 ship time is via Phase 112's `accept_invite` backfill racing with a brand-new Phase 114 picker assignment. Phase 114 hasn't shipped yet, so in practice this phase is pure defense-in-depth until Phase 114 lands. That's **intentional** — success criterion 5 says "the API is safe to ship before any UI surfaces the new picker entries." Phase 113 ships first so Phase 114's UI has a hard floor underneath it.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase scope
- `.planning/ROADMAP.md` §v1.19 / Phase 113 — Phase goal and success criteria.
- `.planning/REQUIREMENTS.md` — RUNTIME-03, TEST-01, TEST-02.
- `.planning/phases/111-reconciliation-and-dual-identity-schema/111-CONTEXT.md` — D-08 / D-11 for the schema shape the gate reads.
- `.planning/phases/112-service-layer-and-invite-acceptance-backfill/112-CONTEXT.md` — D-07 (`PersonRef`) and D-09 (accept_invite backfill). Phase 113's gate does not depend on the DTO but does depend on the Phase 111 column existing and Phase 112's service rewrites not removing the gate's hook points.

### Existing error-handling plumbing
- `app/core/errors.py` — ALL new exceptions + handlers go here. Note the `_problem_response` helper (lines ~108-126) and `init_error_handlers` registration (line ~129). Mirror the `InvalidCursorError` + handler pattern (lines ~79-84, ~206-213) — same status code, same structure.

### Service layer to be gated
- `app/services/phone_bank.py` — `PhoneBankService` mutation methods (check_in, check_out, start_call, submit_call_record, skip_entry, release_entry). Post-Phase-112, methods take `PersonRef` and load `SessionCaller` rows; gate at the top of each method.
- `app/services/walk_list.py` — `WalkListService` mutation methods (check_in, check_out, record_door_knock, etc.). Same pattern.
- `app/services/field.py` — cross-domain check-in; see `FieldService` for any mutation that operates on existing assignment rows.
- `app/services/shift.py` — shift check-in paths that touch assignment rows.

### API routes (for integration tests)
- `app/api/v1/phone_banks.py` — runtime endpoints for phone banking.
- `app/api/v1/walk_lists.py` — runtime endpoints for canvassing.
- `app/api/v1/shifts.py` — shift check-in endpoints.

### Test conventions
- `tests/conftest.py` — async DB + FastAPI client fixtures.
- `tests/api/` — existing per-route integration test layout. Per-endpoint test files match the convention; planner greps existing files for fixture patterns.
- `tests/services/` — existing service unit test layout.
- `pytest.ini` / `pyproject.toml` — `asyncio_mode=auto`, markers `integration`, `e2e`.

No external specs — all behavior is captured in REQUIREMENTS.md and the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`_problem_response` helper + `init_error_handlers` registration** — new exception + handler is ~20 lines total, reusing the existing RFC 7807 plumbing. No new dependencies, no new contract machinery.
- **`InvalidCursorError` + its handler** — the closest existing precedent (also 422, also semantic validation, also has a single `detail` field). Copy the pattern for style consistency.
- **Pytest async fixtures + FastAPI test client** — already used throughout `tests/api/` for integration tests that seed data via ORM and assert HTTP responses.

### Established Patterns
- **Problem details via `fastapi_problem_details`** — every non-validation error flows through `_problem_response` which injects `request_id` automatically. New exceptions must use this helper, not raw `HTTPException`.
- **Service methods raise custom exceptions; routes translate via handlers** — no `HTTPException` in services. Thin route layer.
- **Loguru logger** — service-layer logging uses `logger.info("message {}", arg)` style.
- **`uv run ruff check .` + `uv run ruff format .`** pre-commit expectation.
- **Integration tests hit real docker-compose Postgres** — do not mock the DB.

### Integration Points
- **Phase 112 `PersonRef` mutation signatures** — Phase 113's gate fires AFTER the service method has loaded the target row. Since Phase 112 will have rewritten the mutation signatures to take `PersonRef`, the gate hook naturally sits right after the row load (`row = await self._get_caller(...); ensure_runtime_capable(row, kind=..., resource_id=...)`).
- **Phase 114 picker UI** — consumes the `type: "pre-signup-runtime-blocked"` response and renders the disabled-button tooltip. The exact frontend copy is Phase 114's concern; Phase 113 only commits to the stable `type` string.
- **Phase 115 E2E tests** — will exercise the full journey, including the 422 response path. Phase 113 ships integration tests at the API level; Phase 115 adds Playwright coverage on top.

</code_context>

<deferred>
## Deferred Ideas

- **Telemetry counter for gate blocks** (`runtime_gate_blocked_total` Prometheus counter) — discussed as a nice-to-have for operations; deferred because v1.19 doesn't include metrics infrastructure expansion. Revisit when a metrics overhaul phase lands.
- **Exponential backoff / rate limit on repeated pre-signup attempts from the same admin** — rejected: the gate is a static 422, not a throttle, and Phase 114's disabled-button UX means the frontend shouldn't be calling the gated endpoints in the first place.
- **Soft-gate mode (return the gate reason in a non-erroring field)** — rejected: success criterion 1 is explicit about 422.
- **Gating read endpoints too** — explicitly rejected in D-14; roster visibility is a hard requirement for PICKER-01.
- **FastAPI dependency-based gate instead of service-layer** — rejected in D-06 for consistency with existing service-layer exception raising.

</deferred>

---

*Phase: 113-runtime-api-gating*
*Context gathered: 2026-04-14*
