import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"
const VOTER_ID = "voter-a11y-001"

// ── API Mock Helpers ────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  // Register catch-all first; specific routes below should win.
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

    // Voter search (POST)
    if (url.includes("/voters/search") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: VOTER_ID,
              first_name: "Alice",
              last_name: "Smith",
              party: "DEM",
              age: 42,
              registration_city: "Springfield",
              registration_state: "OH",
            },
            {
              id: "voter-a11y-002",
              first_name: "Bob",
              last_name: "Johnson",
              party: "REP",
              age: 55,
              registration_city: "Columbus",
              registration_state: "OH",
            },
          ],
          next_cursor: null,
          prev_cursor: null,
        }),
      })
    }

    // Voter tags
    if (url.includes("/voters/tags")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Voter lists
    if (url.includes("/voters/lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], pagination: { next_cursor: null, has_more: false } }),
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

    // My orgs
    if (url.includes("/me/orgs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "org-a11y",
            name: "A11Y Test Org",
            slug: "a11y-test-org",
            role: "org_owner",
            zitadel_org_id: "mock-org",
          },
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
          pagination: { next_cursor: null, has_more: false },
        }),
      })
    }

    // Default
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })

  // Register config endpoint last so it takes precedence over catch-all.
  await mockConfigEndpoint(page)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("A11Y Flow: Voter Search", () => {
  test.setTimeout(30_000)

  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page)
    await setupApiMocks(page)
  })

  test("voter search flow is keyboard-operable and screen-reader-friendly", async ({
    page,
  }) => {
    // 1. Navigate to voters list page
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
    await page.waitForLoadState("domcontentloaded")
    // 2. Verify ARIA landmarks exist
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.locator("#main-content")
    const hasMain = await main.count().then((c) => c > 0)
    const contentRoot = hasMain ? main.first() : page.locator("body")
    if (hasMain) {
      await expect(contentRoot).toBeVisible()
    }

    // 3. Verify heading hierarchy - at least one heading exists in main
    const headings = contentRoot.getByRole("heading")
    const headingCount = await headings.count()
    expect(headingCount).toBeGreaterThan(0)

    // Check heading levels are not skipped (h1 -> h2 -> h3, no h1 -> h3)
    const headingLevels: number[] = []
    for (let i = 0; i < headingCount; i++) {
      const heading = headings.nth(i)
      const level = await heading.evaluate((el) => {
        const ariaLevel = el.getAttribute("aria-level")
        if (ariaLevel) return Number.parseInt(ariaLevel, 10)
        const match = /^H([1-6])$/i.exec(el.tagName)
        return match ? Number.parseInt(match[1], 10) : NaN
      })
      if (!isNaN(level)) headingLevels.push(level)
    }
    // Verify no levels are skipped (difference between consecutive levels <= 1 going down)
    for (let i = 1; i < headingLevels.length; i++) {
      const jump = headingLevels[i] - headingLevels[i - 1]
      expect(jump, `Heading level skipped: h${headingLevels[i - 1]} -> h${headingLevels[i]}`).toBeLessThanOrEqual(1)
    }

    // 4. Keyboard navigation - Tab to reach interactive elements
    // Start from body and tab through
    await page.keyboard.press("Tab")

    // Tab multiple times to reach search/filter area
    for (let i = 0; i < 20; i++) {
      const focusedRole = await page.evaluate(() => {
        const el = document.activeElement
        return el?.getAttribute("role") || el?.tagName.toLowerCase()
      })
      const focusedType = await page.evaluate(() => {
        const el = document.activeElement
        return el?.getAttribute("type") || ""
      })

      // Check if we found an input (search field)
      if (focusedRole === "input" || focusedRole === "textbox" || focusedType === "text" || focusedType === "search") {
        // Verify the focused element has an accessible name
        const accessibleName = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          return (
            el?.getAttribute("aria-label") ||
            el?.getAttribute("placeholder") ||
            el?.getAttribute("title") ||
            (el?.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            ""
          )
        })
        expect(accessibleName.length, "Search input should have an accessible name").toBeGreaterThan(0)
        break
      }

      await page.keyboard.press("Tab")
    }

    // 5. Verify data table has proper semantics
    const table = page.getByRole("table")
    const tableCount = await table.count()
    if (tableCount > 0) {
      // Table should have column headers
      const columnHeaders = table.first().getByRole("columnheader")
      const headerCount = await columnHeaders.count()
      expect(headerCount, "Data table should have column headers").toBeGreaterThan(0)
    }

    // 6. Verify buttons have accessible names
    const buttons = contentRoot.getByRole("button")
    const buttonCount = await buttons.count()
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i)
      const isVisible = await button.isVisible()
      if (!isVisible) continue
      const name = await button.evaluate((el) => {
        return (
          el.getAttribute("aria-label") ||
          el.textContent?.trim() ||
          el.getAttribute("title") ||
          ""
        )
      })
      expect(name.length, `Button ${i} should have an accessible name`).toBeGreaterThan(0)
    }
  })
})
