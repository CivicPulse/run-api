import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/owner.json")

setup("authenticate as owner", async ({ page }) => {
  // Navigate to /login — auto-redirects to ZITADEL via signinRedirect()
  await page.goto("/login")

  // Wait for ZITADEL login page at localhost:8080
  await page.waitForURL(
    (url) => url.port === "8080" || url.pathname.includes("/ui/login"),
    { timeout: 30_000 },
  )

  // Fill login name
  const loginInput = page.locator("#loginName").or(page.getByLabel(/login ?name/i)).first()
  await loginInput.fill(
    process.env.E2E_OWNER_USERNAME ?? "owner1@localhost",
  )

  // Click Next to proceed to password step
  const nextButton = page.getByRole("button", { name: /next/i })
  await expect(nextButton).toBeEnabled({ timeout: 10_000 })
  await nextButton.click()

  // Fill password
  const passwordInput = page.locator("#password").or(page.locator("input[type='password']")).first()
  await passwordInput.fill(
    process.env.E2E_OWNER_PASSWORD ?? "Owner1234!",
  )
  await passwordInput.press("Tab").catch(() => {})

  // Click Next to submit login
  if (await nextButton.isEnabled().catch(() => false)) {
    await nextButton.click()
  } else {
    await passwordInput.press("Enter")
  }

  // Handle MFA setup screen if it appears (click "skip" to bypass)
  const mfaHeading = page.getByText(/2-Factor Setup|MFA Setup/i)
  if (await mfaHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Scroll to find the skip button/link at the bottom of the page
    const skipButton = page.getByRole("button", { name: /skip/i })
      .or(page.getByRole("link", { name: /skip/i }))
      .or(page.locator("button:has-text('skip')"))
      .or(page.locator("a:has-text('skip')"))
    await skipButton.scrollIntoViewIfNeeded()
    await skipButton.click({ timeout: 5_000 })
  }

  // Wait for OIDC callback to fully complete and navigate to final destination.
  // The callback page at /callback processes tokens async, then navigates away.
  // We must wait until we're past /callback, /login, and /ui/login.
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

  // Set sidebar to open for E2E tests (avoids "outside viewport" issues with collapsed sidebar)
  await page.context().addCookies([{
    name: "sidebar_state",
    value: "true",
    domain: "localhost",
    path: "/",
  }])

  // Persist browser storage state
  await page.context().storageState({ path: authFile })
})
