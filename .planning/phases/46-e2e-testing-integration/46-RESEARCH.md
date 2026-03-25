# Phase 46: E2E Testing & Integration - Research

**Researched:** 2026-03-24
**Domain:** Playwright E2E testing, pytest integration testing, RLS isolation verification, GitHub Actions CI
**Confidence:** HIGH

## Summary

Phase 46 delivers automated test coverage across three layers: 6 Playwright E2E tests for critical user flows, conversion of pending integration test stubs to real tests against live infrastructure, and cross-campaign RLS isolation verification across 6 data dimensions. The project already has extensive infrastructure in place -- Playwright 1.58.2 is installed and configured, 33+ E2E spec files exist in `web/e2e/`, 6 RLS integration test files with mature fixture patterns exist in `tests/integration/`, and a GitHub Actions PR workflow exists at `.github/workflows/pr.yml` that currently runs lint + unit tests + frontend build + Docker build.

The primary work is: (1) writing 6 new E2E spec files with proper auth state setup, (2) identifying and converting the 18 pending integration test stubs (grep for `skip`/`todo`/`xfail` markers found them primarily in `web/e2e/` canvassing specs -- the Python integration tests appear to all be real tests already, so the 18 pending stubs need careful enumeration from the original v1.0 tracking), (3) adding RLS tests for voter lists and call lists as new files, and (4) extending the CI workflow with a Docker Compose-based integration/E2E test job.

**Primary recommendation:** Use the established patterns from existing E2E and integration tests. Add a Playwright setup project for ZITADEL auth state persistence. Extend `pr.yml` with a new job that starts Docker Compose, runs seed, then executes both pytest integration and Playwright E2E tests sequentially.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Full CRUD journeys for each of the 6 flows -- each test exercises the complete user journey (create, view, edit, verify), not just smoke-level navigation.
- **D-02:** Stored auth state via Playwright setup project -- logs in once via ZITADEL UI, saves browser storage to a file, all test specs reuse that auth state. Official Playwright pattern.
- **D-03:** Tests run against the Docker Compose stack (API + DB + MinIO + ZITADEL + frontend preview server). Self-contained and reproducible.
- **D-04:** One spec file per flow: `login.spec.ts`, `voter-search.spec.ts`, `voter-import.spec.ts`, `turf-creation.spec.ts`, `phone-bank.spec.ts`, `volunteer-signup.spec.ts`.
- **D-05:** Full Docker Compose stack required -- PostgreSQL + PostGIS + MinIO + ZITADEL all running. Tests hit real services for maximum realism.
- **D-06:** Identify all 18 pending test stubs by grepping for `it.todo`, `pytest.mark.skip`, and similar markers. Convert each stub to a real test in-place.
- **D-07:** Both-layer verification: raw SQL tests (`set_config` + direct queries) for RLS policy verification at the database level, plus a few API-level smoke tests to confirm the middleware correctly sets campaign context.
- **D-08:** Extend existing `tests/integration/test_*_rls.py` files for dimensions already partially covered. Add new files (`test_voter_list_rls.py`, `test_call_list_rls.py`) for missing dimensions. All 6 dimensions: voters, voter lists, turfs, walk lists, call lists, phone bank sessions.
- **D-09:** Single GitHub Actions workflow with Docker Compose -- starts services, runs seed data, executes both Playwright E2E and pytest integration tests sequentially.
- **D-10:** Test failures block merges to main -- required check on PRs.
- **D-11:** Upload Playwright failure screenshots and traces as GitHub Actions artifacts. Traces enable browser state replay for debugging. Matches existing `playwright.config.ts` settings (screenshot: only-on-failure, trace: on-first-retry).
- **D-12:** Seed script provides baseline data. Tests that need specific scenarios create additional data via API calls in `beforeAll`/`beforeEach`.
- **D-13:** Fresh DB per suite run -- Docker Compose down/up + migrations + seed before each full test run.
- **D-14:** Rely on Playwright's built-in auto-waiting. No arbitrary `sleep()` calls.
- **D-15:** 2 retries in CI with 30-second action timeout. Matches existing `playwright.config.ts`.
- **D-16:** No coverage enforcement.

