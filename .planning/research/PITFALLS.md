# Domain Pitfalls

**Domain:** Comprehensive E2E testing pipeline for multi-tenant FastAPI + React + Playwright + ZITADEL application
**Project:** CivicPulse Run v1.7 Testing & Validation
**Researched:** 2026-03-29
**Overall confidence:** HIGH (pitfalls identified from direct codebase analysis, ZITADEL API documentation, Playwright GitHub issues, and community best practices)

---

## Critical Pitfalls

Mistakes that cause test suite failures, security regressions, or major rework.

### Pitfall 1: OIDC Token Expiration Invalidating storageState Across Long Test Runs

**What goes wrong:** The current `auth.setup.ts` persists a ZITADEL OIDC session via `storageState()` to `playwright/.auth/user.json`. This works for the existing 51 specs that complete in minutes. Scaling to ~180 total specs means the full suite may run 15-45 minutes. OIDC refresh tokens can rotate on use (each token valid once). When `fullyParallel: true` (current config), multiple workers load the same auth file simultaneously. The first worker that triggers a token refresh invalidates the stored token for all other workers.

**Why it happens:** Playwright's storageState is a snapshot-in-time of cookies and localStorage. The first worker that uses the refresh token causes rotation, making the stored token stale for all other workers.

**Consequences:** Cascading test failures across entire Playwright workers. Failures manifest as navigation timeouts or "element not found" errors on authenticated pages, not as auth errors. Debugging is extremely difficult because the root cause (token rotation) is invisible in test output.

**Prevention:**
1. Use per-worker authentication setup via `testInfo.parallelIndex` so each worker has its own auth state file (e.g., `user-0.json`, `user-1.json`).
2. Set ZITADEL token lifetime generously for the local dev instance (e.g., 24-hour access tokens).
3. For the v1.7 test plan with 15 ZITADEL users: leverage different users per worker/project, each with their own storageState, which naturally avoids token contention.

**Detection:** Tests pass individually but fail when run as full suite. Failures cluster in workers that start later. Login redirect URLs appear in Playwright trace screenshots.

### Pitfall 2: ZITADEL Users Cannot Login After Provisioning

**What goes wrong:** Users are created in ZITADEL but fail the OIDC login flow during Playwright auth setup. The auth setup file times out waiting for redirect.

**Why it happens:** Three common causes:
1. `isEmailVerified` is not set to `true` -- ZITADEL forces an email verification step before allowing login.
2. `passwordChangeRequired` is not set to `false` -- ZITADEL forces a password change on first login, which the auth setup script does not handle (except for the primary admin user which has explicit change-password handling in auth.setup.ts lines 43-49).
3. The user has no project role grant -- ZITADEL's `projectRoleCheck: true` setting (enabled in bootstrap-zitadel.py) blocks users without a project role from accessing the SPA application.
4. The V2 User Service API's `SetPassword` endpoint has had bugs where `changeRequired` was ignored (GitHub issue #7868). The local instance runs v2.71.6 which may or may not include the fix.

**Consequences:** Every test that depends on that role's auth context fails. If this is the owner role, nearly all tests fail.

**Prevention:**
- Always create users with `"isEmailVerified": True` and `"passwordChangeRequired": False` in the API call.
- Always grant a project role immediately after user creation (before any login attempt).
- After creating each user, call `SetPassword` with `changeRequired: false` as a belt-and-suspenders approach.
- Add a verification step to `create-e2e-users.py` that attempts an OIDC password grant to the token endpoint for each user to confirm they can authenticate.
- Make all auth setup scripts handle the "Change Password" flow robustly (extract the existing pattern from auth.setup.ts into a shared helper).

**Detection:** Auth setup files fail with timeout errors. Playwright trace shows the ZITADEL login page stuck on email verification or password change.

### Pitfall 3: Test Data Coupling Creates a Fragile Dependency Chain

