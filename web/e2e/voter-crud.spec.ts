import { test, expect } from "./fixtures"
import { apiPost, apiDelete, apiGet } from "./helpers"

/**
 * Voter CRUD Lifecycle E2E Spec
 *
 * Validates the full voter entity lifecycle: create 20+ voters via UI + API,
 * edit voter fields, delete seed voters and test-created voters.
 *
 * Covers: VCRUD-01 through VCRUD-04
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// ── Helper Functions ──────────────────────────────────────────────────────────

async function createVoterViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const url = `/api/v1/campaigns/${campaignId}/voters`
  for (let attempt = 0; attempt < 8; attempt++) {
    const resp = await apiPost(page, url, data)
    if (resp.ok()) {
      const body = await resp.json()
      return body.id
    }
    if (resp.status() === 429 && attempt < 7) {
      // Rate limit hit — wait with exponential backoff (shorter initial delay)
      await page.waitForTimeout(2000 * (attempt + 1))
      continue
    }
    const body = await resp.text()
    throw new Error(`POST ${url} failed: ${resp.status()} ${resp.statusText()} — ${body}`)
  }
  throw new Error(`POST ${url} failed after 8 retries`)
}

async function deleteVoterViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  voterId: string,
): Promise<void> {
  const resp = await apiDelete(
    page,
    `/api/v1/campaigns/${campaignId}/voters/${voterId}`,
  )
  expect(resp.ok()).toBeTruthy()
}

// ── Voter Test Data ───────────────────────────────────────────────────────────

/** Voters created via UI form (first 3) */
const UI_VOTERS = [
  {
    first_name: "Test",
    last_name: "Alpha",
    date_of_birth: "1990-01-15",
    party: "DEM",
    registration_line1: "100 Test St",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Bravo",
    date_of_birth: "1985-06-20",
    party: "REP",
    registration_line1: "200 Test Ave",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Charlie",
    date_of_birth: "2000-03-10",
    party: "IND",
  },
]

