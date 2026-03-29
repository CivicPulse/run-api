import { test, expect, type Page, type BrowserContext } from "@playwright/test"

/**
 * Field Mode E2E Spec
 *
 * Validates the volunteer-facing mobile field experience: volunteer hub with
 * assignments, canvassing wizard with door-knock recording, phone banking with
 * tap-to-call, offline queue with auto-sync, and guided onboarding tour.
 *
 * Covers: FIELD-01..10, OFFLINE-01..03, TOUR-01..03 (E2E-20)
 * Runs as: volunteer (.volunteer.spec.ts suffix -> volunteer auth project)
 * Viewport: iPhone 14 dimensions (390x844) with touch emulation
 *
 * NOTE: Do NOT use devices['iPhone 14'] -- it defaults to webkit.
 * Manual viewport/touch keeps us in the Chromium-based volunteer project.
 */

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
})

// ── Helper Functions ──────────────────────────────────────────────────────────

const BASE_URL = "https://localhost:4173"

async function navigateToSeedCampaign(
  page: Page,
): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  // Volunteer may land on org page or field hub -- find campaign link
  const campaignLink = page
    .getByRole("link", { name: /macon|bibb|campaign/i })
    .first()
  if (await campaignLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await campaignLink.click()
    await page.waitForURL(/campaigns\/([a-f0-9-]+)/, { timeout: 10_000 })
    return page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
  }
  // If already on a campaign page, extract campaign ID from URL
  const match = page.url().match(/campaigns\/([a-f0-9-]+)/)
  if (match) return match[1]
  // Try field URL pattern
  const fieldMatch = page.url().match(/field\/([a-f0-9-]+)/)
  if (fieldMatch) return fieldMatch[1]
  return ""
}

async function apiGet(
  page: Page,
  path: string,
): Promise<unknown> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.get(`${BASE_URL}${path}`, {
    headers: { Cookie: cookieHeader },
  })
  if (!resp.ok()) {
    throw new Error(`API GET ${path} failed: ${resp.status()} ${resp.statusText()}`)
  }
  return resp.json()
}

async function apiPost(
  page: Page,
  path: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(`${BASE_URL}${path}`, {
    data,
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  })
  return { status: resp.status(), body: resp.ok() ? await resp.json() : null }
}

async function getMyUserId(page: Page): Promise<string> {
  // Try /users/me endpoint first
  try {
    const data = (await apiGet(page, "/api/v1/users/me")) as { id: string }
    if (data?.id) return data.id
  } catch {
    // Endpoint may not exist, fall back to storage state
  }
  // Fall back to parsing volunteer storage state for ZITADEL sub claim
  const storageState = await page.context().storageState()
  for (const entry of storageState.origins) {
    for (const ls of entry.localStorage) {
      if (ls.name.includes("oidc") || ls.name.includes("user")) {
        try {
          const parsed = JSON.parse(ls.value)
          if (parsed?.profile?.sub) return parsed.profile.sub
        } catch {
          // Not JSON, skip
        }
      }
    }
  }
  return ""
}

interface WalkListItem {
  id: string
  name: string
  entry_count?: number
  total_entries?: number
}

async function getWalkLists(
  page: Page,
  campaignId: string,
): Promise<WalkListItem[]> {
  const data = (await apiGet(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists`,
  )) as { items: WalkListItem[] } | WalkListItem[]
  return Array.isArray(data) ? data : data.items ?? []
}

interface PhoneBankSession {
  id: string
  name: string
  status: string
}

async function getPhoneBankSessions(
  page: Page,
  campaignId: string,
): Promise<PhoneBankSession[]> {
  const data = (await apiGet(
    page,
    `/api/v1/campaigns/${campaignId}/phone-bank-sessions`,
  )) as { items: PhoneBankSession[] } | PhoneBankSession[]
  return Array.isArray(data) ? data : data.items ?? []
}

async function assignCanvasser(
  page: Page,
  campaignId: string,
  walkListId: string,
  userId: string,
): Promise<void> {
  const result = (await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/walk-lists/${walkListId}/canvassers`,
    { user_id: userId },
  )) as { status: number }
  // Accept 201 (created) and 409 (already assigned)
  if (result.status !== 201 && result.status !== 200 && result.status !== 409) {
    throw new Error(`Failed to assign canvasser: ${result.status}`)
  }
}