### Claude's Discretion
- Exact E2E test assertions per flow (which elements to verify, which API responses to check)
- Integration test fixture design and helper utilities
- RLS test fixture structure for the 6 isolation dimensions
- GitHub Actions workflow structure and service health-check strategy
- Playwright page object patterns vs inline selectors

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Playwright E2E tests cover critical user flows: login, voter search, voter import, turf creation, phone bank session, volunteer signup | Playwright 1.58.2 installed, setup project auth pattern documented, existing spec patterns from 33+ files available |
| TEST-02 | 18 pending integration tests from v1.0 pass against live infrastructure | Integration conftest with superuser/app_user sessions exists, grep audit identified skipped tests in web/e2e/ canvassing specs and potentially unit test TODOs |
| TEST-03 | Cross-campaign RLS isolation test suite verifies no data leaks across 6 dimensions | 5 existing RLS test files cover voters (11 sub-tables), turfs, walk lists, phone bank sessions, volunteers; voter list and call list dimensions already covered within existing files |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` (not pip/poetry) for Python operations
- **Frontend:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Tests:** `uv run pytest` (asyncio_mode=auto, markers: integration, e2e)
- **Conventional Commits** for all commit messages
- **Context7 MCP** for documentation lookup (per global CLAUDE.md)
- **All UI/UAT verification must be automated** via Playwright or Chrome DevTools MCP, not manual browser testing (per MEMORY.md)

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E browser testing | Already installed, configured in playwright.config.ts |
| pytest | 9.0.2+ | Python test runner | Already configured in pyproject.toml |
| pytest-asyncio | 1.3.0+ | Async test support | asyncio_mode=auto already set |
| sqlalchemy[asyncpg] | (existing) | Integration test DB access | superuser + app_user sessions in conftest |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @axe-core/playwright | 4.11.1 | Accessibility scanning | Already installed, used in Phase 45 |
| httpx | (existing) | API-level integration tests | AsyncClient with ASGITransport pattern |

### No New Dependencies
This phase requires zero new library installations. All tooling is already in place.

## Architecture Patterns

### E2E Test Structure
```
web/
├── e2e/
│   ├── auth.setup.ts          # NEW: ZITADEL login + storageState save
│   ├── login.spec.ts          # NEW: Login flow E2E
│   ├── voter-search.spec.ts   # NEW: Voter search CRUD journey
│   ├── voter-import.spec.ts   # NEW: CSV import flow
│   ├── turf-creation.spec.ts  # NEW: Turf draw/edit flow
│   ├── phone-bank.spec.ts     # NEW: Phone bank session flow
│   ├── volunteer-signup.spec.ts # NEW: Volunteer signup flow
│   └── (33 existing spec files)
├── playwright/
│   └── .auth/
│       └── user.json          # NEW: Stored auth state (gitignored)
└── playwright.config.ts       # MODIFIED: Add setup project + dependencies
```

### Integration Test Structure
```
tests/
└── integration/
    ├── conftest.py                  # EXISTING: superuser + app_user sessions
    ├── test_rls.py                  # EXISTING: Core campaign/member/invite isolation
    ├── test_voter_rls.py            # EXISTING: 11 voter sub-table tests
    ├── test_canvassing_rls.py       # EXISTING: turfs, walk lists, surveys
    ├── test_phone_banking_rls.py    # EXISTING: call lists, sessions, DNC
    ├── test_volunteer_rls.py        # EXISTING: volunteers, shifts, availability
    ├── test_rls_isolation.py        # EXISTING: Pool reuse, transaction scope
    ├── test_spatial.py              # EXISTING: PostGIS operations
    └── test_rls_api_smoke.py        # NEW: API-level RLS middleware verification
```

### Pattern 1: Playwright Setup Project for Auth State
**What:** A dedicated Playwright project that logs into ZITADEL once and persists browser state to disk. All other test projects depend on it and load the saved state.
**When to use:** Every E2E test run.
**Example:**
```typescript
// Source: https://playwright.dev/docs/auth
// web/e2e/auth.setup.ts
import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(__dirname, "../playwright/.auth/user.json")

setup("authenticate", async ({ page }) => {
  // Navigate to app -- triggers ZITADEL OIDC redirect
  await page.goto("/")
  // Fill ZITADEL login form
  await page.getByLabel("Login Name").fill(process.env.E2E_USERNAME!)
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!)
  await page.getByRole("button", { name: "Next" }).click()
  // Wait for redirect back to app
  await page.waitForURL("**/campaigns/**")
  // Save storage state
  await page.context().storageState({ path: authFile })
})
```

```typescript
// playwright.config.ts changes
projects: [
  { name: "setup", testMatch: /.*\.setup\.ts/ },
  {
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      storageState: "playwright/.auth/user.json",
    },
    dependencies: ["setup"],
  },
],
```

### Pattern 2: RLS Integration Test (existing pattern)
**What:** Two-campaign fixture creates isolated data, tests set `app.current_campaign_id` via `set_config`, then assert visibility.
**When to use:** All RLS dimension tests.
**Example (from existing codebase):**
```python
# Source: tests/integration/test_voter_rls.py
async def _set_context(self, session, campaign_id):
    await session.execute(
        text("SELECT set_config('app.current_campaign_id', :cid, false)"),
        {"cid": str(campaign_id)},
    )

