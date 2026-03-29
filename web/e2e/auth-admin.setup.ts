import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/admin.json")

setup("authenticate as admin", async ({ page }) => {
  // Navigate to /login — auto-redirects to ZITADEL via signinRedirect()
  await page.goto("/login")

  // Wait for ZITADEL login page at localhost:8080
  await page.waitForURL(
    (url) => url.port === "8080" || url.pathname.includes("/ui/login"),
    { timeout: 30_000 },
  )

  // Fill login name
  const loginInput = page.getByLabel(/login ?name/i).or(page.locator("#loginName"))
  await loginInput.fill(
    process.env.E2E_ADMIN_USERNAME ?? "admin1@localhost",
  )

  // Click Next to proceed to password step
  await page.getByRole("button", { name: /next/i }).click()

  // Fill password
  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator("#password"))
  await passwordInput.fill(
    process.env.E2E_ADMIN_PASSWORD ?? "Admin1234!",
  )

  // Click Next to submit login
  await page.getByRole("button", { name: /next/i }).click()

  // Handle MFA setup screen if it appears (click "skip" to bypass)
  const mfaHeading = page.getByText(/2-Factor Setup|MFA Setup/i)
  if (await mfaHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const skipButton = page.getByRole("button", { name: /skip/i })
      .or(page.getByRole("link", { name: /skip/i }))
      .or(page.locator("button:has-text('skip')"))
      .or(page.locator("a:has-text('skip')"))
    await skipButton.scrollIntoViewIfNeeded()
    await skipButton.click({ timeout: 5_000 })
  }

  // Wait for OIDC callback to fully complete and navigate to final destination.
  // The callback page at /callback processes tokens async, then navigates away.
  await page.waitForURL(
    (url) =>
      url.host.includes("localhost") &&
      !url.pathname.includes("/ui/login") &&
      !url.pathname.includes("/callback") &&
      !url.pathname.includes("/login"),
    { timeout: 30_000 },
  )

  // Wait for OIDC tokens to be stored in localStorage by oidc-client-ts
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("oidc.")),
    { timeout: 10_000 },
  )

  // Verify we are authenticated
  await expect(page.locator("body")).toBeVisible()

  // Persist browser storage state
  await page.context().storageState({ path: authFile })
})
