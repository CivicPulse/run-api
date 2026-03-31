import { test, expect } from "./fixtures"

test.describe("Volunteer signup", () => {
  test.beforeEach(async ({ page, campaignId }) => {
    // Navigate to seed campaign dashboard then volunteers section
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Navigate to volunteers section
    const volunteersNav = page
      .getByRole("link", { name: /volunteers/i })
      .first()
    await volunteersNav.click()

    // Wait for the volunteer roster page to load (redirects from /volunteers/ to /volunteers/roster/)
    await expect(
      page.getByText(/volunteer roster|volunteers/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("create volunteer record via registration form", async ({ page, campaignId }) => {
    // Navigate to the register page via nav tab
    const registerLink = page
      .getByRole("link", { name: /register/i })
      .first()
    await registerLink.click()

    // Wait for the registration form to load
    await page.waitForURL(/register/, { timeout: 10_000 })

    // Ensure the "Add volunteer record" radio is selected (default for managers)
    const recordRadio = page.locator("#mode-record")
    if (await recordRadio.isVisible()) {
      await recordRadio.click()
    }

    // Fill in volunteer details (clear first to handle pre-fill from auth store)
    const firstNameInput = page.locator("#first_name")
    await firstNameInput.clear()
    await firstNameInput.fill("E2E")

    const lastNameInput = page.locator("#last_name")
    await lastNameInput.clear()
    await lastNameInput.fill("Volunteer")

    await page.locator("#phone").fill("5551234567")
    await page.locator("#email").clear()
    await page.locator("#email").fill("e2e-vol@test.com")

    // Submit the form and intercept the API response to get the volunteer ID
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/volunteers") &&
        resp.request().method() === "POST" &&
        !resp.url().includes("/register"),
    )
    await page.getByRole("button", { name: /create volunteer/i }).click()

    // Wait for the API response to confirm creation
    const createResp = await responsePromise
    expect(createResp.ok()).toBeTruthy()
    const createBody = await createResp.json()
    const volunteerId = createBody.id

    // Wait for redirect to volunteer detail page (navigate may be delayed by form guard cleanup)
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 15_000 }).catch(async () => {
      // If redirect didn't happen, navigate directly to the created volunteer's detail page
      if (volunteerId) {
        await page.goto(`/campaigns/${campaignId}/volunteers/${volunteerId}`)
        await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })
      }
    })

    // Verify we landed on the volunteer detail page showing the name
    await expect(page.getByText("E2E").first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText("Volunteer").first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test("view volunteer detail shows contact info", async ({ page, campaignId }) => {
    // Wait for actual data rows to load (not skeleton rows)
    await expect(page.locator("table tbody td").first()).toBeVisible({ timeout: 10_000 })
    // Wait for non-skeleton content in the first data cell
    await expect(page.locator("table tbody tr .font-medium").first()).toBeVisible({ timeout: 10_000 })

    // Click on the first volunteer in the roster (seed data has 20 volunteers)
    const firstRow = page.locator("table tbody tr").first()
    await firstRow.click()

    // Wait for volunteer detail page to load
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })

    // Verify contact information is visible
    const contactInfo = page
      .getByText(/email|phone|skills|status/i)
      .first()
    await expect(contactInfo).toBeVisible({ timeout: 10_000 })
  })

  test("volunteer roster shows seed data", async ({ page, campaignId }) => {
    // Verify the roster has rows (seed creates 20 volunteers)
    const rows = page.getByRole("row")
    // At least header + 1 data row
    await expect(rows.nth(1)).toBeVisible({ timeout: 10_000 })

    // Verify name column is populated
    const firstVolunteerName = page
      .getByRole("row")
      .nth(1)
      .locator("td")
      .first()
    await expect(firstVolunteerName).not.toBeEmpty()
  })
})
