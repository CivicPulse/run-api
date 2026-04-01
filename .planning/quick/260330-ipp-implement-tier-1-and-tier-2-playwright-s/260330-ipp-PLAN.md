---
phase: quick
plan: 260330-ipp
type: execute
wave: 1
depends_on: []
files_modified:
  - web/playwright.config.ts
  - web/e2e/helpers.ts
  - web/e2e/fixtures.ts
  - .github/workflows/pr.yml
  # Tier 2 items 5+6 touch all 28+ spec files in web/e2e/
autonomous: true
requirements: [IPP-T1, IPP-T2]

must_haves:
  truths:
    - "Playwright config has reducedMotion: 'reduce' in use block"
    - "Local workers set to 6, CI workers set to 2"
    - "Zero waitForTimeout() calls remain in e2e specs (except retry backoff in helpers.ts)"
    - "Zero networkidle waits remain in e2e specs (except retry backoff in helpers.ts)"
    - "Worker-scoped campaignId fixture resolves seed campaign once per worker"
    - "All specs using navigateToSeedCampaign/getSeedCampaignId import from fixtures.ts instead"
    - "CI workflow caches npm dependencies and shares Vite build artifact"
  artifacts:
    - path: "web/playwright.config.ts"
      provides: "Updated config with reducedMotion, worker counts"
    - path: "web/e2e/fixtures.ts"
      provides: "Worker-scoped campaignId fixture via test.extend"
      exports: ["test", "expect"]
    - path: "web/e2e/helpers.ts"
      provides: "Updated helpers — getSeedCampaignId remains for fixture use, navigateToSeedCampaign removed"
    - path: ".github/workflows/pr.yml"
      provides: "npm cache, Vite build artifact sharing"
  key_links:
    - from: "web/e2e/fixtures.ts"
      to: "web/e2e/helpers.ts"
      via: "imports getSeedCampaignId for worker-scoped resolution"
      pattern: "import.*getSeedCampaignId.*helpers"
    - from: "web/e2e/*.spec.ts"
      to: "web/e2e/fixtures.ts"
      via: "import { test, expect } from './fixtures'"
      pattern: "from.*fixtures"
---

<objective>
Implement Tier 1 (config changes) and Tier 2 (high-impact refactors) Playwright speed improvements to reduce E2E test runtime both locally and in CI.

Purpose: The E2E suite has accumulated 87 hard sleeps (waitForTimeout), 54 networkidle waits, and ~120 redundant campaign lookups that add minutes of wasted time per run. Config changes alone provide 20-40% speedup; eliminating waits and redundant navigations will compound further.

Output: Faster, more reliable E2E tests with event-driven waits instead of hard sleeps, shared campaign fixture instead of per-test lookups, and optimized CI pipeline.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/playwright.config.ts
@web/e2e/helpers.ts
@.github/workflows/pr.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tier 1 config changes — reducedMotion, workers, and CI npm cache</name>
  <files>web/playwright.config.ts, .github/workflows/pr.yml</files>
  <action>
**playwright.config.ts — 3 changes:**

1. Add `reducedMotion: 'reduce'` to the `use` block (after `actionTimeout`). This tells the browser to honor prefers-reduced-motion, eliminating CSS animation delays during tests.

2. Change local workers from `4` to `6`:
   ```
   workers: process.env.CI ? 2 : 6,
   ```

3. Change CI workers from `1` to `2` (same line as above — the ternary already exists).

**.github/workflows/pr.yml — 1 change:**

4. Add `cache: 'npm'` to EVERY `actions/setup-node@v4` step. There are currently TWO occurrences:
   - In the `frontend` job (line ~46)
   - In the `e2e-tests` job (line ~133)
   - In the `merge-e2e-reports` job (line ~211)

   For each, change:
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: "22"
       cache: "npm"
       cache-dependency-path: web/package-lock.json
   ```

   The `cache-dependency-path` is needed because package-lock.json is in the `web/` subdirectory, not the repo root.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/civicpulse/run-api/web && grep -c "reducedMotion" playwright.config.ts && grep "workers:" playwright.config.ts | head -1 && cd /home/kwhatcher/projects/civicpulse/run-api && grep -c "cache:" .github/workflows/pr.yml</automated>
  </verify>
  <done>
  - playwright.config.ts has `reducedMotion: 'reduce'` in use block
  - workers line reads `workers: process.env.CI ? 2 : 6,`
  - All 3 setup-node steps in pr.yml have `cache: "npm"` and `cache-dependency-path`
  </done>
</task>

<task type="auto">
  <name>Task 2: Create campaignId fixture and eliminate waitForTimeout/networkidle across all specs</name>
  <files>web/e2e/fixtures.ts, web/e2e/helpers.ts, and all 28+ spec files in web/e2e/</files>
  <action>
**Part A: Create worker-scoped campaignId fixture (Item 7)**

Create `web/e2e/fixtures.ts` that extends Playwright's `test` with a worker-scoped `campaignId` fixture:

```typescript
import { test as base, expect } from "@playwright/test"

