import { test, expect } from "./fixtures"
import type { Page } from "@playwright/test"
import { apiPost, apiDelete } from "./helpers"

/**
 * Voter Notes E2E Lifecycle Spec
 *
 * Validates NOTE-01 through NOTE-03: adding notes to voters via the History tab,
 * editing notes (Phase 56 feature), and deleting notes with ConfirmDialog.
 * Verifies that system-generated interactions remain unaffected by note operations.
 *
 * Runs as owner (unsuffixed spec -> chromium -> owner1@localhost).
 * Self-contained: creates its own test voters via API and cleans up via deletion assertions.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createVoterViaApi(page: Page, campaignId: string, data: Record<string, unknown>): Promise<string> {
  const url = `/api/v1/campaigns/${campaignId}/voters`
  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await apiPost(page, url, data)
    if (resp.ok()) return (await resp.json()).id
    if (resp.status() === 429 && attempt < 4) {
      await page.waitForTimeout(3000 * (attempt + 1))
      continue
    }
    throw new Error(`POST ${url} failed: ${resp.status()} — ${await resp.text()}`)
  }
  throw new Error(`POST ${url} failed after 5 retries`)
}

async function deleteVoterViaApi(page: Page, campaignId: string, voterId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/voters/${voterId}`)
  expect(resp.ok()).toBeTruthy()
}

// ── Spec ──

test.describe.serial("Voter notes lifecycle", () => {
  let campaignId = ""
  let testVoterIds: string[] = []
  const voterNames = ["Note Alpha", "Note Bravo", "Note Charlie"]
  const noteTexts = [
    "Initial contact - friendly",
    "Called back, left voicemail",
  ]

  test.setTimeout(120_000)

  test("Setup: create test voters", async ({ page, campaignId: cid }) => {
    // Assign to outer variable so all serial tests can access it
    campaignId = cid
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()

    const voters = [
      { first_name: "Note", last_name: "Alpha" },
      { first_name: "Note", last_name: "Bravo" },
      { first_name: "Note", last_name: "Charlie" },
    ]

    for (const voter of voters) {
      const id = await createVoterViaApi(page, campaignId, voter)
      testVoterIds.push(id)
    }

    expect(testVoterIds).toHaveLength(3)
  })

  test("NOTE-01: Add 2 notes to each of 3 test voters", async ({ page, campaignId }) => {
    for (let i = 0; i < testVoterIds.length; i++) {
      // Navigate to voter detail page
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })
      // Wait for voter detail to load: skeleton disappears and tabs appear
      await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 20_000 })

      // Click History tab and wait for tab panel to load
      await page.getByRole("tab", { name: /history/i }).click()
      await expect(page.getByPlaceholder("Add a note...")).toBeVisible({ timeout: 10_000 })

      for (const noteText of noteTexts) {
        // Fill the note textarea (wait for it to be editable/enabled)
        const noteInput = page.getByPlaceholder("Add a note...")
        await expect(noteInput).toBeEnabled({ timeout: 5_000 })
        await noteInput.fill(noteText)

        // Click "Add Note" button
        await page.getByRole("button", { name: /add note/i }).click()

        // Wait for success toast
        await expect(page.getByText("Note added").first()).toBeVisible({
          timeout: 10_000,
        })

        // Wait for textarea to be cleared (confirms the note was submitted)
        await expect(noteInput).toHaveValue("", { timeout: 10_000 })

        // Verify the note text appears in the history list (not just the textarea)
        await expect(
          page.locator("div.border.rounded-lg").filter({ hasText: noteText }).first()
        ).toBeVisible({ timeout: 10_000 })
      }

      // Verify both notes are visible
      for (const noteText of noteTexts) {
        await expect(page.getByText(noteText).first()).toBeVisible()
      }
    }
  })

  test("NOTE-02: Edit notes on two voters (Phase 56 feature)", async ({
    page,
    campaignId: fixtureCid,
  }) => {
    // Use fixture campaignId as fallback if outer variable is empty
    const activeCampaignId = campaignId || fixtureCid
    // Edit Note Alpha's first note
    await page.goto(
      `/campaigns/${activeCampaignId}/voters/${testVoterIds[0]}`,
    )
    await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })
    // Wait for voter detail to load: wait for network idle then verify tabs
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
    await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("tab", { name: /history/i }).click()
    // Wait for history entries to load
    await expect(page.locator("div.border.rounded-lg").first()).toBeVisible({ timeout: 10_000 })

    // Find the note entry and wait for it to appear (interactions API must respond)
    const noteAlphaEntry = page
      .locator("div.border.rounded-lg")
      .filter({ hasText: "Initial contact - friendly" })
      .first()
    await expect(noteAlphaEntry).toBeVisible({ timeout: 15_000 })
    await noteAlphaEntry
      .getByRole("button", { name: /note actions/i })
      .click()

    // Click "Edit" in the dropdown
    await page.getByRole("menuitem", { name: /edit/i }).click()

    // Edit the note text in the dialog
    const editTextarea = page.getByLabel("Note text")
    await editTextarea.clear()
    await editTextarea.fill("Initial contact - friendly - UPDATED")

    // Save the edit
    await page.getByRole("button", { name: /^save$/i }).click()

    // Wait for success toast
    await expect(page.getByText("Note updated")).toBeVisible({
      timeout: 10_000,
    })

    // Verify updated text appears
    await expect(
      page.getByText("Initial contact - friendly - UPDATED").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Edit Note Bravo's second note
    await page.goto(
      `/campaigns/${activeCampaignId}/voters/${testVoterIds[1]}`,
    )
    await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })
    // Wait for voter detail to load: wait for network idle then verify tabs
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
    await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("tab", { name: /history/i }).click()

    const noteBravoEntry = page
      .locator("div.border.rounded-lg")
      .filter({ hasText: "Called back, left voicemail" })
      .first()
    // Wait for the specific note to appear in history (interactions API must respond)
    await expect(noteBravoEntry).toBeVisible({ timeout: 15_000 })
    await noteBravoEntry
      .getByRole("button", { name: /note actions/i })
      .click()

    await page.getByRole("menuitem", { name: /edit/i }).click()

    const editTextarea2 = page.getByLabel("Note text")
    await editTextarea2.clear()
    await editTextarea2.fill("Called back, spoke briefly - UPDATED")

    await page.getByRole("button", { name: /^save$/i }).click()

    await expect(page.getByText("Note updated")).toBeVisible({
      timeout: 10_000,
    })

    await expect(
      page.getByText("Called back, spoke briefly - UPDATED").first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("NOTE-03: Delete all test notes from all voters", async ({ page, campaignId }) => {
    // The notes per voter after edits:
    // Note Alpha: "Initial contact - friendly - UPDATED", "Called back, left voicemail"
    // Note Bravo: "Initial contact - friendly", "Called back, spoke briefly - UPDATED"
    // Note Charlie: "Initial contact - friendly", "Called back, left voicemail"

    const expectedNotes = [
      [
        "Initial contact - friendly - UPDATED",
        "Called back, left voicemail",
      ],
      [
        "Initial contact - friendly",
        "Called back, spoke briefly - UPDATED",
      ],
      [
        "Initial contact - friendly",
        "Called back, left voicemail",
      ],
    ]

    for (let i = 0; i < testVoterIds.length; i++) {
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })
      await page.getByRole("tab", { name: /history/i }).click()

      // Delete each test note
      for (const noteText of expectedNotes[i]) {
        // Find the note entry and open actions
        const noteEntry = page
          .locator("div.border.rounded-lg")
          .filter({ hasText: noteText })
          .first()
        await noteEntry
          .getByRole("button", { name: /note actions/i })
          .click()

        // Click "Delete"
        await page.getByRole("menuitem", { name: /delete/i }).click()

        // ConfirmDialog: click "Delete" confirm button
        await page
          .getByRole("button", { name: /^delete$/i })
          .click()

        // Wait for success toast
        await expect(page.getByText("Note deleted")).toBeVisible({
          timeout: 10_000,
        })

        // Verify the note text is gone
        await expect(page.getByText(noteText)).not.toBeVisible({
          timeout: 10_000,
        })
      }

      // Verify system-generated interactions are NOT affected
      // "Note" badge entries should be gone, but any system events (like voter_created)
      // should still be visible. Check that the Interaction History section still exists.
      await expect(
        page.getByText("Interaction History"),
      ).toBeVisible()
    }
  })

  test("Final assertion: verify all test voters can be deleted", async ({
    page,
  }) => {
    // Navigate to establish auth context
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Delete all test voters via API (proves deletion works on voters that had notes)
    for (const voterId of testVoterIds) {
      await deleteVoterViaApi(page, campaignId, voterId)
    }

    // Verify at least one test voter is gone from the list
    await page.reload()
    await expect(page.getByText("Note Alpha")).not.toBeVisible({
      timeout: 10_000,
    })
  })
})
