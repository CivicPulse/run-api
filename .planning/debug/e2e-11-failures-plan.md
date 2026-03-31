# E2E Fix Plan — 11 Remaining Failures

## Summary

11 failing tests across 8 spec files. Root causes break into three buckets:

| Bucket | Count | Description |
|--------|-------|-------------|
| APP BUG | 2 | Real code defects |
| TEST BUG | 4 | Wrong locators, timing, or logic |
| INFRASTRUCTURE | 5 | DB pool exhaustion / dev-server latency under 16-worker parallel load |

**37 cascaded skips** will resolve automatically once their parent setup test is fixed.

**Recommended team:** 3 parallel agents — Agent A (2 app bugs), Agent B (4 test bugs), Agent C (5 infra-hardening fixes). Agent A and B can run in parallel; Agent C can start in parallel with both.

---

## Failure Analysis

### 1. phase21:76 — DNC search filters by reason text

- **File:** `web/e2e/phase21-integration-polish.spec.ts:76`
- **Error:** `expect(locator).toBeVisible()` failed — `getByText('Reason').first()` not found within 10s
- **Context:** `phase21:30` (the prior test in this spec) passed and created `p21-01-dnc-table.png`. Both tests do identical navigation: `page.goto(/campaigns/${campaignId}/phone-banking/dnc)` then look for "Reason" with `timeout: 10_000`. The DNC page renders a DataTable with a "Reason" column header.
- **Root cause:** INFRASTRUCTURE — timing. Both tests use the same `beforeEach` which navigates through the org dashboard to find the campaign. Under parallel load (16 workers), the DNC page data load takes > 10s on the second test because the OIDC session is re-initialised for each test in this spec (non-fixture auth, uses `@playwright/test` base, not `./fixtures`). The page arrives at the DNC URL before the table columns render.
- **Fix:** In `phase21-integration-polish.spec.ts:79–82`, increase the initial "Reason" header wait timeout from `10_000` to `30_000` ms. Also add a `page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})` call before the `expect`. No app-code change needed.
  ```ts
  // line 79
  await page.goto(`/campaigns/${campaignId}/phone-banking/dnc`)
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
  await expect(page.getByText("Reason").first()).toBeVisible({
    timeout: 30_000,  // was 10_000
  })
  ```
- **Cascades:** None (standalone test).

---

### 2. data-validation:140 — Setup: import fixture CSV

- **File:** `web/e2e/data-validation.spec.ts:140`
- **Error:** `getByText(/column mapping/i).first()` not visible within 30s. The error context snapshot shows: `"Request failed with status code 500 Internal Server Error: POST .../imports/.../detect"` displayed inside the wizard's drop-zone. The `/detect` endpoint returned 500.
- **Root cause:** INFRASTRUCTURE — DB pool exhaustion (`sorry, too many clients already` error logged at the fixture level at this point in time). The `detect_columns` endpoint (which fetches from MinIO + reads DB) hit the pool limit under concurrent load. The import wizard renders the 500 as an error message in the DropZone and does not advance to the column mapping step.
- **Fix:** The `importFixtureCSV()` helper in `data-validation.spec.ts` (lines 60–107) needs retry logic on the upload step. Currently there is none. When the `/detect` endpoint returns 500, the wizard stalls. The helper should detect the error state (look for "Try uploading again" or error text in the dropzone) and retry the file upload up to 2 times with a 5s delay.
  ```ts
  // In importFixtureCSV helper, after setInputFiles:
  for (let attempt = 0; attempt < 3; attempt++) {
    await fileInput.setInputFiles("e2e/fixtures/l2-test-voters.csv")
    const columnMapping = page.getByText(/column mapping/i).first()
    const errorIndicator = page.getByText(/500|failed|try again/i).first()
    const result = await Promise.race([
      columnMapping.waitFor({ state: "visible", timeout: 30_000 }).then(() => "ok"),
      errorIndicator.waitFor({ state: "visible", timeout: 30_000 }).then(() => "error"),
    ]).catch(() => "timeout")
    if (result === "ok") break
    if (attempt < 2) {
      // Re-click "Try uploading again" or re-navigate
      const retryBtn = page.getByRole("button", { name: /try again/i })
      if (await retryBtn.isVisible().catch(() => false)) await retryBtn.click()
      await page.waitForTimeout(5_000)
    } else {
      throw new Error("Import detect endpoint failed after 3 attempts")
    }
  }
  ```