**What goes wrong:** The testing plan (docs/testing-plan.md) is structured sequentially: IMP-01 imports 551 voters, then VAL-01 validates 40 of them, then FLT-02 filters them, then VCRUD-01 creates 20 more, etc. If this sequential dependency is encoded directly into Playwright specs, a single failure in an early test cascades to skip or fail every downstream test. With ~130 tests, a flaky import test could render 80% of the suite useless.

**Why it happens:** The testing plan is written for human testers who run sequentially. Translating human test plans 1:1 into Playwright specs is the #1 most common E2E testing anti-pattern. Playwright itself warns: "Using serial is not recommended. It is usually better to make your tests isolated."

**Consequences:** A single flaky test (particularly IMP-01 import, which depends on MinIO + Procrastinate worker + PostgreSQL all cooperating) can cause 80+ subsequent tests to be skipped. CI provides almost no useful signal.

**Prevention:**
1. Separate the test plan's logical ordering from test execution independence. Each spec file should be self-contained.
2. Use API-based setup instead of UI-based setup. Before VCRUD tests, use `page.request.post()` to create voters via API rather than depending on a prior import test. This is 10-100x faster and more reliable.
3. Create a shared global setup fixture that seeds the database (similar to `scripts/seed.py`) rather than relying on test-created data.
4. Reserve `test.describe.serial` for true multi-step flows put those in single spec files with `test.step()`.
5. Group tests by feature isolation: auth tests, voter CRUD tests, import tests, canvassing tests, etc. Each group seeds its own data via API fixtures.

**Detection:** CI runs where one early test failure causes dozens of "skipped" tests. Tests that pass in isolation but fail when run with the full suite.

### Pitfall 4: Breaking Append-Only Semantics When Adding Note Edit/Delete

**What goes wrong:** The `VoterInteraction` model (app/models/voter_interaction.py) is explicitly documented as append-only: "Events are never modified or deleted. Corrections are recorded as new events referencing the original event ID in the payload." Adding PATCH and DELETE for `type="note"` interactions violates this contract. If the implementation allows editing/deleting non-note interaction types (door_knock, phone_call, survey_response, import, tag_added), it corrupts the audit trail that other features depend on.

**Why it happens:** Implementing a generic interaction edit/delete endpoint (rather than note-specific) is the path of least resistance. A developer might add `PATCH /voter-interactions/{id}` without a type guard.

**Consequences:** Canvassing door knock records become editable, breaking progress dashboards. Phone call outcomes can be retroactively changed, breaking call list completion tracking. Import records can be deleted, creating orphaned voter data with no provenance. The audit trail becomes unreliable.

**Prevention:**
1. The API endpoints must enforce `type == "note"` as a precondition. Any attempt to edit/delete a non-note interaction must return 403 or 422.
2. Add a database-level constraint or trigger that prevents UPDATE/DELETE on voter_interactions where type != 'note'. Belt-and-suspenders with the API check.
3. Write explicit negative test cases: attempt to PATCH a door_knock interaction, verify 403. Attempt to DELETE an import interaction, verify 403.
4. Consider soft-delete for notes (add `deleted_at` column) rather than hard delete, preserving the append-only spirit while allowing UI removal.
5. Add `updated_at` and `updated_by` columns for edited notes to maintain edit history.
6. The testing plan explicitly states NOTE-03: "Confirm system-generated interactions (import, tag_added, etc.) are NOT affected."

**Detection:** Existing canvassing/phone banking E2E tests start failing after note edit/delete is implemented. Dashboard stats change unexpectedly.

### Pitfall 5: Parallel Test Workers Polluting Shared PostgreSQL State

**What goes wrong:** All tests in the plan use a single "E2E Test Campaign." When multiple Playwright workers run tests against the same campaign simultaneously, they compete for database state. Worker A creates a voter, Worker B deletes a different voter, Worker A's assertion on voter count fails because the count changed.

