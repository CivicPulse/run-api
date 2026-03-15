import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 15_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 20_000 })
  await page.waitForTimeout(2000)
}

/** Navigate to voter list page and open the filter panel */
async function openVoterFilters(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
  await page.waitForTimeout(2000)
  await page.getByRole("button", { name: /filters/i }).click()
  await page.waitForTimeout(500)
}

test.describe("Phase 28: Filter chips E2E", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("propensity range chip appears and dismiss clears filter", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // Expand the "Scoring" accordion section
    const scoringTrigger = page.locator("button").filter({ hasText: "Scoring" })
    await scoringTrigger.click()
    await page.waitForTimeout(500)

    // Interact with the General Propensity slider via keyboard
    const generalSection = page.locator("text=General Propensity").locator("..")
    const sliderThumbs = generalSection.locator('[role="slider"]')
    const minThumb = sliderThumbs.first()
    await minThumb.focus()
    for (let i = 0; i < 30; i++) {
      await minThumb.press("ArrowRight")
    }
    await minThumb.blur()
    await page.waitForTimeout(1000)

    // Verify a propensity chip appeared
    const propChip = page.locator('[class*="bg-amber"]').filter({ hasText: /Gen\. Propensity/ })
    await expect(propChip).toBeVisible({ timeout: 5000 })

    // Click the dismiss button inside the chip
    const dismissBtn = propChip.locator('button[aria-label*="Remove"]')
    await dismissBtn.click()
    await page.waitForTimeout(500)

    // Verify chip disappeared
    await expect(propChip).not.toBeVisible()

    await page.screenshot({
      path: "test-results/p28-01-propensity-chip-dismiss.png",
    })
  })

  test("multi-select chip appears with category color and dismiss clears filter", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // Demographics section is open by default. Check party checkboxes.
    const demCheckbox = page
      .locator("label")
      .filter({ hasText: /^DEM$/ })
      .locator('[role="checkbox"]')
    const repCheckbox = page
      .locator("label")
      .filter({ hasText: /^REP$/ })
      .locator('[role="checkbox"]')

    if (await demCheckbox.isVisible().catch(() => false)) {
      await demCheckbox.click()
      await page.waitForTimeout(300)
    }
    if (await repCheckbox.isVisible().catch(() => false)) {
      await repCheckbox.click()
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)

    // Verify a party chip appeared with blue (demographics) color
    const partyChip = page.locator('[class*="bg-blue"]').filter({ hasText: /Party:.*DEM/ })
    await expect(partyChip).toBeVisible({ timeout: 5000 })

    // Click dismiss
    const dismissBtn = partyChip.locator('button[aria-label*="Remove"]')
    await dismissBtn.click()
    await page.waitForTimeout(500)

    // Verify chip disappeared
    await expect(partyChip).not.toBeVisible()

    await page.screenshot({
      path: "test-results/p28-02-party-chip-dismiss.png",
    })
  })

  test("mailing address chip appears and dismiss clears filter", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // Expand the "Location" accordion section
    const locationTrigger = page
      .locator("button")
      .filter({ hasText: "Location" })
    await locationTrigger.click()
    await page.waitForTimeout(500)

    // Fill mailing city input
    const mailingCityInput = page
      .locator("text=Mailing City")
      .locator("..")
      .locator('input[placeholder="City"]')
    await mailingCityInput.fill("Springfield")
    await page.waitForTimeout(1000)

    // Verify a mailing city chip appeared with green (location) color
    const mailChip = page.locator('[class*="bg-green"]').filter({ hasText: /Mail City: Springfield/ })
    await expect(mailChip).toBeVisible({ timeout: 5000 })

    // Click dismiss
    const dismissBtn = mailChip.locator('button[aria-label*="Remove"]')
    await dismissBtn.click()
    await page.waitForTimeout(500)

    // Verify chip disappeared
    await expect(mailChip).not.toBeVisible()

    await page.screenshot({
      path: "test-results/p28-03-mailing-chip-dismiss.png",
    })
  })

  test("Clear All removes all filter chips including new types", async ({
    page,
  }) => {
    await openVoterFilters(page)

    // Set a party filter (demographics)
    const demCheckbox = page
      .locator("label")
      .filter({ hasText: /^DEM$/ })
      .locator('[role="checkbox"]')
    if (await demCheckbox.isVisible().catch(() => false)) {
      await demCheckbox.click()
      await page.waitForTimeout(300)
    }

    // Expand Location and set mailing city
    const locationTrigger = page
      .locator("button")
      .filter({ hasText: "Location" })
    await locationTrigger.click()
    await page.waitForTimeout(500)
    const mailingCityInput = page
      .locator("text=Mailing City")
      .locator("..")
      .locator('input[placeholder="City"]')
    await mailingCityInput.fill("Springfield")
    await page.waitForTimeout(1000)

    // Verify multiple chips are visible
    const chipRow = page.locator(".flex.flex-wrap.gap-2").first()
    const chips = chipRow.locator('[class*="gap-1"]')
    await expect(chips.first()).toBeVisible({ timeout: 5000 })

    // Click "Clear all" button
    const clearBtn = page.getByRole("button", { name: /clear all/i })
    await clearBtn.click()
    await page.waitForTimeout(500)

    // Verify no filter chips remain (the chip row itself should disappear)
    await expect(clearBtn).not.toBeVisible()

    await page.screenshot({
      path: "test-results/p28-04-clear-all.png",
    })
  })
})
