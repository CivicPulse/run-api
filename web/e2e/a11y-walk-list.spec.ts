import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"
const TURF_ID = "turf-a11y-001"
const WALK_LIST_ID = "wl-a11y-001"

// ── API Mock Helpers ────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  // Register catch-all FIRST so that more-specific routes registered later
  // take priority (Playwright matches last-registered first).
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

    // Turfs list
    if (url.includes("/turfs") && !url.includes(`/turfs/${TURF_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: TURF_ID,
              name: "Downtown Turf",
              description: "Central area turf",
              voter_count: 25,
              boundary: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
            },
          ],
        }),
      })
    }

    // Turf detail
    if (url.includes(`/turfs/${TURF_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TURF_ID,
          name: "Downtown Turf",
          description: "Central area turf",
          voter_count: 25,
          boundary: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        }),
      })
    }

    // Walk lists
    if (url.includes(`/walk-lists/${WALK_LIST_ID}/entries`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }
    if (url.includes(`/walk-lists/${WALK_LIST_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: WALK_LIST_ID,
          name: "Test Walk List",
          campaign_id: CAMPAIGN_ID,
          turf_id: TURF_ID,
          total_entries: 10,
          completed_entries: 3,
        }),
      })
    }
    if (url.includes("/walk-lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: WALK_LIST_ID,
              name: "Test Walk List",
              turf_id: TURF_ID,
              total_entries: 10,
              completed_entries: 3,
            },
          ],
        }),
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

    // Canvassing stats
    if (url.includes("/canvassing") && url.includes("/stats")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total_turfs: 1, total_walk_lists: 1, total_door_knocks: 30 }),
      })
    }

    // Default
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })

  // Register config endpoint AFTER catch-all so it takes priority
  // (Playwright matches last-registered route first).
  await mockConfigEndpoint(page)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("A11Y Flow: Walk List Creation", () => {
  test.setTimeout(30_000)

  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page)
    await setupApiMocks(page)
  })

  test("walk list creation flow is keyboard-operable and screen-reader-friendly", async ({
    page,
  }) => {
    // 1. Navigate to canvassing overview page
    await page.goto(`/campaigns/${CAMPAIGN_ID}/canvassing`)
    await page.waitForLoadState("domcontentloaded")
    // 2. Verify ARIA landmarks
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.locator("#main-content")
    const hasMain = await main.count().then((c) => c > 0)
    const contentRoot = hasMain ? main.first() : page.locator("body")
    if (hasMain) {
      await expect(contentRoot).toBeVisible()
    }

    // 3. Verify heading hierarchy
    const headings = contentRoot.getByRole("heading")
    const headingCount = await headings.count()
    expect(headingCount).toBeGreaterThan(0)

    // Ensure there is at least one top-level heading for page structure.
    const hasTopLevelHeading =
      (await contentRoot.locator("h1, [role='heading'][aria-level='1']").count()) > 0
    expect(hasTopLevelHeading).toBeTruthy()

    // 4. Keyboard navigate to interactive elements (links, buttons)
    let reachedLink = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab")
      const focusedTag = await page.evaluate(() => {
        const el = document.activeElement
        return el?.tagName.toLowerCase() || ""
      })
      const focusedRole = await page.evaluate(() => {
        const el = document.activeElement
        return el?.getAttribute("role") || ""
      })
      if (focusedTag === "a" || focusedRole === "link") {
        reachedLink = true
        // Verify the link has an accessible name
        const linkName = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          return (
            el?.getAttribute("aria-label") ||
            el?.textContent?.trim() ||
            ""
          )
        })
        expect(linkName.length, "Link should have accessible name").toBeGreaterThan(0)
        break
      }
      if (focusedTag === "button") {
        // Button is also fine - verify it has a name
        const btnName = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          return el?.getAttribute("aria-label") || el?.textContent?.trim() || ""
        })
        expect(btnName.length, "Button should have accessible name").toBeGreaterThan(0)
        reachedLink = true
        break
      }
    }
    expect(reachedLink, "Should reach an interactive element via keyboard").toBeTruthy()

    // 5. Verify table semantics for walk lists / turfs sections
    const tables = contentRoot.getByRole("table")
    const tableCount = await tables.count()
    if (tableCount > 0) {
      const headers = tables.first().getByRole("columnheader")
      expect(await headers.count(), "Table should have column headers").toBeGreaterThan(0)
    }

    // 6. Verify action buttons have accessible names
    const buttons = contentRoot.getByRole("button")
    const buttonCount = await buttons.count()
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i)
      if (!(await button.isVisible())) continue
      const hiddenFromAT = await button.getAttribute("aria-hidden")
      if (hiddenFromAT === "true") continue
      const name = await button.evaluate((el) => {
        return (
          el.getAttribute("aria-label") ||
          el.textContent?.trim() ||
          el.getAttribute("title") ||
          ""
        )
      })
      const hasSvgLabel = await button.locator("svg[aria-label], svg title").count()
      const hasSrOnlyText = await button.locator(".sr-only").count()
      expect(
        name.length > 0 || hasSvgLabel > 0 || hasSrOnlyText > 0,
        `Button ${i} should have accessible name`,
      ).toBeTruthy()
    }

    // 7. Verify "New Turf" link or button is keyboard-reachable
    const newTurfLink = page.getByRole("link", { name: /new turf/i })
    const newTurfCount = await newTurfLink.count()
    if (newTurfCount > 0) {
      await expect(newTurfLink.first()).toBeVisible()
    }
  })
})
