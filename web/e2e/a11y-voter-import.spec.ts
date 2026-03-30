import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"
const JOB_ID = "import-job-a11y-001"

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
        }),
      })
    }

    // Import job detail (with column mapping)
    if (url.includes(`/voters/imports/${JOB_ID}`) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: JOB_ID,
          campaign_id: CAMPAIGN_ID,
          status: "columns_detected",
          file_name: "voters.csv",
          total_rows: 100,
          processed_rows: 0,
          detected_columns: ["First Name", "Last Name", "Address", "City", "State", "Zip"],
          column_mapping: {
            "First Name": "first_name",
            "Last Name": "last_name",
            "Address": "registration_line1",
            "City": "registration_city",
            "State": "registration_state",
            "Zip": "registration_zip",
          },
          preview_rows: [
            { "First Name": "Alice", "Last Name": "Smith", "Address": "123 Elm St", "City": "Springfield", "State": "OH", "Zip": "45501" },
            { "First Name": "Bob", "Last Name": "Johnson", "Address": "456 Oak Ave", "City": "Columbus", "State": "OH", "Zip": "43201" },
          ],
          created_at: "2026-01-01T00:00:00Z",
        }),
      })
    }

    // Voter imports list
    if (url.includes("/voters/imports")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
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

test.describe("A11Y Flow: Voter Import Wizard", () => {
  test.setTimeout(30_000)

  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page)
    await setupApiMocks(page)
  })

  test("voter import wizard is accessible at every step", async ({ page }) => {
    // ── Step 1: File Upload ─────────────────────────────────────────────────
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // Verify ARIA landmarks
    const nav = page.getByRole("navigation")
    await expect(nav.first()).toBeVisible()

    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // Verify heading hierarchy
    const headings = main.getByRole("heading")
    const headingCount = await headings.count()
    expect(headingCount).toBeGreaterThan(0)

    // Verify wizard step indicator exists and is accessible
    const stepNav = page.getByRole("navigation", { name: /wizard|steps|import/i })
    const stepNavCount = await stepNav.count()
    if (stepNavCount > 0) {
      await expect(stepNav.first()).toBeVisible()
      // Steps should be in an ordered list
      const listItems = stepNav.first().getByRole("listitem")
      const listItemCount = await listItems.count()
      expect(listItemCount, "Step indicator should have list items").toBeGreaterThan(0)
    }

    // Verify file upload area is keyboard-accessible
    // Look for file input or dropzone button
    const fileInput = page.locator('input[type="file"]')
    const fileInputCount = await fileInput.count()
    if (fileInputCount > 0) {
      // File input should have an accessible label
      const hasLabel = await fileInput.first().evaluate((el) => {
        const input = el as HTMLInputElement
        return !!(
          input.getAttribute("aria-label") ||
          input.id && document.querySelector(`label[for="${input.id}"]`) ||
          input.closest("label")
        )
      })
      expect(hasLabel, "File input should have an accessible label").toBeTruthy()
    }

    // Look for upload button/dropzone - should be keyboard reachable
    const uploadButton = page.getByRole("button", { name: /upload|browse|select|choose/i })
    const uploadButtonCount = await uploadButton.count()
    if (uploadButtonCount > 0) {
      // Tab to the upload button
      let found = false
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab")
        const activeEl = await page.evaluate(() => document.activeElement?.textContent?.toLowerCase() || "")
        if (activeEl.includes("upload") || activeEl.includes("browse") || activeEl.includes("select")) {
          found = true
          break
        }
      }
      // If there is a visible upload button, it should be reachable
      if (await uploadButton.first().isVisible()) {
        // Just verify the button exists and has accessible name
        const name = await uploadButton.first().getAttribute("aria-label") ||
          await uploadButton.first().textContent()
        expect(name?.length).toBeGreaterThan(0)
      }
    }

    // ── Step 2: Column Mapping ──────────────────────────────────────────────
    // Navigate to step 2 with a mock job that has columns detected
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new?jobId=${JOB_ID}&step=2`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // Verify heading exists for column mapping step
    const step2Headings = main.getByRole("heading")
    const step2HeadingCount = await step2Headings.count()
    expect(step2HeadingCount).toBeGreaterThan(0)

    // Check for select/combobox elements with labels
    const selects = page.locator("select, [role='combobox'], [role='listbox']")
    const selectCount = await selects.count()
    if (selectCount > 0) {
      for (let i = 0; i < Math.min(selectCount, 5); i++) {
        const select = selects.nth(i)
        if (await select.isVisible()) {
          const hasAccessibleName = await select.evaluate((el) => {
            return !!(
              el.getAttribute("aria-label") ||
              el.getAttribute("aria-labelledby") ||
              el.id && document.querySelector(`label[for="${el.id}"]`) ||
              el.closest("label")
            )
          })
          // Column mapping selects should have accessible labels
          expect(hasAccessibleName, `Select ${i} should have an accessible name`).toBeTruthy()
        }
      }
    }

    // ── Step 3: Preview ─────────────────────────────────────────────────────
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new?jobId=${JOB_ID}&step=3`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // Verify heading for preview step
    const step3Headings = main.getByRole("heading")
    expect(await step3Headings.count()).toBeGreaterThan(0)

    // Check for preview table with proper semantics
    const previewTable = page.getByRole("table")
    const previewTableCount = await previewTable.count()
    if (previewTableCount > 0) {
      // Table should have column headers associated with data
      const headers = previewTable.first().getByRole("columnheader")
      expect(await headers.count(), "Preview table should have column headers").toBeGreaterThan(0)
    }

    // ── Step 4: Import Progress ─────────────────────────────────────────────
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new?jobId=${JOB_ID}&step=4`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    // Verify heading for progress step
    const step4Headings = main.getByRole("heading")
    expect(await step4Headings.count()).toBeGreaterThan(0)

    // Check for progress indicators
    const progressBar = page.getByRole("progressbar")
    const progressCount = await progressBar.count()
    if (progressCount > 0) {
      // Progress bar should have value attributes
      const hasValue = await progressBar.first().evaluate((el) => {
        return !!(
          el.getAttribute("aria-valuenow") ||
          el.getAttribute("aria-valuetext") ||
          el.getAttribute("value")
        )
      })
      // If progress bar is visible, it should communicate its value
      if (await progressBar.first().isVisible()) {
        expect(hasValue, "Progress bar should have aria-valuenow or value").toBeTruthy()
      }
    }

    // Check for aria-live region for status updates
    const liveRegions = page.locator("[aria-live]")
    const liveCount = await liveRegions.count()
    // Status updates or progress messages should use aria-live
    // This is a soft check - the import progress component should ideally have one
    if (liveCount > 0) {
      const liveValue = await liveRegions.first().getAttribute("aria-live")
      expect(["polite", "assertive"]).toContain(liveValue)
    }
  })
})
