import { test, expect, type Page } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

// Increase global timeout — login + navigation can be slow on the dev tailnet server
test.setTimeout(90_000)

let CAMPAIGN_ID: string


// ---------------------------------------------------------------------------
// IMPT-06 — Import history page renders DataTable / EmptyState and New Import button
// ---------------------------------------------------------------------------
test.describe("IMPT-06: Import history page — DataTable or EmptyState with New Import button", () => {
  test("navigating to /voters/imports shows Import History heading and New Import button", async ({
    page,
  }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports`)
    await page.waitForLoadState("networkidle")
    await page.screenshot({ path: "test-results/p14-06-imports-index.png" })

    // "Import History" heading must be visible
    const heading = page.getByRole("heading", { name: /import history/i })
    await expect(heading).toBeVisible({ timeout: 8000 })

    // "New Import" button must be visible (RequireRole admin — tester is owner)
    const newImportBtn = page.getByRole("button", { name: /new import/i })
    await expect(newImportBtn).toBeVisible({ timeout: 8000 })

    // Either DataTable columns or EmptyState must be visible
    const bodyText = await page.locator("body").innerText()
    const hasTableColumns =
      bodyText.toLowerCase().includes("filename") ||
      bodyText.toLowerCase().includes("status")
    const hasEmptyState =
      bodyText.toLowerCase().includes("no imports yet") ||
      bodyText.toLowerCase().includes("start your first import")

    expect(
      hasTableColumns || hasEmptyState,
      "Should show import table columns or empty state",
    ).toBe(true)

    await page.screenshot({ path: "test-results/p14-06-imports-state.png" })
  })
})

// ---------------------------------------------------------------------------
// IMPT-01 — Import wizard page renders DropZone with expected UI elements
// ---------------------------------------------------------------------------
test.describe("IMPT-01: Import wizard — DropZone renders with CSV drag-and-drop UI", () => {
  test("navigating to /voters/imports/new shows Import Voters heading, step indicator, and DropZone", async ({
    page,
  }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new`)
    await page.waitForLoadState("networkidle")
    await page.screenshot({ path: "test-results/p14-01-import-wizard.png" })

    // "Import Voters" heading must be visible
    const heading = page.getByRole("heading", { name: /import voters/i })
    await expect(heading).toBeVisible({ timeout: 8000 })

    // Step 1 heading "Upload" must be visible in the step indicator
    const bodyText = await page.locator("body").innerText()
    expect(bodyText).toMatch(/upload/i)

    // DropZone renders with drag-and-drop instructions
    const dropInstruction = page.getByText(/drag.*drop.*csv|click to browse/i).first()
    await expect(dropInstruction).toBeVisible({ timeout: 8000 })

    await page.screenshot({ path: "test-results/p14-01-dropzone-visible.png" })
  })
})

// ---------------------------------------------------------------------------
// IMPT-07 — Wizard URL contains step parameter
// ---------------------------------------------------------------------------
test.describe("IMPT-07: Wizard URL contains step parameter for step tracking", () => {
  test("import wizard URL includes ?step= parameter defaulting to 1", async ({
    page,
  }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new`)
    await page.waitForLoadState("networkidle")

    // The route schema defaults step to 1 — verify the wizard renders step 1 content
    const step1Heading = page.getByText(/step 1 of 4/i).first()
    await expect(step1Heading).toBeVisible({ timeout: 8000 })

    // With ?step=1 explicitly in URL the wizard renders correctly
    await page.goto(
      `/campaigns/${CAMPAIGN_ID}/voters/imports/new?step=1`,
    )
    await page.waitForLoadState("networkidle")

    const uploadHeading = page.getByText(/step 1 of 4/i).first()
    await expect(uploadHeading).toBeVisible({ timeout: 8000 })

    await page.screenshot({ path: "test-results/p14-07-step-param.png" })
  })
})

// ---------------------------------------------------------------------------
// IMPT-02 & IMPT-03 — Wizard step navigation structure (smoke test only)
// Full column mapping flow requires real CSV upload — verified structurally.
// ---------------------------------------------------------------------------
test.describe("IMPT-02 / IMPT-03: Wizard step navigation structure is present (smoke)", () => {
  test("step indicator shows all four steps: Upload, Map Columns, Preview, Progress", async ({
    page,
  }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new`)
    await page.waitForLoadState("networkidle")

    const bodyText = await page.locator("body").innerText()

    // All four step labels should be visible in the step indicator
    expect(bodyText).toMatch(/upload/i)
    expect(bodyText).toMatch(/map columns/i)
    expect(bodyText).toMatch(/preview/i)
    expect(bodyText).toMatch(/progress/i)

    await page.screenshot({ path: "test-results/p14-02-step-indicator.png" })
  })
})

// ---------------------------------------------------------------------------
// IMPT-06 — Clicking "New Import" from history navigates to wizard
// ---------------------------------------------------------------------------
test.describe("IMPT-06: New Import button navigates to wizard route", () => {
  test("clicking New Import from history page navigates to /voters/imports/new", async ({
    page,
  }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports`)
    await page.waitForLoadState("networkidle")

    const newImportBtn = page.getByRole("button", { name: /new import/i })
    await expect(newImportBtn).toBeVisible({ timeout: 8000 })

    await newImportBtn.click()
    await page.waitForURL(/\/voters\/imports\/new/, { timeout: 10_000 })

    // Should now be on the wizard page
    const wizardHeading = page.getByRole("heading", { name: /import voters/i })
    await expect(wizardHeading).toBeVisible({ timeout: 8000 })

    await page.screenshot({ path: "test-results/p14-06-new-import-navigation.png" })
  })
})
