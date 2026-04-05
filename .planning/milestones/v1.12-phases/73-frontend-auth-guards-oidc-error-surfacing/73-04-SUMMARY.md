---
phase: 73-frontend-auth-guards-oidc-error-surfacing
plan: 04
subsystem: auth
tags: [oidc, react, tanstack-router, shadcn, alert, zitadel]

requires:
  - phase: 73-frontend-auth-guards-oidc-error-surfacing
    provides: "Existing callback.tsx structure with validateSearch + module-level callbackProcessed flag"
provides:
  - "Destructive Alert surfaced on /callback when IdP returns error/error_description"
  - "validateSearch extracts error + error_description alongside code + state"
  - "Back to login CTA that navigates to /login without blocking retries"
affects: [auth, login, zitadel-errors, field-volunteers]

tech-stack:
  added: []
  patterns:
    - "Guard callbackProcessed module flag on error branches so retries aren't swallowed"
    - "UI-SPEC-driven copy contract: description primary, code secondary, generic fallback"

key-files:
  created: []
  modified:
    - "web/src/routes/callback.tsx"

key-decisions:
  - "Do not set callbackProcessed flag on error so users can retry without a module reload"
  - "error_description is always primary body text; error code is secondary/diagnostic per UI-SPEC"
  - "No toast, no auto-redirect — inline Alert only per UI-SPEC out-of-scope clause"

patterns-established:
  - "OIDC error-surfacing pattern: validateSearch includes all 4 OIDC params with safe string defaults"

requirements-completed: [SEC-09]

duration: 5min
completed: 2026-04-04
---

# Phase 73 Plan 04: OIDC Callback Error Surfacing Summary

**Destructive Alert rendered on `/callback` when IdP errors present; Back to login CTA replaces silent spinner hang.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-05T00:04:00Z
- **Completed:** 2026-04-05T00:09:31Z
- **Tasks:** 2 (1 auto + 1 visual checkpoint auto-approved)
- **Files modified:** 1

## Accomplishments
- Extended `validateSearch` to extract `error` and `error_description` from callback URL search params
- Added early-return guard in `useEffect` on error so `callbackProcessed` flag stays `false` — users can retry sign-in without module reload
- Rendered destructive shadcn `Alert` with `AlertCircle` icon, "Sign-in failed" title, IdP description as primary body, conditional "Error code: {error}" secondary line, and "Back to login" Button per UI-SPEC section 1
- Verified light + dark mode visuals via Playwright screenshots

## Task Commits

1. **Task 1: Extend validateSearch and render OIDC error state** — `950afbf` (feat)
2. **Task 2: Visual check of OIDC error state** — auto-approved (autonomous mode); screenshots captured to `screenshots/phase73-oidc-error-light.png` + `screenshots/phase73-oidc-error-dark.png`

## Files Created/Modified
- `web/src/routes/callback.tsx` — added error + error_description to validateSearch; added hasError branch with Alert + Button; guarded useEffect to bail before setting callbackProcessed flag when error present
- `screenshots/phase73-oidc-error-light.png` (gitignored) — visual verification
- `screenshots/phase73-oidc-error-dark.png` (gitignored) — visual verification

## Decisions Made
- Followed plan + UI-SPEC exactly — no architectural deviations

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Verification
- `oidc-error.spec.ts`: **3/3 passing** (1.5s)
  - callback URL with error and error_description renders destructive Alert
  - clicking Back to login navigates to /login
  - callback with only error code (no description) still shows Alert
- TypeScript: clean (`npx tsc --noEmit`)
- ESLint: pre-existing `react-refresh/only-export-components` on `__resetCallbackProcessedForTests` — out of scope
- Visual: both light and dark mode screenshots render destructive red Alert, civic-blue primary CTA, readable tokens

## Next Phase Readiness
- Plan 05 (RequireRole redirect fallback) independent from this work
- Plan 06 ready — final phase plan

---
*Phase: 73-frontend-auth-guards-oidc-error-surfacing*
*Completed: 2026-04-04*

## Self-Check: PASSED
- FOUND: web/src/routes/callback.tsx (modified)
- FOUND: commit 950afbf
- FOUND: screenshots/phase73-oidc-error-light.png
- FOUND: screenshots/phase73-oidc-error-dark.png
