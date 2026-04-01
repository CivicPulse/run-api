# Phase 57: Test Infrastructure - Research

**Researched:** 2026-03-29
**Domain:** Playwright multi-role auth, ZITADEL user provisioning, CI sharding
**Confidence:** HIGH

## Summary

Phase 57 builds the test infrastructure foundation that phases 58-60 depend on. Three distinct deliverables: (1) expand `create-e2e-users.py` from 2 to 15 ZITADEL users across 5 campaign roles, (2) restructure Playwright config from 3 auth projects to 5 role-based projects with filename-suffix routing, and (3) add CI sharding with merged HTML reports. All three have well-established patterns and the existing codebase already demonstrates the core techniques.

The existing `create-e2e-users.py` has battle-tested helpers for ZITADEL user creation, project role grants, and org membership inserts via direct SQL. The expansion to 15 users is straightforward data growth. The Playwright config already uses filename-based routing (`testMatch` regex) and per-project `storageState` files. Adding two more roles (manager, viewer) follows the identical pattern. CI sharding uses Playwright's built-in `--shard N/M` flag with GitHub Actions matrix strategy and `merge-reports` CLI -- well-documented with official examples.

**Primary recommendation:** Expand in-place, reusing all existing patterns. No new libraries, no architectural changes. Pure configuration and data growth.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Email domain is `@localhost` for all test users (e.g., `owner1@localhost`, `admin1@localhost`)
- **D-02:** Passwords follow role-based pattern: `Owner1234!`, `Admin1234!`, `Manager1234!`, `Volunteer1234!`, `Viewer1234!`
- **D-03:** Provisioning script assigns full membership -- ZITADEL user creation, project role grant, org membership, AND campaign membership to the seed campaign
- **D-04:** `admin@localhost` (ZITADEL instance admin from bootstrap) stays separate. The 15 E2E test users are entirely new accounts
- **D-05:** Filename suffix convention: `.owner.spec.ts`, `.admin.spec.ts`, `.manager.spec.ts`, `.volunteer.spec.ts`, `.viewer.spec.ts`. Unsuffixed specs run as owner
- **D-06:** Owner is the default (no suffix) auth context, replacing `admin@localhost` as default project user
- **D-07:** Existing 51 E2E specs migrated to new auth structure. 3 existing auth setup files become 5 role-based setups. One unified auth system
- **D-08:** Playwright `--shard N/M` with GitHub Actions matrix strategy. 4 shards for ~130 specs
- **D-09:** Merged HTML report using `merge-reports` CLI after all shards complete. One combined report artifact
- **D-10:** Expand existing `create-e2e-users.py` in-place from 2 to 15 users. Same ZITADEL API patterns
- **D-11:** All 15 users assigned to seed campaign (Macon-Bibb demo)

### Claude's Discretion
- Auth setup file structure (separate files per role vs. consolidated)
- Exact username format (e.g., `owner1@localhost` vs `test-owner-1@localhost`)
- How campaign_members rows are inserted (direct SQL vs API)
- Shard merge job implementation details

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Provisioning script creates 15 ZITADEL test users (3 per role) with verified emails and no password change required | Existing `create-e2e-users.py` has all needed helpers: `create_human_user()`, `grant_project_role()`, `ensure_org_membership()`. Expand `E2E_USERS` list from 2 to 15. Add campaign membership via direct SQL (same pattern as `ensure_org_membership()`). |
| INFRA-02 | Playwright config has 5+ auth projects with per-role storageState files | Current config already demonstrates the pattern with 3 projects. Add `manager` and `viewer` projects. Change default from `admin@localhost` to `owner1@localhost`. Update `testMatch` regex patterns. |
| INFRA-03 | CI workflow runs expanded E2E suite with appropriate sharding | Use `--shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}` with 4-shard matrix. Blob reporter for CI. `merge-reports` CLI in separate job. `actions/download-artifact@v4` with `pattern` + `merge-multiple`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Python:** Always use `uv` for all Python operations. Never use system python.
- **Linting:** Always lint with `uv run ruff check .` and `uv run ruff format .` before commits.
- **Git:** Use Conventional Commits. Commit after each task. Never push unless requested.
- **Testing:** `uv run pytest` with asyncio_mode=auto, markers: integration, e2e.
- **Package management:** `uv add` / `uv add --dev` for Python packages. `npm ci` for frontend.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E testing framework | Already installed, latest stable |
| httpx | (existing) | ZITADEL API calls in provisioning script | Already used in create-e2e-users.py |
| psycopg2 | (existing) | Direct SQL for campaign membership | Already used in create-e2e-users.py |

