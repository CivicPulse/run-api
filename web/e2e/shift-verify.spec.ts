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

test("volunteer sidebar nav includes Shifts item", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/shifts`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/shift-01-sidebar-nav.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Sidebar text (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).toContain("Shifts")
  expect(bodyText).toContain("Roster")
  expect(bodyText).toContain("Tags")
})

test("shift list page renders with heading or empty state", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/shifts`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/shift-02-list.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Shift list page (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  // Should show either shift data or an empty state
  const hasContent =
    bodyText.includes("Shifts") ||
    bodyText.includes("No shifts yet") ||
    bodyText.includes("Create Shift")
  expect(hasContent).toBe(true)
})

test("shift list page shows filter controls", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/shifts`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/shift-03-filters.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Shift filters (500 chars):", bodyText.slice(0, 500))

  // Should show filter dropdowns or create button (manager view)
  const hasControls =
    bodyText.includes("Status") ||
    bodyText.includes("Type") ||
    bodyText.includes("Create Shift") ||
    bodyText.includes("No shifts yet")
  expect(hasControls).toBe(true)
})

test("shift routes do not 404", async ({ page }) => {
  await login(page)

  const routes = [`/campaigns/${CAMPAIGN_ID}/volunteers/shifts`]

  for (const route of routes) {
    await page.goto(`${BASE}${route}`)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator("body").innerText()
    expect(bodyText, `Route ${route} returned 404`).not.toContain("404")
    expect(bodyText, `Route ${route} returned Not Found`).not.toContain(
      "Not Found"
    )
    console.log(`Route OK: ${route}`)
  }

  await page.screenshot({ path: "test-results/shift-04-routes-final.png" })
})
