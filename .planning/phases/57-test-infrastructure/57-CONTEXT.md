# Phase 57: Test Infrastructure - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Provision 15 ZITADEL test users (3 per campaign role), configure Playwright with 5 role-based auth projects, and set up CI sharding with merged reports. This phase delivers the test infrastructure foundation that phases 58-60 depend on for writing E2E specs.

</domain>

<decisions>
## Implementation Decisions

### Test User Identity
- **D-01:** Email domain is `@localhost` for all test users (e.g., `owner1@localhost`, `admin1@localhost`). Matches existing E2E user convention. No DNS fiction.
- **D-02:** Passwords follow role-based pattern: `Owner1234!`, `Admin1234!`, `Manager1234!`, `Volunteer1234!`, `Viewer1234!` (predictable per role for Playwright env vars).
- **D-03:** Provisioning script assigns full membership — ZITADEL user creation, project role grant, org membership, AND campaign membership to the seed campaign. Tests start with all 15 users fully set up.
- **D-04:** `admin@localhost` (ZITADEL instance admin from bootstrap) stays separate. The 15 E2E test users are entirely new accounts. Clean separation of instance admin vs campaign roles.

### Playwright Auth Structure
- **D-05:** Filename suffix convention for spec routing: `.owner.spec.ts`, `.admin.spec.ts`, `.manager.spec.ts`, `.volunteer.spec.ts`, `.viewer.spec.ts`. Unsuffixed specs run as owner (default auth context).
- **D-06:** Owner is the default (no suffix) auth context. Owner has full permissions — most tests exercise features needing full access. This replaces `admin@localhost` as the default project user.
- **D-07:** Existing 51 E2E specs are migrated to the new auth structure. The 3 existing auth setup files become 5 role-based setups. One unified auth system, no parallel legacy setup.

### CI Sharding
- **D-08:** Playwright `--shard N/M` with GitHub Actions matrix strategy. 4 shards for ~130 specs (~33 specs per shard).
- **D-09:** Merged HTML report — use Playwright's `merge-reports` CLI after all shards complete. Upload one combined report artifact.

### Provisioning Script
- **D-10:** Expand existing `create-e2e-users.py` in-place from 2 to 15 users. Same ZITADEL API patterns, bigger user list. Existing CI step already calls this script — no CI path change needed.
- **D-11:** All 15 users are assigned to the seed campaign (Macon-Bibb demo). Seed data has voters, turfs, walk lists, etc. — tests exercise real data immediately.

### Claude's Discretion
- Auth setup file structure (whether to keep separate setup files per role or consolidate)
- Exact username format (e.g., `owner1@localhost` vs `test-owner-1@localhost`)
- How campaign_members rows are inserted (direct SQL like current script, or via API)
- Shard merge job implementation details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test Plan
- `docs/testing-plan.md` — Comprehensive E2E testing plan with 34 sections, test user table (Section 1.2), and all test case definitions

### Existing Test Infrastructure
- `scripts/create-e2e-users.py` — Current 2-user provisioning script with ZITADEL API patterns (user creation, role grants, org membership)
- `scripts/bootstrap-zitadel.py` — ZITADEL instance bootstrap (project, roles, SPA app). Shares helper patterns with create-e2e-users.py
- `web/playwright.config.ts` — Current Playwright config with 3 auth projects (default, orgadmin, volunteer)
- `web/e2e/auth.setup.ts` — OIDC login flow handler including forced password change
- `web/e2e/auth-orgadmin.setup.ts` — Orgadmin auth setup (pattern reference)
- `web/e2e/auth-volunteer.setup.ts` — Volunteer auth setup (pattern reference)

### CI Pipeline
- `.github/workflows/pr.yml` — Current CI workflow with integration-e2e job. Step "Create E2E test users" already calls create-e2e-users.py

### Codebase Analysis
- `.planning/codebase/TESTING.md` — Testing patterns, fixtures, and conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `create-e2e-users.py` — Full ZITADEL user management: `create_human_user()`, `grant_project_role()`, `ensure_org_membership()`, `find_project_id()`, `find_user_by_username()`. All idempotent with conflict handling.
- `bootstrap-zitadel.py` — Shared patterns for ZITADEL API calls, PAT reading, health check polling.
- `auth.setup.ts` — Complete OIDC login flow with ZITADEL (login name → password → optional password change → redirect). Handles `passwordChangeRequired: false` users.

### Established Patterns
- Playwright projects use `storageState` files in `playwright/.auth/` for pre-authenticated sessions
- Auth setup files are separate per role, referenced by `testMatch` regex in playwright.config.ts
- Spec routing is filename-based: `testMatch: /.*\.orgadmin\.spec\.ts/` routes to orgadmin project
- CI runs `docker compose up -d --build --wait` then sequential setup steps (migrate, seed, create users)

### Integration Points
- `playwright.config.ts` — Add 5 role-based projects (owner, admin, manager, volunteer, viewer) replacing current 3
- `create-e2e-users.py` — Expand E2E_USERS list from 2 to 15 entries, add campaign membership logic
- `.github/workflows/pr.yml` — Add matrix strategy for sharding, add report merge job
- `web/e2e/` — Auth setup files need to be created/updated per role

</code_context>

<specifics>
## Specific Ideas

- 15 users: 3 per role (owner1-3, admin1-3, manager1-3, volunteer1-3, viewer1-3) at @localhost
- The default Playwright auth user (no suffix) runs as owner1@localhost — this is the primary actor for most tests
- Role-suffixed specs (`.volunteer.spec.ts`) run as `{role}1@localhost` (first user of that role)
- Second and third users per role (e.g., owner2, owner3) available for multi-user scenarios (ownership transfer, etc.)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 57-test-infrastructure*
*Context gathered: 2026-03-29*
