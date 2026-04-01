import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"

// ── Mock Data ────────────────────────────────────────────────────────────────

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
      propensity_combined: 60,
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
      propensity_combined: 72,
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
  {
    id: "e2",
    voter_id: "v2",
    voter_name: "Bob Johnson",
    phone_numbers: [
      { phone_id: "ph2", value: "+15559876543", type: "cell", is_primary: true },
    ],
    phone_attempts: null,
    attempt_count: 0,
    priority_score: 90,
  },
  {
    id: "e3",
    voter_id: "v3",
    voter_name: "Carol Davis",
    phone_numbers: [
      { phone_id: "ph3", value: "+15553334444", type: "home", is_primary: true },
    ],
    phone_attempts: null,
    attempt_count: 1,
    priority_score: 80,
  },
]

// ── Mock Setup ───────────────────────────────────────────────────────────────

async function setupCanvassingMocks(page: Page) {
  // field/me
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  // Walk list entries (enriched)
  await page.route(
    `**/walk-lists/wl1/entries/enriched`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_WALK_LIST_ENTRIES),
      })
    },
  )

  // Walk list detail — must be registered AFTER entries/enriched so it doesn't intercept it
  await page.route(
    `**/walk-lists/wl1`,
    (route) => {
      // Only fulfill if this isn't a sub-path request (entries, door-knocks, etc.)
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
    },
  )

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
  await page.route(
    `**/walk-lists/wl1/door-knocks`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "dk1" }),
      })
    },
  )
}

async function setupPhoneBankingMocks(page: Page) {
  // field/me
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  // Session detail
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

  // Call list detail
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/call-lists/cl1`,
    (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "cl1",
            name: "Test Call List",
            script_id: "script1",
          }),
        })
      } else {
        route.fallback()
      }
    },
  )

  // Check-in
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

  // Claim entries
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

  // Record call
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

  // Self-release
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

  // Check-out
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

  // Voter detail endpoints
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

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v2`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "v2",
        first_name: "Bob",
        last_name: "Johnson",
        party: "REP",
        age: 55,
        propensity_combined: 60,
      }),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v3`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "v3",
        first_name: "Carol",
        last_name: "Davis",
        party: "IND",
        age: 35,
        propensity_combined: 72,
      }),
    })
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
}

// ── Touch Target Assertion ───────────────────────────────────────────────────

const MIN_TARGET_SIZE = 44

async function assertTouchTargets(page: Page, route: string) {
  const interactives = page.locator(
    'button, a[href], [role="button"], input, [role="tab"]',
  )
  const count = await interactives.count()
  expect(count).toBeGreaterThan(0) // Sanity: page rendered interactive elements

  const violations: string[] = []
  for (let i = 0; i < count; i++) {
    const el = interactives.nth(i)
    if (!(await el.isVisible())) continue
    const box = await el.boundingBox()
    if (!box) continue

    if (box.width < MIN_TARGET_SIZE || box.height < MIN_TARGET_SIZE) {
      // Skip sr-only elements (e.g. "Skip to main content" links) that are
      // intentionally 1x1px and only visible on focus — they expand to full
      // size via focus:not-sr-only when activated by keyboard.
      if (box.width <= 1 && box.height <= 1) continue

      const label =
        (await el.getAttribute("aria-label")) ||
        (await el.textContent()) ||
        `element-${i}`
      violations.push(
        `"${label.trim().slice(0, 50)}" is ${Math.round(box.width)}x${Math.round(box.height)}px (min ${MIN_TARGET_SIZE}x${MIN_TARGET_SIZE})`,
      )
    }
  }
  expect(violations, `Touch target violations on ${route}`).toEqual([])
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.setTimeout(30_000)

test.describe("WCAG 2.5.5 Touch Targets", () => {
  test("canvassing route: all interactive elements >= 44x44px", async ({
    page,
  }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Wait for outcome buttons to render (indicates data fully loaded)
    await expect(
      page.getByRole("button", { name: /Record Supporter/i }),
    ).toBeVisible({ timeout: 10_000 })

    await assertTouchTargets(page, "canvassing")
  })

  test("phone-banking route: all interactive elements >= 44x44px", async ({
    page,
  }) => {
    await setupPhoneBankingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)

    // Wait for voter card to render (indicates session loaded)
    // Use 30s to allow auth initialization + session setup under parallel load
    await expect(
      page.getByText("Alice Smith", { exact: true }),
    ).toBeVisible({ timeout: 30_000 })

    await assertTouchTargets(page, "phone-banking")
  })
})