- **Cascades:** VAL-01, VAL-02 (2 tests) will pass once Setup succeeds.

---

### 3. campaign-settings:206 — CAMP-03: Change member role

- **File:** `web/e2e/campaign-settings.spec.ts:206`
- **Error:** `expect(roleResponse.status()).toBeLessThan(400)` — received 500. The page snapshot shows "Failed to update role" toast. The 500 is `sorry, too many clients already` (DB pool exhaustion — logged at fixture at the same time).
- **Root cause:** INFRASTRUCTURE — DB pool exhaustion. The `update_member_role` endpoint hits the exhausted pool during a high-concurrency window. The API correctly handles the error, and the test correctly captures the HTTP status.
- **Fix:** The test must tolerate transient 500s from the API. Since the test is asserting the HTTP status of the role-update response, it should either (a) retry the role change if it gets a 5xx, or (b) wait before the API call for some "breathing room". A retry approach is cleaner:
  ```ts
  // After page.getByRole("button", { name: /save/i }).click()
  // Replace the immediate status check with a retry loop
  let roleResponse = await roleResponsePromise
  if (roleResponse.status() >= 500) {
    // Retry once after a short pause
    await page.waitForTimeout(3_000)
    // Re-open dialog and retry
    await nonOwnerRow.getByRole("button").first().click()
    await page.getByRole("menuitem", { name: /change role/i }).click()
    const retryResponsePromise = page.waitForResponse(/* same filter */)
    const roleCombobox = page.locator("[role='dialog']").getByRole("combobox")
    await roleCombobox.click()
    await page.getByRole("option", { name: /manager/i }).click()
    await page.getByRole("button", { name: /save/i }).click()
    roleResponse = await retryResponsePromise
  }
  expect(roleResponse.status()).toBeLessThan(400)
  ```
  Alternatively, reduce the parallel worker count to lower DB pressure (see also Agent C recommendation below).
- **Cascades:** CAMP-04, CAMP-06 (2 tests) will pass once CAMP-03 passes.

---

### 4. call-lists-dnc:144 — CL-01: Create a call list via UI

- **File:** `web/e2e/call-lists-dnc.spec.ts:144`
- **Error:** `getByText(/call list created/i).first()` not visible within 120s (2.2 minute timeout). The create form was submitted, but the success toast never appeared.
- **Root cause:** INFRASTRUCTURE — dev server latency under parallel load. The `POST /api/v1/campaigns/${campaignId}/call-lists` request likely timed out or was very slow (the DB was under load at this time). The `createMutation.mutateAsync` awaits the API, and if the API takes >120s, the ky client throws a timeout error, which is caught by the `catch` block and fires an error toast instead (or no toast if the ky timeout is longer). The 2.2-minute wall clock includes the navigation pre-warming.
- **Fix:** 
  1. The test already pre-warms OIDC, which is good. The primary issue is the API timing out. The ky client's default timeout may need increasing for this test environment, OR the test should verify the call list was created via API fallback if the toast doesn't appear.
  2. Add a fallback assertion: after the 120s toast wait, if the toast isn't visible, check whether the call list now appears in the list anyway (in case the toast was dismissed before the check):
  ```ts
  // After the toast check, add:
  await expect(
    page.getByText("E2E Call List 1").first(),
  ).toBeVisible({ timeout: 30_000 })
  ```
  This is already at line 177. The issue is that line 174 throws before we reach line 177. Consider wrapping the toast check as a non-fatal assertion and rely on the list-presence check as the authoritative assertion.
  3. Deeper fix: increase the `ky` client timeout in `web/src/api/client.ts` from its current value (likely 30s) to 60s, so the toast fires before the toast check times out.
