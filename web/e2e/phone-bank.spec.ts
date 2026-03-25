import { test, expect } from "@playwright/test"

test.describe("Phone bank sessions", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app root and wait for authenticated redirect
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Click into the seed campaign
    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()

    // Navigate to phone banking section
    const phoneBankingNav = page
      .getByRole("link", { name: /phone bank/i })
      .first()
    await phoneBankingNav.click()

    // Navigate to sessions sub-page
    const sessionsNav = page
      .getByRole("link", { name: /sessions/i })
      .first()
    await sessionsNav.click()

    // Wait for sessions page to load
    await expect(
      page.getByText(/sessions/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("create phone bank session and view in list", async ({ page }) => {
    // Click "New Session" button
    const newSessionButton = page
      .getByRole("button", { name: /new session/i })
      .first()
    await newSessionButton.click()

    // Wait for the session dialog to appear
    await expect(
      page.getByRole("dialog").or(page.getByText(/new session/i)),
    ).toBeVisible({ timeout: 10_000 })

    // Fill in session name
    const nameInput = page.getByLabel(/name/i).first()
    await nameInput.fill("E2E Phone Bank Session")

    // Select a call list from the dropdown (seed data has 3 call lists)
    const callListTrigger = page.locator("#session-call-list")
    await callListTrigger.click()

    // Click the first available call list option
    const firstCallList = page.getByRole("option").first()
    await firstCallList.click()

    // Click "Create" button to submit
    const createButton = page
      .getByRole("button", { name: /^create$/i })
      .first()
    await createButton.click()

    // Wait for the dialog to close and the session to appear in the list
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("phone-bank") && resp.status() < 300,
      { timeout: 10_000 },
    )

    // Verify the new session appears in the session list
    await expect(page.getByText("E2E Phone Bank Session")).toBeVisible({
      timeout: 10_000,
    })
  })

  test("view existing session shows details", async ({ page }) => {
    // Click on an existing seed session (seed data has 3 sessions)
    const sessionLink = page
      .getByRole("link")
      .filter({ has: page.locator("text=/session|phone bank/i") })
      .first()

    // If no named session links, click the first table row link
    const fallbackLink = page
      .locator("table a[href*='sessions/']")
      .first()

    const targetLink = (await sessionLink.count()) > 0
      ? sessionLink
      : fallbackLink
    await targetLink.click()

    // Wait for session detail page to load
    await page.waitForURL(/sessions\/[a-f0-9-]+/, { timeout: 10_000 })

    // Verify session details are visible (name, status, or caller assignments)
    const sessionContent = page
      .getByText(/caller|status|active|draft|call list/i)
      .first()
    await expect(sessionContent).toBeVisible({ timeout: 10_000 })
  })

  test("session list shows status badges", async ({ page }) => {
    // Verify at least one session has a status badge (seed data creates sessions)
    const statusBadge = page
      .getByText(/active|draft|paused|completed/i)
      .first()
    await expect(statusBadge).toBeVisible({ timeout: 10_000 })
  })
})
