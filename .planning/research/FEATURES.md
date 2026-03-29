# Feature Landscape: v1.7 Testing & Validation

**Domain:** Comprehensive E2E testing pipeline, AI-driven production testing, test user provisioning, small feature gaps
**Researched:** 2026-03-29
**Overall confidence:** HIGH (existing Playwright infrastructure well-understood, testing plan is detailed, ZITADEL user provisioning script already exists as a pattern)

---

## Table Stakes

Features that any comprehensive E2E testing pipeline must have. Missing any of these means the testing suite is unreliable, unmaintainable, or incomplete.

| Feature | Why Expected | Complexity | Depends On | Notes |
|---------|--------------|------------|------------|-------|
| Multi-role auth setup projects | Each of the 5 campaign roles + 2 org roles needs its own authenticated storage state. Without this, tests cannot verify role-based UI gating. | Low | Extend existing `playwright.config.ts` projects pattern | Already have 3 auth setups (default user, orgadmin, volunteer). Need to expand to cover all 15 test users from the plan, or at minimum one per distinct role level (owner, admin, manager, volunteer, viewer). |
| ZITADEL test user provisioning script | Automated tests require known user credentials. Manual user creation in ZITADEL is error-prone and non-repeatable. Must be idempotent. | Low | Extend existing `scripts/create-e2e-users.py` from 2 users to 15 users | Script already handles ZITADEL v1 Management API, project role grants, and org membership insertion. Expand the `E2E_USERS` list and add campaign membership setup. |
| Test data seeding and isolation | Each test run needs a known-good data state. Tests that depend on previous test output are fragile and order-dependent. | Medium | Seed script + per-suite setup/teardown hooks | Existing `scripts/seed.py` provides Macon-Bibb demo dataset. Tests should use `test.describe.serial()` where ordering matters and API-based setup/teardown for created test data. |
| Comprehensive RBAC verification | The testing plan defines RBAC-01 through RBAC-09 covering all 5 campaign roles and 2 org roles. This is the most critical test category -- security regressions must be caught. | Medium | All 5+ role auth storage states loaded; viewer, volunteer, manager, admin, owner all exercised | Current suite has `role-gated.volunteer.spec.ts` and `role-gated.orgadmin.spec.ts`. Need equivalent specs for viewer (read-only), manager, and owner (destructive actions). |
| CRUD lifecycle tests for every entity type | The testing plan covers 10+ entity types (voters, contacts, tags, lists, turfs, walk lists, call lists, sessions, surveys, volunteers, shifts). Each needs create/read/update/delete coverage. | High | Per-entity spec files with setup/teardown | The most labor-intensive portion of the test suite. ~80+ individual test cases across 15+ spec files. Must exercise every form, dialog, and action menu in the app. |
| Import pipeline E2E tests | L2 import is the primary data ingestion path. Must verify upload, auto-mapping, preview, execution, progress, and completion with real CSV data. | Medium | `data/example-2026-02-24.csv` (551 voters) available in test environment | Existing `voter-import.spec.ts` and `l2-import-wizard.spec.ts` cover basic flows. Need to expand to cover concurrent import prevention (IMP-03), cancellation (IMP-04), and data validation (VAL-01/VAL-02). |
| Field mode E2E tests | Canvassing and phone banking field modes are the core volunteer UX. Must verify the linear wizard, outcome recording, survey integration, and session persistence. | Medium | Walk list with assigned canvasser, phone bank session with assigned caller | Existing `phase31-canvassing.spec.ts` and `phase30-field-layout.spec.ts` provide partial coverage. Need focused tests for the step-by-step canvassing/calling experience. |
| Accessibility spot-check automation | axe-core scans across critical routes catch WCAG regressions. Existing `a11y-scan.spec.ts` covers 38 routes. | Low | Already exists; extend if new routes added | Maintain existing a11y-scan coverage. Add keyboard navigation verification for new features (note edit/delete, walk list rename). |
| Test cleanup strategy | Tests that create data must clean it up. Orphaned test data causes subsequent test runs to fail or produce false results. | Low | `test.afterAll()` hooks or API-based cleanup in each spec | Use API calls in cleanup hooks rather than UI-based deletion to keep cleanup fast and reliable. Where possible, create throwaway campaigns scoped to individual test suites. |

