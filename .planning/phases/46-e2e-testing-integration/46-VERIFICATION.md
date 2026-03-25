---
phase: 46-e2e-testing-integration
verified: 2026-03-24T00:00:00Z
status: gaps_found
score: 9/11 must-haves verified
gaps:
  - truth: "All 10 previously-skipped canvassing E2E tests are converted to real tests or removed with documented rationale"
    status: partial
    reason: "phase31-canvassing.spec.ts has zero test.skip markers (PASS) but hardcodes BASE = 'https://dev.tailb56d83.ts.net:5173' — a personal Tailscale dev URL. All 9 canvassing tests call page.goto(`${BASE}/field/...`), bypassing playwright.config.ts baseURL entirely. These tests will always fail in CI because the URL is unreachable outside the developer's machine."
    artifacts:
      - path: "web/e2e/phase31-canvassing.spec.ts"
        issue: "Hardcoded BASE = 'https://dev.tailb56d83.ts.net:5173' and calls page.goto(`${BASE}/...`) directly instead of page.goto('/...') which would use the configured baseURL. Also contains multiple page.waitForTimeout() calls violating D-14."
    missing:
      - "Replace const BASE = 'https://dev.tailb56d83.ts.net:5173' with nothing — remove BASE entirely and use relative paths like page.goto(`/field/${CAMPAIGN_ID}/canvassing`)"
      - "Remove hardcoded login() function that navigates to `${BASE}/login` and uses page.waitForTimeout() — replaced with stored auth state from playwright.config.ts (chromium project with storageState)"
      - "Remove all page.waitForTimeout() calls — replace with Playwright auto-waiting assertions per D-14"
      - "Remove hardcoded CAMPAIGN_ID '9e7e3f63-75fe-4e86-a412-e5149645b8be' that matches a specific dev environment campaign — find the campaign dynamically from the UI"

  - truth: "The 1 skipped integration-polish E2E test is converted to a real test or removed with documented rationale"
    status: partial
    reason: "phase21-integration-polish.spec.ts has zero test.skip markers (PASS) but also hardcodes BASE = 'https://dev.tailb56d83.ts.net:5173'. All 6 tests in this spec navigate to ${BASE}/campaigns/... making them CI-incompatible. Also contains multiple page.waitForTimeout() calls."
    artifacts:
      - path: "web/e2e/phase21-integration-polish.spec.ts"
        issue: "Same hardcoded BASE Tailscale URL and page.waitForTimeout() pattern as phase31-canvassing.spec.ts. The CAMPAIGN_ID '9e7e3f63-...' is dev-specific."
    missing:
      - "Replace BASE + hardcoded CAMPAIGN_ID navigation with baseURL-relative navigation: navigate to the org/campaigns page and click into the campaign (matching the pattern used by voter-search.spec.ts and other Phase 46 specs)"
      - "Remove all page.waitForTimeout() calls — replace with expect(...).toBeVisible() auto-waiting"
      - "Remove the login() function and rely on stored auth state from playwright.config.ts (these specs run in the chromium project which loads storageState)"
---

# Phase 46: E2E Testing Integration — Verification Report

