import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"

// Mock data
const MOCK_PHONE_NUMBERS = [
  { phone_id: "ph1", value: "+15551234567", type: "cell", is_primary: true },
  { phone_id: "ph2", value: "+15559876543", type: "home", is_primary: false },
]

const MOCK_ENTRIES = [
  {
    id: "e1",
    voter_id: "v1",
    voter_name: "Alice Smith",
    phone_numbers: MOCK_PHONE_NUMBERS,
    phone_attempts: null,
    attempt_count: 0,
    priority_score: 100,
  },
  {
    id: "e2",
    voter_id: "v2",
    voter_name: "Bob Johnson",
    phone_numbers: [
      { phone_id: "ph3", value: "+15553334444", type: "cell", is_primary: true },
    ],
    phone_attempts: null,
    attempt_count: 1,
    priority_score: 90,
  },
]

const MOCK_VOTER = {
  id: "v1",
  first_name: "Alice",
  last_name: "Smith",
  party: "DEM",
  age: 42,
  propensity_combined: 85,
}

const MOCK_VOTER_2 = {
  id: "v2",
  first_name: "Bob",
  last_name: "Johnson",
  party: "REP",
  age: 55,
  propensity_combined: 60,
}

/** Dismiss the driver.js onboarding tour and QuickStart card if present. */
async function dismissTourIfPresent(page: import("@playwright/test").Page) {
  // Dismiss driver.js tour overlay
  const tourClose = page.locator(".driver-popover-close-btn")
  try {
    await tourClose.waitFor({ state: "visible", timeout: 2_000 })
    await tourClose.click()
    await page.locator(".driver-active-element").waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {})
  } catch {
    // Tour not present
  }
  // Dismiss QuickStart tips card
  const quickStartClose = page.getByLabel("Dismiss quick start tips")
  try {
    await quickStartClose.waitFor({ state: "visible", timeout: 2_000 })
    await quickStartClose.click()
  } catch {
    // QuickStart not present
  }
}

async function setupMocks(
  page: import("@playwright/test").Page,
  options?: {
    emptyEntries?: boolean
    singleEntry?: boolean
    withScript?: boolean
  },
) {
  const entries = options?.emptyEntries
    ? []
    : options?.singleEntry
      ? [MOCK_ENTRIES[0]]
      : MOCK_ENTRIES

  // Mock field/me endpoint -- provides session assignment
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        phone_banking: {
          session_id: "s1",
          name: "Test Session",
          total: entries.length,
          completed: 0,
        },
        canvassing: null,
      }),
    })
  })

  // Mock session detail (GET only, fall through for other methods)
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

  // Mock call list detail (GET only, fall through for other methods)
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
            script_id: options?.withScript ? "script1" : null,
          }),
        })
      } else {
        route.fallback()
      }
    },
  )

  // Mock check-in
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

  // Mock claim entries
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/call-lists/cl1/claim`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(entries),
      })
    },
  )

  // Mock record call
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

  // Mock self-release
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

  // Mock check-out
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

  // Mock voter detail endpoints
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_VOTER),
    })
  })

  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/voters/v2`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_VOTER_2),
    })
  })

  // Mock survey script if needed
  if (options?.withScript) {
    await page.route(
      `**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/script1`,
      (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
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
            }),
          })
        }
      },
    )

    // Mock survey response submission
    await page.route(
      `**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/script1/responses`,
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{ id: "r1" }]),
        })
      },
    )
  }
}

test.setTimeout(30_000)