// Worker-scoped fixture: resolves seed campaign ID once per worker process.
// Eliminates ~120 redundant navigateToSeedCampaign() calls (each 3-8s).
export const test = base.extend<{}, { campaignId: string }>({
  campaignId: [async ({ browser }, use) => {
    // Create a temporary page to resolve the campaign ID via API
    const context = await browser.newContext({
      storageState: "playwright/.auth/owner.json",
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    // Navigate to app to establish auth context
    const baseURL = process.env.CI
      ? "https://localhost:4173"
      : (process.env.E2E_USE_DEV_SERVER === "1" ? "http://localhost:5173" : "https://localhost:4173")
    await page.goto(baseURL)
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 }
    )

    // Extract auth token from localStorage
    const token = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (key.startsWith("oidc.user:")) {
          try {
            const user = JSON.parse(localStorage.getItem(key)!)
            if (user?.access_token) return user.access_token as string
          } catch { /* skip */ }
        }
      }
      throw new Error("No OIDC access token found in localStorage")
    })

    // Resolve campaign ID via API
    const resp = await page.request.get("/api/v1/me/campaigns", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const campaigns = await resp.json()
    const seed = campaigns.find(
      (c: { campaign_name?: string; name?: string }) =>
        /macon.?bibb/i.test(c.campaign_name ?? c.name ?? ""),
    )
    const campaignId = seed?.campaign_id ?? seed?.id
    if (!campaignId) throw new Error("Could not find seed campaign via API")

    await context.close()
    await use(campaignId)
  }, { scope: "worker" }],
})

