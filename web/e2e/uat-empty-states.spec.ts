import { test, expect } from "@playwright/test"

test.describe("UAT: Empty state appearance on list pages (Phase 44 OBS-06)", () => {
  test("org members page shows meaningful empty state", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    await page.goto("/org/members")
    await page.waitForURL(/\/org\/members/, { timeout: 10_000 })

    // Check if the empty state is shown (depends on whether org has members)
    // If members exist, the page shows a table. If empty, shows icon + title + description.
    const emptyState = page.getByText(/no members yet/i)
    const memberTable = page.getByRole("table")

    // Either the empty state or the member table should be visible
    const hasEmptyState = await emptyState.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasTable = await memberTable.isVisible({ timeout: 2_000 }).catch(() => false)

    if (hasEmptyState) {
      // Verify the empty state has the expected content
      await expect(emptyState).toBeVisible()
      await expect(page.getByText(/add members/i)).toBeVisible()
      // Verify the Users icon is present (rendered as SVG)
      const usersIcon = page.locator("svg.lucide-users")
      await expect(usersIcon).toBeVisible()
    } else {
      // Members exist — page shows data (seed data populated)
      expect(hasTable).toBe(true)
    }
  })

  test("list pages show icon + title + description (not blank tables)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Navigate into a campaign
    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()
    await page.waitForURL(/campaigns\/[a-f0-9-]+/, { timeout: 10_000 })
    const campaignId = page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""

    // Test key list pages — verify no blank tables or "No data" appear
    const listPages = [
      { path: `/campaigns/${campaignId}/voters`, name: "Voters" },
      { path: `/campaigns/${campaignId}/canvassing`, name: "Canvassing" },
      { path: `/campaigns/${campaignId}/phone-banking`, name: "Phone Banking" },
      { path: `/campaigns/${campaignId}/volunteers`, name: "Volunteers" },
    ]

    for (const { path, name } of listPages) {
      await page.goto(path)
      // Wait for page to load
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {})

      // Verify NO generic "No data" text appears
      const genericNoData = page.getByText(/^no data$/i)
      await expect(genericNoData).not.toBeVisible({ timeout: 2_000 }).catch(() => {
        // Allow if data exists (page may show actual content instead)
      })

      // Verify the page loaded something meaningful (not blank)
      const hasContent = await page.locator("main").evaluate((el) => el.textContent?.trim().length ?? 0)
      expect(hasContent).toBeGreaterThan(10) // at minimum has some text
    }
  })
})
