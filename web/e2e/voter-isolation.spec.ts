import { test, expect } from "./fixtures"
import { apiGet, apiPost, apiDelete } from "./helpers"

/**
 * Voter Data Isolation E2E Spec
 *
 * Verifies that the API enforces campaign-scoped data isolation:
 * - Voters created under campaign A are NOT accessible via a
 *   different campaign_id in the URL
 * - Direct voter ID access across campaigns returns 403/404
 * - Voter list endpoint scopes results to the URL campaign
 *
 * Simplified single-campaign variant: uses the seed campaign as
 * campaign A and a random UUID as campaign B (no second ZITADEL
 * org needed). Full multi-org E2E is tracked in backlog.
 *
 * Covers: DATA-ISO-01 through DATA-ISO-03
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

const FAKE_CAMPAIGN_ID = "00000000-0000-0000-0000-999999999999"

test.describe("Voter Data Isolation", () => {
  let createdVoterId: string

  test.beforeAll(async ({ browser, campaignId }) => {
    // Create a test voter via API for isolation checks
    const ctx = await browser.newContext({
      storageState: "playwright/.auth/owner.json",
      ignoreHTTPSErrors: true,
    })
    const page = await ctx.newPage()
    // Honor E2E_DEV_SERVER_URL (docker/external web server) — see fixtures.ts for rationale.
    const baseURL = process.env.E2E_DEV_SERVER_URL
      ?? (process.env.CI
        ? "https://localhost:4173"
        : process.env.E2E_USE_DEV_SERVER === "1"
          ? "http://localhost:5173"
          : "https://localhost:4173")
    await page.goto(baseURL)
    await page.waitForURL(
      (url) =>
        !url.pathname.includes("/login") &&
        !url.pathname.includes("/ui/login"),
      { timeout: 30_000 },
    )

    const resp = await apiPost(
      page,
      `/api/v1/campaigns/${campaignId}/voters`,
      {
        first_name: "Isolation",
        last_name: "TestVoter",
        party: "IND",
        source_type: "manual",
      },
    )
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    createdVoterId = body.id

    await ctx.close()
  })

  test.afterAll(async ({ browser, campaignId }) => {
    // Clean up the test voter
    if (!createdVoterId) return
    const ctx = await browser.newContext({
      storageState: "playwright/.auth/owner.json",
      ignoreHTTPSErrors: true,
    })
    const page = await ctx.newPage()
    // Honor E2E_DEV_SERVER_URL (docker/external web server) — see fixtures.ts for rationale.
    const baseURL = process.env.E2E_DEV_SERVER_URL
      ?? (process.env.CI
        ? "https://localhost:4173"
        : process.env.E2E_USE_DEV_SERVER === "1"
          ? "http://localhost:5173"
          : "https://localhost:4173")
    await page.goto(baseURL)
    await page.waitForURL(
      (url) =>
        !url.pathname.includes("/login") &&
        !url.pathname.includes("/ui/login"),
      { timeout: 30_000 },
    )

    await apiDelete(
      page,
      `/api/v1/campaigns/${campaignId}/voters/${createdVoterId}`,
    )
    await ctx.close()
  })

  test("DATA-ISO-01: voter list via wrong campaign returns 403", async ({
    page,
  }) => {
    // Attempt to list voters using a campaign ID the user
    // has no membership in
    const resp = await apiGet(
      page,
      `/api/v1/campaigns/${FAKE_CAMPAIGN_ID}/voters`,
    )
    // No membership in fake campaign -> 403
    expect(resp.status()).toBe(403)
  })

  test("DATA-ISO-02: voter by ID via wrong campaign returns 403", async ({
    page,
  }) => {
    // Even knowing the exact voter ID, accessing it via a
    // different campaign should be denied
    const resp = await apiGet(
      page,
      `/api/v1/campaigns/${FAKE_CAMPAIGN_ID}/voters/${createdVoterId}`,
    )
    expect(resp.status()).toBe(403)
  })

  test("DATA-ISO-03: voter accessible under correct campaign", async ({
    page,
    campaignId,
  }) => {
    // The same voter IS accessible under the correct campaign
    const resp = await apiGet(
      page,
      `/api/v1/campaigns/${campaignId}/voters/${createdVoterId}`,
    )
    expect(resp.ok()).toBeTruthy()
    const voter = await resp.json()
    expect(voter.id).toBe(createdVoterId)
    expect(voter.first_name).toBe("Isolation")
    expect(voter.last_name).toBe("TestVoter")
  })
})
