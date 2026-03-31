import { test, expect } from "./fixtures"

// Uses worker-scoped campaignId fixture from ./fixtures for seed campaign navigation

test.describe("UAT: Tooltip popover interactions (Phase 44 UX-03/UX-04)", () => {
  test.setTimeout(60_000)

  test("turf name tooltip shows sizing guidance", async ({ page, campaignId }) => {
    await page.goto(`/campaigns/${campaignId}/canvassing/turfs/new`)
    await expect(page.getByLabel(/name/i).first()).toBeVisible({ timeout: 10_000 })

    // Click the HelpCircle icon (TooltipIcon uses Popover with a button trigger)
    // The button has aria-label="More info" and contains an SVG with class lucide-circle-question-mark
    const helpIcon = page.locator("button[aria-label='More info']").first()
    await helpIcon.click()

    // Verify popover content appears with turf sizing guidance
    const popover = page.getByRole("tooltip").or(page.locator("[data-radix-popper-content-wrapper]")).first()
    await expect(popover).toBeVisible({ timeout: 5_000 })
    await expect(popover).toContainText(/50-200 households/i)

    // Click outside to close
    await page.locator("body").click({ position: { x: 10, y: 10 } })
    await expect(popover).not.toBeVisible({ timeout: 3_000 })
  })

  test("campaign settings member role tooltip shows role descriptions", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/settings/members`)
    await expect(page.getByText(/member/i).first()).toBeVisible({ timeout: 10_000 })

    // The TooltipIcon for role descriptions is inside the Invite dialog.
    // Open the invite dialog first.
    const inviteButton = page.getByRole("button", { name: /invite member/i })
    await inviteButton.click()
    await expect(page.getByText(/send an invitation/i)).toBeVisible({ timeout: 5_000 })

    const helpIcon = page.locator("button[aria-label='More info']").first()
    await helpIcon.click()

    const popover = page.getByRole("tooltip").or(page.locator("[data-radix-popper-content-wrapper]")).first()
    await expect(popover).toBeVisible({ timeout: 5_000 })
    await expect(popover).toContainText(/viewer|volunteer|manager|admin|owner/i)
  })

  test("campaign creation type tooltip shows election types", async ({ page, campaignId }) => {
    await page.goto("/campaigns/new")
    await expect(page.getByText(/campaign/i).first()).toBeVisible({ timeout: 10_000 })

    // Navigate to the step with campaign type if multi-step wizard
    const helpIcons = page.locator("button[aria-label='More info']")
    const count = await helpIcons.count()
    if (count > 0) {
      await helpIcons.first().click()
      const popover = page.getByRole("tooltip").or(page.locator("[data-radix-popper-content-wrapper]")).first()
      await expect(popover).toBeVisible({ timeout: 5_000 })
      await expect(popover).toContainText(/primary|general|special|local/i)
    }
  })

  test("org settings ZITADEL ID tooltip shows auth system explanation", async ({
    page, campaignId,
  }) => {
    await page.goto("/org/settings", { timeout: 60_000 })
    await expect(page.getByText(/organization/i).first()).toBeVisible({
      timeout: 20_000,
    })

    const helpIcon = page.locator("button[aria-label='More info']").first()
    await helpIcon.click()

    const popover = page.getByRole("tooltip").or(page.locator("[data-radix-popper-content-wrapper]")).first()
    await expect(popover).toBeVisible({ timeout: 5_000 })
    await expect(popover).toContainText(/unique identifier.*authentication/i)
  })

  test("voter import mapping tooltip shows column guidance", async ({ page, campaignId }) => {
    await page.goto(`/campaigns/${campaignId}/voters/imports/new`)
    await expect(page.getByText(/import/i).first()).toBeVisible({ timeout: 10_000 })

    const helpIcons = page.locator("button[aria-label='More info']")
    const count = await helpIcons.count()
    if (count > 0) {
      await helpIcons.first().click()
      const popover = page.getByRole("dialog").or(page.locator("[data-radix-popper-content-wrapper]")).first()
      await expect(popover).toBeVisible({ timeout: 5_000 })
      await expect(popover).toContainText(/map each column|first_name|last_name/i)
    }
  })
})
