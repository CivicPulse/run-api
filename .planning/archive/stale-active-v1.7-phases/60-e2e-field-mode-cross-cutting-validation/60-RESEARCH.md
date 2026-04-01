# Phase 60: E2E Field Mode, Cross-Cutting & Validation - Research

**Researched:** 2026-03-29
**Domain:** Playwright E2E testing -- field mode (mobile viewport, offline, tour) and cross-cutting UI behaviors (navigation, empty states, error boundaries, form guards, toasts)
**Confidence:** HIGH

## Summary

Phase 60 writes Playwright E2E specs for two remaining test domains -- field mode (volunteer hub, canvassing wizard, phone banking, offline queue, onboarding tour) and cross-cutting UI behaviors (navigation, empty states, loading skeletons, error boundaries, form guards, toasts) -- then runs the full suite to achieve 100% pass rate, with any discovered app bugs tracked and fixed.

The project has well-established Playwright patterns from Phase 58/59: role-suffixed spec files, cookie-forwarding API helpers, `navigateToSeedCampaign()`, `test.describe.serial`, and hybrid data strategy (seed data for reads, API-created entities for mutations). Playwright 1.58.2 is installed with 5 auth projects (owner, admin, manager, volunteer, viewer). Field mode tests must run under the `volunteer` auth project (`.volunteer.spec.ts` suffix) and must set up walk list and session assignments for the test volunteer via API before testing the field hub.

A critical finding: the `devices['iPhone 14']` profile defaults to **webkit** browser, not Chromium. Since all other specs run in Chromium, field mode specs should use `test.use()` with manual viewport/touch settings (`viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true`) rather than importing the full device profile. This avoids introducing a webkit dependency and keeps the volunteer project consistent.

**Primary recommendation:** Write 2-3 new spec files (field-mode.volunteer.spec.ts, cross-cutting.spec.ts, and optionally navigation.spec.ts), using API setup to assign walk lists and phone bank sessions to the test volunteer, `context.setOffline()` for offline tests, and `localStorage` manipulation for tour state. Then run the full suite, track failures in 60-BUGS.md, fix app bugs in a sub-phase, and clean up old phase-prefixed specs last.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use Playwright's `context.setOffline(true)` to simulate network disconnection for OFFLINE-01 through OFFLINE-03. This triggers `navigator.onLine=false` which the existing OfflineBanner component watches.
- **D-02:** Offline queue count (OFFLINE-02) verified via UI assertion only -- assert the visible "N pending" indicator. No localStorage inspection.
- **D-03:** Auto-sync verification (OFFLINE-03) uses `page.waitForResponse()` after `context.setOffline(false)` to intercept sync API calls and confirm 2xx responses. Confirms actual server sync.
- **D-04:** Field mode specs use iPhone 14 viewport (390x844) with touch emulation (`hasTouch: true`). Playwright's built-in iPhone 14 device profile provides both.
- **D-05:** Field mode specs use `.volunteer.spec.ts` suffix, running under volunteer1@localhost auth. Volunteers are the primary field mode users.
- **D-06:** Write all new specs (field mode + cross-cutting) first, then run the full suite to collect all failures, then batch-fix in a dedicated round.
- **D-07:** App bugs discovered during testing are tracked in `60-BUGS.md` in the phase directory (spec name, failure description, severity). Fixes go into a sub-phase (60.1).
- **D-08:** Failing tests caused by app bugs use `test.skip()` with a comment referencing the bug ID in 60-BUGS.md.
- **D-09:** Cleanup happens AFTER new Phase 60 specs pass.
- **D-10:** Delete old specs only where the new spec covers 100% of the same assertions. Absorb unique coverage first.
- **D-11:** Old specs in scope for review: phase30-field-layout, phase31-canvassing, phase33-offline-sync, tour-onboarding, phase35-milestone-toasts, phase35-touch-targets, phase35-voter-context, phase36-navigate, uat-empty-states, uat-sidebar-overlay, uat-tooltip-popovers.
- **D-12:** Auth suffix convention for role-based routing.
- **D-13:** Domain-based naming (no phase prefix).
- **D-14:** Hybrid data strategy: seed data for reads, fresh entities for mutations.
- **D-15:** Serial within spec, parallel across spec files.
- **D-16:** No cleanup -- fresh environment per CI run.
- **D-17:** API-based bulk entity creation for speed.

