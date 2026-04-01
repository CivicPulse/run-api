# Phase 60: E2E Field Mode, Cross-Cutting & Validation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

All E2E tests pass at 100% against local Docker Compose. This phase writes Playwright specs for field mode (volunteer hub, canvassing wizard, phone banking, offline queue, onboarding tour) and cross-cutting UI behaviors (navigation, empty states, loading skeletons, error boundaries, form guards, toasts). After writing specs, a test-fix-retest cycle brings the full suite to 100% pass rate. Discovered app bugs are tracked in a markdown file and fixed in a sub-phase.

</domain>

<decisions>
## Implementation Decisions

### Offline Simulation
- **D-01:** Use Playwright's `context.setOffline(true)` to simulate network disconnection for OFFLINE-01 through OFFLINE-03. This triggers `navigator.onLine=false` which the existing OfflineBanner component watches.
- **D-02:** Offline queue count (OFFLINE-02) verified via UI assertion only — assert the visible "N pending" indicator. No localStorage inspection.
- **D-03:** Auto-sync verification (OFFLINE-03) uses `page.waitForResponse()` after `context.setOffline(false)` to intercept sync API calls and confirm 2xx responses. Confirms actual server sync.

### Field Mode Viewport & Auth
- **D-04:** Field mode specs use iPhone 14 viewport (390x844) with touch emulation (`hasTouch: true`). Playwright's built-in iPhone 14 device profile provides both.
- **D-05:** Field mode specs use `.volunteer.spec.ts` suffix, running under volunteer1@localhost auth. Volunteers are the primary field mode users — this tests that volunteer permissions are sufficient for all field operations.

### Bug Fix Cycle
- **D-06:** Write all new specs (field mode + cross-cutting) first, then run the full suite to collect all failures, then batch-fix in a dedicated round. No context-switching between writing and fixing.
- **D-07:** App bugs discovered during testing are tracked in `60-BUGS.md` in the phase directory (spec name, failure description, severity). Fixes go into a sub-phase (60.1), not inline in Phase 60.
- **D-08:** Failing tests that are caused by app bugs (not test bugs) should use `test.skip()` with a comment referencing the bug ID in 60-BUGS.md, so the full suite can still report a clean pass for non-bug-related specs.

### Old Spec Cleanup
- **D-09:** Cleanup happens AFTER new Phase 60 specs pass. Write new specs first, verify they work, then review old specs.
- **D-10:** Delete old specs only where the new spec covers 100% of the same assertions. For old specs with unique coverage not present in new specs, absorb those unique test cases into the new canonical spec for that domain, then delete the old spec.
- **D-11:** Old specs in scope for review: `phase30-field-layout.spec.ts`, `phase31-canvassing.spec.ts`, `phase33-offline-sync.spec.ts`, `tour-onboarding.spec.ts`, `phase35-milestone-toasts.spec.ts`, `phase35-touch-targets.spec.ts`, `phase35-voter-context.spec.ts`, `phase36-navigate.spec.ts`, `uat-empty-states.spec.ts`, `uat-sidebar-overlay.spec.ts`, `uat-tooltip-popovers.spec.ts`.

### Carrying Forward from Phase 57/58/59
- **D-12:** Auth suffix convention for role-based routing (`.volunteer.spec.ts` etc.). Unsuffixed = owner.
- **D-13:** Domain-based naming (no phase prefix).
- **D-14:** Hybrid data strategy: seed data for reads, fresh entities for mutations.
- **D-15:** Serial within spec (`test.describe.serial`), parallel across spec files.
- **D-16:** No cleanup — fresh environment per CI run.
- **D-17:** API-based bulk entity creation for speed.

### Claude's Discretion
- Exact spec file organization (how many files for field mode vs cross-cutting)
- Which test cases from old specs qualify as "unique coverage" to absorb
- How to structure the Playwright project config for the mobile viewport (separate project or per-spec use())
- Severity classification criteria for 60-BUGS.md entries
- How to handle the cross-cutting specs (NAV, UI, CROSS test cases) — single file or split by concern

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Testing Plan
- `docs/testing-plan.md` — Comprehensive E2E testing plan. Phase 60 covers: Section 25 (Field Mode: FIELD-01 to FIELD-10), Section 26 (Offline: OFFLINE-01 to OFFLINE-03), Section 27 (Onboarding Tour: TOUR-01 to TOUR-03), Section 28 (Navigation: NAV-01 to NAV-03), Section 29 (UI Polish: UI-01 to UI-03), Section 30 (Cross-Cutting: CROSS-01 to CROSS-03)

### Field Mode Components
- `web/src/components/field/OfflineBanner.tsx` — Offline detection component using navigator.onLine
- `web/src/components/field/FieldHeader.tsx` — Field mode header with navigation
- `web/src/components/field/HouseholdCard.tsx` — Household grouping for canvassing
- `web/src/components/field/OutcomeGrid.tsx` — Door knock outcome selection
- `web/src/components/field/CallingVoterCard.tsx` — Phone banking voter card
- `web/src/components/field/InlineSurvey.tsx` — Survey integration in field mode
- `web/src/components/field/FieldEmptyState.tsx` — Empty state for field mode

