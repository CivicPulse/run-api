import { test, expect } from "@playwright/test"

test.describe("Login flow", () => {
  test("successful login redirects to campaign or org page", async ({
    browser,
  }) => {
    // Create fresh context without stored auth state
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    // Navigate to /login which triggers OIDC signinRedirect to ZITADEL
    await page.goto("/login")

    // Wait for redirect to ZITADEL login page (localhost:8080)
    await page.waitForURL(
      (url) => url.port === "8080" || url.pathname.includes("/ui/login") || url.pathname.includes("/loginname"),
      { timeout: 15_000 },
    )

    // Use an E2E test user (not admin@localhost which triggers forced password change)
    const loginInput = page
      .getByLabel(/login ?name/i)
      .or(page.locator("#loginName"))
    await loginInput.fill("owner1@localhost")

    // Click Next to proceed to password step
    await page.getByRole("button", { name: /next/i }).click()

    // Fill password
    const passwordInput = page
      .getByLabel(/password/i)
      .or(page.locator("#password"))
    await passwordInput.fill("Owner1234!")

    // Click Next to submit credentials
    await page.getByRole("button", { name: /next/i }).click()

    // Handle MFA setup screen if it appears
    const mfaHeading = page.getByText(/2-Factor Setup|MFA Setup/i)
    if (await mfaHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const skipButton = page.getByRole("button", { name: /skip/i })
        .or(page.getByRole("link", { name: /skip/i }))
      await skipButton.click({ timeout: 5_000 })
    }

    // Wait for redirect back to app after successful auth
    await page.waitForURL(
      (url) =>
        !url.pathname.includes("/login") &&
        !url.pathname.includes("/ui/login") &&
        !url.pathname.includes("/callback"),
      { timeout: 30_000 },
    )

    // Verify we landed on an authenticated page
    await expect(page).not.toHaveURL(/\/login/)

    await context.close()
  })

  test("invalid credentials show error on ZITADEL login page", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    // Navigate to /login to trigger OIDC redirect
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

  test("unauthenticated access shows landing page with sign-in link", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    // Access root as unauthenticated user
    await page.goto("/")

    // Should see the landing page with Sign In button (not the dashboard)
    const signInLink = page.getByRole("link", { name: /sign in/i })
    await expect(signInLink).toBeVisible({ timeout: 15_000 })

    // Clicking Sign In navigates to /login route
    await signInLink.click()

    // /login triggers OIDC redirect to ZITADEL
    await page.waitForURL(
      (url) => url.port === "8080" || url.pathname.includes("/ui/login") || url.pathname.includes("/loginname"),
      { timeout: 15_000 },
    )

    await context.close()
  })
})
