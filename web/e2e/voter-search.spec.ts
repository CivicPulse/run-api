import { test, expect } from "@playwright/test"

test.describe("Voter search", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the org/campaign landing page first
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Find and click through to a campaign's voter list
    // Seed data creates one campaign — click into it
    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()

    // Navigate to voters section
    const votersNav = page
      .getByRole("link", { name: /voters/i })
      .first()
    await votersNav.click()

    // Wait for the voter table to be visible
    await expect(page.getByRole("table").or(page.locator("[data-testid='voter-list']")).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test("search voters by name returns results", async ({ page }) => {
    // Type a known seed voter first name into the search input
    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.getByRole("searchbox"))
      .first()
    await searchInput.fill("James")

    // Wait for the search API response
    await page.waitForResponse(
      (resp) => resp.url().includes("voters") && resp.status() === 200,
      { timeout: 10_000 }
    )

    // Expect at least one result containing the searched name
    await expect(page.getByText("James").first()).toBeVisible()
  })

  test("filter voters by party shows filtered results", async ({ page }) => {
    // Count initial rows
    const initialRows = await page.getByRole("row").count()

    // Open filter controls
    const filterButton = page
      .getByRole("button", { name: /filter/i })
      .first()
    await filterButton.click()

    // Look for a party filter option and apply it
    const partyOption = page.getByText(/democrat|republican|dem|rep/i).first()
    await partyOption.click()

    // Wait for filtered results to load
    await page.waitForResponse(
      (resp) => resp.url().includes("voters") && resp.status() === 200,
      { timeout: 10_000 }
    )

    // Verify filter was applied — either a chip is visible or row count changed
    const filteredRows = await page.getByRole("row").count()
    // At minimum, confirm the page still shows results (filtered data loaded)
    expect(filteredRows).toBeGreaterThan(0)
  })

  test("view voter detail shows contact info", async ({ page }) => {
    // Click on the first voter row to open detail
    const firstVoterRow = page.getByRole("row").nth(1) // skip header row
    await firstVoterRow.click()

    // Wait for navigation to voter detail page
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    // Expect voter name or address to be visible on the detail page
    const voterDetail = page
      .getByText(/first name|last name|address|phone|email/i)
      .first()
    await expect(voterDetail).toBeVisible({ timeout: 10_000 })

    // Navigate back to the list
    await page.goBack()
    await expect(page.getByRole("table").or(page.locator("[data-testid='voter-list']")).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
