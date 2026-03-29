# Technology Stack

**Project:** CivicPulse Run v1.7 Testing & Validation
**Researched:** 2026-03-29

## Existing Stack (DO NOT CHANGE)

Already validated and in production. Listed for reference only.

| Technology | Version | Purpose |
|------------|---------|---------|
| @playwright/test | ^1.58.2 | E2E test framework |
| @axe-core/playwright | ^4.11.1 | Accessibility testing |
| Vitest | ^4.0.18 | Unit/component tests |
| pytest | ^9.0.2 | Backend unit/integration tests |
| pytest-asyncio | ^1.3.0 | Async test support |
| Docker Compose | (system) | Local dev environment |
| ZITADEL | v2.71.6 | OIDC auth (Docker image) |
| httpx | ^0.28.1 | ZITADEL API calls from scripts |
| psycopg2-binary | ^2.9.11 | Sync DB access from scripts |

## New Stack Additions

### Nothing to add. Zero new packages.

The testing plan requires no new libraries. Every capability needed is already present in the codebase. Here is the reasoning for each concern area:

### ZITADEL Test User Provisioning

**Recommendation:** Extend existing `scripts/create-e2e-users.py`, do NOT add any new packages.

**Why:** The script already exists and uses the exact pattern needed:
- ZITADEL Management API v1 (`POST /management/v1/users/human`) for user creation
- httpx for HTTP calls (already a project dependency)
- psycopg2 for direct DB org membership insertion (already a project dependency)
- Reads PAT from `/zitadel-data/pat.txt` (same as bootstrap script)
- Handles idempotency via `find_user_by_username` + `allow_conflict=True`

The current script creates 2 users (orgadmin, volunteer). The testing plan needs 15 users across 5 roles. This is purely a data expansion of the existing `E2E_USERS` list -- same API calls, same auth flow, same DB insertion pattern.

**ZITADEL API choice:** Use Management API v1 (`/management/v1/users/human`), NOT the v2 API. Rationale:
1. The existing bootstrap and user creation scripts already use v1 exclusively
2. v1's `password` field accepts plaintext; v2's `hashedPassword` requires pre-hashing
3. v1's `isEmailVerified` + `passwordChangeRequired: false` produces immediately-loginable users
4. The v2 `POST /v2/users/human` is itself already deprecated in favor of a newer CreateUser endpoint -- no benefit to migrating
5. ZITADEL v2.71.6 fully supports v1 management APIs

**Confidence:** HIGH -- verified against existing working code in `scripts/create-e2e-users.py` and ZITADEL v1 API documentation.

### Playwright E2E Test Suite (~130 test cases)

**Recommendation:** Use existing @playwright/test ^1.58.2 and existing project configuration. No new packages.

**Why the existing setup covers every testing plan requirement:**

| Requirement | Already Available |
|-------------|-------------------|
| Multi-role auth | 3 setup projects (auth.setup.ts, auth-orgadmin.setup.ts, auth-volunteer.setup.ts) with per-role storageState files |
| Serial test ordering | `test.describe.serial()` already used in connected-journey.spec.ts |
| Accessibility testing | @axe-core/playwright already installed, axe-test.ts fixture exists |
| File upload testing | `page.locator('input[type="file"]').setInputFiles()` used in voter-import.spec.ts |
| Network condition simulation | Playwright's `page.route()` for offline simulation used in phase33-offline-sync.spec.ts |
| Screenshot on failure | `screenshot: "only-on-failure"` already configured |
| Trace collection | `trace: "on-first-retry"` already configured |
| CI integration | GitHub Actions workflow with Playwright already wired |
| HTML reporting | `reporter: process.env.CI ? "html" : "list"` already configured |

**New auth setup files needed:** Expand from 3 to 5+ setup projects to cover all 5 roles (owner, admin, manager, volunteer, viewer). This is configuration changes to `playwright.config.ts`, not new packages.

**Confidence:** HIGH -- verified against existing codebase files.

### Feature Builds (Note CRUD, Walk List Rename)

**Recommendation:** No new backend or frontend packages needed.

| Feature | Backend | Frontend |
|---------|---------|----------|
| Voter note edit | PATCH endpoint using existing SQLAlchemy patterns | Existing react-hook-form + zod + shadcn/ui Sheet pattern |
| Voter note delete | DELETE endpoint using existing patterns | Existing ConfirmDialog component |
| Walk list rename | PATCH endpoint already exists | Existing inline-edit or Dialog pattern from survey/campaign edit |

**Confidence:** HIGH -- these are simple CRUD additions following established patterns.

### AI-Driven Production Testing Instructions

**Recommendation:** Plain markdown documentation, no tooling.

The testing plan explicitly describes this as human-readable or AI-agent-readable test instructions. No test runner, no package, no framework. This is a documentation deliverable that describes manual steps an AI agent (or human) follows against the production environment.

**Confidence:** HIGH -- explicitly scoped in the testing plan.

## Alternatives Considered and Rejected

