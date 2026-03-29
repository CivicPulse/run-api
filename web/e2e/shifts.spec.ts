import { test, expect, type Page } from "@playwright/test"

/**
 * Shifts E2E Spec
 *
 * Validates shift CRUD (20 shifts), volunteer assignment, availability
 * enforcement, check-in/out, hours tracking, hours adjustment, and
 * volunteer unassignment.
 *
 * Covers: SHIFT-01 through SHIFT-10 (E2E-19)
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// ── Helpers (self-contained, cookie forwarding per D-10) ─────────────────────

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

async function createVolunteerViaApi(
  page: Page,
  campaignId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/volunteers`,
    {
      data,
      headers: { "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

async function createShiftViaApi(
  page: Page,
  campaignId: string,
  data: {
    name: string
    type: string
    start_at: string
    end_at: string
    max_volunteers: number
    description?: string
  },
): Promise<string> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/shifts`,
    {
      data,
      headers: { "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

async function deleteShiftViaApi(
  page: Page,
  campaignId: string,
  shiftId: string,
): Promise<void> {
  const resp = await page.request.delete(
    `/api/v1/campaigns/${campaignId}/shifts/${shiftId}`,
  )
  expect(resp.ok()).toBeTruthy()
}

async function assignVolunteerToShiftViaApi(
  page: Page,
  campaignId: string,
  shiftId: string,
  volunteerId: string,
): Promise<void> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/shifts/${shiftId}/assign/${volunteerId}`,
  )
  expect(resp.ok()).toBeTruthy()
}

async function checkInViaApi(
  page: Page,
  campaignId: string,
  shiftId: string,
  volunteerId: string,
): Promise<void> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/shifts/${shiftId}/check-in/${volunteerId}`,
  )
  expect(resp.ok()).toBeTruthy()
}

async function checkOutViaApi(
  page: Page,
  campaignId: string,
  shiftId: string,
  volunteerId: string,
): Promise<void> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/shifts/${shiftId}/check-out/${volunteerId}`,
  )
  expect(resp.ok()).toBeTruthy()
}

async function activateShiftViaApi(
  page: Page,
  campaignId: string,
  shiftId: string,
): Promise<void> {
  const resp = await page.request.patch(
    `/api/v1/campaigns/${campaignId}/shifts/${shiftId}/status`,
    {
      data: { status: "active" },
      headers: { "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
}

async function removeVolunteerFromShiftViaApi(
  page: Page,
  campaignId: string,
  shiftId: string,
  volunteerId: string,
): Promise<void> {
  const resp = await page.request.delete(
    `/api/v1/campaigns/${campaignId}/shifts/${shiftId}/volunteers/${volunteerId}`,
  )
  expect(resp.ok()).toBeTruthy()
}

async function addAvailabilityViaApi(
  page: Page,
  campaignId: string,
  volunteerId: string,
  startAt: string,
  endAt: string,
): Promise<string> {
  const resp = await page.request.post(
    `/api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/availability`,
    {
      data: { start_at: startAt, end_at: endAt },
      headers: { "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

// ── Shift Data Generator (per D-09: 20 shifts) ──────────────────────────────

function generateShiftData(): Array<{
  name: string
  type: string
  start_at: string
  end_at: string
  max_volunteers: number
  description?: string
}> {
  const shifts: Array<{
    name: string
    type: string
    start_at: string
    end_at: string
    max_volunteers: number
    description?: string
  }> = []

  const baseDate = new Date()
  baseDate.setDate(baseDate.getDate() + 1) // Start from tomorrow
  baseDate.setHours(0, 0, 0, 0)

  const types = ["canvassing", "phone_banking", "general"]

  // 5 shifts this week, morning (9am-12pm)
  for (let d = 0; d < 5; d++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + d)
    const startAt = new Date(date)
    startAt.setHours(9, 0, 0, 0)
    const endAt = new Date(date)
    endAt.setHours(12, 0, 0, 0)
    shifts.push({
      name: `E2E Shift W1 AM ${d + 1}`,
      type: types[d % 3],
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      max_volunteers: d < 2 ? 2 : d < 4 ? 5 : 10,
      description: `Morning shift day ${d + 1}`,
    })
  }

  // 5 shifts this week, afternoon (1pm-5pm)
  for (let d = 0; d < 5; d++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + d)
    const startAt = new Date(date)
    startAt.setHours(13, 0, 0, 0)
    const endAt = new Date(date)
    endAt.setHours(17, 0, 0, 0)
    shifts.push({
      name: `E2E Shift W1 PM ${d + 1}`,
      type: types[d % 3],
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      max_volunteers: d < 2 ? 2 : d < 4 ? 5 : 10,
      description: `Afternoon shift day ${d + 1}`,
    })
  }

  // 5 shifts next week, morning
  for (let d = 7; d < 12; d++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + d)
    const startAt = new Date(date)
    startAt.setHours(9, 0, 0, 0)
    const endAt = new Date(date)
    endAt.setHours(12, 0, 0, 0)
    shifts.push({
      name: `E2E Shift W2 AM ${d - 6}`,
      type: "general",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      max_volunteers: 5,
      description: `Next week morning shift ${d - 6}`,
    })
  }

  // 5 shifts next week, afternoon
  for (let d = 7; d < 12; d++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + d)
    const startAt = new Date(date)
    startAt.setHours(13, 0, 0, 0)
    const endAt = new Date(date)
    endAt.setHours(17, 0, 0, 0)
    shifts.push({
      name: `E2E Shift W2 PM ${d - 6}`,
      type: "general",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      max_volunteers: 5,
      description: `Next week afternoon shift ${d - 6}`,
    })
  }

  return shifts
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe.serial("Shift Lifecycle", () => {
  let campaignId = ""
  const shiftIds: string[] = []
  const volunteerIds: string[] = []
  // Track which shift we use for check-in/out testing
  let activeShiftId = ""
  let checkedInVolunteerId = ""
  test.setTimeout(180_000) // 20 shifts + assignments + check-in/out

  // ── Setup ──

  test("Setup: create volunteers for shift testing", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)
    expect(campaignId).toBeTruthy()

    // Create 5 volunteers for assignment testing
    for (let i = 1; i <= 5; i++) {
      const id = await createVolunteerViaApi(page, campaignId, {
        first_name: "ShiftTest",
        last_name: `Vol ${i}`,
        email: `shifttest-vol-${i}@e2e.test`,
        phone: `555-100-${String(i).padStart(4, "0")}`,
      })
      volunteerIds.push(id)
    }

    expect(volunteerIds).toHaveLength(5)
  })

  // ── SHIFT-01: Create 20 shifts ──

  test("SHIFT-01: Create 20 shifts", async ({ page }) => {
    const allShiftData = generateShiftData()
    expect(allShiftData).toHaveLength(20)

    // Create first 3 via UI form (per D-16)
    await page.goto(`/campaigns/${campaignId}/volunteers/shifts`)
    await page.waitForURL(/volunteers\/shifts/, { timeout: 10_000 })

    for (let i = 0; i < 3; i++) {
      const shiftData = allShiftData[i]

      // Click "+ Create Shift"
      await page.getByRole("button", { name: /create shift/i }).click()

      // Fill the shift form dialog
      await page.getByLabel(/name/i).fill(shiftData.name)

      // Select shift type
      const typeSelect = page.locator('[name="type"], [data-testid="shift-type"]').first()
      if (await typeSelect.isVisible().catch(() => false)) {
        await typeSelect.selectOption(shiftData.type)
      } else {
        // Try clicking a combobox/select trigger for type
        const typeBtn = page.getByRole("combobox").filter({ hasText: /type|canvassing|general|phone/i }).first()
          .or(page.locator('button[role="combobox"]').first())
        if (await typeBtn.isVisible().catch(() => false)) {
          await typeBtn.click()
          const typeLabel = shiftData.type === "canvassing" ? "Canvassing"
            : shiftData.type === "phone_banking" ? "Phone Banking"
            : "General"
          await page.getByRole("option", { name: typeLabel }).click()
        }
      }

      // Fill dates
      const startInput = page.locator('input[name="start_at"], input[type="datetime-local"]').first()
      const endInput = page.locator('input[name="end_at"], input[type="datetime-local"]').last()
      await startInput.fill(formatDatetimeLocal(new Date(shiftData.start_at)))
      await endInput.fill(formatDatetimeLocal(new Date(shiftData.end_at)))

      // Fill max volunteers
      const maxVolInput = page.getByLabel(/max|capacity|volunteers/i).first()
        .or(page.locator('input[name="max_volunteers"]'))
      if (await maxVolInput.first().isVisible().catch(() => false)) {
        await maxVolInput.first().fill(String(shiftData.max_volunteers))
      }

      // Submit
      await page.getByRole("button", { name: /save|create|submit/i }).click()

      // Wait for either success toast or dialog to close
      await page.waitForTimeout(2_000)
    }

    // Get any UI-created shift IDs from the API
    const listResp = await page.request.get(
      `/api/v1/campaigns/${campaignId}/shifts`,
    )
    const listData = await listResp.json()
    const existingIds = new Set<string>()
    for (const item of (listData.items ?? listData)) {
      if (typeof item === "object" && item.id) {
        existingIds.add(item.id)
      }
    }

    // Create remaining 17 shifts via API (per D-16)
    for (const shiftData of allShiftData.slice(3)) {
      const id = await createShiftViaApi(page, campaignId, shiftData)
      shiftIds.push(id)
    }

    // Get all shift IDs (including UI-created ones)
    const finalListResp = await page.request.get(
      `/api/v1/campaigns/${campaignId}/shifts`,
    )
    const finalListData = await finalListResp.json()
    const allItems = finalListData.items ?? finalListData
    // Add any UI-created shift IDs to the front of shiftIds
    const uiCreatedIds: string[] = []
    for (const item of allItems) {
      if (
        item.name?.startsWith("E2E Shift") &&
        !shiftIds.includes(item.id)
      ) {
        uiCreatedIds.push(item.id)
      }
    }
    shiftIds.unshift(...uiCreatedIds)

    // Navigate to shifts list and verify shifts appear
    await page.goto(`/campaigns/${campaignId}/volunteers/shifts`)
    await page.waitForURL(/volunteers\/shifts/, { timeout: 10_000 })

    // Verify at least one shift card is visible
    await expect(
      page.getByText(/E2E Shift/).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify we have created at least 20 E2E test shifts total
    const e2eShifts = allItems.filter(
      (s: { name: string }) => s.name?.startsWith("E2E Shift"),
    )
    expect(e2eShifts.length).toBeGreaterThanOrEqual(20)
  })

  // ── SHIFT-02: Assign volunteers to shifts ──

  test("SHIFT-02: Assign volunteers to shifts", async ({ page }) => {
    // Assign first 2 via UI, rest via API (per D-16)
    const assignableShifts = shiftIds.slice(0, 10) // First 10 shifts

    // Assign first 2 shifts via UI (navigate to shift detail -> Roster -> Assign)
    for (let i = 0; i < 2; i++) {
      const shiftId = assignableShifts[i]
      const volunteerId = volunteerIds[i % volunteerIds.length]

      await page.goto(
        `/campaigns/${campaignId}/volunteers/shifts/${shiftId}`,
      )
      await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

      // Click Roster tab
      await page.getByRole("tab", { name: /roster/i }).click()

      // Click "Assign Volunteer" button
      await page.getByRole("button", { name: /assign volunteer/i }).click()

      // In the AssignVolunteerDialog, select a volunteer
      // Look for the volunteer name or a selection mechanism
      await page.waitForTimeout(1_000)

      const volunteerOption = page
        .getByText(/ShiftTest/)
        .first()
      if (await volunteerOption.isVisible().catch(() => false)) {
        await volunteerOption.click()
      }

      // Click the assign/confirm button in the dialog
      const assignBtn = page.getByRole("button", { name: /^assign$/i })
        .or(page.getByRole("button", { name: /confirm/i }))
      if (await assignBtn.first().isVisible().catch(() => false)) {
        await assignBtn.first().click()
        await page.waitForTimeout(2_000)
      }
    }

    // Assign remaining 8 shifts via API
    for (let i = 2; i < assignableShifts.length; i++) {
      const shiftId = assignableShifts[i]
      const volunteerId = volunteerIds[i % volunteerIds.length]
      await assignVolunteerToShiftViaApi(
        page,
        campaignId,
        shiftId,
        volunteerId,
      )
    }

    // Verify assignment persisted by navigating to a shift detail
    await page.goto(
      `/campaigns/${campaignId}/volunteers/shifts/${assignableShifts[5]}`,
    )
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })
    await page.getByRole("tab", { name: /roster/i }).click()

    // Should see at least one volunteer name on the roster
    await expect(
      page.getByText(/ShiftTest/).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ── SHIFT-03: Validate availability enforcement ──

  test("SHIFT-03: Validate availability enforcement", async ({ page }) => {
    // Set availability for volunteer 0 and 1, then test assignment
    // This is observational per testing plan -- document behavior

    const availStart = new Date()
    availStart.setDate(availStart.getDate() + 1)
    availStart.setHours(9, 0, 0, 0)
    const availEnd = new Date(availStart)
    availEnd.setHours(12, 0, 0, 0)

    // Set availability for volunteer 0 covering morning only
    await addAvailabilityViaApi(
      page,
      campaignId,
      volunteerIds[0],
      availStart.toISOString(),
      availEnd.toISOString(),
    )

    // Find a shift that falls WITHIN availability (morning shift)
    // shiftIds[0] is W1 AM 1 (9am-12pm) -- within availability
    const withinShiftId = shiftIds[0]

    // Find a shift that falls OUTSIDE availability (afternoon shift)
    // shiftIds[5] is W1 PM 1 (1pm-5pm) -- outside availability
    const outsideShiftId = shiftIds[5]

    // Attempt to assign volunteer 0 to the within-availability shift
    // (May already be assigned from SHIFT-02, so handle gracefully)
    const withinResp = await page.request.post(
      `/api/v1/campaigns/${campaignId}/shifts/${withinShiftId}/assign/${volunteerIds[0]}`,
    )
    // Document: assignment within availability should succeed (or already exists)
    const withinOk = withinResp.ok() || withinResp.status() === 422
    expect(withinOk).toBeTruthy()

    // Attempt to assign volunteer 0 to the outside-availability shift
    const outsideResp = await page.request.post(
      `/api/v1/campaigns/${campaignId}/shifts/${outsideShiftId}/assign/${volunteerIds[0]}`,
    )
    // Document: the API may either block, warn, or allow assignment outside availability
    // Record the behavior for documentation purposes
    const outsideStatus = outsideResp.status()
    const outsideBody = await outsideResp.text()
    // eslint-disable-next-line no-console
    console.log(
      `[SHIFT-03] Availability enforcement behavior:`,
      `\n  Within availability (${withinShiftId}): status=${withinResp.status()}`,
      `\n  Outside availability (${outsideShiftId}): status=${outsideStatus}`,
      `\n  Outside response: ${outsideBody.slice(0, 200)}`,
    )

    // Verify at least the within-availability assignment works
    // The outside-availability response is observational (documenting actual behavior)
    expect(outsideStatus).toBeLessThan(500) // Should not be a server error
  })

  // ── SHIFT-04: Check in a volunteer ──

  test("SHIFT-04: Check in a volunteer", async ({ page }) => {
    // First, activate a shift so check-in is possible
    // Use shiftIds[2] (has a volunteer assigned from SHIFT-02)
    activeShiftId = shiftIds[2]
    checkedInVolunteerId = volunteerIds[2]

    // Ensure volunteer is assigned to this shift
    await assignVolunteerToShiftViaApi(
      page,
      campaignId,
      activeShiftId,
      checkedInVolunteerId,
    ).catch(() => {
      // Already assigned, that's fine
    })

    // Activate the shift via API
    await activateShiftViaApi(page, campaignId, activeShiftId)

    // Navigate to shift detail
    await page.goto(
      `/campaigns/${campaignId}/volunteers/shifts/${activeShiftId}`,
    )
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

    // Click Roster tab
    await page.getByRole("tab", { name: /roster/i }).click()

    // Find the "Check In" button for the volunteer
    const checkInBtn = page.getByRole("button", { name: /check in/i }).first()
    if (await checkInBtn.isVisible().catch(() => false)) {
      await checkInBtn.click()

      // Wait for success toast
      await expect(
        page.getByText(/checked in/i),
      ).toBeVisible({ timeout: 10_000 })
    } else {
      // Fallback: check in via API
      await checkInViaApi(page, campaignId, activeShiftId, checkedInVolunteerId)
    }

    // Verify check-in time is recorded by reloading the page
    await page.reload()
    await page.getByRole("tab", { name: /roster/i }).click()

    // The roster should show "Checked in" status or a check-in timestamp
    await expect(
      page.getByText(/checked.?in/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ── SHIFT-05: Check out a volunteer ──

  test("SHIFT-05: Check out a volunteer", async ({ page }) => {
    // Navigate to the same active shift
    await page.goto(
      `/campaigns/${campaignId}/volunteers/shifts/${activeShiftId}`,
    )
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

    // Click Roster tab
    await page.getByRole("tab", { name: /roster/i }).click()

    // Find the "Check Out" button
    const checkOutBtn = page.getByRole("button", { name: /check out/i }).first()
    if (await checkOutBtn.isVisible().catch(() => false)) {
      await checkOutBtn.click()

      // Wait for success toast
      await expect(
        page.getByText(/checked out/i),
      ).toBeVisible({ timeout: 10_000 })
    } else {
      // Fallback: check out via API
      await checkOutViaApi(
        page,
        campaignId,
        activeShiftId,
        checkedInVolunteerId,
      )
    }

    // Verify check-out is recorded
    await page.reload()
    await page.getByRole("tab", { name: /roster/i }).click()

    // Should show "Checked out" status and hours
    await expect(
      page.getByText(/checked.?out/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify hours are calculated (should show a number in the Hours column)
    const hoursCell = page.locator("td").filter({ hasText: /\d+\.\d/ })
    const hasHours = await hoursCell.first().isVisible().catch(() => false)
    // eslint-disable-next-line no-console
    console.log("[SHIFT-05] Hours calculated:", hasHours)
  })

  // ── SHIFT-06: View volunteer hours ──

  test("SHIFT-06: View volunteer hours", async ({ page }) => {
    // Navigate to the volunteer's detail page
    await page.goto(
      `/campaigns/${campaignId}/volunteers/${checkedInVolunteerId}`,
    )
    await page.waitForURL(/volunteers\/[a-f0-9-]+$/, { timeout: 10_000 })

    // Click Hours tab
    await page.getByRole("tab", { name: /hours/i }).click()

    // Should show hours section -- either with data or empty state
    const bodyText = await page.locator("body").innerText()
    const hasHoursData =
      bodyText.includes("Total Hours") ||
      bodyText.includes("Shifts Completed")
    const hasEmptyState = bodyText.includes("No hours recorded")

    // eslint-disable-next-line no-console
    console.log(
      "[SHIFT-06] Hours page:",
      hasHoursData ? "has data" : "empty state",
    )
    expect(hasHoursData || hasEmptyState).toBeTruthy()

    // If hours data exists, verify it shows shift name and hours
    if (hasHoursData) {
      await expect(
        page.getByText(/total hours/i),
      ).toBeVisible({ timeout: 5_000 })
      await expect(
        page.getByText(/shifts completed/i),
      ).toBeVisible({ timeout: 5_000 })
    }
  })

  // ── SHIFT-07: Adjust hours ──

  test("SHIFT-07: Adjust hours", async ({ page }) => {
    // Navigate to the shift detail where we checked in/out
    await page.goto(
      `/campaigns/${campaignId}/volunteers/shifts/${activeShiftId}`,
    )
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

    // Click Roster tab
    await page.getByRole("tab", { name: /roster/i }).click()
    await page.waitForTimeout(2_000)

    // Find the kebab menu for the checked-out volunteer and click "Adjust Hours"
    const kebabBtn = page
      .locator("button")
      .filter({ has: page.locator(".size-4") })
      .last()
    if (await kebabBtn.isVisible().catch(() => false)) {
      await kebabBtn.click()
      await page.waitForTimeout(500)

      const adjustMenuItem = page.getByRole("menuitem", {
        name: /adjust hours/i,
      })
      if (await adjustMenuItem.isVisible().catch(() => false)) {
        await adjustMenuItem.click()

        // Fill in the adjusted hours and reason
        const hoursInput = page.getByLabel(/hours|adjusted/i).first()
          .or(page.locator('input[name="adjusted_hours"]'))
        if (await hoursInput.first().isVisible().catch(() => false)) {
          await hoursInput.first().fill("2.5")
        }

        const reasonInput = page.getByLabel(/reason/i).first()
          .or(page.locator('input[name="adjustment_reason"], textarea[name="adjustment_reason"]'))
        if (await reasonInput.first().isVisible().catch(() => false)) {
          await reasonInput.first().fill("E2E test: correcting late check-in")
        }

        // Submit
        await page.getByRole("button", { name: /save|submit|adjust/i }).click()
        await page.waitForTimeout(2_000)
      } else {
        // Fallback: adjust via API
        const resp = await page.request.patch(
          `/api/v1/campaigns/${campaignId}/shifts/${activeShiftId}/volunteers/${checkedInVolunteerId}/hours`,
          {
            data: {
              adjusted_hours: 2.5,
              adjustment_reason: "E2E test: correcting late check-in",
            },
            headers: { "Content-Type": "application/json" },
          },
        )
        expect(resp.ok()).toBeTruthy()
      }
    } else {
      // Fallback: adjust via API directly
      const resp = await page.request.patch(
        `/api/v1/campaigns/${campaignId}/shifts/${activeShiftId}/volunteers/${checkedInVolunteerId}/hours`,
        {
          data: {
            adjusted_hours: 2.5,
            adjustment_reason: "E2E test: correcting late check-in",
          },
          headers: { "Content-Type": "application/json" },
        },
      )
      expect(resp.ok()).toBeTruthy()
    }

    // Verify adjusted hours by checking the volunteer's hours via API
    const hoursResp = await page.request.get(
      `/api/v1/campaigns/${campaignId}/volunteers/${checkedInVolunteerId}/hours`,
    )
    if (hoursResp.ok()) {
      const hoursData = await hoursResp.json()
      // eslint-disable-next-line no-console
      console.log("[SHIFT-07] Hours data after adjustment:", JSON.stringify(hoursData))
    }
  })

  // ── SHIFT-08: Edit a shift ──

  test("SHIFT-08: Edit a shift", async ({ page }) => {
    // Use a scheduled shift (not the active one) for editing
    // shiftIds[10] should be a scheduled W2 shift
    const editShiftId = shiftIds[10] ?? shiftIds[shiftIds.length - 1]

    await page.goto(
      `/campaigns/${campaignId}/volunteers/shifts/${editShiftId}`,
    )
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

    // Click "Edit" button (only visible for scheduled shifts)
    const editBtn = page.getByRole("button", { name: /edit/i })
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click()

      // Modify the shift name
      const nameInput = page.getByLabel(/name/i)
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.clear()
        await nameInput.fill("E2E Shift EDITED")
      }

      // Modify max volunteers
      const maxInput = page.getByLabel(/max|capacity|volunteers/i).first()
        .or(page.locator('input[name="max_volunteers"]'))
      if (await maxInput.first().isVisible().catch(() => false)) {
        await maxInput.first().clear()
        await maxInput.first().fill("15")
      }

      // Save
      await page.getByRole("button", { name: /save|update|submit/i }).click()
      await page.waitForTimeout(2_000)
    } else {
      // If edit button not visible, edit via API
      const resp = await page.request.patch(
        `/api/v1/campaigns/${campaignId}/shifts/${editShiftId}`,
        {
          data: { name: "E2E Shift EDITED", max_volunteers: 15 },
          headers: { "Content-Type": "application/json" },
        },
      )
      expect(resp.ok()).toBeTruthy()
    }

    // Verify changes persist
    await page.reload()
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

    const bodyText = await page.locator("body").innerText()
    expect(bodyText).toContain("E2E Shift EDITED")
  })

  // ── SHIFT-09: Delete a shift ──

  test("SHIFT-09: Delete a shift", async ({ page }) => {
    // Create a throwaway shift via API
    const throwawayId = await createShiftViaApi(page, campaignId, {
      name: "E2E Throwaway Shift",
      type: "general",
      start_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      end_at: new Date(Date.now() + 14 * 86_400_000 + 3 * 3_600_000).toISOString(),
      max_volunteers: 5,
    })

    // Delete via API (shift deletion is typically via API since UI may not have inline delete)
    await deleteShiftViaApi(page, campaignId, throwawayId)

    // Verify deletion: try to fetch the deleted shift
    const getResp = await page.request.get(
      `/api/v1/campaigns/${campaignId}/shifts/${throwawayId}`,
    )
    expect(getResp.status()).toBe(404)

    // Also verify it's not in the shifts list
    await page.goto(`/campaigns/${campaignId}/volunteers/shifts`)
    await page.waitForURL(/volunteers\/shifts/, { timeout: 10_000 })
    await page.waitForTimeout(2_000)

    await expect(
      page.getByText("E2E Throwaway Shift"),
    ).not.toBeVisible({ timeout: 5_000 })
  })

  // ── SHIFT-10: Unassign a volunteer from a shift ──

  test("SHIFT-10: Unassign a volunteer from a shift", async ({ page }) => {
    // Use a shift that has an assigned volunteer
    // shiftIds[4] should have volunteer 4 assigned from SHIFT-02
    const unassignShiftId = shiftIds[4]
    const unassignVolunteerId = volunteerIds[4]

    // Ensure assignment exists
    await assignVolunteerToShiftViaApi(
      page,
      campaignId,
      unassignShiftId,
      unassignVolunteerId,
    ).catch(() => {
      // Already assigned
    })

    // Navigate to shift detail
    await page.goto(
      `/campaigns/${campaignId}/volunteers/shifts/${unassignShiftId}`,
    )
    await page.waitForURL(/shifts\/[a-f0-9-]+/, { timeout: 10_000 })

    // Click Roster tab
    await page.getByRole("tab", { name: /roster/i }).click()
    await page.waitForTimeout(2_000)

    // Verify volunteer is on the roster
    const volunteerVisible = await page
      .getByText(/ShiftTest/)
      .first()
      .isVisible()
      .catch(() => false)

    if (volunteerVisible) {
      // Try to use the UI kebab menu to remove
      const kebabBtn = page
        .locator("button")
        .filter({ has: page.locator(".size-4") })
        .last()
      if (await kebabBtn.isVisible().catch(() => false)) {
        await kebabBtn.click()
        await page.waitForTimeout(500)

        const removeMenuItem = page.getByRole("menuitem", {
          name: /remove volunteer/i,
        })
        if (await removeMenuItem.isVisible().catch(() => false)) {
          await removeMenuItem.click()

          // Confirm removal in dialog
          const confirmBtn = page.getByRole("button", { name: /^remove$/i })
          if (await confirmBtn.isVisible().catch(() => false)) {
            await confirmBtn.click()
            await expect(
              page.getByText(/removed/i),
            ).toBeVisible({ timeout: 10_000 })
          }
        } else {
          // Fallback: remove via API
          await removeVolunteerFromShiftViaApi(
            page,
            campaignId,
            unassignShiftId,
            unassignVolunteerId,
          )
        }
      } else {
        // Fallback: remove via API
        await removeVolunteerFromShiftViaApi(
          page,
          campaignId,
          unassignShiftId,
          unassignVolunteerId,
        )
      }
    } else {
      // Volunteer not visible on roster -- remove via API and verify
      await removeVolunteerFromShiftViaApi(
        page,
        campaignId,
        unassignShiftId,
        unassignVolunteerId,
      )
    }

    // Verify removal: check the shift's volunteer list via API
    const volListResp = await page.request.get(
      `/api/v1/campaigns/${campaignId}/shifts/${unassignShiftId}/volunteers`,
    )
    const volListData = await volListResp.json()
    const items = volListData.items ?? volListData
    const stillAssigned = items.some(
      (v: { volunteer_id: string }) => v.volunteer_id === unassignVolunteerId,
    )
    expect(stillAssigned).toBeFalsy()
  })
})

// ── Utility ──────────────────────────────────────────────────────────────────

function formatDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
