import { test, expect } from "@playwright/test"

/**
 * Phase 73 / C7 / SEC-07 + SEC-08 — Auth Guard Redirect Tests
 *
 * Verify that unauthenticated users on protected routes are redirected
 * to `/login?redirect=<original-path>`.
 */
test.describe("Phase 73: unauthenticated auth-guard redirects", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  async function setupRedirectCapture(page: import("@playwright/test").Page) {
    let capturedRedirect: string | null = null
    await page.exposeFunction("__testCaptureRedirect", (value: string) => {
      capturedRedirect = value
    })
    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (
          key === "post_login_redirect" &&
          typeof (window as unknown as Record<string, unknown>)
            .__testCaptureRedirect === "function"
        ) {
          ;(
            (window as unknown as Record<string, unknown>)
              .__testCaptureRedirect as (v: string) => void
          )(value)
        }
        return orig.call(this, key, value)
      }
    })
    return () => capturedRedirect
  }

  test("unauthenticated user hitting /campaigns/new is redirected to /login?redirect=/campaigns/new", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    const getRedirect = await setupRedirectCapture(page)

    await page.goto("/campaigns/new")

    // Auth guard (beforeLoad) → /login?redirect=/campaigns/new → ZITADEL OIDC.
    // The intermediate /login URL is fleeting; accept either it or ZITADEL.
    await page.waitForURL(
      (url) =>
        url.pathname.includes("/ui/login") ||
        url.pathname.includes("/loginname") ||
        /\/login\?redirect=/.test(url.href),
      { timeout: 15_000 },
    )

    await expect
      .poll(() => getRedirect(), { timeout: 5_000 })
      .toBe("/campaigns/new")

    await context.close()
  })

  test("unauthenticated user hitting deep protected route preserves full path in redirect param", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    const getRedirect = await setupRedirectCapture(page)

    await page.goto(
      "/campaigns/00000000-0000-0000-0000-000000000000/settings/general?tab=danger",
    )

    await page.waitForURL(
      (url) =>
        url.pathname.includes("/ui/login") ||
        url.pathname.includes("/loginname") ||
        /\/login\?redirect=/.test(url.href),
      { timeout: 15_000 },
    )

    await expect
      .poll(() => getRedirect(), { timeout: 5_000 })
      .toMatch(/settings\/general\?tab=danger/)

    await context.close()
  })

  test("unauthenticated user on /login does NOT redirect (public route)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    await page.goto("/login")

    // /login itself is public; it may bounce to ZITADEL OIDC but must not
    // end up back on `/login?redirect=/login`.
    await expect(page).not.toHaveURL(/\/login\?redirect=/, { timeout: 5_000 })

    await context.close()
  })
})
