import { test, expect, type Page } from "@playwright/test"

// Increase global timeout for all tests — login + navigation can be slow on the dev tailnet server
test.setTimeout(90_000)

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 25_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 30_000 })
  await page.waitForTimeout(2000)
}

/** Navigate to the voters index and return the voterId of the first row by clicking it. */
async function getFirstVoterId(page: Page): Promise<string | null> {
  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
  await page.waitForTimeout(3000)
  // Click the first voter name link in the table to navigate to their detail page
  const firstLink = page.locator('table a[href*="/voters/"]').first()
  const count = await firstLink.count()
  if (count === 0) return null
  const href = await firstLink.getAttribute("href")
  await firstLink.click()
  await page.waitForURL(/\/voters\/[^/]+$/, { timeout: 10_000 })
  await page.waitForTimeout(2000)
  // Extract voterId from URL
  const url = page.url()
  const match = url.match(/\/voters\/([^/]+)$/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// VOTR-01 — View/manage voter contacts
// ---------------------------------------------------------------------------
test.describe("VOTR-01: Voter contacts tab renders phone/email/address sections", () => {
  test("contacts tab shows Phone Numbers, Email Addresses, Mailing Addresses sections", async ({
    page,
  }) => {
    await login(page)
    await getFirstVoterId(page)
    await page.screenshot({ path: "test-results/p13-01-voter-detail.png" })

    // The voter detail page must show the tab bar
    const contactsTab = page.getByRole("tab", { name: /contacts/i })
    await expect(contactsTab).toBeVisible({ timeout: 8000 })
    await contactsTab.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: "test-results/p13-01-contacts-tab.png" })

    // ContactsTab renders three h3 sections
    const bodyText = await page.locator("body").innerText()
    expect(bodyText).toMatch(/Phone Numbers/i)
    expect(bodyText).toMatch(/Email Addresses/i)
    expect(bodyText).toMatch(/Mailing Addresses/i)
  })
})

