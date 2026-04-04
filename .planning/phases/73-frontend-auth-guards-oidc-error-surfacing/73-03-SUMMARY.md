---
phase: 73-frontend-auth-guards-oidc-error-surfacing
plan: 03
subsystem: web/auth
tags: [security, auth, frontend, oidc, open-redirect, c7, sec-07, sec-08]
requires: []
provides:
  - "Correct root auth guard: unauthenticated access to protected routes → /login?redirect=<original>"
  - "isSafeRedirect(path) same-origin validator (web/src/lib/safeRedirect.ts)"
  - "POST_LOGIN_REDIRECT_KEY sessionStorage contract for post-OIDC navigation"
affects:
  - web/src/routes/__root.tsx
  - web/src/routes/login.tsx
  - web/src/routes/callback.tsx
  - web/e2e/login.spec.ts
tech-stack:
  added: []
  patterns:
    - "TanStack Router <Navigate> for declarative redirects"
    - "sessionStorage bridge across OIDC round-trip (D-07)"
    - "Same-origin validation via new URL(path, origin).origin === origin (D-06)"
key-files:
  created:
    - web/src/lib/safeRedirect.ts
    - web/src/lib/safeRedirect.test.ts
  modified:
    - web/src/routes/__root.tsx
    - web/src/routes/login.tsx
    - web/src/routes/callback.tsx
    - web/e2e/login.spec.ts
decisions:
  - "Used sessionStorage (not OIDC state) for redirect storage — keeps authStore.login() signature stable (D-07 / Open Question 3)"
  - "Validated redirect twice: on write (login.tsx) AND on read (callback.tsx) — defense in depth"
  - "location.searchStr (not location.search) for target building — .search is the parsed object, .searchStr is the raw '?...' string"
  - "Updated pre-existing login.spec.ts landing-page test: it validated C7-bug behavior (rendering LandingPage at / for unauth users inside public shell). New contract: / is protected; unauth users redirect to /login?redirect=/"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_changed: 6
  commits: 2
  completed_date: "2026-04-04"
---

# Phase 73 Plan 03: Root Auth Guard Fix + Post-Login Redirect Summary

Fixed C7 auth bypass (unauthenticated users saw protected content rendered in the public shell) by splitting the combined `!isAuthenticated || isPublicRoute` branch in `web/src/routes/__root.tsx` into two explicit branches, and wired the `/login?redirect=<path>` param through OIDC via sessionStorage so users land back where they started after sign-in.

## What was built

### isSafeRedirect utility (Task 1, TDD)

**File:** `web/src/lib/safeRedirect.ts` (20 lines)

Pure function `isSafeRedirect(path): path is string` validates same-origin absolute paths. Rejects protocol-relative URLs (`//evil.com`), absolute URLs (`https://evil.com`), `javascript:` / `data:` schemes, empty/null/undefined, and relative paths without a leading slash. Uses `new URL(path, window.location.origin).origin === window.location.origin` as the authoritative check per D-06.

Covered by 12 vitest unit tests in `web/src/lib/safeRedirect.test.ts` (all passing).

### C7 root auth guard fix (Task 2)

**File:** `web/src/routes/__root.tsx` (lines 1-7 import, 243-262 guard)

Before:

```tsx
if (!isAuthenticated || isPublicRoute) {
  return <public shell><Outlet/></public shell>   // BUG
}
```

After:

```tsx
if (!isAuthenticated && !isPublicRoute) {
  const target = location.pathname + (location.searchStr ?? "")
  return <Navigate to="/login" search={{ redirect: target }} />
}
if (isPublicRoute) {
  return <public shell><Outlet/></public shell>
}
```

Added `Navigate` to the `@tanstack/react-router` import. `location.searchStr` (raw `?...` string) is used instead of `location.search` because TanStack Router exposes `.search` as the already-parsed search object.

### SEC-08 redirect preservation (Task 2, cont.)

**File:** `web/src/routes/login.tsx` (full rewrite, 50 lines)

