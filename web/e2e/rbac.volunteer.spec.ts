import { test, expect } from "@playwright/test"

/**
 * RBAC-04: Volunteer can record interactions but cannot manage resources.
 * Runs under volunteer auth via `.volunteer.spec.ts` suffix.
 *
 * Volunteer role can view data and record interactions/outcomes but cannot
 * create/edit/delete turfs, walk lists, call lists, surveys, or campaign settings.
 *
 * NOTE: Does NOT duplicate existing role-gated.volunteer.spec.ts tests.
 * Focuses on the comprehensive RBAC-04 checklist that the existing file
 * does not fully cover.
 */
test.describe("RBAC: volunteer permissions", () => {
  let campaignId: string

  /** Navigate into the seed campaign and extract campaignId. */
  async function enterCampaign(page: import("@playwright/test").Page) {
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

    campaignId = page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
    expect(campaignId).toBeTruthy()
  }

  test("voter detail: Add Interaction IS visible, Edit button is NOT visible", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Navigate to first voter detail
    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    // Add Interaction is not role-gated -- should be visible
    const addInteractionButton = page.getByRole("button", {
      name: /add interaction/i,
    })
    await expect(addInteractionButton).toBeVisible({ timeout: 10_000 })

    // Edit voter requires manager+ -- should NOT be visible
    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).not.toBeVisible()
  })

  test("voters page: New Voter button is NOT visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /voters/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newVoterButton = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterButton).not.toBeVisible()
  })

  test("phone banking: New Call List and New Session buttons NOT visible", async ({
    page,
  }) => {
    await enterCampaign(page)

    // Check call lists page
    await page.goto(`/campaigns/${campaignId}/phone-banking/call-lists`)
    await page.waitForURL(/call-lists/, { timeout: 10_000 })
    await expect(
      page.getByText(/call lists/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newCallListButton = page.getByRole("button", { name: /new call list/i })
    await expect(newCallListButton).not.toBeVisible()

    // Check sessions page
    await page.goto(`/campaigns/${campaignId}/phone-banking/sessions`)
    await page.waitForURL(/sessions/, { timeout: 10_000 })
    await expect(
      page.getByText(/sessions/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newSessionButton = page.getByRole("button", { name: /new session/i })
    await expect(newSessionButton).not.toBeVisible()
  })

  test("campaign settings: members page invite gated, danger zone gated", async ({
    page,
  }) => {
    await enterCampaign(page)

    // Navigate to members page
    await page.goto(`/campaigns/${campaignId}/settings/members`)
    await page.waitForURL(/members/, { timeout: 10_000 })

    // Invite button requires admin+ role
    const inviteButton = page.getByRole("button", { name: /invite/i })
    await expect(inviteButton).not.toBeVisible()

    // Navigate to danger zone
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
    await page.waitForURL(/danger/, { timeout: 10_000 })

    // Transfer and delete require owner role -- volunteer should see the fallback message
    const transferButton = page.getByRole("button", {
      name: /transfer ownership/i,
    })
    await expect(transferButton).not.toBeVisible()

    const deleteButton = page.getByRole("button", { name: /delete campaign/i })
    await expect(deleteButton).not.toBeVisible()
  })

  test("volunteers roster: edit actions NOT visible for volunteer", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/roster/, { timeout: 10_000 })

    await expect(
      page.getByText(/roster/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Manager-gated row actions should not be visible
    const editVolunteerButton = page.getByRole("button", {
      name: /edit volunteer/i,
    })
    await expect(editVolunteerButton).not.toBeVisible()
  })

  test("org dashboard: Create Campaign link NOT visible", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Volunteer has no org role -- Create Campaign gated behind RequireOrgRole minimum="org_admin"
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).not.toBeVisible()
  })
})