## Differentiators

Features that go beyond standard E2E coverage and add significant quality or operational value. Not universally expected in a test suite but highly valuable for this project.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| AI-driven production testing instructions | Transform the 34-section testing plan into structured step-by-step instructions an AI agent (or human QA tester) can follow against production. Bridges the gap between automated dev tests and production validation. | Low | The testing plan document already exists in `docs/testing-plan.md` | This is a documentation deliverable, not a code feature. Rewrite the testing plan as an imperative instruction set with explicit success criteria, screenshots expectations, and environmental notes for production vs. local dev differences. |
| Data validation test cases (CSV-to-UI verification) | VAL-01 and VAL-02 from the testing plan verify that imported CSV data appears correctly in the UI across 60 voters. This catches data parsing bugs, display formatting issues, and mapping errors that unit tests miss. | High | Import completed, 551 voters in DB, CSV file accessible to Playwright for comparison | This is the hardest test category to automate. Requires reading expected values from the CSV, navigating to voter detail pages, and comparing field-by-field. Consider a fixture that loads the CSV and provides expected values to tests. |
| Connected journey tests | A single test that exercises the full user journey: org dashboard to campaign creation to turf creation to voter management to phone banking. Proves features compose into a working application. | Medium | All individual features working | Existing `connected-journey.spec.ts` covers campaign creation flow. Extend to include deeper journeys through canvassing and phone banking. |
| Offline sync verification | Verify that field mode outcomes queued during network disconnection sync correctly when connectivity resumes. Tests the localStorage queue and auto-sync logic. | Medium | Playwright network throttling/offline simulation | Existing `phase33-offline-sync.spec.ts` provides baseline. The testing plan defines OFFLINE-01 through OFFLINE-03 with specific queue count and sync verification. |
| Iterative test-fix-retest cycle | Run the full test suite, identify failures, fix the underlying issues (UI bugs, API bugs, missing features), and re-run until 100% pass rate. The milestone goal is not just test creation but validation completion. | High | Full test suite written; developer time to fix bugs | This is the operational differentiator. Most projects write tests and call it done. This milestone explicitly includes fixing all bugs the tests uncover, which produces a genuinely validated product. |
| Tour and onboarding verification | Verify the driver.js guided onboarding tour starts for first-time users, completes all steps, persists completion state, and replays via help button. | Low | Existing `tour-onboarding.spec.ts` provides baseline | Testing plan defines TOUR-01 through TOUR-03. Existing spec has 17 test/describe calls, likely already covers most of this. Verify coverage completeness. |
| Rate limiting verification | Verify that rapid API calls trigger 429 responses. Confirms production-hardening works. | Low | No dependencies beyond an authenticated user | Simple to automate: loop 35 API calls in under a minute and assert on 429. More of an API-level test but validates the full stack behavior. |
| Form navigation guard testing | Verify that partially filled forms warn before navigation. Tests `useFormGuard` hook across all form routes. | Low | Any form-bearing route | Testing plan defines CROSS-01. Automate by filling a form, clicking sidebar navigation, asserting guard dialog appears, then testing both "Stay" and "Leave" paths. |

## Anti-Features

