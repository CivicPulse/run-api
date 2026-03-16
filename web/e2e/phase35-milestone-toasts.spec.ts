import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_FIELD_ME_CANVASSING = {
  canvassing: {
    walk_list_id: "wl1",
    walk_list_name: "Test Walk List",
    total: 1,
    completed: 0,
  },
  phone_banking: null,
}

const MOCK_FIELD_ME_PHONE = {
  canvassing: null,
  phone_banking: {
    session_id: "s1",
    name: "Test Session",
    total: 1,
    completed: 0,
  },
}

// Single-entry walk list — one outcome recording = 100% = 100% milestone toast
const MOCK_WALK_LIST_ENTRIES_SINGLE = [
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

// Single-entry call list — one outcome = 100%
const MOCK_CALL_LIST_SINGLE = [
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
      body: JSON.stringify(MOCK_FIELD_ME_CANVASSING),
    })
  })

  await page.route(`**/walk-lists/wl1/entries/enriched`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WALK_LIST_ENTRIES_SINGLE),
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
      body: JSON.stringify(MOCK_FIELD_ME_PHONE),
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
      body: JSON.stringify(MOCK_CALL_LIST_SINGLE),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "v1", first_name: "Alice", last_name: "Smith", party: "DEM", age: 42, propensity_combined: 85 }),
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

// ── Tests: POLISH-01 — Milestone Celebration Toasts ──────────────────────────

test.setTimeout(30_000)

test.describe("POLISH-01: milestone celebration toasts", () => {
  test("canvassing route fires first milestone toast when completion crosses 25%", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for outcome buttons to be visible (data loaded)
    await expect(
      page.getByRole("button", { name: /Record Supporter for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Start a promise that listens for the toast BEFORE clicking, so we don't miss it
    const toastPromise = page.waitForSelector('[data-sonner-toast]', { timeout: 5_000 })

    // Record "Not Home" outcome — non-contact outcome auto-advances without survey
    // checkMilestone fires thresholds one-at-a-time from 25→50→75→100; first unfired is 25%
    const notHomeButton = page.getByRole("button", { name: /Record Not Home for Alice Smith/i })
    await notHomeButton.click()

    // Sonner renders each toast as [data-sonner-toast] element containing the message
    const toastEl = await toastPromise
    const toastText = await toastEl.textContent()
    // At 100% completion, the first unfired threshold (25%) fires with party popper emoji
    expect(toastText).toContain("25% done.")
  })

  test("canvassing milestone sessionStorage is populated after completing all entries", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await expect(
      page.getByRole("button", { name: /Record Not Home for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /Record Not Home for Alice Smith/i }).click()

    // Wait for completion screen to confirm the outcome was recorded
    await expect(page.getByRole("heading", { name: "Great work!" })).toBeVisible({ timeout: 5_000 })

    // The milestone utility writes to sessionStorage — verify key exists with at least threshold 25
    const milestones = await page.evaluate(() =>
      sessionStorage.getItem("milestones-fired-canvassing-wl1"),
    )
    expect(milestones).not.toBeNull()
    const fired = JSON.parse(milestones!)
    expect(fired).toContain(25)

    // Toast duration is 3s — wait 4s and verify milestone toast is gone
    await page.waitForTimeout(4_000)
    const toastMessage = page.getByText("25% done.")
    await expect(toastMessage).not.toBeVisible()
  })

  test("canvassing milestone does not re-fire if sessionStorage already has the threshold", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Pre-populate sessionStorage to simulate already fired
    await page.evaluate(() => {
      sessionStorage.setItem("milestones-fired-canvassing-wl1", JSON.stringify([25, 50, 75, 100]))
    })

    await expect(
      page.getByRole("button", { name: /Record Not Home for Alice Smith/i }),
    ).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /Record Not Home for Alice Smith/i }).click()

    // No toast should fire since all thresholds were pre-fired
    const toastMessage = page.getByText("All done! Amazing work.")
    await expect(toastMessage).not.toBeVisible({ timeout: 3_000 })
  })

  test("phone banking route fires first milestone toast when completion crosses 25%", async ({ page }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)

    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Start listener before clicking so we don't miss a fast-appearing toast
    const toastPromise = page.waitForSelector('[data-sonner-toast]', { timeout: 5_000 })

    // Click an outcome button — with 1 entry hitting 100%, the first unfired threshold (25%) fires
    const answeredButton = page.getByRole("button", { name: /Answered/i }).first()
    await expect(answeredButton).toBeVisible({ timeout: 5_000 })
    await answeredButton.click()

    // Sonner renders each toast as [data-sonner-toast]; verify it contains the 25% message
    const toastEl = await toastPromise
    const toastText = await toastEl.textContent()
    expect(toastText).toContain("25% done.")
  })
})