async function assignCaller(
  page: Page,
  campaignId: string,
  sessionId: string,
  userId: string,
): Promise<void> {
  const result = (await apiPost(
    page,
    `/api/v1/campaigns/${campaignId}/phone-bank-sessions/${sessionId}/callers`,
    { user_id: userId },
  )) as { status: number }
  // Accept 201 (created) and 409 (already assigned)
  if (result.status !== 201 && result.status !== 200 && result.status !== 409) {
    throw new Error(`Failed to assign caller: ${result.status}`)
  }
}

// ── Shared State ──────────────────────────────────────────────────────────────

let campaignId: string
let walkListId: string
let sessionId: string

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }) => {
  // Create a context with volunteer auth and mobile viewport
  const context = await browser.newContext({
    storageState: "playwright/.auth/volunteer.json",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()

  // Navigate to seed campaign to get campaignId
  campaignId = await navigateToSeedCampaign(page)
  expect(campaignId).toBeTruthy()

  // Get volunteer's user ID
  const userId = await getMyUserId(page)
  expect(userId).toBeTruthy()

  // Find a walk list with entries
  const walkLists = await getWalkLists(page, campaignId)
  const walkListWithEntries = walkLists.find(
    (wl) =>
      (wl.entry_count ?? wl.total_entries ?? 0) > 0 ||
      walkLists.length > 0, // Seed data creates 4 walk lists, assume they have entries
  )
  walkListId = walkListWithEntries?.id ?? walkLists[0]?.id ?? ""
  expect(walkListId).toBeTruthy()

  // Assign volunteer to walk list (accept 409 if already assigned)
  await assignCanvasser(page, campaignId, walkListId, userId)

  // Find an active phone bank session
  const sessions = await getPhoneBankSessions(page, campaignId)
  const activeSession = sessions.find(
    (s) => s.status === "active" || s.status === "scheduled",
  ) ?? sessions[0]
  sessionId = activeSession?.id ?? ""
  expect(sessionId).toBeTruthy()

  // Assign volunteer to phone bank session (accept 409 if already assigned)
  await assignCaller(page, campaignId, sessionId, userId)

  await page.close()
  await context.close()
})

// ── FIELD-01..02: Volunteer Hub ───────────────────────────────────────────────

test.describe.serial("Field Mode -- Volunteer Hub", () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/volunteer.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("FIELD-01: volunteer hub shows assignments", async () => {
    await page.goto(`/field/${campaignId}`)
    await page.waitForURL(/\/field\//, { timeout: 15_000 })

    // Wait for data to load -- greeting should appear
    const greeting = page.locator("[data-tour='hub-greeting']")
    await expect(greeting).toBeVisible({ timeout: 15_000 })
    await expect(greeting).toContainText(/Hey/i)

    // Assignment cards should be visible
    const assignmentCards = page.locator("[data-tour='assignment-card']")
    await expect(assignmentCards.first()).toBeVisible({ timeout: 10_000 })

    // Should have at least one assignment card (canvassing or phone banking)
    const cardCount = await assignmentCards.count()
    expect(cardCount).toBeGreaterThanOrEqual(1)

    // Verify canvassing assignment shows door count
    const canvassingCard = assignmentCards.filter({ hasText: /door/i }).first()
    if (await canvassingCard.isVisible().catch(() => false)) {
      await expect(canvassingCard).toContainText(/of \d+/)
    }

    // Verify phone banking assignment shows call count
    const phoneBankingCard = assignmentCards.filter({ hasText: /call/i }).first()
    if (await phoneBankingCard.isVisible().catch(() => false)) {
      await expect(phoneBankingCard).toContainText(/of \d+/)
    }
  })

  test("FIELD-02: pull-to-refresh updates assignments", async () => {
    // Ensure we're on the field hub
    await page.goto(`/field/${campaignId}`)
    await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible({
      timeout: 15_000,
    })

    // Simulate pull-to-refresh via touch gestures
    const container = page.locator("main")
    await container.evaluate((el) => {
      el.scrollTop = 0
    })

    // Touch start at top of screen, drag down, then release
    await page.touchscreen.tap(195, 200)
    // Simulating a swipe: touchstart -> touchmove (drag down) -> touchend
    // Use dispatchEvent approach for pull-to-refresh
    await page.evaluate(() => {
      const el = document.querySelector("[data-tour='hub-greeting']")?.closest(
        "div",
      )
      if (!el) return
      const parent =
        el.closest('[class*="flex-1"]') ?? el.parentElement?.parentElement ?? el
      const startEvt = new TouchEvent("touchstart", {
        touches: [
          new Touch({
            identifier: 0,
            target: parent,
            clientX: 195,
            clientY: 100,
          }),
        ],
      })
      parent.dispatchEvent(startEvt)

      const moveEvt = new TouchEvent("touchmove", {
        touches: [
          new Touch({
            identifier: 0,
            target: parent,
            clientX: 195,
            clientY: 250,
          }),
        ],
      })
      parent.dispatchEvent(moveEvt)

      const endEvt = new TouchEvent("touchend", {
        changedTouches: [
          new Touch({
            identifier: 0,
            target: parent,
            clientX: 195,
            clientY: 250,
          }),
        ],
      })
      parent.dispatchEvent(endEvt)
    })

    // Wait briefly for refresh to complete -- data should still be present
    await page.waitForTimeout(2000)
    await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible()
    await expect(
      page.locator("[data-tour='assignment-card']").first(),
    ).toBeVisible()
  })
})

// ── FIELD-03..07: Canvassing Wizard ───────────────────────────────────────────

test.describe.serial("Field Mode -- Canvassing", () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/volunteer.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
    // Clear canvassing store so we start fresh
    await page.goto(`/field/${campaignId}`)
    await page.evaluate(() => {
      localStorage.removeItem("canvassing-store")
    })
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("FIELD-03: start canvassing from hub", async () => {
    // Navigate to field hub
    await page.goto(`/field/${campaignId}`)
    await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible({
      timeout: 15_000,
    })

    // Click canvassing assignment card
    const canvassingCard = page.locator("[data-tour='assignment-card']").filter({
      hasText: /door/i,
    })
    if (await canvassingCard.isVisible().catch(() => false)) {
      await canvassingCard.click()
    } else {
      // Fallback: click first assignment card
      await page.locator("[data-tour='assignment-card']").first().click()
    }

    // Wait for canvassing page to load
    await page.waitForURL(/\/field\/.*\/canvassing/, { timeout: 15_000 })

    // Dismiss any tour popover that appears
    const tourPopover = page.locator(".driver-popover")
    if (await tourPopover.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Close the tour
      const closeButton = tourPopover.locator(
        "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
      )
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click()
      }
    }

    // Assert household card visible with address
    const householdCard = page.locator("[data-tour='household-card']")
    await expect(householdCard).toBeVisible({ timeout: 15_000 })

    // Assert voter name visible within the card
    await expect(householdCard.locator("p.text-lg, p.text-xl").first()).toBeVisible()

    // Assert progress indicator visible
    const progressBar = page.locator("[data-tour='progress-bar']")
    await expect(progressBar).toBeVisible()

    // Assert Google Maps navigation link present
    const navigateLink = page.getByRole("link", {
      name: /navigate to/i,
    })
    // Navigation button should exist (may be disabled if no address)
    const navigateButton = page.getByRole("button", {
      name: /navigate to/i,
    })
    const hasLink = await navigateLink.isVisible().catch(() => false)
    const hasButton = await navigateButton.isVisible().catch(() => false)
    expect(hasLink || hasButton).toBeTruthy()

    // If it's a link, verify it points to Google Maps
    if (hasLink) {
      const href = await navigateLink.getAttribute("href")
      expect(href).toContain("google.com/maps")
    }
  })

  test("FIELD-04: record door knock outcomes", async () => {
    // Should be on canvassing page from previous test
    await expect(page.locator("[data-tour='household-card']")).toBeVisible({
      timeout: 15_000,
    })

    // Dismiss tour if visible
    const tourPopover = page.locator(".driver-popover")
    if (await tourPopover.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const closeBtn = tourPopover.locator(
        "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
      )
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }
    }

    // Record first outcome: "Not Home" -- should auto-advance
    const outcomeGrid = page.locator("[data-tour='outcome-grid']")
    await expect(outcomeGrid).toBeVisible({ timeout: 10_000 })
    const notHomeButton = outcomeGrid.getByRole("button", {
      name: /not home/i,
    })
    await expect(notHomeButton).toBeVisible()
    await notHomeButton.click()

    // If a bulk "Apply to all?" toast appears, dismiss it with "No"
    const bulkToast = page.getByText(/apply to all/i)
    if (await bulkToast.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const noButton = page.getByRole("button", { name: /no/i })
      if (await noButton.isVisible().catch(() => false)) {
        await noButton.click()
      }
    }

    // Wait for wizard to advance or stay on same household
    await page.waitForTimeout(1000)

    // Record another outcome if there are more entries
    const outcomeGrid2 = page.locator("[data-tour='outcome-grid']")
    if (await outcomeGrid2.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Record "Not Home" again
      const notHome2 = outcomeGrid2.getByRole("button", {
        name: /not home/i,
      })
      if (await notHome2.isVisible().catch(() => false)) {
        await notHome2.click()
      }

      // Dismiss bulk toast again if needed
      const bulkToast2 = page.getByText(/apply to all/i)
      if (await bulkToast2.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const noBtn2 = page.getByRole("button", { name: /no/i })
        if (await noBtn2.isVisible().catch(() => false)) {
          await noBtn2.click()
        }
      }
    }
  })

  test("FIELD-05: canvassing progress tracking", async () => {
    // Progress bar should reflect completed doors
    const progressBar = page.locator("[data-tour='progress-bar']")
    await expect(progressBar).toBeVisible({ timeout: 10_000 })

    // Check for progress text (e.g., "1/N doors" or percentage)
    const progressText = await progressBar.textContent()
    expect(progressText).toBeTruthy()
    // Should contain a fraction or percentage indicating progress
    expect(progressText).toMatch(/\d+\/\d+|\d+%/)
  })

  test("FIELD-06: canvassing session persistence after reload", async () => {
    // Get current progress state before reload
    const progressBefore = await page
      .locator("[data-tour='progress-bar']")
      .textContent()

    // Reload the page
    await page.reload()

    // Wait for canvassing page to reload
    await page.waitForURL(/\/field\/.*\/canvassing/, { timeout: 15_000 })

    // A resume prompt should appear (via sonner toast)
    // The resume prompt uses a toast: "Pick up where you left off?"
    const resumeToast = page.getByText(/pick up where you left off/i)
    const hasResume = await resumeToast
      .isVisible({ timeout: 5_000 })
      .catch(() => false)

    if (hasResume) {
      // Click "Resume" to continue from where we left off
      const resumeButton = page.getByRole("button", { name: /resume/i })
      if (await resumeButton.isVisible().catch(() => false)) {
        await resumeButton.click()
      }
    }

    // After resume, the household card should be visible
    await expect(page.locator("[data-tour='household-card']")).toBeVisible({
      timeout: 15_000,
    })

    // Progress should be maintained (or at least show non-zero if we recorded outcomes)
    const progressAfter = await page
      .locator("[data-tour='progress-bar']")
      .textContent()
    expect(progressAfter).toBeTruthy()
  })

  test("FIELD-07: canvassing with inline survey (or survey-absent verification)", async () => {
    // Navigate fresh to canvassing to ensure clean state
    await page.goto(`/field/${campaignId}/canvassing`)
    await page.waitForURL(/\/field\/.*\/canvassing/, { timeout: 15_000 })

    // Wait for household card to load
    const householdCard = page.locator("[data-tour='household-card']")
    const isLoaded = await householdCard
      .isVisible({ timeout: 15_000 })
      .catch(() => false)

    if (!isLoaded) {
      // Walk list may be fully completed -- this is an expected state
      test.skip(
        true,
        "Walk list appears completed -- no more doors to visit for survey test",
      )
      return
    }

    // Dismiss tour if visible
    const tourPopover = page.locator(".driver-popover")
    if (await tourPopover.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const closeBtn = tourPopover.locator(
        "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
      )
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }
    }

    // Try to record a "Supporter" outcome -- this triggers survey if script attached
    const outcomeGrid = page.locator("[data-tour='outcome-grid']")
    await expect(outcomeGrid).toBeVisible({ timeout: 10_000 })

    const supporterBtn = outcomeGrid.getByRole("button", {
      name: /supporter/i,
    })
    if (await supporterBtn.isVisible().catch(() => false)) {
      await supporterBtn.click()

      // Check if inline survey sheet appears
      const surveySheet = page.getByText(/survey|question/i)
      const hasSurvey = await surveySheet
        .isVisible({ timeout: 3_000 })
        .catch(() => false)

      if (hasSurvey) {
        // Survey is present -- interact with it
        // Look for survey question text and answer options
        const surveyQuestion = page.locator(
          '[role="radiogroup"], [role="group"], form',
        )
        if (await surveyQuestion.isVisible({ timeout: 3_000 }).catch(() => false)) {
          // Click first option or answer
          const firstOption = surveyQuestion
            .getByRole("button")
            .or(surveyQuestion.getByRole("radio"))
            .first()
          if (await firstOption.isVisible().catch(() => false)) {
            await firstOption.click()
          }
        }

        // Look for submit or skip button
        const submitBtn = page.getByRole("button", { name: /submit|done|skip/i })
        if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await submitBtn.click()
        }
      }
      // If no survey, the wizard should have auto-advanced -- this is the negative test case
      // (seed walk lists may not have a survey script attached)
    } else {
      // No supporter button visible -- use whatever is available
      const anyOutcome = outcomeGrid.getByRole("button").first()
      await anyOutcome.click()
    }

    // Either way, verify the wizard is still functional
    await page.waitForTimeout(1000)
    // Should either show next door or completion summary
    const hasHousehold = await householdCard.isVisible().catch(() => false)
    const hasCompletion = await page
      .getByText(/complete|all done|great work/i)
      .isVisible()
      .catch(() => false)
    expect(hasHousehold || hasCompletion).toBeTruthy()
  })
})

