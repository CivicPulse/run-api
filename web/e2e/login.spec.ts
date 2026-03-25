import { test, expect } from "@playwright/test"

test.describe("Login flow", () => {
  test("successful login redirects to campaign or org page", async ({
    browser,
  }) => {
    // Create fresh context without stored auth state
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/")

    // Expect OIDC redirect to ZITADEL login page
    await page.waitForURL(/loginname|login|auth/, { timeout: 15_000 })

    // Fill login name
    const loginInput = page
      .getByLabel(/login ?name/i)
      .or(page.locator("#loginName"))
    await loginInput.fill("admin@localhost")

    // Click Next to proceed to password step
    await page.getByRole("button", { name: /next/i }).click()

    // Fill password
    const passwordInput = page
      .getByLabel(/password/i)
      .or(page.locator("#password"))
    await passwordInput.fill("Admin1234!")

    // Click Next to submit credentials
    await page.getByRole("button", { name: /next/i }).click()

    // Wait for redirect back to app after successful auth
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 30_000 })

    // Verify we landed on an authenticated page
    await expect(page).toHaveURL(/\/(campaigns|org)/)

    await context.close()
  })

  test("invalid credentials show error on ZITADEL login page", async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/")
    await page.waitForURL(/loginname|login|auth/, { timeout: 15_000 })

    // Fill login name
    const loginInput = page
      .getByLabel(/login ?name/i)
      .or(page.locator("#loginName"))
    await loginInput.fill("admin@localhost")
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

  test("unauthenticated access redirects to login", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Try to access a protected route directly
    await page.goto("/campaigns")

    // Expect redirect to ZITADEL login page
    await page.waitForURL(/loginname|login|auth/, { timeout: 15_000 })
    await expect(page).toHaveURL(/loginname|login|auth/)

    await context.close()
  })
})
