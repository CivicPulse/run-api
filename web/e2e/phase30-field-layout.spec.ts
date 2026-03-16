import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_FIELD_ME = {
  volunteer_name: "Sarah Johnson",
  campaign_name: "Johnson for Mayor",
  canvassing: {
    walk_list_id: "wl-1",
    name: "Downtown Walk List",
    total: 47,
    completed: 12,
  },
  phone_banking: {
    session_id: "session-1",
    name: "Evening Call Session",
    total: 100,
    completed: 25,
  },
}

// ── Mock Setup ────────────────────────────────────────────────────────────────

async function setupFieldMeMock(page: Page) {
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FIELD_ME),
      })
    },
  )
}

async function setupSubRouteMocks(page: Page) {
  // Mock field/me and any other API calls sub-routes make
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  // Catch-all for sub-route API needs (canvassing detail, sessions, etc.)
  await page.route(`**/api/v1/**`, (route) => {
    const url = route.request().url()
    if (url.includes("/field/me")) {
      route.continue()
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.setTimeout(30_000)

test.describe("Phase 30: Field Mode Layout Shell (NAV-01)", () => {
  test("field hub has no admin sidebar navigation chrome", async ({ page }) => {
    await setupFieldMeMock(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)

    // Wait for the field layout to render (field navigation header)
    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Admin sidebar must not be present
    const sidebar = page.locator("[data-sidebar='sidebar']")
    await expect(sidebar).toHaveCount(0)

    // The standard admin SidebarTrigger button must not be visible
    const sidebarTrigger = page.locator("[data-slot='sidebar-trigger']")
    await expect(sidebarTrigger).toHaveCount(0)
  })

  test("field hub renders FieldHeader with campaign name as title", async ({ page }) => {
    await setupFieldMeMock(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)

    // Wait for the field navigation header to render
    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Campaign name appears in the header title once data loads
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(
      "Johnson for Mayor",
      { timeout: 8_000 },
    )
  })

  test("field hub shows no back arrow on hub screen", async ({ page }) => {
    await setupFieldMeMock(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)

    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // No back arrow link on hub screen
    const backArrow = page.getByRole("link", { name: /back to hub/i })
    await expect(backArrow).toHaveCount(0)
  })

  test("field hub shows help button in header", async ({ page }) => {
    await setupFieldMeMock(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)

    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Help button is present (NAV-04: persistent help button)
    const helpButton = page.getByRole("button", { name: /help/i }).first()
    await expect(helpButton).toBeVisible({ timeout: 5_000 })
  })

  test("field sub-route canvassing has no admin sidebar", async ({ page }) => {
    await setupSubRouteMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // Field navigation header must be present
    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Admin sidebar must not be present
    const sidebar = page.locator("[data-sidebar='sidebar']")
    await expect(sidebar).toHaveCount(0)
  })
})

test.describe("Phase 30: Back Navigation from Sub-Screens (NAV-03)", () => {
  test("canvassing sub-screen shows back arrow in header", async ({ page }) => {
    await setupSubRouteMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // FieldHeader should be visible
    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Back arrow link should be present on sub-screen
    const backArrow = page.getByRole("link", { name: /back to hub/i }).first()
    await expect(backArrow).toBeVisible({ timeout: 8_000 })
  })

  test("back arrow on canvassing links back to field hub URL", async ({ page }) => {
    await setupSubRouteMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const backArrow = page.getByRole("link", { name: /back to hub/i }).first()
    await expect(backArrow).toBeVisible({ timeout: 8_000 })

    // Verify href leads back to field hub
    const href = await backArrow.getAttribute("href")
    expect(href).toContain(`/field/${CAMPAIGN_ID}`)
    expect(href).not.toContain("/canvassing")
  })

  test("phone-banking sub-screen shows back arrow in header", async ({ page }) => {
    await setupSubRouteMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/phone-banking`)

    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    const backArrow = page.getByRole("link", { name: /back to hub/i }).first()
    await expect(backArrow).toBeVisible({ timeout: 8_000 })
  })

  test("sub-screen header shows sub-route title not campaign name", async ({ page }) => {
    await setupSubRouteMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await expect(
      page.getByRole("navigation", { name: "Field navigation" }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // The header title on canvassing should be "Canvassing", not the campaign name
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toHaveText("Canvassing", { timeout: 8_000 })
  })
})