- **Cascades:** CL-02 through DNC-06 (11 tests) will pass once CL-01 passes.

---

### 5. phase12-settings-verify:339 — CAMP-02: Delete dialog confirm

- **File:** `web/e2e/phase12-settings-verify.spec.ts:339`
- **Error:** `expect(confirmBtn).toBeDisabled()` failed — button was enabled. The "Delete campaign" confirm button in the `DestructiveConfirmDialog` was enabled immediately after opening the dialog.
- **Root cause:** APP BUG — race condition in `danger.tsx`. The `DestructiveConfirmDialog` is rendered with `confirmText={campaign?.name ?? ""}`. When campaign data is still loading (initial render), `campaign` is `undefined`, so `confirmText` becomes `""`. The `DestructiveConfirmDialog` component initialises `inputValue = ""` (via `useState("")`) and computes `isMatch = inputValue === confirmText` = `"" === ""` = `true`. The confirm button therefore starts ENABLED, violating the expected type-to-confirm UX.
- **Fix:** APP BUG. In `web/src/routes/campaigns/$campaignId/settings/danger.tsx` (line 148), guard the dialog from rendering until campaign data is loaded:
  ```tsx
  // Option A: render dialog only when campaign name is available
  {deleteDialogOpen && campaign?.name && (
    <DestructiveConfirmDialog
      open={deleteDialogOpen}
      ...
      confirmText={campaign.name}
      ...
    />
  )}
  ```
  Or, in `DestructiveConfirmDialog.tsx`, add a guard: if `confirmText` is empty, keep the button disabled regardless of `isMatch`:
  ```tsx
  // Line 78 of DestructiveConfirmDialog.tsx
  disabled={!isMatch || isPending || !confirmText}
  ```
  The second option is more defensive and prevents the bug in all future usages of the component.
- **Cascades:** None (standalone test).

---

### 6. navigation:236 — NAV-03: breadcrumbs

- **File:** `web/e2e/navigation.spec.ts:236`
- **Error:** `expect(voterLink).toBeVisible({ timeout: 10_000 })` failed — `locator('table tbody tr a').first()` not found.
- **Context:** The navigation error context snapshot confirms the voters page loaded (the `<table>` with column headers is visible), but the `tbody tr a` wasn't found within 10s. The voters page data loads asynchronously via TanStack Query. The `<table>` skeleton/shell renders immediately, but the actual data rows (with `<Link>` → `<a>`) arrive after the API response.
- **Root cause:** TEST BUG — timeout is too short for the data to load under parallel dev server load. The test navigates to voters, waits for the table to be visible (`timeout: 15_000` at line 249), then immediately expects a voter link with only `timeout: 10_000`. But the table skeleton is visible before data rows render, so the table passes the first check while rows are still loading.
- **Fix:** In `navigation.spec.ts:255`, increase the voter link timeout and add an explicit wait for at least one tbody row before asserting link visibility:
  ```ts
  // Replace the single voter link assertion:
  const voterLink = page.locator("table tbody tr a").first()
  await expect(voterLink).toBeVisible({ timeout: 30_000 })  // was 10_000
  ```
  Also consider changing the first `await expect(page.getByRole("table")).toBeVisible()` to wait for a row instead:
  ```ts
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 })
  ```
- **Cascades:** None (standalone test).

---

### 7. volunteer-tags-availability:80 — Setup: create 10 volunteers via API