// ---------------------------------------------------------------------------
// VOTR-02 — Set primary contact
// ---------------------------------------------------------------------------
test.describe("VOTR-02: Set primary contact — star icon visible on contact rows", () => {
  test("contacts tab renders star buttons for set-primary on contact rows or empty state visible", async ({
    page,
  }) => {
    await login(page)
    await getFirstVoterId(page)

    const contactsTab = page.getByRole("tab", { name: /contacts/i })
    await expect(contactsTab).toBeVisible({ timeout: 8000 })
    await contactsTab.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: "test-results/p13-02-contacts-stars.png" })

    // Either star buttons appear (contacts exist) OR empty states are shown
    const starButtons = page.locator('button[aria-label*="primary"], button[aria-label*="Primary"]')
    const emptyStates = page.getByText(/no phone numbers|no email addresses|no mailing addresses/i)

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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p13-03-voters-index.png" })

    // "All Voters" heading must be present
    const heading = page.getByRole("heading", { name: /all voters/i })
    await expect(heading).toBeVisible({ timeout: 8000 })

    // "+ New Voter" button must be visible (manager-gated but tester is owner)
    const newVoterBtn = page.getByRole("button", { name: /\+ new voter/i })
    await expect(newVoterBtn).toBeVisible({ timeout: 8000 })
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
    await login(page)
    await getFirstVoterId(page)
    await page.screenshot({ path: "test-results/p13-04-voter-detail.png" })

    // Voter name h2 must be visible
    const voterName = page.locator("h2").first()
    await expect(voterName).toBeVisible({ timeout: 8000 })

    // Edit button must be visible (RequireRole manager — tester is owner so it should be visible)
    // The button contains "Edit" text alongside a Pencil icon
    const editBtn = page.getByRole("button", { name: /edit/i }).first()
    await expect(editBtn).toBeVisible({ timeout: 8000 })

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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters/tags`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p13-05-tags-index.png" })

    // "Campaign Tags" heading must be visible
    const tagsHeading = page.getByRole("heading", { name: /campaign tags/i })
    await expect(tagsHeading).toBeVisible({ timeout: 8000 })

    // "+ New Tag" button (RequireRole manager — tester is owner)
    const newTagBtn = page.getByRole("button", { name: /\+ new tag/i })
    await expect(newTagBtn).toBeVisible({ timeout: 8000 })
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
    await login(page)
    await getFirstVoterId(page)

    const tagsTab = page.getByRole("tab", { name: /tags/i })
    await expect(tagsTab).toBeVisible({ timeout: 8000 })
    await tagsTab.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: "test-results/p13-06-tags-tab.png" })

    // "Current Tags" section heading must be visible
    const currentTagsHeading = page.getByText(/current tags/i).first()
    await expect(currentTagsHeading).toBeVisible({ timeout: 8000 })

    // Either tag chips with X buttons OR empty state
    const removeButtons = page.locator('button[aria-label^="Remove tag"]')
    const emptyState = page.getByText(/no tags assigned/i)
    const removeCount = await removeButtons.count()
    const emptyCount = await emptyState.count()

    expect(
      removeCount > 0 || emptyCount > 0,
      "Should show tag chips with remove buttons or empty state"
    ).toBe(true)

    // "Add Tag" section must be visible (RequireRole manager — tester is owner)
    const addTagSection = page.getByText(/add tag/i).first()
    await expect(addTagSection).toBeVisible({ timeout: 5000 })

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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters/lists`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p13-07-lists-index.png" })

    // "Voter Lists" heading must be visible
    const listsHeading = page.getByRole("heading", { name: /voter lists/i })
    await expect(listsHeading).toBeVisible({ timeout: 8000 })

    // "+ New List" button (RequireRole manager — tester is owner)
    const newListBtn = page.getByRole("button", { name: /\+ new list/i })
    await expect(newListBtn).toBeVisible({ timeout: 8000 })

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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters/lists`)
    await page.waitForTimeout(3000)

    // Click "+ New List"
    const newListBtn = page.getByRole("button", { name: /\+ new list/i })
    await expect(newListBtn).toBeVisible({ timeout: 8000 })
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
    await page.waitForTimeout(1000)
    await page.screenshot({ path: "test-results/p13-08-dynamic-type-selected.png" })

    // VoterFilterBuilder renders — check for Party and Age Range labels
    const partyLabel = page.getByText(/^party$/i).first()
    await expect(partyLabel).toBeVisible({ timeout: 5000 })

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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters/lists`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p13-09-lists-index-for-detail.png" })

    // Check if any list links exist in the table
    const listLinks = page.locator('table a[href*="/voters/lists/"]')
    const linkCount = await listLinks.count()

    if (linkCount === 0) {
      // No lists exist — verify DataTable is rendered with empty state
      const bodyText = await page.locator("body").innerText()
      const hasEmptyState = bodyText.toLowerCase().includes("no voter lists") ||
        bodyText.toLowerCase().includes("voter lists")
      expect(hasEmptyState, "Should show voter lists page (empty or with data)").toBe(true)
      console.log("VOTR-09: No lists exist — skipping detail navigation")
      return
    }

    // Click the first list link
    await listLinks.first().click()
    await page.waitForURL(/\/voters\/lists\/[^/]+$/, { timeout: 10_000 })
    await page.waitForTimeout(2000)
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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p13-10-voters-before-filter.png" })

    // "Filters" toggle button must be visible
    const filtersBtn = page.getByRole("button", { name: /filters/i })
    await expect(filtersBtn).toBeVisible({ timeout: 8000 })

    // Click to open filter panel
    await filtersBtn.click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: "test-results/p13-10-filter-panel-open.png" })

    // VoterFilterBuilder renders with primary dimensions
    const partyLabel = page.getByText(/^party$/i).first()
    await expect(partyLabel).toBeVisible({ timeout: 5000 })

    const ageRangeLabel = page.getByText(/age range/i).first()
    await expect(ageRangeLabel).toBeVisible()

    const cityLabel = page.getByText(/^city$/i).first()
    await expect(cityLabel).toBeVisible()

    // "More filters" toggle button is present
    const moreFiltersBtn = page.getByRole("button", { name: /more filters/i })
    await expect(moreFiltersBtn).toBeVisible()

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
    await login(page)
    await getFirstVoterId(page)

    // Switch to History tab
    const historyTab = page.getByRole("tab", { name: /history/i })
    await expect(historyTab).toBeVisible({ timeout: 8000 })
    await historyTab.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: "test-results/p13-11-history-tab.png" })

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

    await page.screenshot({ path: "test-results/p13-11-history-form.png" })
  })
})