**Why it happens:** Playwright's `fullyParallel: true` (current config) distributes tests across workers that all hit the same API, same database, same campaign. E2E tests cannot use database transactions for isolation -- each API call is its own transaction.

**Consequences:** Intermittent count mismatches, "element not found" for recently-created records, and phantom data from other workers' test runs. Non-deterministic and nearly impossible to reproduce locally.

**Prevention:**
1. Create a dedicated test campaign per worker using `testInfo.parallelIndex` ("E2E Campaign Worker-0", "E2E Campaign Worker-1"). RLS policies naturally isolate data between campaigns.
2. Use Playwright fixtures to create campaign-scoped test data at the worker level (`{ scope: 'worker' }`) and tear it down after.
3. For tests that must share a campaign (RBAC tests verifying cross-role access), put them in a single serial describe block within one spec file.
4. Set `workers: 1` in CI initially (current config already does this).

**Detection:** Tests pass with `--workers=1` but fail with `--workers=4`. Count assertions fail intermittently.

### Pitfall 6: ZITADEL Org Membership Not Created in Application Database

**What goes wrong:** The provisioning script creates ZITADEL users and grants project roles, but does NOT insert `organization_members` rows in the application database. Users with `org_admin` or `org_owner` intended roles have no org-level access.

**Why it happens:** ZITADEL project roles and application-level org membership are separate systems. ZITADEL knows about project roles; the application database knows about org membership. The existing `create-e2e-users.py` handles this via `ensure_org_membership()` with direct SQL, but only for users with an `orgRole` defined.

**Consequences:** RBAC-08 and RBAC-09 (org admin/owner cross-campaign access) fail because the user has no org membership row.

**Prevention:**
- Ensure every user definition with `"orgRole": "org_admin"` or `"orgRole": "org_owner"` goes through the `ensure_org_membership()` function.
- The function must create a `users` row first (the application user record, separate from ZITADEL).
- Use `ON CONFLICT ... DO UPDATE` for idempotency.
- Add a verification query after provisioning that confirms all expected org membership rows exist.

**Detection:** Org-role RBAC tests fail with 403 or redirect-to-login when navigating to campaigns the user was not explicitly invited to.

---

## Moderate Pitfalls

### Pitfall 7: Role-Specific Tests Run with Wrong Auth Context

**What goes wrong:** A test file intended for the "viewer" role accidentally runs with "owner" auth, causing RBAC assertions to incorrectly pass (owner can see everything).

**Why it happens:** The Playwright `testMatch` pattern in `playwright.config.ts` does not correctly route the spec file to the intended project. Currently only 3 auth contexts exist (user, orgadmin, volunteer). Scaling to 5+ role-specific contexts (owner, admin, manager, volunteer, viewer) increases routing complexity.

**Consequences:** RBAC tests produce false passes. A broken permission gate goes undetected.

**Prevention:**
- Use strict naming conventions: `*.owner.spec.ts`, `*.admin.spec.ts`, `*.manager.spec.ts`, `*.volunteer.spec.ts`, `*.viewer.spec.ts`.
- The default `chromium` project's `testIgnore` must exclude ALL role-suffixed specs.
- Each role project's `testMatch` must be precise.
- Verify in CI logs that each spec runs under the correct project name.

**Detection:** Check the Playwright HTML report -- each test should show which project it ran under.

### Pitfall 8: ZITADEL Container Startup Race in CI

**What goes wrong:** The CI workflow depends on `zitadel-bootstrap` completing before the API starts. Creating 15 users (up from current 2) with role assignments, org memberships, and project role grants is significantly more API calls. On slow CI runners, this can exceed expected timeouts.

**Why it happens:** ZITADEL can take 30-90 seconds to initialize. The bootstrap script polls with 60 retries x 3 seconds. Adding 15 test users via `create-e2e-users.py` adds ~30-60 seconds of Management API calls.

