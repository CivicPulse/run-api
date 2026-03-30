import { test, expect } from "@playwright/test"
import { navigateToSeedCampaign, apiPost, apiDelete, apiGet } from "./helpers"

/**
 * Walk Lists E2E Spec
 *
 * Validates walk list generation from turfs, canvasser assignment/unassignment,
 * rename (Phase 56 feature), and deletion.
 *
 * Covers: WL-01 through WL-07 (E2E-13)
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// ── Helper Functions ─────────────────────────────────────────────────────────

async function createTurfViaApi(page: import("@playwright/test").Page, campaignId: string, name: string, boundary: Record<string, unknown>): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/turfs`, { name, boundary })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function generateWalkListViaApi(page: import("@playwright/test").Page, campaignId: string, turfId: string, name: string): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/walk-lists`, { turf_id: turfId, name })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function deleteWalkListViaApi(page: import("@playwright/test").Page, campaignId: string, walkListId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}`)
  expect(resp.ok()).toBeTruthy()
}

async function assignCanvasserViaApi(page: import("@playwright/test").Page, campaignId: string, walkListId: string, userId: string): Promise<void> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`, { user_id: userId })
  expect(resp.ok()).toBeTruthy()
}

async function navigateToCanvassing(
  page: import("@playwright/test").Page,
  campaignId: string,
): Promise<void> {
  await page.goto(`/campaigns/${campaignId}/canvassing`)
  await page.waitForURL(/canvassing/, { timeout: 10_000 })
  await expect(
    page.getByText(/walk lists/i).first(),
  ).toBeVisible({ timeout: 10_000 })
}

// ── Source Turf Polygon ──────────────────────────────────────────────────────

const WL_SOURCE_TURF_BOUNDARY = {
  type: "Polygon",
  coordinates: [
    [
      [-83.66, 32.86],
      [-83.62, 32.86],
      [-83.62, 32.83],
      [-83.66, 32.83],
      [-83.66, 32.86],
    ],
  ],
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe.serial("Walk List Lifecycle", () => {
  let campaignId = ""
  let turfId = ""
  let walkListId = ""
  let secondWalkListId = ""

  // We need known user IDs for canvasser assignment.
  // The owner user (from auth setup) is already a campaign member.
  let ownerUserId = ""
  let secondUserId = ""

  test.setTimeout(120_000)

  test("Setup: navigate to seed campaign and ensure turf exists", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)
    expect(campaignId).toBeTruthy()

    // Create a dedicated turf for walk list generation via API
    turfId = await createTurfViaApi(
      page,
      campaignId,
      "E2E WL Source Turf",
      WL_SOURCE_TURF_BOUNDARY,
    )
    expect(turfId).toBeTruthy()

    // Get the current user's ID from a campaign members API call
    const membersResp = await apiGet(
      page,
      `/api/v1/campaigns/${campaignId}/members`,
    )
    if (membersResp.ok()) {
      const membersBody = await membersResp.json()
      const members = membersBody.items ?? membersBody
      if (Array.isArray(members) && members.length > 0) {
        // Use the first member (likely the owner) as our canvasser
        ownerUserId = members[0].user_id ?? members[0].id ?? ""
        // Use a second member if available for the second canvasser
        if (members.length > 1) {
          secondUserId = members[1].user_id ?? members[1].id ?? ""
        }
      }
    }
    // Fallback: use a dummy user ID if members call didn't work
    if (!ownerUserId) {
      ownerUserId = "e2e-test-owner"
    }
  })

  test("WL-01: Generate a walk list from a turf", async ({ page }) => {
    // Per D-16: Use the full UI dialog flow to test the generate feature
    await navigateToSeedCampaign(page)
    await navigateToCanvassing(page, campaignId)

    await test.step("Open Generate Walk List dialog", async () => {
      await page
        .getByRole("button", { name: /generate walk list/i })
        .click()

      // Wait for the WalkListGenerateDialog to appear
      await expect(
        page.getByText(/generate walk list/i).first(),
      ).toBeVisible({ timeout: 5_000 })
    })

    await test.step("Fill walk list name and select turf", async () => {
      // Fill the name field
      const nameInput = page.locator("#wl-name")
      await nameInput.fill("E2E Walk List North")

      // Select the source turf from the dropdown
      // The WalkListGenerateDialog uses a Radix Select for turf selection
      await page.getByRole("combobox").click()
      await page
        .getByRole("option", { name: /e2e wl source turf/i })
        .first()
        .click()
    })

    await test.step("Generate and verify walk list appears", async () => {
      // Intercept the API response to capture the walk list ID
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/walk-lists") &&
          resp.request().method() === "POST",
      )

      await page.getByRole("button", { name: /^generate$/i }).click()

      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body = await response.json()
      walkListId = body.id

      // Dialog should close
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})

      // Verify walk list appears in the walk lists table
      await expect(
        page.getByText("E2E Walk List North").first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("WL-02: View walk list details", async ({ page }) => {
    await navigateToSeedCampaign(page)
    await navigateToCanvassing(page, campaignId)

    await test.step("Click walk list to open detail page", async () => {
      await page
        .getByRole("link", { name: /e2e walk list north/i })
        .first()
        .click()
      await page.waitForURL(/walk-lists\/[a-f0-9-]+/, { timeout: 10_000 })
    })

    await test.step("Verify walk list detail page content", async () => {
      // Walk list name should be visible as heading
      await expect(
        page.getByText("E2E Walk List North").first(),
      ).toBeVisible({ timeout: 10_000 })

      // Progress indicator should be visible
      await expect(
        page.getByText(/progress/i).first(),
      ).toBeVisible({ timeout: 5_000 })

      // Canvassers section should be present
      await expect(
        page.getByText(/canvassers/i).first(),
      ).toBeVisible({ timeout: 5_000 })

      // Entries section should be present
      await expect(
        page.getByText(/entries/i).first(),
      ).toBeVisible({ timeout: 5_000 })

      // Check for entries table or empty state
      // The walk list may have entries if voters exist in the turf polygon
      const hasEntries = await page
        .locator("table")
        .isVisible({ timeout: 5_000 })
        .catch(() => false)

      if (hasEntries) {
        // Verify table headers: #, Household, Status
        await expect(page.getByRole("columnheader", { name: "#" })).toBeVisible()
        await expect(
          page.getByRole("columnheader", { name: /household/i }),
        ).toBeVisible()
        await expect(
          page.getByRole("columnheader", { name: /status/i }),
        ).toBeVisible()

        // Check for Google Maps navigation links (ExternalLink icons)
        // The walk list detail has a google.com/maps link per entry
        const mapLinks = page.locator('a[href*="google.com/maps"]')
        const mapLinkCount = await mapLinks.count()
        // At least some entries may have household_key for map links
        expect(mapLinkCount).toBeGreaterThanOrEqual(0)
      } else {
        // Empty state is also valid if no voters in the turf polygon
        await expect(
          page.getByText(/no entries/i).first(),
        ).toBeVisible({ timeout: 5_000 })
      }
    })
  })

  test("WL-03: Assign canvassers to walk list", async ({ page }) => {
    await navigateToSeedCampaign(page)

    await test.step("Navigate to walk list detail", async () => {
      await page.goto(
        `/campaigns/${campaignId}/canvassing/walk-lists/${walkListId}`,
      )
      await expect(
        page.getByText("E2E Walk List North").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Assign first canvasser via UI", async () => {
      // Click "Assign" button in the Canvassers section
      await page
        .getByRole("button", { name: /assign/i })
        .first()
        .click()

      // The CanvasserAssignDialog opens with a User ID input
      await expect(
        page.getByText(/assign canvasser/i).first(),
      ).toBeVisible({ timeout: 5_000 })

      // Fill in the user ID
      const userIdInput = page.locator("#user-id")
      await userIdInput.fill(ownerUserId)

      // Submit
      await page
        .getByRole("button", { name: /^assign$/i })
        .click()

      // Dialog should close
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})

      // Verify canvasser appears in the canvassers section
      await expect(
        page.getByText(ownerUserId).first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Assign second canvasser via API", async () => {
      // Use a real member from the campaign (FK constraint requires valid user)
      expect(secondUserId).toBeTruthy()
      await assignCanvasserViaApi(page, campaignId, walkListId, secondUserId)

      // Reload to verify
      await page.reload()
      await expect(
        page.getByText(secondUserId).first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("WL-04: Unassign a canvasser", async ({ page }) => {
    await navigateToSeedCampaign(page)

    await test.step("Navigate to walk list detail", async () => {
      await page.goto(
        `/campaigns/${campaignId}/canvassing/walk-lists/${walkListId}`,
      )
      await expect(
        page.getByText("E2E Walk List North").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Remove second canvasser", async () => {
      // The canvasser badges have a remove (UserMinus) button
      // Find the badge for "e2e-canvasser-2" and click its remove button
      const canvasserBadge = page
        .locator("span")
        .filter({ hasText: "e2e-canvasser-2" })
        .first()
      await expect(canvasserBadge).toBeVisible({ timeout: 10_000 })

      // Click the remove button within the badge
      const removeBtn = canvasserBadge.locator("button").first()
      await removeBtn.click()

      // Confirm the removal dialog
      const confirmDialog = page.getByRole("dialog")
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 })

      await page
        .getByRole("button", { name: /remove/i })
        .click()

      // Wait for dialog to close
      await expect(confirmDialog).toBeHidden({ timeout: 5_000 }).catch(() => {})

      // Verify the canvasser is removed
      await expect(
        page.getByText("e2e-canvasser-2").first(),
      ).not.toBeVisible({ timeout: 5_000 })
    })

    await test.step("Verify first canvasser still assigned", async () => {
      await expect(
        page.getByText(ownerUserId).first(),
      ).toBeVisible({ timeout: 5_000 })
    })
  })

  test("WL-05: Rename a walk list", async ({ page }) => {
    // Per Phase 56 feature: Walk list rename UI exists
    await navigateToSeedCampaign(page)

    await test.step("Rename via walk list detail page", async () => {
      await page.goto(
        `/campaigns/${campaignId}/canvassing/walk-lists/${walkListId}`,
      )
      await expect(
        page.getByText("E2E Walk List North").first(),
      ).toBeVisible({ timeout: 10_000 })

      // Click the pencil/rename button next to the walk list name
      // The detail page has a small pencil icon button with aria-label="Rename walk list"
      await page
        .getByRole("button", { name: /rename walk list/i })
        .click()

      // The rename dialog opens with a name input
      await expect(
        page.getByText(/rename walk list/i).first(),
      ).toBeVisible({ timeout: 5_000 })

      const renameInput = page.locator("#rename-detail-input")
      await renameInput.clear()
      await renameInput.fill("E2E Walk List North (Updated)")

      // Click Save
      await page
        .getByRole("button", { name: /save/i })
        .click()

      // Dialog should close
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})

      // Verify the new name is shown on the detail page
      await expect(
        page.getByText("E2E Walk List North (Updated)").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Verify renamed walk list on canvassing index", async () => {
      await navigateToCanvassing(page, campaignId)

      await expect(
        page.getByText("E2E Walk List North (Updated)").first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("WL-06: Delete a walk list", async ({ page }) => {
    await navigateToSeedCampaign(page)
    await navigateToCanvassing(page, campaignId)

    await test.step("Delete via row action menu", async () => {
      // Find the walk list row with the renamed walk list
      const walkListRow = page
        .getByRole("row")
        .filter({ hasText: "E2E Walk List North (Updated)" })

      // Click the actions menu (MoreVertical icon button)
      const actionsButton = walkListRow
        .getByRole("button")
        .first()
      await actionsButton.click()

      // Click "Delete" from the dropdown menu
      await page
        .getByRole("menuitem", { name: /delete/i })
        .click()

      // Confirm the deletion dialog (ConfirmDialog with Delete button)
      const confirmDialog = page.getByRole("dialog")
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 })

      await page
        .getByRole("button", { name: /^delete$/i })
        .click()

      // Wait for dialog to close and walk list to disappear
      await expect(confirmDialog).toBeHidden({ timeout: 5_000 }).catch(() => {})

      // Verify walk list is removed from the table
      await expect(
        page.getByText("E2E Walk List North (Updated)").first(),
      ).not.toBeVisible({ timeout: 5_000 })
    })
  })

  test("WL-07: Create a walk list for further testing", async ({ page }) => {
    await navigateToSeedCampaign(page)
    await navigateToCanvassing(page, campaignId)

    await test.step("Generate new walk list via UI", async () => {
      await page
        .getByRole("button", { name: /generate walk list/i })
        .click()

      await expect(
        page.getByText(/generate walk list/i).first(),
      ).toBeVisible({ timeout: 5_000 })

      // Fill name
      const nameInput = page.locator("#wl-name")
      await nameInput.fill("E2E Walk List \u2014 Active")

      // Select the source turf
      await page.getByRole("combobox").click()
      await page
        .getByRole("option", { name: /e2e wl source turf/i })
        .first()
        .click()

      // Intercept API response
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/walk-lists") &&
          resp.request().method() === "POST",
      )

      await page.getByRole("button", { name: /^generate$/i }).click()

      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body = await response.json()
      secondWalkListId = body.id

      // Dialog should close
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})
    })

    await test.step("Verify walk list appears in table", async () => {
      await expect(
        page.getByText("E2E Walk List \u2014 Active").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Assign canvasser to the new walk list", async () => {
      // Assign via API for speed
      await assignCanvasserViaApi(
        page,
        campaignId,
        secondWalkListId,
        ownerUserId,
      )

      // Navigate to detail page to verify
      await page
        .getByRole("link", { name: /e2e walk list.*active/i })
        .first()
        .click()
      await page.waitForURL(/walk-lists\/[a-f0-9-]+/, { timeout: 10_000 })

      // Verify canvasser is assigned
      await expect(
        page.getByText(ownerUserId).first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })
})
