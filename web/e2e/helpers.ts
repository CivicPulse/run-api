import type { Page, APIResponse } from "@playwright/test"

/**
 * Get the seed campaign ID without navigating into it.
 * Uses the /me/campaigns API to find the seed campaign by name.
 */
export async function getSeedCampaignId(page: Page): Promise<string> {
  // First, ensure we're authenticated by navigating to the app
  await page.goto("/")
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/login") &&
      !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  await page.waitForLoadState("domcontentloaded")

  // Try to find the campaign ID via API (retries for parallel resilience).
  // Use /me/campaigns (flat list of user's memberships) instead of /campaigns
  // (paginated, newest first) to avoid E2E test campaigns pushing seed off page 1.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const token = await getAuthToken(page)
      const resp = await page.request.get("/api/v1/me/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok()) {
        const campaigns = await resp.json()
        const seed = campaigns.find(
          (c: { campaign_name?: string; name?: string }) =>
            /macon.?bibb/i.test(c.campaign_name ?? c.name ?? ""),
        )
        if (seed?.campaign_id ?? seed?.id) return seed.campaign_id ?? seed.id
      }
      // Rate-limited or transient error — back off before retrying
      if (attempt < 4) await page.waitForTimeout(2000 * (attempt + 1))
    } catch {
      // Retry after a short delay on failure
      if (attempt < 4) await page.waitForTimeout(2000 * (attempt + 1))
    }
  }

  // Fallback: try to find the campaign link on the page
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb/i })
    .first()
  await campaignLink.waitFor({ state: "visible", timeout: 30_000 })
  const href = await campaignLink.getAttribute("href")
  const match = href?.match(/campaigns\/([a-f0-9-]+)/)
  if (!match) throw new Error("Could not find seed campaign ID from card link")
  return match[1]
}

/**
 * Extract the OIDC access token from localStorage.
 * The frontend stores auth via oidc-client-ts in a key like
 * `oidc.user:{authority}:{client_id}`.
 */
export async function getAuthToken(page: Page): Promise<string> {
  return page.evaluate(() => {
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
}

/**
 * Get Authorization headers for page.request calls.
 * Usage: `page.request.get(url, { headers: await authHeaders(page) })`
 */
export async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await getAuthToken(page)
  return { Authorization: `Bearer ${token}` }
}

/**
 * Authenticated GET request via page.request.
 */
export async function apiGet(page: Page, url: string, timeout = 60_000): Promise<APIResponse> {
  return page.request.get(url, { headers: await authHeaders(page), timeout })
}

/**
 * Authenticated POST request via page.request.
 */
export async function apiPost(
  page: Page,
  url: string,
  data?: unknown,
  timeout = 60_000,
): Promise<APIResponse> {
  return page.request.post(url, {
    data,
    headers: await authHeaders(page),
    timeout,
  })
}

/**
 * Authenticated PATCH request via page.request.
 */
export async function apiPatch(
  page: Page,
  url: string,
  data?: unknown,
  timeout = 60_000,
): Promise<APIResponse> {
  return page.request.patch(url, {
    data,
    headers: await authHeaders(page),
    timeout,
  })
}

/**
 * Authenticated DELETE request via page.request.
 */
export async function apiDelete(page: Page, url: string, timeout = 60_000): Promise<APIResponse> {
  return page.request.delete(url, {
    headers: await authHeaders(page),
    timeout,
  })
}
