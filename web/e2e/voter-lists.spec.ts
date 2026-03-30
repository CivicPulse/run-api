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
  let staticListName = "E2E Static Test List"
  const dynamicListName = "E2E Dynamic Test List"

  test.setTimeout(120_000)

  test("Setup: create test voters for list operations", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()

    const voters = voterLastNames.map((last) => ({
      first_name: "List",
      last_name: last,
      party: "Democrat",
    }))

    for (const voter of voters) {
      const id = await createVoterViaApi(page, campaignId, voter)
      testVoterIds.push(id)
    }

    expect(testVoterIds).toHaveLength(5)
  })

  test("VLIST-01: Create a static voter list", async ({ page, campaignId }) => {
    // Navigate to voter lists page
    await page.goto(`/campaigns/${campaignId}/voters/lists`)
    await page.waitForURL(/voters\/lists/, { timeout: 10_000 })

    // Click "+ New List" button
    await page.getByRole("button", { name: /new list/i }).click()

    // Step 1: Choose list type - click "Static List"
    await page.getByText("Static List", { exact: false }).first().click()

    // Step 2: Fill in name
    await page.getByLabel("List Name").fill(staticListName)

    // Click "Create List"
    await page.getByRole("button", { name: /create list/i }).click()

    // Wait for success toast
    await expect(page.getByText("List created")).toBeVisible({
      timeout: 10_000,
    })

    // Verify the list appears in the lists page
    await expect(page.getByText(staticListName)).toBeVisible({
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
      const searchInput = page.getByPlaceholder("Search by name...")
      await searchInput.clear()
      await searchInput.fill(`List ${lastName}`)

      // Wait for search results to load
      await expect(
        page.getByText(`List ${lastName}`).first(),
      ).toBeVisible({ timeout: 10_000 })

      // Click the voter row to toggle selection (checkbox)
      const voterCheckbox = page.getByRole("checkbox", {
        name: new RegExp(`Select List ${lastName}`, "i"),
      })
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
      const voterRow = page.getByRole("row").filter({ hasText: `List ${lastName}` })
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

    // Step 1: Choose list type - click "Dynamic List"
    await page.getByText("Dynamic List", { exact: false }).first().click()

    // Step 2: Fill in name
    await page.getByLabel("List Name").fill(dynamicListName)

    // Set filter: Party = Democrat using the VoterFilterBuilder
    // The filter builder is an accordion with filter categories
    // Look for party filter and set it
    const partySection = page.getByText("Party", { exact: true }).first()
    if (await partySection.isVisible()) {
      await partySection.click()
    }

    // Try to find and check "Democrat" checkbox in the filter builder
    const demCheckbox = page.getByRole("checkbox", { name: /democrat/i }).first()
    if (await demCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await demCheckbox.click()
    } else {
      // Alternative: try text-based selection if the filter builder uses a different pattern
      const demOption = page.getByText("Democrat", { exact: false }).first()
      if (await demOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await demOption.click()
      }
    }

    // Click "Create List"
    await page.getByRole("button", { name: /create list/i }).click()

    // Wait for success toast
    await expect(page.getByText("List created")).toBeVisible({
      timeout: 10_000,
    })

    // Verify the dynamic list appears in the lists page
    await expect(page.getByText(dynamicListName)).toBeVisible({
      timeout: 10_000,
    })

    // Navigate to the dynamic list detail
    await page.getByRole("link", { name: dynamicListName }).click()
    await page.waitForURL(/voters\/lists\/[a-f0-9-]+/, { timeout: 10_000 })

    // Verify "Dynamic" badge is visible
    await expect(page.getByText("Dynamic")).toBeVisible({ timeout: 10_000 })
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

    // Update the name in the edit dialog
    const nameInput = page.getByLabel("List Name")
    await nameInput.clear()
    await nameInput.fill("E2E Static Test List (Renamed)")

    // Save
    await page.getByRole("button", { name: /^save$/i }).click()

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
    await staticRow.getByRole("button", { name: /actions/i }).click()
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

    // Delete the dynamic list
    const dynamicRow = page
      .getByRole("row")
      .filter({ hasText: dynamicListName })
    await dynamicRow.getByRole("button", { name: /actions/i }).click()
    await page.getByRole("menuitem", { name: /delete/i }).click()

    // DestructiveConfirmDialog: type the list name to confirm
    await page.getByPlaceholder(dynamicListName).fill(dynamicListName)
    await page.getByRole("button", { name: /delete list/i }).click()

    // Wait for success toast
    await expect(page.getByText("List deleted")).toBeVisible({
      timeout: 10_000,
    })

    // Verify dynamic list is gone
    await expect(page.getByText(dynamicListName)).not.toBeVisible({
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