**Phase Goal:** Critical user flows are covered by automated Playwright tests and all pending integration tests pass against live infrastructure
**Verified:** 2026-03-24
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Playwright setup project authenticates against ZITADEL and persists browser storage state | VERIFIED | `web/e2e/auth.setup.ts` exists with `storageState`, `process.env.E2E_USERNAME`, `getByLabel`, `getByRole`; `playwright.config.ts` has setup project with `testMatch: /.*\.setup\.ts/` and chromium project with `storageState: "playwright/.auth/user.json"` |
| 2 | Login E2E test verifies full OIDC redirect flow including error handling for bad credentials | VERIFIED | `web/e2e/login.spec.ts` has 3 tests using `browser.newContext()` — successful login, invalid credentials error, unauthenticated redirect. Zero `page.route` calls. |
| 3 | Voter search E2E test exercises search, filter, and result verification against seeded data | VERIFIED | `web/e2e/voter-search.spec.ts` has 3 tests: search by "James" (seed name), party filter with row count comparison, voter detail navigation. Uses `page.waitForResponse()` for API sync. No mocks. |
| 4 | Voter import E2E test uploads a CSV file, maps columns, and confirms imported voters appear | VERIFIED | `web/e2e/voter-import.spec.ts` uses `setInputFiles` with Buffer, navigates import wizard, searches for "TestImport1" in voter list after import. No mocks. |
| 5 | Turf creation E2E test draws a polygon on the map and verifies the saved turf appears on reload | VERIFIED | `web/e2e/turf-creation.spec.ts` uses GeoJSON textarea fallback, fills polygon coordinates, verifies "E2E Test Turf" in list. No mocks. 3 tests. |
| 6 | Phone bank E2E test creates a session, assigns callers, and records call outcomes | VERIFIED | `web/e2e/phone-bank.spec.ts` has 3 tests: create session, view session detail, status badge verification. No mocks. |
| 7 | Volunteer signup E2E test creates a volunteer record and verifies it appears in the volunteer list | VERIFIED | `web/e2e/volunteer-signup.spec.ts` has 3 tests: create volunteer, view detail, roster data verification. No mocks. |
| 8 | API-level smoke tests confirm middleware sets RLS campaign context correctly for voter and turf endpoints | VERIFIED | `tests/integration/test_rls_api_smoke.py` has 4 `async def test_` methods with `@pytest.mark.integration`, `ASGITransport`, `set_campaign_context`. Tests voter search scoping, turf list scoping, cross-campaign 403, null context empty results. |
| 9 | All 10 previously-skipped canvassing E2E tests are converted to real tests or removed with documented rationale | FAILED | `phase31-canvassing.spec.ts` has zero `test.skip` markers (9 tests present and nominally executable), but all 9 tests hardcode `BASE = "https://dev.tailb56d83.ts.net:5173"` — a personal Tailscale dev URL that is unreachable in CI. The tests bypass `playwright.config.ts` baseURL entirely, contain multiple `page.waitForTimeout()` calls (prohibited per D-14), and will fail in CI. |
| 10 | The 1 skipped integration-polish E2E test is converted to a real test or removed with documented rationale | FAILED | `phase21-integration-polish.spec.ts` has zero `test.skip` markers (6 tests present), but all tests hardcode `BASE = "https://dev.tailb56d83.ts.net:5173"` and use a dev-specific `CAMPAIGN_ID`. Same CI-compatibility issue as phase31. |
| 11 | GitHub Actions CI workflow starts Docker Compose, runs seed, executes integration tests and E2E tests, and uploads failure artifacts | VERIFIED | `.github/workflows/pr.yml` has `integration-e2e` job with `docker compose up -d --build --wait`, `alembic upgrade head`, `scripts/seed.py`, `uv run pytest tests/integration/ -m integration -x -q`, `npx playwright test`, two `upload-artifact@v4` steps, `docker compose down -v` cleanup. YAML is valid. |

