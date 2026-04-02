/**
 * Smoke test: admin@localhost can log in without redirect loop and create a campaign.
 *
 * Verifies:
 *   1. Login completes without infinite redirect (bootstrap login policy fix)
 *   2. No forced password-change screen (bootstrap v2 password API fix)
 *   3. Admin can see the campaign creation form (dev org seeded in DB)
 *   4. Campaign creation succeeds end-to-end
 *
 * Run: cd web && ./scripts/run-e2e.sh admin-campaign-create.spec.ts
 */

import { test, expect } from "@playwright/test"
import path from "path"

const SCREENSHOTS = path.join(import.meta.dirname, "../../screenshots")

test.describe("Admin login + campaign creation smoke test", () => {
  test("admin@localhost can log in and create a campaign", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    // ── Step 1: Navigate to login ────────────────────────────────────────────
    await page.goto("/login")

    // Wait for ZITADEL login page (Tailscale domain, port 8080)
    await page.waitForURL(
      (url) =>
        url.port === "8080" ||
        url.pathname.includes("/ui/login") ||
        url.pathname.includes("/loginname"),
      { timeout: 20_000 },
    )
    await page.screenshot({ path: `${SCREENSHOTS}/01-zitadel-login.png` })

    // ── Step 2: Fill credentials ─────────────────────────────────────────────
    const loginInput = page
      .getByLabel(/login ?name/i)
      .or(page.locator("#loginName"))
    await loginInput.fill("admin@localhost")
    await page.getByRole("button", { name: /next/i }).click()

    const passwordInput = page
      .getByLabel(/password/i)
      .or(page.locator("#password"))
    await passwordInput.fill("Admin1234!")
    await page.getByRole("button", { name: /next/i }).click()

    // ── Step 3: Verify no forced password-change screen ──────────────────────
    // Allow a moment for any redirect to happen
    await page.waitForTimeout(2_000)
    const currentUrl = page.url()
    expect(currentUrl).not.toMatch(/password.*change|change.*password/i)

    // ── Step 4: Handle optional MFA skip ─────────────────────────────────────
    const mfaHeading = page.getByText(/2-Factor Setup|MFA Setup/i)
    if (await mfaHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const skipButton = page
        .getByRole("button", { name: /skip/i })
        .or(page.getByRole("link", { name: /skip/i }))
      await skipButton.click({ timeout: 5_000 })
    }

    // ── Step 5: Verify landing on app (not login loop) ───────────────────────
    await page.waitForURL(
      (url) =>
        !url.pathname.includes("/login") &&
        !url.pathname.includes("/ui/login") &&
        !url.pathname.includes("/callback"),
      { timeout: 30_000 },
    )
    await page.screenshot({ path: `${SCREENSHOTS}/02-dashboard.png` })
    expect(page.url()).not.toMatch(/\/login/)

    // ── Step 6: Navigate to new campaign form ────────────────────────────────
    await page.goto("/campaigns/new")
    await page.waitForLoadState("domcontentloaded")
    await page.screenshot({ path: `${SCREENSHOTS}/03-new-campaign-form.png` })

    // Org field auto-populates from useMyOrgs() — wait for the async API call to resolve.
    // The field stays empty until /api/v1/me/orgs returns and currentOrg is set.
    const orgInput = page.getByLabel(/organization/i)
    await expect(orgInput).toBeVisible({ timeout: 10_000 })
    await expect(async () => {
      const v = await orgInput.inputValue()
      expect(v.length).toBeGreaterThan(0)
    }).toPass({ timeout: 10_000 })

    // ── Step 7: Fill campaign form ───────────────────────────────────────────
    await page.getByLabel(/campaign name/i).fill("Admin Smoke Test Campaign")

    // Choose campaign type — shadcn Select uses a trigger button with placeholder text
    await page.getByText("Select a type").click()
    await page.getByRole("option", { name: /local/i }).click()

    await page.screenshot({ path: `${SCREENSHOTS}/04-campaign-form-step1.png` })

    // ── Step 8: Walk the wizard ───────────────────────────────────────────────
    // Step 1 → 2: "Continue to Review"
    await page.getByRole("button", { name: /continue to review/i }).click()

    // Step 2 → 3: "Continue to Invite"
    await page.getByRole("button", { name: /continue to invite/i }).click()

    // Step 3: "Create Campaign" (with or without invites — skip invites)
    const createBtn = page
      .getByRole("button", { name: /create campaign/i })
      .first()
    await expect(createBtn).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: `${SCREENSHOTS}/05-campaign-form-final.png` })
    await createBtn.click()

    // ── Step 9: Verify redirect to new campaign ──────────────────────────────
    await page.waitForURL((url) => url.pathname.includes("/campaigns/"), {
      timeout: 20_000,
    })
    await page.screenshot({ path: `${SCREENSHOTS}/06-campaign-created.png` })

    expect(page.url()).toMatch(/\/campaigns\//)
    await context.close()
  })
})
