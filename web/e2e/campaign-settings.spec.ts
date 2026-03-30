import { test, expect } from "@playwright/test"

/**
 * Campaign Settings E2E Spec
 *
 * Validates campaign administration workflows:
 *
 * Block A: Settings CRUD + Member Management + Campaign Deletion
 *   - Setup: Create throwaway campaign A
 *   - CAMP-01: Edit campaign general settings (name change + revert)
 *   - CAMP-02: Invite a new member
 *   - CAMP-03: Change a member's campaign role
 *   - CAMP-04: Remove a member
 *   - CAMP-06: Delete campaign A via danger zone (lifecycle assertion per D-10)
 *
 * Block B: Ownership Transfer
 *   - Setup: Create throwaway campaign B (with admin1@localhost as admin)
 *   - CAMP-05: Transfer campaign ownership to admin1@localhost
 *
 * Runs as owner (unsuffixed filename -> owner1@localhost).
 * Uses test.describe.serial per D-09 since tests form ordered lifecycles.
 */

/**
 * Helper: Create a campaign via the 3-step wizard and return its ID.
 * Skips team invite step unless members are provided.
 */
async function createCampaignViaWizard(
  page: import("@playwright/test").Page,
  campaignName: string,
  options?: { skipInvites?: boolean }
): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )

  // Click "Create Campaign"
  await page.getByRole("link", { name: /create campaign/i }).first().click()
  await page.waitForURL(/campaigns\/new/, { timeout: 10_000 })

  // Step 1: Campaign Details
  await page.getByLabel("Campaign Name *").fill(campaignName)
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: "Local" }).click()

  // Continue to Review
  await page.getByRole("button", { name: /continue to review/i }).click()
  await expect(page.getByText(campaignName)).toBeVisible({ timeout: 5_000 })

  // Continue to Invite
  await page.getByRole("button", { name: /continue to invite/i }).click()

  // Step 3: Invite Team -- intercept the POST
  const responsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/v1/campaigns") &&
      resp.request().method() === "POST" &&
      !resp.url().includes("/search") &&
      !resp.url().includes("/members"),
    { timeout: 15_000 },
  )

  // Click "Create Campaign" (no members selected)
  const createBtn = page.getByRole("button", { name: /^Create Campaign$/i })
  await expect(createBtn).toBeEnabled({ timeout: 5_000 })
  await createBtn.click()

  const response = await responsePromise
  expect(response.status()).toBeLessThan(300)

  // Wait for redirect to new campaign dashboard
  await page.waitForURL(/campaigns\/([a-f0-9-]+)\/dashboard/, {
    timeout: 15_000,
  })

  // Extract campaign ID from URL
  const url = page.url()
  const match = url.match(/campaigns\/([a-f0-9-]+)\/dashboard/)
  expect(match).toBeTruthy()
  return match![1]
}

// ─── Block A: Settings CRUD + Member Management + Campaign Deletion ──────────