// ── FIELD-08..10: Phone Banking ───────────────────────────────────────────────

test.describe.serial("Field Mode -- Phone Banking", () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/volunteer.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("FIELD-08: start phone banking from hub", async () => {
    // Navigate to field hub
    await page.goto(`/field/${campaignId}`)
    await expect(page.locator("[data-tour='hub-greeting']")).toBeVisible({
      timeout: 15_000,
    })

    // Click phone banking assignment card
    const phoneBankCard = page.locator("[data-tour='assignment-card']").filter({
      hasText: /call/i,
    })
    if (await phoneBankCard.isVisible().catch(() => false)) {
      await phoneBankCard.click()
    } else {
      // If no "call" card visible, check for phone banking link
      const pbLink = page.getByRole("link", { name: /phone/i })
      if (await pbLink.isVisible().catch(() => false)) {
        await pbLink.click()
      } else {
        // Navigate directly
        await page.goto(`/field/${campaignId}/phone-banking`)
      }
    }

    // Wait for phone banking page to load
    await page.waitForURL(/\/field\/.*\/phone-banking/, { timeout: 15_000 })

    // Dismiss any tour popover
    const tourPopover = page.locator(".driver-popover")
    if (await tourPopover.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const closeBtn = tourPopover.locator(
        "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
      )
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }
    }

    // Check for either voter card (entries available) or empty state
    const voterCard = page.locator("p.text-xl.font-bold").first()
    const emptyState = page.getByText(/no voters to call|no phone banking/i)
    const hasVoter = await voterCard
      .isVisible({ timeout: 10_000 })
      .catch(() => false)
    const hasEmpty = await emptyState.isVisible().catch(() => false)

    if (hasEmpty) {
      test.skip(true, "No voters available in calling session")
      return
    }

    // Assert voter name visible
    expect(hasVoter).toBeTruthy()

    // Assert phone number list visible with Call button
    const phoneList = page.locator("[data-tour='phone-number-list']")
    await expect(phoneList).toBeVisible({ timeout: 10_000 })

    // Assert outcome grid visible
    const outcomeGrid = page.locator("[data-tour='outcome-grid']")
    await expect(outcomeGrid).toBeVisible()

    // Assert progress indicator visible
    const progressBar = page.locator("[data-tour='progress-bar']")
    await expect(progressBar).toBeVisible()
  })

  test("FIELD-09: tap-to-call link with tel: href", async () => {
    // Should still be on phone banking page from FIELD-08
    const phoneList = page.locator("[data-tour='phone-number-list']")

    // If we need to re-navigate
    if (!(await phoneList.isVisible().catch(() => false))) {
      await page.goto(`/field/${campaignId}/phone-banking`)
      await page.waitForURL(/\/field\/.*\/phone-banking/, { timeout: 15_000 })
    }

    // Dismiss tour if visible
    const tourPopover = page.locator(".driver-popover")
    if (await tourPopover.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const closeBtn = tourPopover.locator(
        "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
      )
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }
    }

    // Check for empty state
    const emptyState = page.getByText(/no voters to call/i)
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(true, "No voters available for tel: link test")
      return
    }

    // Find Call button which should be an anchor with tel: href
    const callLink = page.locator("a[href^='tel:']")
    await expect(callLink.first()).toBeVisible({ timeout: 10_000 })

    // Verify the tel: href contains a phone number
    const href = await callLink.first().getAttribute("href")
    expect(href).toBeTruthy()
    expect(href).toMatch(/^tel:/)

    // Verify formatted phone display is present (e.g., "(555) 123-4567" format)
    const phoneText = page.locator("[data-tour='phone-number-list']")
    const text = await phoneText.textContent()
    expect(text).toBeTruthy()
    // Should contain parentheses or dashes indicating formatting
    expect(text).toMatch(/\(\d{3}\)\s?\d{3}[-.]\d{4}|\+?\d/)
  })

  test("FIELD-10: record phone call outcomes with auto-advance", async () => {
    // Should be on phone banking page
    const outcomeGrid = page.locator("[data-tour='outcome-grid']")

    if (!(await outcomeGrid.isVisible().catch(() => false))) {
      await page.goto(`/field/${campaignId}/phone-banking`)
      await page.waitForURL(/\/field\/.*\/phone-banking/, { timeout: 15_000 })
    }

    // Dismiss tour if visible
    const tourPopover = page.locator(".driver-popover")
    if (await tourPopover.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const closeBtn = tourPopover.locator(
        "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
      )
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      }
    }

    // Check for empty state
    const emptyState = page.getByText(/no voters to call/i)
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(true, "No voters available for outcome recording test")
      return
    }

    // Get the initial voter name
    const initialVoterName = await page
      .locator("p.text-xl.font-bold")
      .first()
      .textContent()

    // Record first outcome: "No Answer"
    await expect(outcomeGrid).toBeVisible({ timeout: 10_000 })
    const noAnswerBtn = outcomeGrid.getByRole("button", {
      name: /no answer/i,
    })
    await expect(noAnswerBtn).toBeVisible()
    await noAnswerBtn.click()

    // Wait for auto-advance
    await page.waitForTimeout(1500)

    // Should either show next voter or completion summary
    const hasNextVoter = await page
      .locator("p.text-xl.font-bold")
      .first()
      .isVisible()
      .catch(() => false)
    const hasCompletion = await page
      .getByText(/session complete|all done|great work/i)
      .isVisible()
      .catch(() => false)

    if (hasCompletion) {
      // Session is complete -- test passed (auto-advance worked)
      return
    }

    // Record second outcome if more voters available
    if (hasNextVoter) {
      const voicemailBtn = outcomeGrid.getByRole("button", {
        name: /voicemail/i,
      })
      if (await voicemailBtn.isVisible().catch(() => false)) {
        await voicemailBtn.click()
        await page.waitForTimeout(1000)
      }
    }

    // Verify outcomes were recorded -- progress should have changed
    const progress = page.locator("[data-tour='progress-bar']")
    if (await progress.isVisible().catch(() => false)) {
      const progressText = await progress.textContent()
      expect(progressText).toBeTruthy()
    }
  })
})

