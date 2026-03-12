import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const SHIFT_ID = "a87e0475-e016-4ece-b5b7-b786c9e02e58"
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

test("assign dialog disables volunteers without emergency contacts for field shifts", async ({
  page,
}) => {
  await login(page)
  await page.goto(
    `${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/shifts/${SHIFT_ID}`
  )
  await page.waitForTimeout(3000)

  // Click Roster tab
  await page.getByRole("tab", { name: /roster/i }).click()
  await page.waitForTimeout(1000)

  // Click Assign Volunteer button
  await page
    .getByRole("button", { name: /assign volunteer/i })
    .first()
    .click()
  await page.waitForTimeout(1000)

  await page.screenshot({
    path: "test-results/shift-assign-fix-01-dialog.png",
  })

  // 1. Emergency contact warning banner is visible
  const bodyText = await page.locator("body").innerText()
  expect(bodyText).toContain("emergency contact")
  console.log("✓ Emergency contact warning banner visible")

  // 2. At least one volunteer is marked ineligible
  const noContactLabels = page.locator("text=no emergency contact")
  const ineligibleCount = await noContactLabels.count()
  console.log(`Ineligible volunteers (no emergency contact): ${ineligibleCount}`)
  expect(ineligibleCount).toBeGreaterThan(0)

  // 3. Disabled radios exist and enabled radios are selectable
  const disabledRadios = page.locator(
    'input[type="radio"][name="volunteer"][disabled]'
  )
  const enabledRadios = page.locator(
    'input[type="radio"][name="volunteer"]:not([disabled])'
  )
  const disabledCount = await disabledRadios.count()
  const enabledCount = await enabledRadios.count()
  console.log(
    `Disabled: ${disabledCount}, Eligible: ${enabledCount}`
  )
  expect(disabledCount).toBeGreaterThan(0)

  // 4. Eligible volunteers can be selected
  if (enabledCount > 0) {
    await enabledRadios.first().click()
    await page.waitForTimeout(300)
    const isChecked = await enabledRadios.first().isChecked()
    expect(isChecked).toBe(true)
    console.log("✓ Eligible volunteer can be selected")
  }

  await page.screenshot({
    path: "test-results/shift-assign-fix-02-selection.png",
  })
})
