import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

test("debug call list entries", async ({ page }) => {
  const apiRequests: { url: string; status: number; body: string }[] = []

  page.on("response", async (response) => {
    const url = response.url()
    if (url.includes("/api/v1/") && url.includes("call-list")) {
      try {
        const body = await response.text()
        apiRequests.push({ url, status: response.status(), body })
      } catch {
        apiRequests.push({ url, status: response.status(), body: "(unreadable)" })
      }
    }
  })

  // Go to /login — auto-triggers signinRedirect to ZITADEL
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 15_000 })
  console.log("At ZITADEL:", page.url())
  await page.screenshot({ path: "test-results/01-zitadel-login.png" })

  // Fill username
  await page.locator('input').first().fill("tester")
  await page.screenshot({ path: "test-results/02-username-filled.png" })
  await page.click('button[type="submit"]')

  // Wait for password field
  await page.waitForTimeout(1500)
  await page.screenshot({ path: "test-results/03-password-screen.png" })
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')

  // Wait for OIDC callback to complete and redirect to app
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 20_000 })
  console.log("Redirected to:", page.url())
  await page.waitForTimeout(2000)
  await page.screenshot({ path: "test-results/04-back-in-app.png" })

  // Navigate to call lists
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "test-results/05-call-lists.png" })
  console.log("Call lists page URL:", page.url())

  // Click first call list
  const firstLink = page.locator("table a").first()
  const href = await firstLink.getAttribute("href").catch(() => null)
  console.log("First link href:", href)

  if (href) {
    await firstLink.click()
    await page.waitForURL(/call-lists\//, { timeout: 5_000 })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/06-call-list-detail.png" })

    const bodyText = await page.locator("body").innerText()
    console.log("\n=== PAGE TEXT (500 chars) ===")
    console.log(bodyText.slice(0, 500))
  }

  console.log("\n=== CALL-LIST API REQUESTS ===")
  for (const req of apiRequests) {
    console.log(`\n[${req.status}] ${req.url}`)
    try {
      const parsed = JSON.parse(req.body)
      console.log(JSON.stringify(parsed, null, 2).slice(0, 600))
    } catch {
      console.log(req.body.slice(0, 300))
    }
  }

  expect(true).toBe(true)
})
