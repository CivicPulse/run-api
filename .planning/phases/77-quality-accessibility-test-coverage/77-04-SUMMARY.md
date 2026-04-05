---
phase: 77-quality-accessibility-test-coverage
plan: 04
subsystem: web/api
tags: [testing, vitest, auth, api-client, unit-tests]
requires:
  - web/src/api/client.ts
  - web/src/stores/authStore
provides:
  - web/src/api/client.test.ts
affects:
  - web/src/api
tech_stack:
  added: []
  patterns:
    - co-located-unit-tests
    - vi-mock-module
    - fetch-stubbing-via-stubGlobal
key_files:
  created:
    - web/src/api/client.test.ts
  modified: []
decisions:
  - Use vi.stubGlobal("fetch", ...) to intercept network calls without hitting the wire
  - Mock @/stores/authStore module to expose getState().getAccessToken + setState spies
  - Pass { retry: 0 } per-request in 401/403 tests to isolate error-mapping assertions from retry scheduling
metrics:
  duration_minutes: 5
  completed_date: 2026-04-04
  tasks_completed: 1
  files_created: 1
  files_modified: 0
requirements:
  - QUAL-07
---

# Phase 77 Plan 04: api/client Unit Tests Summary

Added co-located Vitest unit tests covering the api/client.ts beforeRequest auth header injection and afterResponse 401/403 error mapping — previously zero unit coverage on this critical auth path.

## What Was Built

`web/src/api/client.test.ts` (101 lines, 5 tests, 2 describe groups):

**Group 1: auth header injection (beforeRequest)**
- Sets `Authorization: Bearer abc123` when `useAuthStore.getState().getAccessToken()` returns a token
- Omits Authorization header when token is null

**Group 2: response error mapping (afterResponse)**
- Returns parsed JSON body on 200
- 401 → throws `AuthenticationError` AND calls `useAuthStore.setState({ user: null, isAuthenticated: false })`
- 403 → throws `PermissionError` AND does NOT touch authStore

Mocking strategy: `vi.mock("@/stores/authStore", ...)` exposes `mockGetAccessToken` and `mockSetState` spies. `vi.stubGlobal("fetch", fetchMock)` captures the `Request` object so `Authorization` header can be read directly from `fetchMock.mock.calls[0][0].headers`. Response objects constructed with `new Response(body, { status })`.

## Verification

- `cd web && npx vitest run src/api/client.test.ts` → 5/5 passing in 14ms
- `cd web && npx tsc --noEmit` → clean

## Decisions Made

- **Per-request `retry: 0` override in 401/403 tests.** Initial run timed out at 5s on the error tests because ky's retry pipeline interacts with thrown errors from afterResponse even though 401/403 are not in the retry statusCodes list. Passing `{ retry: 0 }` to the individual request isolates error-mapping assertions from retry scheduling without mutating the shared `api` instance config.
- **Request object inspection via fetchMock.** ky calls fetch with a `Request` object (not URL + init), so `fetchMock.mock.calls[0][0].headers.get("Authorization")` is the canonical way to assert header injection.

## Deviations from Plan

None — plan executed exactly as written. The `{ retry: 0 }` override was anticipated by the plan's retry caveat, applied per-request rather than by constructing a separate client instance.

## Self-Check: PASSED

- FOUND: web/src/api/client.test.ts
- FOUND: commit f6dbc4e
