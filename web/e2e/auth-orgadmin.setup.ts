import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/orgadmin.json")

setup("authenticate as org_admin", async ({ page }) => {
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
    process.env.E2E_ORGADMIN_USERNAME ?? "e2e-orgadmin@localhost",
  )

  // Click Next to proceed to password step
  await page.getByRole("button", { name: /next/i }).click()

  // Fill password
  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator("#password"))
  await passwordInput.fill(
    process.env.E2E_ORGADMIN_PASSWORD ?? "E2eOrgAdmin1!",
  )

  // Click Next to submit login
  await page.getByRole("button", { name: /next/i }).click()

  // Wait for redirect back to the app after successful authentication
  await page.waitForURL(/\/(campaigns|org)/, { timeout: 30_000 })

  // Verify we are authenticated
  await expect(page.locator("body")).toBeVisible()

  // Persist browser storage state
  await page.context().storageState({ path: authFile })
})