Features to explicitly NOT build for this milestone. Including rationale so these do not creep into scope.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Visual regression testing (screenshot comparison) | Percy, Chromatic, or Playwright screenshot comparison adds snapshot storage, review workflows, and frequent false positives from minor CSS changes. Significant infrastructure and maintenance cost for a fast-moving codebase. | Rely on functional assertions (element visibility, text content, ARIA attributes). Use `screenshot: "only-on-failure"` in config (already set) for debugging failed tests. |
| Cross-browser testing (Firefox, Safari, Mobile) | Multi-browser E2E testing multiplies test runtime by 3-4x and introduces browser-specific flake. The app is a campaign tool, not a consumer product -- Chromium covers 90%+ of the user base. | Test only in Chromium (already configured). Address browser-specific bugs reactively if users report them. |
| Performance/load testing | k6, Artillery, or Locust load testing is a separate concern from functional E2E testing. Adds infrastructure complexity and a different skill set. | Defer to a separate milestone if needed. The app's rate limiting (already tested via `test_rate_limit_coverage.py`) provides production safety. |
| CI/CD pipeline integration for E2E tests | Running 130+ E2E tests in GitHub Actions adds container orchestration (Docker Compose in CI), test parallelization tuning, and flake management. Worth doing eventually, but not in this milestone. | Run tests locally against Docker Compose dev environment. Document the test execution workflow. Add CI integration in a future milestone. |
| Mobile viewport E2E testing | Testing at mobile widths adds a second dimension to every test. The field mode is mobile-first but testing it at 375px width doubles the test matrix. | Test field mode at desktop width -- the responsive behavior is CSS-only and covered by manual spot-checks. Add mobile viewport tests in a future polish milestone. |
| End-to-end API tests (bypassing UI) | Writing API-level integration tests duplicates what the E2E tests verify through the UI, and what the pytest unit/integration tests already cover. | Rely on existing 70+ pytest tests for API-level coverage. E2E tests exercise the full stack through the browser. |
| Automated test report generation | HTML test reports, Allure reports, or test management tool integration adds tooling without improving test quality. | Use Playwright's built-in `html` reporter (already configured for CI mode). Review results in terminal during local development. |
| Page Object Model refactor of existing specs | The 51 existing spec files do not use POMs. Refactoring them now is a large effort that does not add test coverage. | Write new specs with inline locator patterns matching the existing style. Consider POM adoption in a future refactor milestone if the spec count exceeds 80+. |
| Parallel test execution optimization | Tuning `fullyParallel`, worker counts, and test sharding for a 130-test suite is premature optimization. | Use Playwright defaults (`fullyParallel: true`, auto worker count). Serial mode (`test.describe.serial`) only for tests with explicit ordering dependencies (e.g., CRUD create-then-delete). |
| Test data factory / faker library | Generating randomized test data with @faker-js/faker adds variety but makes test assertions harder (what value did we generate?). The testing plan provides specific, deterministic test data tables. | Use the explicit test data from the testing plan (e.g., the 20-voter NATO alphabet table in VCRUD-01). Deterministic data makes assertions straightforward. |

## Feature Dependencies

```
ZITADEL test user provisioning (15 users)
    --> Multi-role auth setup projects in playwright.config.ts
    --> Campaign membership assignment (users must be campaign members)
    --> Org membership assignment (org_admin, org_owner users)
    --> All RBAC spec files (RBAC-01 through RBAC-09)

Seed data execution (scripts/seed.py)
    --> Dashboard tests (need baseline data for KPI cards)
    --> Import tests (need clean campaign for import target)
    --> Field mode tests (need walk lists, phone bank sessions)

Voter note edit/delete feature (NEW - must build)
    --> NOTE-02 and NOTE-03 test cases
    --> PATCH /interactions/{id} and DELETE /interactions/{id} API endpoints
    --> Edit/Delete buttons in voter History tab UI

Walk list rename UI (NEW - must build)
    --> WL-05 test case
    --> Inline rename or edit dialog in canvassing index / walk list detail
    --> Backend PATCH endpoint already exists

L2 import completion (IMP-01)
    --> Data validation tests (VAL-01, VAL-02 -- need 551 imported voters)
    --> Filter dimension tests (FLT-02 -- need diverse voter data)
    --> Voter search tests (FLT-01, FLT-03, FLT-04, FLT-05)

RBAC test completion
    --> Campaign settings tests (CAMP-01 through CAMP-06 -- require admin/owner role)
    --> Org management tests (ORG-01 through ORG-08 -- require org_owner/org_admin)

CRUD entity creation tests
    --> CRUD deletion tests (must create before you can delete)
    --> Cross-entity tests (e.g., DNC enforcement requires call list + DNC entries)
```

