import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"

// ── Mock Data (reused from phase35-touch-targets.spec.ts) ─────────────────────

const MOCK_FIELD_ME = {
  canvassing: {
    walk_list_id: "wl1",
    walk_list_name: "Test Walk List",
    total: 3,
    completed: 0,
  },
  phone_banking: {
    session_id: "s1",
    name: "Test Session",
    total: 3,
    completed: 0,
  },
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
    household_key: "123-elm-st-45501",
    sequence: 2,
    status: "pending",
    voter: {
      first_name: "Bob",
      last_name: "Johnson",
      party: "REP",
      age: 55,
      propensity_combined: 45,
      registration_line1: "123 Elm St",
      registration_line2: null,
      registration_city: "Springfield",
      registration_state: "OH",
      registration_zip: "45501",
    },
    prior_interactions: { attempt_count: 1, last_result: "not_home", last_date: "2026-03-10" },
  },
  {
    id: "we3",
    voter_id: "v3",
    household_key: "456-oak-ave-45502",
    sequence: 3,
    status: "pending",
    voter: {
      first_name: "Carol",
      last_name: "Davis",
      party: "IND",
      age: 35,
      propensity_combined: 20,
      registration_line1: "456 Oak Ave",
      registration_line2: null,
      registration_city: "Springfield",
      registration_state: "OH",
      registration_zip: "45502",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  },
]

const MOCK_WALK_LIST_DETAIL = {
  id: "wl1",
  name: "Test Walk List",
  campaign_id: CAMPAIGN_ID,
  script_id: "script1",
  total_entries: 3,
  completed_entries: 0,
}

const MOCK_SURVEY_SCRIPT = {
  id: "script1",
  name: "Test Survey",
  questions: [
    {
      id: "q1",
      question_text: "How likely are you to vote?",
      question_type: "scale",
      options: { min: 1, max: 5 },
      position: 1,
      required: false,
    },
  ],
}

const MOCK_CALL_LIST_ENTRIES = [
  {
    id: "e1",
    voter_id: "v1",
    voter_name: "Alice Smith",
    phone_numbers: [
      { phone_id: "ph1", value: "+15551234567", type: "cell", is_primary: true },
    ],
    phone_attempts: null,
    attempt_count: 0,
    priority_score: 100,
  },
]

// ── Mock Setup ────────────────────────────────────────────────────────────────

async function setupCanvassingMocks(page: Page) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  await page.route(`**/walk-lists/wl1/entries/enriched`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WALK_LIST_ENTRIES),
    })
  })

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

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/script1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SURVEY_SCRIPT),
    })
  })

  await page.route(`**/walk-lists/wl1/door-knocks`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "dk1" }),
    })
  })
}

