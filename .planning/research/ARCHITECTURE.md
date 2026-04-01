# Architecture Patterns

**Domain:** Comprehensive E2E Testing Pipeline for Multi-Tenant Campaign Operations Platform
**Researched:** 2026-03-29

## Recommended Architecture

The v1.7 testing milestone integrates three layers into the existing codebase: (1) small feature additions (voter note CRUD, walk list rename), (2) a massively expanded Playwright E2E test suite (~130 new tests across 34 sections), and (3) AI production testing instructions. Each layer builds on the prior.

### System Context

```
Existing Infrastructure (unchanged)
  FastAPI + Worker | PostgreSQL + PostGIS | MinIO | ZITADEL (OIDC)
  React SPA (TanStack Router/Query, shadcn/ui)

v1.7 Additions

  Layer 1: Feature Additions (backend + frontend)
    PATCH/DELETE /voters/{id}/interactions/{id} (note type only)
    PATCH /walk-lists/{id} (rename)
    HistoryTab: Edit/Delete buttons for notes
    WalkList: Rename UI (inline or dialog)

  Layer 2: Test Infrastructure
    scripts/provision-e2e-users.py (15 ZITADEL users)
    Playwright config: 5-6 auth projects (role-based)
    web/e2e/helpers/ (shared fixtures, test data constants)
    web/e2e/ (~30 new spec files, ~130 test cases)

  Layer 3: Production Testing
    docs/ai-production-testing.md (instruction set)
```

### Component Boundaries

| Component | Responsibility | Communicates With | New vs Modified |
|-----------|---------------|-------------------|-----------------|
| `scripts/provision-e2e-users.py` | Create 15 ZITADEL test users with correct roles, insert org/campaign memberships | ZITADEL Management API, PostgreSQL | **NEW** (extends pattern from `create-e2e-users.py`) |
| `app/api/v1/voter_interactions.py` | Add PATCH and DELETE endpoints for note-type interactions | VoterInteractionService, PostgreSQL | **MODIFIED** (2 new endpoints) |
| `app/services/voter_interaction.py` | Add `update_note()` and `delete_note()` methods | SQLAlchemy models | **MODIFIED** (2 new methods) |
| `app/schemas/voter_interaction.py` | Add `InteractionUpdateRequest` schema | Pydantic | **MODIFIED** (1 new schema) |
| `app/models/voter_interaction.py` | Add `updated_at` nullable column | Alembic migration | **MODIFIED** (1 new column) |
| `app/api/v1/walk_lists.py` | Add PATCH endpoint for walk list name | WalkListService | **MODIFIED** (1 new endpoint) |
| `app/services/walk_list.py` | Add `update_walk_list()` method | SQLAlchemy models | **MODIFIED** (1 new method) |
| `app/schemas/walk_list.py` | Add `WalkListUpdateRequest` schema | Pydantic | **MODIFIED** (1 new schema) |
| `web/src/components/voters/HistoryTab.tsx` | Add Edit/Delete buttons for note interactions | useVoters hooks | **MODIFIED** |
| `web/src/hooks/useVoters.ts` | Add `useUpdateInteraction`, `useDeleteInteraction` mutations | API client (ky) | **MODIFIED** |
| `web/src/hooks/useWalkLists.ts` | Add `useRenameWalkList` mutation | API client (ky) | **MODIFIED** |
| Walk list detail/index page(s) | Add rename action (inline edit or dialog) | useWalkLists hooks | **MODIFIED** |
| `web/playwright.config.ts` | Expand projects for 5-6 role-based auth setups | Auth setup files | **MODIFIED** |
| `web/e2e/auth-*.setup.ts` | New setup files per role (owner, admin, manager, volunteer, viewer) | ZITADEL OIDC login flow | **NEW** (2-3 new files, extend existing 3) |
| `web/e2e/helpers/` | Shared test data constants, navigation helpers | Playwright API | **NEW** directory |
| `web/e2e/v17-*.spec.ts` | ~30 new spec files covering 34 testing-plan sections | SPA via Playwright | **NEW** (~30 files) |
| `docs/ai-production-testing.md` | AI-readable production test instructions | Human/AI reader | **NEW** |
| `.github/workflows/pr.yml` | Update E2E step for expanded user provisioning and test suite | Docker Compose, Playwright | **MODIFIED** |

