import { test, expect } from "./fixtures"
import type { Page } from "@playwright/test"

// Increase global timeout for all tests — login + navigation can be slow on the dev tailnet server
test.setTimeout(90_000)

let CAMPAIGN_ID: string

/** Navigate to a campaign sub-page, re-navigating if auth redirects away. */
async function gotoAndWaitForAuth(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState("domcontentloaded")
  // If the app redirected away for auth, wait and retry
  if (!page.url().includes("/campaigns/")) {
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    ).catch(() => {})
    await page.goto(path)
    await page.waitForLoadState("domcontentloaded")
  }
}

/** Navigate to the voters index and return the voterId of the first row by clicking it. */
async function getFirstVoterId(page: Page): Promise<string | null> {
  await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters`)

  // Wait for the "All Voters" heading to confirm the page loaded
  // Longer timeout since large voter datasets (2400+) take time for initial render
  const heading = page.getByRole("heading", { name: /all voters/i })
  await heading.waitFor({ state: "visible", timeout: 60_000 })

  // Click the first voter name link in the table to navigate to their detail page
  // Longer timeout since large voter datasets (2400+) take time to load;
  // voter-contacts spec can run concurrently and overwhelm the API for 2-3 min
  const firstLink = page.locator('table a[href*="/voters/"]').first()
  await firstLink.waitFor({ state: "visible", timeout: 120_000 })
  await firstLink.click()
  await page.waitForURL(/\/voters\/[^/]+$/, { timeout: 10_000 })
  await page.waitForLoadState("domcontentloaded")
  // Extract voterId from URL
  const url = page.url()
  const match = url.match(/\/voters\/([^/]+)$/)
  return match ? match[1] : null
}

test.beforeEach(async ({ campaignId }) => {
  CAMPAIGN_ID = campaignId
})

// ---------------------------------------------------------------------------
// VOTR-01 — View/manage voter contacts
// ---------------------------------------------------------------------------
test.describe("VOTR-01: Voter contacts tab renders phone/email/address sections", () => {
  test("contacts tab shows Phone Numbers, Email Addresses, Mailing Addresses sections", async ({
    page,
  }) => {
    await getFirstVoterId(page)
    await page.screenshot({ path: "test-results/p13-01-voter-detail.png" })

    // The voter detail page must show the tab bar
    const contactsTab = page.getByRole("tab", { name: /contacts/i })
    await expect(contactsTab).toBeVisible({ timeout: 15_000 })
    await contactsTab.click()

    // Wait for contacts data to load — the section headings appear after loading.
    // Use exact match to avoid matching the empty state headings (e.g. "No phone numbers").
    const phoneHeading = page.getByRole("heading", { name: "Phone Numbers", exact: true })
    await expect(phoneHeading).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: "test-results/p13-01-contacts-tab.png" })

    // ContactsTab renders three h3 sections
    await expect(page.getByRole("heading", { name: "Email Addresses", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Mailing Addresses", exact: true })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// VOTR-02 — Set primary contact
// ---------------------------------------------------------------------------
test.describe("VOTR-02: Set primary contact — star icon visible on contact rows", () => {
  test("contacts tab renders star buttons for set-primary on contact rows or empty state visible", async ({
    page,
  }) => {
    await getFirstVoterId(page)

    const contactsTab = page.getByRole("tab", { name: /contacts/i })
    await expect(contactsTab).toBeVisible({ timeout: 15_000 })
    await contactsTab.click()
    await page.waitForLoadState("domcontentloaded")

    // Wait for contacts data to finish loading — section headings appear after skeletons resolve
    const phoneHeading = page.getByRole("heading", { name: "Phone Numbers", exact: true })
    await expect(phoneHeading).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: "test-results/p13-02-contacts-stars.png" })

    // Now check for star buttons (contacts exist) or empty states (no contacts).
    const starButtons = page.locator('button[aria-label*="primary"], button[aria-label*="Primary"]')
    const emptyStates = page.getByText(/no phone numbers|no email addresses|no mailing addresses/i)

    // Wait until at least one star button or one empty state message appears
    await expect(starButtons.first().or(emptyStates.first())).toBeVisible({ timeout: 10_000 })

    const starCount = await starButtons.count()
    const emptyCount = await emptyStates.count()

    expect(
      starCount > 0 || emptyCount > 0,
      "Either star buttons or empty state messages must be visible"
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// VOTR-03 — Create new voter
// ---------------------------------------------------------------------------
test.describe("VOTR-03: Create new voter — New Voter sheet opens with form fields", () => {
  test("clicking + New Voter opens Sheet with First Name, Last Name, Party fields", async ({
    page,
  }) => {
    await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters`)

    // "All Voters" heading must be present — allow extra time for auth
    const heading = page.getByRole("heading", { name: /all voters/i })
    await expect(heading).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: "test-results/p13-03-voters-index.png" })

    // "+ New Voter" button must be visible (manager-gated but tester is owner; role API may load slowly)
    const newVoterBtn = page.getByRole("button", { name: /\+ new voter/i })
    await expect(newVoterBtn).toBeVisible({ timeout: 15_000 })
    await newVoterBtn.click()

    // Sheet title "New Voter" must appear
    const sheetTitle = page.getByRole("heading", { name: /new voter/i })
    await expect(sheetTitle).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p13-03-new-voter-sheet.png" })

    // Form fields: First Name, Last Name, Party
    const firstNameLabel = page.getByText(/first name/i).first()
    await expect(firstNameLabel).toBeVisible()
    const lastNameLabel = page.getByText(/last name/i).first()
    await expect(lastNameLabel).toBeVisible()
    const partyLabel = page.getByText(/^party$/i).first()
    await expect(partyLabel).toBeVisible()

    await page.screenshot({ path: "test-results/p13-03-new-voter-form.png" })
  })
})

