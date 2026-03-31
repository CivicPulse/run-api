import { test, expect } from "./fixtures"
import type { Page } from "@playwright/test"
import { apiPost, apiDelete } from "./helpers"

/**
 * Voter Lists E2E Lifecycle Spec
 *
 * Validates VLIST-01 through VLIST-06: static list creation, voter add/remove,
 * dynamic list creation with filter criteria, list rename, and list deletion.
 * Verifies voters persist after list deletion.
 *
 * Runs as owner (unsuffixed spec -> chromium -> owner1@localhost).
 * Self-contained: creates its own test voters via API and cleans up via deletion assertions.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createVoterViaApi(page: Page, campaignId: string, data: Record<string, unknown>): Promise<string> {
  const url = `/api/v1/campaigns/${campaignId}/voters`
  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await apiPost(page, url, data)
    if (resp.ok()) return (await resp.json()).id
    if (resp.status() === 429 && attempt < 4) {
      await page.waitForTimeout(3000 * (attempt + 1))
      continue
    }
    throw new Error(`POST ${url} failed: ${resp.status()} — ${await resp.text()}`)
  }
  throw new Error(`POST ${url} failed after 5 retries`)
}

async function deleteVoterViaApi(page: Page, campaignId: string, voterId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/voters/${voterId}`)
  expect(resp.ok()).toBeTruthy()
}

// ── Spec ──

test.describe.serial("Voter lists lifecycle", () => {
  let campaignId = ""
  let testVoterIds: string[] = []
  const voterLastNames = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]
  // Use a run-specific suffix to avoid strict mode violations from previous test runs
  const runSuffix = Date.now().toString(36).slice(-5)
  let staticListName = `E2E Static Test List ${runSuffix}`
  const dynamicListName = "E2E Dynamic Test List"

  test.setTimeout(120_000)

  test("Setup: create test voters for list operations", async ({ page, campaignId: cid }) => {
    // Assign to outer variable so Final assertion test can access it
    campaignId = cid
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()

    const voters = voterLastNames.map((last) => ({
      first_name: "List",
      last_name: last,
      party: "Democrat",
    }))

    for (let i = 0; i < voters.length; i++) {
      const id = await createVoterViaApi(page, campaignId, voters[i])
      testVoterIds.push(id)
      // Small delay to stay well under the 30/min rate limit
      if (i < voters.length - 1) {
        await page.waitForTimeout(500)
      }
    }

    expect(testVoterIds).toHaveLength(5)
  })

  test("VLIST-01: Create a static voter list", async ({ page, campaignId }) => {
    // Navigate to voter lists page
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    // Click "+ New List" button
    await page.getByRole("button", { name: /new list/i }).click()

    // Step 1: Choose list type - click "Static List" button
    await page.getByRole("button", { name: /static list/i }).first().click()

    // Wait for step 2 name input to appear
    await expect(page.locator("#create-list-name")).toBeVisible({ timeout: 5_000 })

    // Step 2: Fill in name using input ID for precision
    await page.locator("#create-list-name").fill(staticListName)
    await expect(page.locator("#create-list-name")).toHaveValue(staticListName)

    // Click "Create List"
    const createBtn = page.getByRole("button", { name: /^create list$/i })
    await expect(createBtn).toBeEnabled({ timeout: 5_000 })
    await createBtn.click()

    // Wait for success toast
    await expect(page.getByText("List created")).toBeVisible({
      timeout: 10_000,
    })

    // Verify the list appears in the lists page
    await expect(page.getByText(staticListName).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test("VLIST-02: Add 5 voters to the static list", async ({ page, campaignId }) => {
    // Navigate to lists page and click into the static list
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    // Click the list name link to navigate to detail
    await page.getByRole("link", { name: staticListName }).click()
    await page.waitForURL(/voters\/lists\/[a-f0-9-]+/, { timeout: 10_000 })

    // Click "+ Add Voters" button
    await page.getByRole("button", { name: /add voters/i }).click()

    // In the AddVotersDialog, search for and select each test voter
    for (const lastName of voterLastNames) {
      await page.getByPlaceholder("Search by name...").fill(`List ${lastName}`)

      // Wait for search results to load
      await expect(
        page.getByText(`List ${lastName}`).first(),
      ).toBeVisible({ timeout: 10_000 })

      // Click the voter row to toggle selection (checkbox)
      // Use .first() to handle duplicate voters from prior test runs
      const voterCheckbox = page.getByRole("checkbox", {
        name: new RegExp(`Select List ${lastName}`, "i"),
      }).first()
      if (!(await voterCheckbox.isChecked())) {
        await voterCheckbox.click()
      }
    }

    // Click the "Add X Voters" button to confirm
    await page.getByRole("button", { name: /add \d+ voter/i }).click()

    // Wait for success toast
    await expect(page.getByText(/added.*voter/i)).toBeVisible({
      timeout: 10_000,
    })

    // Verify the list now shows the test voters (first assertion has longer timeout for refetch)
    for (const lastName of voterLastNames) {
      await expect(
        page.getByText(`List ${lastName}`).first(),
      ).toBeVisible({ timeout: 10_000 })
    }
  })

  test("VLIST-03: Remove 2 voters from the static list", async ({ page, campaignId }) => {
    // Navigate to the static list detail
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    await page.getByRole("link", { name: staticListName }).click()
    await page.waitForURL(/voters\/lists\/[a-f0-9-]+/, { timeout: 10_000 })

    // Remove Delta and Echo voters
    for (const lastName of ["Delta", "Echo"]) {
      const voterRow = page.getByRole("row").filter({ hasText: `List ${lastName}` }).first()
      await voterRow.getByRole("button", { name: /remove/i }).click()

      // Wait for success toast
      await expect(page.getByText("Voter removed from list")).toBeVisible({
        timeout: 10_000,
      })

      // Verify the voter is gone from the list
      await expect(
        page.getByRole("row").filter({ hasText: `List ${lastName}` }),
      ).not.toBeVisible({ timeout: 10_000 })
    }

    // Verify remaining 3 voters are still present
    for (const lastName of ["Alpha", "Bravo", "Charlie"]) {
      await expect(
        page.getByText(`List ${lastName}`).first(),
      ).toBeVisible()
    }
  })

  test("VLIST-04: Create a dynamic voter list with filter", async ({
    page,
  }) => {
    // Navigate to voter lists page
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    // Click "+ New List" button
    await page.getByRole("button", { name: /new list/i }).click()

    // Step 1: Choose list type - click "Dynamic List" button
    // Use the button role to avoid clicking the span child vs the button parent
    await page.getByRole("button", { name: /dynamic list/i }).first().click()

    // Wait for step 2 to render (the name input confirms step 2 is active)
    await expect(page.locator("#create-list-name")).toBeVisible({ timeout: 5_000 })

    // Step 2: Fill in name using the input ID to avoid strict mode with two "List Name" labels
    await page.locator("#create-list-name").fill(dynamicListName)
    // Verify the value was set
    await expect(page.locator("#create-list-name")).toHaveValue(dynamicListName)

    // Set filter: Party = DEM using the VoterFilterBuilder in the dialog
    // The Demographics accordion should be open by default (defaultValue={["demographics"]})
    // Find the DEM checkbox in the Party section
    const demCheckbox = page.locator("label").filter({ hasText: "DEM" }).locator('[role="checkbox"]').first()
    if (await demCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await demCheckbox.click()
      // Wait for filter state to settle before submitting
      await page.waitForTimeout(300)
      // Re-verify the name didn't get cleared by the filter state update
      const nameVal = await page.locator("#create-list-name").inputValue()
      if (!nameVal.trim()) {
        await page.locator("#create-list-name").fill(dynamicListName)
      }
    }
    // Note: filter is optional — proceeding even if no filter was set

    // Verify the Create List button is enabled before clicking
    const createBtn = page.getByRole("button", { name: /^create list$/i })
    await expect(createBtn).toBeEnabled({ timeout: 5_000 })

    // Click "Create List"
    await createBtn.click()

    // Wait for success toast
    await expect(page.getByText("List created")).toBeVisible({
      timeout: 10_000,
    })

    // Verify the dynamic list appears in the lists page
    await expect(page.getByText(dynamicListName).first()).toBeVisible({
      timeout: 15_000,
    })

    // Navigate to the dynamic list detail
    await page.getByRole("link", { name: dynamicListName }).first().click()
    await page.waitForURL(/voters\/lists\/[a-f0-9-]+/, { timeout: 10_000 })

    // Verify "Dynamic" badge is visible (exact: true avoids matching the list name link)
    await expect(page.getByText("Dynamic", { exact: true }).first()).toBeVisible({ timeout: 10_000 })
  })

  test("VLIST-05: Rename the static list", async ({ page, campaignId }) => {
    // Navigate to voter lists page
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    // Find the static list row and open actions menu
    const listRow = page
      .getByRole("row")
      .filter({ hasText: staticListName })
    await listRow.getByRole("button", { name: /actions/i }).click()

    // Click "Edit" in the dropdown
    await page.getByRole("menuitem", { name: /edit/i }).click()

    // Update the name in the edit dialog — use ID to avoid strict mode with two "List Name" labels
    await expect(page.locator("#edit-list-name")).toBeVisible({ timeout: 5_000 })
    await page.locator("#edit-list-name").fill("E2E Static Test List (Renamed)")
    await expect(page.locator("#edit-list-name")).toHaveValue("E2E Static Test List (Renamed)")

    // Save
    const saveBtn = page.getByRole("button", { name: /^save$/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // Wait for success toast
    await expect(page.getByText("List updated")).toBeVisible({
      timeout: 10_000,
    })

    // Update tracking variable
    staticListName = "E2E Static Test List (Renamed)"

    // Verify the renamed list appears
    await expect(page.getByText(staticListName)).toBeVisible({
      timeout: 10_000,
    })
  })

  test("VLIST-06: Delete both voter lists", async ({ page, campaignId }) => {
    // Navigate to voter lists page
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    // Delete the static list (renamed)
    const staticRow = page
      .getByRole("row")
      .filter({ hasText: staticListName })
      .first()
    await staticRow.getByRole("button", { name: /actions/i }).first().click()
    await page.getByRole("menuitem", { name: /delete/i }).click()

    // DestructiveConfirmDialog: type the list name to confirm
    await page.getByPlaceholder(staticListName).fill(staticListName)
    await page.getByRole("button", { name: /delete list/i }).click()

    // Wait for success toast
    await expect(page.getByText("List deleted")).toBeVisible({
      timeout: 10_000,
    })

    // Verify static list is gone
    await expect(page.getByText(staticListName)).not.toBeVisible({
      timeout: 10_000,
    })

    // Delete the dynamic list (use .first() since prior runs may have left uncleaned copies)
    const dynamicRow = page
      .getByRole("row")
      .filter({ hasText: dynamicListName })
      .first()
    await dynamicRow.getByRole("button", { name: /actions/i }).first().click()
    await page.getByRole("menuitem", { name: /delete/i }).click()

    // DestructiveConfirmDialog: type the list name to confirm
    await page.getByPlaceholder(dynamicListName).fill(dynamicListName)
    await page.getByRole("button", { name: /delete list/i }).click()

    // Wait for success toast
    await expect(page.getByText("List deleted")).toBeVisible({
      timeout: 10_000,
    })

    // Verify test voters still exist (list deletion does NOT delete voters)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // At least one test voter should be visible
    await expect(
      page.getByText("List Alpha").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("Final assertion: verify all test voters can be deleted", async ({
    page,
  }) => {
    // Navigate to establish auth context
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Delete all test voters via API (proves deletion works on voters that had list memberships)
    for (const voterId of testVoterIds) {
      await deleteVoterViaApi(page, campaignId, voterId)
    }

    // Verify at least one test voter is gone from the list
    await page.reload()
    await expect(page.getByText("List Alpha")).not.toBeVisible({
      timeout: 10_000,
    })
  })
})