---

## Feature Integration: Voter Note Edit/Delete

### Current Architecture (append-only)

The voter interaction system is intentionally append-only:
- Model: `VoterInteraction` has no `updated_at` column; docstring says "Events are never modified or deleted"
- API: Only `GET` (list) and `POST` (create note) endpoints exist in `voter_interactions.py`
- Schema: `InteractionCreateRequest` (type + payload), `InteractionResponse`
- Frontend: `HistoryTab.tsx` renders a flat list of interactions with "Add Note" form

### Proposed Changes

Edit and delete for **note-type interactions only**. System-generated interactions (import, tag_added, door_knock, phone_call, survey_response) remain immutable.

**Backend:**

1. **Model:** Add `updated_at: Mapped[datetime | None]` column (nullable, default None). Requires Alembic migration. Keep `created_at` unchanged.

2. **Service:** Add two methods to `VoterInteractionService`:
   - `update_note(session, interaction_id, voter_id, campaign_id, payload, user_id)` -- verifies `type == "note"`, returns 400 otherwise
   - `delete_note(session, interaction_id, voter_id, campaign_id)` -- verifies `type == "note"`, returns 400 otherwise

3. **API:** Add to `voter_interactions.py`:
   - `PATCH .../interactions/{interaction_id}` -- updates note text, sets `updated_at`, requires volunteer+ role
   - `DELETE .../interactions/{interaction_id}` -- hard-deletes note, requires manager+ role

4. **Schema:** Add `InteractionUpdateRequest` with `payload: dict` field.

5. **Rate limiting:** Apply `@limiter.limit("30/minute")` (consistent with POST endpoint).

**Frontend:**

1. **Hooks** (`useVoters.ts`): Add `useUpdateInteraction` and `useDeleteInteraction` mutations, invalidating the voter interactions query key on success.

2. **HistoryTab.tsx**: Add conditional Edit/Delete buttons on note-type interactions only:
   - Edit: Opens inline editing (textarea replaces text display)
   - Delete: Uses existing `ConfirmDialog` pattern
   - Both gated by role (volunteer+ for edit, manager+ for delete)
   - Show "(edited)" indicator when `updated_at` is non-null

**Confidence:** HIGH -- follows existing patterns exactly. System interactions remain immutable.

---

## Feature Integration: Walk List Rename

### Current Architecture

- Model: `WalkList` has `name: Mapped[str]` column
- Service: `WalkListService` has no `update_walk_list()` method
- API: No PATCH endpoint for walk list metadata (only PATCH for entry status)
- Frontend: `useWalkLists.ts` hook, `$walkListId.tsx` detail page, canvassing index

### Proposed Changes

**Backend:**
1. **Service:** Add `update_walk_list(session, walk_list_id, name)` to `WalkListService`
2. **Schema:** Add `WalkListUpdateRequest` with optional `name: str | None` field
3. **API:** Add `PATCH /campaigns/{campaign_id}/walk-lists/{walk_list_id}` -- requires manager+ role

**Frontend:**
1. **Hook:** Add `useRenameWalkList` mutation to `useWalkLists.ts`
2. **UI:** Add rename action to walk list detail page header or canvassing index row actions

**Confidence:** HIGH -- trivial CRUD addition.

---

## Test Infrastructure Architecture

### Test User Provisioning

**Current state:** `scripts/create-e2e-users.py` creates 2 users (orgadmin, volunteer) via ZITADEL Management API + direct PostgreSQL inserts for org membership. The testing plan requires 15 users across 5 campaign roles and 2 org roles.

**Data flow for provisioning:**