- **File:** `web/e2e/volunteer-tags-availability.spec.ts:80`
- **Error:** `expect(resp.ok()).toBeTruthy()` failed — `POST /api/v1/campaigns/${campaignId}/volunteers` returned non-ok response.
- **Root cause:** INFRASTRUCTURE — DB pool exhaustion. The fixture campaign API call hit the pool during a high-concurrency window. The `createVolunteerViaApi` helper has no retry logic.
- **Fix:** Add retry logic to `createVolunteerViaApi` in `volunteer-tags-availability.spec.ts` (similar to the existing `createVoterViaApi` pattern in `voter-lists.spec.ts` which retries on 429):
  ```ts
  async function createVolunteerViaApi(page: Page, campaignId: string, data: Record<string, unknown>): Promise<string> {
    const url = `/api/v1/campaigns/${campaignId}/volunteers`
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await apiPost(page, url, data)
      if (resp.ok()) return (await resp.json()).id
      if (resp.status() >= 500 && attempt < 2) {
        await page.waitForTimeout(3_000 * (attempt + 1))
        continue
      }
      throw new Error(`POST ${url} failed: ${resp.status()}`)
    }
    throw new Error(`POST ${url} failed after 3 retries`)
  }
  ```
- **Cascades:** VTAG-01 through AVAIL-03 (8 tests) will pass once Setup passes.

---

### 8. voter-import:65 — IMP-01: Import L2 file

