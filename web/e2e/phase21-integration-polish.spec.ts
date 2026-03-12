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

test.describe("Phase 21: Integration Polish", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  // CALL-06: DNC reason display
  test.todo("DNC table shows Reason column with human-readable labels")
  test.todo("DNC search filters entries by reason text (e.g. typing 'refused')")
  test.todo("DNC import dialog shows reason selector with Voter Request, Registry Import, Manual options")

  // PHON-05: Session views show call list names
  test.todo("Sessions index table shows call list names as clickable links")
  test.todo("My Sessions table shows call list names as clickable links")

  // PHON-07: Session detail call list name
  test.todo("Session detail Overview tab shows call list name as a clickable link")
  test.todo("Deleted call list shows muted 'Deleted list' fallback text")
})
