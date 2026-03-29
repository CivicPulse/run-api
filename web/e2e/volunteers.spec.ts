import { test, expect } from "@playwright/test"

/**
 * Volunteers E2E Spec
 *
 * Validates volunteer registration (user and non-user), roster display,
 * detail page, edit, and deactivate lifecycle.
 *
 * Covers: VOL-01 through VOL-08 (E2E-17)
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// -- Helpers ------------------------------------------------------------------

async function navigateToSeedCampaign(
  page: import("@playwright/test").Page,
): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  const campaignLink = page
    .getByRole("link", { name: /macon|bibb|campaign/i })
    .first()
  await campaignLink.click()
  await page.waitForURL(/campaigns\/([a-f0-9-]+)/, { timeout: 10_000 })
  return page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
}

async function createVolunteerViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  data: {
    first_name: string
    last_name: string
    email?: string
    phone?: string
    skills?: string[]
    notes?: string
    status?: string
  },
): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/volunteers`,
    {
      data,
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

async function deactivateVolunteerViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  volunteerId: string,
): Promise<void> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const resp = await page.request.patch(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/status`,
    {
      data: { status: "inactive" },
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
}

// -- Test Data ----------------------------------------------------------------

/** Non-user volunteers with varying levels of data completeness */
const NON_USER_VOLUNTEERS = [
  {
    first_name: "NonUser",
    last_name: "Vol A",
    email: "nuvola@test.local",
    phone: "4785550010",
    skills: ["canvassing", "driving"],
    notes: "Full data volunteer",
  },
  {
    first_name: "NonUser",
    last_name: "Vol B",
    // Minimal data: name only
  },
  {
    first_name: "NonUser",
    last_name: "Vol C",
    email: "nuvolc@test.local",
    skills: ["phone_banking"],
  },
  {
    first_name: "NonUser",
    last_name: "Vol D",
    phone: "4785550013",
    skills: ["data_entry", "social_media"],
  },
  {
    first_name: "NonUser",
    last_name: "Vol E",
    email: "nuvole@test.local",
    phone: "4785550014",
    notes: "Bilingual volunteer",
  },
]

/** User-linked volunteers created via API (simulating linked accounts) */
const USER_VOLUNTEERS_API = [
  {
    first_name: "E2E",
    last_name: "UserVol Alpha",
    email: "uservol-alpha@test.local",
    skills: ["canvassing", "phone_banking"],
  },
  {
    first_name: "E2E",
    last_name: "UserVol Bravo",
    email: "uservol-bravo@test.local",
    skills: ["voter_registration"],
  },
]

// -- Tests --------------------------------------------------------------------