### Claude's Discretion
- Exact spec file organization (how many files for field mode vs cross-cutting)
- Which test cases from old specs qualify as "unique coverage" to absorb
- How to structure the Playwright project config for the mobile viewport (separate project or per-spec use())
- Severity classification criteria for 60-BUGS.md entries
- How to handle the cross-cutting specs (NAV, UI, CROSS test cases) -- single file or split by concern

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-20 | Automated tests verify field mode hub, canvassing wizard, phone banking, offline queue, and onboarding tour (FIELD-01 through FIELD-10, OFFLINE-01 through OFFLINE-03, TOUR-01 through TOUR-03) | Field mode components fully documented, API setup patterns for walk list/session assignment identified, offline queue mechanism understood, tour store persistence via localStorage confirmed |
| E2E-21 | Automated tests verify navigation, empty states, loading skeletons, error boundaries, form guards, and toasts (NAV-01 through NAV-03, UI-01 through UI-03, CROSS-01 through CROSS-03) | Navigation routes enumerated from sidebar, EmptyState/RouteErrorBoundary components inspected, useFormGuard hook patterns documented, toast (sonner) patterns identified across 20+ files |
| VAL-01 | All E2E tests pass at 100% against local Docker Compose environment | Full suite currently at 64 spec files; need test-fix-retest cycle after writing new specs |
| VAL-02 | All bugs discovered during testing are fixed and verified | Bug tracking via 60-BUGS.md, fixes in sub-phase 60.1, test.skip() pattern for app bugs |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E testing framework | Already installed, all existing 64 specs use it |
| Chromium (via Playwright) | bundled | Browser engine | All existing tests run in Chromium projects |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | (project dep) | Toast notifications | Assertions against toast text via `page.getByText()` or `page.locator('[data-sonner-toast]')` |
| driver.js | (project dep) | Onboarding tour | Tour popover elements visible via `page.locator('.driver-popover')` |

### No New Dependencies
This phase writes test specs only -- no new packages required.

## Architecture Patterns

### Spec File Organization

**Recommendation:** 3 new spec files.

```
web/e2e/
  field-mode.volunteer.spec.ts    # FIELD-01..10, OFFLINE-01..03, TOUR-01..03 (volunteer auth, mobile viewport)
  cross-cutting.spec.ts           # CROSS-01..03, UI-01..03 (owner auth, desktop viewport)
  navigation.spec.ts              # NAV-01..03 (owner auth, desktop viewport)
```

**Rationale:**
- Field mode is a single cohesive domain -- volunteer hub, canvassing, phone banking, offline, and tour all run under volunteer auth at mobile viewport. One file keeps setup DRY.
- Cross-cutting (form guards, toasts, error boundaries) and UI polish (empty states, loading, error) share the pattern of visiting many different pages. One file.
- Navigation is conceptually separate and tests sidebar links/breadcrumbs. Small enough for its own file but could be merged into cross-cutting if preferred.

### Pattern 1: Mobile Viewport via test.use() (NOT device profile)

**What:** Use `test.use()` to set mobile viewport + touch emulation while staying in the Chromium-based volunteer project.

**Why:** The `devices['iPhone 14']` profile defaults to `webkit` browser. Importing it would switch the browser engine, which is incompatible with the `volunteer` project that runs in Chromium. Instead, extract only the viewport/touch settings.

**Important viewport correction:** D-04 specifies 390x844, but Playwright's iPhone 14 profile uses `viewport: { width: 390, height: 664 }` (844 is screen size, 664 is viewport after browser chrome). Use 390x844 as specified in the decision, since this is a custom viewport override anyway and tests field UI at full screen height.

