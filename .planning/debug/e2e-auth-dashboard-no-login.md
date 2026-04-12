---
status: diagnosed
trigger: "The app dashboard loads without showing the ZITADEL login page during E2E tests"
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

## Current Focus

hypothesis: This is EXPECTED behavior for the default E2E test projects. The Playwright config pre-loads authenticated storageState for all test projects, so the dashboard correctly loads without a login page. The auth guard itself works correctly. Two specific unauthenticated-redirect tests exist but are intentionally skipped (deferred to v1.19).
test: Verified auth guard logic, Playwright config, storageState files, and test results
expecting: N/A — root cause identified
next_action: Return diagnosis

## Symptoms

expected: When an unauthenticated user navigates to the app dashboard, they should be redirected to the ZITADEL login page first.
actual: The dashboard loads directly without a ZITADEL login page appearing.
errors: No specific error messages — page loads as if already authenticated.
reproduction: Occurs during E2E Playwright test runs. Not confirmed for manual access.
started: Broke recently — was working before. Exact commit unknown.

## Eliminated

- hypothesis: Auth middleware is failing open (not redirecting unauthenticated users)
  evidence: __root.tsx line 50 has correct guard logic `if (!isAuthenticated && !isPublicRoute)` -> Navigate to /login. The original bug (OR instead of AND at line 245) was already fixed. login.spec.ts test "unauthenticated access to protected root redirects to /login then ZITADEL" PASSES (240ms).
  timestamp: 2026-04-11

- hypothesis: OIDC flow completing faster than test can observe
  evidence: The login.spec.ts test that creates a fresh unauthenticated context and navigates to "/" successfully observes the /login redirect. The test passes in the latest run (312 pass, 0 fail).
  timestamp: 2026-04-11

- hypothesis: Recent code change broke auth redirect
  evidence: No changes to __root.tsx, authStore.ts, or login.tsx since v1.17. The auth guard logic has been stable.
  timestamp: 2026-04-11

## Evidence

- timestamp: 2026-04-11
  checked: web/playwright.config.ts — how E2E tests handle authentication
  found: All 5 test projects (chromium, admin, manager, volunteer, viewer) use pre-loaded storageState from web/playwright/.auth/{role}.json. These files contain valid OIDC tokens (not yet expired) and ZITADEL session cookies. Tests run as already-authenticated users BY DESIGN.
  implication: The dashboard loading without a login page is EXPECTED behavior for any test in the default Playwright projects.

- timestamp: 2026-04-11
  checked: web/playwright/.auth/owner.json — stored auth state freshness
  found: Token expires_at=1775967468, current time ~1775966003. Tokens are valid (generated today at 12:17). OIDC localStorage key and ZITADEL cookies both present.
  implication: Playwright restores these into the browser context before tests run, making oidc-client-ts find a valid user on initialize().

- timestamp: 2026-04-11
  checked: web/src/routes/__root.tsx — auth guard logic
  found: Line 50: `if (!isAuthenticated && !isPublicRoute)` correctly redirects to /login with redirect param. PUBLIC_ROUTES = ["/login", "/callback", "/invites", "/signup"]. The "/" route is NOT public, so unauthenticated users ARE redirected.
  implication: The auth guard works correctly. The original bug (OR instead of AND) was fixed.

- timestamp: 2026-04-11
  checked: web/e2e-runs.jsonl — latest test run results
  found: Latest run: 312 pass, 0 fail, 66 skip. login.spec.ts:55 "unauthenticated access to protected root redirects to /login then ZITADEL" PASSES (240ms). auth-guard-redirect.spec.ts has 2 tests skipped (deferred v1.19) and 1 passing.
  implication: The redirect behavior is working and verified by passing tests.

- timestamp: 2026-04-11
  checked: web/e2e/auth-guard-redirect.spec.ts — why 2 redirect tests are skipped
  found: Tests were originally written as "failing-red scaffolds" in commit b276cb26 (Phase 73). They were skipped in commit a9abe33e (Phase 106) as "pre-existing failures" deferred to v1.19. The tests check URL pattern matching (/login?redirect=/campaigns/new) which the current code should support.
  implication: These tests may actually PASS now if un-skipped, since the __root.tsx bug was fixed. They were never re-tested after the fix.

- timestamp: 2026-04-11
  checked: web/src/stores/authStore.ts — how authentication state is determined
  found: initialize() calls _userManager.getUser(). If stored user exists and !user.expired, sets isAuthenticated=true. With Playwright's storageState restoring OIDC tokens to localStorage, getUser() finds a valid user immediately.
  implication: Pre-loaded storageState makes the app authenticate instantly without any OIDC redirect.

## Resolution

root_cause: This is NOT a bug — it is expected behavior. The Playwright config (web/playwright.config.ts) pre-loads authenticated storageState for all test projects. The auth setup projects (auth-owner.setup.ts, etc.) perform the full ZITADEL login flow once, save the browser state to web/playwright/.auth/{role}.json, and all subsequent tests reuse that state. When any test navigates to the dashboard, oidc-client-ts finds valid OIDC tokens in localStorage (restored from storageState) and sets isAuthenticated=true, so the dashboard renders directly without a login redirect. The auth guard in __root.tsx (line 50) is correct and working — verified by login.spec.ts:55 which creates a fresh unauthenticated context and confirms the redirect to /login. Two more specific redirect tests in auth-guard-redirect.spec.ts are skipped (deferred to v1.19) but likely pass now since the original bug (OR vs AND logic) was already fixed.
fix: No fix needed. If the intent is to verify the login redirect in E2E tests, the existing login.spec.ts:55 test already does this. The 2 skipped tests in auth-guard-redirect.spec.ts could be un-skipped to add coverage.
verification: login.spec.ts:55 passes. Latest E2E run: 312 pass, 0 fail.
files_changed: []
