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

test("volunteer sidebar nav shows Roster, Tags, Register", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/roster`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/vol-01-sidebar-nav.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Sidebar text (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).toContain("Roster")
  expect(bodyText).toContain("Tags")
  expect(bodyText).toContain("Register")
})

test("roster page renders DataTable and filter controls", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/roster`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/vol-02-roster.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Roster page (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  // Should show either volunteer data or an empty state
  const hasContent =
    bodyText.includes("Name") ||
    bodyText.includes("No volunteers") ||
    bodyText.includes("Search by name")
  expect(hasContent).toBe(true)
})

test("tags page renders CRUD DataTable", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/tags`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/vol-03-tags.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Tags page (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  // Should show tags table or empty state
  const hasContent =
    bodyText.includes("Create Tag") ||
    bodyText.includes("No volunteer tags") ||
    bodyText.includes("Name")
  expect(hasContent).toBe(true)
})

test("register page renders dual-mode form", async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/register`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/vol-04-register.png" })

  const bodyText = await page.locator("body").innerText()
  console.log("Register page (500 chars):", bodyText.slice(0, 500))

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  // Form should show name fields and skills
  expect(bodyText).toMatch(/first name/i)
  expect(bodyText).toMatch(/last name/i)
})

test("volunteer routes do not 404", async ({ page }) => {
  await login(page)

  const routes = [
    `/campaigns/${CAMPAIGN_ID}/volunteers/roster`,
    `/campaigns/${CAMPAIGN_ID}/volunteers/tags`,
    `/campaigns/${CAMPAIGN_ID}/volunteers/register`,
  ]

  for (const route of routes) {
    await page.goto(`${BASE}${route}`)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator("body").innerText()
    expect(bodyText, `Route ${route} returned 404`).not.toContain("404")
    expect(bodyText, `Route ${route} returned Not Found`).not.toContain("Not Found")
    console.log(`✓ ${route} — OK`)
  }

  await page.screenshot({ path: "test-results/vol-05-routes-final.png" })
})
