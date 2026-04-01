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
      { timeout: 30_000 },
    )
    // Wait for app to finish rendering (ensures OIDC token is written to localStorage)
    await page.waitForLoadState("domcontentloaded")

    // Extract auth token from localStorage (retry until OIDC token appears)
    let token: string | undefined
    for (let i = 0; i < 10; i++) {
      token = await page.evaluate(() => {
        for (let j = 0; j < localStorage.length; j++) {
          const key = localStorage.key(j)!
          if (key.startsWith("oidc.user:")) {
            try {
              const user = JSON.parse(localStorage.getItem(key)!)
              if (user?.access_token) return user.access_token as string
            } catch { /* skip */ }
          }
        }
        return undefined
      })
      if (token) break
      await page.waitForTimeout(500)
    }
    if (!token) throw new Error("No OIDC access token found in localStorage")

    // Add initial jitter (0–500ms) to spread out parallel workers hitting the API simultaneously
    await page.waitForTimeout(Math.floor(Math.random() * 500))

    // Resolve campaign ID via API (with retries for rate-limit / transient / timeout errors)
    let campaignId: string | undefined
    let lastRespStatus: number | undefined
    let lastRespBody: string | undefined
    let lastError: string | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const resp = await page.request.get("/api/v1/me/campaigns", {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30_000, // per-request timeout — needs headroom for 16 parallel workers
        })
        lastRespStatus = resp.status()
        lastError = undefined
        if (resp.ok()) {
          const campaigns = await resp.json()
          if (Array.isArray(campaigns)) {
            const seed = campaigns.find(
              (c: { campaign_id?: string; campaign_name?: string; name?: string }) => {
                const n = c.campaign_name ?? c.name ?? ""
                // Match original seed name OR known CAMP-01 rename (transient during tests)
                return /macon.?bibb/i.test(n) || /E2E Test Campaign \(CAMP-01\)/i.test(n)
              },
            )
            campaignId = seed?.campaign_id ?? seed?.id
            if (campaignId) break
            // Array is valid but seed campaign not found - log for debugging
            const names = campaigns.slice(0, 3).map((c: { campaign_name?: string }) => c.campaign_name).join(", ")
            console.warn(`[fixture] Attempt ${attempt + 1}: campaigns array has ${campaigns.length} entries, no macon-bibb match. First 3: ${names}`)
          } else {
            lastRespBody = JSON.stringify(campaigns).substring(0, 200)
            console.warn(`[fixture] Attempt ${attempt + 1}: API returned non-array:`, lastRespBody)
          }
        } else {
          lastRespBody = await resp.text().catch(() => "(unreadable)")
          console.warn(`[fixture] Attempt ${attempt + 1}: API returned HTTP ${lastRespStatus}:`, lastRespBody.substring(0, 200))
        }
      } catch (err) {
        // Request-level timeout or network error — log and retry
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`[fixture] Attempt ${attempt + 1}: request failed:`, lastError.substring(0, 200))
      }
      if (attempt < 4) {
        // Backoff: 429 → 3-5s, timeout → 2-4s, other → progressive 1-4s
        const backoffMs = lastRespStatus === 429
          ? 3_000 + Math.floor(Math.random() * 2_000)
          : lastError?.includes("Timeout")
            ? 2_000 + Math.floor(Math.random() * 2_000)
            : 1000 * (attempt + 1)
        await page.waitForTimeout(backoffMs)
      }
    }
    if (!campaignId) throw new Error(`Could not find seed campaign via API (last status: ${lastRespStatus}, error: ${lastError ?? "none"}, body: ${lastRespBody?.substring(0, 100)})`)

    await context.close()
    await use(campaignId)
  }, { scope: "worker" }],
})

export { expect }
