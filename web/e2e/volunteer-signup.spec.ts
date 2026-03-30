import { test, expect } from "@playwright/test"
import { navigateToSeedCampaign } from "./helpers"

test.describe("Volunteer signup", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to seed campaign via API-first approach
    await navigateToSeedCampaign(page)

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

  test("create volunteer record via registration form", async ({ page }) => {
    // Navigate to the register page
    // Look for "Create Volunteer" button (manager view) or navigate directly
    const createButton = page
      .getByRole("button", { name: /create volunteer/i })
      .or(page.getByRole("link", { name: /register|create/i }))
      .first()
    await createButton.click()

    // Wait for the registration form to load
    await page.waitForURL(/register/, { timeout: 10_000 })

    // Ensure the "Add volunteer record" radio is selected (default for managers)
    const recordRadio = page.locator("#mode-record")
    if (await recordRadio.isVisible()) {
      await recordRadio.click()
    }

    // Fill in volunteer details
    await page.getByLabel(/first name/i).first().fill("E2E")
    await page.getByLabel(/last name/i).first().fill("Volunteer")
    await page.getByLabel(/phone/i).first().fill("5551234567")
    await page.getByLabel(/email/i).first().fill("e2e-vol@test.com")

    // Submit the form
    const submitButton = page
      .getByRole("button", { name: /create volunteer|register/i })
      .first()
    await submitButton.click()

    // Wait for redirect to volunteer detail page
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 15_000 })

    // Verify we landed on the volunteer detail page showing the name
    await expect(page.getByText("E2E").first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText("Volunteer").first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test("view volunteer detail shows contact info", async ({ page }) => {
    // Click on the first volunteer in the roster (seed data has 20 volunteers)
    const firstRow = page.getByRole("row").nth(1) // skip header
    await firstRow.click()

    // Wait for volunteer detail page to load
    await page.waitForURL(/volunteers\/[a-f0-9-]+/, { timeout: 10_000 })

    // Verify contact information is visible
    const contactInfo = page
      .getByText(/email|phone|skills|status/i)
      .first()
    await expect(contactInfo).toBeVisible({ timeout: 10_000 })
  })

  test("volunteer roster shows seed data", async ({ page }) => {
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