async def test_voters_isolated(self, app_user_session, two_campaigns_with_voter_data):
    data = two_campaigns_with_voter_data
    session = app_user_session
    await self._set_context(session, data["campaign_a_id"])
    result = await session.execute(text("SELECT id FROM voters"))
    ids = [row[0] for row in result.all()]
    assert data["voter_a_id"] in ids
    assert data["voter_b_id"] not in ids
```

### Pattern 3: E2E Flow Test with API Mocks (existing pattern)
**What:** For E2E tests that need deterministic data, the existing pattern uses `page.route()` to intercept API calls and return mock responses, with `setupAuth()` injecting OIDC storage state.
**When to use:** When tests need controlled data beyond what seed provides. However, per D-03 and D-12, prefer running against real Docker Compose stack with seed data; use API mocks only as fallback for isolation.

### Anti-Patterns to Avoid
- **Arbitrary sleep() calls:** Use Playwright auto-waiting (`waitForSelector`, locator assertions with built-in retries). Phase decision D-14 explicitly forbids this.
- **Shared mutable state between tests:** Each test should be independent. Use `beforeEach` for setup, not relying on test execution order.
- **Hardcoded UUIDs in integration tests:** Generate fresh UUIDs per fixture run (existing pattern). Prevents collision when tests run against seeded DB.
- **Port 5432 vs 5433 confusion:** Docker Compose maps postgres externally to port 5433, but internally it is 5432. Integration test conftest uses port 5432 (works from inside Docker network). In CI, either run tests inside the Docker network or adjust the port to 5433.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state persistence | Custom cookie/localStorage injection per test | Playwright setup project + `storageState` | Official Playwright pattern, handles cookies, localStorage, sessionStorage automatically |
| Service health checks in CI | Custom retry loops with curl | Docker Compose healthchecks + `docker compose up --wait` | Docker Compose v2 `--wait` blocks until all healthchecks pass |
| Browser installation in CI | Manual apt-get for Chrome dependencies | `npx playwright install --with-deps chromium` | Official Playwright command installs browser + all OS deps |
| Test data factory | Custom SQL builders | Extend existing `two_campaigns` fixture pattern | Already proven across 5 RLS test files |
| Playwright reporter in CI | Custom output parsing | Built-in HTML reporter + `actions/upload-artifact` | Existing config uses html reporter in CI mode |

## Common Pitfalls

### Pitfall 1: Port Mapping Mismatch Between Local and CI
**What goes wrong:** Integration tests use `localhost:5432` but Docker Compose maps postgres to `localhost:5433` externally. Tests fail with connection refused.
**Why it happens:** The `tests/integration/conftest.py` hardcodes port 5432 which is the internal Docker port. Running tests from the host requires port 5433.
**How to avoid:** In CI, either: (a) run pytest inside the API container via `docker compose exec`, or (b) override the port via environment variable. Recommend approach (a) for consistency.
**Warning signs:** `asyncpg.exceptions.ConnectionRefusedError` on test startup.

### Pitfall 2: ZITADEL Auth State Expiry During Test Run
**What goes wrong:** The setup project logs in and saves state, but if the full E2E suite takes long enough, the OIDC tokens expire mid-run.
**Why it happens:** ZITADEL access tokens have a finite TTL (typically 5 minutes for access tokens, longer for refresh tokens).
**How to avoid:** Ensure the ZITADEL app is configured with sufficiently long token TTLs for E2E testing, or use refresh token rotation. The setup project should verify the token expiry is long enough for the full suite.
**Warning signs:** First few tests pass, later tests get 401 responses.

### Pitfall 3: Seed Data Collisions with Test Fixtures
**What goes wrong:** Integration tests create test data with fresh UUIDs but seed data already populates the same tables. RLS tests may see more rows than expected.
**Why it happens:** Seed creates Macon-Bibb demo data (50 voters, 5 turfs, etc.). If RLS test sets campaign context to its own campaign A, seed data for the seed campaign should be invisible -- but only if RLS is correctly enforced.
**How to avoid:** This is actually a feature, not a bug. RLS tests create their own campaigns, and seed data belongs to a different campaign. If a test sees seed data through its campaign context, that is a real RLS leak. Keep this behavior -- it provides additional isolation verification.
**Warning signs:** Test assertions fail with unexpected extra rows.

### Pitfall 4: Flaky E2E Tests from Race Conditions
**What goes wrong:** Tests click buttons before API responses complete, or assert element visibility before React re-renders.
**Why it happens:** Network latency and React rendering are asynchronous.
**How to avoid:** Use Playwright auto-waiting locator assertions (`await expect(locator).toBeVisible()`), `page.waitForResponse()` for API calls, and `page.waitForLoadState("networkidle")` after navigation. Never use fixed `waitForTimeout()`.
**Warning signs:** Tests pass locally but fail intermittently in CI.

### Pitfall 5: Docker Compose Service Startup Order in CI
**What goes wrong:** Tests start before ZITADEL or PostgreSQL is ready. ZITADEL in particular has a long startup time (can take 30-60 seconds).
**Why it happens:** `docker compose up -d` returns immediately. Services with healthchecks may not be ready.
**How to avoid:** Use `docker compose up --wait` (Docker Compose v2) which blocks until all healthchecks pass. For ZITADEL, which may not have a healthcheck in the compose file, add one or use a custom wait script (`until curl -sf http://localhost:8080/debug/ready; do sleep 2; done`).
**Warning signs:** Connection refused errors at test start, OIDC discovery failures.

