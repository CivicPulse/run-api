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
]

const MOCK_WALK_LIST_DETAIL = {
  id: "wl1",
  name: "Test Walk List",
  campaign_id: CAMPAIGN_ID,
  script_id: null,
  total_entries: 1,
  completed_entries: 0,
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
        body: JSON.stringify({ id: "s1", call_list_id: "cl1", name: "Test Session", status: "active" }),
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
        body: JSON.stringify({ id: "cl1", name: "Test Call List", script_id: null }),
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

  // Voter detail (for CallingVoterCard)
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "v1",
        first_name: "Alice",
        last_name: "Smith",
        party: "DEM",
        age: 42,
        propensity_combined: 85,
      }),
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

// ── Tests: POLISH-02 — Voter Context Cards ────────────────────────────────────

test.setTimeout(30_000)

test.describe("POLISH-02: voter context cards show name, party, age, and propensity", () => {
  test("VoterCard in canvassing shows voter name", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // VoterCard renders voter name as text
    await expect(page.getByText("Alice Smith")).toBeVisible()
  })

  test("VoterCard in canvassing shows party badge", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Party badge rendered inside VoterCard
    await expect(page.getByText("DEM")).toBeVisible()
  })

  test("VoterCard in canvassing shows voter age", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Age rendered as "Age 42"
    await expect(page.getByText("Age 42")).toBeVisible()
  })

  test("VoterCard in canvassing shows propensity badge", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
    await expect(page.getByRole("button", { name: /Record Supporter/i })).toBeVisible({ timeout: 10_000 })

    // Propensity badge: score 85 → label "85%"
    await expect(page.getByText("85%")).toBeVisible()
  })

  test("CallingVoterCard in phone banking shows voter name", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })
  })

  test("CallingVoterCard in phone banking shows party badge after voter data loads", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Party badge rendered after voter fetch completes
    await expect(page.getByText("DEM")).toBeVisible({ timeout: 5_000 })
  })

  test("CallingVoterCard in phone banking shows voter age after voter data loads", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Age rendered after voter fetch completes
    await expect(page.getByText("Age 42")).toBeVisible({ timeout: 5_000 })
  })

  test("CallingVoterCard in phone banking shows propensity badge after voter data loads", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Propensity badge rendered after voter fetch — score 85 → "85%"
    await expect(page.getByText("85%")).toBeVisible({ timeout: 5_000 })
  })
})

// ── Tests: POLISH-03 — Canvassing Completion Summary ─────────────────────────

test.describe("POLISH-03: CanvassingCompletionSummary shows stats and Back to Hub link", () => {
  test("completion summary renders after all walk list entries are completed", async ({ page }) => {
    // Single entry mock: record one outcome to complete the walk list
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for outcome buttons
    await expect(
      page.getByRole("button", { name: /Record Not Home for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Record outcome — auto-advances without survey (not_home is non-contact)
    await page.getByRole("button", { name: /Record Not Home for Alice Smith/i }).click()

    // CanvassingCompletionSummary should render with "Great work!" heading
    await expect(page.getByRole("heading", { name: "Great work!" })).toBeVisible({ timeout: 5_000 })
  })

  test("completion summary shows 'You completed your walk list.' body text", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await expect(
      page.getByRole("button", { name: /Record Not Home for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /Record Not Home for Alice Smith/i }).click()

    await expect(page.getByText("You completed your walk list.")).toBeVisible({ timeout: 5_000 })
  })

  test("completion summary shows totalDoors stat", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await expect(
      page.getByRole("button", { name: /Record Not Home for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /Record Not Home for Alice Smith/i }).click()

    // "Doors visited: 1" (1 address in the mock walk list)
    await expect(page.getByText(/Doors visited:/)).toBeVisible({ timeout: 5_000 })
  })

  test("completion summary includes Back to Hub link navigating to field hub", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await expect(
      page.getByRole("button", { name: /Record Not Home for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /Record Not Home for Alice Smith/i }).click()

    // Wait for completion summary card to appear
    await expect(page.getByRole("heading", { name: "Great work!" })).toBeVisible({ timeout: 5_000 })

    // "Back to Hub" button is inside the completion card — scope to the card to avoid strict mode
    // violations from the FieldHeader back-arrow link which also navigates to /field/$campaignId
    const completionCard = page.locator('.text-center.max-w-sm')
    const backLink = completionCard.getByText("Back to Hub")
    await expect(backLink).toBeVisible()

    const href = await backLink.getAttribute("href")
    expect(href).toContain(`/field/${CAMPAIGN_ID}`)
  })
})