```
provision-e2e-users.py
  1. ZITADEL Management API: Create 15 human users
     (idempotent: skip if username exists)
  2. ZITADEL Management API: Grant project roles per user
     (owner/admin/manager/volunteer/viewer)
  3. PostgreSQL: Upsert into users table (15 rows)
  4. PostgreSQL: Ensure E2E test organization exists
  5. PostgreSQL: Ensure E2E test campaign exists
  6. PostgreSQL: Insert organization_members (org_owner x3, org_admin x3)
  7. PostgreSQL: Insert campaign_members with roles (15 rows)
```

**Important constraint:** ZITADEL project roles and CivicPulse campaign roles are separate. ZITADEL roles grant API-level access; campaign roles live in `campaign_members`. The provisioning script must set both. The existing `create-e2e-users.py` demonstrates this dual-write pattern (ZITADEL API + psycopg2).

### Multi-Role Auth via Playwright Projects

The existing Playwright config defines 3 auth projects (setup, setup-orgadmin, setup-volunteer) and 3 test runner projects. Expand to 5 roles.

**Recommended hybrid approach:**

1. Keep 3 existing projects intact for backward compatibility with 51 existing specs.
2. Add new auth setup files for manager and viewer roles.
3. New spec files use role suffix convention (e.g., `v17-rbac.viewer.spec.ts`) to route to correct project.
4. Tests needing multiple roles within one spec use `browser.newContext()` with different storageState files.

```typescript
// playwright.config.ts additions
projects: [
  // Existing setup projects (keep as-is)
  { name: "setup", testMatch: /auth\.setup\.ts/ },
  { name: "setup-orgadmin", testMatch: /auth-orgadmin\.setup\.ts/ },
  { name: "setup-volunteer", testMatch: /auth-volunteer\.setup\.ts/ },

  // NEW setup projects
  { name: "setup-manager", testMatch: /auth-manager\.setup\.ts/ },
  { name: "setup-viewer", testMatch: /auth-viewer\.setup\.ts/ },

  // Existing test projects (keep as-is)
  { name: "chromium", ... },
  { name: "orgadmin", ... },
  { name: "volunteer", ... },

  // NEW test projects
  {
    name: "manager",
    use: { storageState: "playwright/.auth/manager.json" },
    dependencies: ["setup-manager"],
    testMatch: /.*\.manager\.spec\.ts/,
  },
  {
    name: "viewer",
    use: { storageState: "playwright/.auth/viewer.json" },
    dependencies: ["setup-viewer"],
    testMatch: /.*\.viewer\.spec\.ts/,
  },
]
```

**Confidence:** HIGH -- directly from Playwright official docs and extends the existing pattern.

### Spec File Organization

New spec files use a `v17-` prefix to distinguish from existing milestone specs and enable running the full v1.7 suite with `npx playwright test v17-`. Each file maps to one or more testing-plan sections.

