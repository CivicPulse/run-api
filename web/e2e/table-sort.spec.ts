import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 15_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 20_000 })
  await page.waitForTimeout(2000)
}

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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/voters`)
    await waitForTable(page)

    // These 4 columns have enableSorting: true but use `id:` without accessorKey
    const sortableCount = await countSortableHeaders(page)

    // BUG: should be 4 sortable columns, but 0 render because columns lack accessorFn
    test.info().annotations.push({
      type: "bug",
      description:
        "Voters table: 4 columns have enableSorting:true but 0 sort buttons render. " +
        "Root cause: columns use id: without accessorKey, so getCanSort() returns false.",
    })

    expect(sortableCount, "No sort buttons render on voters table (missing accessorKey)").toBe(0)

    // Verify the table headers exist but have no sort attributes
    const headerInfo = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll("th"))
      return ths.map((th) => ({
        text: th.textContent?.trim() ?? "",
        ariaSort: th.getAttribute("aria-sort"),
        cursor: globalThis.getComputedStyle(th).cursor,
        hasSvg: th.querySelector("svg") !== null,
      }))
    })

    // Name, Party, City, Age headers exist but have no sort affordances
    for (const name of ["Name", "Party", "City", "Age"]) {
      const col = headerInfo.find((h) => h.text === name)
      expect(col, `${name} header should exist`).toBeDefined()
      expect(col?.ariaSort, `${name} should have no aria-sort`).toBeNull()
      expect(col?.cursor, `${name} should not have pointer cursor`).not.toBe("pointer")
      expect(col?.hasSvg, `${name} should not have sort icon SVG`).toBe(false)
    }

    await page.screenshot({ path: "screenshots/table-sort/voters-no-sort-buttons.png" })
  })
})

// ─── Tables with sort buttons visible but non-functional ─────────────────────
//
// These tables use accessorKey so getCanSort() returns true and sort UI renders.
// However, none pass sorting/onSortingChange to DataTable, so clicking does nothing.

interface TableConfig {
  name: string
  path: string
  expectedSortableCols: string[]
}

const TABLES_WITH_BROKEN_SORT: TableConfig[] = [
  {
    name: "Settings Members",
    path: `/campaigns/${CAMPAIGN_ID}/settings/members`,
    expectedSortableCols: ["Name", "Email", "Role", "Joined"],
  },
  {
    name: "Voter Lists",
    path: `/campaigns/${CAMPAIGN_ID}/voters/lists`,
    expectedSortableCols: ["Name", "Type", "Members", "Created"],
  },
  {
    name: "Voter Tags",
    path: `/campaigns/${CAMPAIGN_ID}/voters/tags`,
    expectedSortableCols: ["Tag name"],
  },
  {
    name: "PB Sessions",
    path: `/campaigns/${CAMPAIGN_ID}/phone-banking/sessions`,
    expectedSortableCols: ["Name", "Status"],
  },
  {
    name: "PB Call Lists",
    path: `/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`,
    expectedSortableCols: ["Name", "Status", "Created"],
  },
  {
    name: "PB DNC",
    path: `/campaigns/${CAMPAIGN_ID}/phone-banking/dnc`,
    expectedSortableCols: ["Phone Number", "Reason", "Date Added"],
  },
  {
    name: "Volunteer Roster",
    path: `/campaigns/${CAMPAIGN_ID}/volunteers/roster`,
    expectedSortableCols: ["Name", "Email", "Phone", "Status"],
  },
  {
    name: "Volunteer Tags",
    path: `/campaigns/${CAMPAIGN_ID}/volunteers/tags`,
    expectedSortableCols: ["Name", "Created"],
  },
]

test.describe("Sort buttons visible but non-functional (BUG)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  for (const tbl of TABLES_WITH_BROKEN_SORT) {
    test(`${tbl.name}: sort buttons render but clicking does nothing`, async ({ page }) => {
      await page.goto(`${BASE}${tbl.path}`)
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
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/volunteers/shifts`)
    await page.waitForTimeout(3000)

    const shiftLink = page.locator("a[href*='/shifts/']").first()
    const hasShift = await shiftLink.isVisible().catch(() => false)
    if (!hasShift) {
      test.skip(true, "No shifts in seed data")
      return
    }

    await shiftLink.click()
    await page.waitForTimeout(2000)

    // Click the Roster tab to show the DataTable
    const rosterTab = page.getByRole("tab", { name: "Roster" })
    if (await rosterTab.isVisible().catch(() => false)) {
      await rosterTab.click()
      await page.waitForTimeout(1000)
    }

    const sortableCount = await countSortableHeaders(page)
    expect(sortableCount, "Shift detail should have 0 sortable columns").toBe(0)

    await page.screenshot({ path: "screenshots/table-sort/shift-detail-no-sort.png" })
  })
})