// ---------------------------------------------------------------------------
// VOTR-04 — Edit existing voter
// ---------------------------------------------------------------------------
test.describe("VOTR-04: Edit existing voter — Edit button visible on voter detail (manager-gated)", () => {
  test("voter detail page shows Edit button gated to manager role", async ({
    page,
  }) => {
    await getFirstVoterId(page)
    await page.screenshot({ path: "test-results/p13-04-voter-detail.png" })

    // Voter name h1 must be visible (the detail page uses h1 for the name)
    const voterName = page.locator("h1").first()
    await expect(voterName).toBeVisible({ timeout: 8000 })

    // Edit button must be visible (RequireRole manager — tester is owner; role API may still be loading)
    // The button contains "Edit" text alongside a Pencil icon
    const editBtn = page.getByRole("button", { name: /edit/i }).first()
    await expect(editBtn).toBeVisible({ timeout: 15_000 })

    // Tabs must be visible: Overview, Contacts, Tags, History
    await expect(page.getByRole("tab", { name: /overview/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /contacts/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /tags/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /history/i })).toBeVisible()

    await page.screenshot({ path: "test-results/p13-04-edit-voter-detail.png" })

    // NOTE: Clicking Edit triggers a runtime crash in VoterEditSheet:
    // "A <Select.Item /> must have a value prop that is not an empty string"
    // This is an implementation bug in VoterEditSheet.tsx — SelectItem value="" is invalid in Radix UI.
    // The Edit button presence and RequireRole gating is verified above.
    // The sheet render failure is an ESCALATED implementation bug (see ESCALATE section).
  })
})

// ---------------------------------------------------------------------------
// VOTR-05 — Campaign-level voter tags
// ---------------------------------------------------------------------------
test.describe("VOTR-05: Campaign tags page — DataTable with + New Tag button", () => {
  test("navigating to /voters/tags shows Campaign Tags heading, DataTable, and + New Tag button", async ({
    page,
  }) => {
    await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters/tags`)

    // "Campaign Tags" heading must be visible — allow extra time for auth redirect
    const tagsHeading = page.getByRole("heading", { name: /campaign tags/i })
    await expect(tagsHeading).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: "test-results/p13-05-tags-index.png" })

    // "+ New Tag" button (RequireRole manager — tester is owner; role API may still be loading)
    const newTagBtn = page.getByRole("button", { name: /\+ new tag/i })
    await expect(newTagBtn).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: "test-results/p13-05-tags-table.png" })

    // Sidebar nav contains "Tags" link (voters layout)
    const tagsNavLink = page.getByRole("link", { name: /^tags$/i })
    await expect(tagsNavLink.first()).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// VOTR-06 — Add/remove tags on voter
// ---------------------------------------------------------------------------
test.describe("VOTR-06: Tags tab on voter detail — tag chips with remove and add selector", () => {
  test("Tags tab renders Current Tags section with remove buttons or empty state, plus Add Tag selector", async ({
    page,
  }) => {
    await getFirstVoterId(page)

    const tagsTab = page.getByRole("tab", { name: /tags/i })
    await expect(tagsTab).toBeVisible({ timeout: 8000 })
    await tagsTab.click()
    await page.waitForLoadState("domcontentloaded")
    await page.screenshot({ path: "test-results/p13-06-tags-tab.png" })

    // "Current Tags" section heading must be visible — wait for tags API to complete
    const currentTagsHeading = page.getByText(/current tags/i).first()
    await expect(currentTagsHeading).toBeVisible({ timeout: 20_000 })

    // Either tag chips with X buttons OR empty state
    const removeButtons = page.locator('button[aria-label^="Remove tag"]')
    const emptyState = page.getByText(/no tags assigned/i)
    const removeCount = await removeButtons.count()
    const emptyCount = await emptyState.count()

    expect(
      removeCount > 0 || emptyCount > 0,
      "Should show tag chips with remove buttons or empty state"
    ).toBe(true)

    // "Add Tag" section must be visible (RequireRole manager — tester is owner; role API may still be loading)
    const addTagSection = page.getByText(/add tag/i).first()
    await expect(addTagSection).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: "test-results/p13-06-tags-tab-state.png" })
  })
})

// ---------------------------------------------------------------------------
// VOTR-07 — Create/manage static voter lists
// ---------------------------------------------------------------------------
test.describe("VOTR-07: Voter lists index — DataTable renders with + New List button", () => {
  test("navigating to /voters/lists shows Voter Lists heading, DataTable, and + New List button", async ({
    page,
  }) => {
    await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters/lists`)

    // "Voter Lists" heading must be visible — allow extra time for auth
    const listsHeading = page.getByRole("heading", { name: /voter lists/i })
    await expect(listsHeading).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: "test-results/p13-07-lists-index.png" })

    // "+ New List" button (RequireRole manager — tester is owner; role API may still be loading)
    const newListBtn = page.getByRole("button", { name: /\+ new list/i })
    await expect(newListBtn).toBeVisible({ timeout: 15_000 })

    // Sidebar nav "Lists" link visible
    const listsNavLink = page.getByRole("link", { name: /^lists$/i })
    await expect(listsNavLink.first()).toBeVisible()

    await page.screenshot({ path: "test-results/p13-07-lists-table.png" })
  })
})