```typescript
import { test, expect, devices } from "@playwright/test"

// Mobile viewport for field mode -- matches D-04 (iPhone 14 dimensions)
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
})
```

### Pattern 2: API-Based Volunteer Assignment Setup

**What:** Before field mode tests, create walk list + session assignments for the test volunteer via API.

**Why:** The seed data creates assignments for `seed-canvasser1` / `seed-canvasser2`, NOT for `volunteer1@localhost`. The `/field/me` endpoint queries by `user_id`, so the test volunteer must be assigned.

**Critical setup sequence:**
1. Navigate to seed campaign to get `campaignId`
2. Get the test volunteer's user_id (from the volunteer auth context or campaign members API)
3. Create or find a walk list with entries
4. Assign volunteer as canvasser: `POST /walk-lists/{id}/canvassers` with `{ user_id }`
5. Create or find an active phone bank session with call list entries
6. Assign volunteer as caller: `POST /phone-bank-sessions/{id}/callers` with `{ user_id }`
7. Now `/field/{campaignId}` will show assignments

```typescript
async function assignVolunteerToWalkList(
  page: Page,
  campaignId: string,
  walkListId: string,
  userId: string,
): Promise<void> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`,
    {
      data: { user_id: userId },
      headers: { "Content-Type": "application/json" },
    },
  )
  // 201 Created or 409 Conflict (already assigned) -- both acceptable
  expect([201, 409]).toContain(resp.status())
}

async function assignVolunteerToCaller(
  page: Page,
  campaignId: string,
  sessionId: string,
  userId: string,
): Promise<void> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers`,
    {
      data: { user_id: userId },
      headers: { "Content-Type": "application/json" },
    },
  )
  expect([201, 409]).toContain(resp.status())
}
```

**Getting the volunteer's user_id:** The volunteer auth setup logs in as `volunteer1@localhost`. The user_id is the ZITADEL sub claim. It can be obtained from the auth storage state file (`playwright/.auth/volunteer.json`) by parsing the OIDC user object, or by calling the `/api/v1/users/me` endpoint.

### Pattern 3: Offline Simulation via context.setOffline()

**What:** Toggle network state at the browser context level.

**How it works in the app:** `useConnectivityStatus()` uses `useSyncExternalStore` listening to `window.online/offline` events. `context.setOffline(true)` triggers `navigator.onLine = false` which fires the `offline` event. The `OfflineBanner` component shows/hides based on this. When outcomes are submitted while offline, the `useCanvassingWizard` hook catches the `TypeError` (network error) and pushes to `offlineQueueStore`. The `useSyncEngine` hook drains the queue on online transition with a 1000ms debounce.

```typescript
// Go offline
await page.context().setOffline(true)
await expect(page.getByText("Offline")).toBeVisible({ timeout: 5_000 })

// Record outcomes while offline...
// Verify queue count via UI
await expect(page.getByText(/3 outcomes saved/i)).toBeVisible()

// Go back online
const syncPromise = page.waitForResponse(
  (resp) => resp.url().includes("/door-knocks") && resp.status() === 201,
)
await page.context().setOffline(false)
await syncPromise  // Confirms actual server sync per D-03
await expect(page.getByText("All caught up")).toBeVisible({ timeout: 15_000 })
```

### Pattern 4: Tour State Management for Testing

**What:** Manipulate `localStorage` to control tour auto-start behavior.

**How the tour works:** The `tourStore` (Zustand + persist) stores completions per `tourKey(campaignId, userId)`. On first visit, if `isSegmentComplete(key, "welcome")` returns false, the welcome tour auto-starts after 200ms. Tour state is persisted to `localStorage` under key `"tour-store"`.

**For TOUR-01 (first-time tour):** Clear tour localStorage before navigating to field mode:
```typescript
await page.evaluate(() => localStorage.removeItem("tour-store"))
```

