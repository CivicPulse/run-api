import { test, expect } from "@playwright/test"

test.describe("Role-gated UI: volunteer user", () => {
  test("volunteer type toggle is not visible for non-manager on register page", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Navigate into the seed campaign
    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()
    await page.waitForURL(/campaigns\/[a-f0-9-]+/, { timeout: 10_000 })

    // Extract campaign ID and navigate to volunteer register page
    const url = page.url()
    const campaignId = url.match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
    await page.goto(`/campaigns/${campaignId}/volunteers/register`)

    // Wait for the register page to load
    await expect(
      page
        .getByRole("heading", { name: /volunteer registration|create volunteer/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 })

    // The "Volunteer Type" label and RadioGroup should NOT be visible
    // (gated behind RequireRole minimum="manager")
    const volunteerTypeLabel = page.getByText("Volunteer Type")
    await expect(volunteerTypeLabel).not.toBeVisible()

    // RadioGroup items should also not be present
    const radioRecord = page.getByLabel(/add volunteer record/i)
    await expect(radioRecord).not.toBeVisible()
  })

  test("Create Campaign button is hidden for user without org role", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // The Create Campaign button is gated behind RequireOrgRole minimum="org_admin"
    // A volunteer user has no org membership, so the button should be hidden
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).not.toBeVisible()
  })
})