## MVP Recommendation

Prioritize in this order based on dependencies, risk, and value:

1. **Voter note edit/delete feature build** -- The testing plan explicitly calls this out as a prerequisite (NOTE-02, NOTE-03 marked "REQUIRES FEATURE BUILD"). This is the only backend API work in the milestone -- PATCH and DELETE for note-type interactions plus UI buttons. Small scope (2 endpoints + 2 UI buttons) but blocks 2 test cases and validates the full CRUD lifecycle for interactions.

2. **Walk list rename UI feature build** -- Second prerequisite from the testing plan (WL-05 marked "REQUIRES FEATURE BUILD"). Backend PATCH already exists. Need an edit action (inline rename or dialog) on the canvassing index page or walk list detail page. Small scope (1 UI component) but blocks 1 test case.

3. **ZITADEL test user provisioning expansion** -- Expand `scripts/create-e2e-users.py` from 2 to 15 users covering all 5 campaign roles and 2 org roles. Add campaign membership assignment. This unblocks every RBAC test and every role-specific test in the plan. Without this, the majority of the 130 test cases cannot run.

4. **Auth setup projects expansion** -- Add Playwright auth setup files for each distinct role (owner, admin, manager, viewer at minimum -- volunteer already exists). Configure `playwright.config.ts` projects to use these. This is the Playwright-side counterpart to provisioning.

5. **RBAC test suite** -- RBAC-01 through RBAC-09. These tests verify the security model, which is the highest-risk area. A broken RBAC means data leaks between campaigns or unauthorized mutations. Write these first among the spec files.

6. **CRUD lifecycle tests** -- Entity-by-entity specs: voters, contacts, tags, lists, turfs, walk lists, call lists, DNC, sessions, surveys, volunteers, shifts. The bulk of the 130 test cases live here. Follow the testing plan section-by-section (sections 10-24).

7. **Import and data validation tests** -- IMP-01 through IMP-04, VAL-01, VAL-02, FLT-01 through FLT-05. These verify the data pipeline end-to-end from CSV upload through UI display.

8. **Field mode and cross-cutting tests** -- FIELD-01 through FIELD-10, OFFLINE-01 through OFFLINE-03, TOUR-01 through TOUR-03, NAV-01 through NAV-03, UI-01 through UI-03, CROSS-01 through CROSS-03. These verify the volunteer experience and app-wide behaviors.

9. **AI-driven production testing instructions** -- Rewrite the testing plan as production-specific step-by-step instructions. Last because it requires knowing which tests passed locally (to validate the instructions are accurate).

**Defer:** Visual regression testing, CI pipeline integration, cross-browser testing, mobile viewport testing, POM refactoring. All add value but do not contribute to the v1.7 goal of "100% test pass rate on the testing plan."

## Complexity Assessment by Testing Plan Section

