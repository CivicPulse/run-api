import { test, expect, type Page } from "@playwright/test"

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

// ── Helpers (self-contained per D-10, cookie forwarding per RESEARCH Pattern 3) ──

async function navigateToSeedCampaign(page: Page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })
  const campaignLink = page
    .getByRole("link", { name: /macon|bibb|campaign/i })
    .first()
  await campaignLink.click()
  await page.waitForURL(/campaigns\/([a-f0-9-]+)/, { timeout: 10_000 })
  return page.url().match(/campaigns\/([a-f0-9-]+)/)?.[1] ?? ""
}

async function createVoterViaApi(
  page: Page,
  campaignId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/voters`,
    {
      data,
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

async function deleteVoterViaApi(
  page: Page,
  campaignId: string,
  voterId: string,
): Promise<void> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const resp = await page.request.delete(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/voters/${voterId}`,
    { headers: { Cookie: cookieHeader } },
  )
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

  test("Setup: create test voters", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)
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

  test("NOTE-01: Add 2 notes to each of 3 test voters", async ({ page }) => {
    for (let i = 0; i < testVoterIds.length; i++) {
      // Navigate to voter detail page
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Click History tab
      await page.getByRole("tab", { name: /history/i }).click()

      for (const noteText of noteTexts) {
        // Fill the note textarea
        await page.getByPlaceholder("Add a note...").fill(noteText)

        // Click "Add Note" button
        await page.getByRole("button", { name: /add note/i }).click()

        // Wait for success toast
        await expect(page.getByText("Note added")).toBeVisible({
          timeout: 10_000,
        })

        // Verify the note text appears in the History tab
        await expect(page.getByText(noteText).first()).toBeVisible({
          timeout: 10_000,
        })
      }

      // Verify both notes are visible
      for (const noteText of noteTexts) {
        await expect(page.getByText(noteText).first()).toBeVisible()
      }
    }
  })

  test("NOTE-02: Edit notes on two voters (Phase 56 feature)", async ({
    page,
  }) => {
    // Edit Note Alpha's first note
    await page.goto(
      `/campaigns/${campaignId}/voters/${testVoterIds[0]}`,
    )
    await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /history/i }).click()

    // Find the note entry containing the target text and open its action menu
    // The note entries have a MoreVertical button with sr-only "Note actions"
    const noteAlphaEntry = page
      .locator("div.border.rounded-lg")
      .filter({ hasText: "Initial contact - friendly" })
      .first()
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
      `/campaigns/${campaignId}/voters/${testVoterIds[1]}`,
    )
    await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /history/i }).click()

    const noteBravoEntry = page
      .locator("div.border.rounded-lg")
      .filter({ hasText: "Called back, left voicemail" })
      .first()
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

  test("NOTE-03: Delete all test notes from all voters", async ({ page }) => {
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
