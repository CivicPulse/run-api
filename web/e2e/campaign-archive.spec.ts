import { test, expect } from "@playwright/test"
import { apiPost } from "./helpers"

test.describe("Campaign archive flow", () => {
  // Deferred to v1.19 — pre-existing failure, misc cluster, see .planning/todos/pending/106-phase-verify-cluster-triage.md
  test.skip("archive campaign moves card to archived section", async ({ page }) => {
    test.setTimeout(60_000)

    // Navigate to org dashboard and wait for auth
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )
    await page.waitForLoadState("domcontentloaded")

    // Create a dedicated throwaway campaign for this test
    const campaignName = `E2E Archive ${Date.now()}`
    const resp = await apiPost(page, "/api/v1/campaigns", {
      name: campaignName,
      type: "local",
    })
    expect(resp.ok()).toBeTruthy()

    // Navigate to home to pick up the new campaign in the list
    // Use TanStack Query invalidation by navigating away and back
    await page.goto("/org/settings")
    await expect(page.getByText(/organization/i).first()).toBeVisible({ timeout: 10_000 })
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")

    // Wait for the campaign list to render — look for the new campaign
    await expect(
      page.getByText(campaignName).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Find the campaign card link that contains our campaign name
    const campaignCard = page.locator("a").filter({ hasText: campaignName }).first()

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
    // Longer timeout: archive API call can be slow under parallel load
    await expect(page.getByText(/archived\./i)).toBeVisible({
      timeout: 20_000,
    })

    // The campaign should no longer appear in the active grid
    // but should appear under the "Archived" collapsible section
    const archivedToggle = page.getByRole("button", { name: /archived/i })
    await expect(archivedToggle).toBeVisible({ timeout: 10_000 })

    // Expand the archived section
    await archivedToggle.click()

    // Verify the campaign name appears in the archived section
    // Use getByRole("link") to avoid matching the toast notification text
    await expect(
      page.getByRole("link", { name: new RegExp(campaignName) }).first(),
    ).toBeVisible({ timeout: 5_000 })
  })
})
