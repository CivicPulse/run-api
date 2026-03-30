import type { Page } from "@playwright/test"

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
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb demo/i })
    .first()
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
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb demo/i })
    .first()
  const href = await campaignLink.getAttribute("href")
  const match = href?.match(/campaigns\/([a-f0-9-]+)/)
  if (!match) throw new Error("Could not find seed campaign ID from card link")
  return match[1]
}
