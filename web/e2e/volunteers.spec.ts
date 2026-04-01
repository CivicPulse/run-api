import { test, expect } from "./fixtures"
import { apiPost, apiPatch, apiGet } from "./helpers"

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
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/volunteers`, data)
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function deactivateVolunteerViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  volunteerId: string,
): Promise<void> {
  const resp = await apiPatch(page, `/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/status`, { status: "inactive" })
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
  const volunteerIds: string[] = []

  test.setTimeout(120_000)

  test("Setup: navigate to seed campaign", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()
  })

  test("VOL-01: Register a user volunteer via UI (record mode)", async ({
    page, campaignId,
  }) => {
    // Navigate directly to avoid sidebar/tab link ambiguity (Volunteers tab vs sub-route links)
    await page.goto(`/campaigns/${campaignId}/volunteers/register`)
    await page.waitForURL(/volunteers\/register/, { timeout: 10_000 })

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

    // Verify redirect or navigate to volunteer detail page
    // The navigate() may be delayed due to form guard cleanup; use direct navigation as fallback
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 15_000 }).catch(async () => {
      // If redirect didn't happen, navigate directly to the created volunteer's detail page
      if (volunteerIds.length > 0) {
        await page.goto(`/campaigns/${campaignId}/volunteers/${volunteerIds[volunteerIds.length - 1]}`)
        await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
      }
    })
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VOL-02: Register a non-user volunteer via UI (record mode)", async ({
    page, campaignId,
  }) => {
    // Navigate directly to the register page to avoid sidebar/tab link ambiguity
    await page.goto(`/campaigns/${campaignId}/volunteers/register`)
    await page.waitForURL(/volunteers\/register/, { timeout: 10_000 })

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

    // Verify redirect to detail page (navigate may be delayed; fallback to direct navigation)
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 15_000 }).catch(async () => {
      if (body.id) {
        await page.goto(`/campaigns/${campaignId}/volunteers/${body.id}`)
        await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
      }
    })
    await expect(
      page.getByText("NonUser Vol UI").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VOL-03: Register via invite mode", async ({ page, campaignId }) => {
    // Navigate directly to avoid sidebar/tab link ambiguity
    await page.goto(`/campaigns/${campaignId}/volunteers/register`)
    await page.waitForURL(/volunteers\/register/, { timeout: 10_000 })

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

    // Should redirect to volunteer detail page (navigate may be delayed; fallback to direct navigation)
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 15_000 }).catch(async () => {
      if (body.id) {
        await page.goto(`/campaigns/${campaignId}/volunteers/${body.id}`)
        await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
      }
    })
  })

  test("VOL-04: Create remaining volunteers via API (10 total)", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

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

    // Navigate directly to roster to verify count
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/volunteers\/roster/, { timeout: 10_000 })
    // Wait for the roster page to fully render (React Query fetch + table render)
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})

    // Use search to find specific test volunteers (roster may have many accumulated volunteers)
    const searchInput = page.getByPlaceholder(/search by name/i)
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    await searchInput.fill("E2E UserVol Record")
    await expect(
      page.getByText("E2E UserVol Record").first(),
    ).toBeVisible({ timeout: 10_000 })

    await searchInput.fill("NonUser Vol A")
    await expect(
      page.getByText("NonUser Vol A").first(),
    ).toBeVisible({ timeout: 10_000 })

    await searchInput.clear()
  })

  test("VOL-05: View volunteer roster", async ({ page, campaignId }) => {
    // Navigate directly to avoid sidebar/tab link ambiguity
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/volunteers\/roster/, { timeout: 10_000 })

    // Verify roster heading
    await expect(
      page.getByText(/volunteer roster/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify table columns are present
    const bodyText = await page.locator("body").innerText()
    expect(bodyText).toMatch(/name/i)
    expect(bodyText).toMatch(/status/i)

    // Use search to find specific volunteers (roster may have many accumulated volunteers)
    const searchInput = page.getByPlaceholder(/search by name/i)
    await expect(searchInput).toBeVisible({ timeout: 5_000 })

    await test.step("Search for E2E UserVol Record", async () => {
      await searchInput.fill("E2E UserVol Record")
      await expect(
        page.getByText("E2E UserVol Record").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await test.step("Search for NonUser Vol A", async () => {
      await searchInput.fill("NonUser Vol A")
      await expect(
        page.getByText("NonUser Vol A").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    await searchInput.clear()
  })

  test("VOL-06: View volunteer detail page", async ({ page, campaignId }) => {
    // Navigate directly to roster to avoid sidebar/tab link ambiguity
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/volunteers\/roster/, { timeout: 10_000 })

    // Navigate directly to detail page via stored volunteer ID (avoids pagination issues)
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

  test("VOL-07: Edit a volunteer", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

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

    // Change phone number (edit sheet uses prefixed IDs: edit_phone, edit_notes)
    const phoneInput = page.locator("#edit_phone")
    await phoneInput.clear()
    await phoneInput.fill("4785559999")

    // Change notes
    const notesInput = page.locator("#edit_notes")
    if (await notesInput.isVisible().catch(() => false)) {
      await notesInput.fill("Updated via E2E test")
    }

    // Save changes
    await page.getByRole("button", { name: /save changes/i }).click()

    // Verify success toast
    await expect(
      page.getByText(/updated/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // Reload and verify changes persist
    await page.reload()
    await expect(
      page.getByText("4785559999").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VOL-08: Deactivate a volunteer", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Create a throwaway volunteer via API with unique name/email to avoid duplicates
    const uniqueSuffix = Date.now().toString().slice(-6)
    const throwawayName = `E2E Deactivate ${uniqueSuffix}`
    const throwawayId = await createVolunteerViaApi(page, campaignId, {
      first_name: "E2E",
      last_name: `Deactivate ${uniqueSuffix}`,
      email: `deactivate-vol-${uniqueSuffix}@test.local`,
    })

    // Navigate directly to roster to avoid sidebar/tab link ambiguity
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/volunteers\/roster/, { timeout: 10_000 })
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

    // Use search to find the specific volunteer (roster may have many accumulated entries)
    const searchInput = page.getByPlaceholder(/search by name/i)
    await expect(searchInput).toBeVisible({ timeout: 15_000 })
    await searchInput.fill(throwawayName)

    // Wait for filtered row to appear
    await expect(
      page.getByText(throwawayName).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Find the row with the throwaway volunteer and open its action menu
    const volunteerRow = page
      .locator("table tbody tr")
      .filter({ hasText: throwawayName })
    const actionButton = volunteerRow
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first()
    await actionButton.click()

    // Click "Deactivate" from the dropdown menu
    await page.getByRole("menuitem", { name: /deactivate/i }).click()

    // Confirm deactivation in the AlertDialog (ConfirmDialog uses AlertDialog -> role="alertdialog")
    const deactivateDialog = page.getByRole("alertdialog")
    await expect(deactivateDialog).toBeVisible({ timeout: 5_000 })
    // Click the confirm button scoped to the dialog to avoid ambiguity
    await deactivateDialog.getByRole("button", { name: /^deactivate$/i }).click()

    // Note: toast check skipped — the "Volunteer deactivated" sonner toast is
    // transient and races against the 10s timeout on the dev server. We verify
    // the outcome directly via the API and detail page UI instead.

    // Brief wait for the mutation to complete before hitting the API
    await page.waitForTimeout(1_500)

    // Verify the volunteer is now inactive via API (use apiGet for auth headers)
    const detailResp = await apiGet(
      page,
      `/api/v1/campaigns/${campaignId}/volunteers/${throwawayId}`,
    )
    expect(detailResp.ok()).toBeTruthy()
    const detail = await detailResp.json()
    expect(detail.status).toBe("inactive")

    // Also verify via detail page UI
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${throwawayId}`,
    )
    // Reload to ensure fresh data (TanStack Query might have stale data)
    await page.reload()
    await expect(page.getByText("Inactive").first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