async function setupPhoneBankingMocks(page: Page) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "s1",
          call_list_id: "cl1",
          name: "Test Session",
          status: "active",
        }),
      })
    } else {
      route.fallback()
    }
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/call-lists/cl1`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "cl1", name: "Test Call List", script_id: "script1" }),
      })
    } else {
      route.fallback()
    }
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/check-in`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "caller1" }),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/call-lists/cl1/claim`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CALL_LIST_ENTRIES),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "v1", first_name: "Alice", last_name: "Smith", party: "DEM", age: 42, propensity_combined: 85 }),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/script1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SURVEY_SCRIPT),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/calls`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "call1" }),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/entries/*/self-release`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/check-out`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  })
}

// ── Tests: A11Y-01 — ARIA Landmarks and Screen Reader Labels ─────────────────

test.setTimeout(30_000)

test.describe("A11Y-01: ARIA landmarks and screen reader labels", () => {
  test("canvassing route has Field navigation nav landmark", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // FieldHeader wraps header in <nav aria-label="Field navigation">
    // The page may render multiple nav landmarks (layout + sub-route); assert at least one exists
    const navLandmark = page.locator('nav[aria-label="Field navigation"]').first()
    await expect(navLandmark).toBeVisible()
  })

  test("canvassing route has main content area with aria-label", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // $campaignId.tsx: <main aria-label="Field mode content">
    const mainLandmark = page.locator('main[aria-label="Field mode content"]')
    await expect(mainLandmark).toBeVisible()
  })

  test("canvassing OutcomeGrid buttons include voter name in aria-label", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for the outcome grid with voter-name-aware labels
    // Alice Smith is the first voter — buttons should say "Record Supporter for Alice Smith"
    const supporterButton = page.getByRole("button", { name: /Record Supporter for Alice Smith/i })
    await expect(supporterButton).toBeVisible({ timeout: 10_000 })
  })

  test("canvassing DoorListView buttons have descriptive aria-labels with door number, address, status", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Dismiss driver.js tour overlay if it appears (auto-starts after 200ms)
    const tourDialog = page.getByRole("dialog")
    if (await tourDialog.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await tourDialog.getByRole("button", { name: "Close" }).click()
      // Wait for the overlay to fully disappear
      await expect(page.locator(".driver-active")).toBeHidden({ timeout: 2_000 })
    }

    // Open the door list via the "All Doors" button
    const listButton = page.getByRole("button", { name: /All Doors/i })
    await listButton.click()

    // DoorListView renders buttons with aria-label="Jump to door N, address, status"
    const door1Button = page.locator('button[aria-label*="Jump to door 1"]')
    await expect(door1Button).toBeVisible({ timeout: 5_000 })

    // Verify label includes address
    const label = await door1Button.getAttribute("aria-label")
    expect(label).toContain("123 Elm St")
    expect(label).toContain("Pending")
  })

  test("phone-banking route has Field navigation nav landmark", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Phone banking custom header is also wrapped in <nav aria-label="Field navigation">
    // The page renders multiple nav landmarks (layout header + in-route header); assert at least one exists
    const navLandmark = page.locator('nav[aria-label="Field navigation"]').first()
    await expect(navLandmark).toBeVisible()
  })

  test("phone-banking OutcomeGrid buttons include voter name in aria-label", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // OutcomeGrid in phone banking passes voterName from currentEntry.voter_name
    const answeredButton = page.getByRole("button", { name: /for Alice Smith/i })
    await expect(answeredButton.first()).toBeVisible({ timeout: 5_000 })
  })
})

// ── Tests: A11Y-03 — WCAG AA Color Contrast ──────────────────────────────────

test.describe("A11Y-03: WCAG AA contrast — propensity badge text colors", () => {
  test("high propensity voter badge uses semantic success token (text-status-success-foreground)", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Alice Smith has propensity_combined: 85 → getPropensityDisplay returns
    // bg-status-success text-status-success-foreground (AA-compliant semantic tokens)
    const successBadge = page.locator(".text-status-success-foreground").first()
    await expect(successBadge).toBeVisible()

    // Ensure the old non-AA Tailwind color class is NOT present
    const badBadge = page.locator(".text-green-700")
    await expect(badBadge).toHaveCount(0)
  })

  test("medium propensity voter badge uses semantic warning token (text-status-warning-foreground)", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Bob Johnson (we2) has propensity_combined: 45 → getPropensityDisplay returns
    // bg-status-warning text-status-warning-foreground (AA-compliant semantic tokens)
    // Both voters at 123 Elm St are rendered in the same household card
    const warningBadge = page.locator(".text-status-warning-foreground").first()
    await expect(warningBadge).toBeVisible()

    // Ensure old Tailwind color class is gone
    const badBadge = page.locator(".text-yellow-700")
    await expect(badBadge).toHaveCount(0)
  })

  test("low propensity voter badge uses semantic error token (text-status-error-foreground)", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Carol Davis (we3) has propensity_combined: 20 → getPropensityDisplay returns
    // bg-status-error text-status-error-foreground (AA-compliant semantic tokens)
    // She's the second household; navigate to see her
    const skipButton = page.getByRole("button", { name: /skip/i }).first()
    if (await skipButton.isVisible()) {
      await skipButton.click()
    }

    // After advancing, Carol Davis card should appear with error badge
    const errorBadge = page.locator(".text-status-error-foreground").first()
    await expect(errorBadge).toBeVisible({ timeout: 5_000 })

    const badBadge = page.locator(".text-red-700")
    await expect(badBadge).toHaveCount(0)
  })
})