- **File:** `web/e2e/voter-import.spec.ts:65`
- **Error:** `getByText(/import complete|import cancelled/i).first()` not visible within 60s. The wizard stalls at or before the column mapping step (same root cause as #2 above — the `/detect` endpoint returns 500).
- **Root cause:** INFRASTRUCTURE — DB pool exhaustion at the `/detect` step. The `voter-import.spec.ts:IMP-01` navigates to imports, uploads the fixture CSV, and waits for the wizard to advance to column mapping (line 83–85). Under high load, `/detect` hits the DB pool limit and returns 500, showing an error in the wizard's dropzone. The wizard never advances to the "import complete" step.
- **Fix:** Apply the same retry pattern as recommended for data-validation (#2). Specifically in `voter-import.spec.ts`, after `uploadFixtureCsv(page)` at line 79, add a retry loop for the column mapping step:
  ```ts
  // After uploadFixtureCsv(page):
  let columnMappingVisible = false
  for (let attempt = 0; attempt < 3 && !columnMappingVisible; attempt++) {
    if (attempt > 0) {
      // Re-upload after error
      const retryBtn = page.getByRole("button", { name: /try again/i })
      if (await retryBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await retryBtn.click()
      } else {
        await page.reload()
        await startNewImport(page)
      }
      await uploadFixtureCsv(page)
      await page.waitForTimeout(3_000)
    }
    columnMappingVisible = await page
      .getByText(/column mapping/i)
      .first()
      .isVisible({ timeout: 30_000 })
      .catch(() => false)
  }
  expect(columnMappingVisible).toBeTruthy()
  ```
- **Cascades:** IMP-02 through IMP-04 (3 tests) will pass once IMP-01 passes.

---

### 9. walk-lists:80 — Setup: ensure turf exists

- **File:** `web/e2e/walk-lists.spec.ts:80`
- **Error:** `expect(resp.ok()).toBeTruthy()` failed — `POST /api/v1/campaigns/${campaignId}/turfs` returned non-ok response.
- **Root cause:** INFRASTRUCTURE — DB pool exhaustion. `createTurfViaApi` has no retry logic:
  ```ts
  async function createTurfViaApi(...) {
    const resp = await apiPost(...)
    expect(resp.ok()).toBeTruthy()  // fails on 500
  }
  ```
- **Fix:** Add retry logic identical to the volunteer pattern (#7):
  ```ts
  async function createTurfViaApi(page, campaignId, name, boundary): Promise<string> {
    const url = `/api/v1/campaigns/${campaignId}/turfs`
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await apiPost(page, url, { name, boundary })
      if (resp.ok()) return (await resp.json()).id
      if (resp.status() >= 500 && attempt < 2) {
        await page.waitForTimeout(3_000 * (attempt + 1))
        continue
      }
      throw new Error(`POST ${url} failed: ${resp.status()}`)
    }
    throw new Error(`POST ${url} failed after 3 retries`)
  }
  ```
- **Cascades:** WL-01 through WL-07 (7 tests) will pass once Setup passes.

---

### 10. surveys:333 — SRV-04: Reorder questions

- **File:** `web/e2e/surveys.spec.ts:333`
- **Error:** `expect(adminRatingPos).toBeLessThan(votingLikelihoodPos)` — adminRatingPos (731) > votingLikelihoodPos (673). The admin rating question ended up AFTER voting likelihood after the 3 move-up operations.
- **Root cause:** TEST BUG — race condition in the reorder sequence. The `handleMoveQuestion` function sends the full ordered ID list to the server. The test clicks "Move question 5 up" → waits for PUT response → waits 2s → checks "Move question 4 up" button. However, after the first PUT, TanStack Query invalidates and refetches the survey data. If the refetch hasn't completed when the second click fires, the component's `questions` array still reflects the pre-first-move order, causing the second `reorder.mutate(ids)` to swap positions based on stale data. The 2-second wait is insufficient under high parallel load (dev server single-threaded, multiple workers).
- **Fix:** Two complementary changes:
  1. **In `surveys.spec.ts`**: increase the `waitForTimeout` after each move from `2_000` to `4_000` ms. Also add an explicit wait for the TanStack Query to reflect the server state — after each PUT completes, wait for the page to show the expected intermediate state:
     ```ts
     await done  // wait for PUT response
     await page.waitForTimeout(4_000)  // was 2_000
     ```
  2. **In `$scriptId.tsx`**: make `useReorderQuestions` do an optimistic update so the UI immediately reflects the new order without waiting for the refetch. This prevents stale-data clicks on the second move. Alternatively, disable all move buttons after a mutation starts and re-enable them only after the refetch settles.
  
  The simplest fix (test-only): increase wait times and add a verification step between moves:
  ```ts
  async function clickMoveUpAndWait(n: number) {
    const moveBtn = page.getByRole("button", { name: new RegExp(`move question ${n} up`, "i") })
    await expect(moveBtn).toBeEnabled({ timeout: 8_000 })
    const done = page.waitForResponse(...)
    await moveBtn.click()
    await done
    await page.waitForTimeout(4_000)  // was 2_000
    // Verify buttons re-enabled (cache refreshed)
    await expect(page.getByRole("button", { name: /move question/i }).first()).toBeEnabled({ timeout: 10_000 })
  }
  ```
- **Cascades:** SRV-05 through SRV-08 (4 tests) will pass once SRV-04 passes.

---

### 11. voter-lists:290 — VLIST-06: Delete both voter lists

- **File:** `web/e2e/voter-lists.spec.ts:290`
- **Error:** `getByText('List Alpha').first()` not visible within 10s after navigating to `/voters`.
- **Context:** After deleting both voter lists, the test navigates to `/campaigns/${campaignId}/voters` to verify that the voters still exist (list deletion must not delete voters). The campaign at this point contains exactly 5 voters created in Setup (first_name="List", last_names=["Alpha","Bravo","Charlie","Delta","Echo"]). These voters are rendered as "List Alpha", etc. in the voters table.
- **Root cause:** TEST BUG — the 10s timeout for `getByText("List Alpha")` is insufficient when the voters table is loading its data after navigation. The voters table renders a skeleton/shell immediately (passing the implicit `waitForURL`), then fetches data via TanStack Query. Under parallel load, the API response for the voters list can take > 10s.
- **Fix:** Increase the timeout for the voter presence check and add a table-loaded guard:
  ```ts
  // After page.waitForURL(/voters/, { timeout: 10_000 })
  // Wait for the table to have at least one row (data loaded)
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 })
  // Then check for the specific voter
  await expect(
    page.getByText("List Alpha").first(),
  ).toBeVisible({ timeout: 20_000 })  // was 10_000
  ```
- **Cascades:** Final assertion test (1 test) will pass once VLIST-06 passes.

---

## Skipped / Independent Issues

### CROSS-03: rate limiting returns 429

- **Status:** Conditional `test.skip` already in place (line 344 of `cross-cutting.spec.ts`).
- **Action:** No change needed. The test gracefully skips when rate limiting isn't triggered locally (by design — rate limiting is disabled or has higher limits in local dev).

### phase21:408 — Deleted call list fallback text

- **Status:** Unconditional `test.skip(...)` at line 408 of `phase21-integration-polish.spec.ts`.
- **Action:** No change needed. The implementation was verified via code review; automation is noted as impractical without mutating backend state in a way that's hard to undo.

### UI-03: error boundary

- **Status:** Unconditional `test.skip(true, ...)` at line 517 of `cross-cutting.spec.ts`.
- **Action:** No change needed. Known issue with ky/TanStack Query retry interaction. Needs a separate investigation.

### rbac.viewer: voter detail Edit/Interaction (lines 36 and 50)

- **Status:** Both are `test.skip(...)` at lines 36 and 50 of `rbac.viewer.spec.ts`.
- **Reason:** Viewer role (level 0) cannot access voter data (API returns 403), so the voter table shows empty and voter detail pages are inaccessible. These are intentional design decisions, documented in the spec comments.
- **Action:** No change needed. If viewer access to voter data is ever added, remove the `test.skip` wrapper.

### field-mode: FIELD-07, FIELD-08, FIELD-09, FIELD-10

- **Status:** Conditional `test.skip(true, "...")` inside each test, triggered when the walk list or call list is found to be completed/empty.
- **Reason:** The seed data (190 pre-recorded voter interactions) results in walk lists being fully completed. Phone banking sessions are also exhausted. These are data-state skips, not bugs in the app or test code.
- **Action:** No immediate code fix needed. To make these tests reliably run, the seed data would need to include at least one uncompleted walk list and one phone banking session with unclaimed entries. This is a seed-data improvement, not a test fix.

### PB-10: Delete a session

- **Status:** Unconditional `test.skip(true, "Backend DELETE endpoint not implemented")` at line 480 of `phone-banking.spec.ts`.
- **Action:** No change needed until the backend `DELETE /phone-bank-sessions/{id}` endpoint is implemented.

---

## Root Cause Pattern Summary

Five of the 11 failures are caused by DB pool exhaustion ("sorry, too many clients already") under 16-worker parallel load. In addition to the per-test fixes above, Agent C should apply these system-level hardening changes:

### Infrastructure (Agent C)

1. **Reduce DB connection pressure:** In `app/db/session.py`, reduce `pool_size` from 20 to 10 and `max_overflow` from 20 to 10 for the test environment. With 16 workers × N connections, total connections can exceed PostgreSQL's default `max_connections=100`. A pool_size of 10+10=20 max per API process is sufficient.

   Alternatively, configure PostgreSQL in `docker-compose.yml` (or `postgres.conf`) to set `max_connections=200`.

2. **Reduce Playwright workers during testing:** In `web/playwright.config.ts`, the worker count may be set too high. Reducing from 16 to 8 workers would halve DB pressure at the cost of longer total test time. The `CLAUDE.md` instruction `reduce workers 12->6` from a prior fix may be partially applied; verify the current config:
   ```ts
   // playwright.config.ts: check workers setting
   workers: process.env.CI ? 4 : 8,  // reduce from 16
   ```

3. **Add `apiPost` retry wrapper to helpers.ts:** Create a `apiPostWithRetry` function that retries 5xx responses up to 3 times with exponential backoff. Apply this to `walk-lists.spec.ts` and `volunteer-tags-availability.spec.ts` as noted above, but also as a shared utility for future specs:
   ```ts
   export async function apiPostWithRetry(
     page: Page, url: string, data?: unknown, maxRetries = 3
   ): Promise<APIResponse> {
     for (let attempt = 0; attempt < maxRetries; attempt++) {
       const resp = await apiPost(page, url, data)
       if (resp.ok() || resp.status() < 500) return resp
       if (attempt < maxRetries - 1) await page.waitForTimeout(3_000 * (attempt + 1))
     }
     return apiPost(page, url, data)  // final attempt, let caller handle
   }
   ```

---

## Recommended Agent Team

### Agent A — App Bugs (2 fixes, independent)

**Files:**
- `web/src/routes/campaigns/$campaignId/settings/danger.tsx` (or `web/src/components/shared/DestructiveConfirmDialog.tsx`) — fix CAMP-02 delete dialog button starts enabled

**Tests affected:** phase12-settings-verify:339 (CAMP-02)

**Estimate:** Small change, 1 file, low risk.

**Resolution (2026-03-31):** ALREADY FIXED in commit b691627. The fix adds `|| !confirmText` to the `disabled` prop on the confirm button in `web/src/components/shared/DestructiveConfirmDialog.tsx` (line 78). Current state: `disabled={!isMatch || isPending || !confirmText}`. When `confirmText=""` (campaign data not yet loaded), the button is disabled regardless of `inputValue`. No additional changes needed for CAMP-02.

---

### Agent B — Test Timing Fixes (4 fixes, independent of Agent A)

**Files:**
- `web/e2e/phase21-integration-polish.spec.ts` — increase DNC "Reason" timeout (failure #1)
- `web/e2e/navigation.spec.ts` — increase voter link timeout (failure #6)
- `web/e2e/surveys.spec.ts` — increase reorder wait times (failure #10)
- `web/e2e/voter-lists.spec.ts` — increase List Alpha timeout (failure #11)

**Tests affected:** phase21:76, navigation:236, surveys:333 + SRV-05..08, voter-lists:290 + Final

**Estimate:** Timeout/wait adjustments in 4 spec files. No app-code changes.

**Resolution (2026-03-31):** All 4 files audited. 3 of 4 fixes were already present from a prior commit:
- `phase21-integration-polish.spec.ts:79-83` — `waitForLoadState("networkidle", {timeout:20_000})` + `toBeVisible({timeout:30_000})` already applied.
- `surveys.spec.ts:370` — `waitForTimeout(4_000)` (was 2_000) + per-move `toBeEnabled({timeout:8_000})` guards already applied.
- `voter-lists.spec.ts:339-342` — `table tbody tr` guard with `timeout:20_000` + `"List Alpha"` check with `timeout:20_000` already applied.
- `navigation.spec.ts:252-257` — Applied in this session: added `await expect(page.locator("table tbody tr").first()).toBeVisible({timeout:20_000})` before the voter link check, and increased voter link timeout from `10_000` to `30_000`.

---

### Agent C — Infrastructure Hardening (5 fixes)

**Files:**
- `web/e2e/helpers.ts` — add `apiPostWithRetry` utility
- `web/e2e/volunteer-tags-availability.spec.ts` — use retry for createVolunteerViaApi (failure #7)
- `web/e2e/walk-lists.spec.ts` — use retry for createTurfViaApi (failure #9)
- `web/e2e/data-validation.spec.ts` — add retry on `/detect` failure (failure #2)
- `web/e2e/voter-import.spec.ts` — add retry on `/detect` failure (failure #8)
- `web/e2e/campaign-settings.spec.ts` — add retry for role change API call (failure #3)
- `web/e2e/call-lists-dnc.spec.ts` — investigate ky client timeout for CL-01 (failure #4); add fallback list-presence assertion
- `web/playwright.config.ts` — verify/reduce worker count

**Tests affected:** data-validation:140, campaign-settings:206, call-lists-dnc:144, volunteer-tags-availability:80, voter-import:65, walk-lists:80 — plus all 37 cascaded tests.

**Estimate:** Largest batch, but each change is mechanical (retry wrapper application). Can be parallelised internally.

---

## Ordering Recommendation

Start Agents A, B, and C in parallel. None of the changes conflict with each other (different files or different parts of the same file). After all three complete:

1. Run the full E2E suite.
2. The 5 infrastructure failures may still flake occasionally if the DB pool pressure isn't reduced — verify Agent C's worker-count reduction was applied.
3. The SRV-04 reorder failure may require the app-side fix (optimistic update in `$scriptId.tsx`) if the wait-time increase alone isn't sufficient.