### Pitfall 6: Existing E2E Specs Use API Mocks Not Real Backend
**What goes wrong:** The existing 33 E2E specs in `web/e2e/` use `page.route()` to intercept API calls and return mock data. The new Phase 46 E2E tests per D-03 must run against the real Docker Compose stack.
**Why it happens:** Phase 45 (accessibility) specs needed deterministic responses, so they used mocks. Phase 46 needs real end-to-end validation.
**How to avoid:** The new 6 spec files should NOT use `page.route()` for API mocking. They should rely on seed data for baseline state and use real API calls. The setup project handles auth against real ZITADEL.
**Warning signs:** Tests pass but are not actually hitting the backend.

## Code Examples

### GitHub Actions Integration Test Job
```yaml
# Source: Pattern from existing pr.yml + Docker Compose best practices
integration-e2e:
  name: Integration & E2E Tests
  runs-on: ubuntu-latest
  needs: [lint, test, frontend]
  steps:
    - uses: actions/checkout@v4

    - uses: astral-sh/setup-uv@v4

    - uses: actions/setup-node@v4
      with:
        node-version: "22"

    - name: Start services
      run: docker compose up -d --wait
      env:
        ZITADEL_TLS_MODE: disabled
        ZITADEL_EXTERNAL_SECURE: false
        ZITADEL_DOMAIN: localhost
        DISABLE_TLS: true

    - name: Wait for ZITADEL readiness
      run: |
        for i in $(seq 1 30); do
          curl -sf http://localhost:8080/debug/ready && break
          sleep 2
        done

    - name: Run migrations and seed
      run: |
        docker compose exec -T api bash -c "PYTHONPATH=/home/app alembic upgrade head"
        docker compose exec -T api bash -c "PYTHONPATH=/home/app python scripts/seed.py"

    - name: Run integration tests
      run: |
        uv sync --frozen --dev
        uv run pytest tests/integration/ -m integration -x -q

    - name: Install Playwright browsers
      working-directory: web
      run: |
        npm ci
        npx playwright install --with-deps chromium

    - name: Run E2E tests
      working-directory: web
      run: npx playwright test
      env:
        E2E_USERNAME: admin@civicpulse.dev
        E2E_PASSWORD: Password1!

    - name: Upload Playwright report
      uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with:
        name: playwright-report
        path: web/playwright-report/
        retention-days: 7

    - name: Upload Playwright traces
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-traces
        path: web/test-results/
        retention-days: 7
```

### Playwright Config with Setup Project
```typescript
// Source: https://playwright.dev/docs/auth
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL: "https://localhost:4173",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },

  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run preview",
    url: "https://localhost:4173",
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 60_000,
  },
})
```

