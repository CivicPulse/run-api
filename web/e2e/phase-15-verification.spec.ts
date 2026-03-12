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

test("call list page renders with heading and table or empty state", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/p15-01-call-lists.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Call lists page (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  const hasContent =
    bodyText.includes("Call Lists") ||
    bodyText.includes("No call lists yet") ||
    bodyText.includes("New Call List")
  expect(hasContent).toBe(true)
})

test("DNC list page renders with search input and action buttons", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/phone-banking/dnc`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/p15-02-dnc-list.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("DNC page (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  const hasContent =
    bodyText.includes("DNC List") ||
    bodyText.includes("Add Number") ||
    bodyText.includes("Import from file") ||
    bodyText.includes("No DNC entries")
  expect(hasContent).toBe(true)
})

test("phone banking routes do not 404", async ({ page }) => {
  await login(page)

  const routes = [
    `/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`,
    `/campaigns/${CAMPAIGN_ID}/phone-banking/dnc`,
  ]

  for (const route of routes) {
    await page.goto(`${BASE}${route}`)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator("body").innerText()
    expect(bodyText, `Route ${route} returned 404`).not.toContain("404")
    expect(bodyText, `Route ${route} returned Not Found`).not.toContain(
      "Not Found",
    )
    console.log(`Route OK: ${route}`)
  }

  await page.screenshot({ path: "test-results/p15-03-routes-final.png" })
})