### CI Actions
| Action | Version | Purpose | When to Use |
|--------|---------|---------|-------------|
| actions/upload-artifact | v4 | Upload blob reports per shard | After each shard test run |
| actions/download-artifact | v4 | Download all blob reports for merge | In merge-reports job |
| actions/setup-node | v4 | Node.js 22 for Playwright | In shard jobs and merge job |

### No New Dependencies
This phase requires zero new packages. Everything is already installed:
- Playwright 1.58.2 with built-in sharding (`--shard`) and blob reporter
- `create-e2e-users.py` already has httpx + psycopg2 for ZITADEL + DB operations
- GitHub Actions v4 artifacts already in use

## Architecture Patterns

### ZITADEL User Provisioning (INFRA-01)

The existing `create-e2e-users.py` establishes the complete pattern. Each of the 15 users needs:

1. **ZITADEL human user creation** via `POST /management/v1/users/human` with `passwordChangeRequired: false` and `isEmailVerified: true`
2. **Project role grant** via `POST /management/v1/users/{userId}/grants` with matching campaign role
3. **Org membership** (for owner and admin roles only) via direct SQL insert to `organization_members` table
4. **Campaign membership** via direct SQL insert to `campaign_members` table with explicit `role` column set

#### User Definition Structure
```python
E2E_USERS = [
    {
        "userName": "owner1@localhost",
        "password": "Owner1234!",
        "firstName": "Test",
        "lastName": "Owner1",
        "email": "owner1@localhost",
        "projectRole": "owner",         # ZITADEL project role key
        "orgRole": "org_owner",          # organization_members.role (or None)
        "campaignRole": "owner",         # campaign_members.role
    },
    # ... 14 more entries
]
```

#### Role-to-Membership Mapping
| Campaign Role | ZITADEL Project Role | Org Membership Role | Campaign Membership Role |
|---------------|---------------------|---------------------|--------------------------|
| owner | `owner` | `org_owner` | `owner` |
| admin | `admin` | `org_admin` | `admin` |
| manager | `manager` | None | `manager` |
| volunteer | `volunteer` | None | `volunteer` |
| viewer | `viewer` | None | `viewer` |

**Critical detail:** The `campaign_members.role` column must be explicitly set. The current seed script creates members with `role=NULL` (inheriting from JWT), but E2E test users need explicit per-campaign roles to ensure deterministic behavior regardless of ZITADEL JWT resolution order.

**Critical detail:** Only `org_owner` and `org_admin` are valid values for `organization_members.role` (enforced by check constraint `ck_organization_members_role_valid`). Manager, volunteer, and viewer users get no org membership row.

#### Campaign Membership Insert Pattern
```python
def ensure_campaign_membership(
    user_zitadel_id: str, campaign_role: str
) -> None:
    """Insert campaign_members row with explicit role."""
    # Same psycopg2 pattern as ensure_org_membership()
    cur.execute(
        """
        INSERT INTO campaign_members (id, user_id, campaign_id, role)
        VALUES (gen_random_uuid(), %s, (SELECT id FROM campaigns LIMIT 1), %s)
        ON CONFLICT ON CONSTRAINT uq_user_campaign DO UPDATE
        SET role = EXCLUDED.role
        """,
        (user_zitadel_id, campaign_role),
    )
```

### Playwright Auth Structure (INFRA-02)

#### Recommended: Separate Setup Files per Role
Create 5 setup files following the existing pattern exactly:

```
web/e2e/
  auth-owner.setup.ts      # owner1@localhost -> playwright/.auth/owner.json
  auth-admin.setup.ts       # admin1@localhost -> playwright/.auth/admin.json
  auth-manager.setup.ts     # manager1@localhost -> playwright/.auth/manager.json
  auth-volunteer.setup.ts   # volunteer1@localhost -> playwright/.auth/volunteer.json (update existing)
  auth-viewer.setup.ts      # viewer1@localhost -> playwright/.auth/viewer.json
```