**For TOUR-03 (persistence):** After completing tour, reload and verify it does NOT auto-start:
```typescript
await page.reload()
// Tour should NOT auto-start (popover should NOT appear)
await expect(page.locator(".driver-popover")).not.toBeVisible({ timeout: 3_000 })
```

**For TOUR-02 (help button replay):** Click the help button (`[data-tour='help-button']`) and verify tour restarts.

### Pattern 5: Empty State Testing via Fresh Campaign

**What:** Create a new campaign with no data to verify all empty states.

**Why:** The seed campaign has data, so empty states won't render there. A fresh campaign is needed.

```typescript
async function createEmptyCampaignViaApi(
  page: Page,
): Promise<string> {
  const resp = await page.request.post("/api/v1/campaigns", {
    data: {
      name: "E2E Empty State Test",
      type: "general",
    },
    headers: { "Content-Type": "application/json" },
  })
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}
```

Then navigate to each list page in the fresh campaign and assert empty state components.

### Pattern 6: Form Guard Testing

**What:** Verify `useFormGuard` prevents navigation away from dirty forms.

**How it works:** `useFormGuard` uses TanStack Router's `useBlocker` with `shouldBlockFn: () => isDirty` and `enableBeforeUnload: () => isDirty`. When blocked, a dialog appears.

Forms using `useFormGuard`: campaign creation (`/campaigns/new`), volunteer registration, call list detail, DNC management, phone bank sessions, org settings, campaign settings, voter edit sheet, shift dialog, volunteer edit sheet.

```typescript
// Start a form
await page.goto(`/campaigns/new`)
await page.getByLabel(/name/i).fill("Test Campaign")
// Try to navigate away
await page.getByRole("link", { name: /dashboard/i }).first().click()
// Assert navigation guard dialog
await expect(page.getByText(/unsaved changes/i)).toBeVisible()
// Click "Stay"
await page.getByRole("button", { name: /stay/i }).click()
// Verify still on form
await expect(page.getByLabel(/name/i)).toBeVisible()
```

### Anti-Patterns to Avoid

- **Using `devices['iPhone 14']` directly:** This switches to webkit browser, causing inconsistency with the Chromium-based volunteer project. Use manual viewport/touch settings instead.
- **Hardcoded campaign IDs:** Old specs (phase30, phase31, phase33, tour-onboarding) use `const CAMPAIGN_ID = "test-campaign-123"` with mocked APIs. New specs must use real seed data per D-14.
- **Mocking API responses:** Old specs heavily mock `/field/me` and walk list endpoints. New specs must hit real APIs per Phase 58/59 patterns.
- **CSS class selectors for assertions:** Old specs use `.grid-cols-2`, `.min-h-11`, `.text-lg.font-semibold`. Prefer semantic locators: `getByRole()`, `getByLabel()`, `getByText()`, `[data-tour]` attributes.
- **Testing offline by mocking navigator.onLine:** Use `context.setOffline(true)` which properly simulates network failure (requests throw TypeError) and triggers the online/offline events.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobile viewport simulation | Custom viewport logic | `test.use({ viewport, hasTouch, isMobile })` | Playwright built-in, consistent across runs |
| Network offline simulation | Mock navigator.onLine or intercept requests | `page.context().setOffline(true/false)` | Triggers real browser events, fails real requests |
| Sync verification | Poll localStorage for queue changes | `page.waitForResponse()` on sync API calls | Per D-03, confirms actual server sync |
| Tour state reset | Custom cleanup functions | `page.evaluate(() => localStorage.removeItem("tour-store"))` | Direct, reliable, no API needed |
| Fresh campaign for empty states | Navigate through UI wizard | API helper `page.request.post("/api/v1/campaigns", ...)` | Per D-17, API-based creation for speed |
| Volunteer assignment setup | Manual UI clicks | API helpers for canvasser/caller assignment | Seed data doesn't assign test volunteer |

