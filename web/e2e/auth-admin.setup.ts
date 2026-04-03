import { test as setup, expect } from "@playwright/test"
import path from "path"
import { waitForPostLoginApp, waitForZitadelLogin } from "./auth-shared"

const authFile = path.join(import.meta.dirname, "../playwright/.auth/admin.json")

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login")
  await waitForZitadelLogin(page)

  const loginInput = page.locator("#loginName").or(page.getByLabel(/login ?name/i)).first()
  await loginInput.fill(process.env.E2E_ADMIN_USERNAME ?? "admin1@localhost")

  const nextButton = page.getByRole("button", { name: /next/i })
  await expect(nextButton).toBeEnabled({ timeout: 10_000 })
  await nextButton.click()

  const passwordInput = page.locator("#password").or(page.locator("input[type='password']")).first()
  await passwordInput.fill(process.env.E2E_ADMIN_PASSWORD ?? "Admin1234!")
  await passwordInput.press("Tab").catch(() => {})

  if (await nextButton.isEnabled().catch(() => false)) {
    await nextButton.click()
  } else {
    await passwordInput.press("Enter")
  }

  const mfaHeading = page.getByText(/2-Factor Setup|MFA Setup/i)
  if (await mfaHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const skipButton = page.getByRole("button", { name: /skip/i })
      .or(page.getByRole("link", { name: /skip/i }))
      .or(page.locator("button:has-text('skip')"))
      .or(page.locator("a:has-text('skip')"))
    await skipButton.scrollIntoViewIfNeeded()
    await skipButton.click({ timeout: 5_000 })
  }

  await waitForPostLoginApp(page)
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("oidc.")), { timeout: 10_000 })
  await expect(page.locator("body")).toBeVisible()

  await page.context().addCookies([{ name: "sidebar_state", value: "true", domain: "localhost", path: "/" }])
  await page.context().storageState({ path: authFile })
})
