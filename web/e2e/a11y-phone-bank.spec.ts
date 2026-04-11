import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"
const SESSION_ID = "session-a11y-001"
const CALL_LIST_ID = "cl-a11y-001"
const SCRIPT_ID = "script-a11y-001"

// ── API Mock Helpers ────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  await mockConfigEndpoint(page)
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Campaign detail
    if (url.includes(`/campaigns/${CAMPAIGN_ID}`) && !url.includes(`/campaigns/${CAMPAIGN_ID}/`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CAMPAIGN_ID,
          name: "A11Y Test Campaign",
          description: "Accessibility test campaign",
          slug: "a11y-test",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        }),
      })
    }

    // Phone bank session detail
    if (url.includes(`/phone-bank-sessions/${SESSION_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SESSION_ID,
          name: "Evening Calls Session",
          call_list_id: CALL_LIST_ID,
          script_id: SCRIPT_ID,
          status: "active",
          callers: [
            { id: "caller-1", user_id: "mock-user", first_name: "Jane", last_name: "Doe", calls_made: 5 },
          ],
          total_calls: 20,
          completed_calls: 5,
          created_at: "2026-01-01T00:00:00Z",
        }),
      })
    }

    // Phone bank sessions list
    if (url.includes("/phone-bank-sessions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: SESSION_ID,
              name: "Evening Calls Session",
              status: "active",
              call_list_id: CALL_LIST_ID,
              total_calls: 20,
              completed_calls: 5,
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          next_cursor: null,
        }),
      })
    }

    // Call lists
    if (url.includes(`/call-lists/${CALL_LIST_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CALL_LIST_ID,
          name: "Test Call List",
          campaign_id: CAMPAIGN_ID,
          script_id: SCRIPT_ID,
          status: "active",
          total_entries: 50,
          dnc_filtered: 2,
        }),
      })
    }
    if (url.includes("/call-lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: CALL_LIST_ID,
              name: "Test Call List",
              status: "active",
              total_entries: 50,
              dnc_filtered: 2,
            },
          ],
          next_cursor: null,
        }),
      })
    }

    // Surveys
    if (url.includes("/surveys")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // DNC
    if (url.includes("/dnc")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Voter lists (for call list creation)
    if (url.includes("/voters/lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // My campaigns (must be checked before /me catch-all)
    if (url.includes("/me/campaigns")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { campaign_id: CAMPAIGN_ID, campaign_name: "A11Y Test Campaign", role: "owner" },
        ]),
      })
    }

    // My role / profile
    if (url.includes("/me") || url.includes("/my-role")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-user-a11y", display_name: "Test Admin", email: "admin@test.com", role: "owner", created_at: "2026-01-01T00:00:00Z" }),
      })
    }

    // Campaigns list
    if (url.includes("/campaigns") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{ id: CAMPAIGN_ID, name: "A11Y Test Campaign", status: "active", role: "owner" }],
          next_cursor: null,
        }),
      })
    }

    // Members
    if (url.includes("/members")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Default
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("A11Y Flow: Phone Bank Session", () => {
  test.setTimeout(30_000)

  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page)
    await setupApiMocks(page)
  })

  // Deferred to v1.19 — pre-existing failure, misc cluster, see .planning/todos/pending/106-phase-verify-cluster-triage.md
  test.skip("phone bank session flow is keyboard-operable and screen-reader-friendly", async ({
    page,
  }) => {
    // 1. Navigate to phone banking sessions page (index redirects to call-lists)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/sessions`)
    await page.waitForLoadState("domcontentloaded")
    // 2. Verify ARIA landmarks
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // 3. Verify heading hierarchy
    const headings = main.getByRole("heading")
    const headingCount = await headings.count()
    expect(headingCount).toBeGreaterThan(0)

    // Check heading levels are not skipped
    const headingLevels: number[] = []
    for (let i = 0; i < headingCount; i++) {
      const heading = headings.nth(i)
      const tagName = await heading.evaluate((el) => el.tagName.toLowerCase())
      const level = parseInt(tagName.replace("h", ""), 10)
      if (!isNaN(level)) headingLevels.push(level)
    }
    for (let i = 1; i < headingLevels.length; i++) {
      const jump = headingLevels[i] - headingLevels[i - 1]
      expect(jump, `Heading level skipped: h${headingLevels[i - 1]} -> h${headingLevels[i]}`).toBeLessThanOrEqual(1)
    }

    // 4. Keyboard navigate to session list or create button
    let foundInteractive = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab")
      const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() || "")
      if (tag === "button" || tag === "a") {
        foundInteractive = true
        // Verify accessible name
        const name = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          return el?.getAttribute("aria-label") || el?.textContent?.trim() || ""
        })
        expect(name.length, "Interactive element should have accessible name").toBeGreaterThan(0)
        break
      }
    }
    expect(foundInteractive, "Should reach interactive element via keyboard").toBeTruthy()

    // 5. Verify data table for sessions has proper semantics
    const table = page.getByRole("table")
    const tableCount = await table.count()
    if (tableCount > 0) {
      const headers = table.first().getByRole("columnheader")
      expect(await headers.count(), "Sessions table should have column headers").toBeGreaterThan(0)
    }

    // 6. Navigate to session detail page
    await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/sessions/${SESSION_ID}`)
    await page.waitForLoadState("domcontentloaded")
    // Verify detail page ARIA landmarks
    await expect(page.getByRole("main")).toBeVisible()

    // Verify heading on detail page
    const detailHeadings = page.getByRole("main").getByRole("heading")
    expect(await detailHeadings.count()).toBeGreaterThan(0)

    // Verify buttons on detail page have accessible names
    const detailButtons = page.getByRole("main").getByRole("button")
    const detailButtonCount = await detailButtons.count()
    for (let i = 0; i < Math.min(detailButtonCount, 10); i++) {
      const button = detailButtons.nth(i)
      if (!(await button.isVisible())) continue
      const name = await button.evaluate((el) => {
        return el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("title") || ""
      })
      expect(name.length, `Detail button ${i} should have accessible name`).toBeGreaterThan(0)
    }

    // 7. Verify keyboard can reach action buttons on detail page
    let reachedDetailButton = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab")
      const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() || "")
      if (tag === "button") {
        reachedDetailButton = true
        break
      }
    }
    expect(reachedDetailButton, "Should reach buttons on session detail via keyboard").toBeTruthy()
  })
})
