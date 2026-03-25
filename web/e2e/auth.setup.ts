import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(__dirname, "../playwright/.auth/user.json")

setup("authenticate", async ({ page }) => {
  // Navigate to app root — triggers OIDC redirect to ZITADEL
  await page.goto("/")

  // Wait for ZITADEL login page to appear
  await page.waitForURL(/loginname|login|auth/)

  // Fill login name
  const loginInput = page.getByLabel(/login ?name/i).or(page.locator("#loginName"))
  await loginInput.fill(process.env.E2E_USERNAME ?? "admin@localhost")

  // Click Next to proceed to password step
  await page.getByRole("button", { name: /next/i }).click()

  // Fill password
  const passwordInput = page.getByLabel(/password/i).or(page.locator("#password"))
  await passwordInput.fill(process.env.E2E_PASSWORD ?? "Admin1234!")

  // Click Next to submit login
  await page.getByRole("button", { name: /next/i }).click()

  // Wait for redirect back to the app after successful authentication
  await page.waitForURL(/\/(campaigns|org)/, { timeout: 30_000 })

  // Verify we are authenticated — page should contain user-specific content
  await expect(page.locator("body")).toBeVisible()

  // Persist browser storage state for use by dependent projects
  await page.context().storageState({ path: authFile })
})