export { expect }
```

**Part B: Update helpers.ts**

- Keep `getSeedCampaignId` (it is still useful as a fallback and for the fixture itself)
- Keep `getAuthToken`, `authHeaders`, `apiGet`, `apiPost`, `apiPatch`, `apiDelete`
- Remove the `navigateToSeedCampaign` function (it will be replaced by the fixture)
- In `getSeedCampaignId`, replace the retry backoff `waitForTimeout` calls with a simple `await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))` since these are genuine retry delays not UI waits (or keep them — these are acceptable since they're error recovery, not test flow). DECISION: Keep the retry waitForTimeout in getSeedCampaignId — it's genuine exponential backoff, not a test-flow wait. But remove the `networkidle` wait in getSeedCampaignId and replace with waiting for the page to have a non-login URL (the waitForURL already does this).

In `getSeedCampaignId`, replace:
```typescript
await page.waitForLoadState("networkidle")
```
with:
```typescript
await page.waitForLoadState("domcontentloaded")
```

**Part C: Update all spec files — import swap and campaignId fixture**

For every spec file that currently imports from `"./helpers"` and uses `navigateToSeedCampaign` or `getSeedCampaignId`:

1. Change `import { test, expect } from "@playwright/test"` to `import { test, expect } from "./fixtures"`
2. Change `import { navigateToSeedCampaign, ... } from "./helpers"` to import only the remaining helpers needed (apiPost, apiPatch, apiDelete, apiGet, authHeaders, getAuthToken)
3. Replace `campaignId = await navigateToSeedCampaign(page)` with:
   - Use the destructured `campaignId` from the test function signature: `async ({ page, campaignId }) => { ... }`
   - Then navigate directly: `await page.goto(\`/campaigns/${campaignId}/dashboard\`); await page.waitForURL(/campaigns\//, { timeout: 10_000 })`
4. Replace `const id = await getSeedCampaignId(page)` with the `campaignId` fixture parameter

**Files that use navigateToSeedCampaign (22 files):**
volunteer-tags-availability, phone-banking, call-lists-dnc, voter-contacts, walk-lists, voter-notes, voter-import, voter-crud, voter-lists, volunteer-signup, shifts, uat-tooltip-popovers, navigation, data-validation, voter-tags, volunteers, voter-filters, field-mode.volunteer, cross-cutting, turfs, surveys, helpers.ts

**Files that use getSeedCampaignId (14 files):**
rbac.volunteer, rbac, table-sort, phase14-import-verify, phase12-settings-verify, rbac.admin, phase20-caller-picker-verify, rbac.manager, phase27-filter-wiring, rbac.viewer, role-gated.volunteer, phase29-verify, phase13-voter-verify, helpers.ts

**For specs that DON'T use navigateToSeedCampaign/getSeedCampaignId** but DO have waitForTimeout or networkidle, they should still get the import swap for `test`/`expect` from `./fixtures` (so all specs are consistent), but only if they need the `campaignId` fixture. If they don't need campaignId, leave the `@playwright/test` import.

**Part D: Eliminate waitForTimeout() calls (Item 5)**

Across all 28 spec files with 87 occurrences, replace each `waitForTimeout` with the appropriate event-driven alternative. Each replacement must be evaluated individually based on context. Here are the replacement patterns:

**Pattern 1: "Wait for UI to settle after action" (most common, ~40 occurrences)**
- Before: `await button.click(); await page.waitForTimeout(500)`
- After: `await button.click(); await expect(targetElement).toBeVisible()` or `await expect(dialog).not.toBeVisible()`
- The key is: what was the code WAITING FOR? Find the next assertion or action and wait for its precondition instead.

**Pattern 2: "Wait after form submit / API call" (~20 occurrences)**
- Before: `await submitBtn.click(); await page.waitForTimeout(2000)`
- After: `await submitBtn.click(); await page.waitForResponse(resp => resp.url().includes('/api/v1/') && resp.status() < 400)` or `await expect(page.getByText(/success|saved|created/i)).toBeVisible()`
- Look for toast messages, URL changes, or table updates as signals.

**Pattern 3: "Wait for tab/accordion content" (~10 occurrences)**
- Before: `await tab.click(); await page.waitForTimeout(500)`
- After: `await tab.click(); await expect(tabPanel).toBeVisible()` where tabPanel is the content that appears

**Pattern 4: "Wait for animation" (~10 occurrences, e.g., 300ms, 500ms)**
- Before: `await page.waitForTimeout(300)` // animation
- After: With `reducedMotion: 'reduce'` in config, animations are suppressed. Replace with `await expect(element).toBeVisible()` for the post-animation state.

**Pattern 5: "Wait for data to load after navigation" (~7 occurrences)**
- Before: `await page.goto(url); await page.waitForTimeout(2000)`
- After: `await page.goto(url); await expect(page.locator('table, [data-testid], h1, h2').first()).toBeVisible({ timeout: 10_000 })`
- Wait for the actual content element the test will interact with next.

**EXCEPTIONS — keep waitForTimeout for these cases:**
- Retry backoff delays in `helpers.ts` getSeedCampaignId (genuine exponential backoff)
- Offline simulation in field-mode.volunteer.spec.ts where timing is part of the test semantics
- Any place where a comment explicitly says the delay is intentional for testing a timing-dependent feature

**Part E: Eliminate networkidle waits (Item 6)**

Across 22 files with 54 occurrences, replace `waitForLoadState("networkidle")` with specific element assertions:

**Pattern 1: After page.goto() — wait for page content instead**
- Before: `await page.goto(url); await page.waitForLoadState("networkidle")`
- After: `await page.goto(url); await expect(page.locator('SPECIFIC_ELEMENT')).toBeVisible({ timeout: 10_000 })`
- Where SPECIFIC_ELEMENT is the first element the test interacts with (a heading, table, form input, etc.)

**Pattern 2: After tab click — wait for tab panel content**
- Before: `await tab.click(); await page.waitForLoadState("networkidle")`
- After: `await tab.click(); await expect(tabContent).toBeVisible()`

**Pattern 3: In helper functions (gotoAndWaitForAuth in phase13)**
- Replace `networkidle` with `domcontentloaded` + explicit element assertion

**IMPORTANT GUIDANCE for the executor:**
- Do NOT blindly find-and-replace. Each occurrence needs the executor to look at what the NEXT line of code does (the next assertion or interaction) and wait for THAT element/condition instead.
- When replacing `waitForTimeout(2000)` after a form submit, look for success toasts (`page.getByText(/success|saved|created|updated|deleted/i)`), URL changes (`page.waitForURL`), or element state changes.
- When replacing `waitForTimeout(500)` after a click, the next line usually has an `expect()` — just remove the timeout and increase the `expect` timeout if needed.
- For the `phase29-verify.spec.ts` file (9 waitForTimeout occurrences, mostly 500ms after filter interactions): replace with `await expect(chip/element).toBeVisible()` for the filter chip that appears.
- For `shifts.spec.ts` (10 waitForTimeout occurrences, mostly 2000ms): most are after form submits — use `waitForResponse` or toast assertions.
- For `field-mode.volunteer.spec.ts` (17 waitForTimeout occurrences): many 500ms waits are after wizard advancement — wait for the next wizard step content to appear. The 2000ms waits around offline simulation should use `await expect(offlineBanner).toBeVisible()` or similar.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/civicpulse/run-api/web && grep -r "waitForTimeout" e2e/*.spec.ts | wc -l && grep -r "networkidle" e2e/*.spec.ts | wc -l && grep -r "navigateToSeedCampaign" e2e/*.spec.ts | wc -l && test -f e2e/fixtures.ts && echo "fixtures.ts exists"</automated>
  </verify>
  <done>
  - `web/e2e/fixtures.ts` exists with worker-scoped campaignId fixture
  - Zero `waitForTimeout` calls in spec files (only allowed in helpers.ts retry backoff)
  - Zero `networkidle` calls in spec files (only allowed in helpers.ts if needed)
  - Zero `navigateToSeedCampaign` calls in spec files (function removed from helpers.ts)
  - All specs that need campaignId import `{ test, expect }` from `"./fixtures"` and destructure `campaignId` from test args
  - E2E test suite still passes: `cd web && ./scripts/run-e2e.sh`
  </done>
</task>

<task type="auto">
  <name>Task 3: Share Vite build artifact from frontend job to e2e-tests job in CI</name>
  <files>.github/workflows/pr.yml</files>
  <action>
Modify `.github/workflows/pr.yml` to upload the Vite build output from the `frontend` job and download it in `e2e-tests`, eliminating a redundant `npm run build` inside each shard's Docker environment.

**In the `frontend` job**, after the existing "Build" step, add an upload step:

```yaml
      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: web/dist
          retention-days: 1
```

**In the `e2e-tests` job**, after the "Install Playwright browsers" step and before "Run E2E tests":

1. Add a download step:
```yaml
      - name: Download frontend build
        uses: actions/download-artifact@v4
        with:
          name: web-dist
          path: web/dist
```

2. The `e2e-tests` job currently runs `npm ci` which installs dependencies, then the Playwright config's `webServer` command (`npm run preview`) serves from `web/dist`. Since the build artifact is now pre-built, the preview server will just serve it directly — no build step needed inside the e2e job.

3. Make sure the `e2e-tests` job has `needs: [lint, test, frontend]` (it already does), so the build artifact is guaranteed available.

**IMPORTANT:** Verify that `npm run preview` in the web package.json serves from the `dist/` directory (standard Vite behavior). If it runs a build first, this needs to be a preview-only command. Check `web/package.json` for the `preview` script definition.
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/civicpulse/run-api && grep -A3 "Upload build artifact" .github/workflows/pr.yml && grep -A3 "Download frontend build" .github/workflows/pr.yml</automated>
  </verify>
  <done>
  - `frontend` job uploads `web/dist` as `web-dist` artifact
  - `e2e-tests` job downloads `web-dist` artifact before running tests
  - No redundant build step in e2e-tests job
  - CI workflow YAML is valid (check with `python -c "import yaml; yaml.safe_load(open('.github/workflows/pr.yml'))"`)
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:

1. **Config verification:**
   - `grep reducedMotion web/playwright.config.ts` shows `'reduce'`
   - `grep workers web/playwright.config.ts` shows `process.env.CI ? 2 : 6`

2. **Wait elimination verification:**
   - `grep -r "waitForTimeout" web/e2e/*.spec.ts | wc -l` returns 0
   - `grep -r "networkidle" web/e2e/*.spec.ts | wc -l` returns 0
   - `grep -r "navigateToSeedCampaign" web/e2e/*.spec.ts | wc -l` returns 0

3. **Fixture verification:**
   - `web/e2e/fixtures.ts` exports `test` and `expect`
   - Specs importing campaignId use `./fixtures` import

4. **CI verification:**
   - `grep -c "cache:" .github/workflows/pr.yml` returns 3
   - `grep "web-dist" .github/workflows/pr.yml` shows upload and download steps

5. **Full suite smoke test:**
   - `cd web && ./scripts/run-e2e.sh` passes with no regressions
</verification>

<success_criteria>
- All 4 Tier 1 config changes applied (reducedMotion, npm cache x3, workers 6 local / 2 CI)
- All 87 waitForTimeout calls eliminated from spec files (replaced with event-driven waits)
- All 54 networkidle waits eliminated from spec files (replaced with element assertions)
- Worker-scoped campaignId fixture created, eliminating ~120 redundant navigateToSeedCampaign calls
- Vite build artifact shared from frontend to e2e-tests CI job
- E2E test suite passes locally with no regressions
</success_criteria>

<output>
After completion, create `.planning/quick/260330-ipp-implement-tier-1-and-tier-2-playwright-s/260330-ipp-SUMMARY.md`
</output>
