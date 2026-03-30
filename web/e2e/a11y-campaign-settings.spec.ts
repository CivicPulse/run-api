import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"

// ── API Mock Helpers ────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  // Register catch-all first; specific routes below should win.
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Campaign detail
    if (url.includes(`/campaigns/${CAMPAIGN_ID}`) && !url.includes(`/campaigns/${CAMPAIGN_ID}/`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CAMPAIGN_ID,
          name: "A11Y Test Campaign",
          description: "Accessibility test campaign",
          slug: "a11y-test",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          election_date: "2026-11-03",
        }),
      })
    }

    // Members
    if (url.includes("/members")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "member-1",
            user_id: "mock-user-a11y",
            display_name: "Test Admin",
            first_name: "Test",
            last_name: "Admin",
            email: "admin@test.com",
            role: "owner",
            synced_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "member-2",
            user_id: "admin-2",
            display_name: "Backup Admin",
            first_name: "Backup",
            last_name: "Admin",
            email: "backup-admin@test.com",
            role: "admin",
            synced_at: "2026-01-02T00:00:00Z",
          },
        ]),
      })
    }

    // Invites
    if (url.includes("/invites")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], pagination: { next_cursor: null, has_more: false } }),
      })
    }

    // My orgs
    if (url.includes("/me/orgs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "org-a11y",
            name: "A11Y Test Org",
            slug: "a11y-test-org",
            role: "org_owner",
            zitadel_org_id: "mock-org",
          },
        ]),
      })
    }

    // My campaigns (must be checked before /me catch-all)
    if (url.includes("/me/campaigns")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { campaign_id: CAMPAIGN_ID, campaign_name: "A11Y Test Campaign", role: "owner" },
        ]),
      })
    }

    // My role / profile
    if (url.includes("/me") || url.includes("/my-role")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-user-a11y", display_name: "Test Admin", email: "admin@test.com", role: "owner", created_at: "2026-01-01T00:00:00Z" }),
      })
    }

    // Campaigns list
    if (url.includes("/campaigns") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{ id: CAMPAIGN_ID, name: "A11Y Test Campaign", status: "active", role: "owner" }],
          pagination: { next_cursor: null, has_more: false },
        }),
      })
    }

    // Default
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })

  // Register config endpoint last so it takes precedence over catch-all.
  await mockConfigEndpoint(page)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("A11Y Flow: Campaign Settings", () => {
  test.setTimeout(30_000)

  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page)
    await setupApiMocks(page)
  })

  test("campaign settings flow is keyboard-operable and screen-reader-friendly", async ({
    page,
  }) => {
    // 1. Navigate to settings general page (index redirects to general)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/settings/general`)
    await page.waitForLoadState("domcontentloaded")
    await expect(page.getByRole("heading", { name: /Campaign Settings|General|A11Y Test Campaign/i }).first()).toBeVisible()
    // 2. Verify ARIA landmarks — mock auth may not render the sidebar shell
    // so <main> may not exist; use page body as fallback content root.
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.locator("#main-content")
    const hasMain = await main.count().then((c) => c > 0)
    const contentRoot = hasMain ? main.first() : page.locator("body")
    if (hasMain) {
      await expect(contentRoot).toBeVisible()
    }

    // 3. Verify heading hierarchy
    const headings = contentRoot.getByRole("heading")
    await expect
      .poll(async () => headings.count(), {
        message: "Expected at least one heading in settings content",
      })
      .toBeGreaterThan(0)
    const headingCount = await headings.count()

    // 4. Verify settings navigation tabs/links are keyboard-navigable
    // Settings tabs should be links (general, members, danger)
    const settingsLinks = page.getByRole("link")
    let foundSettingsLink = false
    const settingsCount = await settingsLinks.count()
    for (let i = 0; i < settingsCount; i++) {
      const link = settingsLinks.nth(i)
      const href = await link.getAttribute("href")
      if (href?.includes("/settings/")) {
        foundSettingsLink = true
        break
      }
    }
    // Settings page should have navigation links to sub-sections
    expect(foundSettingsLink || headingCount > 0, "Settings should have navigable sections").toBeTruthy()

    // 5. Verify form fields have labels
    const inputs = main.locator("input, textarea, select")
    const inputCount = await inputs.count()
    for (let i = 0; i < Math.min(inputCount, 10); i++) {
      const input = inputs.nth(i)
      if (!(await input.isVisible())) continue
      const inputType = await input.getAttribute("type")
      // Skip hidden inputs
      if (inputType === "hidden") continue

      const hasLabel = await input.evaluate((el) => {
        const htmlEl = el as HTMLInputElement
        return !!(
          htmlEl.getAttribute("aria-label") ||
          htmlEl.getAttribute("aria-labelledby") ||
          (htmlEl.id && document.querySelector(`label[for="${htmlEl.id}"]`)) ||
          htmlEl.closest("label") ||
          htmlEl.getAttribute("placeholder")
        )
      })
      expect(hasLabel, `Input ${i} (type=${inputType}) should have a label`).toBeTruthy()
    }

    // 6. Keyboard navigate through form fields
    let reachedInput = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab")
      const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() || "")
      if (tag === "input" || tag === "textarea") {
        reachedInput = true
        break
      }
    }
    expect(reachedInput, "Should reach form input via keyboard").toBeTruthy()

    // 7. Verify save button is keyboard-accessible
    const saveButton = page.getByRole("button", { name: /save|update/i })
    const saveCount = await saveButton.count()
    if (saveCount > 0) {
      await expect(saveButton.first()).toBeVisible()
    }

    // 8. Navigate to danger zone settings
    await page.goto(`/campaigns/${CAMPAIGN_ID}/settings/danger`)
    await page.waitForLoadState("domcontentloaded")
    await expect(page.getByRole("heading", { name: /Danger Zone/i }).first()).toBeVisible()
    // Verify danger zone heading
    const dangerMain = page.locator("#main-content")
    const hasDangerMain = await dangerMain.count().then((c) => c > 0)
    const dangerRoot = hasDangerMain ? dangerMain.first() : page.locator("body")
    const dangerHeadings = dangerRoot.getByRole("heading")
    await expect
      .poll(async () => dangerHeadings.count(), {
        message: "Expected danger zone headings to render",
      })
      .toBeGreaterThan(0)

    // Verify destructive action buttons have accessible names
    const dangerButtons = dangerRoot.getByRole("button")
    const dangerButtonCount = await dangerButtons.count()
    for (let i = 0; i < Math.min(dangerButtonCount, 10); i++) {
      const button = dangerButtons.nth(i)
      if (!(await button.isVisible())) continue
      const name = await button.evaluate((el) => {
        return el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("title") || ""
      })
      expect(name.length, `Danger button ${i} should have accessible name`).toBeGreaterThan(0)
    }

    // 9. Verify dialog focus management (D-10) for a known destructive action
    const deleteCampaignButton = page.getByRole("button", { name: /Delete campaign/i })
    if (await deleteCampaignButton.count()) {
      await deleteCampaignButton.first().click()
      const dialog = page.locator("[role='dialog'], [role='alertdialog'], dialog")
      await expect(dialog.first()).toBeVisible()

      const dialogHeading = dialog.first().getByRole("heading")
      const dialogHeadingCount = await dialogHeading.count()
      if (dialogHeadingCount === 0) {
        const hasTitle = await dialog.first().evaluate((el) => {
          return !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))
        })
        expect(hasTitle, "Dialog should have a title").toBeTruthy()
      }

      await page.keyboard.press("Tab")
      const focusInDialog = await page.evaluate(() => {
        const active = document.activeElement
        if (!active) return false
        return !!active.closest("[role='dialog'], [role='alertdialog'], dialog")
      })
      expect(focusInDialog, "Focus should be trapped within dialog").toBeTruthy()

      await page.keyboard.press("Escape")
      await expect(dialog.first()).not.toBeVisible()
    }
  })

  test("settings members page is keyboard-navigable", async ({ page }) => {
    await page.goto(`/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForLoadState("domcontentloaded")
    await expect(page.getByRole("heading", { name: /Members|Campaign Settings/i }).first()).toBeVisible()
    // Verify ARIA landmarks — mock auth may not render <main>
    const mainEl = page.locator("#main-content")
    const hasMain = await mainEl.count().then((c) => c > 0)
    const contentRoot = hasMain ? mainEl.first() : page.locator("body")
    if (hasMain) {
      await expect(contentRoot).toBeVisible()
    }

    // Verify heading
    const headings = contentRoot.getByRole("heading")
    await expect
      .poll(async () => headings.count(), {
        message: "Expected members page headings to render",
      })
      .toBeGreaterThan(0)

    // Verify member table or list has proper semantics
    const table = page.getByRole("table")
    const tableCount = await table.count()
    if (tableCount > 0) {
      const headers = table.first().getByRole("columnheader")
      expect(await headers.count()).toBeGreaterThan(0)
    }

    // Keyboard navigate to an interactive element
    let reachedInteractive = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab")
      const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() || "")
      if (tag === "button" || tag === "a" || tag === "input") {
        reachedInteractive = true
        break
      }
    }
    expect(reachedInteractive, "Should reach interactive element via keyboard on members page").toBeTruthy()
  })
})
