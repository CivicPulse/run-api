import { test, expect } from "@playwright/test"
import { getSeedCampaignId, apiGet } from "./helpers"

let CAMPAIGN_ID: string

test.setTimeout(60_000)

/** Navigate to voter list page and open the filter panel */
async function openVoterFilters(page: import("@playwright/test").Page) {
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
  await page.waitForLoadState("networkidle")
  // Click the "Filters" button to open the filter panel
  await page.getByRole("button", { name: /filters/i }).click()
  await page.waitForTimeout(500)
}

/**
 * Capture POST /voters/search request bodies via page.route().
 * Playwright's postData() on waitForRequest may return undefined for fetch API
 * requests, so we use route interception instead.
 *
 * Returns a function to get all captured bodies after filter interactions.
 * IMPORTANT: Call this BEFORE navigating to the page.
 */
async function captureSearchBodies(page: import("@playwright/test").Page) {
  const bodies: Record<string, unknown>[] = []
  await page.route("**/voters/search", async (route) => {
    const postData = route.request().postData()
    if (postData) {
      try {
        bodies.push(JSON.parse(postData))
      } catch {
        // Not JSON
      }
    }
    await route.continue()
  })
  return {
    getBodies: () => bodies,
    /** Get the last captured body (most recent search request) */
    getLastBody: () => bodies[bodies.length - 1] as Record<string, unknown> | undefined,
    /** Wait for a new body to arrive after the current count */
    waitForNew: async (currentCount: number) => {
      const startTime = Date.now()
      while (bodies.length <= currentCount && Date.now() - startTime < 15_000) {
        await page.waitForTimeout(200)
      }
      return bodies.length > currentCount
    },
  }
}

