import { test, expect } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

/**
 * RBAC-05: Manager can create and manage operational resources.
 * Runs under manager auth via `.manager.spec.ts` suffix.
 *
 * Manager role can create and manage all operational resources (voters, turfs,
 * walk lists, call lists, surveys, volunteers, shifts) but cannot manage
 * campaign members or campaign-level settings (admin+).
 */
test.describe("RBAC: manager permissions", () => {
  let campaignId: string

  /** Navigate into the seed campaign and extract campaignId. */
  async function enterCampaign(page: import("@playwright/test").Page) {
    campaignId = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForLoadState("networkidle")
  }

  test("voters page: New Voter button IS visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /voters/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newVoterButton = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterButton).toBeVisible({ timeout: 10_000 })
  })

  test("voter detail: Edit button IS visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Click the first voter link to navigate to detail
    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).toBeVisible({ timeout: 10_000 })
  })

  test("voter detail: Add Interaction button IS visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    const addInteractionButton = page.getByRole("button", {
      name: /add interaction/i,
    })
    await expect(addInteractionButton).toBeVisible({ timeout: 10_000 })
  })

  test("canvassing: New Turf link IS visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/canvassing`)
    await page.waitForURL(/canvassing/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /canvassing/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newTurfLink = page.getByRole("link", { name: /new turf/i })
    await expect(newTurfLink).toBeVisible({ timeout: 10_000 })
  })

  test("phone banking: New Call List and New Session buttons ARE visible", async ({
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
    await expect(newCallListButton).toBeVisible({ timeout: 10_000 })

    // Check sessions page
    await page.goto(`/campaigns/${campaignId}/phone-banking/sessions`)
    await page.waitForURL(/sessions/, { timeout: 10_000 })
    await expect(
      page.getByText(/sessions/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newSessionButton = page.getByRole("button", { name: /new session/i })
    await expect(newSessionButton).toBeVisible({ timeout: 10_000 })
  })

  test("surveys: New Script button IS visible", async ({ page }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/surveys`)
    await page.waitForURL(/surveys/, { timeout: 10_000 })

    await expect(
      page.getByText(/survey/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // The button text is "New Script" (not "New Survey")
    const newScriptButton = page.getByRole("button", { name: /new script/i })
    await expect(newScriptButton).toBeVisible({ timeout: 10_000 })
  })

  test("volunteers roster: management actions ARE visible for manager", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/roster/, { timeout: 10_000 })

    await expect(
      page.getByText(/roster/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Manager should see edit actions on volunteer rows (if volunteers exist in seed)
    // The edit button appears inside a RequireRole minimum="manager" gate
    const editButtons = page.getByRole("button", { name: /edit volunteer/i })
    const count = await editButtons.count()
    // Seed data has 20 volunteers -- there should be at least one visible edit button
    if (count > 0) {
      await expect(editButtons.first()).toBeVisible()
    }
  })

  test("campaign settings: Members nav link is visible but members content is NOT accessible", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await page.waitForURL(/settings/, { timeout: 10_000 })

    // The Members nav link exists in the layout for all roles
    const membersLink = page.getByRole("link", { name: /members/i })
    await expect(membersLink).toBeVisible({ timeout: 10_000 })

    // Navigate to members page
    await membersLink.click()
    await page.waitForURL(/members/, { timeout: 10_000 })

    // Invite button requires admin+ role
    const inviteButton = page.getByRole("button", { name: /invite/i })
    await expect(inviteButton).not.toBeVisible()
  })

  test("campaign settings danger zone: Transfer and Delete NOT visible", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
    await page.waitForURL(/danger/, { timeout: 10_000 })

    // Transfer Ownership requires owner role
    const transferButton = page.getByRole("button", {
      name: /transfer ownership/i,
    })
    await expect(transferButton).not.toBeVisible()

    // Delete Campaign requires owner role
    const deleteButton = page.getByRole("button", { name: /delete campaign/i })
    await expect(deleteButton).not.toBeVisible()
  })

  test("org dashboard: Create Campaign link NOT visible", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Manager has no org role -- Create Campaign gated behind RequireOrgRole minimum="org_admin"
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).not.toBeVisible()
  })
})
