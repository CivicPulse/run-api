---
phase: 77-quality-accessibility-test-coverage
plan: 05
subsystem: web/test-coverage
tags: [testing, auth, vitest, org-permissions]
requires:
  - web/src/hooks/useOrgPermissions.ts
  - web/src/routes/callback.tsx
provides:
  - useOrgPermissions unit test coverage
  - callback.tsx extended test coverage (error + null-user + no-campaigns)
affects:
  - Phase 77 test coverage exit criteria (QUAL-08)
tech-stack:
  added: []
  patterns:
    - Zustand selector mocking via module-level mutable state
    - TanStack Query hook mocking by returning static result object
    - Hoisted vi.fn mocks with mutable search params per test
key-files:
  created:
    - web/src/hooks/useOrgPermissions.test.ts
  modified:
    - web/src/routes/callback.test.tsx
decisions:
  - "Used module-level `mockAuthState`/`mockOrgsState` objects mutated in beforeEach to exercise every reactive combination of auth-init state and orgs-query state without a real store."
  - "Added a shared `searchState` hoisted value for callback tests so individual tests can override the route's search params (required for OIDC error path)."
metrics:
  duration: "~1 minute"
  completed: "2026-04-05"
  tasks: 2
  tests_added: 10
---

# Phase 77 Plan 05: useOrgPermissions + Callback Unit Tests Summary

One-liner: Added 6 unit tests for useOrgPermissions covering loading states and JWT-claim-driven role resolution, plus 4 new callback.tsx tests covering OIDC error rendering, null-user fallback, volunteer-with-no-campaigns, and campaigns-API-failure paths — closing QUAL-08.

## Tasks Completed

### Task 1: Add useOrgPermissions.test.ts (TDD)

- **Commit:** `1920664`
- **File:** `web/src/hooks/useOrgPermissions.test.ts` (new, 186 lines, 6 tests)
- **Coverage:**
  - `isLoading=true` when authStore not initialized
  - `isLoading=true` when authenticated user but orgs query pending
  - `org_owner` resolution: `hasOrgRole("org_admin")=true`, `hasOrgRole("org_owner")=true`
  - `org_admin` resolution: `hasOrgRole("org_admin")=true`, `hasOrgRole("org_owner")=false`
  - No-match fallback (JWT claim names an org not present in `useMyOrgs`): `orgRole=undefined`, both `hasOrgRole` calls return `false`
  - `resourceowner:id` claim path when `urn:zitadel:iam:org:project:{projectId}:roles` is absent

Mocks: `@/stores/authStore`, `./useOrg`, `@/config` via `vi.mock` using module-level mutable state objects reset in `beforeEach`.

### Task 2: Extend callback.test.tsx (TDD)

- **Commit:** `0f7ec38`
- **File:** `web/src/routes/callback.test.tsx` (modified, +104/-2, 4 new tests; 6 total)
- **New coverage:**
  - **OIDC error path:** `error=access_denied`, `error_description="User declined"` renders error Alert with description text, does NOT invoke `handleCallback`, "Back to login" button navigates to `/login`
  - **Null-user path:** `handleCallback` resolves but `useAuthStore.getState().user === null` → navigate `{to: "/"}`, never calls `/field/...`
  - **Volunteer no-campaigns path:** volunteer user, `api.get("api/v1/me/campaigns").json()` resolves `[]` → navigate `{to: "/"}`
  - **Volunteer API failure path:** volunteer user, `.json()` rejects → catch block swallows and falls through to navigate `{to: "/"}`, never to `/login`

Introduced hoisted `searchState` to allow per-test override of the route's search params while keeping a default happy-path value in `beforeEach`.

## Verification

- `cd web && npx vitest run src/hooks/useOrgPermissions.test.ts src/routes/callback.test.tsx` → **12 tests passed** (6 + 6)
- `cd web && npx tsc --noEmit` → **clean, no errors**

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: web/src/hooks/useOrgPermissions.test.ts
- FOUND: web/src/routes/callback.test.tsx (modified)
- FOUND commit: 1920664
- FOUND commit: 0f7ec38
