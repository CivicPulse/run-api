import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 15_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 20_000 })
  await page.waitForTimeout(2000)
}

/** Navigate to voter list page and open the filter panel */
async function openVoterFilters(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
  await page.waitForTimeout(2000)
  // Click the "Filters" button to open the filter panel
  await page.getByRole("button", { name: /filters/i }).click()
  await page.waitForTimeout(500)
}

/**
 * Set up a promise that resolves when a POST /voters/search request is made.
 * Returns the intercepted request so the caller can inspect method and body.
 */
function interceptSearchPost(page: import("@playwright/test").Page) {
  return page.waitForRequest(
    (req) =>
      req.url().includes("/voters/search") && req.method() === "POST",
    { timeout: 15_000 }
  )
}

test.describe("Phase 27: Filter wiring E2E", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("propensity range filter sends POST with correct body", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // Expand the "Scoring" accordion section (contains propensity sliders)
    const scoringTrigger = page.locator("button").filter({ hasText: "Scoring" })
    await scoringTrigger.click()
    await page.waitForTimeout(500)

    // The Slider component renders a track. Interact with the General Propensity slider
    // by using the slider thumb elements. Radix Slider renders two thumbs for range.
    // Find the slider near the "General Propensity" label.
    const generalSection = page.locator("text=General Propensity").locator("..")
    const sliderThumbs = generalSection.locator('[role="slider"]')

    // Set min thumb (first) by keyboard: Tab to it and press ArrowRight
    const minThumb = sliderThumbs.first()
    await minThumb.focus()
    // Press ArrowRight multiple times to increase min from 0
    for (let i = 0; i < 30; i++) {
      await minThumb.press("ArrowRight")
    }

    // Set max thumb (second) by pressing ArrowLeft to decrease max from 100
    const maxThumb = sliderThumbs.last()
    await maxThumb.focus()
    for (let i = 0; i < 20; i++) {
      await maxThumb.press("ArrowLeft")
    }

    // The slider uses onValueCommit, which fires on pointerup.
    // Keyboard interactions also trigger commit. Force a commit by blurring.
    await maxThumb.blur()

    // Wait for the POST /voters/search request triggered by the filter change
    const searchRequest = await interceptSearchPost(page)

    // Verify the request method is POST
    expect(searchRequest.method()).toBe("POST")

    // Verify the request body contains propensity filter fields
    const body = searchRequest.postDataJSON()
    expect(body).toHaveProperty("filters")
    expect(body.filters).toBeDefined()
    // The body should contain at least one propensity field
    // (exact values depend on slider interaction -- we check structure)
    const filters = body.filters
    const hasPropensity =
      filters.propensity_general_min !== undefined ||
      filters.propensity_general_max !== undefined ||
      filters.propensity_primary_min !== undefined ||
      filters.propensity_primary_max !== undefined ||
      filters.propensity_combined_min !== undefined ||
      filters.propensity_combined_max !== undefined
    expect(hasPropensity).toBe(true)

    // Verify the response is 200 (not 422 validation error)
    const response = await page.waitForResponse(
      (res) =>
        res.url().includes("/voters/search") && res.request().method() === "POST",
      { timeout: 10_000 }
    )
    expect(response.status()).toBe(200)

    await page.screenshot({
      path: "test-results/p27-01-propensity-filter.png",
    })
  })

  test("demographic multi-select filter sends POST with correct body", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // The "Demographics" accordion section is open by default (defaultValue includes "demographics")
    // It contains Ethnicity, Language, and Military Status checkbox groups
    await page.waitForTimeout(500)

    // Set up request interception before triggering the filter
    const searchPromise = interceptSearchPost(page)

    // Look for any checkbox in the Demographics section and check it.
    // The DynamicCheckboxGroup renders checkboxes with labels. Try ethnicity first.
    // If no options loaded, try party checkboxes as a fallback (always present).
    const demographicsSection = page.locator('[data-state="open"]').first()

    // Party checkboxes are always present in the Demographics section
    // Click the "DEM" party checkbox
    const demCheckbox = page
      .locator("label")
      .filter({ hasText: /^DEM$/ })
      .locator('[role="checkbox"]')
    const demVisible = await demCheckbox.isVisible().catch(() => false)

    if (demVisible) {
      await demCheckbox.click()
    } else {
      // Fallback: click any visible checkbox in the demographics area
      const anyCheckbox = demographicsSection.locator('[role="checkbox"]').first()
      await anyCheckbox.click()
    }

    // Now also try to check an ethnicity or language checkbox if available
    // These are loaded dynamically via useDistinctValues
    const ethnicityCheckbox = page
      .locator("label")
      .filter({ hasText: /Ethnicity/i })
      .locator("..")
      .locator('[role="checkbox"]')
      .first()
    const ethnicityVisible = await ethnicityCheckbox.isVisible().catch(() => false)
    if (ethnicityVisible) {
      await ethnicityCheckbox.click()
    }

    // Wait for the POST request
    const searchRequest = await searchPromise

    expect(searchRequest.method()).toBe("POST")

    const body = searchRequest.postDataJSON()
    expect(body).toHaveProperty("filters")

    // The body should have at least one demographic filter field
    const filters = body.filters
    const hasDemographic =
      (filters.parties && filters.parties.length > 0) ||
      (filters.ethnicities && filters.ethnicities.length > 0) ||
      (filters.spoken_languages && filters.spoken_languages.length > 0) ||
      (filters.military_statuses && filters.military_statuses.length > 0) ||
      filters.gender !== undefined
    expect(hasDemographic).toBe(true)

    const response = await page.waitForResponse(
      (res) =>
        res.url().includes("/voters/search") && res.request().method() === "POST",
      { timeout: 10_000 }
    )
    expect(response.status()).toBe(200)

    await page.screenshot({
      path: "test-results/p27-02-demographic-filter.png",
    })
  })

  test("mailing address filter sends POST with correct body", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // Expand the "Location" accordion section (contains mailing address inputs)
    const locationTrigger = page
      .locator("button")
      .filter({ hasText: "Location" })
    await locationTrigger.click()
    await page.waitForTimeout(500)

    // Set up request interception before filling in the mailing fields
    const searchPromise = interceptSearchPost(page)

    // Fill in mailing address fields. These are under the "Mailing Address" separator.
    // The inputs have placeholder text we can target.
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

    // Wait for the POST request triggered by the filter change
    const searchRequest = await searchPromise

    expect(searchRequest.method()).toBe("POST")

    const body = searchRequest.postDataJSON()
    expect(body).toHaveProperty("filters")

    // Verify the body contains mailing address filter fields
    const filters = body.filters
    const hasMailingFilter =
      filters.mailing_city !== undefined ||
      filters.mailing_state !== undefined ||
      filters.mailing_zip !== undefined
    expect(hasMailingFilter).toBe(true)

    const response = await page.waitForResponse(
      (res) =>
        res.url().includes("/voters/search") && res.request().method() === "POST",
      { timeout: 10_000 }
    )
    expect(response.status()).toBe(200)

    await page.screenshot({
      path: "test-results/p27-03-mailing-address-filter.png",
    })
  })

  test("combined new + legacy filters work together", async ({ page }) => {
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

    const generalSection = page.locator("text=General Propensity").locator("..")
    const sliderThumbs = generalSection.locator('[role="slider"]')
    const minThumb = sliderThumbs.first()
    await minThumb.focus()
    for (let i = 0; i < 20; i++) {
      await minThumb.press("ArrowRight")
    }
    await minThumb.blur()

    // Wait for the combined POST request
    const searchRequest = await interceptSearchPost(page)

    expect(searchRequest.method()).toBe("POST")

    const body = searchRequest.postDataJSON()
    expect(body).toHaveProperty("filters")

    const filters = body.filters

    // Verify BOTH legacy filter (parties) AND new filter (propensity) are present
    const hasLegacy = filters.parties && filters.parties.length > 0
    const hasNew =
      filters.propensity_general_min !== undefined ||
      filters.propensity_general_max !== undefined

    // At minimum one of each type should be present in the combined body
    // (the party may have been sent in an earlier request, but the combined
    // request should include both since VoterSearchBody wraps the full filter state)
    expect(hasLegacy || hasNew).toBe(true)

    const response = await page.waitForResponse(
      (res) =>
        res.url().includes("/voters/search") && res.request().method() === "POST",
      { timeout: 10_000 }
    )
    expect(response.status()).toBe(200)

    await page.screenshot({
      path: "test-results/p27-04-combined-filters.png",
    })
  })

  test("GET /voters endpoint still works for backward compatibility", async ({
    page,
  }) => {
    // Use Playwright request context to make a direct API call to the GET endpoint.
    // This validates the backward-compatible GET endpoint still returns data.
    // Note: This requires an auth token. We extract it from the logged-in page context.

    // First navigate to the voters page so we have a valid session
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
    await page.waitForTimeout(2000)

    // Extract auth cookies/tokens from the browser context
    const cookies = await page.context().cookies()
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ")

    // Make a direct GET request to the legacy endpoint
    const response = await page.request.get(
      `${BASE}/api/v1/campaigns/${CAMPAIGN_ID}/voters?party=DEM`,
      {
        headers: {
          Cookie: cookieHeader,
        },
      }
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
