import { test, expect } from "@playwright/test"

/**
 * RBAC-06: Admin can manage members and settings.
 * RBAC-08: Org admin has admin-equivalent access across all campaigns.
 * Runs under admin auth via `.admin.spec.ts` suffix.
 *
 * This is a NEW supplemental file. The existing `role-gated.admin.spec.ts`
 * is kept as-is per D-11 and continues to run alongside this file.
 *
 * Admin has all manager capabilities plus member management and campaign
 * settings access. Danger zone (transfer/delete) requires owner.
 * admin1@localhost has org_admin role for RBAC-08 tests.
 */
test.describe("RBAC: admin permissions", () => {
  let campaignId: string

  /** Navigate into the seed campaign and extract campaignId. */
  async function enterCampaign(page: import("@playwright/test").Page) {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()
    await page.waitForURL(/campaigns\/[a-f0-9-]+/, { timeout: 10_000 })

    campaignId = page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
    expect(campaignId).toBeTruthy()
  }

  // --- RBAC-06: Admin has all manager capabilities plus settings ---

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

    const voterLink = page.getByRole("link", { name: /voter|first|last/i }).first()
    await expect(voterLink).toBeVisible({ timeout: 10_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).toBeVisible({ timeout: 10_000 })
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

  test("campaign settings > members: page loads and invite button IS visible", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/settings/members`)
    await page.waitForURL(/members/, { timeout: 10_000 })

    // Wait for Members heading to appear
    await expect(
      page.getByRole("heading", { name: /members/i }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Invite member button is gated at RequireRole minimum="admin"
    const inviteButton = page.getByRole("button", { name: /invite member/i })
    await expect(inviteButton).toBeVisible({ timeout: 10_000 })
  })

  test("campaign settings > general: form fields are editable", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await page.waitForURL(/general/, { timeout: 10_000 })

    // Campaign Name input should be present and editable (no readonly attribute)
    const nameInput = page.getByLabel(/campaign name/i)
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
    await expect(nameInput).not.toHaveAttribute("readonly")

    // Save changes button should be visible
    const saveButton = page.getByRole("button", { name: /save changes/i })
    await expect(saveButton).toBeVisible({ timeout: 10_000 })
  })

  test("campaign settings > danger zone: Transfer Ownership and Delete Campaign NOT visible (owner-only)", async ({
    page,
  }) => {
    await enterCampaign(page)
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
    await page.waitForURL(/danger/, { timeout: 10_000 })

    // Danger zone heading is visible (page loads)
    await expect(
      page.getByRole("heading", { name: /danger zone/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Transfer Ownership button requires owner role -- admin should see fallback
    const transferButton = page.getByRole("button", {
      name: /transfer ownership/i,
    })
    await expect(transferButton).not.toBeVisible()

    // Delete Campaign button requires owner role
    const deleteButton = page.getByRole("button", { name: /delete campaign/i })
    await expect(deleteButton).not.toBeVisible()

    // Fallback message should be visible for non-owner
    await expect(
      page.getByText(/only the campaign owner/i),
    ).toBeVisible({ timeout: 5_000 })
  })

  // --- RBAC-08: Org admin cross-campaign access ---

  test("org dashboard: Create Campaign link IS visible (org_admin)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // admin1@localhost has org_admin role -- Create Campaign should be visible
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
  })

  test("org settings: name input is readonly with bg-muted class (org_admin, not org_owner)", async ({
    page,
  }) => {
    await page.goto("/org/settings")
    await page.waitForURL(/\/org\/settings/, { timeout: 10_000 })

    // Organization Name input should be present
    const orgNameInput = page.getByLabel(/organization name/i)
    await expect(orgNameInput).toBeVisible({ timeout: 10_000 })

    // For org_admin (not org_owner), the input should be readonly with bg-muted
    await expect(orgNameInput).toHaveAttribute("readonly", "")
    await expect(orgNameInput).toHaveClass(/bg-muted/)

    // Save Changes button should NOT be visible (org_owner only)
    const saveButton = page.getByRole("button", { name: /save changes/i })
    await expect(saveButton).not.toBeVisible()
  })

  test("org sidebar: Members and Settings links ARE visible (org_admin)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Organization sidebar Members link is gated behind RequireOrgRole minimum="org_admin"
    const membersLink = page.getByRole("link", { name: /^members$/i })
    await expect(membersLink).toBeVisible({ timeout: 10_000 })

    const settingsLink = page.getByRole("link", { name: /^settings$/i })
    await expect(settingsLink).toBeVisible({ timeout: 10_000 })
  })
})