test.describe("Phone Banking Field Mode", () => {

  // PHONE-01: Start and stop session
  test("start and stop session with obvious controls", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)

    // Verify voter card renders (session started automatically)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify "End Session" button is visible
    const endSessionBtn = page.getByRole("button", { name: "End Session", exact: true })
    await expect(endSessionBtn).toBeVisible()

    // Click "End Session" -> AlertDialog appears
    await endSessionBtn.click()

    // Verify "Done calling?" heading
    await expect(page.getByText("Done calling?")).toBeVisible()
    await expect(
      page.getByText("Your progress is saved. You can resume later."),
    ).toBeVisible()

    // Click "Keep Calling" -> dialog closes, calling continues
    await page.getByRole("button", { name: "Keep Calling" }).click()
    await expect(page.getByText("Done calling?")).not.toBeVisible()

    // Voter card should still be visible
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible()
  })

  // PHONE-02: Tap phone number to call via tel: link
  test("tel link opens native dialer", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify tel: link exists
    const telLink = page.locator('a[href="tel:+15551234567"]')
    await expect(telLink).toBeVisible()

    // Verify phone number displays in formatted form
    await expect(page.getByText("(555) 123-4567")).toBeVisible()
  })

  // PHONE-03: Record call outcome via touch-target buttons
  test("outcome buttons are large touch targets", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify 8 outcome buttons visible
    // aria-label format: "Record {label} for {voterName}" when voterName is provided
    const outcomeLabels = [
      "Answered",
      "No Answer",
      "Busy",
      "Voicemail",
      "Wrong #",
      "Refused",
      "Deceased",
      "Disconnected",
    ]
    for (const label of outcomeLabels) {
      await expect(
        page.getByRole("button", { name: `Record ${label} for Alice Smith` }),
      ).toBeVisible()
    }

    // Verify buttons have min-h-11 (44px minimum) by checking the class
    const answeredBtn = page.getByRole("button", {
      name: "Record Answered for Alice Smith",
    })
    await expect(answeredBtn).toHaveClass(/min-h-1[1-9]/)

    // Click "No Answer" -> outcome recorded, auto-advance to next voter
    await page
      .getByRole("button", { name: /Record No Answer for/ })
      .click()

    // Should advance to Bob Johnson
    await expect(page.getByText("Bob Johnson", { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  // PHONE-04: Inline survey after Answered
  test("survey opens after Answered outcome", async ({ page }) => {
    await setupMocks(page, { withScript: true })
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Click "Answered" outcome
    await page
      .getByRole("button", { name: /Record Answered for/ })
      .click()

    // Verify InlineSurvey sheet opens with "Survey Questions" title
    await expect(
      page.getByRole("heading", { name: "Survey Questions" }),
    ).toBeVisible({ timeout: 10_000 })

    // Verify question text renders
    await expect(
      page.getByText("How likely are you to vote?"),
    ).toBeVisible()
  })

  // PHONE-05: Session progress
  test("progress shows calls completed", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify progress text — visible format is "0/2 calls"
    await expect(page.getByText(/0\/\d+ calls/)).toBeVisible()

    // Record an outcome (No Answer to auto-advance)
    await page
      .getByRole("button", { name: /Record No Answer for/ })
      .click()

    // Verify progress updates
    await expect(page.getByText(/1\/\d+ calls/)).toBeVisible({
      timeout: 5_000,
    })
  })

  // PHONE-07: Phone number formatting
  test("phone numbers formatted for display and E.164 for dialing", async ({
    page,
  }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify display shows formatted number
    await expect(page.getByText("(555) 123-4567")).toBeVisible()
    await expect(page.getByText("(555) 987-6543")).toBeVisible()

    // Verify tel: href uses E.164 format
    const telLink1 = page.locator('a[href="tel:+15551234567"]')
    await expect(telLink1).toBeVisible()
    const telLink2 = page.locator('a[href="tel:+15559876543"]')
    await expect(telLink2).toBeVisible()
  })

  // A11Y-05: Accessible without visual context
  test("accessible controls with ARIA labels", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify aria-live="polite" region exists (our sr-only announcement region)
    const liveRegion = page.locator('[aria-live="polite"][role="status"]')
    await expect(liveRegion).toBeAttached()

    // Verify outcome buttons have aria-label "Record {label} for {voterName}"
    const answeredBtn = page.getByRole("button", {
      name: /Record Answered for/,
    })
    await expect(answeredBtn).toBeVisible()

    const noAnswerBtn = page.getByRole("button", {
      name: /Record No Answer for/,
    })
    await expect(noAnswerBtn).toBeVisible()

    // Verify Call buttons have aria-label with voter name and number
    const callBtn = page.locator(
      '[aria-label="Call Alice Smith at (555) 123-4567"]',
    )
    await expect(callBtn).toBeVisible()

    // Verify Skip button has aria-label
    const skipBtn = page.locator(
      '[aria-label="Skip this voter and move to next"]',
    )
    await expect(skipBtn).toBeVisible()

    // Verify FieldProgress has role="status"
    const statusRegion = page.locator('[role="status"]')
    await expect(statusRegion.first()).toBeAttached()
  })

  // PHONE-06: Copy to clipboard (limited test)
  test("phone number has long-press copy capability", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Verify phone number elements exist and are touchable
    // The PhoneNumberList component adds onTouchStart/onTouchEnd handlers
    // for long-press copy functionality
    await expect(page.getByText("(555) 123-4567")).toBeVisible()
    await expect(page.getByText("(555) 987-6543")).toBeVisible()

    // Verify phone type labels are present
    await expect(page.getByText("Cell").first()).toBeVisible()
    await expect(page.getByText("Home").first()).toBeVisible()
  })

  // Skip button test
  test("skip releases entry and advances", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Click "Skip" button
    await page
      .getByRole("button", { name: "Skip this voter and move to next" })
      .click()

    // Verify next voter card appears
    await expect(page.getByText("Bob Johnson", { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  // Empty state test
  test("shows empty state when no voters available", async ({ page }) => {
    await setupMocks(page, { emptyEntries: true })
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)

    // Verify "No Voters to Call" heading
    await expect(page.getByText("No Voters to Call")).toBeVisible({
      timeout: 10_000,
    })

    // Verify "Back to Hub" button
    await expect(page.getByText("Back to Hub")).toBeVisible()
  })

  // Completion test -- verify CompletionSummary renders via store manipulation
  // Note: In live app, completion is reached when all claimed entries are processed
  // and no more entries are available. Mock prefetch always returns entries, so we
  // manipulate store state directly to trigger the completion screen.
  test("shows completion summary when all entries done", async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)
    await expect(page.getByText("Alice Smith", { exact: true })).toBeVisible({ timeout: 10_000 })

    // Record outcome for first entry -- auto-advances to second
    await page
      .getByRole("button", { name: /Record No Answer for/ })
      .click()
    await expect(page.getByText("Bob Johnson", { exact: true })).toBeVisible({ timeout: 5_000 })

    // Force completion state via store: set currentEntryIndex past entries length
    // This simulates completing all entries without prefetch interference
    await page.evaluate(() => {
      const storeKey = "calling-session"
      const stored = sessionStorage.getItem(storeKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Set index past entries to trigger isComplete
        parsed.state.currentEntryIndex = parsed.state.entries.length
        parsed.state.completedCalls = Object.fromEntries(
          parsed.state.entries.map((e: { id: string }) => [e.id, "no_answer"])
        )
        sessionStorage.setItem(storeKey, JSON.stringify(parsed))
        // Trigger a re-render by dispatching storage event
        window.dispatchEvent(new StorageEvent("storage", { key: storeKey }))
      }
    })

    // Small delay for React to pick up the store change
    await page.waitForTimeout(500)

    // Reload to force re-hydration from sessionStorage with completed state
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)
    await dismissTourIfPresent(page)

    // Verify completion heading — one of "Great work!", "Session complete!", "Nicely done!"
    await expect(page.getByText(/Great work!|Session complete!|Nicely done!/)).toBeVisible({ timeout: 10_000 })

    // Verify stats displayed
    await expect(page.getByText("calls completed")).toBeVisible()

    // Verify "Back to Hub" button
    await expect(page.getByText("Back to Hub")).toBeVisible()
  })
})
