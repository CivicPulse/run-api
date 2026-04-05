---
phase: 73-frontend-auth-guards-oidc-error-surfacing
plan: 06
subsystem: phone-banking
tags: [security, frontend, tanstack-query, phone-bank, sec-12, h26]
dependency-graph:
  requires:
    - phase: 73-02
      provides: "GET /api/v1/campaigns/{campaign_id}/phone-bank-sessions/{session_id}/callers/me endpoint with checked_in computed field"
  provides:
    - "useCallerCheckInStatus hook wrapping callers/me"
    - "Server-side check-in gate on /call route"
  affects: []
tech-stack:
  added: []
  patterns:
    - "TanStack Query + ky HTTPError catch for 404-as-signal (notAssigned)"
    - "Guard component + inner component split to keep hook order stable across gated/ungated states"
key-files:
  created:
    - web/src/hooks/useCallerCheckInStatus.ts
    - web/src/hooks/useCallerCheckInStatus.test.ts
  modified:
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx
key-decisions:
  - "Gate guard lives in ActiveCallingPage wrapper; existing body moved to ActiveCallingPageInner so hook order is stable across all three gate states (loading, redirect, render)"
  - "404 from callers/me is modeled as notAssigned=true (not an error) so the guard can redirect cleanly without a Query error boundary"
  - "Error path (isError) also redirects — fail-safe: if the server can't confirm check-in, the user does not reach the calling UI"
patterns-established:
  - "404-as-signal with ky HTTPError: catch inside queryFn, return null, expose a discriminated flag (notAssigned)"
  - "Hook-order-safe route guards: wrapper component runs only the gate hook, inner component runs all feature hooks"
requirements-completed: [SEC-12]
metrics:
  duration_minutes: 3
  completed_at: "2026-04-05T00:14:22Z"
  tasks_completed: 2
  tests_added: 3
---

# Phase 73 Plan 06: Server-Side Check-In Enforcement on Call Page Summary

**Active calling page now calls GET callers/me on mount and redirects to the session detail page when the server says the user is not currently checked in — closing the H26 direct-URL bypass.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05T00:11:12Z
- **Completed:** 2026-04-05T00:14:22Z
- **Tasks:** 2
- **Files modified:** 1 (+2 created)

## Accomplishments

- `useCallerCheckInStatus(campaignId, sessionId)` hook wraps the Plan 73-02 endpoint. Returns `{ data, isLoading, isError, notAssigned }`. 404 surfaces as `notAssigned: true`, not an error; 4xx responses skip retry.
- `ActiveCallingPage` is now a two-layer component: the outer layer runs only the check-in query and either shows a spinner, renders `<Navigate to="..session detail..">`, or delegates to `ActiveCallingPageInner`. The inner layer holds the existing state machine unchanged.
- Server is the source of truth for check-in state. Direct URL navigation to `/call` without a SessionCaller row (or without `check_in_at IS NOT NULL AND check_out_at IS NULL`) cannot reach the calling UI.

## Task Commits

1. **Task 1 (RED): failing tests for useCallerCheckInStatus** — `73a7998` (test)
2. **Task 1 (GREEN): hook implementation** — `5b9a8f0` (feat)
3. **Task 2: gate ActiveCallingPage on server check-in** — `fca6984` (feat)

## Files Created/Modified

