/**
 * Phase 13: Voter Management Completion — Verification Spec
 *
 * Targeted verification screenshots for 4 key visual workflows:
 * VOTR-07 (static lists), VOTR-08 (dynamic lists), VOTR-10 (advanced search), VOTR-11 (interaction notes)
 *
 * The comprehensive Playwright spec covering all 11 VOTR requirements lives at:
 *   web/e2e/phase13-voter-verify.spec.ts (435 lines, 11 test cases)
 *
 * This spec provides verification-focused companion tests per the Phase 19
 * naming convention (phase-{N}-verification.spec.ts).
 */
import { test, expect, type Page } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

// Increase global timeout — login + navigation can be slow on the dev tailnet server
test.setTimeout(90_000)

let CAMPAIGN_ID: string


// ---------------------------------------------------------------------------
// VOTR-07: Static voter list management
// ---------------------------------------------------------------------------
test("VOTR-07: Static voter lists — list table renders with New List button", async ({
  page,
}) => {
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/lists`)
  await page.waitForTimeout(3000)

  // "Voter Lists" heading must be visible
  const heading = page.getByRole("heading", { name: /voter lists/i })
  await expect(heading).toBeVisible({ timeout: 8000 })

  // "+ New List" button must be visible (RequireRole manager — tester is owner)
  const newListBtn = page.getByRole("button", { name: /\+ new list/i })
  await expect(newListBtn).toBeVisible({ timeout: 8000 })

  // Sidebar nav "Lists" link visible
  const listsNavLink = page.getByRole("link", { name: /^lists$/i })
  await expect(listsNavLink.first()).toBeVisible()

  // DataTable renders (either with data rows or empty state)
  const bodyText = await page.locator("body").innerText()
  const hasTable =
    bodyText.includes("Name") ||
    bodyText.includes("No voter lists")
  expect(hasTable, "Should show list table or empty state").toBe(true)

  await page.screenshot({ path: "test-results/p13-votr07-static-lists.png" })
})

// ---------------------------------------------------------------------------
// VOTR-08: Dynamic voter list with filter criteria
// ---------------------------------------------------------------------------
test("VOTR-08: Dynamic voter lists — selecting Dynamic shows VoterFilterBuilder", async ({
  page,
}) => {
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/lists`)
  await page.waitForTimeout(3000)

  // Click "+ New List"
  const newListBtn = page.getByRole("button", { name: /\+ new list/i })
  await expect(newListBtn).toBeVisible({ timeout: 8000 })
  await newListBtn.click()

  // Dialog "New Voter List" opens with type selector step
  const dialogTitle = page.getByRole("heading", { name: /new voter list/i })
  await expect(dialogTitle).toBeVisible({ timeout: 5000 })

  // Two type cards: Static List and Dynamic List
  const staticCard = page.getByText(/static list/i).first()
  const dynamicCard = page.getByText(/dynamic list/i).first()
  await expect(staticCard).toBeVisible()
  await expect(dynamicCard).toBeVisible()

  // Click "Dynamic List" card to advance to step 2
  await dynamicCard.click()
  await page.waitForTimeout(1000)

  // VoterFilterBuilder renders — check for Party and Age Range labels
  const partyLabel = page.getByText(/^party$/i).first()
  await expect(partyLabel).toBeVisible({ timeout: 5000 })

  const ageRangeLabel = page.getByText(/age range/i).first()
  await expect(ageRangeLabel).toBeVisible()

  await page.screenshot({ path: "test-results/p13-votr08-dynamic-lists.png" })
})

// ---------------------------------------------------------------------------
// VOTR-10: Advanced search with composable filters
// ---------------------------------------------------------------------------
test("VOTR-10: Advanced search — Filters button toggles VoterFilterBuilder panel", async ({
  page,
}) => {
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
  await page.waitForTimeout(3000)

  // "All Voters" heading must be visible
  const heading = page.getByRole("heading", { name: /all voters/i })
  await expect(heading).toBeVisible({ timeout: 8000 })

  // "Filters" toggle button must be visible
  const filtersBtn = page.getByRole("button", { name: /filters/i })
  await expect(filtersBtn).toBeVisible({ timeout: 8000 })

  // Click to open filter panel
  await filtersBtn.click()
  await page.waitForTimeout(1000)

  // VoterFilterBuilder renders with primary filter dimensions
  const partyLabel = page.getByText(/^party$/i).first()
  await expect(partyLabel).toBeVisible({ timeout: 5000 })

  const ageRangeLabel = page.getByText(/age range/i).first()
  await expect(ageRangeLabel).toBeVisible()

  const cityLabel = page.getByText(/^city$/i).first()
  await expect(cityLabel).toBeVisible()

  // "More filters" toggle button is present
  const moreFiltersBtn = page.getByRole("button", { name: /more filters/i })
  await expect(moreFiltersBtn).toBeVisible()

  await page.screenshot({ path: "test-results/p13-votr10-advanced-search.png" })
})

// ---------------------------------------------------------------------------
// VOTR-11: Interaction notes on voter detail History tab
// ---------------------------------------------------------------------------
test("VOTR-11: History tab — Add a Note textarea and Add Note button render", async ({
  page,
}) => {

  // Navigate to voters index and click first voter to get to detail page
  CAMPAIGN_ID = await getSeedCampaignId(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
  await page.waitForTimeout(3000)

  // Click the first voter name link in the table
  const firstVoterLink = page.locator('table a[href*="/voters/"]').first()
  const linkCount = await firstVoterLink.count()

  if (linkCount === 0) {
    // No voters exist — skip detail navigation
    console.log("VOTR-11: No voters exist — cannot navigate to detail page")
    return
  }

  await firstVoterLink.click()
  await page.waitForURL(/\/voters\/[^/]+$/, { timeout: 10_000 })
  await page.waitForTimeout(2000)

  // Switch to History tab
  const historyTab = page.getByRole("tab", { name: /history/i })
  await expect(historyTab).toBeVisible({ timeout: 8000 })
  await historyTab.click()
  await page.waitForTimeout(1500)

  // Textarea with placeholder "Add a note..."
  const noteTextarea = page.locator('textarea[placeholder="Add a note..."]')
  await expect(noteTextarea).toBeVisible({ timeout: 8000 })

  // "Add Note" button must be visible
  const addNoteBtn = page.getByRole("button", { name: /add note/i })
  await expect(addNoteBtn).toBeVisible()

  // Add Note button disabled when textarea empty
  await expect(addNoteBtn).toBeDisabled()

  // "Add a Note" heading visible
  const addNoteHeading = page.getByText(/add a note/i).first()
  await expect(addNoteHeading).toBeVisible()

  await page.screenshot({ path: "test-results/p13-votr11-history-notes.png" })
})
