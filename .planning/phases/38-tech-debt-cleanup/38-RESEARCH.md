# Phase 38: Tech Debt Cleanup - Research

**Researched:** 2026-03-17
**Domain:** Test implementation, Playwright selectors, React lint fixes
**Confidence:** HIGH

## Summary

Phase 38 resolves 4 deterministic tech debt items from the v1.4 milestone audit. There are no new features or architectural decisions -- each item has a clear before/after state identified in `.planning/v1.4-MILESTONE-AUDIT.md`. The work divides naturally into two groups: (1) quick targeted fixes (Playwright selector, useCallback deps, unused variable) and (2) bulk test stub implementation (36 stubs across 3 files).

The quick fixes are straightforward one-line or few-line changes. The test stub implementation is the bulk of the work, requiring understanding of the Zustand persist pattern (tourStore), driver.js hook behavior (useTour), and page.route() API mocking (tour e2e tests). All patterns are well-established in the codebase from phases 31-36.

**Primary recommendation:** Split into 2 plans as suggested -- Plan 01 for the 3 quick fixes, Plan 02 for the 36 test stub implementations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Playwright selector fix: `getByText("Survey Questions")` matches both heading and sr-only ARIA live div in `web/e2e/phase31-canvassing.spec.ts:153` and `web/e2e/phase32-verify.spec.ts:339-341`. Fix by using a more specific selector (getByRole heading, or scoping to a container).
- useCallback dependency fix: `useCallingSession.ts:241` -- add missing `campaignId` and `sessionId` to useCallback dependency array.
- Tour test stub implementation: 36 stubs across `tourStore.test.ts` (17), `useTour.test.ts` (7), `tour-onboarding.spec.ts` (12).
- Unused variable cleanup: Remove unused `isRunning` destructure from `canvassing.tsx:57`.

### Claude's Discretion
- Exact selector strategy for "Survey Questions" disambiguation (getByRole vs test-id vs container scoping)
- Test implementation details for the 36 tour stubs (assertion granularity, mock strategies)
- Whether to split into 2 plans (quick fixes + test stubs) or other grouping

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Role in This Phase |
|---------|---------|---------|-------------------|
| vitest | ^4.0.18 | Unit test runner | tourStore.test.ts, useTour.test.ts |
| @playwright/test | ^1.58.2 | E2E test runner | tour-onboarding.spec.ts, selector fixes |
| zustand | ^5.0.11 | State management | tourStore under test |
| driver.js | ^1.4.0 | Guided tours | useTour hook under test |

### Test Infrastructure
| Config | Path | Notes |
|--------|------|-------|
| Vitest config | `web/vitest.config.ts` | happy-dom env, `@/` alias, globals: true |
| Playwright config | `web/playwright.config.ts` | chromium only, baseURL `https://localhost:4173` |
| Test setup | `web/src/test/setup.ts` | Vitest setup file |
| Run unit tests | `cd web && npx vitest run` | All unit tests |
| Run specific unit test | `cd web && npx vitest run src/stores/tourStore.test.ts` | Single file |
| Run e2e tests | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | Tour e2e only |

No new packages needed.

## Architecture Patterns

### Pattern 1: Zustand Store Testing (tourStore)
**What:** Test Zustand stores by calling `getState()` directly without React rendering context.
**Established in:** Phase 31 decision, offlineQueueStore.test.ts reference implementation.
**Key details:**
- Import the store, call `store.getState().method()` to invoke actions
- Read state via `store.getState().property`
- `beforeEach`: clear localStorage + reset store state
- For persist testing: read `localStorage.getItem("tour-state")` and parse JSON
- partialize excludes `isRunning` and `dismissedThisSession` -- verify these are NOT in localStorage
- Test rehydration via `store.persist.rehydrate()`

**Reference code from offlineQueueStore.test.ts:**
```typescript
beforeEach(() => {
  useOfflineQueueStore.getState().clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

test("push() adds item", () => {
  useOfflineQueueStore.getState().push({ ... })
  const state = useOfflineQueueStore.getState()
  expect(state.items).toHaveLength(1)
})

test("store persists to localStorage", () => {
  useOfflineQueueStore.getState().push({ ... })
  const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
  expect(stored.state.items).toHaveLength(1)
})

test("isSyncing NOT persisted (partialize excludes it)", () => {
  useOfflineQueueStore.getState().setSyncing(true)
  const stored = JSON.parse(localStorage.getItem("offline-queue") || "{}")
  expect(stored.state.isSyncing).toBeUndefined()
})
```

