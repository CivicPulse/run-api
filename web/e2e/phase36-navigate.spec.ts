import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_FIELD_ME = {
  canvassing: {
    walk_list_id: "wl1",
    walk_list_name: "Test Walk List",
    total: 2,
    completed: 0,
  },
  phone_banking: null,
}

const MOCK_WALK_LIST_DETAIL = {
  id: "wl1",
  name: "Test Walk List",
  campaign_id: CAMPAIGN_ID,
  script_id: "script1",
  total_entries: 2,
  completed_entries: 0,
}

const MOCK_SURVEY_SCRIPT = {
  id: "script1",
  name: "Test Survey",
  questions: [],
}

const MOCK_WALK_LIST_ENTRIES = [
  {
    id: "we1",
    voter_id: "v1",
    household_key: "123-elm-st-45501",
    sequence: 1,
    status: "pending",
    voter: {
      first_name: "Alice",
      last_name: "Smith",
      party: "DEM",
      age: 42,
      propensity_combined: 85,
      registration_line1: "123 Elm St",
      registration_line2: null,
      registration_city: "Springfield",
      registration_state: "OH",
      registration_zip: "45501",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
  {
    id: "we2",
    voter_id: "v2",
    household_key: "456-oak-ave-45502",
    sequence: 2,
    status: "pending",
    voter: {
      first_name: "Bob",
      last_name: "Jones",
      party: "REP",
      age: 55,
      propensity_combined: 60,
      registration_line1: "456 Oak Ave",
      registration_line2: null,
      registration_city: "Springfield",
      registration_state: "OH",
      registration_zip: "45502",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
]

const MOCK_NO_ADDRESS_ENTRIES = [
  {
    id: "we3",
    voter_id: "v3",
    household_key: "unknown",
    sequence: 1,
    status: "pending",
    voter: {
      first_name: "Charlie",
      last_name: "Doe",
      party: null,
      age: null,
      propensity_combined: null,
      registration_line1: null,
      registration_line2: null,
      registration_city: null,
      registration_state: null,
      registration_zip: null,
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
]

// ── Mock Setup ───────────────────────────────────────────────────────────────

async function setupMocks(page: Page, entries: typeof MOCK_WALK_LIST_ENTRIES) {
  // field/me
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  // Walk list entries (enriched) — register BEFORE walk list detail
  await page.route(`**/walk-lists/wl1/entries/enriched`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(entries),
    })
  })

  // Walk list detail
  await page.route(`**/walk-lists/wl1`, (route) => {
    const url = route.request().url()
    if (url.endsWith("/wl1") || url.endsWith("/wl1/")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_WALK_LIST_DETAIL),
      })
    } else {
      route.fallback()
    }
  })

  // Survey script
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/script1`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SURVEY_SCRIPT),
      })
    },
  )

  // Record door knock
  await page.route(`**/walk-lists/wl1/door-knocks`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "dk1" }),
    })
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.setTimeout(30_000)

test.describe("Phase 36: Google Maps Navigation Links", () => {
  test("P36-01: HouseholdCard shows Navigate button instead of tappable address", async ({
    page,
  }) => {
    await setupMocks(page, MOCK_WALK_LIST_ENTRIES)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for the household card to render (use role link for Navigate button)
    await expect(
      page.getByRole("link", { name: /navigate to/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Old "Tap address to navigate" hint is gone
    await expect(
      page.getByText("Tap address to navigate"),
    ).toHaveCount(0)

    // Address text is visible as plain text in the span
    const addressText = page.locator("span.text-lg.font-semibold", {
      hasText: "123 Elm St, Springfield, OH, 45501",
    })
    await expect(addressText).toBeVisible()
  })

  test("P36-02: Navigate button links to Google Maps with travelmode=walking", async ({
    page,
  }) => {
    await setupMocks(page, MOCK_WALK_LIST_ENTRIES)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for card to render
    const navLink = page.getByRole("link", { name: /navigate to 123 elm st/i })
    await expect(navLink).toBeVisible({ timeout: 10_000 })

    // Check href attributes
    const href = await navLink.getAttribute("href")
    expect(href).toContain("google.com/maps/dir/")
    expect(href).toContain("travelmode=walking")
    expect(href).toContain("destination=")

    // Opens in new tab
    const target = await navLink.getAttribute("target")
    expect(target).toBe("_blank")
  })

  test("P36-03: Navigate button disabled when no address", async ({
    page,
  }) => {
    await setupMocks(page, MOCK_NO_ADDRESS_ENTRIES)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for the card to render (voter name as proxy)
    await expect(
      page.getByText("Charlie Doe"),
    ).toBeVisible({ timeout: 10_000 })

    // The button should be disabled (not a link since disabled)
    const btn = page.getByRole("button", { name: /navigate to address/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeDisabled()
  })

  test("P36-04: DoorListView rows have map icon button", async ({
    page,
  }) => {
    await setupMocks(page, MOCK_WALK_LIST_ENTRIES)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for card to render
    await expect(
      page.getByRole("link", { name: /navigate to/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Open the DoorListView sheet
    await page.getByRole("button", { name: /all doors/i }).click()

    // MapPin navigation links should be visible
    const mapLinks = page.locator('a[aria-label^="Navigate to"]')
    // The sheet should have one link per household
    await expect(mapLinks.first()).toBeVisible({ timeout: 5_000 })
    const count = await mapLinks.count()
    expect(count).toBeGreaterThanOrEqual(2) // 2 households

    // Each link should point to Google Maps with walking mode
    for (let i = 0; i < count; i++) {
      const href = await mapLinks.nth(i).getAttribute("href")
      if (href && href.includes("google.com")) {
        expect(href).toContain("google.com/maps/dir/")
        expect(href).toContain("travelmode=walking")
      }
    }
  })

  test("DoorListView map icon click does not trigger row jump", async ({
    page,
  }) => {
    await setupMocks(page, MOCK_WALK_LIST_ENTRIES)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for card to render
    await expect(
      page.getByRole("link", { name: /navigate to/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Confirm we are at index 0 (first household)
    const firstAddress = page.locator("span.text-lg.font-semibold", {
      hasText: "123 Elm St, Springfield, OH, 45501",
    })
    await expect(firstAddress).toBeVisible()

    // Open the DoorListView sheet
    await page.getByRole("button", { name: /all doors/i }).click()

    // Find the second household's MapPin link in the sheet
    const sheetMapLinks = page.locator(
      '[role="dialog"] a[aria-label^="Navigate to"]',
    )
    await expect(sheetMapLinks.first()).toBeVisible({ timeout: 5_000 })

    // Listen for popups (new tab) and close them immediately
    page.on("popup", async (popup) => {
      await popup.close()
    })

    // Click the second household's map icon
    const secondLink = sheetMapLinks.nth(1)
    await secondLink.click()

    // The sheet should still be open (row jump would close it)
    // and the first household should still be displayed
    // Wait briefly to ensure no navigation occurred
    await page.waitForTimeout(500)

    // After closing sheet, first address should still be the active card
    // (If row jump happened, it would have jumped to the second household)
    await page.keyboard.press("Escape")
    await expect(firstAddress).toBeVisible()
  })
})
