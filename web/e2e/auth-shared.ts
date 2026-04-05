import type { Page } from "@playwright/test"

function matchesZitadelLogin(url: URL): boolean {
  const expectedHost = process.env.E2E_ZITADEL_HOST
  const expectedPort = process.env.E2E_ZITADEL_PORT

  if (expectedHost && url.hostname === expectedHost) return true
  if (expectedPort && url.port === expectedPort) return true

  return (
    url.pathname.includes("/ui/login") ||
    url.pathname.includes("/loginname") ||
    url.pathname.includes("/login")
  )
}

export async function waitForZitadelLogin(page: Page): Promise<void> {
  await page.waitForURL((url) => matchesZitadelLogin(url), { timeout: 30_000 })
}

export async function waitForPostLoginApp(page: Page): Promise<void> {
  await page.waitForURL(
    (url) =>
      !matchesZitadelLogin(url) &&
      !url.pathname.includes("/callback") &&
      !url.pathname.endsWith("/login"),
    { timeout: 30_000 },
  )
}
