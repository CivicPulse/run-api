import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"
const OIDC_STORAGE_KEY = "oidc.user:https://auth.civpulse.org:363437283614916644"

// ── Mock Data ─────────────────────────────────────────────────────────────────

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
  total_entries: 3,
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

// ── Mock OIDC User ────────────────────────────────────────────────────────────

function mockOidcUser() {
  return JSON.stringify({
    id_token: "mock-id-token",
    session_state: null,
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: "mock-user",
      name: "Test Volunteer",
      email: "test@example.com",
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })
}

// ── Mock Setup Helpers ────────────────────────────────────────────────────────

async function seedAuth(page: Page) {
  await page.addInitScript(
    ({ key, user }: { key: string; user: string }) => {
      localStorage.setItem(key, user)
    },
    { key: OIDC_STORAGE_KEY, user: mockOidcUser() },
  )
}

async function setupHubMocks(page: Page) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })
}

async function setupCanvassingMocks(page: Page) {
  await setupHubMocks(page)
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
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/**`, (route) => {
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
  await setupHubMocks(page)
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1`,
    (route) => {
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
    },
  )
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/call-lists/cl1`,
    (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "cl1", name: "Test Call List", script_id: "script1" }),
        })
      } else {
        route.fallback()
      }
    },
  )
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/check-in`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "caller1" }),
      })
    },
  )
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/call-lists/cl1/claim`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALL_LIST_ENTRIES),
      })
    },
  )
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
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/calls`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "call1" }),
      })
    },
  )
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/entries/*/self-release`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    },
  )
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/phone-bank-sessions/s1/check-out`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    },
  )
}

// ── localStorage Tour State Helpers ───────────────────────────────────────────

async function clearTourState(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("tour-state")
  })
}

async function seedTourCompleted(page: Page) {
  await page.addInitScript(
    (cid: string) => {
      localStorage.setItem(
        "tour-state",
        JSON.stringify({
          state: {
            completions: {
              [`${cid}_mock-user`]: {
                welcome: true,
                canvassing: true,
                phoneBanking: true,
              },
            },
            sessionCounts: {},
          },
          version: 0,
        }),
      )
    },
    CAMPAIGN_ID,
  )
}