| Section | Test IDs | Test Count | Complexity | Notes |
|---------|----------|------------|------------|-------|
| 1. Prerequisites & Setup | N/A | 0 (infrastructure) | Medium | Provisioning script + auth setup |
| 2. Authentication | AUTH-01 to AUTH-04 | 4 | Low | Login/logout cycles, extend existing login.spec.ts |
| 3. RBAC | RBAC-01 to RBAC-09 | 9 | High | Requires all role auth states; verifies permission matrix |
| 4. Org Management | ORG-01 to ORG-08 | 8 | Medium | Campaign creation wizard, archive, org switcher |
| 5. Campaign Settings | CAMP-01 to CAMP-06 | 6 | Medium | Includes destructive tests (ownership transfer, delete) |
| 6. Dashboard | DASH-01 to DASH-02 | 2 | Low | Verify KPI cards render with valid values |
| 7. Voter Import | IMP-01 to IMP-04 | 4 | Medium | L2 auto-mapping, progress, cancel, concurrent prevention |
| 8. Data Validation | VAL-01 to VAL-02 | 2 | High | 60 voters verified field-by-field against CSV |
| 9. Search & Filtering | FLT-01 to FLT-05 | 5 | High | 23 filter dimensions plus composition, sort, pagination |
| 10. Voter CRUD | VCRUD-01 to VCRUD-04 | 4 | Medium | Create 20, edit 5, delete 25 |
| 11. Voter Contacts | CON-01 to CON-06 | 6 | Medium | Phone, email, address CRUD for 20+ voters |
| 12. Voter Tags | TAG-01 to TAG-05 | 5 | Medium | Tag CRUD, assignment to 40 voters, cleanup |
| 13. Voter Notes | NOTE-01 to NOTE-03 | 3 | Medium | Requires feature build for edit/delete |
| 14. Voter Lists | VLIST-01 to VLIST-06 | 6 | Medium | Static + dynamic lists, add/remove voters |
| 15. Turfs | TURF-01 to TURF-07 | 7 | High | Polygon drawing, overlap detection, GeoJSON |
| 16. Walk Lists | WL-01 to WL-07 | 7 | Medium | Generate, assign, rename (requires feature build) |
| 17. Call Lists | CL-01 to CL-05 | 5 | Low | CRUD + DNC filtering verification |
| 18. DNC | DNC-01 to DNC-06 | 6 | Medium | Single/bulk add, enforcement verification |
| 19. Sessions | PB-01 to PB-10 | 10 | High | Session CRUD, caller assignment, active calling |
| 20. Surveys | SRV-01 to SRV-08 | 8 | Medium | Survey CRUD, question types, status lifecycle |
| 21. Volunteers | VOL-01 to VOL-08 | 8 | Medium | User/non-user registration, roster, detail |
| 22. Volunteer Tags | VTAG-01 to VTAG-05 | 5 | Low | Same pattern as voter tags |
| 23. Availability | AVAIL-01 to AVAIL-03 | 3 | Low | Availability slot CRUD |
| 24. Shifts | SHIFT-01 to SHIFT-10 | 10 | High | 20 shift creation, assignment, check-in/out, hours |
| 25-27. Field Mode | FIELD-01 to FIELD-10 | 10 | High | Canvassing wizard, phone banking, tap-to-call |
| 28. Offline | OFFLINE-01 to OFFLINE-03 | 3 | Medium | Network simulation, queue verification |
| 29. Tour | TOUR-01 to TOUR-03 | 3 | Low | driver.js tour verification |
| 30. Navigation | NAV-01 to NAV-03 | 3 | Low | Sidebar links, breadcrumbs |
| 31. Empty States | UI-01 to UI-03 | 3 | Low | Empty page messages, loading, error boundary |
| 32. Dashboards | DRILL-01 to DRILL-03 | 3 | Low | Canvassing/phone/volunteer overviews |
| 33. Accessibility | A11Y-01 to A11Y-03 | 3 | Medium | Keyboard nav, touch targets, ARIA |
| 34. Cross-Cutting | CROSS-01 to CROSS-03 | 3 | Medium | Form guards, toasts, rate limiting |
| **TOTAL** | | **~130** | | |

## Existing Test Infrastructure (What We Start With)

