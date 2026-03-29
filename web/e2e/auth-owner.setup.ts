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
  const loginInput = page.getByLabel(/login ?name/i).or(page.locator("#loginName"))
  await loginInput.fill(
    process.env.E2E_OWNER_USERNAME ?? "owner1@localhost",
  )

  // Click Next to proceed to password step
  await page.getByRole("button", { name: /next/i }).click()

  // Fill password
  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator("#password"))
  await passwordInput.fill(
    process.env.E2E_OWNER_PASSWORD ?? "Owner1234!",
  )

  // Click Next to submit login
  await page.getByRole("button", { name: /next/i }).click()

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

  // Wait for redirect back to the app after successful authentication
  // User may land on / (org dashboard), /campaigns/*, or /org/*
  await page.waitForURL(
    (url) => url.host.includes("localhost") && !url.pathname.includes("/ui/login"),
    { timeout: 30_000 },
  )

  // Verify we are authenticated
  await expect(page.locator("body")).toBeVisible()

  // Persist browser storage state
  await page.context().storageState({ path: authFile })
})