- Added `validateSearch` to extract the `redirect` query param.
- Reads `Route.useSearch()` inside the component.
- In the existing `useEffect`, BEFORE setting `loginInitiated = true` and calling `login()`, runs `isSafeRedirect(redirect)` and persists to `sessionStorage["post_login_redirect"]` (removes stale value if unsafe).
- Exports `POST_LOGIN_REDIRECT_KEY` constant consumed by `callback.tsx`.
- `authStore.login()` signature unchanged (D-07).

**File:** `web/src/routes/callback.tsx` (2 edits)

- Imports `isSafeRedirect` and `POST_LOGIN_REDIRECT_KEY`.
- After `handleCallback(url)` resolves, reads the saved key, removes it unconditionally, re-validates with `isSafeRedirect`, and navigates there if valid — short-circuiting the default role-based navigation (volunteer → field, everyone else → `/`).

## Verification

| Suite | Command | Result |
|-------|---------|--------|
| Unit (isSafeRedirect) | `npx vitest run src/lib/safeRedirect.test.ts` | 12/12 pass |
| E2E auth-guard-redirect | `./scripts/run-e2e.sh auth-guard-redirect.spec.ts` | 3/3 pass |
| E2E login regression | `./scripts/run-e2e.sh login.spec.ts` | 3/3 pass |
| TypeScript | `npx tsc --noEmit` | clean |

## Commits

| Hash | Task | Message |
|------|------|---------|
| `ceda5e8` | 1 | feat(73-03): add isSafeRedirect util with unit tests |
| `20158fc` | 2 | fix(73-03): C7 root auth guard + SEC-08 redirect preservation |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `location.search` was the wrong field**

- **Found during:** Task 2 (typecheck of __root.tsx)
- **Issue:** Plan used `location.search ?? ""` to build the redirect target, but TanStack Router's `ParsedLocation.search` is the parsed search *object* (`{}`), not the raw query string. Concatenating it would emit `[object Object]`.
- **Fix:** Use `location.searchStr` (the raw `?key=value` string per TanStack Router's `ParsedLocation` type).
- **Files modified:** `web/src/routes/__root.tsx` line 250
- **Commit:** `20158fc`

**2. [Rule 3 - Blocking issue] Pre-existing `login.spec.ts` test validated the C7 bug**

- **Found during:** Task 2 verification (regression run)
- **Issue:** The "unauthenticated access shows landing page with sign-in link" test navigated to `/` as an unauthenticated user and expected to see a `<LandingPage/>` (with a "Sign In" link) rendered. That behavior only existed because the C7 bug rendered protected routes (including `/`) inside the public shell — the `HomePage` component then branched on `isAuthenticated` and returned `<LandingPage/>`. After the fix, `/` is a protected route and unauthenticated users redirect to `/login`. The test encoded the bug as expected behavior.
- **Fix:** Updated the test to assert the new contract — unauthenticated navigation to `/` redirects to `/login?redirect=/` then onward to the ZITADEL OIDC login UI.
- **Files modified:** `web/e2e/login.spec.ts`
- **Commit:** `20158fc`

## Must-Haves (from plan frontmatter)

- [x] Unauthenticated user hitting /campaigns/new is instantly redirected to /login?redirect=%2Fcampaigns%2Fnew — verified by auth-guard-redirect.spec.ts test 1
- [x] Redirect query string preserves original path AND search string — verified by auth-guard-redirect.spec.ts test 2 (`.../settings/general?tab=danger`)
- [x] Open-redirect attack vectors rejected — 12 unit tests on isSafeRedirect
- [x] After successful login the user lands on the originally-requested path — implemented in callback.tsx restore block
- [x] Public routes never trigger the guard — verified by auth-guard-redirect.spec.ts test 3

## Self-Check: PASSED

**Files verified:**
- FOUND: web/src/lib/safeRedirect.ts
- FOUND: web/src/lib/safeRedirect.test.ts
- FOUND: web/src/routes/__root.tsx (Navigate import + split guard)
- FOUND: web/src/routes/login.tsx (validateSearch + sessionStorage)
- FOUND: web/src/routes/callback.tsx (restore block)

**Commits verified:**
- FOUND: ceda5e8
- FOUND: 20158fc