**Rationale for separate files (vs. consolidated):** The existing codebase uses separate files. Each file is ~40 lines. The pattern is proven and debuggable -- if one role's auth fails, only that setup file needs attention. Consolidation saves negligible bytes at the cost of making failures harder to isolate.

#### Playwright Config Structure
```typescript
// playwright.config.ts
export default defineConfig({
  // ...existing config...
  reporter: process.env.CI ? "blob" : "html",

  projects: [
    // Owner auth (default)
    { name: "setup-owner", testMatch: /auth-owner\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/owner.json",
      },
      dependencies: ["setup-owner"],
      testIgnore: /.*\.setup\.ts/,
      testMatch: /^(?!.*\.(admin|manager|volunteer|viewer)\.spec\.ts).*\.spec\.ts$/,
    },
    // Admin auth
    { name: "setup-admin", testMatch: /auth-admin\.setup\.ts/ },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
      testMatch: /.*\.admin\.spec\.ts/,
    },
    // Manager auth
    { name: "setup-manager", testMatch: /auth-manager\.setup\.ts/ },
    {
      name: "manager",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/manager.json",
      },
      dependencies: ["setup-manager"],
      testMatch: /.*\.manager\.spec\.ts/,
    },
    // Volunteer auth
    { name: "setup-volunteer", testMatch: /auth-volunteer\.setup\.ts/ },
    {
      name: "volunteer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/volunteer.json",
      },
      dependencies: ["setup-volunteer"],
      testMatch: /.*\.volunteer\.spec\.ts/,
    },
    // Viewer auth
    { name: "setup-viewer", testMatch: /auth-viewer\.setup\.ts/ },
    {
      name: "viewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/viewer.json",
      },
      dependencies: ["setup-viewer"],
      testMatch: /.*\.viewer\.spec\.ts/,
    },
  ],
})
```

#### Migration of Existing Specs

Current specs that need filename changes:
- `role-gated.orgadmin.spec.ts` --> `role-gated.admin.spec.ts` (suffix change)
- `role-gated.volunteer.spec.ts` --> stays as-is (already matches `.volunteer.spec.ts`)
- All 49 unsuffixed specs --> stay as-is (will run under `owner` instead of `admin@localhost`)

Current auth setup files to replace:
- `auth.setup.ts` --> `auth-owner.setup.ts` (change credentials to `owner1@localhost` / `Owner1234!`)
- `auth-orgadmin.setup.ts` --> `auth-admin.setup.ts` (change credentials to `admin1@localhost` / `Admin1234!`)
- `auth-volunteer.setup.ts` --> update credentials to `volunteer1@localhost` / `Volunteer1234!`

#### .gitignore Update
The current `.gitignore` only has `playwright/.auth/user.json`. Update to:
```
playwright/.auth/
```
This covers all role-based auth JSON files.

### CI Sharding (INFRA-03)

#### Reporter Configuration
```typescript
// playwright.config.ts
reporter: process.env.CI ? "blob" : "html",
```

The `blob` reporter generates a binary report in `blob-report/` that contains all test results, traces, and attachments. It can be merged across shards.

#### GitHub Actions Workflow Changes

The `integration-e2e` job splits into:
1. **e2e-tests** - matrix job running sharded tests (replaces current monolithic E2E run)
2. **merge-e2e-reports** - new job that merges blob reports into single HTML report

```yaml
e2e-tests:
  name: E2E Tests (Shard ${{ matrix.shardIndex }}/4)
  runs-on: ubuntu-latest
  needs: [lint, test, frontend]
  strategy:
    fail-fast: false
    matrix:
      shardIndex: [1, 2, 3, 4]
      shardTotal: [4]
  steps:
    # ... setup steps (checkout, docker compose, migrate, seed, create users) ...

    - name: Run E2E tests
      working-directory: web
      run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
      env:
        # Role-based env vars for auth setup files
        E2E_OWNER_USERNAME: owner1@localhost
        E2E_OWNER_PASSWORD: "Owner1234!"
        # ... etc for all 5 roles ...

    - name: Upload blob report
      uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with:
        name: blob-report-${{ matrix.shardIndex }}
        path: web/blob-report
        retention-days: 1

merge-e2e-reports:
  name: Merge E2E Reports
  if: ${{ !cancelled() }}
  needs: [e2e-tests]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"

    - name: Install Playwright
      working-directory: web
      run: npm ci

    - uses: actions/download-artifact@v4
      with:
        path: web/all-blob-reports
        pattern: blob-report-*
        merge-multiple: true

    - name: Merge reports
      working-directory: web
      run: npx playwright merge-reports --reporter html ./all-blob-reports

    - uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: web/playwright-report/
        retention-days: 7
```

