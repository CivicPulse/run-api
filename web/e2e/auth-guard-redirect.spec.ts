import { test, expect } from "@playwright/test"

/**
 * Phase 73 / C7 / SEC-07 + SEC-08 — Auth Guard Redirect Tests
 *
 * Failing-red scaffolds that encode the unauthenticated-redirect behavior
 * Plan 02 must deliver. Today, `web/src/routes/__root.tsx:245` has a bug
 * (`!isAuthenticated || isPublicRoute`) that RENDERS protected content
 * unwrapped for unauthenticated users instead of redirecting to
 * `/login?redirect=<original-path>`.
 *
 * These tests MUST fail today and go green once __root.tsx is fixed to
 * emit `<Navigate to="/login" search={{ redirect: ... }} />` for
 * unauthenticated users on non-public routes.
 */
test.describe("Phase 73: unauthenticated auth-guard redirects", () => {
  // Force unauthenticated context — no storage state at all.
  test.use({ storageState: { cookies: [], origins: [] } })

  test("unauthenticated user hitting /campaigns/new is redirected to /login?redirect=/campaigns/new", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    await page.goto("/campaigns/new")

    // Must land on /login and carry the redirect param.
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 15_000 })
    // Accept either urlencoded or raw form of the original path.
    await expect(page).toHaveURL(
      /redirect=(%2Fcampaigns%2Fnew|\/campaigns\/new)/,
    )

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

    await page.goto(
      "/campaigns/00000000-0000-0000-0000-000000000000/settings/general?tab=danger",
    )

    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 15_000 })
    // The encoded redirect must preserve the settings/general path.
    await expect(page).toHaveURL(
      /redirect=.*(settings%2Fgeneral|settings\/general)/,
    )

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
