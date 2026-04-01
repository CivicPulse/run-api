# Phase 58: E2E Core Tests - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated Playwright tests that validate the RBAC permission matrix, org/campaign management workflows, and all voter entity CRUD lifecycles. This phase covers requirements E2E-01, E2E-02, E2E-03, E2E-07, E2E-08, E2E-09, E2E-10, and E2E-11 from the testing plan.

</domain>

<decisions>
## Implementation Decisions

### Spec File Organization
- **D-01:** One spec file per requirement group — 8 files total: `rbac.{role}.spec.ts` (5 files), `org-management.spec.ts`, `campaign-settings.spec.ts`, `voter-crud.spec.ts`, `voter-contacts.spec.ts`, `voter-tags.spec.ts`, `voter-notes.spec.ts`, `voter-lists.spec.ts`
- **D-02:** Domain-based naming (no phase prefix). These are the canonical E2E suite, not phase verifications. Example: `voter-crud.spec.ts`, not `phase58-voter-crud.spec.ts`
- **D-03:** RBAC specs split by role using the suffix convention: `rbac.viewer.spec.ts`, `rbac.volunteer.spec.ts`, `rbac.manager.spec.ts`, `rbac.admin.spec.ts`, `rbac.spec.ts` (owner, unsuffixed = default auth). Each runs under that role's auth context.

### Test Data Strategy
- **D-04:** Hybrid approach — use seed data (50 voters, turfs, walk lists, etc.) as baseline for read/query tests. Create fresh entities within each test for mutation tests (create, edit, delete) to avoid cross-test interference.
- **D-05:** For voter CRUD tests requiring 20+ voters: create 2-3 voters via the UI form (validates the form works), then use API `POST /voters` for the remaining 17+ to keep the spec fast.

### RBAC Coverage Approach
- **D-06:** Per-role permission checklist structure. Each role's spec runs through every page, verifying which buttons/actions are visible vs hidden. Matches RBAC-03 through RBAC-07 structure from the testing plan.
- **D-07:** Skip RBAC-01 and RBAC-02 (role assignment). Phase 57's provisioning script already assigns campaign and org roles. The member management UI is tested separately in `campaign-settings.spec.ts` (CAMP-02, CAMP-03).
- **D-08:** Org role tests (RBAC-08 org_admin, RBAC-09 org_owner) go in the admin and owner RBAC specs respectively.

### Test Isolation & Execution
- **D-09:** Serial within spec (`test.describe.serial`), parallel across spec files via Playwright workers. Specs with ordered steps (create -> edit -> delete) run serially. Different spec files run in parallel for CI speed.
- **D-10:** No cleanup — fresh environment per CI run. Docker Compose provides a fresh database each CI run. Delete tests naturally clean up what create tests made within the same serial describe block.
- **D-11:** Existing 51 phase-verification specs kept as-is. They still pass and provide regression coverage. Clean up in a future phase after the new suite is validated.

### Claude's Discretion
- Exact test case implementation details within each spec file
- How to handle edge cases in RBAC testing (e.g., direct URL access to restricted routes)
- Whether to use `test.step()` for sub-steps within serial tests (like connected-journey.spec.ts does)
- Playwright worker count configuration for optimal CI shard balance
- How to structure API helper functions for bulk data creation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Testing Plan
- `docs/testing-plan.md` — Comprehensive E2E testing plan with 34 sections. Phase 58 covers sections 3 (RBAC), 4 (Org Management), 5 (Campaign Settings), 8 (Voter CRUD), 9 (Voter Contacts), 10 (Voter Tags), 11 (Voter Notes/Interactions), 12 (Voter Lists)

### Existing Test Infrastructure (from Phase 57)
- `web/e2e/auth-owner.setup.ts` — Owner auth setup (default auth context)
- `web/e2e/auth-admin.setup.ts` — Admin auth setup
- `web/e2e/auth-manager.setup.ts` — Manager auth setup
- `web/e2e/auth-volunteer.setup.ts` — Volunteer auth setup
- `web/e2e/auth-viewer.setup.ts` — Viewer auth setup
- `web/playwright.config.ts` — Playwright config with 5 role-based auth projects and shard support
- `scripts/create-e2e-users.py` — 15-user provisioning script with campaign membership

### Existing Spec Patterns
- `web/e2e/role-gated.admin.spec.ts` — Existing RBAC spec for admin role (pattern reference)
- `web/e2e/role-gated.volunteer.spec.ts` — Existing RBAC spec for volunteer role (pattern reference)
- `web/e2e/connected-journey.spec.ts` — Serial multi-step test with `test.describe.serial` and `test.step()` (pattern reference)

### Codebase Analysis
- `.planning/codebase/TESTING.md` — Testing patterns, fixtures, and conventions

### Seed Data
- `scripts/seed.py` — Idempotent Macon-Bibb County demo dataset (50 voters, 5 turfs, 4 walk lists, 3 call lists, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `role-gated.admin.spec.ts` / `role-gated.volunteer.spec.ts`: Existing RBAC tests that verify button visibility per role — can be used as templates for the new comprehensive RBAC suite
- `connected-journey.spec.ts`: Demonstrates `test.describe.serial` pattern for ordered multi-step flows (campaign create -> turf -> voters -> phone bank)
- 5 auth setup files: Complete OIDC login flow handlers for all roles, ready to use
- Seed data: 50 voters with PostGIS coords, 5 turfs, 4 walk lists, 3 call lists, 20 volunteers, 10 shifts — baseline for read tests

### Established Patterns
- Role-suffix convention: `.owner.spec.ts`, `.admin.spec.ts`, `.manager.spec.ts`, `.volunteer.spec.ts`, `.viewer.spec.ts` — unsuffixed runs as owner
- Auth via `storageState` files in `playwright/.auth/` — pre-authenticated sessions, no login per test
- Locator strategy: `page.getByRole()`, `page.getByLabel()`, `page.getByText()` — accessible selectors
- Wait patterns: `page.waitForURL()` with regex, `expect().toBeVisible({ timeout })` for async UI
- Response interception: `page.waitForResponse()` for API call verification

### Integration Points
- New specs go in `web/e2e/` alongside existing specs
- Playwright config already routes specs to auth projects via `testMatch` regex on filename suffix
- CI sharding (4 shards) will automatically distribute new specs across shards

</code_context>

<specifics>
## Specific Ideas

- RBAC specs should explicitly test both "button visible" (positive) and "button NOT visible" (negative) for each role — the testing plan specifies exact buttons to check per role
- Voter CRUD spec should create, edit, then delete voters in a serial flow — the delete test verifies the create worked, reducing redundant assertions
- For voter contacts: test phone, email, and address CRUD across 20 voters — mix of seed voters (for reading) and freshly created voters (for mutations)
- Org management spec should create a secondary campaign, archive it, unarchive it, then clean up — uses test.describe.serial for the lifecycle

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 58-e2e-core-tests*
*Context gathered: 2026-03-29*
