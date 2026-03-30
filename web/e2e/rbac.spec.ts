import { test, expect } from "./fixtures"

/**
 * RBAC-07: Owner has full access including destructive actions.
 * RBAC-09: Org owner has owner-equivalent access across all campaigns.
 * Runs under owner/default auth via unsuffixed `.spec.ts`.
 *
 * Owner has all admin capabilities plus danger zone actions (transfer
 * ownership, delete campaign). owner1@localhost has org_owner role
 * for RBAC-09 tests.
 *
 * NOTE: Tests assert visibility only -- they do NOT click Transfer
 * Ownership or Delete Campaign to avoid destroying test state.
 */
test.describe("RBAC: owner permissions", () => {
  /** Navigate into the seed campaign and extract campaignId. */
  async function enterCampaign(page: import("@playwright/test").Page, cid: string) {
    await page.goto(`/campaigns/${cid}/dashboard`)
    await page.waitForLoadState("domcontentloaded")
  }

  // --- RBAC-07: Owner has all admin capabilities plus destructive actions ---

  test("voters page: New Voter button IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /voters/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newVoterButton = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterButton).toBeVisible({ timeout: 10_000 })
  })

  test("voter detail: Edit button IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).toBeVisible({ timeout: 10_000 })
  })

  test("canvassing: New Turf link IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/canvassing`)
    await page.waitForURL(/canvassing/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /canvassing/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const newTurfLink = page.getByRole("link", { name: /new turf/i })
    await expect(newTurfLink).toBeVisible({ timeout: 10_000 })
  })

  test("campaign settings > members: page loads and invite button IS visible", async ({
    page,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/settings/members`)
    await page.waitForURL(/members/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /members/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const inviteButton = page.getByRole("button", { name: /invite member/i })
    await expect(inviteButton).toBeVisible({ timeout: 10_000 })
  })

  test("campaign settings > danger zone: Transfer Ownership button IS visible", async ({
    page,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
    await page.waitForURL(/danger/, { timeout: 10_000 })

    await expect(
      page.getByRole("heading", { name: /danger zone/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Owner should see Transfer Ownership button (do NOT click it)
    const transferButton = page.getByRole("button", {
      name: /transfer ownership/i,
    })
    await expect(transferButton).toBeVisible({ timeout: 10_000 })
  })

  test("campaign settings > danger zone: Delete Campaign button IS visible", async ({
    page,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
    await page.waitForURL(/danger/, { timeout: 10_000 })

    // Owner should see Delete Campaign button (do NOT click it)
    const deleteButton = page.getByRole("button", { name: /delete campaign/i })
    await expect(deleteButton).toBeVisible({ timeout: 10_000 })
  })

  // --- RBAC-09: Org owner cross-campaign access ---

  test("org dashboard: Create Campaign link IS visible (org_owner)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // owner1@localhost has org_owner role
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
  })

  test("org settings: name input is NOT readonly (org_owner can edit)", async ({
    page,
  }) => {
    await page.goto("/org/settings")
    await page.waitForURL(/\/org\/settings/, { timeout: 10_000 })

    const orgNameInput = page.getByLabel(/organization name/i)
    await expect(orgNameInput).toBeVisible({ timeout: 10_000 })

    // For org_owner, the input should NOT be readonly (editable)
    await expect(orgNameInput).not.toHaveAttribute("readonly")

    // The input should NOT have the bg-muted class (only applied to non-owners)
    await expect(orgNameInput).not.toHaveClass(/bg-muted/)
  })

  test("org settings: Save Changes button IS visible (org_owner)", async ({
    page,
  }) => {
    await page.goto("/org/settings")
    await page.waitForURL(/\/org\/settings/, { timeout: 10_000 })

    const saveButton = page.getByRole("button", { name: /save changes/i })
    await expect(saveButton).toBeVisible({ timeout: 10_000 })
  })

  test("org sidebar: Members and Settings links ARE visible (org_owner)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    const membersLink = page.getByRole("link", { name: /^members$/i })
    await expect(membersLink).toBeVisible({ timeout: 10_000 })

    const settingsLink = page.getByRole("link", { name: /^settings$/i })
    await expect(settingsLink).toBeVisible({ timeout: 10_000 })
  })
})