```
web/e2e/
  # Existing (51 files, do NOT rename or reorganize)
  a11y-scan.spec.ts
  connected-journey.spec.ts
  login.spec.ts
  ... (48 more)

  # NEW: Auth setup files
  auth-manager.setup.ts
  auth-viewer.setup.ts

  # NEW: Helpers
  helpers/
    test-data.ts             # User credentials, campaign names, constants
    navigation.ts            # Shared goto-campaign, goto-voter helpers

  # NEW: v1.7 test specs (~30 files)
  v17-auth.spec.ts                    # Section 2: AUTH-01..04
  v17-rbac.owner.spec.ts              # Section 3: RBAC as owner
  v17-rbac.admin.spec.ts              # Section 3: RBAC as admin
  v17-rbac.manager.spec.ts            # Section 3: RBAC as manager
  v17-rbac.volunteer.spec.ts          # Section 3: RBAC as volunteer
  v17-rbac.viewer.spec.ts             # Section 3: RBAC as viewer
  v17-org.spec.ts                     # Section 4: ORG-01..08
  v17-campaign-settings.spec.ts       # Section 5: CAMP-01..06
  v17-dashboard.spec.ts               # Section 6: DASH-01..02
  v17-import.spec.ts                  # Section 7: IMP-01..04
  v17-data-validation.spec.ts         # Section 8: VAL-01..02
  v17-voter-search.spec.ts            # Section 9: FLT-01..05
  v17-voter-crud.spec.ts              # Section 10: VCRUD-01..04
  v17-voter-contacts.spec.ts          # Section 11: CON-01..06
  v17-voter-tags.spec.ts              # Section 12: TAG-01..05
  v17-voter-notes.spec.ts             # Section 13: NOTE-01..03
  v17-voter-lists.spec.ts             # Section 14: VLIST-01..06
  v17-turfs.spec.ts                   # Section 15: TURF-01..07
  v17-walk-lists.spec.ts              # Section 16: WL-01..07
  v17-call-lists.spec.ts              # Section 17: CL-01..05
  v17-dnc.spec.ts                     # Section 18: DNC-01..06
  v17-phone-sessions.spec.ts          # Section 19: PB-01..10
  v17-surveys.spec.ts                 # Section 20: SRV-01..08
  v17-volunteers.spec.ts              # Section 21: VOL-01..08
  v17-volunteer-tags.spec.ts          # Section 22: VTAG-01..05
  v17-availability.spec.ts            # Section 23: AVAIL-01..03
  v17-shifts.spec.ts                  # Section 24: SHIFT-01..10
  v17-field-hub.spec.ts               # Section 25: FIELD-01..02
  v17-field-canvassing.spec.ts        # Section 26: FIELD-03..07
  v17-field-phone.spec.ts             # Section 27: FIELD-08..10
  v17-offline.spec.ts                 # Section 28: OFFLINE-01..03
  v17-tour.spec.ts                    # Section 29: TOUR-01..03
  v17-navigation.spec.ts              # Section 30: NAV-01..03
  v17-empty-states.spec.ts            # Section 31: UI-01..03
  v17-dashboard-drilldown.spec.ts     # Section 32: DRILL-01..03
  v17-a11y-spot.spec.ts               # Section 33: A11Y-01..03
  v17-cross-cutting.spec.ts           # Section 34: CROSS-01..03
```

---

## Serial vs Parallel Test Groups

Most testing-plan sections have **state dependencies** (e.g., VCRUD-01 creates voters that VCRUD-02 edits). These must run as `test.describe.serial()` within a spec file. Different spec files can run in parallel.

**Serial chains (within one spec file using `test.describe.configure({ mode: "serial" })`):**
- Voter CRUD: create 20 -> edit 5 -> delete 5 -> delete 20
- Voter Tags: create tags -> assign -> validate -> remove -> delete tags
- Voter Notes: create notes -> edit notes -> delete notes
- Turfs: create non-overlapping -> create overlapping -> edit -> delete
- Walk Lists: generate -> view -> assign -> rename -> delete
- Phone Banking: create sessions -> assign callers -> active calling -> progress
- Volunteers: register -> roster -> detail -> edit -> delete
- Shifts: create -> assign -> check-in -> check-out -> hours -> delete

**Fully parallel (independent spec files):**
- Auth tests (section 2)
- Campaign Dashboard (section 6)
- Empty states (section 31)
- Navigation (section 30)
- A11y spot checks (section 33)

**Data-dependent chains (must run after voter import):**
- Voter Data Validation (section 8) depends on IMP-01
- Voter Search/Filter (section 9) depends on imported voters
- Voter Contacts (section 11) needs existing voters

