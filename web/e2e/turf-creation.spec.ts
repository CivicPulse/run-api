import { test, expect } from "@playwright/test"

test.describe("Turf creation", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app root and wait for authenticated redirect
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Click into the seed campaign
    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()

    // Navigate to canvassing section
    const canvassingNav = page
      .getByRole("link", { name: /canvassing/i })
      .first()
    await canvassingNav.click()

    // Wait for canvassing page to load
    await expect(
      page.getByText(/canvassing/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("create turf via GeoJSON editor draws polygon and saves", async ({
    page,
  }) => {
    // Click "New Turf" button
    const newTurfButton = page.getByRole("link", { name: /new turf/i }).first()
    await newTurfButton.click()

    // Wait for the turf form to appear
    await expect(page.getByLabel(/name/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Fill in turf name
    await page.getByLabel(/name/i).first().fill("E2E Test Turf")

    // Click "Edit as GeoJSON" to show the advanced textarea
    const geoJsonToggle = page.getByRole("button", {
      name: /edit as geojson/i,
    })
    await geoJsonToggle.click()

    // Wait for the GeoJSON editor panel to appear
    await expect(page.locator("#geojson-panel")).toBeVisible()

    // Fill the boundary textarea with a valid GeoJSON polygon
    const boundaryTextarea = page.locator("#boundary")
    await boundaryTextarea.fill(
      '{"type":"Polygon","coordinates":[[[-83.65,32.84],[-83.64,32.84],[-83.64,32.85],[-83.65,32.85],[-83.65,32.84]]]}',
    )

    // Click "Create Turf" submit button
    const submitButton = page.getByRole("button", { name: /create turf/i })
    await submitButton.click()

    // Wait for API response (redirect back to canvassing page)
    await page.waitForURL(/canvassing/, { timeout: 15_000 })

    // Verify the new turf appears in the turf list
    await expect(page.getByText("E2E Test Turf")).toBeVisible({
      timeout: 10_000,
    })
  })

  test("edit existing turf updates name", async ({ page }) => {
    // Click on the first turf card (seed data has 5 turfs)
    const firstTurfLink = page
      .locator("[class*='grid'] a[href*='turfs/']")
      .first()
    await firstTurfLink.click()

    // Wait for the turf detail/edit page to load
    await page.waitForURL(/turfs\/[a-f0-9-]+/, { timeout: 10_000 })

    // Look for the turf name input and update it
    const nameInput = page.getByLabel(/name/i).first()
    await expect(nameInput).toBeVisible({ timeout: 10_000 })

    const originalName = await nameInput.inputValue()
    const updatedName = `${originalName} Updated`
    await nameInput.fill(updatedName)

    // Save the turf
    const saveButton = page.getByRole("button", { name: /save|update/i }).first()
    await saveButton.click()

    // Wait for save to complete (redirect or success toast)
    await page.waitForResponse(
      (resp) => resp.url().includes("turfs") && resp.status() === 200,
      { timeout: 10_000 },
    )

    // Navigate back to canvassing page to verify
    await page.goto(page.url().replace(/turfs\/[a-f0-9-]+/, ""))
    await expect(page.getByText(updatedName).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test("view turf shows voter count badge", async ({ page }) => {
    // Verify at least one turf card shows a voter count
    // Seed data has 5 turfs with voters assigned
    const voterCountText = page.getByText(/\d+ voters?/).first()
    await expect(voterCountText).toBeVisible({ timeout: 10_000 })
  })
})