| Component | Current State | Needed Changes |
|-----------|---------------|----------------|
| `playwright.config.ts` | 3 auth projects (default, orgadmin, volunteer), Chromium only, HTTPS preview server | Add owner, admin, manager, viewer projects. Keep Chromium only. |
| Auth setup files | 3 files: `auth.setup.ts`, `auth-orgadmin.setup.ts`, `auth-volunteer.setup.ts` | Add `auth-owner.setup.ts`, `auth-admin.setup.ts`, `auth-manager.setup.ts`, `auth-viewer.setup.ts` |
| E2E user provisioning | `scripts/create-e2e-users.py` -- 2 users (orgadmin, volunteer) | Expand to 15 users, add campaign membership, add all 5 role levels |
| Existing spec files | 51 files, ~293 test/describe references | Keep as-is. New specs organized by testing plan section numbers. |
| Page Object Model | None -- all specs use inline locators | Do not introduce POM for this milestone. Consistency with existing style. |
| Fixtures | None -- no custom fixtures | Consider a shared auth fixture for role-specific contexts, but keep simple. |
| Test data | `scripts/seed.py` -- Macon-Bibb demo dataset | Sufficient. New tests create and clean up their own data on top of seed. |
| pytest tests | 56 unit + 10 integration tests | No changes needed. E2E tests are a separate concern. |

## Small Feature Builds Required

### 1. Voter Interaction (Note) Edit and Delete

**What:** PATCH and DELETE endpoints for interactions of type "note" plus Edit/Delete UI buttons in the voter detail History tab.

**Scope:**
- Backend: Add `update_interaction()` and `delete_interaction()` to `VoterInteractionService`. Add PATCH and DELETE routes to `app/api/v1/voter_interactions.py`. Only allow mutation of `note` type interactions -- system interactions (import, tag_added, etc.) remain immutable.
- Frontend: Add Edit and Delete icon buttons to note rows in the History tab. Edit opens an inline editor or sheet. Delete shows a ConfirmDialog.
- Tests: NOTE-02 (edit 10 notes) and NOTE-03 (delete 100 notes).

**Complexity:** Low-Medium. 2 API endpoints + 2 UI buttons + confirmation dialog.

### 2. Walk List Rename UI

**What:** Frontend UI to rename a walk list. The backend PATCH endpoint already exists.

**Scope:**
- Frontend: Add an edit action to the walk list row in the canvassing index page (pencil icon in the action menu or inline edit). Opens a rename dialog or inline text input. Calls existing PATCH endpoint.
- Tests: WL-05 (rename walk list).

**Complexity:** Low. 1 dialog/inline edit component. Backend already done.

## Sources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices) -- Official Playwright documentation
- [Playwright Authentication](https://playwright.dev/docs/auth) -- Multi-role auth setup patterns
- [Playwright Fixtures](https://playwright.dev/docs/test-fixtures) -- Fixture patterns for test setup
- [Playwright Page Object Models](https://playwright.dev/docs/pom) -- POM documentation
- [ZITADEL Create Human User API](https://zitadel.com/docs/apis/resources/user_service_v2/user-service-add-human-user) -- User provisioning v2 API
- [ZITADEL Register and Create User Guide](https://zitadel.com/docs/guides/manage/user/reg-create-user) -- User creation patterns
- [Building Comprehensive E2E Suite with Playwright](https://dev.to/bugslayer/building-a-comprehensive-e2e-test-suite-with-playwright-lessons-from-100-test-cases-171k) -- Lessons from 100+ test cases
- [Playwright E2E Testing: 12 Best Practices](https://elionavarrete.com/blog/e2e-best-practices-playwright.html) -- Current best practices
- [5 Ways to Handle Test Data in Playwright](https://dev.to/testdino01/5-ways-to-handle-test-data-in-playwright-1l32) -- Test data management strategies
- Codebase analysis: `web/playwright.config.ts`, `web/e2e/auth.setup.ts`, `web/e2e/auth-orgadmin.setup.ts`, `web/e2e/auth-volunteer.setup.ts`, `scripts/create-e2e-users.py`, `docs/testing-plan.md`
