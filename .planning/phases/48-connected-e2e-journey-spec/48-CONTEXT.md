# Phase 48: Connected E2E Journey Spec - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a single connected Playwright E2E spec that verifies the full user journey across phase boundaries: org dashboard → campaign creation → turf creation → voter search → phone bank session. This closes FLOW-01 from the v1.5 milestone audit. The spec runs in CI alongside the existing E2E suite.

</domain>

<decisions>
## Implementation Decisions

### Journey chaining strategy
- **D-01:** Single `test.describe.serial()` with ordered `test.step()` blocks inside a single test function. Playwright's `test.step()` provides clear labeling in trace/report output while keeping browser state continuous across steps. Serial mode ensures later steps don't run if earlier ones fail.

### Data creation vs seed data
- **D-02:** The journey creates fresh data at each step — a new campaign via the campaign creation wizard, a new turf on that campaign, then uses voter search and phone bank features on that campaign. This proves the full lifecycle works end-to-end rather than relying on pre-existing seed data.
- **D-03:** Auth uses the existing stored auth state from `auth.setup.ts` (Phase 46 D-02). The journey starts from the org dashboard as an authenticated user.

### Failure isolation
- **D-04:** Serial dependency — later steps depend on earlier steps. If campaign creation fails, turf/voter/phone bank steps are skipped. This is the correct behavior for a *connected* journey spec. Use `test.describe.serial()` to enforce this.

### Assertion depth
- **D-05:** Each journey step verifies: (1) navigation to the correct URL, (2) key UI element visible confirming the page loaded, (3) API success response where applicable (e.g., POST campaign returns 201). Enough to confirm the step completed without over-asserting implementation details.

### Spec file structure
- **D-06:** Single spec file: `web/e2e/connected-journey.spec.ts`. One file, one describe block, one test with multiple `test.step()` calls that share page state.

### Claude's Discretion
- Exact selectors and assertion targets per step
- Whether to use `page.waitForResponse()` or `page.waitForURL()` at each transition
- GeoJSON payload for turf creation step
- Which phone bank form fields to fill

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TEST-01 (Playwright E2E critical flows)

### Gap closure
- `.planning/ROADMAP.md` — Phase 48 definition, FLOW-01 gap reference

### Existing E2E patterns
- `web/e2e/login.spec.ts` — ZITADEL auth flow pattern, fresh browser context
- `web/e2e/turf-creation.spec.ts` — Turf creation via GeoJSON editor, campaign navigation pattern
- `web/e2e/voter-search.spec.ts` — Voter search with `waitForResponse`, seed data assertions
- `web/e2e/phone-bank.spec.ts` — Phone bank session CRUD, sidebar navigation to sessions
- `web/e2e/auth.setup.ts` — Stored auth state setup project

### Playwright config
- `web/playwright.config.ts` — Base URL, retries, webServer, projects, trace settings

### Phase 46 context (testing decisions)
- `.planning/phases/46-e2e-testing-integration/46-CONTEXT.md` — Auth state reuse (D-02), Docker Compose stack (D-03), auto-waiting (D-14), CI retries (D-15)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auth.setup.ts`: Stored auth state — journey spec uses the `authenticated` project dependency
- Existing individual flow specs: reference for selectors, navigation patterns, and API response assertions
- Seed data: org and user exist; campaign creation wizard tested in `phase-13-verification.spec.ts`

### Established Patterns
- Campaign navigation: `getByRole("link", { name: /macon|bibb|campaign/i }).first()` for seed campaign
- Sidebar navigation: `getByRole("link", { name: /canvassing|phone bank|voters/i }).first()`
- Form submission: fill inputs via `getByLabel()`, submit via `getByRole("button")`, verify redirect
- API verification: `page.waitForResponse()` for confirming backend operations

### Integration Points
- Playwright config `projects` array: journey spec runs in the `authenticated` project (depends on `auth.setup.ts`)
- CI workflow: spec discovered automatically by Playwright's glob pattern (`web/e2e/*.spec.ts`)
- Docker Compose: full stack must be running (API + DB + ZITADEL + frontend)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing E2E test patterns. The key value is proving that independently-built features compose into a working end-to-end user journey.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 48-connected-e2e-journey-spec*
*Context gathered: 2026-03-25*