**Score: 9/11 truths verified**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/e2e/auth.setup.ts` | ZITADEL login + storageState persistence | VERIFIED | Contains `storageState`, `process.env.E2E_USERNAME`, `getByLabel`, `getByRole`, `path.join(__dirname` |
| `web/playwright.config.ts` | Setup project + chromium dependency | VERIFIED | Contains `name: "setup"`, `testMatch: /.*\.setup\.ts/`, `storageState: "playwright/.auth/user.json"`, `dependencies: ["setup"]`, `actionTimeout: 30_000` |
| `web/e2e/login.spec.ts` | Login flow E2E test | VERIFIED | 3 tests, `browser.newContext()`, zero `page.route` calls |
| `web/e2e/voter-search.spec.ts` | Voter search E2E test | VERIFIED | 3 tests, `page.waitForResponse()`, zero `page.route` calls |
| `web/e2e/voter-import.spec.ts` | Voter import E2E test | VERIFIED | 1 comprehensive test, `setInputFiles`, zero `page.route` calls |
| `web/e2e/turf-creation.spec.ts` | Turf creation E2E test | VERIFIED | 3 tests, GeoJSON polygon string present, zero `page.route` calls |
| `web/e2e/phone-bank.spec.ts` | Phone bank E2E test | VERIFIED | 3 tests (create session, view detail, status badges), zero `page.route` calls |
| `web/e2e/volunteer-signup.spec.ts` | Volunteer signup E2E test | VERIFIED | 3 tests (create, detail, roster), zero `page.route` calls |
| `tests/integration/test_rls_api_smoke.py` | API-level RLS middleware verification | VERIFIED | `@pytest.mark.integration`, `class TestRLSAPISmokeTests`, `ASGITransport`, 4 test methods |
| `web/e2e/phase31-canvassing.spec.ts` | Converted canvassing E2E tests (formerly skipped) | STUB | Zero `test.skip` markers and 116+ lines, but hardcodes `BASE = "https://dev.tailb56d83.ts.net:5173"` — CI-unreachable dev URL. Tests function locally but not in CI pipeline. |
| `web/e2e/phase21-integration-polish.spec.ts` | Converted integration polish test (formerly skipped) | STUB | Zero `test.skip` markers and 300+ lines, but same hardcoded Tailscale URL issue. |
| `.github/workflows/pr.yml` | CI workflow with integration + E2E test job | VERIFIED | `integration-e2e` job present, all required steps present, valid YAML |
| `web/playwright/.auth/.gitkeep` | Auth directory placeholder | VERIFIED | File exists at `web/playwright/.auth/.gitkeep` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `web/playwright.config.ts` | `web/e2e/auth.setup.ts` | setup project testMatch | WIRED | `testMatch: /.*\.setup\.ts/` matches auth.setup.ts |
| `web/e2e/voter-search.spec.ts` | `/api/v1/campaigns/*/voters/search` | real API calls (no page.route mocks) | WIRED | `page.waitForResponse(resp => resp.url().includes("voters"))` — real API call |
| `tests/integration/test_rls_api_smoke.py` | `app/main.py` | ASGITransport + AsyncClient | WIRED | `from app.main import create_app` + `ASGITransport(app=app)` |
| `tests/integration/test_rls_api_smoke.py` | `app.db.rls.set_campaign_context` | RLS context verification | WIRED | `from app.db.rls import set_campaign_context` + called in `_get_db_with_rls()` |
| `.github/workflows/pr.yml` | `docker compose` | service startup + seed + test execution | WIRED | `docker compose up -d --build --wait`, `scripts/seed.py` |
| `.github/workflows/pr.yml` | `web/e2e/` | `npx playwright test` | WIRED | `run: npx playwright test` with `E2E_USERNAME` env var |
| `.github/workflows/pr.yml` | `tests/integration/` | `uv run pytest` | WIRED | `uv run pytest tests/integration/ -m integration -x -q` |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces test infrastructure, not components rendering dynamic data from a database. The test files themselves are the deliverables.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| RLS smoke test file syntax valid | `python3 -c "import ast; ast.parse(open('tests/integration/test_rls_api_smoke.py').read()); print('syntax ok')"` | `syntax ok` | PASS |
| CI workflow is valid YAML | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pr.yml')); print('valid yaml')"` | `valid yaml` | PASS |
| Zero test.skip markers remain | `grep -rn "test\.skip\|pytest\.mark\.skip" web/e2e/ tests/` | (empty — no output) | PASS |
| All 6 new E2E specs have no page.route calls | `grep -c "page.route" login.spec.ts voter-search.spec.ts voter-import.spec.ts turf-creation.spec.ts phone-bank.spec.ts volunteer-signup.spec.ts` | All return 0 | PASS |
| phase31/phase21 use CI-compatible URLs | `grep "tailb56d83" web/e2e/phase31-canvassing.spec.ts web/e2e/phase21-integration-polish.spec.ts` | Both files hardcode Tailscale URL | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEST-01 | 46-01, 46-03 | Playwright E2E tests cover critical user flows: login, voter search, voter import, turf creation, phone bank session, volunteer signup | SATISFIED | All 6 spec files exist with real test implementations against Docker Compose stack. No API mocks in new specs. |
| TEST-02 | 46-02 | 18 pending integration tests from v1.0 pass against live infrastructure | PARTIAL | 10 skipped stubs (9 canvassing + 1 integration-polish) converted to nominally executable tests with zero `test.skip` markers. However, the converted specs hardcode a dev-only Tailscale URL, making them unable to run in CI against live infrastructure as required. The spirit of TEST-02 (no pending skips) is met; the letter (run against live infra in CI) is not fully met for these two files. |
| TEST-03 | 46-02 | Cross-campaign RLS isolation test suite verifies no data leaks | SATISFIED | `tests/integration/test_rls_api_smoke.py` provides API-level verification at both SQL layer (existing `test_rls.py`, `test_voter_rls.py`) and API layer (new `ASGITransport`-based smoke tests). 4 tests covering voter search scoping, turf list scoping, 403 cross-campaign rejection, null context empty results. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/e2e/phase31-canvassing.spec.ts` | 6 | `const BASE = "https://dev.tailb56d83.ts.net:5173"` | BLOCKER | All 9 canvassing tests navigate to this hardcoded Tailscale URL instead of the playwright.config.ts `baseURL`. Tests cannot run in CI. |
| `web/e2e/phase31-canvassing.spec.ts` | 17, 21, 176, 230, 255, 271, 286, 340, 344, 367, 371, 373 | `page.waitForTimeout()` | Warning | Violates D-14 (Playwright auto-waiting only). Tests are flaky by design with arbitrary waits. |
| `web/e2e/phase31-canvassing.spec.ts` | 5 | `const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"` | BLOCKER | Hardcoded dev campaign UUID. CI seed creates a fresh campaign with a different UUID. |
| `web/e2e/phase21-integration-polish.spec.ts` | 6 | `const BASE = "https://dev.tailb56d83.ts.net:5173"` | BLOCKER | Same hardcoded Tailscale URL. All 6 tests will fail in CI. |
| `web/e2e/phase21-integration-polish.spec.ts` | 13, 17, 28, 66, 79, 91, 101, 112, ... | `page.waitForTimeout()` | Warning | Violates D-14. Multiple arbitrary waits throughout. |
| `web/e2e/phase21-integration-polish.spec.ts` | 5 | `const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"` | BLOCKER | Hardcoded dev campaign UUID not present in CI seed data. |

### Human Verification Required

None — all items were verifiable programmatically.

### Gaps Summary

Two converted spec files (`phase31-canvassing.spec.ts` and `phase21-integration-polish.spec.ts`) pass the surface check of "no test.skip markers" but fail at a deeper level: they hardcode a personal Tailscale development URL (`https://dev.tailb56d83.ts.net:5173`) and a dev-specific campaign UUID. Every single test in both files calls `page.goto(${BASE}/...)` with this hardcoded URL, bypassing the `playwright.config.ts` `baseURL` configuration entirely.

The root cause is that these files were originally written for manual testing against a developer's Tailscale-tunneled dev environment and were never refactored to use Playwright's standard `page.goto("/...")` relative navigation pattern. When the CI `integration-e2e` job runs `npx playwright test`, these 15 tests (9 canvassing + 6 integration-polish) will attempt to connect to `dev.tailb56d83.ts.net:5173` which does not exist in the CI runner. They will time out and fail.

The fix requires removing the `BASE` constant and hardcoded `CAMPAIGN_ID`, replacing them with relative URL navigation (matching the pattern in `voter-search.spec.ts`, `turf-creation.spec.ts`, etc.) and dynamic campaign discovery from the UI. The hardcoded `login()` function should also be removed — these specs already run in the chromium project which loads stored auth state, so manual OIDC login is redundant and will conflict.

The 9 all-new Phase 46 specs (login, voter-search, voter-import, turf-creation, phone-bank, volunteer-signup, auth.setup) are fully correct and CI-ready. The `test_rls_api_smoke.py` integration tests and CI workflow are fully correct. Only the two pre-existing converted specs have this issue.

---

_Verified: 2026-03-24_
_Verifier: Claude (gsd-verifier)_