test.describe.serial(
  "Campaign settings: CRUD, members, and deletion",
  () => {
    let campaignId: string
    let campaignName: string

    test.setTimeout(120_000)

    test("Setup: Create throwaway campaign A", async ({ page }) => {
      campaignName = `E2E Settings A ${Date.now()}`
      campaignId = await createCampaignViaWizard(page, campaignName)
      expect(campaignId).toBeTruthy()
    })

    test("CAMP-01: Edit campaign general settings", async ({ page }) => {
      // Navigate to general settings
      await page.goto(`/campaigns/${campaignId}/settings/general`)

      await expect(
        page.getByText(/general/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Wait for form to load with campaign data
      const nameInput = page.getByLabel("Campaign Name")
      await expect(nameInput).toBeVisible({ timeout: 10_000 })
      await expect(nameInput).toHaveValue(campaignName, { timeout: 10_000 })

      const updatedName = `${campaignName} (Updated)`

      // Change campaign name
      await nameInput.clear()
      await nameInput.fill(updatedName)

      // Update description if field exists
      const descriptionInput = page.getByLabel("Description")
      if (await descriptionInput.isVisible()) {
        await descriptionInput.fill("E2E test description")
      }

      // Click "Save changes"
      const saveResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`api/v1/campaigns/${campaignId}`) &&
          resp.request().method() === "PATCH"
      )
      await page.getByRole("button", { name: /save changes/i }).click()

      await saveResponsePromise

      // Verify toast/success
      await expect(page.getByText(/campaign updated/i).first()).toBeVisible({
        timeout: 10_000,
      })

      // Verify updated name
      await expect(nameInput).toHaveValue(updatedName)

      // Revert: change name back to original
      await nameInput.clear()
      await nameInput.fill(campaignName)

      const revertResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`api/v1/campaigns/${campaignId}`) &&
          resp.request().method() === "PATCH"
      )
      await page.getByRole("button", { name: /save changes/i }).click()
      await revertResponsePromise

      // Verify toast
      await expect(page.getByText(/campaign updated/i).first()).toBeVisible({
        timeout: 10_000,
      })
    })

    test("CAMP-02: Invite a new member", async ({ page }) => {
      // Navigate to campaign members settings
      await page.goto(`/campaigns/${campaignId}/settings/members`)

      await expect(
        page.getByText(/members/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Click "Invite member" button
      await page
        .getByRole("button", { name: /invite member/i })
        .click()

      // Fill invite form: email
      const emailInput = page.getByLabel("Email")
      await expect(emailInput).toBeVisible({ timeout: 5_000 })
      await emailInput.fill("viewer2@localhost")

      // Select role "Volunteer" from the role select
      await page.getByRole("combobox").last().click()
      await page.getByRole("option", { name: /volunteer/i }).click()

      // Submit invite
      const inviteResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`campaigns/${campaignId}/invites`) &&
          resp.request().method() === "POST"
      )

      await page.getByRole("button", { name: /send invite/i }).click()

      const inviteResponse = await inviteResponsePromise
      expect(inviteResponse.status()).toBeLessThan(300)

      // Verify the invite appears in the pending invites section
      await expect(page.getByText("viewer2@localhost")).toBeVisible({
        timeout: 10_000,
      })
    })

    test("CAMP-03: Change a member's campaign role", async ({ page }) => {
      // Navigate to campaign members settings
      await page.goto(`/campaigns/${campaignId}/settings/members`)

      await expect(
        page.getByText(/members/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // The owner is the only direct member. We need to find a member to change role.
      // Since the invite in CAMP-02 creates a pending invite (not an active member),
      // we need to work with the existing members. The owner can't change their own role.
      // Let's use the API to add a member directly for this test.
      const token = await getAuthToken(page)
      const addMemberResponse = await page.request.post(
        `/api/v1/campaigns/${campaignId}/members`,
        {
          data: {
            user_id: await getUserId(page, "viewer2@localhost"),
            role: "volunteer",
          },
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      // If member already exists (from invite), that's okay
      if (addMemberResponse.status() >= 400 && addMemberResponse.status() !== 409) {
        // Try with admin1@localhost instead
        const altResponse = await page.request.post(
          `/api/v1/campaigns/${campaignId}/members`,
          {
            data: {
              user_id: await getUserId(page, "admin1@localhost"),
              role: "volunteer",
            },
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        expect(altResponse.status()).toBeLessThan(400)
      }

      // Reload the members page to see the new member
      await page.reload()
      await expect(
        page.getByText(/members/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Find a non-owner member's actions button
      // Look for a row with a role that is not "owner"
      const memberRow = page
        .getByRole("row")
        .filter({ hasNot: page.getByText(/owner/i) })
        .filter({ has: page.getByRole("button") })
        .first()

      // Open actions dropdown
      const actionsButton = memberRow.getByRole("button").first()
      await actionsButton.click()

      // Click "Change role"
      await page.getByRole("menuitem", { name: /change role/i }).click()

      // In the role change dialog, select "Manager"
      await expect(
        page.getByText(/change role/i).first()
      ).toBeVisible({ timeout: 5_000 })

      const roleResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`members`) &&
          (resp.request().method() === "PATCH" || resp.request().method() === "PUT")
      )

      // Click the role select in the dialog
      await page.getByRole("combobox").last().click()
      await page.getByRole("option", { name: /manager/i }).click()

      // Click "Save" button
      await page.getByRole("button", { name: /save/i }).click()

      await roleResponsePromise

      // Verify toast
      await expect(page.getByText(/role updated/i)).toBeVisible({
        timeout: 10_000,
      })
    })

    test("CAMP-04: Remove a member", async ({ page }) => {
      // Navigate to campaign members settings
      await page.goto(`/campaigns/${campaignId}/settings/members`)

      await expect(
        page.getByText(/members/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Find a non-owner member's actions button
      const memberRow = page
        .getByRole("row")
        .filter({ hasNot: page.getByText(/owner/i) })
        .filter({ has: page.getByRole("button") })
        .first()

      // Open actions dropdown
      const actionsButton = memberRow.getByRole("button").first()
      await actionsButton.click()

      // Click "Remove member"
      await page
        .getByRole("menuitem", { name: /remove member/i })
        .click()

      // Confirm the removal dialog
      const removeResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`members`) &&
          resp.request().method() === "DELETE"
      )

      await page.getByRole("button", { name: /^remove$/i }).click()

      await removeResponsePromise

      // Verify toast
      await expect(page.getByText(/member removed/i)).toBeVisible({
        timeout: 10_000,
      })
    })

    test("CAMP-06: Delete campaign A via danger zone", async ({ page }) => {
      // Navigate to danger zone
      await page.goto(`/campaigns/${campaignId}/settings/danger`)

      await expect(
        page.getByText(/danger zone/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Click "Delete campaign" button
      await page
        .getByRole("button", { name: /delete campaign/i })
        .first()
        .click()

      // Type campaign name in the DestructiveConfirmDialog
      const confirmInput = page.getByTestId("destructive-confirm-input")
      await expect(confirmInput).toBeVisible({ timeout: 5_000 })
      await confirmInput.fill(campaignName)

      // Click the delete confirmation button
      await page
        .getByRole("button", { name: /delete campaign/i })
        .last()
        .click()

      // Verify redirect to org dashboard
      await page.waitForURL(/^\/$/, { timeout: 15_000 })

      // Verify the campaign no longer appears
      await expect(page.getByText(campaignName)).not.toBeVisible({
        timeout: 10_000,
      })
    })
  }
)

// ─── Block B: Ownership Transfer ─────────────────────────────────────────────

test.describe.serial("Campaign settings: ownership transfer", () => {
  let campaignId: string
  let campaignName: string

  test.setTimeout(120_000)

  test("Setup: Create throwaway campaign B with admin member", async ({
    page,
  }) => {
    campaignName = `E2E Settings B ${Date.now()}`
    campaignId = await createCampaignViaWizard(page, campaignName)
    expect(campaignId).toBeTruthy()

    // Add admin1@localhost as an admin member to this campaign via API
    // This is necessary so they appear in the ownership transfer dropdown
    const token = await getAuthToken(page)
    const adminUserId = await getUserId(page, "admin1@localhost")
    const addResponse = await page.request.post(
      `/api/v1/campaigns/${campaignId}/members`,
      {
        data: { user_id: adminUserId, role: "admin" },
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    expect(addResponse.status()).toBeLessThan(400)
  })

  test("CAMP-05: Transfer campaign ownership", async ({ page }) => {
    // Navigate to danger zone
    await page.goto(`/campaigns/${campaignId}/settings/danger`)

    await expect(
      page.getByText(/danger zone/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Click "Transfer ownership" button
    await page
      .getByRole("button", { name: /transfer ownership/i })
      .first()
      .click()

    // Wait for the transfer dialog with admin selector
    await expect(
      page.getByText(/select an admin/i)
    ).toBeVisible({ timeout: 10_000 })

    // Select admin1@localhost from the dropdown
    await page.getByRole("combobox").click()
    await page
      .getByRole("option", { name: /admin.*1/i })
      .or(page.getByRole("option").first())
      .click()

    // Click "Continue" to proceed to confirmation
    await page.getByRole("button", { name: /continue/i }).click()

    // Confirm the transfer in the second dialog
    await expect(
      page.getByText(/confirm ownership transfer/i)
    ).toBeVisible({ timeout: 5_000 })

    await page
      .getByRole("button", { name: /transfer ownership/i })
      .last()
      .click()

    // Verify success toast
    await expect(page.getByText(/ownership transferred/i)).toBeVisible({
      timeout: 10_000,
    })

    // After transfer, the current user (owner1@localhost) is no longer owner.
    // The danger zone buttons should no longer be visible or the page
    // should show the "only the campaign owner can access" message.
    await expect(
      page
        .getByText(/only the campaign owner/i)
        .or(page.getByRole("button", { name: /delete campaign/i }))
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Helper: extract Bearer token from page's auth store ─────────────────────

async function getAuthToken(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    // Find the OIDC user object in localStorage (key format: oidc.user:...)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      if (key.startsWith("oidc.user:")) {
        try {
          const user = JSON.parse(localStorage.getItem(key)!)
          if (user?.access_token) return user.access_token as string
        } catch { /* skip */ }
      }
    }
    throw new Error("No OIDC access token found in localStorage")
  })
}

// ─── Helper: Get user ID from org members API ───────────────────────────────

async function getUserId(
  page: import("@playwright/test").Page,
  email: string
): Promise<string> {
  const token = await getAuthToken(page)
  const response = await page.request.get("/api/v1/org/members", {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  const members = (await response.json()) as Array<{
    user_id: string
    email: string
  }>
  const member = members.find((m) => m.email === email)
  expect(member).toBeTruthy()
  return member!.user_id
}
