import { test, expect } from "./fixtures"
import type { Page } from "@playwright/test"
import { apiPost, apiDelete, apiGet } from "./helpers"

/**
 * Voter Tags E2E Lifecycle Spec
 *
 * Validates TAG-01 through TAG-05: tag creation on the tags management page,
 * tag assignment to voters via the voter detail Tags tab, persistence validation,
 * tag removal from voters, and tag deletion from the management page.
 *
 * Runs as owner (unsuffixed spec -> chromium -> owner1@localhost).
 * Self-contained: creates its own test voters via API and cleans up via deletion assertions.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createVoterViaApi(
  page: Page,
  campaignId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const url = `/api/v1/campaigns/${campaignId}/voters`
  for (let attempt = 0; attempt < 8; attempt++) {
    const resp = await apiPost(page, url, data)
    if (resp.ok()) return (await resp.json()).id
    if (resp.status() === 429 && attempt < 7) {
      await page.waitForTimeout(2000 * (attempt + 1))
      continue
    }
    throw new Error(`POST ${url} failed: ${resp.status()} — ${await resp.text()}`)
  }
  throw new Error(`POST ${url} failed after 8 retries`)
}

async function deleteVoterViaApi(
  page: Page,
  campaignId: string,
  voterId: string,
): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/voters/${voterId}`)
  expect(resp.ok()).toBeTruthy()
}

// ── Spec ──

test.describe.serial("Voter tags lifecycle", () => {
  let campaignId = ""
  let testVoterIds: string[] = []
  // Use a run-specific suffix to avoid conflicts with leftover tags from previous test runs
  const runSuffix = `e2e-${Date.now().toString(36).slice(-5)}`
  const tagNames = [
    `Priority Voter ${runSuffix}`,
    `Door Knocked ${runSuffix}`,
    `Phone Contacted ${runSuffix}`,
    `Supporter ${runSuffix}`,
    `Needs Follow-up ${runSuffix}`,
  ]

  test.setTimeout(120_000)

  test("Setup: create test voters", async ({ page, campaignId: cid }) => {
    campaignId = cid
    // Navigate to campaign dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()

    const voters = [
      { first_name: "Tag", last_name: "Alpha" },
      { first_name: "Tag", last_name: "Bravo" },
      { first_name: "Tag", last_name: "Charlie" },
      { first_name: "Tag", last_name: "Delta" },
      { first_name: "Tag", last_name: "Echo" },
    ]

    for (const voter of voters) {
      const id = await createVoterViaApi(page, campaignId, voter)
      testVoterIds.push(id)
    }

    expect(testVoterIds).toHaveLength(5)
  })

  test("TAG-01: Create 5 tags on the tags management page", async ({
    page,
  }) => {
    // Navigate to tags management page
    await page.goto(`/campaigns/${campaignId}/voters/tags`)
    await page.waitForURL(/voters\/tags/, { timeout: 10_000 })

    // Wait for RequireRole to resolve — the heading confirms the page loaded
    await expect(
      page.getByRole("heading", { name: /campaign tags/i }),
    ).toBeVisible({ timeout: 15_000 })

    // Wait for "+ New Tag" button to be visible (RequireRole gate)
    const newTagBtn = page.getByRole("button", { name: /new tag/i })
    await expect(newTagBtn).toBeVisible({ timeout: 15_000 })

    for (const tagName of tagNames) {
      // Click "+ New Tag" button
      await newTagBtn.click()

      // Fill tag name in dialog
      await page.getByLabel("Tag name").fill(tagName)

      // Click "Save" button
      await page.getByRole("button", { name: /save/i }).click()

      // Wait for success toast — use .first() to avoid strict mode failure when
      // a previous iteration's toast is still visible alongside the new one
      await expect(page.getByText("Tag created").first()).toBeVisible({ timeout: 10_000 })

      // Verify tag appears in the list
      await expect(page.getByText(tagName)).toBeVisible({ timeout: 10_000 })
    }

    // Final check: all 5 tags visible
    for (const tagName of tagNames) {
      await expect(page.getByText(tagName)).toBeVisible()
    }
  })

  test("TAG-02: Assign tags to voters via voter detail Tags tab", async ({
    page,
  }) => {
    // Assign 2-3 tags to each of the 5 test voters
    const assignments = [
      [0, 1], // Tag Alpha gets "Priority Voter", "Door Knocked"
      [1, 2], // Tag Bravo gets "Door Knocked", "Phone Contacted"
      [2, 3], // Tag Charlie gets "Phone Contacted", "Supporter"
      [3, 4, 0], // Tag Delta gets "Supporter", "Needs Follow-up", "Priority Voter"
      [4, 0, 1], // Tag Echo gets "Needs Follow-up", "Priority Voter", "Door Knocked"
    ]

    for (let i = 0; i < testVoterIds.length; i++) {
      // Navigate to voter detail page
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Click Tags tab — wait for the Overview tabpanel to be visible first (confirms
      // the page is fully hydrated with React event handlers attached), then click Tags.
      await expect(page.getByRole("tabpanel", { name: /overview/i })).toBeVisible({
        timeout: 10_000,
      })
      // Force click bypasses any potential overlay (e.g., lingering toast notifications
      // from TAG-01 that may still be fading out and capturing pointer events)
      await page.getByRole("tab", { name: /^tags$/i }).click({ force: true })

      // Wait for the Tags tab to become selected (aria-selected=true)
      await expect(
        page.getByRole("tab", { name: /^tags$/i, selected: true }),
      ).toBeVisible({ timeout: 10_000 })

      // Assign each tag for this voter
      for (const tagIdx of assignments[i]) {
        const tagName = tagNames[tagIdx]

        // Select tag from dropdown — wait for the listbox to open before clicking option
        await page.getByRole("combobox").click()
        await expect(page.getByRole("listbox")).toBeVisible({ timeout: 5_000 })
        await page.getByRole("option", { name: tagName }).click()

        // Wait for the Select trigger to display the selected tag name.
        // This confirms the Radix Select onValueChange fired and selectedTagId state
        // was updated before we click "Add Tag". Without this, the button click may
        // race against the React state update and fire with selectedTagId="".
        await expect(
          page.getByRole("combobox").getByText(tagName, { exact: false }),
        ).toBeVisible({ timeout: 5_000 })

        // Click "Add Tag" button — wait for it to be enabled first (not disabled while
        // a previous addTag.mutate is still pending), then click
        const addTagBtn = page.getByRole("button", { name: /add tag/i })
        await expect(addTagBtn).toBeEnabled({ timeout: 5_000 })
        await addTagBtn.click()

        // Wait for the badge to appear in Current Tags — this is the definitive indicator
        // that the mutation succeeded and invalidateQueries completed (refetch returned
        // the new tag). The "Remove tag <name>" aria-label is unique to badge buttons in
        // Current Tags, so no strict mode collision with the combobox.
        // 20s timeout accommodates ky retries when the 30/min rate limit is hit.
        await expect(
          page.getByRole("button", { name: `Remove tag ${tagName}` }),
        ).toBeVisible({ timeout: 20_000 })
      }
    }
  })

  test("TAG-03: Validate tags persist after navigation", async ({ page, campaignId }) => {
    // Use tagNames indices to match what TAG-02 assigned (includes run-specific suffix)
    const assignments = [
      [0, 1], // voter 0: tagNames[0], tagNames[1]
      [1, 2], // voter 1: tagNames[1], tagNames[2]
      [2, 3], // voter 2: tagNames[2], tagNames[3]
      [3, 4, 0], // voter 3: tagNames[3], tagNames[4], tagNames[0]
      [4, 0, 1], // voter 4: tagNames[4], tagNames[0], tagNames[1]
    ]

    for (let i = 0; i < testVoterIds.length; i++) {
      // Navigate away first (to tags page)
      await page.goto(`/campaigns/${campaignId}/voters/tags`)
      await page.waitForURL(/voters\/tags/, { timeout: 10_000 })

      // Navigate back to voter detail
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Wait for Overview tabpanel to be visible (page fully hydrated), then click Tags
      await expect(page.getByRole("tabpanel", { name: /overview/i })).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole("tab", { name: /^tags$/i }).click({ force: true })

      // Wait for the Tags tab to become selected
      await expect(
        page.getByRole("tab", { name: /^tags$/i, selected: true }),
      ).toBeVisible({ timeout: 10_000 })
      const apiTagsResp = await apiGet(page, `/api/v1/campaigns/${campaignId}/voters/${testVoterIds[i]}/tags`)
      if (apiTagsResp.ok()) {
        const apiTags = await apiTagsResp.json()
        const apiTagNames: string[] = Array.isArray(apiTags) ? apiTags.map((t: { name: string }) => t.name) : (apiTags.items ?? []).map((t: { name: string }) => t.name)
        for (const tagIdx of assignments[i]) {
          if (!apiTagNames.includes(tagNames[tagIdx])) {
            throw new Error(`API: tag "${tagNames[tagIdx]}" missing for voter ${i}. API returned: ${JSON.stringify(apiTagNames)}`)
          }
        }
      }

      // Verify each assigned tag is still present in the UI (tabpanel)
      for (const tagIdx of assignments[i]) {
        await expect(
          page.getByRole("tabpanel").getByText(tagNames[tagIdx], { exact: true }),
        ).toBeVisible({ timeout: 10_000 })
      }
    }
  })

  test("TAG-04: Remove tags from all test voters", async ({ page, campaignId }) => {
    // Use tagNames indices to match what TAG-02 assigned (includes run-specific suffix)
    const assignments = [
      [0, 1], // voter 0: tagNames[0], tagNames[1]
      [1, 2], // voter 1: tagNames[1], tagNames[2]
      [2, 3], // voter 2: tagNames[2], tagNames[3]
      [3, 4, 0], // voter 3: tagNames[3], tagNames[4], tagNames[0]
      [4, 0, 1], // voter 4: tagNames[4], tagNames[0], tagNames[1]
    ]

    for (let i = 0; i < testVoterIds.length; i++) {
      // Navigate to voter detail page
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Wait for Overview tab to be selected (page hydrated)
      await expect(
        page.getByRole("tab", { name: /overview/i, selected: true }),
      ).toBeVisible({ timeout: 10_000 })

      // Click Tags tab with retry loop — single click sometimes doesn't activate on dev server
      const tagsTabTAG04 = page.getByRole("tab", { name: /^tags$/i })
      await expect(tagsTabTAG04).toBeVisible({ timeout: 10_000 })
      for (let attempt = 0; attempt < 5; attempt++) {
        await tagsTabTAG04.click()
        const activated = await page
          .getByRole("tabpanel", { name: /tags/i })
          .getByText("Current Tags")
          .isVisible({ timeout: 2_000 })
          .catch(() => false)
        if (activated) break
        await page.waitForTimeout(500)
      }

      // Confirm Tags tabpanel is active
      await expect(
        page.getByRole("tabpanel", { name: /tags/i }).getByText("Current Tags"),
      ).toBeVisible({ timeout: 5_000 })

      // Remove each assigned tag by clicking the X button (use actual tag names with run suffix)
      for (const tagIdx of assignments[i]) {
        const tagName = tagNames[tagIdx]
        const removeButton = page.getByRole("button", {
          name: `Remove tag ${tagName}`,
        })
        await removeButton.click()

        // Wait for the Remove button to disappear — this confirms the invalidateQueries
        // refetch completed and the tag is no longer in voterTags. Do NOT rely on the
        // "Tag removed" toast alone, as it fires before the refetch completes.
        await expect(removeButton).not.toBeVisible({ timeout: 20_000 })
      }

      // Verify "No tags assigned" empty state
      await expect(page.getByText("No tags assigned")).toBeVisible({
        timeout: 10_000,
      })
    }
  })

  test("TAG-05: Delete all 5 test tags from the management page", async ({
    page,
  }) => {
    // Navigate to tags management page
    await page.goto(`/campaigns/${campaignId}/voters/tags`)
    await page.waitForURL(/voters\/tags/, { timeout: 10_000 })

    for (const tagName of tagNames) {
      // Find the row with this tag and open the actions menu
      const tagRow = page.getByRole("row").filter({ hasText: tagName }).first()
      await tagRow.scrollIntoViewIfNeeded()
      await tagRow.getByRole("button", { name: /actions/i }).click()

      // Click "Delete" in the dropdown
      await page.getByRole("menuitem", { name: /delete/i }).click()

      // DestructiveConfirmDialog requires typing the tag name — the dialog's input
      // placeholder is the confirmText (= tagName). Wait for the dialog to open,
      // then use pressSequentially so React onChange fires per keystroke and the
      // confirm button's disabled={!isMatch} state updates before we click.
      await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 })
      const confirmInput = page.getByRole("alertdialog").getByPlaceholder(tagName)
      await expect(confirmInput).toBeVisible({ timeout: 5_000 })
      await confirmInput.pressSequentially(tagName)

      // Wait for the confirm button to become enabled (isMatch = inputValue === confirmText)
      const deleteConfirmBtn = page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i })
      await expect(deleteConfirmBtn).toBeEnabled({ timeout: 5_000 })
      await deleteConfirmBtn.click()

      // Wait for success toast — use 20s to accommodate ky retries on API rate-limit responses
      await expect(page.getByText("Tag deleted").first()).toBeVisible({
        timeout: 20_000,
      })

      // Wait for the tag to disappear from the list
      await expect(page.getByRole("row").filter({ hasText: tagName }).first()).not.toBeVisible({
        timeout: 10_000,
      })
    }
  })

  test("Final assertion: verify all test voters can be deleted", async ({
    page,
  }) => {
    // Navigate to establish auth context
    await page.goto(`/campaigns/${campaignId}/voters`)
    await page.waitForURL(/voters/, { timeout: 10_000 })

    // Delete all test voters via API (proves deletion works on voters that had tags)
    for (const voterId of testVoterIds) {
      await deleteVoterViaApi(page, campaignId, voterId)
    }

    // Verify at least one test voter is gone from the list
    await page.reload()
    await expect(page.getByText("Tag Alpha")).not.toBeVisible({
      timeout: 10_000,
    })
  })
})