#### Shard Infrastructure Concern

Each shard job needs its own Docker Compose stack (services, ZITADEL, DB). This means each shard job must independently:
1. Start Docker Compose
2. Wait for ZITADEL
3. Run migrations + seed
4. Create E2E test users
5. Install Playwright browsers
6. Run its shard

This is expensive in CI time. The setup overhead is ~3-4 minutes per shard. For 4 shards with ~33 specs each, the test execution per shard should be ~2-3 minutes, so the infrastructure overhead dominates.

**Recommendation:** Keep the architecture simple for now (each shard has full stack). Optimizing shared infrastructure adds complexity that can be addressed later if CI time becomes a bottleneck.

### Anti-Patterns to Avoid
- **Shared Docker Compose across shards:** GitHub Actions matrix jobs run on separate runners. Each needs its own services. Do not attempt to share a single DB/ZITADEL instance across shards.
- **Hardcoded user IDs in tests:** ZITADEL assigns IDs dynamically. Never reference specific ZITADEL user IDs in E2E specs. Auth context handles identity.
- **Auth state file name collisions:** Each role must have a unique storageState path. The `.gitkeep` in `playwright/.auth/` should remain to ensure the directory exists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test report merging | Custom report aggregator | `npx playwright merge-reports` | Built-in, handles all report formats |
| Auth state management | Custom cookie serialization | Playwright `storageState` API | Handles cookies, localStorage, sessionStorage correctly |
| User provisioning idempotency | Custom existence checks | ZITADEL API `409 Conflict` + `find_user_by_username()` | Already implemented, battle-tested |
| Shard distribution | Custom test splitting | `npx playwright test --shard N/M` | Playwright splits at test level, balances automatically |

**Key insight:** Playwright 1.58.2 has built-in solutions for every infrastructure problem in this phase. The provisioning script already has every ZITADEL API helper needed. This phase is pure configuration expansion, not new functionality.

## Common Pitfalls

### Pitfall 1: Default Auth Context Migration
**What goes wrong:** Existing 51 specs currently authenticate as `admin@localhost` (ZITADEL instance admin with all permissions). Switching default to `owner1@localhost` means these specs run as a campaign owner, not ZITADEL instance admin. If any spec relies on ZITADEL-level admin powers (not campaign-level), it will break.
**Why it happens:** `admin@localhost` is the ZITADEL instance admin bootstrapped by `bootstrap-zitadel.py`. Campaign owners have full campaign permissions but not ZITADEL admin powers.
**How to avoid:** Review existing specs to verify none rely on ZITADEL admin capabilities. All 51 specs test campaign-scoped features, so this should be safe, but verify.
**Warning signs:** Specs that interact with ZITADEL admin UI, create/delete ZITADEL projects, or manage ZITADEL-level settings.

### Pitfall 2: Password Complexity Requirements
**What goes wrong:** ZITADEL rejects user creation if passwords don't meet complexity requirements.
**Why it happens:** ZITADEL instance has default password policy requiring uppercase, lowercase, number, and symbol.
**How to avoid:** The decided passwords (`Owner1234!`, etc.) already meet all standard ZITADEL requirements (uppercase, lowercase, digits, special char, 10+ chars). Verify in testing.
**Warning signs:** 400 errors from ZITADEL user creation endpoint mentioning password policy.

### Pitfall 3: `.gitignore` Auth File Leak
**What goes wrong:** Auth state JSON files with session cookies get committed to git.
**Why it happens:** Current `.gitignore` only covers `playwright/.auth/user.json`. New role files (`owner.json`, `admin.json`, etc.) are not covered.
**How to avoid:** Update `.gitignore` to use `playwright/.auth/` wildcard (keep `.gitkeep` via `!playwright/.auth/.gitkeep`).
**Warning signs:** `git status` shows new tracked files in `playwright/.auth/`.

