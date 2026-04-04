---
phase: 73-frontend-auth-guards-oidc-error-surfacing
plan: 02
subsystem: phone-banking
tags: [security, api, phone-bank, sec-12, h26]
requirements: [SEC-12]
dependency-graph:
  requires: [phone_bank session_callers model, _make_app_for_campaign fixture]
  provides:
    - "GET /api/v1/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers/me"
    - "SessionCallerResponse.checked_in computed field"
  affects: [73-06 (frontend call-page check-in gate)]
tech-stack:
  added: []
  patterns:
    - "pydantic computed_field for derived response fields"
    - "problem.ProblemResponse for 404 caller-not-assigned"
key-files:
  created:
    - tests/integration/test_phone_banks.py
  modified:
    - app/api/v1/phone_banks.py
    - app/schemas/phone_bank.py
decisions:
  - "Option A (new endpoint) over Option B (filter list client-side) per research recommendation"
  - "checked_in exposed as pydantic computed_field so client does not duplicate the derivation logic"
  - "404 (not 403) when current user is not an assigned caller, mirroring enumeration-safe tenant patterns"
metrics:
  duration_minutes: 4
  completed_at: "2026-04-04T23:54:00Z"
  tasks_completed: 2
  tests_added: 5
---

# Phase 73 Plan 02: GET callers/me endpoint Summary

**One-liner:** Server-side caller check-in status endpoint with
computed `checked_in` boolean — moves the H26 enforcement gate out
of client React state.

## Contract (for Plan 73-06)

**Endpoint path:**

```
GET /api/v1/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers/me
```

**Auth:** volunteer+ campaign role (same as `check-in` / `check-out`
/ `list_callers`).

**Response 200 (SessionCallerResponse):**

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "user_id": "string",
  "check_in_at": "2026-04-04T23:51:14.825Z | null",
  "check_out_at": "2026-04-04T23:51:14.825Z | null",
  "created_at": "2026-04-04T23:51:14.825Z",
  "checked_in": true
}
```

`checked_in` is a pydantic `@computed_field` derived server-side as
`check_in_at is not None and check_out_at is None`. Clients MUST
trust `checked_in` directly rather than re-deriving from the two
timestamps.

**Response 404 (not an assigned caller):** Problem+JSON with
`title: "Not an Assigned Caller"`, `type: "caller-not-assigned"`.
Returned when no `session_callers` row matches
`(session_id, user_id=current_user.id)`.

**Response 401 (unauthenticated):** Standard app-wide
`{"title": "Unauthorized", "detail": "Not authenticated"}` body.

**Rate limit:** 240/minute (same as `get_session`, `list_callers`).

## What Changed

### `app/api/v1/phone_banks.py`

Added `get_my_caller_status` handler between `list_callers` and
`check_in`. Implementation queries `SessionCaller` by
`(session_id, user.id)` via the campaign-scoped RLS session
(`get_campaign_db`) — no service method was needed since the query
is a single-row lookup. On miss, returns a 404 `ProblemResponse`.
On hit, returns `SessionCallerResponse.model_validate(caller)` so
the `checked_in` computed field serializes automatically.

### `app/schemas/phone_bank.py`

Added `computed_field` import and a `checked_in` property on
`SessionCallerResponse`. Existing serializers that previously
returned `SessionCallerResponse` (assign_caller, check_in, check_out,
list_callers) now also emit the new field with no other code changes.

### `tests/integration/test_phone_banks.py` (new file)

`TestCallerCheckInStatus` with 5 cases:

1. `test_check_in_status_returns_true_when_checked_in` — 200 +
   `checked_in=true`
2. `test_check_in_status_returns_false_when_checked_out` — 200 +
   `checked_in=false` with `check_out_at` set
3. `test_check_in_status_returns_false_when_never_checked_in` — 200
   + `checked_in=false` with both timestamps NULL
4. `test_check_in_status_returns_404_when_not_assigned` — 404 for a
   campaign member who is not an assigned caller
5. `test_check_in_status_requires_authentication` — 401 when no
   Authorization header is sent

Fixture `session_with_caller` seeds a campaign, two volunteer
members, a call list, a phone bank session, and one
`session_callers` row starting with both timestamps NULL. Tests
mutate the row in place via the superuser session to exercise the
three state permutations. Follows the
`_make_app_for_campaign`/`app_user_engine` pattern from
`test_rls_api_smoke.py` so RLS is fully enforced at the HTTP layer.

## Verification

```
$ TEST_DB_PORT=49374 uv run pytest \
    tests/integration/test_phone_banks.py \
    -k "check_in_status or callers_me" --no-header
========================= 5 passed, 1 warning in 1.58s =========================

$ uv run ruff check app/api/v1/phone_banks.py app/schemas/phone_bank.py \
    tests/integration/test_phone_banks.py
All checks passed!
```

## Deviations from Plan

**None** — plan executed as written. The "5 integration tests +
endpoint + schema change" scope was exactly delivered. One
clarification:

- **[Rule 1 - Test alignment]** The plan proposed 401 for
  unauthenticated requests. The app's custom exception handler
  surfaces `HTTPBearer(auto_error=True)`'s rejection as 401
  Unauthorized (confirmed against the live app, not 403 as some
  older unit tests assume). Test and docs both assert 401.

## Deferred Issues

Four pre-existing unit test failures in
`tests/unit/test_api_phone_banks.py` and
`tests/unit/test_phone_bank.py` discovered during this plan's
execution. Verified present on base commit `20158fc` before Plan
73-02 touched any files — out of scope for this plan. Logged to
`deferred-items.md` for a future Quality phase sweep.

## Commits

- `8d5988d` — test(73-02): add failing integration tests for callers/me endpoint
- `69c23ee` — feat(73-02): add GET callers/me endpoint for server-side check-in status

## Self-Check: PASSED