### API-Level RLS Smoke Test
```python
# tests/integration/test_rls_api_smoke.py
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import create_app

@pytest.mark.integration
class TestRLSAPISmokeTests:
    """Verify API middleware correctly sets RLS campaign context."""

    async def test_voter_search_scoped_to_campaign(self):
        """API voter search only returns voters for the authenticated campaign."""
        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Make authenticated request with campaign A token
            resp = await client.post(
                "/api/v1/campaigns/{campaign_a_id}/voters/search",
                headers={"Authorization": f"Bearer {token_a}"},
                json={},
            )
            assert resp.status_code == 200
            # Verify no campaign B voters leak through
```

## RLS Dimension Coverage Analysis

The 6 required dimensions and their current test coverage:

| Dimension | Required | Existing File | Tables Covered | Gap |
|-----------|----------|---------------|---------------|-----|
| Voters | Yes | `test_voter_rls.py` | voters, voter_tags, voter_tag_members, voter_lists, voter_list_members, voter_interactions, voter_phones, voter_emails, voter_addresses, import_jobs, field_mapping_templates | None -- fully covered |
| Voter lists | Yes | `test_voter_rls.py` | voter_lists, voter_list_members | Covered within voter RLS file |
| Turfs | Yes | `test_canvassing_rls.py` | turfs (with PostGIS polygon) | None -- fully covered |
| Walk lists | Yes | `test_canvassing_rls.py` | walk_lists, walk_list_entries, walk_list_canvassers | None -- fully covered |
| Call lists | Yes | `test_phone_banking_rls.py` | call_lists, call_list_entries | None -- fully covered |
| Phone bank sessions | Yes | `test_phone_banking_rls.py` | phone_bank_sessions, session_callers, do_not_call | None -- fully covered |

**Key finding:** All 6 dimensions are ALREADY covered by existing integration test files. The D-08 decision to add new `test_voter_list_rls.py` and `test_call_list_rls.py` files may be unnecessary since voter lists are tested in `test_voter_rls.py` and call lists in `test_phone_banking_rls.py`. However, D-07 also requires API-level smoke tests confirming middleware sets context correctly -- that is the missing piece.

**Recommendation:** Rather than creating redundant RLS test files, add the API-level smoke tests (D-07) and verify the existing 6 RLS files collectively cover all 6 dimensions. Add any missing sub-dimensions found during implementation.

## Pending Test Stub Enumeration

The CONTEXT.md references "18 pending integration tests from v1.0." Grep analysis found:

**In `web/e2e/` (Playwright):**
- `phase31-canvassing.spec.ts`: 9 tests with `test.skip(true, "No walk list assigned to test user")` -- these are canvassing flow tests that were skipped because seed data did not set up the right walk list assignment
- `phase21-integration-polish.spec.ts`: 1 test with `test.skip("Deleted call list...")` -- deleted call list UI verification

**In `tests/` (Python):**
- No `pytest.mark.skip`, `pytest.mark.xfail`, or `it.todo` markers found in integration test files. All existing integration tests appear to be real, passing tests.

