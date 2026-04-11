import { test, expect } from "./fixtures"

/**
 * RBAC-03: Viewer cannot access mutation actions.
 * Runs under viewer auth via `.viewer.spec.ts` suffix.
 *
 * Viewer role should be able to view data but cannot create, edit, or delete anything.
 */
test.setTimeout(90_000)

test.describe("RBAC: viewer permissions", () => {
  /** Navigate into the seed campaign and extract campaignId. */
  async function enterCampaign(page: import("@playwright/test").Page, cid: string) {
    await page.goto(`/campaigns/${cid}/dashboard`)
    await page.waitForLoadState("domcontentloaded")
  }

  test("voters page: New Voter button is NOT visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 30_000 })

    // Wait for voter list to load (longer timeout for large datasets under parallel load)
    await expect(
      page.getByRole("heading", { name: /voters/i }).first(),
    ).toBeVisible({ timeout: 60_000 })

    const newVoterButton = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterButton).not.toBeVisible()
  })

  // D-10 justification: Voter search/detail APIs require volunteer+. Viewer (level 0) is below volunteer (level 1), so voter table is empty and detail pages return 403 — viewer cannot access voter data by design.
  test.skip("voter detail: Edit button is NOT visible", async ({ page }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 30_000 })

    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 30_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 30_000 })

    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).not.toBeVisible()
  })

  // D-10 justification: Viewer (level 0) is below volunteer (level 1) and cannot reach voter detail pages — API returns 403 and the detail route never renders for viewers.
  test.skip("voter detail: Add Interaction button IS visible for viewer", async ({
    page,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 30_000 })

    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 30_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 30_000 })

    const addInteractionButton = page.getByRole("button", {
      name: /add interaction/i,
    })
    await expect(addInteractionButton).toBeVisible({ timeout: 30_000 })
  })

  test("canvassing: page loads and New Turf link is present (not role-gated in UI)", async ({
    page, campaignId,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/canvassing`)
    await page.waitForURL(/canvassing/, { timeout: 30_000 })

    // Wait for canvassing page to load
    await expect(
      page.getByRole("heading", { name: /canvassing/i }).first(),
    ).toBeVisible({ timeout: 30_000 })

    // Note: New Turf link is NOT wrapped in RequireRole in the source code.
    // It is visible to all roles including viewer. This documents actual behavior.
    // The API will reject the POST if the viewer attempts to create a turf.
    const newTurfLink = page.getByRole("link", { name: /new turf/i })
    await expect(newTurfLink).toBeVisible({ timeout: 30_000 })
  })

  test("phone banking: New Call List button is NOT visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/phone-banking/call-lists`)
    await page.waitForURL(/call-lists/, { timeout: 30_000 })

    await expect(
      page.getByText(/call lists/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    const newCallListButton = page.getByRole("button", { name: /new call list/i })
    await expect(newCallListButton).not.toBeVisible()
  })

  test("phone banking: New Session button is NOT visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/phone-banking/sessions`)
    await page.waitForURL(/sessions/, { timeout: 30_000 })

    await expect(
      page.getByText(/sessions/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    const newSessionButton = page.getByRole("button", { name: /new session/i })
    await expect(newSessionButton).not.toBeVisible()
  })

  test("volunteers roster: edit/delete actions are NOT visible", async ({
    page, campaignId,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/roster/, { timeout: 30_000 })

    await expect(
      page.getByText(/roster/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    // Manager-gated row actions should not be visible
    const editVolunteerButton = page.getByRole("button", {
      name: /edit volunteer/i,
    })
    await expect(editVolunteerButton).not.toBeVisible()
  })

  // D-10 justification: Superseded by Phase 73 role gates (SEC-10/11). Viewers are redirected at the route level before reaching settings content; see "Phase 73 role gates (viewer is denied)" describe block below.
  test.skip("campaign settings: Members nav link IS visible but members content is gated", async ({
    page, campaignId,
  }) => {
    // Superseded by Phase 73 role gates (SEC-10, SEC-11): /settings/* routes
    // now redirect viewers to "/" at the page level, so there is no
    // opportunity to assert nav-link / inline-gate visibility from within the
    // settings layout. See the "Phase 73 role gates (viewer is denied)"
    // describe block below for the current assertions.
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await page.waitForURL(/settings/, { timeout: 30_000 })
  })

  test("org dashboard: Create Campaign link is NOT visible", async ({ page, campaignId }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 30_000 },
    )

    // viewer has no org role, so Create Campaign should be hidden
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).not.toBeVisible()
  })

  test("org sidebar: Members and Settings links are NOT visible", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 30_000 },
    )

    // Organization sidebar Members link is gated behind RequireOrgRole minimum="org_admin"
    // Viewer has no org role
    const orgMembersLink = page.getByRole("link", { name: /^members$/i })
    await expect(orgMembersLink).not.toBeVisible()

    const orgSettingsLink = page.getByRole("link", { name: /^settings$/i })
    await expect(orgSettingsLink).not.toBeVisible()
  })
})

/**
 * Phase 73 role gates (viewer is denied) — H23, H24, H25 / SEC-10, SEC-11.
 *
 * Failing-red scaffolds: direct-URL navigation to gated routes must redirect
 * viewers to `/` (home). Today these routes have no page-level guards.
 */
test.describe("Phase 73 role gates (viewer is denied)", () => {
  test.setTimeout(60_000)

  async function expectRedirectedHome(
    page: import("@playwright/test").Page,
  ) {
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(1_500)
    const pathname = new URL(page.url()).pathname
    expect(pathname).toBe("/")
  }

  test("/campaigns/new redirects viewer to /", async ({ page }) => {
    await page.goto("/campaigns/new")
    await expectRedirectedHome(page)
  })

  test("/campaigns/:id/settings/general redirects viewer to /", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await expectRedirectedHome(page)
  })

  test("/campaigns/:id/settings/members redirects viewer to /", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/settings/members`)
    await expectRedirectedHome(page)
  })

  test("/campaigns/:id/settings/danger redirects viewer to /", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
    await expectRedirectedHome(page)
  })

  test("/campaigns/:id/phone-banking/dnc redirects viewer to /", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/phone-banking/dnc`)
    await expectRedirectedHome(page)
  })
})