**Prevention:**
1. Add an explicit health-check step after user creation that verifies all 15 users can authenticate.
2. Parallelize user creation where possible (create users concurrently with asyncio, then assign roles).
3. Add a generous but explicit timeout to the CI user creation step (5 minutes) with clear failure messages.

**Detection:** CI E2E tests fail intermittently with auth setup errors.

### Pitfall 9: MinIO Presigned URL Mismatch Between Containers and Host

**What goes wrong:** Import tests (IMP-01 through IMP-04) depend on MinIO. Docker Compose has `S3_ENDPOINT_URL: http://minio:9000` (container-to-container) and `S3_PRESIGN_ENDPOINT_URL: http://localhost:9000` (host access). Playwright runs on the host. If presigned URLs embed the internal hostname, the browser cannot reach `minio:9000`.

**Prevention:**
1. Verify presigned URL generation uses `S3_PRESIGN_ENDPOINT_URL` for all browser-accessible URLs.
2. In E2E tests, validate that download URLs resolve to `localhost:9000`.
3. Add a smoke test for MinIO accessibility before running import tests.

**Detection:** Import completes but "Download Error Report" link returns network error.

### Pitfall 10: Test Cleanup Ordering Creates Orphaned Data

**What goes wrong:** The testing plan lists 14 cleanup steps. Wrong order hits foreign key constraints. Failed cleanup (CI timeout, browser crash) leaves polluted data for subsequent runs.

**Prevention:**
1. Use API-based cleanup instead of UI-based cleanup.
2. Use database-level cleanup: a reset script or `TRUNCATE ... CASCADE` for test data.
3. Design tests to be idempotent: use unique names with timestamps (like `connected-journey.spec.ts` does with `E2E Journey ${Date.now()}`).
4. Implement cleanup in `afterAll` hooks rather than relying on a separate cleanup phase.
5. For CI, start with a fresh database each run (current pipeline does this via fresh Docker volumes).

**Detection:** Tests fail on second local run with "duplicate key" or "name already exists" errors.

### Pitfall 11: Selector Fragility Across 180 Specs

**What goes wrong:** The existing test suite mixes selector strategies inconsistently. With 130 new tests, UI text changes cascade across many specs.

**Why it happens:** Different milestone phases wrote specs with different conventions. No shared page object model exists. The `.first()` escape hatch is used frequently, masking ambiguous selectors.

**Prevention:**
1. Establish shared helpers that centralize navigation patterns (e.g., `navigateToCampaign(page, name)`).
2. Prefer `data-testid` for elements without stable accessible roles.
3. Standardize on accessibility-first selectors: `getByRole`, `getByLabel`, `getByText`.
4. Audit existing 51 specs for `.first()` usage -- each is a potential ambiguity bug.

**Detection:** A single UI text change causes 20+ test failures.

### Pitfall 12: Voter Data Validation Tests Are Unmaintainable at Scale

**What goes wrong:** VAL-01/VAL-02 call for validating 60 voters field-by-field via the UI. This takes 15-30 minutes, is extremely brittle, and provides minimal value over integration tests.

**Why it happens:** The test plan was written as a manual QA checklist. Not every manual test should become a Playwright E2E test.

**Prevention:**
1. Implement VAL-01/VAL-02 as Python integration tests (import service -> database -> query). This runs in seconds.
2. Keep 5-10 E2E voter detail validations as smoke tests.
3. Use API-level assertions (`page.request.get()`) for data validation rather than DOM scraping.

**Detection:** Full suite takes 45+ minutes. VAL tests account for 30% of runtime but catch 0% of UI bugs.

### Pitfall 13: Web Preview Server vs Dev Server Mismatch

**What goes wrong:** Playwright config targets `npm run preview` (port 4173, HTTPS). Docker Compose runs `npm run dev` (port 5173, HTTP). New test authors may test against the wrong target.

**Prevention:**
1. The preview build is correct for E2E testing (closer to production). Stick with it.
2. Document the canonical test setup explicitly.
3. Use `playwright.debug.config.ts` (already exists) for local dev server debugging.

