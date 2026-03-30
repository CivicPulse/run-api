import { test, expect } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

let CAMPAIGN_ID: string


test("call list page renders with heading and table or empty state", async ({ page }) => {
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`)
  await page.waitForTimeout(3000)

  const bodyText = await page.locator("body").innerText()

  expect(bodyText).not.toContain("404")
  expect(bodyText).not.toContain("Not Found")

  const hasContent =
    bodyText.includes("Call Lists") ||
    bodyText.includes("No call lists yet") ||
    bodyText.includes("New Call List")
  expect(hasContent).toBe(true)
})

test("DNC list page renders with search input and action buttons", async ({ page }) => {
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/dnc`)
  await page.waitForTimeout(3000)

  const bodyText = await page.locator("body").innerText()

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
  CAMPAIGN_ID = await getSeedCampaignId(page)

  const routes = [
    `/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`,
    `/campaigns/${CAMPAIGN_ID}/phone-banking/dnc`,
  ]

  for (const route of routes) {
    await page.goto(`${route}`)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator("body").innerText()
    expect(bodyText, `Route ${route} returned 404`).not.toContain("404")
    expect(bodyText, `Route ${route} returned Not Found`).not.toContain(
      "Not Found",
    )
  }
})