### Field Mode Routes
- `web/src/routes/field/$campaignId.tsx` — Field mode layout shell
- `web/src/routes/field/$campaignId/index.tsx` — Volunteer hub / assignment list
- `web/src/routes/field/$campaignId/canvassing.tsx` — Canvassing wizard
- `web/src/routes/field/$campaignId/phone-banking.tsx` — Phone banking mode

### Cross-Cutting Components
- `web/src/components/shared/RouteErrorBoundary.tsx` — Error boundary for route-level errors
- `web/src/components/shared/EmptyState.tsx` — Reusable empty state component
- `web/src/components/shared/DataTable.tsx` — Data table with loading skeletons

### Existing Test Infrastructure (from Phase 57)
- `web/playwright.config.ts` — Playwright config with 5 role-based auth projects and shard support
- `scripts/create-e2e-users.py` — 15-user provisioning script with campaign membership

### Phase 58/59 Spec Patterns
- `web/e2e/voter-crud.spec.ts` — API helper pattern, navigateToSeedCampaign(), serial describes
- `web/e2e/phone-banking.spec.ts` — Phone banking test patterns

### Old Specs to Review for Cleanup
- `web/e2e/phase30-field-layout.spec.ts` — Old field layout verification
- `web/e2e/phase31-canvassing.spec.ts` — Old canvassing verification
- `web/e2e/phase33-offline-sync.spec.ts` — Old offline sync verification
- `web/e2e/tour-onboarding.spec.ts` — Old onboarding tour tests
- `web/e2e/phase35-milestone-toasts.spec.ts` — Old milestone toast tests
- `web/e2e/phase35-touch-targets.spec.ts` — Old touch target tests
- `web/e2e/phase35-voter-context.spec.ts` — Old voter context card tests
- `web/e2e/phase36-navigate.spec.ts` — Old navigation tests
- `web/e2e/uat-empty-states.spec.ts` — Old empty states UAT
- `web/e2e/uat-sidebar-overlay.spec.ts` — Old sidebar overlay UAT
- `web/e2e/uat-tooltip-popovers.spec.ts` — Old tooltip/popover UAT

### Seed Data
- `scripts/seed.py` — Idempotent Macon-Bibb County demo dataset (50 voters, 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 20 field mode components in `web/src/components/field/` — FieldHeader, OfflineBanner, HouseholdCard, OutcomeGrid, DoorListView, CallingVoterCard, InlineSurvey, CompletionSummary, etc.
- `RouteErrorBoundary` component at `web/src/components/shared/RouteErrorBoundary.tsx` — wraps route-level error handling
- `EmptyState` component at `web/src/components/shared/EmptyState.tsx` — reusable empty state with icon, title, description, action
- `FieldEmptyState` at `web/src/components/field/FieldEmptyState.tsx` — field-mode-specific empty state
- driver.js onboarding integration across 10 files — tour state persistence and help button replay
- Phase 58/59 API helpers: `createVoterViaApi()`, `navigateToSeedCampaign()` — reusable across Phase 60 specs
- Seed data: 50 voters, 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts

### Established Patterns
- Role-suffix convention: `.volunteer.spec.ts` routes to volunteer auth project
- Auth via `storageState` files in `playwright/.auth/`
- Locator strategy: `page.getByRole()`, `page.getByLabel()`, `page.getByText()`
- Wait patterns: `page.waitForURL()`, `expect().toBeVisible({ timeout })`
- Response interception: `page.waitForResponse()` for API call verification
- `test.describe.serial` for ordered lifecycle flows
- Playwright built-in device profiles (iPhone 14) for mobile viewport + touch emulation

### Integration Points
- New specs go in `web/e2e/` alongside Phase 58/59 specs
- Playwright config may need a mobile viewport project or per-spec `test.use()` for iPhone 14
- Old phase-verification specs get reviewed post-completion, unique coverage absorbed, then deleted
- CI sharding (4 shards) automatically distributes new specs

</code_context>

<specifics>
## Specific Ideas

- Field mode specs run at iPhone 14 viewport (390x844) with hasTouch: true, under volunteer auth
- Offline tests use context.setOffline(true/false) — the simplest and most reliable Playwright approach
- Sync verification waits for actual API responses, not just UI state changes
- Bug tracking via 60-BUGS.md with structured entries (spec, description, severity)
- App bug fixes go to a separate sub-phase (60.1), not inline — keeps Phase 60 focused on spec writing
- Old spec cleanup is the LAST step — only after new specs are verified passing

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 60-e2e-field-mode-cross-cutting-validation*
*Context gathered: 2026-03-29*