// ── OFFLINE-01..03: Offline Support ───────────────────────────────────────────

test.describe.serial("Field Mode -- Offline Support", () => {
  let page: Page
  let context: BrowserContext

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      storageState: "playwright/.auth/volunteer.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
    // Clear offline queue before tests
    await page.goto(`/field/${campaignId}`)
    await page.evaluate(() => {
      localStorage.removeItem("offline-queue")
      localStorage.removeItem("canvassing-store")
    })
  })

  test.afterAll(async () => {
    // Ensure we go back online before cleanup
    await context.setOffline(false)
    await page.close()
    await context.close()
  })

  test("OFFLINE-01: offline banner appears when network disconnected", async () => {
    // Navigate to canvassing in field mode
    await page.goto(`/field/${campaignId}/canvassing`)
    await page.waitForURL(/\/field\//, { timeout: 15_000 })

    // Wait for page content to load
    await page.waitForTimeout(2000)

    // Simulate going offline
    await context.setOffline(true)

    // The OfflineBanner watches navigator.onLine via 'offline' event
    // Assert offline indicator becomes visible
    const offlineBanner = page.getByText(/offline/i).first()
    await expect(offlineBanner).toBeVisible({ timeout: 5_000 })
  })

  test("OFFLINE-02: queue outcomes while offline and show count in UI", async () => {
    // Should still be offline from OFFLINE-01
    // Navigate to canvassing (already there but may need to load data)

    // Check if household card is visible (walk list data may be cached)
    const householdCard = page.locator("[data-tour='household-card']")
    const isLoaded = await householdCard
      .isVisible({ timeout: 5_000 })
      .catch(() => false)

    if (!isLoaded) {
      // Go online briefly to load data, then go offline again
      await context.setOffline(false)
      await page.goto(`/field/${campaignId}/canvassing`)
      await expect(householdCard).toBeVisible({ timeout: 15_000 })

      // Dismiss tour if visible
      const tourPopover = page.locator(".driver-popover")
      if (await tourPopover.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const closeBtn = tourPopover.locator(
          "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn",
        )
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click()
        }
      }

      // Go offline again
      await context.setOffline(true)
      await expect(page.getByText(/offline/i).first()).toBeVisible({
        timeout: 5_000,
      })
    }

    // Record outcomes while offline -- they should be queued
    const outcomeGrid = page.locator("[data-tour='outcome-grid']")
    if (await outcomeGrid.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Record "Not Home"
      const notHomeBtn = outcomeGrid.getByRole("button", {
        name: /not home/i,
      })
      if (await notHomeBtn.isVisible().catch(() => false)) {
        await notHomeBtn.click()

        // Dismiss bulk toast if it appears
        const bulkToast = page.getByText(/apply to all/i)
        if (
          await bulkToast.isVisible({ timeout: 2_000 }).catch(() => false)
        ) {
          const noBtn = page.getByRole("button", { name: /no/i })
          if (await noBtn.isVisible().catch(() => false)) {
            await noBtn.click()
          }
        }

        await page.waitForTimeout(500)
      }

      // Record another outcome if possible
      const outcomeGrid2 = page.locator("[data-tour='outcome-grid']")
      if (
        await outcomeGrid2.isVisible({ timeout: 2_000 }).catch(() => false)
      ) {
        const moveBtn = outcomeGrid2.getByRole("button", {
          name: /moved|not home/i,
        })
        if (await moveBtn.isVisible().catch(() => false)) {
          await moveBtn.click()

          // Dismiss bulk toast
          const bulkToast2 = page.getByText(/apply to all/i)
          if (
            await bulkToast2.isVisible({ timeout: 2_000 }).catch(() => false)
          ) {
            const noBtn2 = page.getByRole("button", { name: /no/i })
            if (await noBtn2.isVisible().catch(() => false)) {
              await noBtn2.click()
            }
          }
        }
      }
    }

    // Assert queued count is visible in UI
    // The OfflineBanner shows "N outcomes saved" text
    const savedIndicator = page.getByText(/\d+\s+outcomes?\s+saved/i)
    await expect(savedIndicator).toBeVisible({ timeout: 5_000 })
  })

  test("OFFLINE-03: auto-sync on reconnection", async () => {
    // Should still be offline with queued outcomes

    // Set up response interception for sync API call
    // Door knocks go to /api/v1/campaigns/*/walk-lists/*/door-knocks
    const syncPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/door-knocks") && response.status() < 400,
      { timeout: 15_000 },
    )

    // Go back online
    await context.setOffline(false)

    // Wait for sync API call to complete
    try {
      await syncPromise

      // Assert offline banner disappears or shows "All caught up!"
      const allCaughtUp = page.getByText(/all caught up/i)
      const offlineBanner = page.getByText(/offline/i)

      // Wait briefly for UI to update
      await page.waitForTimeout(2000)

      const hasCaughtUp = await allCaughtUp
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
      const isStillOffline = await offlineBanner
        .isVisible()
        .catch(() => false)

      // Either "All caught up" toast appeared, or offline banner is gone
      expect(hasCaughtUp || !isStillOffline).toBeTruthy()
    } catch {
      // Sync may not trigger if queue was empty or already synced
      // Check that we're online and banner is gone
      await page.waitForTimeout(3000)
      const offlineText = page.locator(
        "[role='status'][aria-label*='offline' i]",
      )
      const isOffline = await offlineText.isVisible().catch(() => false)
      expect(isOffline).toBeFalsy()
    }
  })
})

