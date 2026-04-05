---
phase: 77-quality-accessibility-test-coverage
plan: 02
subsystem: web/auth
tags: [auth, testing, oidc, zustand, quality]
requires:
  - oidc-client-ts UserManager
  - zustand store
provides:
  - authStore logout ordering guarantee (removeUser -> reset -> signoutRedirect)
  - authStore unit test harness (mocks oidc-client-ts + @/config)
affects:
  - web/src/stores/authStore.ts
  - web/src/stores/authStore.test.ts
tech-stack:
  added: []
  patterns:
    - "vi.resetModules() + dynamic import for module-scoped singleton reset"
    - "call-order tracking array inside vi.fn().mockImplementation() to assert async sequencing"
    - "state snapshot captured inside stubbed method to prove 'state cleared before side effect'"
key-files:
  created:
    - web/src/stores/authStore.test.ts
  modified:
    - web/src/stores/authStore.ts
decisions:
  - "Unit test logout ordering by snapshotting store.user inside signoutRedirect stub (proves cleanup BEFORE redirect, not just 'eventually')"
  - "Use vi.resetModules() rather than adding a test-only reset hook to authStore (keeps production code clean)"
metrics:
  duration: "~10 min"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  tests_added: 9
completed: 2026-04-04
---

# Phase 77 Plan 02: authStore logout reorder + unit tests Summary

Fixed authStore.logout() ordering (cleanup BEFORE redirect) and added 9 unit tests across 4 behavior groups for the previously-untested authStore.

## What Changed

### web/src/stores/authStore.ts
Reordered `logout()` from `signoutRedirect() -> set()` to `removeUser() -> set() -> signoutRedirect()`. The new order guarantees local state (oidc-client-ts user store AND zustand store) is cleared before the browser navigation, so a rejected/stubbed/blocked redirect cannot leave stale auth state behind. Added a code comment documenting the invariant and linking QUAL-03 / QUAL-04.

### web/src/stores/authStore.test.ts (new, 207 lines)
Nine tests across four `describe` blocks:

- **Token storage (2)** — `getAccessToken()` returns the user's access token when authenticated, returns `null` when not.
- **OIDC events (3)** — drives `initialize()`, captures handlers via mocked `events.addUserLoaded/addUserUnloaded/addAccessTokenExpired`, then invokes each and asserts store state transitions.
- **switchOrg (2)** — verifies `signinRedirect` is called with scope containing the ZITADEL org id marker and all required claims (openid, profile, email, project aud, project roles, projects roles).
- **logout (2)** — asserts exact call order `["removeUser", "signoutRedirect"]` AND snapshots `useAuthStore.getState().user` from inside the `signoutRedirect` stub to prove state was already `null` at that moment. A second test rejects `signoutRedirect` and confirms local state was still cleared.

Mocks `oidc-client-ts` (UserManager, WebStorageStateStore) and `@/config.loadConfig`. Uses `vi.resetModules()` per test to reset authStore's module-level `_userManager` / `_initPromise` singletons without adding test-only hooks to production code.

## Verification

- `cd web && npx vitest run src/stores/authStore.test.ts` — 9/9 passing (410ms)
- `cd web && npx tsc --noEmit` — clean
- `grep -A6 "logout: async" web/src/stores/authStore.ts` — shows removeUser -> set -> signoutRedirect order

## Requirements Closed

- QUAL-03: authStore.logout() cleanup order
- QUAL-04: Local state cleared even if signoutRedirect throws
- QUAL-06: authStore unit test coverage (4 groups)

## Deviations from Plan

None — plan executed as written. One trivial correction during TDD: the initial mock used `vi.fn(() => mockUserManager)` which vitest 4 warns does not produce a constructable function, so switched to `vi.fn().mockImplementation(function () { return mockUserManager })` for both `UserManager` and `WebStorageStateStore`.

## Commits

- `329d949` fix(77-02): reorder authStore.logout() cleanup before redirect
- `3cca2c8` test(77-02): add authStore unit tests for 4 behavior groups

## Self-Check: PASSED

- FOUND: web/src/stores/authStore.ts (modified)
- FOUND: web/src/stores/authStore.test.ts (created, 207 lines)
- FOUND commit: 329d949
- FOUND commit: 3cca2c8
- Tests: 9/9 green
- TypeScript: clean
- logout invariant grep: removeUser -> set -> signoutRedirect confirmed