### Pattern 2: Hook Testing with vi.mock (useTour)
**What:** Test the useTour hook by mocking driver.js and tourStore.
**Key details:**
- Mock `driver.js` module: `vi.mock("driver.js", () => ({ driver: vi.fn() }))` returning a mock driver instance with `drive()`, `destroy()` methods
- Mock `useTourStore.getState()` to return stub `setRunning`/`markComplete` functions
- Verify `startSegment()` creates driver instance with correct steps
- Verify `onDestroyed` callback calls `markComplete` and `setRunning(false)`
- Test cleanup: verify `destroy()` is called on unmount

### Pattern 3: E2E with page.route() API Mocking (tour-onboarding)
**What:** Test tour behavior in Playwright by mocking all API endpoints with `page.route()`.
**Established in:** Phase 32 decision, used across phases 31-36.
**Key details:**
- Mock `field-me`, walk-list entries, phone-bank-sessions, etc. with `route.fulfill({ json: ... })`
- Set/check localStorage for tour completion state (`tour-state` key)
- Verify `driver-popover` class appears (`.driver-popover`) for tour visibility
- Tour steps target `[data-tour="..."]` attributes -- verify they exist on the page
- Quick-start cards controlled by sessionCounts in tourStore localStorage

### Pattern 4: Playwright Selector Disambiguation
**What:** Replace ambiguous `getByText("Survey Questions")` with a role-based selector.
**Recommended approach:** `page.getByRole("heading", { name: "Survey Questions" })`
**Why:** The component renders `<SheetTitle>Survey Questions</SheetTitle>` (which is an h2 via radix) AND an `aria-live="polite"` sr-only div containing text "Survey questions. N questions." The `getByRole("heading")` selector uniquely targets the SheetTitle h2, while the sr-only div has no heading role.
**Alternative considered:** Adding a `data-testid` -- but getByRole is more idiomatic for Playwright and doesn't require source code changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zustand store mocking in tests | Custom store mock | Direct `getState()` calls + `localStorage.clear()` in beforeEach | Established pattern from Phase 31 |
| Driver.js mocking | Wrapper class | `vi.mock("driver.js")` with mock factory | Standard vitest module mocking |
| API mocking in e2e | Custom fetch interceptor | `page.route()` with `route.fulfill()` | Playwright built-in, established pattern |

## Common Pitfalls

### Pitfall 1: Zustand Persist Rehydration Timing
**What goes wrong:** Tests read state before Zustand persist has rehydrated from localStorage.
**Why it happens:** Zustand persist is async by default.
**How to avoid:** In tests, call `store.persist.rehydrate()` explicitly when testing rehydration behavior. For fresh state tests, `localStorage.clear()` in beforeEach suffices since the store is already initialized.
**Warning signs:** Tests pass in isolation but fail when run together.

### Pitfall 2: Driver.js onDestroyed Fires on Cleanup
**What goes wrong:** The useTour cleanup effect sets `driverRef.current = null` before calling `destroy()`, which means `onDestroyed` callback fires but with the ref already nulled.
**Why it happens:** The cleanup code intentionally nulls the ref first to prevent double-marking completion on unmount.
**How to avoid:** When testing cleanup, verify that `setRunning(false)` is called from the cleanup path (not the onDestroyed callback). The useTour hook has two distinct paths: normal completion (onDestroyed) and cleanup (useEffect return).

### Pitfall 3: useCallback Dependency Changes Can Cause Re-renders
**What goes wrong:** Adding `campaignId` and `sessionId` to the dependency array of `handleOutcome` could cause it to recreate on every render if those values are unstable references.
**Why it happens:** If campaignId/sessionId come from URL params they are strings and stable. If from state, they may be new refs.
**How to avoid:** Verify that `campaignId` and `sessionId` are primitive strings from route params or stable state -- they are (from `useCallingStore` and route params). This is safe.

### Pitfall 4: E2E Tour Tests Need Full Route Mocking
**What goes wrong:** Tour e2e tests navigate to field routes which fetch data on mount, causing network errors.
**Why it happens:** All field routes call `field-me`, walk-list entries, etc. on mount.
**How to avoid:** Every tour e2e test must set up the complete mock suite (field-me, walk-list-entries, walk-list, etc.) before navigation. Copy the mock setup pattern from `phase35-a11y-audit.spec.ts`.

