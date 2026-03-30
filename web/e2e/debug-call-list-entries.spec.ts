import { test, expect } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

let CAMPAIGN_ID: string

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

  // Use stored auth state (already authenticated via setup project)
  CAMPAIGN_ID = await getSeedCampaignId(page)

  // Navigate to call lists
  await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`)
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
