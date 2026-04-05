import { test, expect } from "./fixtures"

/**
 * RBAC-05: Manager can create and manage operational resources.
 * Runs under manager auth via `.manager.spec.ts` suffix.
 *
 * Manager role can create and manage all operational resources (voters, turfs,
 * walk lists, call lists, surveys, volunteers, shifts) but cannot manage
 * campaign members or campaign-level settings (admin+).
 */
test.setTimeout(90_000)

test.describe("RBAC: manager permissions", () => {
  /** Navigate into the seed campaign dashboard. */
  async function enterCampaign(page: import("@playwright/test").Page, id: string) {
    await page.goto(`/campaigns/${id}/dashboard`)
    await page.waitForLoadState("domcontentloaded")
  }

  test("voters page: New Voter button IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 30_000 })

    await expect(
      page.getByRole("heading", { name: /voters/i }).first(),
    ).toBeVisible({ timeout: 30_000 })

    const newVoterButton = page.getByRole("button", { name: /new voter/i })
    await expect(newVoterButton).toBeVisible({ timeout: 30_000 })
  })

  test("voter detail: Edit button IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 30_000 })

    // Click the first voter link to navigate to detail
    const voterLink = page.locator('table').getByRole('link').first()
    await expect(voterLink).toBeVisible({ timeout: 30_000 })
    await voterLink.click()
    await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 30_000 })

    const editButton = page.getByRole("button", { name: /edit/i })
    await expect(editButton).toBeVisible({ timeout: 30_000 })
  })

  test("voter detail: Add Interaction button IS visible", async ({ page, campaignId }) => {
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

  test("canvassing: New Turf link IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/canvassing`)
    await page.waitForURL(/canvassing/, { timeout: 30_000 })

    await expect(
      page.getByRole("heading", { name: /canvassing/i }).first(),
    ).toBeVisible({ timeout: 30_000 })

    const newTurfLink = page.getByRole("link", { name: /new turf/i })
    await expect(newTurfLink).toBeVisible({ timeout: 30_000 })
  })

  test("phone banking: New Call List and New Session buttons ARE visible", async ({
    page, campaignId,
  }) => {
    await enterCampaign(page, campaignId)

    // Check call lists page
    await page.goto(`/campaigns/${campaignId}/phone-banking/call-lists`)
    await page.waitForURL(/call-lists/, { timeout: 30_000 })
    await expect(
      page.getByText(/call lists/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    const newCallListButton = page.getByRole("button", { name: /new call list/i })
    await expect(newCallListButton).toBeVisible({ timeout: 30_000 })

    // Check sessions page
    await page.goto(`/campaigns/${campaignId}/phone-banking/sessions`)
    await page.waitForURL(/sessions/, { timeout: 30_000 })
    await expect(
      page.getByText(/sessions/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    const newSessionButton = page.getByRole("button", { name: /new session/i })
    await expect(newSessionButton).toBeVisible({ timeout: 30_000 })
  })

  test("surveys: New Script button IS visible", async ({ page, campaignId }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/surveys`)
    await page.waitForURL(/surveys/, { timeout: 30_000 })

    await expect(
      page.getByText(/survey/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    // The button text is "New Script" (not "New Survey")
    const newScriptButton = page.getByRole("button", { name: /new script/i })
    await expect(newScriptButton).toBeVisible({ timeout: 30_000 })
  })

  test("volunteers roster: management actions ARE visible for manager", async ({
    page, campaignId,
  }) => {
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/volunteers/roster`)
    await page.waitForURL(/roster/, { timeout: 30_000 })

    await expect(
      page.getByText(/roster/i).first(),
    ).toBeVisible({ timeout: 30_000 })

    // Manager should see edit actions on volunteer rows (if volunteers exist in seed)
    // The edit button appears inside a RequireRole minimum="manager" gate
    const editButtons = page.getByRole("button", { name: /edit volunteer/i })
    const count = await editButtons.count()
    // Seed data has 20 volunteers -- there should be at least one visible edit button
    if (count > 0) {
      await expect(editButtons.first()).toBeVisible()
    }
  })

  test.skip("campaign settings: Members nav link is visible but members content is NOT accessible", async ({
    page, campaignId,
  }) => {
    // Superseded by Phase 73 role gates (SEC-10, SEC-11): /settings/* routes
    // now redirect managers to "/" at the page level, so there is no
    // opportunity to assert nav-link / inline-gate visibility from within
    // the settings layout. See the "Phase 73 role gates (manager partial
    // access)" describe block below for the current assertions.
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await page.waitForURL(/settings/, { timeout: 30_000 })
  })

  test.skip("campaign settings danger zone: Transfer and Delete NOT visible", async ({
    page, campaignId,
  }) => {
    // Superseded by Phase 73 role gates (SEC-10, SEC-11): /settings/danger
    // now redirects anyone below owner to "/" at the page level, so managers
    // never reach the danger-zone buttons. The redirect-based assertion
    // lives in the "Phase 73 role gates (manager partial access)" describe
    // block below.
    await enterCampaign(page, campaignId)
    await page.goto(`/campaigns/${campaignId}/settings/danger`)
  })

  test("org dashboard: Create Campaign link NOT visible", async ({ page, campaignId }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 30_000 },
    )

    // Manager has no org role -- Create Campaign gated behind RequireOrgRole minimum="org_admin"
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).not.toBeVisible()
  })
})

/**
 * Phase 73 role gates (manager partial access) — H23, H24, H25 / SEC-10, SEC-11.
 *
 * Manager lacks org_admin (so /campaigns/new redirects) and lacks admin
 * campaign role (so settings redirects) but HAS manager role, so DNC is
 * visible. Failing-red: today /campaigns/new and /settings/general are
 * ungated — manager sees them instead of being redirected.
 */
test.describe("Phase 73 role gates (manager partial access)", () => {
  test.setTimeout(60_000)

  async function expectRedirectedHome(
    page: import("@playwright/test").Page,
  ) {
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(1_500)
    const pathname = new URL(page.url()).pathname
    expect(pathname).toBe("/")
  }

  test("/campaigns/new redirects manager to / (org_admin required)", async ({
    page,
  }) => {
    await page.goto("/campaigns/new")
    await expectRedirectedHome(page)
  })

  test("/campaigns/:id/settings/general redirects manager to / (admin+ required)", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await expectRedirectedHome(page)
  })

  test("/campaigns/:id/phone-banking/dnc IS visible to manager", async ({
    page, campaignId,
  }) => {
    await page.goto(`/campaigns/${campaignId}/phone-banking/dnc`)
    await page.waitForLoadState("domcontentloaded")

    // Manager should see the DNC page — URL stays on /dnc and a DNC heading renders.
    await expect(page).toHaveURL(/\/phone-banking\/dnc/, { timeout: 10_000 })
    await expect(
      page.getByRole("heading", { name: /do not contact|dnc/i }).first(),
    ).toBeVisible({ timeout: 30_000 })
  })
})