### Pitfall 5: Tour localStorage Key Format
**What goes wrong:** Setting wrong key in localStorage for tour state seeding.
**Why it happens:** Zustand persist wraps state in `{ state: { ... }, version: 0 }` format under the key `"tour-state"`.
**How to avoid:** When seeding localStorage in e2e tests, use:
```typescript
await page.evaluate(() => {
  localStorage.setItem("tour-state", JSON.stringify({
    state: { completions: { "camp1_user1": { welcome: true, canvassing: false, phoneBanking: false } }, sessionCounts: {} },
    version: 0,
  }))
})
```

## Code Examples

### Fix 1: Playwright Selector Disambiguation
```typescript
// BEFORE (ambiguous -- matches heading AND sr-only div):
const surveyHeading = page.getByText("Survey Questions")

// AFTER (unambiguous -- heading role only):
const surveyHeading = page.getByRole("heading", { name: "Survey Questions" })
```
Files: `web/e2e/phase31-canvassing.spec.ts:153`, `web/e2e/phase32-verify.spec.ts:341`

### Fix 2: useCallback Dependency Array
```typescript
// BEFORE (missing campaignId, sessionId):
[currentEntry, callStartedAt, phoneNumberUsed, recordCall, recordOutcome],

// AFTER (complete deps):
[currentEntry, callStartedAt, phoneNumberUsed, recordCall, recordOutcome, campaignId, sessionId],
```
File: `web/src/hooks/useCallingSession.ts:241`

### Fix 3: Remove Unused Variable
```typescript
// BEFORE (line 57):
const isRunning = useTourStore((s) => s.isRunning)

// AFTER: Delete this line entirely
// (line 60 uses s.isRunning inside a selector callback, so no replacement needed)
```
File: `web/src/routes/field/$campaignId/canvassing.tsx:57`

### tourStore Test Template
```typescript
import { describe, test, expect, beforeEach, vi } from "vitest"
import { useTourStore, tourKey } from "@/stores/tourStore"

describe("tourStore", () => {
  beforeEach(() => {
    // Reset store to defaults
    useTourStore.setState({
      completions: {},
      sessionCounts: {},
      dismissedThisSession: {},
      isRunning: false,
    })
    localStorage.clear()
    vi.restoreAllMocks()
  })

  test("tourKey builds key from campaignId and userId", () => {
    expect(tourKey("camp-1", "user-1")).toBe("camp-1_user-1")
  })

  test("markComplete sets segment to true", () => {
    useTourStore.getState().markComplete("k1", "welcome")
    expect(useTourStore.getState().completions["k1"]?.welcome).toBe(true)
  })
})
```

### useTour Test Template (with driver.js mock)
```typescript
import { describe, test, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

const mockDrive = vi.fn()
const mockDestroy = vi.fn()
vi.mock("driver.js", () => ({
  driver: vi.fn(() => ({ drive: mockDrive, destroy: mockDestroy })),
}))

// Mock the CSS import
vi.mock("@/styles/tour.css", () => ({}))

import { useTour } from "@/hooks/useTour"
import { useTourStore } from "@/stores/tourStore"

describe("useTour", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTourStore.setState({ isRunning: false, completions: {}, sessionCounts: {}, dismissedThisSession: {} })
  })

  test("startSegment creates driver instance and calls drive()", () => {
    const { result } = renderHook(() => useTour("key1"))
    act(() => { result.current.startSegment("welcome", [{ element: "#a", popover: { title: "Hi" } }]) })
    expect(mockDrive).toHaveBeenCalled()
  })
})
```

### Tour E2E Test Template (with page.route mocking)
```typescript
import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-id"

async function setupFieldMocks(page) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({ json: { walk_lists: [{ id: "wl1", name: "WL 1", total_entries: 10, completed_entries: 0 }], phone_bank_sessions: [], campaign: { id: CAMPAIGN_ID, name: "Test" } } })
  })
  // ... additional route mocks as needed
}

test("auto-triggers on first visit", async ({ page }) => {
  await setupFieldMocks(page)
  // Ensure no prior tour completion in localStorage
  await page.goto(`/field/${CAMPAIGN_ID}`)
  // Verify driver.js popover appears
  await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5000 })
})
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (unit) + Playwright 1.58.2 (e2e) |
| Config files | `web/vitest.config.ts`, `web/playwright.config.ts` |
| Quick run (unit) | `cd web && npx vitest run src/stores/tourStore.test.ts src/hooks/useTour.test.ts` |
| Quick run (e2e) | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` |
| Full suite | `cd web && npx vitest run && npx playwright test` |

