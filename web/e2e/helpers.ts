import type { Page, APIResponse } from "@playwright/test"

/**
 * Navigate to the seed campaign (Macon-Bibb Demo Campaign) and return its UUID.
 * Works by going to the org dashboard and clicking the campaign card.
 */
export async function navigateToSeedCampaign(page: Page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/login") &&
      !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  await page.waitForLoadState("networkidle")
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb demo/i })
    .first()
  await campaignLink.waitFor({ state: "visible", timeout: 30_000 })
  await campaignLink.click()
  await page.waitForURL(/campaigns\/([a-f0-9-]+)/, { timeout: 10_000 })
  return page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
}

/**
 * Get the seed campaign ID without navigating into it.
 * Navigates to org dashboard, extracts campaign ID from the card link href,
 * then returns it for use in direct page.goto() calls.
 */
export async function getSeedCampaignId(page: Page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) =>
      !url.pathname.includes("/login") &&
      !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  await page.waitForLoadState("networkidle")
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb demo/i })
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
export async function apiGet(page: Page, url: string): Promise<APIResponse> {
  return page.request.get(url, { headers: await authHeaders(page) })
}

/**
 * Authenticated POST request via page.request.
 */
export async function apiPost(
  page: Page,
  url: string,
  data?: unknown,
): Promise<APIResponse> {
  return page.request.post(url, {
    data,
    headers: await authHeaders(page),
  })
}

/**
 * Authenticated PATCH request via page.request.
 */
export async function apiPatch(
  page: Page,
  url: string,
  data?: unknown,
): Promise<APIResponse> {
  return page.request.patch(url, {
    data,
    headers: await authHeaders(page),
  })
}

/**
 * Authenticated DELETE request via page.request.
 */
export async function apiDelete(page: Page, url: string): Promise<APIResponse> {
  return page.request.delete(url, { headers: await authHeaders(page) })
}