| Category | Rejected Option | Why Not |
|----------|-----------------|---------|
| Test user provisioning | ZITADEL v2 User Service API | v2 requires password hashing, and the endpoint itself is already deprecated; v1 works, is simpler, and matches existing code |
| Test user provisioning | Manual ZITADEL Console creation | 15 users with project roles + org membership = tedious, error-prone, not reproducible |
| Test user provisioning | ZITADEL Terraform provider | Massive new dependency for what's 40 lines of Python API calls |
| E2E framework | Cypress | Playwright already has 51 spec files, 3 auth projects, CI integration. Migration cost is huge for zero benefit |
| E2E framework | Playwright Test Agent (AI-driven) | Available in Playwright 1.58 but requires OpenAI/Anthropic API key at runtime. Overkill for deterministic UI tests where we control the selectors |
| API testing | Postman/Newman | pytest already covers API testing; adding a second API test runner creates maintenance burden |
| Visual regression | Percy / Chromatic | Not requested in the testing plan. Premature for current phase |
| Code coverage | Istanbul/c8 for Playwright | @vitest/coverage-v8 already handles unit coverage. E2E coverage tooling adds complexity with marginal signal |
| Fixture management | playwright-fixtures (npm) | Playwright's built-in `test.extend<T>()` fixture system is sufficient. Already used for axe-test.ts |
| Test data management | Factory libraries (fishery, etc.) | Test data is deterministic (seed script + E2E users). No need for random generation |
| bcrypt hashing library | For ZITADEL v2 API | Avoided by using v1 API which accepts plaintext passwords |

## Configuration Changes (Not New Packages)

These are changes to existing configuration files, not new dependencies:

### playwright.config.ts

Expand from 3 auth projects to 5+ to cover the testing plan's role requirements:

```typescript
// Current: setup, setup-orgadmin, setup-volunteer (3 roles)
// Needed:  setup-owner, setup-admin, setup-manager, setup-volunteer, setup-viewer (5 roles)
// The owner setup replaces the current "setup" project (admin@localhost -> owner1)
// org_owner and org_admin use the same users as owner and admin with added org roles
```

### scripts/create-e2e-users.py

Expand `E2E_USERS` list from 2 entries to 15 entries per the testing plan table (Section 1.2). Same API pattern, same code structure. Each entry needs:

```python
{
    "userName": "owner1@test.civicpulse.local",
    "password": "E2eOwner1!",
    "firstName": "Test Owner",
    "lastName": "1",
    "email": "owner1@test.civicpulse.local",
    "projectRole": "owner",
    "orgRole": "org_owner",  # or None for non-org roles
}
```

### .github/workflows/pr.yml

Add environment variables for new test user credentials:

```yaml
env:
  E2E_OWNER_USERNAME: owner1@test.civicpulse.local
  E2E_OWNER_PASSWORD: "E2eOwner1!"
  E2E_ADMIN_USERNAME: admin1@test.civicpulse.local
  E2E_ADMIN_PASSWORD: "E2eAdmin1!"
  E2E_MANAGER_USERNAME: manager1@test.civicpulse.local
  E2E_MANAGER_PASSWORD: "E2eManager1!"
  E2E_VOLUNTEER_USERNAME: volunteer1@test.civicpulse.local
  E2E_VOLUNTEER_PASSWORD: "E2eVolunteer1!"
  E2E_VIEWER_USERNAME: viewer1@test.civicpulse.local
  E2E_VIEWER_PASSWORD: "E2eViewer1!"
```

## Installation

No new packages to install. The complete test stack is already present:

```bash
# Frontend (already installed)
cd web && npm ci
npx playwright install --with-deps chromium

# Backend (already installed)
uv sync --frozen --dev
```

## Key Integration Points

### Auth Setup <-> User Provisioning

The provisioning script creates users in ZITADEL. The auth setup files log in through the OIDC flow and save browser state. These must stay synchronized:

1. `create-e2e-users.py` creates user with username + password + project role
2. `auth-{role}.setup.ts` reads `E2E_{ROLE}_USERNAME` / `E2E_{ROLE}_PASSWORD` from env
3. `playwright.config.ts` maps setup projects to storageState files
4. Test spec files use `testMatch` patterns to route to correct auth project

### Seed Data <-> Test Assertions

The testing plan's data validation tests (VAL-01, VAL-02) assert against the seed CSV (`data/example-2026-02-24.csv`). Tests must NOT rely on hardcoded voter data -- they should read from the CSV or use known seed patterns.

### Serial vs Parallel Execution

Most test sections (AUTH, RBAC, ORG, CAMP, etc.) can run in parallel across Playwright workers. Within a section, some tests are sequential (create then validate then delete). Use `test.describe.serial()` for these sequences. The existing connected-journey.spec.ts already demonstrates this pattern.

## Sources

- [ZITADEL Management v1 ImportHumanUser](https://zitadel.com/docs/reference/api/management/zitadel.management.v1.ManagementService.ImportHumanUser)
- [ZITADEL User Service v2 CreateUser](https://zitadel.com/docs/apis/resources/user_service_v2/user-service-create-user) (deprecated, not recommended)
- [ZITADEL Register and Create User Guide](https://zitadel.com/docs/guides/manage/user/reg-create-user)
- [Playwright Authentication Docs](https://playwright.dev/docs/auth)
- [Playwright Release Notes](https://playwright.dev/docs/release-notes)
- [Playwright Fixtures Docs](https://playwright.dev/docs/test-fixtures)
- [Playwright Parallelism Docs](https://playwright.dev/docs/test-parallel)
- Existing codebase: `scripts/create-e2e-users.py`, `web/e2e/auth.setup.ts`, `web/playwright.config.ts`
