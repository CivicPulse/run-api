# Phase 48: Connected E2E Journey Spec - Research

**Researched:** 2026-03-25
**Domain:** Playwright E2E testing, connected user journey verification
**Confidence:** HIGH

## Summary

This phase creates a single Playwright E2E spec that chains multiple feature flows into one connected user journey: org dashboard, campaign creation, turf creation, voter search, and phone bank session. The project already has extensive individual E2E specs for each of these flows (turf-creation.spec.ts, voter-search.spec.ts, phone-bank.spec.ts, campaign-archive.spec.ts) providing battle-tested selectors and navigation patterns to reuse.

The key technical decisions are already locked: use `test.describe.serial()` with `test.step()` blocks inside a single test function, share browser state across steps, and create fresh data (not seed data). The existing Playwright config has `fullyParallel: true`, but `test.describe.serial()` overrides this within its scope -- serial tests run sequentially regardless of the global setting.

**Primary recommendation:** Create `web/e2e/connected-journey.spec.ts` with one `test.describe.serial` block containing a single test using `test.step()` for each journey stage. Reuse selector patterns from existing specs verbatim. The spec uses the `chromium` project (depends on `auth.setup.ts` stored auth state) and is auto-discovered by the existing glob pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Single `test.describe.serial()` with ordered `test.step()` blocks inside a single test function. Playwright's `test.step()` provides clear labeling in trace/report output while keeping browser state continuous across steps. Serial mode ensures later steps don't run if earlier ones fail.
- **D-02:** The journey creates fresh data at each step -- a new campaign via the campaign creation wizard, a new turf on that campaign, then uses voter search and phone bank features on that campaign. This proves the full lifecycle works end-to-end rather than relying on pre-existing seed data.
- **D-03:** Auth uses the existing stored auth state from `auth.setup.ts` (Phase 46 D-02). The journey starts from the org dashboard as an authenticated user.
- **D-04:** Serial dependency -- later steps depend on earlier steps. If campaign creation fails, turf/voter/phone bank steps are skipped. This is the correct behavior for a connected journey spec. Use `test.describe.serial()` to enforce this.
- **D-05:** Each journey step verifies: (1) navigation to the correct URL, (2) key UI element visible confirming the page loaded, (3) API success response where applicable (e.g., POST campaign returns 201). Enough to confirm the step completed without over-asserting implementation details.
- **D-06:** Single spec file: `web/e2e/connected-journey.spec.ts`. One file, one describe block, one test with multiple `test.step()` calls that share page state.

### Claude's Discretion
- Exact selectors and assertion targets per step
- Whether to use `page.waitForResponse()` or `page.waitForURL()` at each transition
- GeoJSON payload for turf creation step
- Which phone bank form fields to fill

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Playwright E2E tests cover critical user flows: login, voter search, voter import, turf creation, phone bank session, volunteer signup | This phase adds a connected journey spec that chains org dashboard, campaign creation, turf creation, voter search, and phone bank session into a single verified flow. Closes FLOW-01 gap. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.2 | E2E test framework | Already installed in project |

### Supporting
No additional libraries needed. This phase writes a single spec file using existing infrastructure.

## Architecture Patterns

### Spec File Structure
```
web/e2e/connected-journey.spec.ts   # Single file, single describe, single test
```

### Pattern 1: Serial Describe with Step Blocks
**What:** `test.describe.serial` wrapping a single test with multiple `test.step()` calls
**When to use:** Connected journey where each step depends on the previous step's state
**Example:**
```typescript
// Source: https://playwright.dev/docs/api/class-test
import { test, expect } from "@playwright/test"

test.describe.serial("Connected user journey", () => {
  test("org dashboard through phone bank session", async ({ page }) => {
    await test.step("Org dashboard", async () => {
      // Navigate to org dashboard, verify campaign cards visible
    })

    await test.step("Campaign creation", async () => {
      // Click "Create Campaign", fill wizard, verify POST 201
    })

    await test.step("Turf creation", async () => {
      // Navigate to canvassing, create turf via GeoJSON, verify save
    })

    await test.step("Voter search", async () => {
      // Navigate to voters section, perform search
    })

    await test.step("Phone bank session", async () => {
      // Navigate to phone bank, create session
    })
  })
})
```