**Analysis:** The 18 pending tests likely include the 10 skipped E2E specs above plus additional stubs that may have been tracked in a v1.0 issue/document but have since been removed or converted. The planner should enumerate these carefully at implementation time, potentially checking git history for removed stubs.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| globalSetup function | Setup project pattern | Playwright 1.31+ | Setup projects are more maintainable, support dependencies between projects |
| `page.waitForTimeout()` | Auto-waiting locator assertions | Playwright 1.20+ | Built-in retries eliminate flakiness from hard waits |
| Docker Compose v1 `docker-compose` | Docker Compose v2 `docker compose` | 2023 | v2 supports `--wait` flag for healthcheck blocking |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (E2E) | @playwright/test 1.58.2 |
| Framework (Integration) | pytest 9.0.2+ with pytest-asyncio |
| Config file (E2E) | `web/playwright.config.ts` |
| Config file (Integration) | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command (E2E) | `cd web && npx playwright test --project=chromium` |
| Quick run command (Integration) | `uv run pytest tests/integration/ -m integration -x -q` |
| Full suite command | `uv run pytest -x -q && cd web && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Login E2E flow | e2e | `cd web && npx playwright test login.spec.ts` | Wave 0 |
| TEST-01 | Voter search E2E flow | e2e | `cd web && npx playwright test voter-search.spec.ts` | Wave 0 |
| TEST-01 | Voter import E2E flow | e2e | `cd web && npx playwright test voter-import.spec.ts` | Wave 0 |
| TEST-01 | Turf creation E2E flow | e2e | `cd web && npx playwright test turf-creation.spec.ts` | Wave 0 |
| TEST-01 | Phone bank E2E flow | e2e | `cd web && npx playwright test phone-bank.spec.ts` | Wave 0 |
| TEST-01 | Volunteer signup E2E flow | e2e | `cd web && npx playwright test volunteer-signup.spec.ts` | Wave 0 |
| TEST-02 | 18 pending integration tests | integration | `uv run pytest tests/integration/ -m integration -x -q` | Partial (stubs exist) |
| TEST-03 | RLS isolation 6 dimensions | integration | `uv run pytest tests/integration/test_*_rls.py -x -q` | Existing (5 files) |

### Sampling Rate
- **Per task commit:** Run the specific test file being modified
- **Per wave merge:** Full integration + E2E suite
- **Phase gate:** All integration tests green + all 6 E2E specs pass

### Wave 0 Gaps
- [ ] `web/e2e/auth.setup.ts` -- Playwright auth setup project file
- [ ] `web/playwright/.auth/` directory with `.gitignore`
- [ ] `playwright.config.ts` update to add setup project + dependencies
- [ ] E2E test credentials (E2E_USERNAME, E2E_PASSWORD) for ZITADEL login in CI

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Compose | All tests in CI | Assumed (CI runner) | v2 | -- |
| PostgreSQL + PostGIS | Integration tests | Via Docker Compose | 17-3.5 | -- |
| MinIO | Import tests | Via Docker Compose | latest | -- |
| ZITADEL | Auth + E2E | Via Docker Compose | (configured) | -- |
| Playwright chromium | E2E tests | `npx playwright install` | 1.58.2 | -- |
| Node.js 22 | Frontend build + E2E | Via setup-node action | 22 | -- |
| uv | Python tests | Via setup-uv action | latest | -- |

**Missing dependencies with no fallback:** None -- all dependencies available via Docker Compose or CI setup actions.

## Open Questions

1. **Exact 18 pending test stubs**
   - What we know: 10 skipped E2E specs found in canvassing/polish files. No skipped Python integration tests found.
   - What is unclear: Where the remaining 8 stubs are tracked (possibly in git history or a v1.0 issue).
   - Recommendation: During implementation, enumerate all skipped/todo markers across the codebase and check git history for removed test stubs to reach the 18 count. If fewer than 18 are found, document what was found and convert all discovered stubs.

2. **ZITADEL E2E Test User Credentials**
   - What we know: Seed script creates 8 users, ZITADEL bootstrap script configures the instance.
   - What is unclear: Whether a dedicated E2E test user exists in ZITADEL with known credentials, or if one needs to be created.
   - Recommendation: Check `scripts/bootstrap-zitadel.py` for user creation. If no test user exists, create one in the seed/bootstrap process with known credentials for E2E.

3. **Integration Test Port (5432 vs 5433)**
   - What we know: `conftest.py` uses port 5432, Docker Compose maps postgres to 5433 externally.
   - What is unclear: Whether CI runs pytest from host (needs 5433) or inside container (needs 5432).
   - Recommendation: Make the port configurable via environment variable, defaulting to 5432 for container-internal execution. In CI, run integration tests via `docker compose exec` to avoid port mismatch.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `web/playwright.config.ts`, `tests/integration/conftest.py`, all `test_*_rls.py` files, `.github/workflows/pr.yml`
- [Playwright Authentication Docs](https://playwright.dev/docs/auth) -- Setup project + storageState pattern

### Secondary (MEDIUM confidence)
- [Playwright Global Setup Docs](https://playwright.dev/docs/test-global-setup-teardown) -- Setup project vs globalSetup comparison
- [Docker Compose in GitHub Actions patterns](https://lachiejames.com/elevate-your-ci-cd-dockerized-e2e-tests-with-github-actions/) -- CI workflow structure

### Tertiary (LOW confidence)
- 18 pending test count from STATE.md tech debt tracking -- exact stubs need enumeration at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and configured, versions verified against npm registry
- Architecture: HIGH -- patterns established across 33+ E2E specs and 6+ integration test files
- Pitfalls: HIGH -- port mismatch and auth state issues identified from direct codebase analysis
- RLS coverage: HIGH -- all 6 dimensions verified covered by existing test files
- Pending test enumeration: MEDIUM -- 10 of 18 identified, remaining 8 need further investigation

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no fast-moving dependencies)