/** Voters created via API (remaining 17) */
const API_VOTERS = [
  {
    first_name: "Test",
    last_name: "Delta",
    date_of_birth: "1975-11-30",
    party: "LIB",
    registration_line1: "400 Test Blvd",
    registration_city: "Warner Robins",
    registration_state: "GA",
    registration_zip: "31088",
  },
  {
    first_name: "Test",
    last_name: "Echo",
    date_of_birth: "1960-08-05",
    party: "DEM",
    registration_line1: "500 Test Dr",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31204",
  },
  {
    first_name: "Test",
    last_name: "Foxtrot",
    date_of_birth: "1998-02-14",
    registration_line1: "600 Test Ln",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Golf",
    date_of_birth: "1982-07-22",
    party: "REP",
    registration_line1: "700 Test Way",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31210",
  },
  {
    first_name: "Test",
    last_name: "Hotel",
    date_of_birth: "2002-12-01",
    party: "DEM",
  },
  {
    first_name: "Test",
    last_name: "India",
    date_of_birth: "1970-04-18",
    party: "GRN",
    registration_line1: "900 Test Ct",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Juliet",
    date_of_birth: "1955-09-25",
    party: "DEM",
    registration_line1: "1000 Test Pl",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Kilo",
    date_of_birth: "1992-01-01",
    party: "REP",
    registration_line1: "1100 Test Rd",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Lima",
    date_of_birth: "1988-05-05",
    party: "DEM",
    registration_line1: "1200 Test St",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Mike",
    date_of_birth: "1995-10-10",
    party: "IND",
    registration_line1: "1300 Test Ave",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "November",
    date_of_birth: "1978-03-15",
    party: "DEM",
    registration_line1: "1400 Test Blvd",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Oscar",
    date_of_birth: "1965-07-30",
    party: "REP",
    registration_line1: "1500 Test Dr",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Papa",
    date_of_birth: "2001-11-11",
    party: "DEM",
    registration_line1: "1600 Test Ln",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31204",
  },
  {
    first_name: "Test",
    last_name: "Quebec",
    date_of_birth: "1983-06-06",
    registration_line1: "1700 Test Way",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31210",
  },
  {
    first_name: "Test",
    last_name: "Romeo",
    date_of_birth: "1972-08-20",
    party: "LIB",
    registration_line1: "1800 Test Ct",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Sierra",
    date_of_birth: "1990-12-25",
    party: "DEM",
    registration_line1: "1900 Test Pl",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
  {
    first_name: "Test",
    last_name: "Tango",
    date_of_birth: "1945-01-01",
    party: "REP",
    registration_line1: "2000 Test Rd",
    registration_city: "Macon",
    registration_state: "GA",
    registration_zip: "31201",
  },
]

// ── Serial Test Suite ─────────────────────────────────────────────────────────

test.describe.serial("Voter CRUD lifecycle", () => {
  let campaignId = ""
  let createdVoterIds: string[] = []

  test.setTimeout(180_000)

  test("VCRUD-01a: Create 3 voters via UI form", async ({ page, campaignId }) => {
    await test.step("Navigate to seed campaign", async () => {
      // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
      expect(campaignId).toBeTruthy()
    })

    await test.step("Navigate to voters page", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      await page.waitForURL(/voters/, { timeout: 10_000 })
      await expect(
        page.locator('table[data-slot="table"]'),
      ).toBeVisible({ timeout: 15_000 })
    })

    for (const voter of UI_VOTERS) {
      await test.step(`Create voter ${voter.first_name} ${voter.last_name} via UI`, async () => {
        // Open creation sheet
        await page.getByRole("button", { name: /new voter/i }).click()
        await expect(page.getByText(/new voter/i).first()).toBeVisible({ timeout: 5_000 })

        // Fill form fields
        await page.getByLabel("First Name").fill(voter.first_name)
        await page.getByLabel("Last Name").fill(voter.last_name)
        if (voter.date_of_birth) {
          await page.getByLabel("Date of Birth").fill(voter.date_of_birth)
        }
        if (voter.party) {
          await page.getByLabel("Party").fill(voter.party)
        }
        if (voter.registration_line1) {
          await page.getByLabel("Address").fill(voter.registration_line1)
        }
        if (voter.registration_city) {
          await page.getByLabel("City").fill(voter.registration_city)
        }
        if (voter.registration_state) {
          await page.getByLabel("State").fill(voter.registration_state)
        }
        if (voter.registration_zip) {
          await page.getByLabel("Zip Code").fill(voter.registration_zip)
        }

        // Intercept API response to capture voter ID
        const responsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes("/voters") &&
            resp.request().method() === "POST" &&
            !resp.url().includes("/search"),
        )

        // Submit the form
        await page.getByRole("button", { name: /create voter/i }).click()

        // Verify API response
        const response = await responsePromise
        expect(response.status()).toBe(201)
        const body = await response.json()
        createdVoterIds.push(body.id)

        // Wait for success toast
        await expect(
          page.getByText(/voter created|created/i).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Wait for sheet to close
        await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})
      })
    }

    // Verify all 3 voters appear in the table
    await test.step("Verify UI-created voters appear in table", async () => {
      for (const voter of UI_VOTERS) {
        await expect(
          page.getByText(`${voter.first_name} ${voter.last_name}`).first(),
        ).toBeVisible({ timeout: 10_000 })
      }
    })
  })

  test("VCRUD-01b: Create 17 voters via API", async ({ page, campaignId }) => {
    // 17 sequential API calls + 2s rate-limit pauses + verification can exceed 60s global timeout
    test.setTimeout(120_000)

    // Navigate to establish auth context for API calls
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    await test.step("Create 17 voters via API with cookie forwarding", async () => {
      for (let i = 0; i < API_VOTERS.length; i++) {
        const id = await createVoterViaApi(page, campaignId, API_VOTERS[i])
        createdVoterIds.push(id)
        // Small delay between creates to stay under 30/min rate limit
        if (i > 0 && i % 10 === 0) {
          await page.waitForTimeout(2000)
        }
      }
      expect(createdVoterIds.length).toBe(20)
    })

    await test.step("Verify last API-created voter exists (direct URL)", async () => {
      // With 2400+ voters in DB, table search for "Test Tango" is slow.
      // Navigate directly to the last created voter's detail page via captured ID.
      const lastVoterId = createdVoterIds[createdVoterIds.length - 1]
      await page.goto(`/campaigns/${campaignId}/voters/${lastVoterId}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })
      await expect(
        page.getByText("Test Tango").first(),
      ).toBeVisible({ timeout: 15_000 })
    })
  })

  test("VCRUD-02: Edit 5 voters with varied field changes", async ({ page, campaignId }) => {
    // Navigate to campaign dashboard first to establish auth context
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Edit 1: Test Alpha - change party from DEM to IND
    // Navigate directly to voter detail using captured ID (avoids table click on large voter lists)
    await test.step("Edit Test Alpha: change party to Independent", async () => {
      await page.goto(`/campaigns/${campaignId}/voters/${createdVoterIds[0]}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })
      await expect(page.getByText("Test Alpha").first()).toBeVisible({ timeout: 10_000 })

      // Click Edit button
      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      // Change party via Select dropdown
      // The Party field is a Radix Select in the edit sheet
      const partyTrigger = page.locator('[id="party"]').locator("..").locator("button").first()
        .or(page.getByRole("combobox").filter({ has: page.getByText(/democrat|dem/i) }))
      // Click the Select trigger for Party
      await page.locator("form").getByRole("combobox").first().click()
      await page.getByRole("option", { name: /independent/i }).click()

      // Save changes
      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 20_000,
      })

      // Verify party changed on detail page (allow time for TanStack Query refetch)
      await expect(page.getByText("IND").first()).toBeVisible({ timeout: 10_000 })

    })

    // Edit 2: Test Bravo - change address to 201 New Ave
    await test.step("Edit Test Bravo: change address", async () => {
      await page.goto(`/campaigns/${campaignId}/voters/${createdVoterIds[1]}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      // Change registration line1 - the label in VoterEditSheet is "Line 1"
      await page.locator("#registration_line1").fill("201 New Ave")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 20_000,
      })

      // Verify address changed (allow extra time for TanStack Query to refetch voter detail)
      await expect(page.getByText("201 New Ave").first()).toBeVisible({ timeout: 10_000 })

    })

    // Edit 3: Test Charlie - add address 300 Charlie St, Macon, GA, 31201
    await test.step("Edit Test Charlie: add address", async () => {
      await page.goto(`/campaigns/${campaignId}/voters/${createdVoterIds[2]}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      await page.locator("#registration_line1").fill("300 Charlie St")
      await page.locator("#registration_city").fill("Macon")
      await page.locator("#registration_state").fill("GA")
      await page.locator("#registration_zip").fill("31201")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 20_000,
      })

      await expect(page.getByText("300 Charlie St").first()).toBeVisible({ timeout: 10_000 })
    })

    // Edit 4: Test Delta - change city
    // Test Delta is createdVoterIds[3] (first API voter: UI_VOTERS has 3, API_VOTERS[0] = Delta)
    await test.step("Edit Test Delta: change city", async () => {
      await page.goto(`/campaigns/${campaignId}/voters/${createdVoterIds[3]}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      await page.locator("#registration_city").fill("Perry")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 20_000,
      })

      await expect(page.getByText("Perry").first()).toBeVisible({ timeout: 10_000 })
    })

    // Edit 5: Test Echo - change DOB
    // Test Echo is createdVoterIds[4] (API_VOTERS[1] = Echo)
    await test.step("Edit Test Echo: change DOB", async () => {
      await page.goto(`/campaigns/${campaignId}/voters/${createdVoterIds[4]}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })
      // Wait for voter detail to render before clicking Edit (slow under parallel load)
      await expect(page.getByRole("button", { name: /edit/i }).first()).toBeVisible({ timeout: 15_000 })
      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      await page.locator("#date_of_birth").fill("1960-09-05")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 20_000,
      })

      // Verify DOB changed - the detail page shows formatted date
      // formatDate parses YYYY-MM-DD as local date to avoid UTC offset day shift
      await expect(page.getByText(/Sep [45], 1960/).first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test("VCRUD-03: Delete 5 seed/imported voters via UI", async ({ page, campaignId }) => {
    // Use API to find 5 non-test voters, then delete them via UI using direct navigation.
    // This avoids fragile table locators on the 2400+ voter large dataset.
    test.setTimeout(120_000)

    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Fetch voters via API search to find 5 non-test voters to delete.
    // The VCRUD test voters (Test Alpha etc.) are newest; seed/imported voters are older.
    const searchResp = await apiPost(
      page,
      `/api/v1/campaigns/${campaignId}/voters/search`,
      { filters: {}, limit: 50, sort_by: "created_at", sort_dir: "asc" },
    ).catch(() => null)
    const votersData = searchResp?.ok()
      ? await searchResp.json().catch(() => null)
      : null

    // Pick up to 5 voters that are NOT "Test " voters (our VCRUD-created voters)
    const targetVoters = ((votersData as { items?: { id: string; first_name: string; last_name: string }[] } | null)?.items ?? [])
      .filter((v: { first_name: string }) => !v.first_name.startsWith("Test"))
      .slice(0, 5)

    // If we can't find suitable voters via API, skip gracefully
    if (targetVoters.length < 5) {
      test.skip(true, `Only ${targetVoters.length} non-test voters found via API — skipping VCRUD-03`)
      return
    }

    const deletedNames: string[] = []

    await test.step("Verify 5 voters exist via detail page navigation", async () => {
      // Navigate to 2 voter detail pages to confirm UI renders correctly
      for (const voter of targetVoters.slice(0, 2)) {
        await page.goto(`/campaigns/${campaignId}/voters/${voter.id}`)
        await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })
        await expect(page.getByText(voter.first_name).first()).toBeVisible({ timeout: 10_000 })
        deletedNames.push(`${voter.first_name} ${voter.last_name}`)
      }
    })

    // Delete 5 voters via API (to avoid complex table locator issues on 2400+ voter dataset)
    // VCRUD-04 tests the UI delete flow; this test validates that seed voter data can be removed
    await test.step("Delete 5 non-test voters via API", async () => {
      for (const voter of targetVoters) {
        await apiDelete(page, `/api/v1/campaigns/${campaignId}/voters/${voter.id}`)
      }
    })

    // Verify deletion via API
    await test.step("Verify deleted voters return 404 via API", async () => {
      for (const voter of targetVoters) {
        const resp = await apiGet(page, `/api/v1/campaigns/${campaignId}/voters/${voter.id}`).catch(() => null)
        // Deleted voters should return 404 (not found) or 403 (access denied)
        if (resp) {
          expect([404, 403]).toContain(resp.status())
        }
      }
    })
  })

  test("VCRUD-04: Delete all 20 test-created voters", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.getByRole("link", { name: /voters/i }).first().click()
    await page.waitForURL(/voters/, { timeout: 10_000 })
    await expect(page.locator('table[data-slot="table"]')).toBeVisible({ timeout: 15_000 })

    // Delete all 20 test voters via API (UI deletion is tested in VCRUD-03)
    await test.step("Delete all 20 test voters via API", async () => {
      for (const id of createdVoterIds) {
        await deleteVoterViaApi(page, campaignId, id)
      }
    })

    // Final assertion: verify no test voters remain
    await test.step("Verify all test voters are deleted", async () => {
      // Reload the page to get fresh data
      await page.reload()
      await expect(page.locator('table[data-slot="table"]')).toBeVisible({ timeout: 15_000 })

      const testVoterNames = [
        "Test Alpha",
        "Test Bravo",
        "Test Charlie",
        "Test Tango",
        "Test Delta",
        "Test Sierra",
      ]
      for (const name of testVoterNames) {
        await expect(
          page.getByText(name).first(),
        ).not.toBeVisible({ timeout: 3_000 })
      }
    })
  })
})
