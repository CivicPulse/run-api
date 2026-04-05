---
phase: 77-quality-accessibility-test-coverage
plan: 03
subsystem: web/hooks
tags: [testing, error-handling, hooks, quality]
requires: []
provides:
  - "Narrowed catch in useOrgCampaigns (PermissionError + 404 only)"
  - "useOrg unit test suite with 5 tests covering success, fallback, and propagation"
affects:
  - web/src/hooks/useOrg.ts
tech-stack:
  added: []
  patterns:
    - "instanceof PermissionError for 403 routing"
    - "HTTPError.response.status check for 404 routing"
    - "Let non-recoverable errors bubble to TanStack Query error state"
key-files:
  created:
    - web/src/hooks/useOrg.test.ts
  modified:
    - web/src/hooks/useOrg.ts
decisions:
  - "Use Object.create(HTTPError.prototype) in tests to build HTTPError instances without needing a real Response/Request"
  - "Mock @/api/client via importActual to preserve PermissionError/AuthenticationError classes while overriding api.get"
metrics:
  duration: "~3 min"
  completed: "2026-04-04"
  tasks: 2
  files: 2
---

# Phase 77 Plan 03: useOrgCampaigns catch narrowing + useOrg tests Summary

One-liner: Narrowed `useOrgCampaigns` catch to only swallow PermissionError (403) and HTTP 404, letting auth/server errors bubble to TanStack Query, backed by 5 unit tests (QUAL-05).

## What Was Built

**Task 1 — Narrow catch block (web/src/hooks/useOrg.ts):**
- Added imports: `HTTPError` from ky, `PermissionError` from `@/api/client`.
- Replaced bare `catch {}` with `catch (err)` that checks `err instanceof PermissionError || (err instanceof HTTPError && err.response.status === 404)`.
- On those two cases, runs the existing fallback to `/api/v1/campaigns` list (unchanged mapping logic).
- All other errors now rethrow (`throw err`), flowing to TanStack Query's error state — users will see real error UI instead of empty campaign lists for 401/500/network failures.

**Task 2 — Unit tests (web/src/hooks/useOrg.test.ts, new file):**
- 5 tests, all passing:
  1. Happy path — api returns `OrgCampaign[]`, hook returns as-is.
  2. PermissionError fallback — 403 triggers second call to `/api/v1/campaigns`, mapped into `OrgCampaign[]` with `slug: null, member_count: 0`.
  3. 404 fallback — HTTPError(404) triggers the same fallback.
  4. AuthenticationError propagates — hook enters `isError` state with `AuthenticationError` instance.
  5. HTTPError 500 propagates — hook enters `isError` state with the exact HTTPError instance.
- Uses `renderHook` + `QueryClientProvider` wrapper with `retry: false, gcTime: 0`.
- Mocks `@/api/client` via `vi.importActual` to preserve real `PermissionError`/`AuthenticationError` classes.

## Commits

| Hash    | Message                                                               |
| ------- | --------------------------------------------------------------------- |
| 5e10c22 | test(77-03): add failing tests for useOrgCampaigns catch narrowing    |
| add7d76 | feat(77-03): narrow useOrgCampaigns catch to PermissionError and 404  |

## Verification

- `cd web && npx vitest run src/hooks/useOrg.test.ts` → 5/5 passing.
- `cd web && npx tsc --noEmit` → clean (no output).
- Grep checks pass: `instanceof PermissionError`, `HTTPError`, and `throw err` all present in `useOrg.ts`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: web/src/hooks/useOrg.ts (modified)
- FOUND: web/src/hooks/useOrg.test.ts (created)
- FOUND: commit 5e10c22
- FOUND: commit add7d76
