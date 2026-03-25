import { test as setup, expect } from "@playwright/test"
import path from "path"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/user.json")

setup("authenticate", async ({ page }) => {
  const username = process.env.E2E_USERNAME ?? "admin@localhost"
  const password = process.env.E2E_PASSWORD ?? "Admin1234!"
  // New password for forced change — same password + "E2e" suffix to meet complexity
  const newPassword = process.env.E2E_NEW_PASSWORD ?? "Admin1234!E2e"

  // Navigate to /login — auto-redirects to ZITADEL via signinRedirect()
  await page.goto("/login")

  // Wait for ZITADEL login page at localhost:8080
  await page.waitForURL(
    (url) => url.port === "8080" || url.pathname.includes("/ui/login"),
    { timeout: 30_000 },
  )

  // Fill login name
  const loginInput = page.getByLabel(/login ?name/i).or(page.locator("#loginName"))
  await expect(loginInput).toBeVisible({ timeout: 10_000 })
  await loginInput.fill(username)

  // Click Next to proceed to password step
  await page.getByRole("button", { name: /next/i }).click()

  // Wait for password page
  await expect(page.getByText("Password", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  })

  // Fill password
  const passwordInput = page.locator('input[type="password"]')
  await expect(passwordInput).toBeVisible({ timeout: 5_000 })
  await passwordInput.fill(password)

  // Click Next to submit login
  await page.getByRole("button", { name: /next/i }).click()

  // Handle "Change Password" page if ZITADEL forces password change
  const changePasswordHeading = page.getByText("Change Password")
  if (await changePasswordHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Fill old password, new password, and confirmation
    await page.getByLabel("Old Password").fill(password)
    await page.getByLabel("New Password").fill(newPassword)
    await page.getByLabel("Password confirmation").fill(newPassword)
    await page.getByRole("button", { name: /next/i }).click()
  }

  // Wait for redirect back to the app after successful authentication
  // The org dashboard lives at "/" so also match the callback then root
  await page.waitForURL(
    (url) => url.port !== "8080" && !url.pathname.includes("/login"),
    { timeout: 30_000 },
  )

  // Verify we are authenticated
  await expect(page.locator("body")).toBeVisible()

  // Persist browser storage state
  await page.context().storageState({ path: authFile })
})
