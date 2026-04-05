# Deferred Items — Phase 73

## Discovered during 73-02 (2026-04-04)

Pre-existing unit test failures in phone bank tests, verified present
on base commit `20158fc` before Plan 73-02 touched any files. Out of
scope for 73-02 (not caused by new endpoint).

- `tests/unit/test_api_phone_banks.py::test_delete_session_returns_204_on_success`
- `tests/unit/test_api_phone_banks.py::test_delete_session_returns_422_when_active`
- `tests/unit/test_api_phone_banks.py::test_delete_session_returns_404_when_missing`
  - Root cause: `_setup_role_resolution` seeds two `db.scalar` results
    via `side_effect`; the route now calls `resolve_campaign_role`
    which performs additional `db.scalar` calls, exhausting the
    iterator with `StopAsyncIteration`.
- `tests/unit/test_phone_bank.py::TestCallerManagement::test_assign_caller`
  - Root cause: MagicMock for `PhoneBankSession` lacks `session_id`
    attribute now that `assign_caller` reads it.

These should be swept in a Quality phase (v1.12 Phase 77) or whenever
the phone bank unit-test mocks are next refreshed.

## Discovered during 73-06 (2026-04-05)

Pre-existing E2E failure, verified present on base commit `5b9a8f0`
before Plan 73-06 touched `call.tsx`:

- `web/e2e/phone-banking.spec.ts` › PB-06: Active calling -- claim
  and record a call
  - Symptom: `getByText(/active calling/i)` times out. The test
    activates E2E Session 1 and clicks "Check In" optimistically, but
    the owner test user is not guaranteed to be assigned as a caller
    on that session fixture, so the page that surfaces the "Start
    Calling" affordance (session detail, post-check-in) is never
    reached. This is a test-seed gap, not a guard regression —
    `call-page-checkin.spec.ts` (Plan 73-06's primary target) passes.
  - Out of scope for 73-06 (pre-existing; not caused by the new
    server-side check-in guard).
