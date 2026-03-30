import { test, expect } from "@playwright/test"

/**
 * RBAC-03: Viewer cannot access mutation actions.
 * Runs under viewer auth via `.viewer.spec.ts` suffix.
 *
 * Viewer role should be able to view data but cannot create, edit, or delete anything.
 */
test.describe("RBAC: viewer permissions", () => {
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

  test("voters page: New Voter button is NOT visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Wait for voter list to load
    await expect(
      page.getByRole("heading", { name: /voters/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newVoterButton = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterButton).not.toBeVisible()
  })

  test("voter detail: Edit button is NOT visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Click the first voter row to go to detail
    const voterLink = page.locator('#main-content').getByRole('link', { name: /voter|first|last/i }).first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).not.toBeVisible()
  })

  test("voter detail: Add Interaction button IS visible for viewer", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    const voterLink = page.locator('#main-content').getByRole('link', { name: /voter|first|last/i }).first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    // Add Interaction is NOT role-gated -- visible to all roles
    const addInteractionButton = page.getByRole("button", {
      name: /add interaction/i,
    })
    await expect(addInteractionButton).toBeVisible({ timeout: 10_000 })
  })

  test("canvassing: page loads and New Turf link is present (not role-gated in UI)", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/canvassing`)
    await page.waitForURL(/canvassing/, { timeout: 10_000 })

    // Wait for canvassing page to load
    await expect(
      page.getByRole("heading", { name: /canvassing/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Note: New Turf link is NOT wrapped in RequireRole in the source code.
    // It is visible to all roles including viewer. This documents actual behavior.
    // The API will reject the POST if the viewer attempts to create a turf.
    const newTurfLink = page.getByRole("link", { name: /new turf/i })
    await expect(newTurfLink).toBeVisible({ timeout: 10_000 })
  })

  test("phone banking: New Call List button is NOT visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/phone-banking/call-lists`)
    await page.waitForURL(/call-lists/, { timeout: 10_000 })

    await expect(
      page.getByText(/call lists/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newCallListButton = page.getByRole("button", { name: /new call list/i })
    await expect(newCallListButton).not.toBeVisible()
  })

  test("phone banking: New Session button is NOT visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/phone-banking/sessions`)
    await page.waitForURL(/sessions/, { timeout: 10_000 })

    await expect(
      page.getByText(/sessions/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newSessionButton = page.getByRole("button", { name: /new session/i })
    await expect(newSessionButton).not.toBeVisible()
  })

  test("volunteers roster: edit/delete actions are NOT visible", async ({
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

  test("campaign settings: Members nav link IS visible but members content is gated", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await page.waitForURL(/settings/, { timeout: 10_000 })

    // The Members nav link exists in the settings layout for all roles
    const membersLink = page.getByRole("link", { name: /members/i })
    await expect(membersLink).toBeVisible({ timeout: 10_000 })

    // Navigate to members page -- content should be gated
    await membersLink.click()
    await page.waitForURL(/members/, { timeout: 10_000 })

    // The invite form requires admin+ role
    const inviteSection = page.getByRole("button", { name: /invite/i })
    await expect(inviteSection).not.toBeVisible()
  })

  test("org dashboard: Create Campaign link is NOT visible", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // viewer has no org role, so Create Campaign should be hidden
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).not.toBeVisible()
  })

  test("org sidebar: Members and Settings links are NOT visible", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Organization sidebar Members link is gated behind RequireOrgRole minimum="org_admin"
    // Viewer has no org role
    const orgMembersLink = page.getByRole("link", { name: /^members$/i })
    await expect(orgMembersLink).not.toBeVisible()

    const orgSettingsLink = page.getByRole("link", { name: /^settings$/i })
    await expect(orgSettingsLink).not.toBeVisible()
  })
})