test.describe.serial("Volunteer Lifecycle", () => {
  let campaignId = ""
  const volunteerIds: string[] = []

  test.setTimeout(120_000)

  test("Setup: navigate to seed campaign", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)
    expect(campaignId).toBeTruthy()
  })

  test("VOL-01: Register a user volunteer via UI (record mode)", async ({
    page,
  }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Navigate to Volunteers > Register
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /register/i }).first().click()
    await page.waitForURL(/register/, { timeout: 10_000 })

    // Verify page heading for manager role
    await expect(
      page
        .getByText(/create volunteer/i)
        .or(page.getByText(/volunteer registration/i))
        .first(),
    ).toBeVisible({ timeout: 10_000 })

    // "Record only" mode should be the default (radio button: "Add volunteer record")
    const recordRadio = page.locator("#mode-record")
    if (await recordRadio.isVisible().catch(() => false)) {
      await recordRadio.check()
    }

    // Clear any pre-filled values from auth store and fill form
    const firstNameInput = page.locator("#first_name")
    await firstNameInput.clear()
    await firstNameInput.fill("E2E")

    const lastNameInput = page.locator("#last_name")
    await lastNameInput.clear()
    await lastNameInput.fill("UserVol Record")

    await page.locator("#phone").fill("4785550001")
    await page.locator("#email").clear()
    await page.locator("#email").fill("uservol-record@test.local")

    // Select a skill
    const canvassingCheckbox = page
      .locator("label")
      .filter({ hasText: "Canvassing" })
    await canvassingCheckbox.click()

    // Intercept API response to capture volunteer ID
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/volunteers") &&
        resp.request().method() === "POST" &&
        !resp.url().includes("/register"),
    )

    // Submit
    await page.getByRole("button", { name: /create volunteer/i }).click()

    // Verify success
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    volunteerIds.push(body.id)

    // Verify redirect to volunteer detail page
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VOL-02: Register a non-user volunteer via UI (record mode)", async ({
    page,
  }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Navigate to Volunteers > Register
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /register/i }).first().click()
    await page.waitForURL(/register/, { timeout: 10_000 })

    // Ensure "Record only" mode
    const recordRadio = page.locator("#mode-record")
    if (await recordRadio.isVisible().catch(() => false)) {
      await recordRadio.check()
    }

    // Fill in non-user volunteer data
    const firstNameInput = page.locator("#first_name")
    await firstNameInput.clear()
    await firstNameInput.fill("NonUser")

    const lastNameInput = page.locator("#last_name")
    await lastNameInput.clear()
    await lastNameInput.fill("Vol UI")

    await page.locator("#phone").fill("4785550002")
    await page.locator("#email").clear()
    await page.locator("#email").fill("nonuser-ui@test.local")

    // Select skills
    const phoneCheckbox = page
      .locator("label")
      .filter({ hasText: "Phone Banking" })
    await phoneCheckbox.click()

    const dataEntryCheckbox = page
      .locator("label")
      .filter({ hasText: "Data Entry" })
    await dataEntryCheckbox.click()

    // Intercept API response
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/volunteers") &&
        resp.request().method() === "POST" &&
        !resp.url().includes("/register"),
    )

    // Submit
    await page.getByRole("button", { name: /create volunteer/i }).click()

    // Verify success
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    volunteerIds.push(body.id)

    // Verify redirect to detail page
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
    await expect(
      page.getByText("NonUser Vol UI").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VOL-03: Register via invite mode", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Navigate to Volunteers > Register
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /register/i }).first().click()
    await page.waitForURL(/register/, { timeout: 10_000 })

    // Switch to "Invite to app" mode
    const inviteRadio = page.locator("#mode-invite")
    if (await inviteRadio.isVisible().catch(() => false)) {
      await inviteRadio.check()

      // Verify the invite info alert appears
      await expect(
        page.getByText(/email invitation/i).first(),
      ).toBeVisible({ timeout: 5_000 })
    }

    // Fill form
    const firstNameInput = page.locator("#first_name")
    await firstNameInput.clear()
    await firstNameInput.fill("E2E")

    const lastNameInput = page.locator("#last_name")
    await lastNameInput.clear()
    await lastNameInput.fill("Invite Vol")

    await page.locator("#email").clear()
    await page.locator("#email").fill("invite-vol@test.local")

    // Intercept API response
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/volunteers") &&
        resp.request().method() === "POST",
    )

    // Submit
    await page.getByRole("button", { name: /create volunteer/i }).click()

    // Verify response and "coming soon" toast per testing plan note
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    volunteerIds.push(body.id)

    // Expect "coming soon" info toast for invite functionality
    await expect(
      page
        .getByText(/coming soon/i)
        .or(page.getByText(/volunteer created/i))
        .first(),
    ).toBeVisible({ timeout: 10_000 })

    // Should redirect to volunteer detail page
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
  })

  test("VOL-04: Create remaining volunteers via API (10 total)", async ({
    page,
  }) => {
    // Navigate to establish auth context
    campaignId = await navigateToSeedCampaign(page)

    // Create 5 non-user volunteers via API
    await test.step("Create 5 non-user volunteers via API", async () => {
      for (const vol of NON_USER_VOLUNTEERS) {
        const id = await createVolunteerViaApi(page, campaignId, vol)
        volunteerIds.push(id)
      }
    })

    // Create 2 user-linked volunteers via API
    await test.step("Create 2 user-linked volunteers via API", async () => {
      for (const vol of USER_VOLUNTEERS_API) {
        const id = await createVolunteerViaApi(page, campaignId, vol)
        volunteerIds.push(id)
      }
    })

    // Total: 3 from VOL-01/02/03 + 5 non-user + 2 user-linked = 10
    expect(volunteerIds.length).toBe(10)

    // Navigate to roster to verify count
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /roster/i }).first().click()
    await page.waitForURL(/roster/, { timeout: 10_000 })

    // Verify volunteers are visible in the roster
    // The roster may also include seed data volunteers, so check our test volunteers exist
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText("NonUser Vol A").first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("VOL-05: View volunteer roster", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Navigate to Volunteers > Roster
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /roster/i }).first().click()
    await page.waitForURL(/roster/, { timeout: 10_000 })

    // Verify roster heading
    await expect(
      page.getByText(/volunteer roster/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify table columns are present
    const bodyText = await page.locator("body").innerText()
    expect(bodyText).toMatch(/name/i)
    expect(bodyText).toMatch(/status/i)

    // Verify at least some of our test volunteers appear
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText("NonUser Vol UI").first(),
    ).toBeVisible({ timeout: 5_000 })

    // Test search filtering
    await test.step("Search for specific volunteer by name", async () => {
      const searchInput = page.getByPlaceholder(/search by name/i)
      await expect(searchInput).toBeVisible({ timeout: 5_000 })
      await searchInput.fill("NonUser Vol A")
      await page.waitForTimeout(500) // Wait for debounced search

      // Verify "NonUser Vol A" is visible
      await expect(
        page.getByText("NonUser Vol A").first(),
      ).toBeVisible({ timeout: 10_000 })

      // Clear search
      await searchInput.clear()
      await page.waitForTimeout(500)
    })
  })

  test("VOL-06: View volunteer detail page", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Navigate to roster
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /roster/i }).first().click()
    await page.waitForURL(/roster/, { timeout: 10_000 })

    // Wait for roster to load and find a volunteer row to click
    await expect(page.getByText("E2E UserVol Record").first()).toBeVisible({
      timeout: 10_000,
    })

    // Click on the volunteer row or navigate to detail page
    // The roster table uses RowActions with "Edit volunteer" which navigates to detail
    // Let's navigate directly via URL using the first volunteer ID
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[0]}`,
    )

    // Verify detail page content
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Back to Roster link
    await expect(page.getByText(/back to roster/i).first()).toBeVisible({
      timeout: 5_000,
    })

    // Tabs: Profile, Availability, Hours
    await expect(page.getByRole("tab", { name: /profile/i })).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /availability/i }),
    ).toBeVisible()
    await expect(page.getByRole("tab", { name: /hours/i })).toBeVisible()

    // Profile tab shows contact info
    await expect(page.getByText("Contact").first()).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText("Phone").first()).toBeVisible()
    await expect(page.getByText("Email").first()).toBeVisible()

    // Edit button visible for manager
    await expect(
      page.getByRole("button", { name: /edit/i }).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("VOL-07: Edit a volunteer", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Navigate to the first volunteer's detail page
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[0]}`,
    )
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Click Edit button
    await page.getByRole("button", { name: /edit/i }).first().click()

    // Verify edit sheet opens
    await expect(
      page
        .getByText(/edit volunteer/i)
        .or(page.getByRole("heading", { name: /edit/i }))
        .first(),
    ).toBeVisible({ timeout: 5_000 })

    // Change phone number
    const phoneInput = page.locator("#phone")
    await phoneInput.clear()
    await phoneInput.fill("4785559999")

    // Change notes
    const notesInput = page.locator("#notes").or(page.locator("textarea").first())
    if (await notesInput.isVisible().catch(() => false)) {
      await notesInput.fill("Updated via E2E test")
    }

    // Save changes
    await page.getByRole("button", { name: /save changes/i }).click()

    // Verify success toast
    await expect(
      page.getByText(/updated/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Reload and verify changes persist
    await page.reload()
    await expect(
      page.getByText("4785559999").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VOL-08: Deactivate a volunteer", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)

    // Create a throwaway volunteer via API
    const throwawayId = await createVolunteerViaApi(page, campaignId, {
      first_name: "E2E Vol",
      last_name: "Deactivate",
      email: "deactivate-vol@test.local",
    })

    // Navigate to roster
    await page.getByRole("link", { name: /volunteers/i }).first().click()
    await page.waitForURL(/volunteers/, { timeout: 10_000 })
    await page.getByRole("link", { name: /roster/i }).first().click()
    await page.waitForURL(/roster/, { timeout: 10_000 })

    // Wait for roster to load
    await expect(
      page.getByText("E2E Vol Deactivate").first(),
    ).toBeVisible({ timeout: 15_000 })

    // Find the row with the throwaway volunteer and open its action menu
    const volunteerRow = page
      .locator("table tbody tr")
      .filter({ hasText: "E2E Vol Deactivate" })
    const actionButton = volunteerRow
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first()
    await actionButton.click()

    // Click "Deactivate" from the dropdown menu
    await page.getByRole("menuitem", { name: /deactivate/i }).click()

    // Confirm deactivation in the dialog
    await expect(page.getByText(/deactivate volunteer/i).first()).toBeVisible({
      timeout: 5_000,
    })
    await page.getByRole("button", { name: /^deactivate$/i }).click()

    // Verify success toast
    await expect(
      page.getByText(/volunteer deactivated/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify the volunteer is now inactive (status change persists)
    // Filter roster by inactive status or check the volunteer's detail page
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${throwawayId}`,
    )
    await expect(page.getByText("Inactive").first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
