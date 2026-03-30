import { test, expect, type Page } from "@playwright/test"

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

// ── Helpers (self-contained per D-10, cookie forwarding per RESEARCH Pattern 3) ──

async function navigateToSeedCampaign(page: Page): Promise<string> {
  await page.goto("/")
  await page.waitForURL(
    (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
    { timeout: 15_000 },
  )
  const campaignLink = page
    .getByRole("link", { name: /macon-bibb demo/i })
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

test.describe.serial("Voter tags lifecycle", () => {
  let campaignId = ""
  let testVoterIds: string[] = []
  const tagNames = [
    "Priority Voter",
    "Door Knocked",
    "Phone Contacted",
    "Supporter",
    "Needs Follow-up",
  ]

  test.setTimeout(120_000)

  test("Setup: create test voters", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)
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

    for (const tagName of tagNames) {
      // Click "+ New Tag" button
      await page.getByRole("button", { name: /new tag/i }).click()

      // Fill tag name in dialog
      await page.getByLabel("Tag name").fill(tagName)

      // Click "Save" button
      await page.getByRole("button", { name: /save/i }).click()

      // Wait for success toast
      await expect(page.getByText("Tag created")).toBeVisible({ timeout: 10_000 })

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

      // Click Tags tab
      await page.getByRole("tab", { name: /tags/i }).click()

      // Assign each tag for this voter
      for (const tagIdx of assignments[i]) {
        const tagName = tagNames[tagIdx]

        // Select tag from dropdown
        await page.getByRole("combobox").click()
        await page.getByRole("option", { name: tagName }).click()

        // Click "Add Tag" button
        await page.getByRole("button", { name: /add tag/i }).click()

        // Wait for success toast
        await expect(page.getByText("Tag added")).toBeVisible({
          timeout: 10_000,
        })

        // Verify tag badge appears
        await expect(
          page.getByText(tagName, { exact: true }).first(),
        ).toBeVisible({ timeout: 10_000 })
      }
    }
  })

  test("TAG-03: Validate tags persist after navigation", async ({ page }) => {
    const assignments = [
      ["Priority Voter", "Door Knocked"],
      ["Door Knocked", "Phone Contacted"],
      ["Phone Contacted", "Supporter"],
      ["Supporter", "Needs Follow-up", "Priority Voter"],
      ["Needs Follow-up", "Priority Voter", "Door Knocked"],
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

      // Click Tags tab
      await page.getByRole("tab", { name: /tags/i }).click()

      // Verify each assigned tag is still present
      for (const tagName of assignments[i]) {
        await expect(
          page.getByText(tagName, { exact: true }).first(),
        ).toBeVisible({ timeout: 10_000 })
      }
    }
  })

  test("TAG-04: Remove tags from all test voters", async ({ page }) => {
    const assignments = [
      ["Priority Voter", "Door Knocked"],
      ["Door Knocked", "Phone Contacted"],
      ["Phone Contacted", "Supporter"],
      ["Supporter", "Needs Follow-up", "Priority Voter"],
      ["Needs Follow-up", "Priority Voter", "Door Knocked"],
    ]

    for (let i = 0; i < testVoterIds.length; i++) {
      // Navigate to voter detail page
      await page.goto(
        `/campaigns/${campaignId}/voters/${testVoterIds[i]}`,
      )
      await page.waitForURL(/voters\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Click Tags tab
      await page.getByRole("tab", { name: /tags/i }).click()

      // Remove each assigned tag by clicking the X button
      for (const tagName of assignments[i]) {
        const removeButton = page.getByRole("button", {
          name: `Remove tag ${tagName}`,
        })
        await removeButton.click()

        // Wait for success toast
        await expect(page.getByText("Tag removed")).toBeVisible({
          timeout: 10_000,
        })
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
      const tagRow = page.getByRole("row").filter({ hasText: tagName })
      await tagRow.getByRole("button", { name: /actions/i }).click()

      // Click "Delete" in the dropdown
      await page.getByRole("menuitem", { name: /delete/i }).click()

      // DestructiveConfirmDialog requires typing the tag name
      await page
        .getByPlaceholder(tagName)
        .fill(tagName)

      // Click the "Delete" confirm button
      await page.getByRole("button", { name: /^delete$/i }).click()

      // Wait for success toast
      await expect(page.getByText("Tag deleted")).toBeVisible({
        timeout: 10_000,
      })

      // Wait for the tag to disappear from the list
      await expect(page.getByText(tagName)).not.toBeVisible({
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