**Recommendation:** Use `test.describe.configure({ mode: "serial" })` for intra-section ordering. Use `fullyParallel: true` (already configured) for inter-file parallelism. For cross-file dependencies, either combine into the same file or ensure the prerequisite data exists via seed data (not via another spec's side effects).

---

## Data Flow for Test Execution

### E2E Test Lifecycle

```
1. Docker Compose up (api, postgres, minio, zitadel, worker)
2. Alembic migrations (includes new updated_at column)
3. Seed data (seed.py -- 551 voters, turfs, etc.)
4. Provision E2E users (provision-e2e-users.py -- 15 users in ZITADEL + DB)
5. Playwright auth setup projects (5 parallel)
     auth.setup.ts (owner) -> playwright/.auth/user.json
     auth-manager.setup.ts -> playwright/.auth/manager.json
     auth-volunteer.setup.ts -> playwright/.auth/volunteer.json
     auth-viewer.setup.ts -> playwright/.auth/viewer.json
     auth-orgadmin.setup.ts -> playwright/.auth/orgadmin.json
6. Playwright test execution (parallel across files, serial within files)
7. Test data cleanup (handled within serial test groups)
8. Playwright report generation -> artifacts upload
```

---

## CI/CD Integration

### Current CI Pipeline

The existing `pr.yml` workflow starts Docker Compose, waits for ZITADEL, runs migrations + seed, creates 2 E2E test users, runs integration tests, installs Playwright, runs E2E tests, and uploads reports/traces.

### Required Changes

1. **User provisioning step:** Replace `create-e2e-users.py` invocation with expanded `provision-e2e-users.py` (or extend existing script)
2. **Environment variables:** Add credentials for 5 role-based auth setups
3. **Test timeout:** Full ~180-test suite will take significantly longer
4. **Sharding:** Recommended 3 parallel shard jobs: `npx playwright test --shard=1/3`
5. **Backward compatibility:** All 51 existing specs must continue to pass

### Sharding Strategy

Playwright's built-in sharding distributes test files (not individual tests) across shards, maintaining serial ordering within files.

```yaml
e2e-shard-1:
  run: npx playwright test --shard=1/3
e2e-shard-2:
  run: npx playwright test --shard=2/3
e2e-shard-3:
  run: npx playwright test --shard=3/3
```

---

## Patterns to Follow

### Pattern 1: Serial CRUD Lifecycle Tests

Each spec file covers one testing-plan section. Tests within use serial mode for state-dependent chains.

```typescript
// v17-voter-notes.spec.ts
test.describe.configure({ mode: "serial" })

test.describe("Voter Notes (Section 13)", () => {
  test("NOTE-01: Add 5 notes to 20 voters", async ({ page }) => { /* ... */ })
  test("NOTE-02: Edit notes", async ({ page }) => { /* depends on NOTE-01 */ })
  test("NOTE-03: Delete notes", async ({ page }) => { /* depends on NOTE-01+02 */ })
})
```

### Pattern 2: Role-Switching via Browser Contexts

Tests verifying RBAC create multiple browser contexts with different auth states within a single test.

```typescript
test("RBAC-03: Viewer cannot access mutation actions", async ({ browser }) => {
  const viewerCtx = await browser.newContext({
    storageState: "playwright/.auth/viewer.json",
  })
  const page = await viewerCtx.newPage()
  await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
  await expect(page.getByRole("button", { name: /add voter/i })).toBeHidden()
  await viewerCtx.close()
})
```

### Pattern 3: ZITADEL User Creation via Management API v1

Extend the proven pattern from `create-e2e-users.py`: create user, grant project role, insert org/campaign memberships. All idempotent via `ON CONFLICT` and ZITADEL 409 handling.

### Pattern 4: Test Step Organization

Use `test.step()` within long tests for clear failure diagnostics and report readability.

```typescript
test("IMP-01: Import L2 voter file", async ({ page }) => {
  await test.step("Upload CSV file", async () => { /* ... */ })
  await test.step("Verify L2 auto-detection", async () => { /* ... */ })
  await test.step("Start import and track progress", async () => { /* ... */ })
})
```

### Pattern 5: API Cleanup in afterAll

Use direct API calls (via `page.request`) in `afterAll` hooks for fast, reliable test data cleanup instead of clicking through UI delete flows.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: One Test Per File
Creating 130 individual spec files causes parallel workers to simultaneously CRUD on the same campaign, causing race conditions. Group by testing-plan section.

### Anti-Pattern 2: Cross-Spec Data Dependencies
Spec file A creates data that spec file B depends on. Since inter-file execution order is not guaranteed with parallel execution, each spec must be self-contained. Only depend on seed data.

### Anti-Pattern 3: Hardcoded Campaign/Voter UUIDs
IDs are generated fresh each run. Navigate by name/text content, extract IDs from URLs dynamically.

### Anti-Pattern 4: Page Object Model for This Milestone
The 51 existing specs use inline locators. Introducing POMs creates two patterns. At ~80 total specs, inline locators remain manageable. Adopt POMs in a future refactor if spec count exceeds 100+.

### Anti-Pattern 5: Testing ZITADEL Internals
Do not assert on JWT claims, OIDC redirect parameters, or session tokens. Assert on user-visible outcomes: display name visible, redirect to dashboard, edit button hidden for viewer.

---

## Suggested Build Order

**Phase 1: Feature Additions** (no test dependencies)
- 1a. Backend: Voter note PATCH/DELETE + Alembic migration (updated_at column)
- 1b. Backend: Walk list PATCH (rename) + schema
- 1c. Frontend: HistoryTab edit/delete UI
- 1d. Frontend: Walk list rename UI
- 1e. Unit tests for new endpoints

**Phase 2: Test Infrastructure Foundation**
- 2a. Expand provisioning script (15 users)
- 2b. Create helpers/ directory (test-data.ts, navigation.ts)
- 2c. New auth setup files (manager, viewer)
- 2d. Update playwright.config.ts
- 2e. Verify all auth setups work locally

**Phase 3: Core E2E Tests** (high-value, validates infrastructure)
- auth, rbac, org-management, campaign-settings, campaign-dashboard, navigation, empty-states

**Phase 4: Voter Workflow Tests** (data-heavy)
- voter-import (extend existing), data-validation, voter-search, voter-crud, voter-contacts, voter-tags, voter-notes, voter-lists

**Phase 5: Operations Tests** (canvassing, phone banking)
- turfs, walk-lists, call-lists, dnc, phone-sessions, surveys

**Phase 6: Volunteer and Field Tests**
- volunteers, volunteer-tags, availability, shifts, field-hub, field-canvassing, field-phone, offline, tour

**Phase 7: Cross-Cutting and Polish**
- a11y-spot-checks, cross-cutting, dashboard-drilldowns, CI pipeline updates (sharding, env vars)

**Phase 8: Production Testing and Iteration**
- docs/ai-production-testing.md, run full suite, fix-and-retest cycles, final CI validation

**Phase ordering rationale:**
- Phase 1 first because Phases 4 and 5 test the new features (notes, walk list rename)
- Phase 2 before all test phases because every spec depends on provisioning and auth infrastructure
- Phase 3 before Phase 4 because RBAC validation confirms role-gated operations work before testing at scale
- Phase 4 before 5 because canvassing and phone banking depend on imported voters
- Phase 6 depends on Phase 5 (walk lists, phone bank sessions must exist for field mode)
- Phase 7 is cross-cutting and runs after feature-specific tests
- Phase 8 is last -- cannot iterate on failures until suite exists

---

## Scalability Considerations

| Concern | Current (51 specs) | After v1.7 (~80 specs) | Future (100+ specs) |
|---------|---------------------|------------------------|---------------------|
| CI runtime | ~5 min | ~15-20 min single worker | Use sharding (3 shards ~7 min) |
| Auth setup | 3 projects | 5-6 projects | Consider token-based auth bypass |
| Data isolation | Shared seed data | Self-cleaning serial chains | Per-shard isolated campaigns |
| Flaky tests | retries: 2 in CI | Same, add test tagging | Quarantine with `test.fixme()` |

---

## Sources

- [Playwright Official Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Authentication Docs](https://playwright.dev/docs/auth)
- [Playwright Global Setup and Teardown](https://playwright.dev/docs/test-global-setup-teardown)
- [Playwright Parallelism](https://playwright.dev/docs/test-parallel)
- [15 Best Practices for Playwright Testing 2026 (BrowserStack)](https://www.browserstack.com/guide/playwright-best-practices)
- [ZITADEL Management API v1](https://zitadel.com/docs/reference/api/management/zitadel.management.v1.ManagementService.ImportHumanUser)
- Existing codebase: `scripts/create-e2e-users.py`, `web/playwright.config.ts`, `web/e2e/auth*.setup.ts`, `app/api/v1/voter_interactions.py`, `app/api/v1/walk_lists.py`
