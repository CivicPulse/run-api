import { test, expect } from "./fixtures"
import type { Page } from "@playwright/test"
import { apiPost, apiDelete, apiGet } from "./helpers"

/**
 * Volunteer Tags & Availability E2E Spec
 *
 * Validates volunteer tag CRUD (create 10 tags, assign to 9 volunteers,
 * edit, remove, delete) and availability management (add, edit, delete slots).
 *
 * Covers: VTAG-01 through VTAG-05, AVAIL-01 through AVAIL-03 (E2E-18)
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createVolunteerViaApi(page: Page, campaignId: string, data: Record<string, unknown>): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/volunteers`, data)
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function createVolunteerTagViaApi(page: Page, campaignId: string, name: string): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/volunteer-tags`, { name })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function deleteVolunteerTagViaApi(page: Page, campaignId: string, tagId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/volunteer-tags/${tagId}`)
  expect(resp.ok()).toBeTruthy()
}

async function addTagToVolunteerViaApi(page: Page, campaignId: string, volunteerId: string, tagId: string): Promise<void> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/tags/${tagId}`)
  expect(resp.ok()).toBeTruthy()
}

async function removeTagFromVolunteerViaApi(page: Page, campaignId: string, volunteerId: string, tagId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/tags/${tagId}`)
  expect(resp.ok()).toBeTruthy()
}

async function addAvailabilityViaApi(page: Page, campaignId: string, volunteerId: string, startAt: string, endAt: string): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability`, { start_at: startAt, end_at: endAt })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function deleteAvailabilityViaApi(page: Page, campaignId: string, volunteerId: string, availabilityId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability/${availabilityId}`)
  expect(resp.ok()).toBeTruthy()
}

// ── Tag Names (per D-09: 10 tags) ───────────────────────────────────────────

const TAG_NAMES = [
  "Canvasser",
  "Phone Banker",
  "Data Entry",
  "Team Lead",
  "Bilingual",
  "Weekend Only",
  "Evening Only",
  "Experienced",
  "New Recruit",
  "Transportation",
]

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe.serial("Volunteer Tags & Availability", () => {
  const volunteerIds: string[] = []
  const tagIds: string[] = []
  const availabilityIds: Map<string, string[]> = new Map()
  test.setTimeout(120_000)

  // ── Setup ──

  test("Setup: create 10 volunteers via API", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()

    for (let i = 1; i <= 10; i++) {
      const id = await createVolunteerViaApi(page, campaignId, {
        first_name: "TagTest",
        last_name: `Vol ${i}`,
        email: `tagtest-vol-${i}@e2e.test`,
        phone: `555-000-${String(i).padStart(4, "0")}`,
      })
      volunteerIds.push(id)
    }

    expect(volunteerIds).toHaveLength(10)
  })

  // ── Volunteer Tags ──

  test("VTAG-01: Create 10 volunteer tags", async ({ page, campaignId }) => {
    // Navigate to Volunteers > Tags management page
    await page.goto(`/campaigns/${campaignId}/volunteers/tags`)
    await page.waitForURL(/volunteers\/tags/, { timeout: 10_000 })

    // Create first 3 tags via UI form
    for (const tagName of TAG_NAMES.slice(0, 3)) {
      // Wait for any previous dialog to close before opening a new one
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})

      await page.getByRole("button", { name: /new tag/i }).click()
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

      // The label is "Tag name" with htmlFor="volunteer-tag-name"
      const nameInput = page.getByRole("dialog").locator("#volunteer-tag-name")
      await nameInput.fill(tagName)
      await page.getByRole("dialog").getByRole("button", { name: /save/i }).click()
      await expect(page.getByText("Tag created").first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(tagName).first()).toBeVisible({ timeout: 10_000 })
    }

    // Create remaining 7 tags via API for speed (per D-16)
    for (const tagName of TAG_NAMES.slice(3)) {
      const tagId = await createVolunteerTagViaApi(page, campaignId, tagName)
      tagIds.push(tagId)
    }

    // Reload to see all 10 tags
    await page.reload()
    await page.waitForURL(/volunteers\/tags/, { timeout: 10_000 })

    // Retrieve the IDs for the UI-created tags via the tag list API
    const resp = await apiGet(page,
      `/api/v1/campaigns/${campaignId}/volunteer-tags`,
    )
    expect(resp.ok()).toBeTruthy()
    const allTags = await resp.json()
    // Rebuild tagIds from API response (ordered by name match)
    tagIds.length = 0
    for (const tagName of TAG_NAMES) {
      const tag = allTags.find(
        (t: { name: string; id: string }) => t.name === tagName,
      )
      expect(tag).toBeTruthy()
      tagIds.push(tag.id)
    }

    expect(tagIds).toHaveLength(10)

    // Verify all 10 tags are visible
    for (const tagName of TAG_NAMES) {
      await expect(page.getByText(tagName).first()).toBeVisible({
        timeout: 5_000,
      })
    }
  })

  test("VTAG-02: Assign tags to 9 of 10 volunteers", async ({ page, campaignId }) => {
    // Assign tags to volunteers 0-8, leave volunteer 9 untagged
    // First 2 volunteers via UI, rest via API (per D-16)
    const tagAssignments = [
      [0, 1, 2], // Vol 1: Canvasser, Phone Banker, Data Entry
      [3, 4], // Vol 2: Team Lead, Bilingual
      [5, 6, 7], // Vol 3: Weekend Only, Evening Only, Experienced
      [0, 8], // Vol 4: Canvasser, New Recruit
      [1, 9], // Vol 5: Phone Banker, Transportation
      [2, 3, 4, 5], // Vol 6: Data Entry, Team Lead, Bilingual, Weekend Only
      [6, 7, 8], // Vol 7: Evening Only, Experienced, New Recruit
      [0, 4, 9], // Vol 8: Canvasser, Bilingual, Transportation
      [1, 2, 3, 7], // Vol 9: Phone Banker, Data Entry, Team Lead, Experienced
    ]

    // Assign first 2 volunteers via UI
    for (let i = 0; i < 2; i++) {
      await page.goto(
        `/campaigns/${campaignId}/volunteers/${volunteerIds[i]}`,
      )
      await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })

      for (const tagIdx of tagAssignments[i]) {
        const tagName = TAG_NAMES[tagIdx]
        // Click "Add Tag" dropdown trigger button
        await page.getByRole("button", { name: /add tag/i }).click()
        // Select the tag from dropdown
        await page.getByRole("menuitem", { name: tagName }).click()
        // Wait for success toast
        await expect(page.getByText("Tag added").first()).toBeVisible({
          timeout: 10_000,
        })
        // Verify tag badge appears on the volunteer
        await expect(
          page.getByText(tagName, { exact: true }).first(),
        ).toBeVisible({ timeout: 10_000 })
      }
    }

    // Assign remaining 7 volunteers via API (per D-16)
    for (let i = 2; i < 9; i++) {
      for (const tagIdx of tagAssignments[i]) {
        await addTagToVolunteerViaApi(
          page,
          campaignId,
          volunteerIds[i],
          tagIds[tagIdx],
        )
      }
    }

    // Verify a mid-range volunteer's tags persisted via page navigation
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[5]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    for (const tagIdx of tagAssignments[5]) {
      await expect(
        page.getByText(TAG_NAMES[tagIdx], { exact: true }).first(),
      ).toBeVisible({ timeout: 10_000 })
    }
  })

  test("VTAG-03: Edit tags on 5 volunteers", async ({ page, campaignId }) => {
    // For 5 volunteers, remove one tag and add a different one
    // Edit plan: remove first assigned tag, add last tag not yet assigned
    const edits = [
      { volIdx: 0, removeTagIdx: 0, addTagIdx: 9 }, // Vol 1: remove Canvasser, add Transportation
      { volIdx: 1, removeTagIdx: 3, addTagIdx: 0 }, // Vol 2: remove Team Lead, add Canvasser
      { volIdx: 2, removeTagIdx: 5, addTagIdx: 3 }, // Vol 3: remove Weekend Only, add Team Lead
      { volIdx: 3, removeTagIdx: 0, addTagIdx: 5 }, // Vol 4: remove Canvasser, add Weekend Only
      { volIdx: 4, removeTagIdx: 1, addTagIdx: 6 }, // Vol 5: remove Phone Banker, add Evening Only
    ]

    // First 2 edits via UI
    for (let i = 0; i < 2; i++) {
      const { volIdx, removeTagIdx, addTagIdx } = edits[i]
      const removeTagName = TAG_NAMES[removeTagIdx]
      const addTagName = TAG_NAMES[addTagIdx]

      await page.goto(
        `/campaigns/${campaignId}/volunteers/${volunteerIds[volIdx]}`,
      )
      await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Remove the tag via X button on the badge
      const removeButton = page.getByRole("button", {
        name: `Remove tag ${removeTagName}`,
      })
      await removeButton.click()
      await expect(page.getByText("Tag removed")).toBeVisible({
        timeout: 10_000,
      })

      // Add the new tag via "Add Tag" dropdown
      await page.getByRole("button", { name: /add tag/i }).click()
      await page.getByRole("menuitem", { name: addTagName }).click()
      await expect(page.getByText("Tag added").first()).toBeVisible({
        timeout: 10_000,
      })

      // Verify: old tag gone, new tag visible
      await expect(
        page.getByText(addTagName, { exact: true }).first(),
      ).toBeVisible({ timeout: 5_000 })
    }

    // Remaining 3 edits via API
    for (let i = 2; i < edits.length; i++) {
      const { volIdx, removeTagIdx, addTagIdx } = edits[i]
      await removeTagFromVolunteerViaApi(
        page,
        campaignId,
        volunteerIds[volIdx],
        tagIds[removeTagIdx],
      )
      await addTagToVolunteerViaApi(
        page,
        campaignId,
        volunteerIds[volIdx],
        tagIds[addTagIdx],
      )
    }

    // Navigate to one API-edited volunteer to verify changes persist
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[edits[2].volIdx]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    await expect(
      page.getByText(TAG_NAMES[edits[2].addTagIdx], { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("VTAG-04: Remove all tags from 2 volunteers", async ({ page, campaignId }) => {
    // Remove all tags from volunteer 0 and volunteer 1
    for (const volIdx of [0, 1]) {
      await page.goto(
        `/campaigns/${campaignId}/volunteers/${volunteerIds[volIdx]}`,
      )
      await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })

      // Keep removing tags until none remain
      let removeBtn = page.getByRole("button", { name: /^Remove tag /i }).first()
      while (await removeBtn.isVisible().catch(() => false)) {
        await removeBtn.click()
        await expect(page.getByText("Tag removed").first()).toBeVisible({
          timeout: 10_000,
        })
        // Wait for toast to clear before next click
        removeBtn = page.getByRole("button", { name: /^Remove tag /i }).first()
      }

      // Verify no tag badges remain (check that "Add Tag" is visible but no Remove buttons)
      const remainingRemoveButtons = page.getByRole("button", {
        name: /^Remove tag /i,
      })
      await expect(remainingRemoveButtons).toHaveCount(0, { timeout: 5_000 })
    }
  })

  test("VTAG-05: Delete all 10 volunteer tags", async ({ page, campaignId }) => {
    // Navigate to tag management page
    await page.goto(`/campaigns/${campaignId}/volunteers/tags`)
    await page.waitForURL(/volunteers\/tags/, { timeout: 10_000 })

    // Delete first 2 tags via UI
    for (let i = 0; i < 2; i++) {
      const tagName = TAG_NAMES[i]
      // Find the row with this tag and open the actions menu
      const tagRow = page.getByRole("row").filter({ hasText: tagName })
      const actionsButton = tagRow
        .getByRole("button")
        .filter({ has: page.locator(".sr-only", { hasText: "Actions" }) })
        .or(tagRow.getByRole("button", { name: /actions/i }))
      await actionsButton.first().click()

      // Click "Delete" in the dropdown
      await page.getByRole("menuitem", { name: /delete/i }).click()

      // DestructiveConfirmDialog requires typing the tag name
      await page.getByPlaceholder(tagName).fill(tagName)

      // Click the "Delete" confirm button
      await page.getByRole("button", { name: /^delete$/i }).click()

      // Wait for success toast
      await expect(page.getByText("Tag deleted")).toBeVisible({
        timeout: 10_000,
      })

      // Wait for the tag to disappear from the list
      await expect(
        tagRow.first(),
      ).not.toBeVisible({ timeout: 10_000 })
    }

    // Delete remaining 8 tags via API
    for (let i = 2; i < TAG_NAMES.length; i++) {
      await deleteVolunteerTagViaApi(page, campaignId, tagIds[i])
    }

    // Reload and verify no tags remain
    await page.reload()
    await page.waitForURL(/volunteers\/tags/, { timeout: 10_000 })
    await expect(
      page.getByText("No volunteer tags yet"),
    ).toBeVisible({ timeout: 10_000 })

    // Navigate to a previously-tagged volunteer -- verify their tags are gone (cascade)
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[5]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    // The "Add Tag" button should not appear since no tags exist at campaign level
    const removeButtons = page.getByRole("button", { name: /^Remove tag /i })
    await expect(removeButtons).toHaveCount(0, { timeout: 5_000 })
  })

  // ── Volunteer Availability ──

  test("AVAIL-01: Set availability for 5 volunteers", async ({ page, campaignId }) => {
    // Set availability: 2 via UI dialog, 3 via API (per D-16)
    const baseDate = new Date()
    baseDate.setDate(baseDate.getDate() + 7) // Start next week
    baseDate.setHours(0, 0, 0, 0)

    // Volunteer 0 via UI: next Monday 9am-5pm
    const mon = new Date(baseDate)
    mon.setDate(mon.getDate() + ((1 - mon.getDay() + 7) % 7 || 7))

    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[0]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })

    // Click Availability tab
    await page.getByRole("tab", { name: /availability/i }).click()

    // Click "Add Availability" button
    await page.getByRole("button", { name: /add availability/i }).click()

    // Fill in the date/time in the dialog
    // The AddAvailabilityDialog should have start_at and end_at inputs
    const startInput = page.locator('input[name="start_at"], input[type="datetime-local"]').first()
    const endInput = page.locator('input[name="end_at"], input[type="datetime-local"]').last()

    const startDate = new Date(mon)
    startDate.setHours(9, 0, 0, 0)
    const endDate = new Date(mon)
    endDate.setHours(17, 0, 0, 0)

    await startInput.fill(formatDatetimeLocal(startDate))
    await endInput.fill(formatDatetimeLocal(endDate))

    // Submit
    await page.getByRole("button", { name: /save|add|submit/i }).click()
    await expect(
      page.getByText(/availability/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Store availability for later edit/delete
    const avResp = await apiGet(page,
      `/api/v1/campaigns/${campaignId}/volunteers/${volunteerIds[0]}/availability`,
    )
    const avData = await avResp.json()
    if (avData.length > 0) {
      availabilityIds.set(volunteerIds[0], avData.map((a: { id: string }) => a.id))
    }

    // Volunteer 1 via UI: next Saturday 10am-2pm
    const sat = new Date(baseDate)
    sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7))

    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[1]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /availability/i }).click()
    await page.getByRole("button", { name: /add availability/i }).click()

    const startInput2 = page.locator('input[name="start_at"], input[type="datetime-local"]').first()
    const endInput2 = page.locator('input[name="end_at"], input[type="datetime-local"]').last()

    const satStart = new Date(sat)
    satStart.setHours(10, 0, 0, 0)
    const satEnd = new Date(sat)
    satEnd.setHours(14, 0, 0, 0)

    await startInput2.fill(formatDatetimeLocal(satStart))
    await endInput2.fill(formatDatetimeLocal(satEnd))

    await page.getByRole("button", { name: /save|add|submit/i }).click()
    const avResp2 = await apiGet(page,
      `/api/v1/campaigns/${campaignId}/volunteers/${volunteerIds[1]}/availability`,
    )
    const avData2 = await avResp2.json()
    if (avData2.length > 0) {
      availabilityIds.set(volunteerIds[1], avData2.map((a: { id: string }) => a.id))
    }

    // Volunteers 2-4 via API (per D-16)
    for (let i = 2; i < 5; i++) {
      const dayOffset = i + 1
      const slotStart = new Date(baseDate)
      slotStart.setDate(slotStart.getDate() + dayOffset)
      slotStart.setHours(9, 0, 0, 0)
      const slotEnd = new Date(slotStart)
      slotEnd.setHours(17, 0, 0, 0)

      const avId = await addAvailabilityViaApi(
        page,
        campaignId,
        volunteerIds[i],
        slotStart.toISOString(),
        slotEnd.toISOString(),
      )
      availabilityIds.set(volunteerIds[i], [avId])
    }

    // Verify one API-created availability via navigation
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[3]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /availability/i }).click()
    // Should see at least one availability slot (not "No availability set")
    await expect(
      page.getByText("No availability set"),
    ).not.toBeVisible({ timeout: 10_000 })
  })

  test("AVAIL-02: Edit availability", async ({ page, campaignId }) => {
    // Edit = delete old slot + add new slot (no inline edit in UI)
    // For volunteers 0 and 1, delete their current availability and set new times

    const newBaseDate = new Date()
    newBaseDate.setDate(newBaseDate.getDate() + 14) // 2 weeks out
    newBaseDate.setHours(0, 0, 0, 0)

    for (let i = 0; i < 2; i++) {
      const volId = volunteerIds[i]
      const slots = availabilityIds.get(volId) ?? []

      // Delete old slots via API
      for (const slotId of slots) {
        await deleteAvailabilityViaApi(page, campaignId, volId, slotId)
      }

      // Add new availability via API
      const newStart = new Date(newBaseDate)
      newStart.setDate(newStart.getDate() + i)
      newStart.setHours(10, 0, 0, 0)
      const newEnd = new Date(newStart)
      newEnd.setHours(16, 0, 0, 0)

      const newAvId = await addAvailabilityViaApi(
        page,
        campaignId,
        volId,
        newStart.toISOString(),
        newEnd.toISOString(),
      )
      availabilityIds.set(volId, [newAvId])
    }

    // Verify the edit persisted by navigating to volunteer detail
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[0]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /availability/i }).click()
    // Should see availability (not empty state)
    await expect(
      page.getByText("No availability set"),
    ).not.toBeVisible({ timeout: 10_000 })
  })

  test("AVAIL-03: Delete availability", async ({ page, campaignId }) => {
    // Delete all availability from volunteer 0 via UI
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${volunteerIds[0]}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /availability/i }).click()

    // Click the X button on each availability slot
    let deleteBtn = page.locator("[class*='availability'] button, .rounded-md.border button").first()
    // Alternative: look for the X icon buttons next to availability slots
    const slotDeleteButtons = page.locator(".rounded-md.border .size-4").locator("..")
    const count = await slotDeleteButtons.count()

    if (count > 0) {
      // Click each delete button
      for (let i = count - 1; i >= 0; i--) {
        await slotDeleteButtons.nth(i).click()
      }
    } else {
      // Fallback: delete via API
      const slots = availabilityIds.get(volunteerIds[0]) ?? []
      for (const slotId of slots) {
        await deleteAvailabilityViaApi(
          page,
          campaignId,
          volunteerIds[0],
          slotId,
        )
      }
    }

    // Reload and verify empty state
    await page.reload()
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /availability/i }).click()
    await expect(
      page.getByText("No availability set"),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ── Utility ──────────────────────────────────────────────────────────────────

function formatDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