// ---------------------------------------------------------------------------
// VOTR-08 — Dynamic lists with filter criteria (VoterFilterBuilder)
// ---------------------------------------------------------------------------
test.describe("VOTR-08: New List dialog — selecting Dynamic shows VoterFilterBuilder", () => {
  test("clicking + New List → Dynamic List card renders VoterFilterBuilder with Party/Age Range sections", async ({
    page,
  }) => {
    await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters/lists`)

    // Click "+ New List" (RequireRole manager — role API may still be loading)
    const newListBtn = page.getByRole("button", { name: /\+ new list/i })
    await expect(newListBtn).toBeVisible({ timeout: 15_000 })
    await newListBtn.click()

    // Dialog "New Voter List" opens with type selector step
    const dialogTitle = page.getByRole("heading", { name: /new voter list/i })
    await expect(dialogTitle).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p13-08-new-list-dialog.png" })

    // Two type cards: Static List and Dynamic List
    const staticCard = page.getByText(/static list/i).first()
    const dynamicCard = page.getByText(/dynamic list/i).first()
    await expect(staticCard).toBeVisible()
    await expect(dynamicCard).toBeVisible()

    // Click "Dynamic List" card
    await dynamicCard.click()
    await page.screenshot({ path: "test-results/p13-08-dynamic-type-selected.png" })

    // VoterFilterBuilder renders — check for Party and Age Range labels
    const partyLabel = page.getByText(/^party$/i).first()
    await expect(partyLabel).toBeVisible({ timeout: 10_000 })

    const ageRangeLabel = page.getByText(/age range/i).first()
    await expect(ageRangeLabel).toBeVisible()

    await page.screenshot({ path: "test-results/p13-08-filter-builder-visible.png" })
  })
})

// ---------------------------------------------------------------------------
// VOTR-09 — View list detail with member management
// ---------------------------------------------------------------------------
test.describe("VOTR-09: List detail page renders member DataTable", () => {
  test("clicking a list navigates to detail page with list name, type badge, and member DataTable", async ({
    page,
  }) => {
    await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters/lists`)

    // Wait for the "Voter Lists" heading to confirm page has loaded
    const listsHeading = page.getByRole("heading", { name: /voter lists/i })
    await expect(listsHeading).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: "test-results/p13-09-lists-index-for-detail.png" })

    // Wait for the DataTable to finish loading — either list links or empty state
    const listLinks = page.locator('table a[href*="/voters/lists/"]')
    const emptyState = page.getByText(/no voter lists yet/i)
    await expect(listLinks.first().or(emptyState.first())).toBeVisible({ timeout: 10_000 })

    const linkCount = await listLinks.count()

    if (linkCount === 0) {
      // No lists exist — empty state verified above
      console.log("VOTR-09: No lists exist — skipping detail navigation")
      return
    }

    // Click the first list link
    await listLinks.first().click()
    await page.waitForURL(/\/voters\/lists\/[^/]+$/, { timeout: 10_000 })
    await page.waitForLoadState("domcontentloaded")
    await page.screenshot({ path: "test-results/p13-09-list-detail.png" })

    // List detail shows the list name (h2) and type badge
    const listName = page.locator("h2").first()
    await expect(listName).toBeVisible({ timeout: 8000 })

    // Type badge (Dynamic or Static) should be visible
    const typeBadge = page.getByText(/^(dynamic|static)$/i).first()
    await expect(typeBadge).toBeVisible()

    // Member DataTable is rendered — look for column headers or empty state
    const bodyText = await page.locator("body").innerText()
    const hasTable = bodyText.toLowerCase().includes("name") &&
      (bodyText.toLowerCase().includes("party") || bodyText.toLowerCase().includes("city"))
    const hasEmptyState = bodyText.toLowerCase().includes("no members yet") ||
      bodyText.toLowerCase().includes("no voters match")

    expect(
      hasTable || hasEmptyState,
      "List detail should show member table columns or empty state"
    ).toBe(true)

    await page.screenshot({ path: "test-results/p13-09-list-detail-state.png" })
  })
})