**Detection:** Tests pass against dev but fail against preview, or vice versa.

### Pitfall 14: Walking List Rename Backend Accepts Empty Names

**What goes wrong:** The walk list rename UI (to be built) allows submitting an empty name, which the backend PATCH endpoint accepts.

**Prevention:**
- Add `min_length=1` validation to the walk list name field in the Pydantic schema.
- Add react-hook-form + zod validation requiring non-empty name in the rename dialog.
- WL-05 should explicitly test that renaming to "" is rejected.

**Detection:** Walk list with empty name appears as blank row in canvassing table.

---

## Minor Pitfalls

### Pitfall 15: Map Interaction Tests Are Inherently Flaky

**What goes wrong:** TURF-01 through TURF-07 require drawing polygons on a Leaflet map. Playwright's mouse API is pixel-dependent. Different viewports, resolutions, or tile loading timing produce different results.

**Prevention:**
1. Use GeoJSON import for test turf creation instead of mouse-drawn polygons.
2. Pre-create GeoJSON fixtures for known Bibb County boundaries.
3. For drawing validation, use fixed viewport dimensions and explicit map state setup.

**Detection:** Turf tests pass locally but fail in CI.

### Pitfall 16: Offline Mode Tests Leak Network State

**What goes wrong:** OFFLINE-01 through OFFLINE-03 disable network connectivity. If not properly restored, subsequent tests in the same worker fail with network errors.

**Prevention:**
1. Use `page.route('**/*', route => route.abort())` to simulate offline (not system-level changes).
2. Always restore routes in `afterEach`.
3. Run offline tests in their own describe block with explicit cleanup.

**Detection:** Tests after offline specs fail with network errors.

### Pitfall 17: Rate Limit Test Triggers Cascading Rate Limiting

**What goes wrong:** CROSS-03 intentionally triggers 429 rate limit. Subsequent tests run before the rate limit window expires also get rate-limited.

**Prevention:**
- Configure higher rate limits (or disabled) for the test environment via environment variable.
- Run CROSS-03 last or in an isolated serial block.
- Use a different test user for rate limit testing than for other tests.

**Detection:** Tests immediately following CROSS-03 fail with 429 responses.

### Pitfall 18: Field Mode Tests Require Mobile Viewport

**What goes wrong:** Field mode components use responsive breakpoints. Tests running at desktop viewport do not trigger mobile-specific behavior.

**Prevention:**
- Use `page.setViewportSize({ width: 375, height: 812 })` or Playwright's `devices["iPhone 13"]` preset.
- Follow the existing pattern in `phase30-field-layout.spec.ts`.

**Detection:** Field mode tests fail to find mobile-specific elements.

### Pitfall 19: AI Production Testing Instructions Drift from Actual UI

**What goes wrong:** AI testing instructions reference specific button text or page layouts that become stale as the UI evolves. Unlike Playwright tests that fail visibly, stale AI instructions fail silently.

**Prevention:**
1. Write AI instructions using semantic descriptions rather than exact selectors.
2. Include verification checkpoints ("After clicking, you should see a form with...").
3. Version the instructions alongside the codebase.
4. Consider generating instructions from Playwright test specs rather than maintaining separately.

