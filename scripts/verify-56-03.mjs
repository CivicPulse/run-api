/**
 * Visual verification script for Phase 56-03 features.
 * Uses Playwright to screenshot all feature states.
 *
 * Run: node scripts/verify-56-03.mjs
 */
import { createRequire } from "module"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Resolve playwright from web/node_modules
const require = createRequire(join(__dirname, "..", "web", "package.json"))
const { chromium } = require("playwright")

const ROOT = join(__dirname, "..")
const BASE = "http://localhost:5173"
const CAMPAIGN_ID = "26324771-d2fd-4f60-ab3c-3cebfddd723a"
const VOTER_ID = "4b6306cf-7755-4287-b096-df04642755aa" // James Smith
const WALK_LIST_ID = "07e0f896-2a60-4acc-83e7-3bb806095579" // Ingleside Walk
const SCREENSHOTS = join(ROOT, "screenshots")
// Local ZITADEL credentials (from bootstrap)
const USERNAME = "admin@localhost"
const PASSWORD = "Admin1234!"
const NEW_PASSWORD = "Admin1234!E2e"

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()

  try {
    // === LOGIN ===
    console.log("Step 1: Navigate to /login to trigger OIDC redirect...")
    await page.goto(`${BASE}/login`, { timeout: 30000 })
    await page.waitForTimeout(5000)
    console.log("  Current URL:", page.url())

    // We should be at ZITADEL login at localhost:8080
    if (page.url().includes(":8080") || page.url().includes("/ui/login")) {
      console.log("  At local ZITADEL login page, filling credentials...")

      // Fill login name
      const loginInput = page.locator('#loginName, input[name="loginName"]').first()
      await loginInput.waitFor({ state: "visible", timeout: 10000 })
      await loginInput.fill(USERNAME)

      // Click Next
      await page.locator('button:has-text("Next")').click()
      await page.waitForTimeout(3000)
      console.log("  After username step, URL:", page.url())

      // Fill password
      const passwordInput = page.locator('input[type="password"]').first()
      await passwordInput.waitFor({ state: "visible", timeout: 10000 })
      await passwordInput.fill(PASSWORD)

      // Click Next
      await page.locator('button:has-text("Next")').click()
      await page.waitForTimeout(5000)
      console.log("  After password step, URL:", page.url())

      // Handle forced password change
      const changePasswordText = page.locator("text=Change Password")
      if (await changePasswordText.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log("  Password change required, handling...")
        await page.locator('input[type="password"]').nth(0).fill(PASSWORD)
        await page.locator('input[type="password"]').nth(1).fill(NEW_PASSWORD)
        await page.locator('input[type="password"]').nth(2).fill(NEW_PASSWORD)
        await page.locator('button:has-text("Next")').click()
        await page.waitForTimeout(5000)
      }

      // Wait for redirect back to app
      console.log("  Waiting for redirect back to app...")
      try {
        await page.waitForURL(
          (url) => url.port === "5173" && !url.pathname.includes("/login"),
          { timeout: 15000 },
        )
      } catch {
        console.log("  Redirect timeout, current URL:", page.url())
      }
      await page.waitForTimeout(3000)
      console.log("  After login flow, URL:", page.url())
    }

    // Verify we're authenticated
    await page.screenshot({
      path: join(SCREENSHOTS, "56-03-00-logged-in.png"),
      fullPage: true,
    })
    console.log("  Screenshot: 56-03-00-logged-in.png")

    // ===== TEST 1: Note Edit =====
    console.log("\n=== Test 1: Note Edit (FEAT-01) ===")
    await page.goto(
      `${BASE}/campaigns/${CAMPAIGN_ID}/voters/${VOTER_ID}`,
      { waitUntil: "networkidle", timeout: 15000 },
    )
    await page.waitForTimeout(3000)

    // Click History tab
    const historyTab = page.locator('button[role="tab"]').filter({ hasText: "History" })
    if (await historyTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await historyTab.click()
      await page.waitForTimeout(2000)
    } else {
      console.log("  History tab not found, checking for tab buttons...")
      const tabs = page.locator('button[role="tab"]')
      const tabCount = await tabs.count()
      console.log("  Tab buttons found:", tabCount)
      for (let i = 0; i < tabCount; i++) {
        const text = await tabs.nth(i).textContent()
        console.log(`    Tab ${i}: ${text}`)
      }
    }

    await page.screenshot({
      path: join(SCREENSHOTS, "56-03-01-history-tab.png"),
      fullPage: true,
    })
    console.log("  Screenshot: 56-03-01-history-tab.png")

    // Add a note first
    console.log("  Adding a test note...")
    const textarea = page.locator('textarea[placeholder="Add a note..."]')
    if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textarea.fill("Test note for Phase 56 visual verification")
      const addBtn = page.locator('button:has-text("Add Note")')
      await addBtn.click()
      await page.waitForTimeout(3000)

      await page.screenshot({
        path: join(SCREENSHOTS, "56-03-02-note-added.png"),
        fullPage: true,
      })
      console.log("  Screenshot: 56-03-02-note-added.png (Note created)")

      // Find the 3-dot menu on the note
      const noteCards = page.locator(".border.rounded-lg").filter({ hasText: "Test note for Phase 56" })
      const count = await noteCards.count()
      console.log("  Note cards found:", count)

      if (count > 0) {
        // Click the small actions button (MoreVertical)
        const menuBtn = noteCards.first().locator("button").last()
        if (await menuBtn.isVisible()) {
          console.log("  Clicking 3-dot menu...")
          await menuBtn.click()
          await page.waitForTimeout(500)

          await page.screenshot({
            path: join(SCREENSHOTS, "56-03-03-note-dropdown.png"),
            fullPage: true,
          })
          console.log("  Screenshot: 56-03-03-note-dropdown.png (Edit/Delete menu)")

          // Click Edit
          const editItem = page.locator('[role="menuitem"]').filter({ hasText: "Edit" })
          if (await editItem.isVisible()) {
            await editItem.click()
            await page.waitForTimeout(500)

            await page.screenshot({
              path: join(SCREENSHOTS, "56-03-04-edit-dialog.png"),
              fullPage: true,
            })
            console.log("  Screenshot: 56-03-04-edit-dialog.png (Edit dialog with pre-filled text)")

            // Edit the text
            const editTextarea = page.locator("#edit-note-text")
            if (await editTextarea.isVisible()) {
              await editTextarea.clear()
              await editTextarea.fill("EDITED: Phase 56 verification - note successfully edited")
              await page.locator('[role="dialog"] button').filter({ hasText: "Save" }).click()
              await page.waitForTimeout(3000)

              await page.screenshot({
                path: join(SCREENSHOTS, "56-03-05-note-edited.png"),
                fullPage: true,
              })
              console.log("  Screenshot: 56-03-05-note-edited.png (Updated text visible)")
            }
          }
        }
      }
    } else {
      console.log("  WARNING: Note textarea not found - checking page content...")
      const bodyText = await page.locator("body").textContent()
      console.log("  Page text (first 200 chars):", bodyText?.substring(0, 200))
    }

    // ===== TEST 2: Note Delete =====
    console.log("\n=== Test 2: Note Delete (FEAT-02) ===")
    const editedNotes = page.locator(".border.rounded-lg").filter({ hasText: "EDITED: Phase 56" })
    const editedCount = await editedNotes.count()
    console.log("  Edited note cards found:", editedCount)

    if (editedCount > 0) {
      const menuBtn2 = editedNotes.first().locator("button").last()
      await menuBtn2.click()
      await page.waitForTimeout(500)

      const deleteItem = page.locator('[role="menuitem"]').filter({ hasText: "Delete" })
      if (await deleteItem.isVisible()) {
        await deleteItem.click()
        await page.waitForTimeout(500)

        await page.screenshot({
          path: join(SCREENSHOTS, "56-03-06-delete-confirm.png"),
          fullPage: true,
        })
        console.log("  Screenshot: 56-03-06-delete-confirm.png (Delete confirmation dialog)")

        // Confirm delete
        const confirmDeleteBtn = page.locator('[role="alertdialog"] button, [role="dialog"] button')
          .filter({ hasText: "Delete" })
          .last()
        if (await confirmDeleteBtn.isVisible()) {
          await confirmDeleteBtn.click()
          await page.waitForTimeout(3000)

          await page.screenshot({
            path: join(SCREENSHOTS, "56-03-07-note-deleted.png"),
            fullPage: true,
          })
          console.log("  Screenshot: 56-03-07-note-deleted.png (Note removed)")
        }
      }
    }

    // ===== TEST 3: Non-note interactions ===
    console.log("\n=== Test 3: Non-note interactions safety (FEAT-01/FEAT-02) ===")
    await page.screenshot({
      path: join(SCREENSHOTS, "56-03-08-non-note-no-menu.png"),
      fullPage: true,
    })
    console.log("  Screenshot: 56-03-08-non-note-no-menu.png (Non-note events have no 3-dot menu)")

    // ===== TEST 4: Walk List Rename from Index =====
    console.log("\n=== Test 4: Walk List Rename from Index (FEAT-03) ===")
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/canvassing`, {
      waitUntil: "networkidle",
      timeout: 15000,
    })
    await page.waitForTimeout(3000)

    await page.screenshot({
      path: join(SCREENSHOTS, "56-03-09-canvassing-index.png"),
      fullPage: true,
    })
    console.log("  Screenshot: 56-03-09-canvassing-index.png")

    // Find walk list rows
    const walkListRows = page.locator("tr").filter({ hasText: "Ingleside" })
    const wlCount = await walkListRows.count()
    console.log("  Walk list rows with 'Ingleside':", wlCount)

    if (wlCount === 0) {
      // Maybe different walk list names or card layout
      const allRows = page.locator("tr")
      const rowCount = await allRows.count()
      console.log("  Total table rows:", rowCount)
      for (let i = 0; i < Math.min(rowCount, 10); i++) {
        const text = await allRows.nth(i).textContent()
        console.log(`    Row ${i}: ${text?.substring(0, 80)}`)
      }
    }

    if (wlCount > 0) {
      const actionsBtn = walkListRows.first().locator("button").last()
      if (await actionsBtn.isVisible()) {
        await actionsBtn.click()
        await page.waitForTimeout(500)

        await page.screenshot({
          path: join(SCREENSHOTS, "56-03-10-walklist-dropdown.png"),
          fullPage: true,
        })
        console.log("  Screenshot: 56-03-10-walklist-dropdown.png (Rename/Delete dropdown)")

        const renameItem = page.locator('[role="menuitem"]').filter({ hasText: "Rename" })
        if (await renameItem.isVisible()) {
          await renameItem.click()
          await page.waitForTimeout(500)

          await page.screenshot({
            path: join(SCREENSHOTS, "56-03-11-walklist-rename-dialog.png"),
            fullPage: true,
          })
          console.log("  Screenshot: 56-03-11-walklist-rename-dialog.png")

          const input = page.locator("[role=dialog] input").first()
          if (await input.isVisible()) {
            await input.clear()
            await input.fill("Ingleside Walk - Renamed Via Test")
            await page.locator('[role="dialog"] button').filter({ hasText: "Save" }).click()
            await page.waitForTimeout(3000)

            await page.screenshot({
              path: join(SCREENSHOTS, "56-03-12-walklist-renamed.png"),
              fullPage: true,
            })
            console.log("  Screenshot: 56-03-12-walklist-renamed.png (New name in table)")
          }
        }
      }
    }

    // ===== TEST 5: Walk List Rename from Detail =====
    console.log("\n=== Test 5: Walk List Rename from Detail (FEAT-03) ===")
    await page.goto(
      `${BASE}/campaigns/${CAMPAIGN_ID}/canvassing/walk-lists/${WALK_LIST_ID}`,
      { waitUntil: "networkidle", timeout: 15000 },
    )
    await page.waitForTimeout(3000)

    await page.screenshot({
      path: join(SCREENSHOTS, "56-03-13-walklist-detail.png"),
      fullPage: true,
    })
    console.log("  Screenshot: 56-03-13-walklist-detail.png")

    // Look for pencil button - check all buttons for pencil icon
    let pencilFound = false
    const allBtns = page.locator("button")
    const btnCount = await allBtns.count()
    console.log("  Total buttons:", btnCount)

    for (let i = 0; i < btnCount; i++) {
      const btn = allBtns.nth(i)
      const html = await btn.innerHTML().catch(() => "")
      if (html.toLowerCase().includes("pencil") || html.toLowerCase().includes("edit-2")) {
        console.log(`  Found pencil button at index ${i}`)
        await btn.click()
        pencilFound = true
        break
      }
    }

    if (pencilFound) {
      await page.waitForTimeout(500)
      await page.screenshot({
        path: join(SCREENSHOTS, "56-03-14-walklist-detail-rename.png"),
        fullPage: true,
      })
      console.log("  Screenshot: 56-03-14-walklist-detail-rename.png")

      const input = page.locator("[role=dialog] input").first()
      if (await input.isVisible()) {
        await input.clear()
        await input.fill("Ingleside Walk - Active")
        await page.locator('[role="dialog"] button').filter({ hasText: "Save" }).click()
        await page.waitForTimeout(3000)

        await page.screenshot({
          path: join(SCREENSHOTS, "56-03-15-walklist-detail-saved.png"),
          fullPage: true,
        })
        console.log("  Screenshot: 56-03-15-walklist-detail-saved.png")
      }
    } else {
      console.log("  WARNING: No pencil button found on detail page")
    }

    console.log("\n=== All 5 tests complete ===")
  } catch (err) {
    console.error("Error:", err.message)
    await page.screenshot({
      path: join(SCREENSHOTS, "56-03-ERROR.png"),
      fullPage: true,
    })
    console.log("  Error screenshot saved")
  } finally {
    await browser.close()
  }
}

main()