### Pattern 2: Campaign Creation Wizard Navigation
**What:** Multi-step wizard: fill details, review, skip invites, submit
**When to use:** Campaign creation step in the journey
**Source:** `web/src/routes/campaigns/new.tsx`

The wizard has 3 steps:
1. **Campaign Details** (step 0): Fill `name` (Label: "Campaign Name *"), select `type` via Select dropdown (Label: "Campaign Type *"), click "Continue to Review"
2. **Review** (step 1): Verify summary shows entered values, click "Continue to Invite"
3. **Invite Team** (step 2): Click "Skip -- create without inviting" link OR "Create Campaign" button

After submission, redirects to `/campaigns/$campaignId/dashboard`.

Key selectors from the wizard source:
- Name input: `page.getByLabel("Campaign Name *")` or `page.getByLabel(/campaign name/i)`
- Type select: Click the SelectTrigger, then click the desired SelectItem (e.g., "Local")
- Continue button (step 0): `page.getByRole("button", { name: /continue to review/i })`
- Continue button (step 1): `page.getByRole("button", { name: /continue to invite/i })`
- Skip invites link: `page.getByText(/skip.*create without inviting/i)` (it is a `<button>` element styled as underline text)
- Create Campaign button: `page.getByRole("button", { name: /create campaign/i })`
- API call: POST to `api/v1/campaigns` returns `Campaign` JSON (status 200 from ky, but the underlying fetch returns 201)

### Pattern 3: Existing Navigation Patterns (from individual specs)
**What:** Patterns already proven in the codebase

| Operation | Pattern | Source |
|-----------|---------|--------|
| Wait for org/campaign page | `page.waitForURL(/\/(campaigns\|org)/, { timeout: 15_000 })` | All specs |
| Click seed campaign | `page.getByRole("link", { name: /macon\|bibb\|campaign/i }).first()` | turf-creation.spec.ts |
| Navigate to canvassing | `page.getByRole("link", { name: /canvassing/i }).first()` | turf-creation.spec.ts |
| Navigate to voters | `page.getByRole("link", { name: /voters/i }).first()` | voter-search.spec.ts |
| Navigate to phone bank | `page.getByRole("link", { name: /phone bank/i }).first()` | phone-bank.spec.ts |
| Navigate to sessions | `page.getByRole("link", { name: /sessions/i }).first()` | phone-bank.spec.ts |
| GeoJSON fill | Fill `#boundary` textarea with polygon JSON | turf-creation.spec.ts |
| Wait for API response | `page.waitForResponse(resp => resp.url().includes("X") && resp.status() < 300)` | phone-bank.spec.ts |
| New campaign button | `page.getByRole("link").filter({ hasText: /create campaign/i })` | index.tsx |

### Anti-Patterns to Avoid
- **Using `waitForTimeout`:** Existing individual specs don't use it; use auto-waiting assertions and `waitForURL`/`waitForResponse` instead
- **Relying on seed data campaign for the journey:** D-02 requires creating a fresh campaign. Seed data campaign should NOT be used as the journey's campaign (use it only if needed to verify the org dashboard loads)
- **Separate tests for each step:** D-01 specifies one test with `test.step()`, NOT separate `test()` calls. A single test shares the `page` object and browser state naturally
- **Over-asserting:** D-05 says verify URL + key UI element + API status. Don't assert CSS classes, exact text content, or layout details

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state | Custom login flow in the journey | Stored auth state from `auth.setup.ts` | Already configured as project dependency (D-03) |
| Test selectors | Data-testid attributes | Existing `getByRole`/`getByLabel` patterns | Matches existing spec conventions |
| GeoJSON polygon | Complex multi-point polygon | Simple 5-point rectangle | Sufficient to prove turf creation works |

## Common Pitfalls

### Pitfall 1: Campaign Name Uniqueness
**What goes wrong:** If the test creates a campaign with a hardcoded name and the test runs multiple times without cleanup, duplicate names may cause confusion in assertions
**Why it happens:** No automatic cleanup between test runs
**How to avoid:** Include a timestamp or random suffix in the campaign name (e.g., `E2E Journey ${Date.now()}`)
**Warning signs:** Test passes first run, flaky on subsequent runs