### Pitfall 4: Shard Job Isolation
**What goes wrong:** Sharded jobs interfere with each other or have non-deterministic failures.
**Why it happens:** Each shard runs on a separate GitHub Actions runner with its own Docker Compose stack. If the setup steps fail silently on one shard, tests fail with confusing "element not found" errors.
**How to avoid:** Keep `fail-fast: false` in matrix strategy so all shards complete. Add explicit health checks after Docker Compose setup. Upload playwright traces on failure.
**Warning signs:** One shard consistently fails while others pass.

### Pitfall 5: Campaign Role vs. Org Role Confusion
**What goes wrong:** Tests expect a viewer to see campaign data but viewer has no org membership, or admin expects org-level features but only has campaign-level admin role.
**Why it happens:** The role resolution system has two layers: `organization_members.role` (org-level) and `campaign_members.role` (campaign-level). The effective role is `max(org_derived, campaign_explicit)`. For owner/admin, both layers exist. For manager/volunteer/viewer, only campaign-level exists.
**How to avoid:** The provisioning script must set both org membership (for owner/admin) AND campaign membership (for all 5 roles). Tests must understand that manager/volunteer/viewer have no org-level access (no org settings, no campaign creation).
**Warning signs:** Viewer tests failing with 403 when accessing campaign data (missing campaign_members row). Owner tests seeing reduced permissions (missing org membership).