- `web/src/hooks/useCallerCheckInStatus.ts` (NEW) — TanStack Query hook. Catches `HTTPError` with status 404 inside `queryFn` and returns `null`; all other 4xx skip retry; 5xx retries up to 2x. Exposes `notAssigned` derived from `isSuccess && data === null`.
- `web/src/hooks/useCallerCheckInStatus.test.ts` (NEW) — 3 vitest cases: checked-in happy path (asserts URL + `checked_in=true`), not-yet-checked-in (`checked_in=false`), and 404 (`notAssigned=true`, `isError=false`).
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx` — Added `Navigate`, `Loader2`, `useCallerCheckInStatus` imports. Split `ActiveCallingPage` into an outer guard component and `ActiveCallingPageInner` that holds the existing state machine/UI. Guard redirects on `notAssigned || isError || !data?.checked_in`.

## Decisions Made

- **Guard wrapper + inner component split** over inline early-returns inside the original function, because the original body calls many hooks (`usePhoneBankSession`, `useCallList`, `useClaimEntry`, `useRecordCall`, `useSelfReleaseEntry`, `useState x3`). An inline early-return before those would violate React's rules-of-hooks when the gate flips between loading and satisfied.
- **`isError` also redirects** — the plan only required `notAssigned || !checked_in` but a silent network error would otherwise drop the user into the calling UI. Fail-safe default is to send them back to the session detail page where they can re-check-in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Split `ActiveCallingPage` to keep hook order stable**
- **Found during:** Task 2 (gate ActiveCallingPage)
- **Issue:** The plan's inline early-return pattern (spinner / Navigate before the existing hook calls) would violate React's rules-of-hooks because `usePhoneBankSession`, `useCallList`, `useClaimEntry`, `useRecordCall`, `useSelfReleaseEntry`, and three `useState` calls live below. React would throw on re-renders that change branch.
- **Fix:** Extracted the existing body into `ActiveCallingPageInner` (props: `campaignId`, `sessionId`). Outer `ActiveCallingPage` runs only `useCallerCheckInStatus` then either shows a spinner, returns `<Navigate>`, or renders `<ActiveCallingPageInner />`. Hook order is stable in both components.
- **Files modified:** web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx
- **Verification:** `npx tsc --noEmit` clean on touched files; `call-page-checkin.spec.ts` passes.
- **Committed in:** `fca6984` (Task 2 commit)

**2. [Rule 2 - Missing Critical] `isError` also redirects**
- **Found during:** Task 2
- **Issue:** Plan specified only `notAssigned || !data?.checked_in` as the redirect predicate. A network/server error would leave `data` undefined and `notAssigned` false, so the guard would fall through to "render calling UI" with no `data` — a crash, or worse, a false-positive grant.
- **Fix:** Added `|| checkInStatus.isError` to the redirect predicate. Fail-safe: if we cannot confirm check-in, user does not reach the calling UI.
- **Files modified:** web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx
- **Verification:** Unit tests still pass; `call-page-checkin.spec.ts` passes.
- **Committed in:** `fca6984` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both adjustments required for correctness. No scope creep.

## Issues Encountered

- **PB-06 E2E test fails (pre-existing, out of scope):** `phone-banking.spec.ts › PB-06: Active calling` times out waiting for "Active calling" heading. Verified present on base commit `5b9a8f0` before this plan touched `call.tsx` — the test seed does not guarantee the owner test user is assigned as a caller on E2E Session 1, so the UI check-in click never surfaces the Start Calling affordance. Logged to `deferred-items.md`. Plan 73-06's primary target (`call-page-checkin.spec.ts`) passes cleanly.

## Verification

```
# TypeScript
$ cd web && npx tsc --noEmit 2>&1 | grep -E "call\.tsx|useCallerCheckInStatus"
(no output — clean)

# Unit tests (hook)
$ npx vitest run src/hooks/useCallerCheckInStatus.test.ts
Test Files  1 passed (1)
     Tests  3 passed (3)

# E2E (primary target)
$ ./scripts/run-e2e.sh call-page-checkin.spec.ts
✓  1 call-page-checkin.spec.ts › navigating directly to /call without check-in redirects away from /call (2.3s)
1 passed (3.8s)
```

## Next Phase Readiness

- SEC-12 / H26 closed. Server is the source of truth for check-in; direct URL access is no longer a bypass vector.
- Phase 73 complete — all 6 plans delivered. Full phase E2E run pending orchestrator gate.

## Self-Check: PASSED

- FOUND: web/src/hooks/useCallerCheckInStatus.ts
- FOUND: web/src/hooks/useCallerCheckInStatus.test.ts
- FOUND: web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx (modified)
- FOUND commit: 73a7998 (test RED)
- FOUND commit: 5b9a8f0 (feat hook)
- FOUND commit: fca6984 (feat gate)

---
*Phase: 73-frontend-auth-guards-oidc-error-surfacing*
*Completed: 2026-04-05*
