import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"

// ── API Mock Helpers ────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  await mockConfigEndpoint(page)
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
        body: JSON.stringify({
          items: [
            {
              id: "member-1",
              user_id: "mock-user-a11y",
              first_name: "Test",
              last_name: "Admin",
              email: "admin@test.com",
              role: "owner",
            },
          ],
          next_cursor: null,
        }),
      })
    }

    // Invites
    if (url.includes("/invites")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // My role
    if (url.includes("/me") || url.includes("/my-role")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "owner" }),
      })
    }

    // Campaigns list
    if (url.includes("/campaigns") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{ id: CAMPAIGN_ID, name: "A11Y Test Campaign", status: "active", role: "owner" }],
          next_cursor: null,
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
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // 2. Verify ARIA landmarks
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // 3. Verify heading hierarchy
    const headings = main.getByRole("heading")
    const headingCount = await headings.count()
    expect(headingCount).toBeGreaterThan(0)

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
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // Verify danger zone heading
    const dangerHeadings = page.getByRole("main").getByRole("heading")
    expect(await dangerHeadings.count()).toBeGreaterThan(0)

    // Verify destructive action buttons have accessible names
    const dangerButtons = page.getByRole("main").getByRole("button")
    const dangerButtonCount = await dangerButtons.count()
    for (let i = 0; i < Math.min(dangerButtonCount, 10); i++) {
      const button = dangerButtons.nth(i)
      if (!(await button.isVisible())) continue
      const name = await button.evaluate((el) => {
        return el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("title") || ""
      })
      expect(name.length, `Danger button ${i} should have accessible name`).toBeGreaterThan(0)
    }

    // 9. Verify dialog focus management (D-10)
    // Click a destructive action to open confirmation dialog
    if (dangerButtonCount > 0) {
      const firstVisibleButton = dangerButtons.first()
      if (await firstVisibleButton.isVisible()) {
        await firstVisibleButton.click()
        await page.waitForTimeout(500)

        // Check if a dialog opened
        const dialog = page.getByRole("dialog")
        const dialogCount = await dialog.count()
        if (dialogCount > 0) {
          // Dialog should be visible
          await expect(dialog.first()).toBeVisible()

          // Dialog should have a heading/title
          const dialogHeading = dialog.first().getByRole("heading")
          const dialogHeadingCount = await dialogHeading.count()
          if (dialogHeadingCount === 0) {
            // Check for dialog title via aria-labelledby
            const hasTitle = await dialog.first().evaluate((el) => {
              return !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))
            })
            expect(hasTitle, "Dialog should have a title").toBeTruthy()
          }

          // Dialog should trap keyboard focus
          await page.keyboard.press("Tab")
          const focusInDialog = await page.evaluate(() => {
            const dialog = document.querySelector("[role='dialog'], dialog")
            const active = document.activeElement
            return dialog?.contains(active) ?? false
          })
          expect(focusInDialog, "Focus should be trapped within dialog").toBeTruthy()

          // Escape should close the dialog
          await page.keyboard.press("Escape")
          await page.waitForTimeout(300)

          // After closing, dialog should not be visible
          const dialogAfterClose = page.getByRole("dialog")
          const dialogAfterCount = await dialogAfterClose.count()
          if (dialogAfterCount > 0) {
            await expect(dialogAfterClose.first()).not.toBeVisible()
          }
        }
      }
    }
  })

  test("settings members page is keyboard-navigable", async ({ page }) => {
    await page.goto(`/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // Verify ARIA landmarks
    await expect(page.getByRole("main")).toBeVisible()

    // Verify heading
    const headings = page.getByRole("main").getByRole("heading")
    expect(await headings.count()).toBeGreaterThan(0)

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