**Detection:** AI tests report all-pass but human finds obvious bugs.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Test infrastructure setup | Token expiration (P1), ZITADEL startup race (P8), rate limits (P17), preview vs dev (P13) | Per-worker auth, generous token lifetimes, higher rate limits for test env, canonical target |
| User provisioning (15 users) | Login failure (P2), missing org membership (P6), startup race (P8) | Set email verified + no password change + project role, ensure_org_membership(), health-check |
| Test architecture / spec structure | Data coupling (P3), parallel pollution (P5), cleanup ordering (P10), selectors (P11) | API-based seeding, campaign-per-worker, idempotent naming, shared helpers |
| Note edit/delete implementation | Append-only violation (P4), empty name validation (P14) | Type guard on API, negative tests, pydantic + zod validation |
| RBAC tests | Wrong auth context (P7), org membership (P6) | Strict naming + testMatch patterns, verify project in report |
| Import test specs | MinIO URL mismatch (P9), data coupling (P3) | Verify presigned URL hostname, small CSVs, API-level validation |
| Voter data validation | Unmaintainable at scale (P12) | Integration tests for data, 5-10 UI smoke tests only |
| Canvassing/turf tests | Map flakiness (P15) | GeoJSON import for deterministic turfs |
| Field mode / offline tests | Network state leaks (P16), viewport (P18) | Route-based offline, explicit restore, mobile viewport |
| AI production instructions | Documentation drift (P19) | Semantic descriptions, verification checkpoints, version with code |
| Rate limit tests | Cascading rate limits (P17) | Run last, isolated user, or disable limits in test env |

---

## Sources

### Playwright Official Documentation and Issues
- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Playwright Parallelism](https://playwright.dev/docs/test-parallel)
- [storageState token refresh issue #16627](https://github.com/microsoft/playwright/issues/16627)
- [Auth0 storageState issue #32594](https://github.com/microsoft/playwright/issues/32594)
- [OIDC fixtures request #16511](https://github.com/microsoft/playwright/issues/16511)
- [Interdependent tests issue #10114](https://github.com/microsoft/playwright/issues/10114)
- [Database isolation issue #33699](https://github.com/microsoft/playwright/issues/33699)

### ZITADEL Documentation
- [ZITADEL Register/Create User](https://zitadel.com/docs/guides/manage/user/reg-create-user)
- [ZITADEL password_change_required bug #7868](https://github.com/zitadel/zitadel/issues/7868)
- [Human user login for E2E discussion #7530](https://github.com/zitadel/zitadel/discussions/7530)
- [PAT for Service Accounts](https://zitadel.com/docs/guides/integrate/service-accounts/personal-access-token)

### E2E Testing Best Practices
- [Building a Comprehensive E2E Test Suite: Lessons from 100+ Cases](https://medium.com/@sunuerico/building-a-comprehensive-e2e-test-suite-with-playwright-lessons-from-100-test-cases-975851932218)
- [17 Playwright Testing Mistakes You Should Avoid](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/)
- [Playwright E2E Testing: 12 Best Practices (2026)](https://elionavarrete.com/blog/e2e-best-practices-playwright.html)
- [How to Avoid Flaky Tests in Playwright](https://semaphore.io/blog/flaky-tests-playwright)
- [Demystifying Test Data Management for Automation](https://dev.to/nishikr/demystifying-test-data-management-for-automation-a-practical-approach-with-playwright-45h)

### Multi-Tenant Testing
- [Multi-Tenant Architecture with FastAPI: Patterns and Pitfalls](https://medium.com/@koushiksathish3/multi-tenant-architecture-with-fastapi-design-patterns-and-pitfalls-aa3f9e75bf8c)
- [Row-Level Security in PostgreSQL for Tenant Isolation](https://mvpfactory.io/blog/row-level-security-in-postgresql-multi-tenant-data-isolation-for-your-saas)

### Codebase Analysis (PRIMARY)
- Existing Playwright config: `web/playwright.config.ts`
- Existing auth setup: `web/e2e/auth.setup.ts`, `web/e2e/auth-volunteer.setup.ts`, `web/e2e/auth-orgadmin.setup.ts`
- Existing user provisioning: `scripts/create-e2e-users.py`
- VoterInteraction model: `app/models/voter_interaction.py` (line 34: "Events are never modified or deleted")
- CI workflow: `.github/workflows/pr.yml`
- Docker Compose: `docker-compose.yml`
- Testing plan: `docs/testing-plan.md`
- 51 existing spec files in `web/e2e/`
