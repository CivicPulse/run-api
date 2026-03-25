import { test, expect } from "@playwright/test"
import path from "node:path"

test.describe("Map interactions", () => {
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

  test("import GeoJSON file populates boundary field", async ({ page }) => {
    // Navigate to new turf page
    await page.getByRole("link", { name: /new turf/i }).first().click()
    await expect(page.getByLabel(/name/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Prepare a valid GeoJSON FeatureCollection file buffer
    const geojsonContent = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-83.65, 32.84],
                [-83.64, 32.84],
                [-83.64, 32.85],
                [-83.65, 32.85],
                [-83.65, 32.84],
              ],
            ],
          },
        },
      ],
    })

    // The file input is hidden; setInputFiles works regardless of visibility
    const fileInput = page.locator('input[type="file"][accept*="geojson"]')
    await fileInput.setInputFiles({
      name: "test-boundary.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(geojsonContent),
    })

    // Wait for the import toast confirming success
    await expect(page.getByText(/geojson imported/i)).toBeVisible({
      timeout: 5_000,
    })

    // Open the GeoJSON editor to verify boundary was populated
    await page
      .getByRole("button", { name: /edit as geojson/i })
      .click()
    await expect(page.locator("#geojson-panel")).toBeVisible()

    const boundaryValue = await page.locator("#boundary").inputValue()
    const parsed = JSON.parse(boundaryValue)
    expect(parsed.type).toBe("Polygon")
    expect(parsed.coordinates).toBeDefined()
    expect(parsed.coordinates[0]).toHaveLength(5)
  })

  test("export GeoJSON downloads file from turf detail", async ({ page }) => {
    // Click on the first turf to go to its detail page
    const firstTurfLink = page
      .locator("[class*='grid'] a[href*='turfs/']")
      .first()
    await firstTurfLink.click()
    await page.waitForURL(/turfs\/[a-f0-9-]+/, { timeout: 10_000 })

    // Wait for turf detail to fully load (name heading visible)
    await expect(page.locator("#page-heading")).toBeVisible({ timeout: 10_000 })

    // Capture the download triggered by clicking "Export GeoJSON"
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export geojson/i }).click(),
    ])

    // Verify filename ends with .geojson
    expect(download.suggestedFilename()).toMatch(/\.geojson$/)

    // Read the downloaded content and verify it is valid GeoJSON Feature
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fs = await import("node:fs/promises")
    const content = await fs.readFile(downloadPath!, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.type).toBe("Feature")
    expect(parsed.geometry).toBeDefined()
    expect(parsed.properties).toHaveProperty("name")
  })

  test("address search triggers Nominatim geocode request", async ({
    page,
  }) => {
    // Navigate to new turf page
    await page.getByRole("link", { name: /new turf/i }).first().click()
    await expect(page.getByLabel(/name/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Intercept the Nominatim request to avoid external dependency flakiness
    // and to assert it was called with the right query
    const nominatimPromise = page.waitForRequest(
      (req) =>
        req.url().includes("nominatim.openstreetmap.org/search") &&
        req.url().includes("Macon"),
    )

    // Fill the address search input and press Enter
    const searchInput = page.getByPlaceholder(/search address/i)
    await searchInput.fill("Macon, GA")
    await searchInput.press("Enter")

    // Verify the Nominatim request was dispatched with expected query
    const request = await nominatimPromise
    const url = new URL(request.url())
    expect(url.searchParams.get("q")).toBe("Macon, GA")
    expect(url.searchParams.get("format")).toBe("json")
  })

  test("editing GeoJSON textarea syncs to form boundary and creates turf", async ({
    page,
  }) => {
    // Navigate to new turf page
    await page.getByRole("link", { name: /new turf/i }).first().click()
    await expect(page.getByLabel(/name/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Open the GeoJSON editor panel
    await page.getByRole("button", { name: /edit as geojson/i }).click()
    await expect(page.locator("#geojson-panel")).toBeVisible()

    // Fill the boundary textarea with a valid Polygon
    const polygon = JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [-83.66, 32.83],
          [-83.65, 32.83],
          [-83.65, 32.84],
          [-83.66, 32.84],
          [-83.66, 32.83],
        ],
      ],
    })
    await page.locator("#boundary").fill(polygon)

    // Tab out to trigger blur / react-hook-form registration
    await page.locator("#boundary").press("Tab")

    // Fill the turf name
    const turfName = `Map Sync E2E ${Date.now()}`
    await page.getByLabel(/name/i).first().fill(turfName)

    // Submit the form
    await page.getByRole("button", { name: /create turf/i }).click()

    // Wait for redirect back to canvassing page
    await page.waitForURL(/canvassing/, { timeout: 15_000 })

    // Verify the new turf appears in the listing
    await expect(page.getByText(turfName)).toBeVisible({ timeout: 10_000 })
  })
})
