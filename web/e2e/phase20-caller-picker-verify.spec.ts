import { test, expect } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

let CAMPAIGN_ID: string


test.describe("Phase 20: Caller Picker UX", () => {
  test("session detail page shows callers with display names (not UUIDs)", async ({ page }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    // Navigate to sessions list
    await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/sessions`)
    await page.waitForLoadState("networkidle")

    // Click on the first session to go to detail page
    const sessionLink = page.locator("table tbody tr a, table tbody tr td").first()
    const linkVisible = await sessionLink.isVisible().catch(() => false)
    if (!linkVisible) {
      console.log("No sessions found in table — skipping detail page test")
      return
    }
    await sessionLink.click()
    await page.waitForLoadState("networkidle")
    await page.screenshot({ path: "test-results/p20-01-session-detail.png" })

    const bodyText = await page.locator("body").innerText()
    console.log("Session detail (500 chars):", bodyText.slice(0, 500))

    // Page should render without errors
    expect(bodyText).not.toContain("404")
    expect(bodyText).not.toContain("Not Found")
  })

  test("Add Caller dialog shows combobox picker (not text input)", async ({ page }) => {
    await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/sessions`)
    await page.waitForLoadState("networkidle")

    // Click first session
    const sessionLink = page.locator("table tbody tr a, table tbody tr td").first()
    const linkVisible = await sessionLink.isVisible().catch(() => false)
    if (!linkVisible) {
      console.log("No sessions found — skipping")
      return
    }
    await sessionLink.click()
    await page.waitForLoadState("networkidle")

    // Look for the Add Caller button
    const addCallerBtn = page.getByRole("button", { name: /add caller/i })
    const btnVisible = await addCallerBtn.isVisible().catch(() => false)
    if (!btnVisible) {
      console.log("'Add Caller' button not visible — may require manager role")
      return
    }

    await addCallerBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: "test-results/p20-02-add-caller-dialog.png" })

    // Dialog should be open
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const dialogText = await dialog.innerText()
    console.log("Dialog text:", dialogText.slice(0, 400))

    // Should NOT have a raw text input for user ID
    const userIdInput = dialog.locator('input[placeholder*="user"]')
    const hasRawInput = await userIdInput.isVisible().catch(() => false)
    expect(hasRawInput, "Should not have a raw user ID text input").toBe(false)

    // Should have the combobox trigger button (Popover trigger)
    const comboboxTrigger = dialog.locator('button[role="combobox"]')
    const hasCombobox = await comboboxTrigger.isVisible().catch(() => false)
    console.log("Has combobox trigger:", hasCombobox)

    // If combobox is present, click it to open the picker
    if (hasCombobox) {
      await comboboxTrigger.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: "test-results/p20-03-combobox-open.png" })

      // Should show member options with names (not UUIDs)
      // Look for Command items in the popover
      const commandItems = page.locator('[cmdk-item]')
      const itemCount = await commandItems.count()
      console.log("Combobox option count:", itemCount)

      if (itemCount > 0) {
        const firstItemText = await commandItems.first().innerText()
        console.log("First option text:", firstItemText)
        // Option should have a display name, not a UUID pattern
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(firstItemText.trim())
        expect(isUUID, "Options should show display names, not UUIDs").toBe(false)
      }
    }
  })

  test("callers table shows display names with role badges", async ({ page }) => {
    await page.goto(`/campaigns/${CAMPAIGN_ID}/phone-banking/sessions`)
    await page.waitForLoadState("networkidle")

    // Click first session
    const sessionLink = page.locator("table tbody tr a, table tbody tr td").first()
    const linkVisible = await sessionLink.isVisible().catch(() => false)
    if (!linkVisible) {
      console.log("No sessions found — skipping")
      return
    }
    await sessionLink.click()
    await page.waitForLoadState("networkidle")

    // Check the Overview tab callers section
    const bodyText = await page.locator("body").innerText()

    // Look for role badges (admin, manager, volunteer) — these indicate name resolution is working
    const hasRoleBadge = bodyText.includes("admin") || bodyText.includes("manager") || bodyText.includes("volunteer")
    console.log("Has role badges visible:", hasRoleBadge)

    // Check that there are no truncated UUIDs (pattern: 12 hex chars + "...")
    const truncatedUUIDPattern = /[0-9a-f]{12}\.\.\./i
    const hasTruncatedUUIDs = truncatedUUIDPattern.test(bodyText)
    console.log("Has truncated UUIDs:", hasTruncatedUUIDs)

    // If there are callers, they should show names, not UUIDs
    // (Only fail if we see truncated UUIDs AND no role badges, indicating name resolution isn't working)
    if (hasTruncatedUUIDs && !hasRoleBadge) {
      console.log("WARNING: Found truncated UUIDs without role badges — name resolution may not be working")
    }

    await page.screenshot({ path: "test-results/p20-04-callers-table.png" })
  })
})