### Pitfall 2: Select Component Interaction
**What goes wrong:** shadcn/ui Select (built on Radix) requires clicking the trigger first, then clicking the option in a portal-mounted dropdown
**Why it happens:** Radix Select renders options in a portal, not inside the trigger element
**How to avoid:** Click the SelectTrigger to open, then use `page.getByRole("option", { name: /local/i })` or `page.getByText("Local")` to select
**Warning signs:** "Element not found" errors when trying to select campaign type

### Pitfall 3: fullyParallel Override
**What goes wrong:** Concern that `fullyParallel: true` in config might override serial mode
**Why it happens:** Misunderstanding of config hierarchy
**How to avoid:** `test.describe.serial()` correctly overrides the global `fullyParallel: true` within its scope. No config change needed
**Warning signs:** None -- this just works

### Pitfall 4: Navigation to Newly Created Campaign
**What goes wrong:** After campaign creation, the page navigates to `/campaigns/$campaignId/dashboard`. The sidebar may need to load campaign context before canvassing/voters/phone bank links appear
**Why it happens:** Campaign context loads asynchronously after navigation
**How to avoid:** After campaign creation redirect, wait for the dashboard content to load before clicking sidebar navigation links. Use `page.waitForURL(/campaigns\/[a-f0-9-]+\/dashboard/)` then wait for a dashboard element to be visible
**Warning signs:** Sidebar links not found immediately after campaign creation

### Pitfall 5: Voter Search on Empty Campaign
**What goes wrong:** A freshly created campaign has zero voters, so voter search returns no results
**Why it happens:** D-02 creates fresh data, but voter import is not part of the journey
**How to avoid:** The voter search step should verify the search UI works (input visible, search submits, table renders with empty state or results) rather than asserting specific voter data. Alternatively, verify the voter list page loads correctly
**Warning signs:** Assertions expecting voter rows will fail on a fresh campaign

### Pitfall 6: Phone Bank Session on Fresh Campaign
**What goes wrong:** Creating a phone bank session requires selecting a call list, but a fresh campaign has no call lists
**Why it happens:** Call lists are not created as part of the journey
**How to avoid:** The phone bank step should verify the phone bank page loads and shows the sessions UI. If creating a session is desired, the journey must first create a call list, or this step should be scoped to "verify phone bank section is accessible" rather than "create a full session"
**Warning signs:** "No call lists available" when trying to create a session

## Code Examples