## Common Pitfalls

### Pitfall 1: Volunteer Has No Assignments
**What goes wrong:** Field hub shows "No active assignments" empty state instead of assignment cards.
**Why it happens:** Seed data assigns `seed-canvasser1`/`seed-canvasser2` to walk lists, not the test volunteer (`volunteer1@localhost`). The `/field/me` endpoint queries by `user_id`.
**How to avoid:** API setup in `test.beforeAll` must: (1) get volunteer's user_id, (2) assign to a walk list via POST canvassers, (3) assign to a phone bank session via POST callers.
**Warning signs:** Tests see `FieldEmptyState` component instead of `AssignmentCard`.

### Pitfall 2: iPhone 14 Profile Switches to WebKit
**What goes wrong:** Tests fail with browser mismatch or the volunteer auth project doesn't apply.
**Why it happens:** `devices['iPhone 14'].defaultBrowserType` is `"webkit"`, not `"chromium"`.
**How to avoid:** Use `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })` instead of spreading the device profile.
**Warning signs:** Tests run in Safari-like browser, CSS differences, auth storage not loaded.

### Pitfall 3: Sync Engine Debounce Delay
**What goes wrong:** Test goes online and immediately asserts sync completion, but sync hasn't started yet.
**Why it happens:** `useSyncEngine` has a 1000ms debounce after online transition before draining the queue.
**How to avoid:** Use `page.waitForResponse()` with a generous timeout (e.g., 15 seconds) to wait for the actual sync API calls, not just the online state change.
**Warning signs:** Flaky test -- passes sometimes depending on timing.

### Pitfall 4: Tour Auto-Start Race Condition
**What goes wrong:** Tour doesn't auto-start, or starts before data loads.
**Why it happens:** Tour auto-start has a 200ms `setTimeout` and only fires when `data && !isLoading`. If the page loads fast, the tour may start before test assertions are set up. If data loads slowly, the tour may not start during the test's wait window.
**How to avoid:** For TOUR-01, wait for the field hub data to load first (e.g., `await expect(page.getByText(/Hey/)).toBeVisible()`), then wait for `.driver-popover` to appear with a reasonable timeout.
**Warning signs:** Tour tests are flaky -- sometimes the popover appears, sometimes not.

### Pitfall 5: Old Specs Interfering with New Specs
**What goes wrong:** Suite has both old mock-based specs and new real-data specs testing the same features, causing confusion about which failures matter.
**Why it happens:** Old specs (phase30, phase31, etc.) use hardcoded campaign IDs and mocked APIs that may fail against the real Docker Compose environment.
**How to avoid:** Per D-09, write new specs FIRST, verify they pass, THEN clean up old specs. Old specs may fail during the interim -- that's expected.
**Warning signs:** Test report shows failures in phase-prefixed specs but new domain-named specs pass.

### Pitfall 6: Empty State Testing Requires a Truly Empty Campaign
**What goes wrong:** Empty states don't render because the campaign has seed data.
**Why it happens:** The seed script populates extensive data (50 voters, 5 turfs, 4 walk lists, etc.) for the demo campaign.
**How to avoid:** Create a fresh campaign via API for empty state tests. Verify each list page against this fresh campaign.
**Warning signs:** Tests assert empty state but find data tables instead.

### Pitfall 7: Form Guard Dialog Text Varies
**What goes wrong:** Assertion on dialog text fails because different forms may have different unsaved changes dialogs.
**Why it happens:** `useFormGuard` uses TanStack Router's `useBlocker` which may render different dialog implementations depending on how the route handles it.
**How to avoid:** Assert on the presence of a blocking dialog (e.g., `getByRole('dialog')` or `getByText(/unsaved|leave|stay/i)`) rather than exact text.
**Warning signs:** Test passes on campaign form but fails on voter edit sheet.

