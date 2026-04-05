import { test, expect } from "@playwright/test"
import { loginViaZitadel } from "./auth-flow"

test.describe("Login flow", () => {
  test("successful login redirects to campaign or org page", async ({
    browser,
  }) => {
    // Create fresh context without stored auth state
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    await loginViaZitadel(page, "owner")

    // Verify we landed on an authenticated page
    await expect(page).not.toHaveURL(/\/login/)

    await context.close()
  })

  test("invalid credentials show error on ZITADEL login page", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    await page.goto("/login")
    await page.waitForURL(
      (url) => url.port === "8080" || url.pathname.includes("/ui/login") || url.pathname.includes("/loginname"),
      { timeout: 15_000 },
    )

    // Use an E2E test user (not admin@localhost which triggers forced password change)
    const loginInput = page
      .getByLabel(/login ?name/i)
      .or(page.locator("#loginName"))
    await loginInput.fill("owner1@localhost")
    await page.getByRole("button", { name: /next/i }).click()

    // Fill wrong password
    const passwordInput = page
      .getByLabel(/password/i)
      .or(page.locator("#password"))
    await passwordInput.fill("WrongPassword123!")
    await page.getByRole("button", { name: /next/i }).click()

    // Expect error message visible on the login page
    const errorMessage = page
      .getByText(/invalid|incorrect|failed|wrong/i)
      .first()
    await expect(errorMessage).toBeVisible({ timeout: 10_000 })

    await context.close()
  })

  test("unauthenticated access to protected root redirects to /login then ZITADEL", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    // Per Phase 73 (SEC-07/D-01): unauthenticated users hitting a
    // protected route (including "/") are redirected to /login with the
    // original path preserved in the redirect query param, then /login
    // kicks off the OIDC flow to ZITADEL.
    await page.goto("/")

    // Either we land on /login?redirect=/ (if ZITADEL is slow) or we
    // make it all the way to the ZITADEL login UI.
    await page.waitForURL(
      (url) =>
        url.port === "8080" ||
        url.pathname.includes("/ui/login") ||
        url.pathname.includes("/loginname") ||
        /\/login\?redirect=/.test(url.href),
      { timeout: 15_000 },
    )

    await context.close()
  })
})
