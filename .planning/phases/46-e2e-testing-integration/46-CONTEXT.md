# Phase 46: E2E Testing & Integration - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers automated test coverage across three layers: Playwright E2E tests for 6 critical user flows (login, voter search, voter import, turf creation, phone bank session, volunteer signup), conversion of 18 pending v1.0 integration test stubs to real tests against live infrastructure, and cross-campaign RLS isolation verification across 6 data dimensions. Includes a GitHub Actions CI workflow that gates merges on test passage.

</domain>

<decisions>
## Implementation Decisions

### E2E Flow Scope & Depth (TEST-01)
- **D-01:** Full CRUD journeys for each of the 6 flows — each test exercises the complete user journey (create → view → edit → verify), not just smoke-level navigation.
- **D-02:** Stored auth state via Playwright setup project — logs in once via ZITADEL UI, saves browser storage to a file, all test specs reuse that auth state. Official Playwright pattern.
- **D-03:** Tests run against the Docker Compose stack (API + DB + MinIO + ZITADEL + frontend preview server). Self-contained and reproducible.
- **D-04:** One spec file per flow: `login.spec.ts`, `voter-search.spec.ts`, `voter-import.spec.ts`, `turf-creation.spec.ts`, `phone-bank.spec.ts`, `volunteer-signup.spec.ts`.

### Integration Test Approach (TEST-02)
- **D-05:** Full Docker Compose stack required — PostgreSQL + PostGIS + MinIO + ZITADEL all running. Tests hit real services for maximum realism.
- **D-06:** Identify all 18 pending test stubs by grepping for `it.todo`, `pytest.mark.skip`, and similar markers. Convert each stub to a real test in-place.

### RLS Isolation Dimensions (TEST-03)
- **D-07:** Both-layer verification: raw SQL tests (`set_config` + direct queries) for RLS policy verification at the database level, plus a few API-level smoke tests to confirm the middleware correctly sets campaign context.
- **D-08:** Extend existing `tests/integration/test_*_rls.py` files for dimensions already partially covered. Add new files (`test_voter_list_rls.py`, `test_call_list_rls.py`) for missing dimensions. All 6 dimensions: voters, voter lists, turfs, walk lists, call lists, phone bank sessions.

### CI Integration
- **D-09:** Single GitHub Actions workflow with Docker Compose — starts services, runs seed data, executes both Playwright E2E and pytest integration tests sequentially.
- **D-10:** Test failures block merges to main — required check on PRs.
- **D-11:** Upload Playwright failure screenshots and traces as GitHub Actions artifacts. Traces enable browser state replay for debugging. Matches existing `playwright.config.ts` settings (screenshot: only-on-failure, trace: on-first-retry).

### Test Data Strategy
- **D-12:** Seed script provides baseline data. Tests that need specific scenarios (empty states, edge cases) create additional data via API calls in `beforeAll`/`beforeEach`. Best of both — consistent baseline with per-test flexibility.
- **D-13:** Fresh DB per suite run — Docker Compose down/up + migrations + seed before each full test run. Clean slate every time.

### Flaky Test Mitigation
- **D-14:** Rely on Playwright's built-in auto-waiting (waitForSelector, locator assertions). Add explicit `waitFor` only for known async operations (API calls, toasts, navigation). No arbitrary `sleep()` calls.
- **D-15:** 2 retries in CI with 30-second action timeout. Trace captured on first retry for debugging. Matches existing `playwright.config.ts` configuration.

### Coverage
- **D-16:** No coverage enforcement. Focus on test quality over coverage metrics. The 18 pending tests + RLS suite + 6 E2E flows provide sufficient confidence without coverage tooling overhead.

### Claude's Discretion
- Exact E2E test assertions per flow (which elements to verify, which API responses to check)
- Integration test fixture design and helper utilities
- RLS test fixture structure for the 6 isolation dimensions
- GitHub Actions workflow structure and service health-check strategy
- Playwright page object patterns vs inline selectors

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TEST-01, TEST-02, TEST-03

### Existing E2E Infrastructure
- `web/playwright.config.ts` — Playwright configuration (baseURL, retries, webServer, projects)
- `web/e2e/a11y-scan.spec.ts` — Parameterized axe-core scan pattern (Phase 45)
- `web/e2e/a11y-voter-search.spec.ts` — Flow test pattern combining keyboard nav + ARIA assertions

### Existing Integration Tests
- `tests/integration/conftest.py` — Integration fixtures (superuser + app_user sessions)
- `tests/integration/test_rls.py` — Core RLS isolation tests (campaign isolation)
- `tests/integration/test_voter_rls.py` — Voter-specific RLS tests
- `tests/integration/test_canvassing_rls.py` — Canvassing RLS tests
- `tests/integration/test_phone_banking_rls.py` — Phone banking RLS tests
- `tests/integration/test_volunteer_rls.py` — Volunteer RLS tests
- `tests/integration/test_rls_isolation.py` — Cross-domain RLS isolation

### Test Patterns
- `.planning/codebase/TESTING.md` — Test framework docs, mock patterns, fixture conventions
- `tests/conftest.py` — JWT test infrastructure (RSA key pair, JWKS, make_jwt)

### Seed Data
- `scripts/seed.py` — Idempotent Macon-Bibb County demo dataset (8 users, 1 org, 1 campaign, 50 voters, etc.)

### CI/CD
- `.github/workflows/` — Existing GitHub Actions workflows

### Phase 45 Context (Preceding)
- `.planning/phases/45-wcag-compliance-audit/45-CONTEXT.md` — Parameterized Playwright test patterns, a11y flow test approach

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@playwright/test` already installed with configured `playwright.config.ts`
- 30+ existing Playwright spec files in `web/e2e/` — established patterns for page navigation, assertions, and ZITADEL auth
- 6 existing RLS test files in `tests/integration/` with `conftest.py` providing superuser/app_user session fixtures
- `scripts/seed.py` — idempotent seed data script creating a complete demo dataset
- JWT test infrastructure in `tests/conftest.py` (RSA key pair, JWKS builder, make_jwt helper)

### Established Patterns
- Integration tests: `@pytest.mark.integration`, `set_config` for RLS context, raw SQL assertions
- API tests: `_override_app()` with dependency overrides, `ASGITransport` + `AsyncClient`
- E2E tests: Playwright with chromium project, self-signed cert handling, webServer preview command
- Phase 45: Parameterized route-array tests, accessibility tree assertions

### Integration Points
- Docker Compose: `docker-compose.yml` defines all services (API, PostgreSQL, MinIO, ZITADEL)
- GitHub Actions: existing workflows for image publishing — new test workflow integrates alongside
- Playwright config: `webServer` block starts preview server — E2E tests need API + full stack running
- pytest config: `pyproject.toml` `[tool.pytest.ini_options]` — markers for integration and e2e

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing test patterns and Playwright best practices.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 46-e2e-testing-integration*
*Context gathered: 2026-03-24*