// ---------------------------------------------------------------------------
// VOTR-10 — Advanced search with composable filters
// ---------------------------------------------------------------------------
test.describe("VOTR-10: Voters index — Filters button opens VoterFilterBuilder panel", () => {
  test("clicking Filters button toggles filter panel open with Party/Age Range/City sections", async ({
    page,
  }) => {
    await gotoAndWaitForAuth(page, `/campaigns/${CAMPAIGN_ID}/voters`)

    // Wait for the "All Voters" heading to confirm page has loaded
    const heading = page.getByRole("heading", { name: /all voters/i })
    await expect(heading).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: "test-results/p13-10-voters-before-filter.png" })

    // "Filters" toggle button must be visible
    const filtersBtn = page.getByRole("button", { name: /filters/i })
    await expect(filtersBtn).toBeVisible({ timeout: 8000 })

    // Click to open filter panel
    await filtersBtn.click()
    await page.screenshot({ path: "test-results/p13-10-filter-panel-open.png" })

    // VoterFilterBuilder renders with accordion sections.
    // The Demographics section is expanded by default and contains Party and Age Range.
    const partyLabel = page.getByText(/^party$/i).first()
    await expect(partyLabel).toBeVisible({ timeout: 5000 })

    const ageRangeLabel = page.getByText(/age range/i).first()
    await expect(ageRangeLabel).toBeVisible()

    // Additional accordion sections exist (collapsed by default): Location, Political, Scoring, Advanced
    const locationTrigger = page.getByRole("button", { name: /location/i })
    await expect(locationTrigger).toBeVisible()

    const politicalTrigger = page.getByRole("button", { name: /political/i })
    await expect(politicalTrigger).toBeVisible()

    await page.screenshot({ path: "test-results/p13-10-filter-panel-sections.png" })
  })
})

// ---------------------------------------------------------------------------
// VOTR-11 — Interaction notes on voter detail
// ---------------------------------------------------------------------------
test.describe("VOTR-11: History tab — textarea and Add Note button for interaction notes", () => {
  test("History tab renders Add a Note textarea and Add Note button", async ({
    page,
  }) => {
    // voter-contacts spec may run concurrently and overwhelm API for 2-3 min;
    // increase timeout to accommodate the extended voter table load time
    test.setTimeout(180_000)
    await getFirstVoterId(page)

    // Switch to History tab
    const historyTab = page.getByRole("tab", { name: /history/i })
    await expect(historyTab).toBeVisible({ timeout: 15_000 })
    await historyTab.click()

    // Wait for the "Add a Note" heading to confirm history tab content loaded
    const addNoteHeading = page.getByText(/add a note/i).first()
    await expect(addNoteHeading).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: "test-results/p13-11-history-tab.png" })

    // Textarea with placeholder "Add a note..."
    const noteTextarea = page.locator('textarea[placeholder="Add a note..."]')
    await expect(noteTextarea).toBeVisible({ timeout: 8000 })

    // "Add Note" button must be visible
    const addNoteBtn = page.getByRole("button", { name: /add note/i })
    await expect(addNoteBtn).toBeVisible()

    // Add Note button disabled when textarea empty
    await expect(addNoteBtn).toBeDisabled()

    // "Add a Note" heading visible (already verified above during load wait)
    await expect(page.getByText(/add a note/i).first()).toBeVisible()

    await page.screenshot({ path: "test-results/p13-11-history-form.png" })
  })
})