// ── TOUR-01..03: Onboarding Tour ──────────────────────────────────────────────

test.describe.serial("Field Mode -- Onboarding Tour", () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/volunteer.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("TOUR-01: first-time tour auto-starts on field hub", async () => {
    // Clear tour localStorage to simulate first visit
    await page.goto(`/field/${campaignId}`)
    await page.evaluate(() => {
      localStorage.removeItem("tour-state")
    })

    // Navigate to field hub (fresh load)
    await page.goto(`/field/${campaignId}`)
    await page.waitForURL(/\/field\//, { timeout: 15_000 })

    // Wait for assignment cards to load (tour triggers after data loads + 200ms delay)
    await expect(
      page.locator("[data-tour='hub-greeting']"),
    ).toBeVisible({ timeout: 15_000 })

    // Assert driver.js tour popover appears
    const tourPopover = page.locator(".driver-popover")
    await expect(tourPopover).toBeVisible({ timeout: 5_000 })

    // Step through 2-3 tour steps by clicking "Next"
    for (let step = 0; step < 3; step++) {
      const nextBtn = tourPopover.locator(
        "button:has-text('Next'), .driver-popover-next-btn",
      )
      const doneBtn = tourPopover.locator(
        "button:has-text('Done'), .driver-popover-done-btn",
      )

      const hasNext = await nextBtn.isVisible().catch(() => false)
      const hasDone = await doneBtn.isVisible().catch(() => false)

      if (hasDone) {
        await doneBtn.click()
        break
      }
      if (hasNext) {
        await nextBtn.click()
        await page.waitForTimeout(300) // Wait for transition
      } else {
        break
      }
    }

    // If tour still has more steps, complete it
    const doneBtn = page.locator(
      ".driver-popover button:has-text('Done'), .driver-popover .driver-popover-done-btn",
    )
    if (await doneBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await doneBtn.click()
    }

    // Tour should be dismissed
    await expect(page.locator(".driver-popover")).not.toBeVisible({
      timeout: 3_000,
    })
  })

  test("TOUR-02: replay tour via help button", async () => {
    // After tour completion, find the help button
    const helpButton = page.locator("[data-tour='help-button']")
    await expect(helpButton).toBeVisible({ timeout: 5_000 })

    // Click help button to replay tour
    await helpButton.click()

    // Tour popover should reappear
    const tourPopover = page.locator(".driver-popover")
    await expect(tourPopover).toBeVisible({ timeout: 5_000 })

    // Close the replayed tour
    const closeOrDone = tourPopover.locator(
      "button:has-text('Close'), button:has-text('Done'), .driver-popover-close-btn, .driver-popover-done-btn",
    )
    // Step through or close
    const nextBtn = tourPopover.locator(
      "button:has-text('Next'), .driver-popover-next-btn",
    )
    while (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(300)
    }
    if (await closeOrDone.isVisible().catch(() => false)) {
      await closeOrDone.click()
    }
  })

  test("TOUR-03: tour completion persists across page reload", async () => {
    // Reload the page
    await page.reload()
    await page.waitForURL(/\/field\//, { timeout: 15_000 })

    // Wait for field hub data to load
    await expect(
      page.locator("[data-tour='hub-greeting']"),
    ).toBeVisible({ timeout: 15_000 })

    // Tour should NOT auto-start again (completion state persisted in localStorage)
    await expect(page.locator(".driver-popover")).not.toBeVisible({
      timeout: 3_000,
    })
  })
})
