import { test, expect } from "@playwright/test"
import { getSeedCampaignId } from "./helpers"

let CAMPAIGN_ID: string


/** Wait for a table to fully load (visible + no skeleton rows) */
async function waitForTable(page: import("@playwright/test").Page) {
  const table = page.getByRole("table").first()
  await expect(table).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(".animate-pulse").first()).toBeHidden({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(500)
}

/** Count sortable columns (th[aria-sort]) via JS to avoid Playwright strict-mode issues */
async function countSortableHeaders(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("th[aria-sort]").length)
}

/** Audit: click each sortable header and check if aria-sort changes */
async function auditSortButtons(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll<HTMLElement>("th[aria-sort]"))
    return ths.map((th) => {
      const text = th.textContent?.trim() ?? ""
      const before = th.getAttribute("aria-sort")
      th.click()
      const after = th.getAttribute("aria-sort")
      return { text, before, after, changed: before !== after }
    })
  })
}

// ─── BUG: Voters table — sorting infrastructure exists but sort UI never renders ─
//
// Root cause: voters/index.tsx columns use `id:` without `accessorKey` or `accessorFn`.
// In @tanstack/react-table v8, getCanSort() requires `!!column.accessorFn` (RowSorting.ts:482).
// Columns without an accessor never get aria-sort, cursor-pointer, or sort icons.
// The full sorting wiring (SORT_COLUMN_MAP, handleSortingChange, API params) is dead code.

test.describe("Voters table — sort buttons missing (BUG)", () => {
  test("Name, Party, City, Age columns have enableSorting but no sort UI renders", async ({ page }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters`)
    await waitForTable(page)

    // These 4 columns have enableSorting: true but use `id:` without accessorKey
    const sortableCount = await countSortableHeaders(page)

    // BUG: should be 4 sortable columns, but 0 render because columns lack accessorFn
    test.info().annotations.push({
      type: "bug",
      description: `Voters table: ${sortableCount} sortable columns found (expected 0 due to missing accessorKey bug)`,
    })

    // Currently: zero sortable columns render (bug confirmed)
    expect(sortableCount).toBe(0)

    // Document the fix needed:
    // Change each column from { id: "name", ... } to { accessorKey: "name", ... }
    // or add accessorFn to enable sorting.

    await page.screenshot({ path: "screenshots/table-sort/voters-no-sort-buttons.png" })
  })
})

// ─── Tables with sort buttons visible but non-functional ─────────────────────
//
// These tables use accessorKey so getCanSort() returns true and sort UI renders.
// However, none pass sorting/onSortingChange to DataTable, so clicking does nothing.

interface TableConfig {
  name: string
  /** Path suffix after /campaigns/{id}/ */
  pathSuffix: string
  expectedSortableCols: string[]
}

const TABLES_WITH_BROKEN_SORT: TableConfig[] = [
  {
    name: "Settings Members",
    pathSuffix: "settings/members",
    expectedSortableCols: ["Name", "Email", "Role", "Joined"],
  },
  {
    name: "Voter Lists",
    pathSuffix: "voters/lists",
    expectedSortableCols: ["Name", "Type", "Members", "Created"],
  },
  {
    name: "Voter Tags",
    pathSuffix: "voters/tags",
    expectedSortableCols: ["Tag name"],
  },
  {
    name: "PB Sessions",
    pathSuffix: "phone-banking/sessions",
    expectedSortableCols: ["Name", "Status"],
  },
  {
    name: "PB Call Lists",
    pathSuffix: "phone-banking/call-lists",
    expectedSortableCols: ["Name", "Status", "Created"],
  },
  {
    name: "PB DNC",
    pathSuffix: "phone-banking/dnc",
    expectedSortableCols: ["Phone Number", "Reason", "Date Added"],
  },
  {
    name: "Volunteer Roster",
    pathSuffix: "volunteers/roster",
    expectedSortableCols: ["Name", "Email", "Phone", "Status"],
  },
  {
    name: "Volunteer Tags",
    pathSuffix: "volunteers/tags",
    expectedSortableCols: ["Name", "Created"],
  },
]

test.describe("Sort buttons visible but non-functional (BUG)", () => {
  for (const tbl of TABLES_WITH_BROKEN_SORT) {
    test(`${tbl.name}: sort buttons render but clicking does nothing`, async ({ page }) => {
      CAMPAIGN_ID = await getSeedCampaignId(page)
      await page.goto(`/campaigns/${CAMPAIGN_ID}/${tbl.pathSuffix}`)
      await waitForTable(page).catch(() => page.waitForTimeout(2000))

      const sortableCount = await countSortableHeaders(page)

      test.info().annotations.push({
        type: "bug",
        description: `${tbl.name}: ${sortableCount} sort buttons render but onSortingChange is not wired`,
      })

      expect(sortableCount, `${tbl.name} should have sortable columns`).toBeGreaterThan(0)

      // Click each sortable header — aria-sort should stay "none" (bug)
      const results = await auditSortButtons(page)

      for (const col of results) {
        if (!col.text) continue
        expect(
          col.changed,
          `${tbl.name} > "${col.text}": aria-sort should stay "none" (sorting not wired)`,
        ).toBe(false)
        expect(col.after).toBe("none")
      }

      await page.screenshot({
        path: `screenshots/table-sort/${tbl.name.toLowerCase().replace(/\s+/g, "-")}-sort-audit.png`,
      })
    })
  }
})

// ─── Shift Detail — all sorting correctly disabled ───────────────────────────

test.describe("Shift detail — no sort buttons (correct)", () => {
  test("shift detail roster table has zero sortable columns", async ({ page }) => {
    CAMPAIGN_ID = await getSeedCampaignId(page)
    await page.goto(`/campaigns/${CAMPAIGN_ID}/volunteers/shifts`)
    await page.waitForLoadState("networkidle")

    const shiftLink = page.locator("a[href*='/shifts/']").first()
    const hasShifts = await shiftLink.count()

    if (hasShifts === 0) {
      console.log("No shifts found — test is vacuously satisfied")
      return
    }

    await shiftLink.click()
    await page.waitForURL(/shifts\/[^/]+/, { timeout: 10_000 })
    await page.waitForLoadState("networkidle")

    // This table correctly has zero sortable columns (no accessorKey columns with enableSorting)
    const sortableCount = await countSortableHeaders(page)
    expect(sortableCount, "Shift detail roster should have zero sortable columns").toBe(0)

    await page.screenshot({ path: "screenshots/table-sort/shift-detail-no-sort.png" })
  })
})