### Pitfall 8: Toast Auto-Dismiss Timing
**What goes wrong:** Toast assertion fails because the toast auto-dismissed before the assertion ran.
**Why it happens:** Sonner toasts auto-dismiss after a few seconds. If a preceding step takes too long, the toast may be gone.
**How to avoid:** Assert toast immediately after the triggering action: `await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5_000 })`.
**Warning signs:** Toast tests are flaky -- pass locally but fail in CI.

## Code Examples

### Field Mode Spec Structure (field-mode.volunteer.spec.ts)
```typescript
import { test, expect, type Page } from "@playwright/test"

// Mobile viewport -- D-04
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
})

// ── API Helpers ─────────────────────────────────────────────────────────────

async function navigateToSeedCampaign(page: Page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(/\/(campaigns|org|field)/, { timeout: 15_000 })
  const campaignLink = page
    .getByRole("link", { name: /macon|bibb|campaign/i })
    .first()
  await campaignLink.click()
  await page.waitForURL(/campaigns\/([a-f0-9-]+)/, { timeout: 10_000 })
  return page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
}

async function getMyUserId(page: Page): Promise<string> {
  const resp = await page.request.get("/api/v1/users/me")
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

async function assignCanvasser(
  page: Page,
  campaignId: string,
  walkListId: string,
  userId: string,
): Promise<void> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`,
    { data: { user_id: userId } },
  )
  expect([201, 409]).toContain(resp.status())
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe.serial("Field Mode", () => {
  let campaignId: string

  test.beforeAll(async ({ browser }) => {
    // Setup: assign volunteer to walk list + session
    const context = await browser.newContext({
      storageState: "playwright/.auth/volunteer.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    campaignId = await navigateToSeedCampaign(page)
    const userId = await getMyUserId(page)
    // ... assign to walk list and session via API
    await context.close()
  })

  test("FIELD-01: volunteer hub shows assignments", async ({ page }) => {
    await page.goto(`/field/${campaignId}`)
    await expect(page.getByText(/Hey/)).toBeVisible({ timeout: 15_000 })
    // Verify canvassing and phone banking assignment cards
    await expect(page.locator("[data-tour='assignment-card']").first()).toBeVisible()
  })

  // ... more tests
})
```

### Offline Simulation Pattern
```typescript
test("OFFLINE-01 through OFFLINE-03: offline banner, queue, auto-sync", async ({ page }) => {
  // Navigate to canvassing in field mode
  await page.goto(`/field/${campaignId}/canvassing`)
  await expect(page.locator("[data-tour='household-card']")).toBeVisible({ timeout: 15_000 })

  // Go offline -- D-01
  await page.context().setOffline(true)
  await expect(page.getByText("Offline")).toBeVisible({ timeout: 5_000 })

  // Record outcomes while offline -- D-02
  // (tap outcome buttons, verify queued indicator)
  await page.getByRole("button", { name: /not home/i }).click()
  await expect(page.getByText(/1 outcomes? saved/i)).toBeVisible()

  // Go back online -- D-03
  const syncPromise = page.waitForResponse(
    (resp) => resp.url().includes("/door-knocks") && resp.status() === 201,
  )
  await page.context().setOffline(false)
  await syncPromise
  // Verify banner disappears and sync toast appears
  await expect(page.getByText("All caught up")).toBeVisible({ timeout: 15_000 })
})
```

### Cross-Cutting Error Boundary Pattern
```typescript
test("UI-03: error boundary on invalid campaign", async ({ page }) => {
  await page.goto("/campaigns/00000000-0000-0000-0000-000000000000/dashboard")
  // RouteErrorBoundary renders card with "Something went wrong"
  await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /go to dashboard/i })).toBeVisible()
})
```

### Form Guard Pattern
```typescript
test("CROSS-01: form navigation guard", async ({ page }) => {
  // Navigate to campaign creation form
  await page.goto("/campaigns/new")
  await expect(page.getByLabel(/name/i).first()).toBeVisible({ timeout: 10_000 })

  // Make the form dirty
  await page.getByLabel(/name/i).first().fill("Unsaved Campaign")

  // Attempt to navigate away
  await page.getByRole("link", { name: /campaign/i }).first().click()

  // Verify navigation guard blocks
  // TanStack Router's useBlocker renders a dialog
  await expect(page.getByRole("alertdialog").or(page.getByText(/unsaved/i))).toBeVisible({ timeout: 5_000 })
})
```

## State of the Art

| Old Approach (Phase 30-36 specs) | Current Approach (Phase 58-60) | When Changed | Impact |
|----------------------------------|-------------------------------|--------------|--------|
| Hardcoded campaign IDs + mocked APIs | Real seed data + API helpers | Phase 58 | Tests validate actual app behavior, not mocks |
| Phase-prefixed file names | Domain-based naming | Phase 58 (D-13) | Clearer spec organization |
| CSS class selectors | Semantic locators (getByRole, getByText, data-tour) | Phase 58 | More resilient to styling changes |
| No role-based auth | 5 auth projects with role suffixes | Phase 57 | RBAC coverage |

**Deprecated/outdated:**
- All 11 old specs listed in D-11 use the old mock-based approach and will be reviewed for cleanup after new specs pass.

## Old Spec Cleanup Analysis

| Old Spec | Coverage Summary | Cleanup Recommendation |
|----------|-----------------|----------------------|
| `phase30-field-layout.spec.ts` | Field hub layout, no sidebar, mobile viewport, navigation | Most assertions covered by FIELD-01. Absorb "no admin sidebar" check if not in new spec. |
| `phase31-canvassing.spec.ts` | Voter context, outcome buttons, household card, address nav, skip, inline survey | Covered by FIELD-03 through FIELD-07. Uses real seed data but old patterns. Review for unique assertions. |
| `phase33-offline-sync.spec.ts` | Offline banner, queue, auto-sync | Fully covered by OFFLINE-01..03. Uses mocks -- delete. |
| `tour-onboarding.spec.ts` | First-time tour, help replay, persistence, tour steps, per-segment tours | Covered by TOUR-01..03. This is the most comprehensive old spec. Absorb any per-segment tour assertions not in new spec. |
| `phase35-milestone-toasts.spec.ts` | Milestone toast for 100% completion | Unique coverage -- milestone toasts. May absorb into field mode spec or keep if not tested elsewhere. |
| `phase35-touch-targets.spec.ts` | 44px touch target verification | Unique coverage -- touch target sizes. Absorb into field mode spec as a spot check. |
| `phase35-voter-context.spec.ts` | Voter context card details | Covered by FIELD-03/FIELD-04 canvassing wizard voter info. Review for unique detail assertions. |
| `phase36-navigate.spec.ts` | Sidebar navigation, field mode nav | Covered by NAV-01..03. Uses mocks -- absorb real-data version. |
| `uat-empty-states.spec.ts` | Org members empty state, list page content checks | Partially covered by UI-01. This spec is light and mostly checks seed data pages have content. |
| `uat-sidebar-overlay.spec.ts` | Sidebar hidden default, overlay behavior | Covered by NAV-01 sidebar tests. Small file. |
| `uat-tooltip-popovers.spec.ts` | Tooltip/popover interactions | Unique coverage not in Phase 60 scope. Keep as-is (not in cleanup scope per CONTEXT.md). |

## Open Questions

1. **Volunteer user_id retrieval**
   - What we know: The volunteer auth stores state in `playwright/.auth/volunteer.json`. The `/api/v1/users/me` endpoint should return the user's ZITADEL ID.
   - What's unclear: Whether `/api/v1/users/me` exists or if we need to parse the storage state JSON to extract the sub claim.
   - Recommendation: Try `/api/v1/users/me` first. Fallback: parse the OIDC user object from `volunteer.json` storage state.

2. **Walk list with entries for canvassing**
   - What we know: Seed data creates 4 walk lists with entries. The volunteer needs to be assigned to one that has unvisited entries.
   - What's unclear: Whether seed walk lists have been partially visited by previous test runs (D-16 says fresh env per CI run, but local dev may accumulate state).
   - Recommendation: In `beforeAll`, either use a seed walk list with entries, or create a fresh walk list via API and populate with entries. Seed walk list is simpler per D-14.

3. **Rate limit testing (CROSS-03) feasibility**
   - What we know: Rate limit is 30/minute on door-knock endpoint. Testing requires 35 rapid requests.
   - What's unclear: Whether rate limiting state persists across test runs or resets. Whether 35 rapid API calls in a test will be flaky.
   - Recommendation: Rate limit test should use `page.request` (API calls) not UI clicks. May need careful timing. Consider making this the last test in the cross-cutting spec.

4. **Loading skeleton visibility (UI-02)**
   - What we know: Loading skeletons appear briefly during data fetch.
   - What's unclear: Whether network throttling is needed to see them, or if they flash too quickly to assert.
   - Recommendation: Use `page.route()` to delay specific API responses by 1-2 seconds, making skeletons visible for assertion.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.58.2 |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test --grep "FIELD-01"` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-20 | Field mode hub, canvassing, phone banking, offline, tour | e2e | `npx playwright test field-mode.volunteer` | No -- Wave 0 |
