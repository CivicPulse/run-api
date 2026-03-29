import { test, expect } from "@playwright/test"

test.describe("Campaign archive flow", () => {
  test("archive campaign moves card to archived section", async ({ page }) => {
    // Navigate to org dashboard
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Identify the first active campaign card's name for later assertion
    const campaignCard = page.locator("[class*='grid'] .block").first()
    await expect(campaignCard).toBeVisible({ timeout: 10_000 })

    // Get campaign name from the card title
    const campaignName = await campaignCard
      .getByRole("heading")
      .first()
      .textContent()
    expect(campaignName).toBeTruthy()

    // Open the three-dot menu on the campaign card
    const actionsButton = campaignCard.getByRole("button", {
      name: /campaign actions/i,
    })
    await actionsButton.click()

    // Click "Archive Campaign" in the dropdown
    await page.getByRole("menuitem", { name: /archive campaign/i }).click()

    // Confirm in the archive dialog — the destructive button text is
    // "Archive Campaign" (or "Archiving..." while pending)
    const confirmButton = page.getByRole("button", {
      name: /^archive campaign$/i,
    })
    await expect(confirmButton).toBeVisible({ timeout: 5_000 })
    await confirmButton.click()

    // Verify toast notification appears confirming the archive
    await expect(page.getByText(/archived\./i)).toBeVisible({
      timeout: 10_000,
    })

    // The campaign should no longer appear in the active grid
    // but should appear under the "Archived" collapsible section
    const archivedToggle = page.getByRole("button", { name: /archived/i })
    await expect(archivedToggle).toBeVisible({ timeout: 10_000 })

    // Expand the archived section
    await archivedToggle.click()

    // Verify the campaign name appears in the archived section
    await expect(page.getByText(campaignName!.trim())).toBeVisible({
      timeout: 5_000,
    })
  })
})