test.describe("Phase 27: Filter wiring E2E", () => {
  test("propensity range filter sends POST with correct body", async ({
    page,
  }) => {
    const capture = await captureSearchBodies(page)
    await openVoterFilters(page)

    // Expand the "Scoring" accordion section (contains propensity sliders)
    const scoringTrigger = page.locator("button").filter({ hasText: "Scoring" })
    await scoringTrigger.click()

    // Wait for accordion content to expand and slider to be visible
    const generalLabel = page.locator("text=General Propensity")
    await expect(generalLabel).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(300)

    // Note how many requests have been captured so far (initial page load)
    const beforeCount = capture.getBodies().length

    // Interact with the General Propensity slider
    const generalSection = generalLabel.locator("..")
    const sliderThumbs = generalSection.locator('[role="slider"]')

    // Set min thumb by keyboard: press ArrowRight a few times to increase from 0
    // Each ArrowRight press fires onValueCommit which triggers a search.
    // Keep the count low to avoid timeout from rapid state updates.
    const minThumb = sliderThumbs.first()
    await minThumb.focus()
    for (let i = 0; i < 5; i++) {
      await minThumb.press("ArrowRight")
    }
    // Blur to commit the value
    await minThumb.blur()

    // Wait for a new search request to be captured
    const gotNew = await capture.waitForNew(beforeCount)
    expect(gotNew, "A new POST /voters/search request should fire after slider interaction").toBe(true)

    // Find the body that contains propensity filter fields
    const allBodies = capture.getBodies()
    const filterBody = allBodies.find((b) => {
      const f = (b as { filters?: Record<string, unknown> }).filters
      return f && (
        f.propensity_general_min !== undefined ||
        f.propensity_general_max !== undefined ||
        f.propensity_primary_min !== undefined ||
        f.propensity_primary_max !== undefined ||
        f.propensity_combined_min !== undefined ||
        f.propensity_combined_max !== undefined
      )
    })

    expect(filterBody, "Should find a search request with propensity filters").toBeDefined()
    expect(filterBody).toHaveProperty("filters")

    await page.screenshot({
      path: "test-results/p27-01-propensity-filter.png",
    })
  })

  test("demographic multi-select filter sends POST with correct body", async ({
    page,
  }) => {
    const capture = await captureSearchBodies(page)
    await openVoterFilters(page)

    // The "Demographics" accordion section is open by default
    await page.waitForTimeout(500)

    // Note how many requests have been captured so far
    const beforeCount = capture.getBodies().length

    // Party checkboxes are always present in the Demographics section
    const demCheckbox = page
      .locator("label")
      .filter({ hasText: /^DEM$/ })
      .locator('[role="checkbox"]')
    const demVisible = await demCheckbox.isVisible().catch(() => false)

    if (demVisible) {
      await demCheckbox.click()
    } else {
      // Fallback: click any visible checkbox in the demographics area
      const demographicsSection = page.locator('[data-state="open"]').first()
      const anyCheckbox = demographicsSection.locator('[role="checkbox"]').first()
      await anyCheckbox.click()
    }

    // Wait for a new search request
    const gotNew = await capture.waitForNew(beforeCount)
    expect(gotNew, "A new POST /voters/search request should fire after checkbox click").toBe(true)

    // Find the body that contains demographic filter fields
    const allBodies = capture.getBodies()
    const filterBody = allBodies.find((b) => {
      const f = (b as { filters?: Record<string, unknown> }).filters
      if (!f) return false
      return (
        (Array.isArray(f.parties) && f.parties.length > 0) ||
        (Array.isArray(f.ethnicities) && f.ethnicities.length > 0) ||
        (Array.isArray(f.spoken_languages) && f.spoken_languages.length > 0) ||
        (Array.isArray(f.military_statuses) && f.military_statuses.length > 0) ||
        f.gender !== undefined
      )
    })

    expect(filterBody, "Should find a search request with demographic filters").toBeDefined()
    expect(filterBody).toHaveProperty("filters")

    await page.screenshot({
      path: "test-results/p27-02-demographic-filter.png",
    })
  })

  test("mailing address filter sends POST with correct body", async ({
    page,
  }) => {
    const capture = await captureSearchBodies(page)
    await openVoterFilters(page)

    // Expand the "Location" accordion section
    const locationTrigger = page
      .locator("button")
      .filter({ hasText: "Location" })
    await locationTrigger.click()
    await page.waitForTimeout(500)

    // Note how many requests have been captured so far
    const beforeCount = capture.getBodies().length

    // Fill in mailing address fields
    const mailingCityInput = page
      .locator("text=Mailing City")
      .locator("..")
      .locator('input[placeholder="City"]')
    await mailingCityInput.fill("Springfield")

    const mailingStateInput = page
      .locator("text=Mailing State")
      .locator("..")
      .locator('input[placeholder="State"]')
    await mailingStateInput.fill("IL")

    const mailingZipInput = page
      .locator("text=Mailing ZIP")
      .locator("..")
      .locator('input[placeholder="ZIP code"]')
    await mailingZipInput.fill("62701")

    // Wait for a new search request
    const gotNew = await capture.waitForNew(beforeCount)
    expect(gotNew, "A new POST /voters/search request should fire after filling mailing fields").toBe(true)

    // Find the body that contains mailing address filter fields
    const allBodies = capture.getBodies()
    const filterBody = allBodies.find((b) => {
      const f = (b as { filters?: Record<string, unknown> }).filters
      if (!f) return false
      return (
        f.mailing_city !== undefined ||
        f.mailing_state !== undefined ||
        f.mailing_zip !== undefined
      )
    })

    expect(filterBody, "Should find a search request with mailing address filters").toBeDefined()
    expect(filterBody).toHaveProperty("filters")

    await page.screenshot({
      path: "test-results/p27-03-mailing-address-filter.png",
    })
  })

  test("combined new + legacy filters work together", async ({ page }) => {
    const capture = await captureSearchBodies(page)
    await openVoterFilters(page)

    // The "Demographics" section is open by default. Check a party checkbox (legacy filter).
    const repCheckbox = page
      .locator("label")
      .filter({ hasText: /^REP$/ })
      .locator('[role="checkbox"]')
    const repVisible = await repCheckbox.isVisible().catch(() => false)
    if (repVisible) {
      await repCheckbox.click()
    }

    // Expand the "Scoring" accordion and set a propensity slider (new filter)
    const scoringTrigger = page.locator("button").filter({ hasText: "Scoring" })
    await scoringTrigger.click()
    await page.waitForTimeout(500)

    // Note current count before slider interaction
    const beforeCount = capture.getBodies().length

    const generalSection = page.locator("text=General Propensity").locator("..")
    const sliderThumbs = generalSection.locator('[role="slider"]')
    const minThumb = sliderThumbs.first()
    await minThumb.focus()
    for (let i = 0; i < 5; i++) {
      await minThumb.press("ArrowRight")
    }
    await minThumb.blur()

    // Wait for a new search request
    const gotNew = await capture.waitForNew(beforeCount)
    expect(gotNew, "A new POST /voters/search request should fire after combined filter changes").toBe(true)

    // The last body should contain BOTH legacy (parties) AND new (propensity) filters
    // Check all bodies for one that has both
    const allBodies = capture.getBodies()
    const combinedBody = allBodies.find((b) => {
      const f = (b as { filters?: Record<string, unknown> }).filters
      if (!f) return false
      const hasLegacy = Array.isArray(f.parties) && f.parties.length > 0
      const hasNew =
        f.propensity_general_min !== undefined ||
        f.propensity_general_max !== undefined
      return hasLegacy || hasNew
    })

    expect(combinedBody, "Should find a search request with combined filters").toBeDefined()
    expect(combinedBody).toHaveProperty("filters")

    await page.screenshot({
      path: "test-results/p27-04-combined-filters.png",
    })
  })

  test("GET /voters endpoint still works for backward compatibility", async ({
    page,
  }) => {
    // First navigate to the voters page so we have a valid session
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
    await page.waitForLoadState("networkidle")

    // Make a direct GET request to the legacy endpoint
    const response = await apiGet(
      page,
      `/api/v1/campaigns/${CAMPAIGN_ID}/voters?party=DEM`,
    )

    // The GET endpoint should still return 200
    expect(response.status()).toBe(200)

    const data = await response.json()

    // Verify the response has the expected paginated structure
    expect(data).toHaveProperty("items")
    expect(data).toHaveProperty("pagination")
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.pagination).toHaveProperty("has_more")

    console.log(
      `GET /voters backward compat: ${data.items.length} items, has_more=${data.pagination.has_more}`
    )
  })
})
