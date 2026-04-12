---
status: resolved
trigger: "The app dashboard loads without showing the ZITADEL login page during E2E tests"
created: 2026-04-11T00:00:00Z
updated: 2026-04-12T13:45:00Z
resolved: 2026-04-12T13:45:00Z
---

## Current Focus

resolved — auth guard moved to beforeLoad, deep link redirects preserved, deployed to dev+prod

## Symptoms

expected: When an unauthenticated user navigates to the app dashboard, they should be redirected to the ZITADEL login page first.
actual: The dashboard loads directly without a ZITADEL login page appearing.
errors: No specific error messages — page loads as if already authenticated.
reproduction: Occurs during E2E Playwright test runs. Not confirmed for manual access.
started: Broke recently — was working before. Exact commit unknown.

## Root Cause (Updated)

Initial diagnosis found that E2E tests use pre-loaded storageState (expected behavior). However, deeper investigation revealed a real bug: **TanStack Router's navigation phase called `pushState → /` before the React component-level auth guard could capture the original URL.** This broke deep linking for unauthenticated users — visiting `/campaigns/new` would redirect to `/login?redirect=/` instead of `/login?redirect=/campaigns/new`.

The auth guard was in the wrong architectural layer: React component render (`<Navigate>`) vs TanStack Router's `beforeLoad` hook.

## Fix

Moved auth check from `RootLayout` component render to the root route's `beforeLoad` hook in `web/src/routes/__root.tsx`. `beforeLoad` runs during TanStack Router's navigation phase — before any `pushState` or component rendering — so `throw redirect(...)` preserves the original path.

Also un-skipped and fixed the 2 auth-guard-redirect E2E tests (SEC-07/SEC-08) that were deferred to v1.19.

## Verification

- 3/3 auth-guard-redirect tests pass (2 were previously skipped)
- Full E2E suite: 319 passed, 0 failed, 64 skipped
- TypeScript clean (`tsc --noEmit`)
- Deployed to dev+prod as `sha-8e3faad4`, PR #26 merged

## Files Changed

- `web/src/routes/__root.tsx` — auth guard moved from component to `beforeLoad`
- `web/e2e/auth-guard-redirect.spec.ts` — un-skipped tests, `exposeFunction` capture pattern