### Connected Journey Spec Skeleton
```typescript
// Source: Derived from existing specs + CONTEXT.md decisions
import { test, expect } from "@playwright/test"

test.describe.serial("Connected user journey", () => {
  test("org dashboard through phone bank session", async ({ page }) => {
    // Increase timeout for multi-step journey
    test.setTimeout(120_000)

    let campaignName: string

    await test.step("Org dashboard loads with campaign cards", async () => {
      await page.goto("/")
      await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })
      // Verify org dashboard is visible
      await expect(
        page.getByRole("link").filter({ hasText: /create campaign/i }).first()
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Create campaign via wizard", async () => {
      campaignName = `E2E Journey ${Date.now()}`
      // Click Create Campaign
      await page.getByRole("link").filter({ hasText: /create campaign/i }).first().click()
      await page.waitForURL(/campaigns\/new/)

      // Step 1: Fill campaign details
      await page.getByLabel(/campaign name/i).fill(campaignName)
      // Select campaign type
      await page.getByRole("combobox").click()
      await page.getByRole("option", { name: "Local" }).click()
      await page.getByRole("button", { name: /continue to review/i }).click()

      // Step 2: Review
      await expect(page.getByText(campaignName)).toBeVisible()
      await page.getByRole("button", { name: /continue to invite/i }).click()

      // Step 3: Skip invites and create
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes("api/v1/campaigns") && resp.request().method() === "POST"
      )
      await page.getByText(/skip.*create without inviting/i).click()
      const response = await responsePromise
      expect(response.status()).toBeLessThan(300)

      // Verify redirect to campaign dashboard
      await page.waitForURL(/campaigns\/[a-f0-9-]+\/dashboard/, { timeout: 15_000 })
    })

    await test.step("Create turf on new campaign", async () => {
      // Navigate to canvassing
      await page.getByRole("link", { name: /canvassing/i }).first().click()
      await expect(page.getByText(/canvassing/i).first()).toBeVisible({ timeout: 15_000 })

      // Create new turf
      await page.getByRole("link", { name: /new turf/i }).first().click()
      await page.getByLabel(/name/i).first().fill("Journey Test Turf")

      // Use GeoJSON editor
      await page.getByRole("button", { name: /edit as geojson/i }).click()
      await page.locator("#boundary").fill(
        '{"type":"Polygon","coordinates":[[[-83.65,32.84],[-83.64,32.84],[-83.64,32.85],[-83.65,32.85],[-83.65,32.84]]]}'
      )
      await page.getByRole("button", { name: /create turf/i }).click()
      await page.waitForURL(/canvassing/, { timeout: 15_000 })
      await expect(page.getByText("Journey Test Turf")).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Voter search on campaign", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      // Verify voter page loads (may be empty on fresh campaign)
      await expect(
        page.getByRole("table").or(page.getByText(/no voters|all voters/i)).first()
      ).toBeVisible({ timeout: 15_000 })
    })

    await test.step("Phone bank section accessible", async () => {
      await page.getByRole("link", { name: /phone bank/i }).first().click()
      // Verify phone bank page loads
      await expect(
        page.getByText(/phone bank/i).first()
      ).toBeVisible({ timeout: 15_000 })
    })
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `test.describe.configure({ mode: 'serial' })` | `test.describe.serial()` | Playwright 1.10+ | Both work; `.serial()` is more explicit shorthand |
| Manual auth per test | `storageState` project dependency | Playwright 1.28+ (projects) | Already adopted in Phase 46 |

## Open Questions

1. **Voter search on empty campaign**
   - What we know: Fresh campaign has zero voters. The voter list page may show "No voters" empty state instead of a searchable table.
   - What's unclear: Whether the search input is visible on the empty state page or only after voters exist.
   - Recommendation: Assert voter page navigation succeeds and key UI (heading, search/filter controls or empty state) is visible. Do not assert search results.

2. **Phone bank session creation feasibility**
   - What we know: Creating a session requires selecting a call list. Fresh campaigns have no call lists.
   - What's unclear: Whether the phone bank page shows useful UI without call lists.
   - Recommendation: Verify phone bank section navigation works and page loads. Skip session creation unless the journey also creates a call list first.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test ^1.58.2 |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test connected-journey` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Connected journey across phase boundaries | e2e | `cd web && npx playwright test connected-journey` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test connected-journey`
- **Per wave merge:** `cd web && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/connected-journey.spec.ts` -- the entire deliverable of this phase

## Sources

### Primary (HIGH confidence)
- `web/playwright.config.ts` -- Playwright project configuration, testMatch patterns, serial/parallel settings
- `web/e2e/turf-creation.spec.ts` -- Turf creation selectors and GeoJSON patterns
- `web/e2e/voter-search.spec.ts` -- Voter search navigation and waitForResponse pattern
- `web/e2e/phone-bank.spec.ts` -- Phone bank navigation and session creation selectors
- `web/e2e/auth.setup.ts` -- Stored auth state setup
- `web/src/routes/campaigns/new.tsx` -- Campaign creation wizard: form fields, step flow, submit handler, redirect target

### Secondary (MEDIUM confidence)
- [Playwright docs: test.describe.serial](https://playwright.dev/docs/api/class-test) -- serial mode semantics
- [Playwright docs: parallelism](https://playwright.dev/docs/test-parallel) -- fullyParallel override behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- already installed, no new dependencies
- Architecture: HIGH -- decisions locked in CONTEXT.md, existing patterns well-documented in codebase
- Pitfalls: HIGH -- identified from source code analysis of campaign wizard and existing spec patterns

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- no moving parts)