### Phase Requirements -> Test Map
| Item | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|-------------|
| Selector fix | getByRole("heading") disambiguates "Survey Questions" | e2e (existing) | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts e2e/phase32-verify.spec.ts` | Existing files, fix in place |
| useCallback deps | campaignId, sessionId in dependency array | lint/manual | `cd web && npx tsc --noEmit` | N/A (lint fix) |
| Unused variable | isRunning removed from canvassing.tsx | lint/manual | `cd web && npx tsc --noEmit` | N/A (lint fix) |
| tourStore tests | 17 store methods tested | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | Exists with stubs |
| useTour tests | 7 hook behaviors tested | unit | `cd web && npx vitest run src/hooks/useTour.test.ts` | Exists with stubs |
| tour e2e tests | 12 tour behaviors tested | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | Exists with stubs |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run src/stores/tourStore.test.ts src/hooks/useTour.test.ts`
- **Per wave merge:** `cd web && npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- all test files exist with stubs. Test infrastructure (Vitest, Playwright) is fully configured. No new test files or config needed.

## Specific Implementation Notes

### tourStore.test.ts -- 17 Stubs Breakdown

The store exports these methods (from `tourStore.ts`):
- `tourKey(campaignId, userId)` -- returns `"${campaignId}_${userId}"`
- `markComplete(key, segment)` -- sets `completions[key][segment] = true`
- `isSegmentComplete(key, segment)` -- reads completions
- `incrementSession(key, activity)` -- increments `sessionCounts[key][activity]`
- `getSessionCount(key, activity)` -- reads session counts
- `setRunning(running)` -- sets `isRunning`
- `dismissQuickStart(key, activity)` -- sets `dismissedThisSession[key][activity] = true`
- `isDismissedThisSession(key, activity)` -- reads dismissed state
- `shouldShowQuickStart(key, activity)` -- composite: count < 3 AND not dismissed AND not running

Persist config: key `"tour-state"`, partialize includes only `completions` and `sessionCounts`.

### useTour.test.ts -- 7 Stubs Breakdown

The hook requires mocking:
- `driver.js` module (mock `driver()` factory returning `{ drive, destroy }`)
- `@/styles/tour.css` import (empty mock)
- Access to `useTourStore.getState()` for verifying `setRunning`/`markComplete` calls

Test categories:
- `startSegment`: creates driver, calls `setRunning(true)`, passes steps
- `onDestroyed` callback: calls `markComplete`, `setRunning(false)`
- Cleanup on unmount: destroys driver, sets running false
- Replacement: destroys previous instance when starting new segment

### tour-onboarding.spec.ts -- 12 Stubs Breakdown

Each test needs:
1. Full API mock suite via `page.route()` (field-me, walk-list entries, etc.)
2. localStorage seeding for tour state (`"tour-state"` key)
3. Navigation to appropriate field route
4. Assertions on `.driver-popover` visibility and `[data-tour]` attributes

Data-tour attributes verified (from source code scan):
- Hub: `hub-greeting`, `assignment-card`, `help-button`, `avatar-menu`
- Canvassing: `household-card`, `outcome-grid`, `progress-bar`, `door-list-button`, `skip-button`
- Phone banking: `phone-number-list`, `outcome-grid`, `end-session-button`

## Sources

### Primary (HIGH confidence)
- `web/src/stores/tourStore.ts` -- complete store implementation with all methods
- `web/src/hooks/useTour.ts` -- complete hook implementation
- `web/src/stores/offlineQueueStore.test.ts` -- reference Zustand test pattern (189 lines)
- `web/src/components/field/InlineSurvey.tsx:122-129` -- SheetTitle + sr-only div causing selector ambiguity
- `web/src/hooks/useCallingSession.ts:200-241` -- handleOutcome useCallback with missing deps
- `web/src/routes/field/$campaignId/canvassing.tsx:57` -- unused isRunning
- `web/e2e/phase35-a11y-audit.spec.ts` -- reference page.route() mocking pattern
- `.planning/v1.4-MILESTONE-AUDIT.md` -- source of all 4 tech debt items

### Secondary (MEDIUM confidence)
- Playwright `getByRole` documentation -- standard selector best practice

## Metadata

**Confidence breakdown:**
- Quick fixes (selector, deps, unused var): HIGH -- all are deterministic, exact lines identified
- tourStore tests: HIGH -- store code is fully visible, offlineQueueStore provides exact pattern
- useTour tests: HIGH -- hook code is 64 lines, well-understood mock strategy
- tour e2e tests: MEDIUM -- requires comprehensive API mocking setup; mock data shape must match real API responses

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable -- no external dependencies changing)