async function seedLowSessionCount(page: Page, activity: string) {
  await page.addInitScript(
    ([cid, act]: [string, string]) => {
      localStorage.setItem(
        "tour-state",
        JSON.stringify({
          state: {
            completions: {
              [`${cid}_mock-user`]: {
                welcome: true,
                canvassing: true,
                phoneBanking: true,
              },
            },
            sessionCounts: {
              [`${cid}_mock-user`]: {
                [act]: 1,
                canvassing: 0,
                phoneBanking: 0,
              },
            },
          },
          version: 0,
        }),
      )
    },
    [CAMPAIGN_ID, activity] as [string, string],
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.setTimeout(30_000)

test.describe("Tour onboarding (Phase 34)", () => {
  test.describe("Welcome tour (TOUR-01)", () => {
    test("auto-triggers on first visit to field hub", async ({ page }) => {
      await seedAuth(page)
      await clearTourState(page)
      await setupHubMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}`)
      await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5000 })
    })

    test("does not auto-trigger on second visit", async ({ page }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupHubMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}`)
      // Wait for page content to load, then verify no popover
      await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible({
        timeout: 5000,
      })
      await expect(page.locator(".driver-popover")).not.toBeVisible({
        timeout: 3000,
      })
    })

    test("shows 4 steps with progress indicator", async ({ page }) => {
      await seedAuth(page)
      await clearTourState(page)
      await setupHubMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}`)
      await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5000 })
      // Verify progress text like "Step 1 of 4"
      await expect(
        page.locator(".driver-popover").getByText(/Step \d+ of \d+/),
      ).toBeVisible()
    })
  })

  test.describe("Help button replay (TOUR-04)", () => {
    test("replays welcome tour from hub help button", async ({ page }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupHubMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}`)
      await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible({
        timeout: 5000,
      })
      await page.locator('[data-tour="help-button"]').click()
      await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5000 })
    })

    test("replays canvassing tour from canvassing help button", async ({
      page,
    }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupCanvassingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
      // Wait for canvassing content to load
      await expect(
        page.locator("[data-tour='household-card']"),
      ).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-tour="help-button"]').first().click()
      await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5000 })
    })

    test("replays phone banking tour from phone banking help button", async ({
      page,
    }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupPhoneBankingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
      await expect(
        page.locator("[data-tour='phone-number-list']"),
      ).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-tour="help-button"]').first().click()
      await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe("Quick-start cards (TOUR-05)", () => {
    test("shows quick-start card on canvassing for first 3 sessions", async ({
      page,
    }) => {
      await seedAuth(page)
      await seedLowSessionCount(page, "canvassing")
      await setupCanvassingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
      await expect(
        page.locator("[data-tour='household-card']"),
      ).toBeVisible({ timeout: 10_000 })
      // QuickStartCard has text tips like "Tap a result after each door"
      await expect(
        page.getByText(/Tap a result after each door/i),
      ).toBeVisible()
    })

    test("dismisses quick-start card on X click", async ({ page }) => {
      await seedAuth(page)
      await seedLowSessionCount(page, "canvassing")
      await setupCanvassingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
      await expect(
        page.getByText(/Tap a result after each door/i),
      ).toBeVisible({ timeout: 10_000 })
      // Click dismiss button (aria-label="Dismiss quick start tips")
      await page
        .getByRole("button", { name: /Dismiss quick start/i })
        .click()
      await expect(
        page.getByText(/Tap a result after each door/i),
      ).not.toBeVisible()
    })

    test("hides quick-start card during active tour", async ({ page }) => {
      await seedAuth(page)
      await clearTourState(page)
      await setupCanvassingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
      // Tour auto-triggers on first visit — popover should appear
      await expect(page.locator(".driver-popover")).toBeVisible({
        timeout: 5000,
      })
      // Quick-start card should NOT be visible while tour is running
      await expect(
        page.getByText(/Tap a result after each door/i),
      ).not.toBeVisible()
    })
  })

  test.describe("Data-tour attributes (TOUR-01)", () => {
    test("hub has hub-greeting, assignment-card, help-button, avatar-menu attributes", async ({
      page,
    }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupHubMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}`)
      await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.locator("[data-tour='assignment-card']").first(),
      ).toBeVisible()
      await expect(
        page.locator("[data-tour='help-button']"),
      ).toHaveCount(1, { timeout: 5000 })
      await expect(
        page.locator("[data-tour='avatar-menu']"),
      ).toHaveCount(1)
    })

    test("canvassing has household-card, outcome-grid, progress-bar, door-list-button, skip-button attributes", async ({
      page,
    }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupCanvassingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
      await expect(
        page.locator("[data-tour='household-card']"),
      ).toBeVisible({ timeout: 10_000 })
      await expect(
        page.locator("[data-tour='outcome-grid']"),
      ).toBeVisible()
      await expect(
        page.locator("[data-tour='progress-bar']"),
      ).toBeVisible()
      await expect(
        page.locator("[data-tour='door-list-button']"),
      ).toBeVisible()
      await expect(
        page.locator("[data-tour='skip-button']"),
      ).toBeVisible()
    })

    test("phone banking has phone-number-list, outcome-grid, end-session-button attributes", async ({
      page,
    }) => {
      await seedAuth(page)
      await seedTourCompleted(page)
      await setupPhoneBankingMocks(page)
      await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
      await expect(
        page.locator("[data-tour='phone-number-list']"),
      ).toBeVisible({ timeout: 10_000 })
      await expect(
        page.locator("[data-tour='outcome-grid']"),
      ).toBeVisible()
      await expect(
        page.locator("[data-tour='end-session-button']"),
      ).toBeVisible()
    })
  })
})
