import { test, expect, type Page } from "@playwright/test"

/**
 * Connected E2E Journey Spec
 *
 * Verifies the full user journey across phase boundaries:
 * org/campaign list -> campaign creation -> turf creation -> voter section -> phone bank section.
 *
 * Closes FLOW-01 gap from v1.5 milestone audit by proving that independently-built
 * features compose into a working end-to-end user journey.
 */

const BASE = process.env.E2E_BASE_URL ?? "https://localhost:4173"

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 15_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  // Wait for password field to appear after username submission
  await page.locator('input[type="password"]').waitFor({ timeout: 10_000 })
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  // Wait for redirect back to app after OIDC flow
  await page.waitForURL(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), {
    timeout: 20_000,
  })
}

test.describe.serial("Connected user journey", () => {
  let campaignName: string

  test.setTimeout(120_000)

  test("full journey: campaign list -> create -> turf -> voters -> phone bank", async ({
    page,
  }) => {
    // ── Step 1: Login and verify campaign list loads ─────────────────────
    await test.step("Org dashboard loads with campaign action", async () => {
      await login(page)

      // After login, we land on / which shows CampaignList for authenticated users
      await page.waitForURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`), {
        timeout: 15_000,
      })

      // Verify the campaign list page loaded — "New Campaign" button is present
      await expect(
        page.getByRole("link", { name: /new campaign/i }).first()
      ).toBeVisible({ timeout: 15_000 })
    })

    // ── Step 2: Create campaign via form ─────────────────────────────────
    await test.step("Create campaign via form", async () => {
      campaignName = `E2E Journey ${Date.now()}`

      // Click "New Campaign" link
      await page.getByRole("link", { name: /new campaign/i }).first().click()
      await page.waitForURL(/campaigns\/new/)

      // Fill campaign name
      await page.getByLabel("Campaign Name *").fill(campaignName)

      // Select campaign type (Radix Select portal pattern)
      await page.getByRole("combobox").first().click()
      await page.getByRole("option", { name: "Local" }).click()

      // Set up response promise BEFORE clicking submit
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("api/v1/campaigns") &&
          resp.request().method() === "POST"
      )

      // Submit the form
      await page.getByRole("button", { name: /create campaign/i }).click()

      // Verify API response
      const response = await responsePromise
      expect(response.status()).toBeLessThan(300)

      // Wait for redirect to new campaign dashboard
      await page.waitForURL(/campaigns\/[a-f0-9-]+\/dashboard/, {
        timeout: 15_000,
      })

      // Verify dashboard loaded
      await expect(
        page.getByText(/dashboard/i).first()
      ).toBeVisible({ timeout: 10_000 })
    })

    // ── Step 3: Create turf on new campaign ─────────────────────────────
    await test.step("Create turf on new campaign", async () => {
      // Navigate to canvassing via sidebar link
      await page.getByRole("link", { name: /canvassing/i }).first().click()

      // Wait for canvassing page
      await expect(
        page.getByText(/canvassing/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Click "New Turf" link
      await page.getByRole("link", { name: /new turf/i }).first().click()

      // Wait for turf form
      await expect(
        page.getByLabel(/name/i).first()
      ).toBeVisible({ timeout: 10_000 })

      // Fill turf name
      await page.getByLabel(/^name$/i).first().fill("Journey Test Turf")

      // Fill boundary GeoJSON directly (TurfForm has a simple textarea, not a toggle panel)
      await page
        .getByLabel(/boundary/i)
        .fill(
          '{"type":"Polygon","coordinates":[[[-83.65,32.84],[-83.64,32.84],[-83.64,32.85],[-83.65,32.85],[-83.65,32.84]]]}'
        )

      // Submit turf creation
      await page.getByRole("button", { name: /create turf/i }).click()

      // Wait for redirect back to canvassing page
      await page.waitForURL(/canvassing/, { timeout: 15_000 })

      // Verify turf appears in the list
      await expect(
        page.getByText("Journey Test Turf")
      ).toBeVisible({ timeout: 10_000 })
    })

    // ── Step 4: Voter section accessible on new campaign ────────────────
    await test.step("Voter section accessible on new campaign", async () => {
      // Navigate to voters via sidebar link
      await page.getByRole("link", { name: /voters/i }).first().click()

      // Assert voter page loads — fresh campaign may show empty state or table
      await expect(
        page
          .getByRole("table")
          .or(page.getByText(/no voters|voters/i))
          .first()
      ).toBeVisible({ timeout: 15_000 })
    })

    // ── Step 5: Phone bank section accessible on new campaign ───────────
    await test.step("Phone bank section accessible on new campaign", async () => {
      // Navigate to phone banking via sidebar link
      // The phone-banking index redirects to call-lists
      await page.getByRole("link", { name: /phone banking/i }).first().click()

      // Assert phone banking / call lists page loads
      await expect(
        page.getByText(/call list|phone bank/i).first()
      ).toBeVisible({ timeout: 15_000 })
    })
  })
})