| E2E-21 | Navigation, empty states, skeletons, error boundary, form guards, toasts | e2e | `npx playwright test cross-cutting navigation` | No -- Wave 0 |
| VAL-01 | Full suite 100% pass | e2e | `npx playwright test` | N/A (all specs) |
| VAL-02 | Bug fixes verified | e2e | Re-run affected specs | N/A |

### Sampling Rate
- **Per task commit:** `npx playwright test <affected-spec> --reporter=line`
- **Per wave merge:** `npx playwright test --reporter=html`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/field-mode.volunteer.spec.ts` -- covers E2E-20
- [ ] `web/e2e/cross-cutting.spec.ts` -- covers E2E-21 (CROSS, UI)
- [ ] `web/e2e/navigation.spec.ts` -- covers E2E-21 (NAV)
- [ ] `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-BUGS.md` -- bug tracking

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` for Python tasks (not relevant for this phase -- Playwright specs only)
- **Linting:** Use `ruff` for Python code (not relevant for this phase)
- **Git:** Commit after each task/phase completion. Use Conventional Commits. Never push unless requested.
- **Testing:** `uv run pytest` for Python tests. Playwright for E2E.
- **Screenshots:** After UI changes, use Playwright MCP to verify. Save to `screenshots/` directory.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection:** `web/playwright.config.ts`, `web/e2e/*.spec.ts` (64 files), `web/src/components/field/`, `web/src/routes/field/`, `web/src/hooks/`, `web/src/stores/`
- **Testing plan:** `docs/testing-plan.md` Sections 25-34 (FIELD-01..10, OFFLINE-01..03, TOUR-01..03, NAV-01..03, UI-01..03, CROSS-01..03)
- **Playwright version:** 1.58.2 verified via `npx playwright --version`
- **iPhone 14 device profile:** Verified via `devices['iPhone 14']` -- webkit browser, 390x664 viewport, hasTouch: true

### Secondary (MEDIUM confidence)
- **Phase 58/59 patterns:** Verified by reading `voter-crud.spec.ts`, `phone-banking.spec.ts`, `shifts.spec.ts`, `rbac.volunteer.spec.ts`
- **Old spec patterns:** Verified by reading all 11 old specs listed in D-11

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Playwright 1.58.2 verified, no new dependencies needed
- Architecture: HIGH - Patterns directly derived from existing Phase 58/59 specs + codebase component inspection
- Pitfalls: HIGH - Identified through codebase analysis (seed data doesn't assign volunteer, webkit vs chromium, sync debounce timing)

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable -- Playwright and project patterns unlikely to change within 30 days)
