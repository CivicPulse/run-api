import { expect, type Page } from "@playwright/test"
import { waitForPostLoginApp, waitForZitadelLogin } from "./auth-shared"

type RoleName = "owner" | "admin" | "manager" | "volunteer" | "viewer"

const DEFAULT_CREDENTIALS: Record<
  RoleName,
  { username: string; password: string }
> = {
  owner: { username: "owner1@localhost", password: "Owner1234!" },
  admin: { username: "admin1@localhost", password: "Admin1234!" },
  manager: { username: "manager1@localhost", password: "Manager1234!" },
  volunteer: { username: "volunteer1@localhost", password: "Volunteer1234!" },
  viewer: { username: "viewer1@localhost", password: "Viewer1234!" },
}

function getCredentials(role: RoleName) {
  const defaults = DEFAULT_CREDENTIALS[role]
  const envKey = role.toUpperCase()

  return {
    username:
      process.env[`E2E_${envKey}_USERNAME`] ?? defaults.username,
    password:
      process.env[`E2E_${envKey}_PASSWORD`] ?? defaults.password,
  }
}

async function findIdentifierInput(page: Page) {
  const locator = page
    .locator(
      [
        "#loginName",
        "input[name='loginName']",
        "input[autocomplete='username']",
        "input[type='email']",
        "input[type='text']",
      ].join(", "),
    )
    .first()

  await expect(locator).toBeVisible({ timeout: 30_000 })
  return locator
}

async function findPasswordInput(page: Page) {
  const locator = page
    .locator("#password")
    .or(page.locator("input[name='password']"))
    .or(page.locator("input[type='password']"))
    .first()

  await expect(locator).toBeVisible({ timeout: 30_000 })
  return locator
}

export async function loginViaZitadel(page: Page, role: RoleName) {
  const credentials = getCredentials(role)

  await page.goto("/login")
  await waitForZitadelLogin(page)

  const loginInput = await findIdentifierInput(page)
  await loginInput.fill(credentials.username)

  const nextButton = page.getByRole("button", { name: /next/i })
  await expect(nextButton).toBeEnabled({ timeout: 10_000 })
  await nextButton.click()

  const passwordInput = await findPasswordInput(page)
  await passwordInput.fill(credentials.password)
  await passwordInput.press("Tab").catch(() => {})

  if (await nextButton.isEnabled().catch(() => false)) {
    await nextButton.click()
  } else {
    await passwordInput.press("Enter")
  }

  const mfaHeading = page.getByText(/2-Factor Setup|MFA Setup/i)
  if (await mfaHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const skipButton = page
      .getByRole("button", { name: /skip/i })
      .or(page.getByRole("link", { name: /skip/i }))
      .or(page.locator("button:has-text('skip')"))
      .or(page.locator("a:has-text('skip')"))

    await skipButton.first().scrollIntoViewIfNeeded()
    await skipButton.first().click({ timeout: 5_000 })
  }

  await waitForPostLoginApp(page)
  await page.waitForFunction(
    () => Object.keys(localStorage).some((key) => key.startsWith("oidc.")),
    { timeout: 10_000 },
  )
  await expect(page.locator("body")).toBeVisible()
}
