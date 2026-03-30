import { test, expect } from "@playwright/test"

test.describe("UAT: Volunteer toggle — manager view (Phase 44 UX-02)", () => {
  test("manager sees Volunteer Type radio group with record and invite options", async ({
    page,
  }) => {
    // Navigate to org dashboard and find a campaign
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    const campaignLink = page
      .getByRole("link", { name: /macon-bibb demo/i })
      .first()
    await campaignLink.click()
    await page.waitForURL(/campaigns\/[a-f0-9-]+/, { timeout: 10_000 })

    // Extract campaign ID and navigate to volunteer register page
    const url = page.url()
    const campaignId = url.match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
    await page.goto(`/campaigns/${campaignId}/volunteers/register`)

    // Wait for page to load
    await expect(
      page
        .getByRole("heading", { name: /volunteer registration|create volunteer|register/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 })

    // The default admin user should have manager+ role
    // Verify "Volunteer Type" label is visible (only rendered for manager+)
    const volunteerTypeLabel = page.getByText("Volunteer Type")
    await expect(volunteerTypeLabel).toBeVisible({ timeout: 5_000 })

    // Verify both radio options exist
    const addRecordOption = page.getByLabel(/add volunteer record/i)
    await expect(addRecordOption).toBeVisible()

    const inviteOption = page.getByLabel(/invite to app/i)
    await expect(inviteOption).toBeVisible()

    // "Add volunteer record" should be selected by default
    await expect(addRecordOption).toBeChecked()

    // Click "Invite to app" — should show the Alert info banner
    await inviteOption.click()
    await expect(inviteOption).toBeChecked()

    // Verify Alert banner about email invitation appears
    const alertBanner = page.getByRole("alert").or(page.locator("[role='alert']")).first()
    await expect(alertBanner).toBeVisible({ timeout: 5_000 })
    await expect(alertBanner).toContainText(/email|invite/i)
  })
})
