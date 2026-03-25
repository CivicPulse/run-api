import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"
const VOTER_ID = "voter-a11y-001"
const OIDC_STORAGE_KEY = "oidc.user:https://auth.civpulse.org:363437283614916644"

// ── Auth & Mock Helpers ──────────────────────────────────────────────────────

function mockOidcUser(): string {
  return JSON.stringify({
    id_token: "mock-id-token",
    session_state: null,
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: "mock-user-a11y",
      name: "Test Admin",
      email: "admin@test.com",
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })
}

async function setupAuth(page: Page) {
  await page.addInitScript(
    ({ key, user }: { key: string; user: string }) => {
      localStorage.setItem(key, user)
    },
    { key: OIDC_STORAGE_KEY, user: mockOidcUser() },
  )
}

async function setupApiMocks(page: Page) {
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
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // My role
    if (url.includes("/me") || url.includes("/my-role")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "owner" }),
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

    // Default
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("A11Y Flow: Voter Search", () => {
  test.setTimeout(30_000)

  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
    await setupApiMocks(page)
  })

  test("voter search flow is keyboard-operable and screen-reader-friendly", async ({
    page,
  }) => {
    // 1. Navigate to voters list page
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // 2. Verify ARIA landmarks exist
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // 3. Verify heading hierarchy - at least one heading exists in main
    const headings = main.getByRole("heading")
    const headingCount = await headings.count()
    expect(headingCount).toBeGreaterThan(0)

    // Check heading levels are not skipped (h1 -> h2 -> h3, no h1 -> h3)
    const headingLevels: number[] = []
    for (let i = 0; i < headingCount; i++) {
      const heading = headings.nth(i)
      const tagName = await heading.evaluate((el) => el.tagName.toLowerCase())
      const level = parseInt(tagName.replace("h", ""), 10)
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
    const buttons = main.getByRole("button")
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