### Pitfall 6: Blob Report Path Mismatch
**What goes wrong:** `merge-reports` job can't find blob reports, producing empty merged report.
**Why it happens:** Upload artifact path doesn't match download path, or `merge-multiple: true` is missing.
**How to avoid:** Upload path must be `web/blob-report` (Playwright's default output). Download with `pattern: blob-report-*` and `merge-multiple: true`. Merge command points to download path.
**Warning signs:** Empty HTML report artifact, or merge job step shows "0 reports found."

### Pitfall 7: Existing orgadmin Spec Suffix
**What goes wrong:** `role-gated.orgadmin.spec.ts` no longer matches any project's `testMatch` after migration.
**Why it happens:** The old project matched `.orgadmin.spec.ts`. The new project matches `.admin.spec.ts`. The file must be renamed.
**How to avoid:** Explicitly rename `role-gated.orgadmin.spec.ts` to `role-gated.admin.spec.ts` as part of migration.
**Warning signs:** Spec file silently excluded from all test runs.

## Code Examples

### Auth Setup File Pattern (verified from existing codebase)
```typescript
// web/e2e/auth-owner.setup.ts
import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/owner.json")

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login")
  await page.waitForURL(
    (url) => url.port === "8080" || url.pathname.includes("/ui/login"),
    { timeout: 30_000 },
  )

  const loginInput = page.getByLabel(/login ?name/i).or(page.locator("#loginName"))
  await loginInput.fill(
    process.env.E2E_OWNER_USERNAME ?? "owner1@localhost",
  )

  await page.getByRole("button", { name: /next/i }).click()

  const passwordInput = page.getByLabel(/password/i).or(page.locator("#password"))
  await passwordInput.fill(
    process.env.E2E_OWNER_PASSWORD ?? "Owner1234!",
  )

  await page.getByRole("button", { name: /next/i }).click()

  await page.waitForURL(/\/(campaigns|org)/, { timeout: 30_000 })
  await expect(page.locator("body")).toBeVisible()
  await page.context().storageState({ path: authFile })
})
```

Source: adapted from existing `web/e2e/auth-orgadmin.setup.ts` pattern.

### User Definition List (for provisioning script)
```python
E2E_USERS = [
    # Owners (3)
    {"userName": "owner1@localhost", "password": "Owner1234!", "firstName": "Test", "lastName": "Owner1", "email": "owner1@localhost", "projectRole": "owner", "orgRole": "org_owner", "campaignRole": "owner"},
    {"userName": "owner2@localhost", "password": "Owner1234!", "firstName": "Test", "lastName": "Owner2", "email": "owner2@localhost", "projectRole": "owner", "orgRole": "org_owner", "campaignRole": "owner"},
    {"userName": "owner3@localhost", "password": "Owner1234!", "firstName": "Test", "lastName": "Owner3", "email": "owner3@localhost", "projectRole": "owner", "orgRole": "org_owner", "campaignRole": "owner"},
    # Admins (3)
    {"userName": "admin1@localhost", "password": "Admin1234!", "firstName": "Test", "lastName": "Admin1", "email": "admin1@localhost", "projectRole": "admin", "orgRole": "org_admin", "campaignRole": "admin"},
    {"userName": "admin2@localhost", "password": "Admin1234!", "firstName": "Test", "lastName": "Admin2", "email": "admin2@localhost", "projectRole": "admin", "orgRole": "org_admin", "campaignRole": "admin"},
    {"userName": "admin3@localhost", "password": "Admin1234!", "firstName": "Test", "lastName": "Admin3", "email": "admin3@localhost", "projectRole": "admin", "orgRole": "org_admin", "campaignRole": "admin"},
    # Managers (3)
    {"userName": "manager1@localhost", "password": "Manager1234!", "firstName": "Test", "lastName": "Manager1", "email": "manager1@localhost", "projectRole": "manager", "orgRole": None, "campaignRole": "manager"},
    {"userName": "manager2@localhost", "password": "Manager1234!", "firstName": "Test", "lastName": "Manager2", "email": "manager2@localhost", "projectRole": "manager", "orgRole": None, "campaignRole": "manager"},
    {"userName": "manager3@localhost", "password": "Manager1234!", "firstName": "Test", "lastName": "Manager3", "email": "manager3@localhost", "projectRole": "manager", "orgRole": None, "campaignRole": "manager"},
    # Volunteers (3)
    {"userName": "volunteer1@localhost", "password": "Volunteer1234!", "firstName": "Test", "lastName": "Volunteer1", "email": "volunteer1@localhost", "projectRole": "volunteer", "orgRole": None, "campaignRole": "volunteer"},
    {"userName": "volunteer2@localhost", "password": "Volunteer1234!", "firstName": "Test", "lastName": "Volunteer2", "email": "volunteer2@localhost", "projectRole": "volunteer", "orgRole": None, "campaignRole": "volunteer"},
    {"userName": "volunteer3@localhost", "password": "Volunteer1234!", "firstName": "Test", "lastName": "Volunteer3", "email": "volunteer3@localhost", "projectRole": "volunteer", "orgRole": None, "campaignRole": "volunteer"},
    # Viewers (3)
    {"userName": "viewer1@localhost", "password": "Viewer1234!", "firstName": "Test", "lastName": "Viewer1", "email": "viewer1@localhost", "projectRole": "viewer", "orgRole": None, "campaignRole": "viewer"},
    {"userName": "viewer2@localhost", "password": "Viewer1234!", "firstName": "Test", "lastName": "Viewer2", "email": "viewer2@localhost", "projectRole": "viewer", "orgRole": None, "campaignRole": "viewer"},
    {"userName": "viewer3@localhost", "password": "Viewer1234!", "firstName": "Test", "lastName": "Viewer3", "email": "viewer3@localhost", "projectRole": "viewer", "orgRole": None, "campaignRole": "viewer"},
]
```

### Campaign Membership SQL Insert
```python
# Same pattern as ensure_org_membership() but for campaign_members
cur.execute(
    """
    INSERT INTO campaign_members (id, user_id, campaign_id, role)
    VALUES (gen_random_uuid(), %s, (SELECT id FROM campaigns LIMIT 1), %s)
    ON CONFLICT ON CONSTRAINT uq_user_campaign DO UPDATE
    SET role = EXCLUDED.role
    """,
    (user_zitadel_id, campaign_role),
)
```

Source: adapted from existing `ensure_org_membership()` in `scripts/create-e2e-users.py`.

### CI Environment Variables for Auth Setup
```yaml
env:
  E2E_OWNER_USERNAME: owner1@localhost
  E2E_OWNER_PASSWORD: "Owner1234!"
  E2E_ADMIN_USERNAME: admin1@localhost
  E2E_ADMIN_PASSWORD: "Admin1234!"
  E2E_MANAGER_USERNAME: manager1@localhost
  E2E_MANAGER_PASSWORD: "Manager1234!"
  E2E_VOLUNTEER_USERNAME: volunteer1@localhost
  E2E_VOLUNTEER_PASSWORD: "Volunteer1234!"
  E2E_VIEWER_USERNAME: viewer1@localhost
  E2E_VIEWER_PASSWORD: "Viewer1234!"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single auth context | Multi-project storageState per role | Playwright 1.30+ | Built-in support for role-based testing |
| Custom report merging | `npx playwright merge-reports` | Playwright 1.37+ | Blob reporter + merge CLI = native sharding support |
| `actions/upload-artifact@v3` | `actions/upload-artifact@v4` | 2024 | `pattern` + `merge-multiple` on download |

**Deprecated/outdated:**
- `actions/download-artifact@v3`: Does not support `pattern` or `merge-multiple`. Already on v4 in this project.
- `storageState` as global config: Per-project `storageState` is the standard pattern for multi-role testing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test --project=chromium --grep "login"` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements --> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | 15 ZITADEL users created with correct roles | smoke (script execution) | `docker compose exec -T api bash -c "PYTHONPATH=/home/app python scripts/create-e2e-users.py"` | N/A (script output verification) |
| INFRA-02 | 5 auth projects each produce valid storageState | smoke (setup projects) | `cd web && npx playwright test --project=setup-owner --project=setup-admin --project=setup-manager --project=setup-volunteer --project=setup-viewer` | Auth setup files (Wave 0) |
| INFRA-03 | Sharded tests complete and merge | CI workflow | GitHub Actions workflow run (manual verification) | `.github/workflows/pr.yml` |

### Sampling Rate
- **Per task commit:** Run relevant auth setup project: `cd web && npx playwright test --project=setup-owner`
- **Per wave merge:** Full suite: `cd web && npx playwright test`
- **Phase gate:** All 5 auth setups succeed + at least one existing spec passes per role context

### Wave 0 Gaps
- [ ] `web/e2e/auth-owner.setup.ts` -- covers INFRA-02 (owner auth)
- [ ] `web/e2e/auth-admin.setup.ts` -- covers INFRA-02 (admin auth)
- [ ] `web/e2e/auth-manager.setup.ts` -- covers INFRA-02 (manager auth)
- [ ] `web/e2e/auth-viewer.setup.ts` -- covers INFRA-02 (viewer auth)
- [ ] Updated `web/e2e/auth-volunteer.setup.ts` -- covers INFRA-02 (volunteer auth)

## Open Questions

1. **User record creation during first login vs. provisioning script**
   - What we know: When a user first logs in, the app's `ensure_user_synced()` middleware creates a `users` row. The current `create-e2e-users.py` also inserts users directly via SQL (for org membership foreign key).
   - What's unclear: Should the provisioning script insert `users` rows directly (as it does now), or rely on first-login sync? If direct insert, display_name and email must match what ZITADEL sends.
   - Recommendation: Keep direct SQL insert in provisioning script (existing pattern works). This ensures org/campaign membership can be created without requiring a login first. Auth setup projects handle the initial login afterward.

2. **Existing spec behavior under owner context**
   - What we know: 49 unsuffixed specs currently run as `admin@localhost` (ZITADEL instance admin). Under the new system they'll run as `owner1@localhost` (campaign owner).
   - What's unclear: Whether any spec relies on ZITADEL-level admin powers vs campaign-level owner powers.
   - Recommendation: Audit the 51 existing spec files during implementation. Campaign owners have all campaign permissions, so most specs should work unchanged. Flag any that fail for individual review.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `scripts/create-e2e-users.py` -- complete ZITADEL provisioning pattern
- Existing codebase: `web/playwright.config.ts` -- multi-project auth routing pattern
- Existing codebase: `.github/workflows/pr.yml` -- CI pipeline structure
- Existing codebase: `app/core/security.py` -- role resolution system (CampaignRole, resolve_campaign_role)
- Existing codebase: `app/models/campaign_member.py` -- campaign membership schema with role constraint
- Existing codebase: `app/models/organization_member.py` -- org membership schema with role constraint
- [Playwright Sharding Docs](https://playwright.dev/docs/test-sharding) -- official sharding + merge-reports guide
- [Playwright Auth Docs](https://playwright.dev/docs/auth) -- multi-project auth setup pattern

### Secondary (MEDIUM confidence)
- [actions/download-artifact v4](https://github.com/actions/download-artifact/tree/v4) -- pattern + merge-multiple support
- npm registry: `@playwright/test@1.58.2` -- verified latest version matches installed

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns exist in codebase
- Architecture: HIGH -- direct expansion of existing patterns with official Playwright features
- Pitfalls: HIGH -- identified from actual codebase analysis (role resolution, gitignore, spec migration)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- Playwright sharding and auth are mature features)
