import { test as base, expect } from "@playwright/test"

// Worker-scoped fixture: resolves seed campaign ID once per worker process.
// Eliminates ~120 redundant navigateToSeedCampaign() calls (each 3-8s).
export const test = base.extend<{}, { campaignId: string }>({
  campaignId: [async ({ browser }, use) => {
    // Create a temporary page to resolve the campaign ID via API
    const context = await browser.newContext({
      storageState: "playwright/.auth/owner.json",
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    // Navigate to app to establish auth context
    const baseURL = process.env.CI
      ? "https://localhost:4173"
      : (process.env.E2E_USE_DEV_SERVER === "1" ? "http://localhost:5173" : "https://localhost:4173")
    await page.goto(baseURL)
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Extract auth token from localStorage
    const token = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (key.startsWith("oidc.user:")) {
          try {
            const user = JSON.parse(localStorage.getItem(key)!)
            if (user?.access_token) return user.access_token as string
          } catch { /* skip */ }
        }
      }
      throw new Error("No OIDC access token found in localStorage")
    })

    // Resolve campaign ID via API
    const resp = await page.request.get("/api/v1/me/campaigns", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const campaigns = await resp.json()
    const seed = campaigns.find(
      (c: { campaign_id?: string; campaign_name?: string; name?: string }) =>
        /macon.?bibb/i.test(c.campaign_name ?? c.name ?? ""),
    )
    const campaignId = seed?.campaign_id ?? seed?.id
    if (!campaignId) throw new Error("Could not find seed campaign via API")

    await context.close()
    await use(campaignId)
  }, { scope: "worker" }],
})

export { expect }
