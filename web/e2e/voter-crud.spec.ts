import { test, expect } from "@playwright/test"

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

async function navigateToSeedCampaign(
  page: import("@playwright/test").Page,
): Promise<string> {
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
  page: import("@playwright/test").Page,
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
  page: import("@playwright/test").Page,
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

  test("VCRUD-01a: Create 3 voters via UI form", async ({ page }) => {
    await test.step("Navigate to seed campaign", async () => {
      campaignId = await navigateToSeedCampaign(page)
      expect(campaignId).toBeTruthy()
    })

    await test.step("Navigate to voters page", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(
        page.getByRole("table").or(page.getByText(/no voters|all voters/i).first()),
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

        // Short pause for sheet to close and table to refresh
        await page.waitForTimeout(500)
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

  test("VCRUD-01b: Create 17 voters via API", async ({ page }) => {
    // Navigate to establish auth context for API calls
    await navigateToSeedCampaign(page)

    await test.step("Create 17 voters via API with cookie forwarding", async () => {
      for (const voter of API_VOTERS) {
        const id = await createVoterViaApi(page, campaignId, voter)
        createdVoterIds.push(id)
      }
      expect(createdVoterIds.length).toBe(20)
    })

    await test.step("Verify last API-created voter exists in the list", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

      // Search or scroll to find the last created voter
      await expect(
        page.getByText("Test Tango").first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("VCRUD-02: Edit 5 voters with varied field changes", async ({ page }) => {
    // Navigate to campaign
    await navigateToSeedCampaign(page)
    await page.getByRole("link", { name: /voters/i }).first().click()
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

    // Edit 1: Test Alpha - change party from DEM to IND
    await test.step("Edit Test Alpha: change party to Independent", async () => {
      await page.getByText("Test Alpha").first().click()
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
        timeout: 10_000,
      })

      // Verify party changed on detail page
      await expect(page.getByText("IND").first()).toBeVisible({ timeout: 5_000 })

      // Navigate back to voters list
      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })

    // Edit 2: Test Bravo - change address to 201 New Ave
    await test.step("Edit Test Bravo: change address", async () => {
      await page.getByText("Test Bravo").first().click()
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      // Change registration line1 - the label in VoterEditSheet is "Line 1"
      await page.locator("#registration_line1").fill("201 New Ave")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 10_000,
      })

      // Verify address changed
      await expect(page.getByText("201 New Ave").first()).toBeVisible({ timeout: 5_000 })

      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })

    // Edit 3: Test Charlie - add address 300 Charlie St, Macon, GA, 31201
    await test.step("Edit Test Charlie: add address", async () => {
      await page.getByText("Test Charlie").first().click()
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      await page.locator("#registration_line1").fill("300 Charlie St")
      await page.locator("#registration_city").fill("Macon")
      await page.locator("#registration_state").fill("GA")
      await page.locator("#registration_zip").fill("31201")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 10_000,
      })

      await expect(page.getByText("300 Charlie St").first()).toBeVisible({ timeout: 5_000 })

      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })

    // Edit 4: Test Delta - change city to Warner Robins -> already Warner Robins, change to Macon
    await test.step("Edit Test Delta: change city", async () => {
      await page.getByText("Test Delta").first().click()
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      await page.locator("#registration_city").fill("Perry")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 10_000,
      })

      await expect(page.getByText("Perry").first()).toBeVisible({ timeout: 5_000 })

      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })

    // Edit 5: Test Echo - change DOB
    await test.step("Edit Test Echo: change DOB", async () => {
      await page.getByText("Test Echo").first().click()
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      await page.getByRole("button", { name: /edit/i }).first().click()
      await expect(page.getByText(/edit voter/i).first()).toBeVisible({ timeout: 5_000 })

      await page.locator("#date_of_birth").fill("1960-09-05")

      await page.getByRole("button", { name: /save changes/i }).click()
      await expect(page.getByText(/voter updated|updated/i).first()).toBeVisible({
        timeout: 10_000,
      })

      // Verify DOB changed - the detail page shows formatted date
      await expect(page.getByText(/Sep 5, 1960/).first()).toBeVisible({ timeout: 5_000 })

      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })
  })

  test("VCRUD-03: Delete 5 seed/imported voters via UI", async ({ page }) => {
    await navigateToSeedCampaign(page)
    await page.getByRole("link", { name: /voters/i }).first().click()
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

    // We'll delete 5 seed voters by clicking through rows visible in the table.
    // The seed data has 50 Macon-Bibb County voters. We pick ones we can find.
    // We'll target the first 5 non-test voters visible in the table.
    const seedVotersDeleted: string[] = []

    await test.step("Delete 5 seed voters via row action menu", async () => {
      for (let i = 0; i < 5; i++) {
        // Find a row that does NOT contain "Test " (our test voters)
        // Get all action buttons in the table
        const actionButtons = page.locator(
          'table tbody tr:not(:has-text("Test Alpha")):not(:has-text("Test Bravo")):not(:has-text("Test Charlie")):not(:has-text("Test Delta")):not(:has-text("Test Echo")) button[aria-label="Open voter actions"]',
        )

        // Click the first available action button
        const btn = actionButtons.first()
        await expect(btn).toBeVisible({ timeout: 10_000 })

        // Get the voter name from the row for confirmation
        const row = btn.locator("ancestor::tr").first()
          .or(page.locator("table tbody tr").filter({ has: btn }).first())
        const nameLink = row.locator("a").first()
        const voterName = (await nameLink.textContent()) ?? ""
        seedVotersDeleted.push(voterName)

        // Click action menu
        await btn.click()
        await page.getByRole("menuitem", { name: /delete/i }).click()

        // Fill confirmation dialog
        const confirmInput = page.getByTestId("destructive-confirm-input")
        await expect(confirmInput).toBeVisible({ timeout: 5_000 })
        await confirmInput.fill(voterName)

        // Click Delete button in dialog
        await page
          .getByRole("button", { name: /^delete$/i })
          .click()

        // Wait for success - the delete mutation triggers a toast
        await expect(
          page.getByText(/deleted|removed|success/i).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Wait for table to refresh
        await page.waitForTimeout(500)
      }
    })

    // Verify deleted seed voters no longer appear
    await test.step("Verify deleted seed voters are gone", async () => {
      for (const name of seedVotersDeleted) {
        if (name) {
          // Reload the voters page to get fresh data
          await page.getByRole("link", { name: /voters/i }).first().click()
          await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

          // Verify the voter is no longer in the table (checking first page)
          const voterLink = page.getByRole("link", { name: name }).first()
          await expect(voterLink).not.toBeVisible({ timeout: 3_000 })
        }
      }
    })
  })

  test("VCRUD-04: Delete all 20 test-created voters", async ({ page }) => {
    await navigateToSeedCampaign(page)
    await page.getByRole("link", { name: /voters/i }).first().click()
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

    // Delete 3 test voters via UI to prove UI deletion works on test data
    const uiDeleteVoters = ["Test Alpha", "Test Bravo", "Test Charlie"]
    await test.step("Delete 3 test voters via UI row action menu", async () => {
      for (const voterName of uiDeleteVoters) {
        // Find the row with this voter
        const voterRow = page.getByRole("row").filter({ hasText: voterName })
        const actionBtn = voterRow.getByRole("button", {
          name: /open voter actions/i,
        })
        await expect(actionBtn).toBeVisible({ timeout: 10_000 })
        await actionBtn.click()

        await page.getByRole("menuitem", { name: /delete/i }).click()

        // Fill confirmation -- confirmText is the voter's full name
        const confirmInput = page.getByTestId("destructive-confirm-input")
        await expect(confirmInput).toBeVisible({ timeout: 5_000 })
        await confirmInput.fill(voterName)

        await page.getByRole("button", { name: /^delete$/i }).click()

        await expect(
          page.getByText(/deleted|removed|success/i).first(),
        ).toBeVisible({ timeout: 10_000 })

        await page.waitForTimeout(500)
      }
    })

    // Delete remaining 17 test voters via API for speed
    await test.step("Delete remaining 17 test voters via API", async () => {
      // createdVoterIds[0..2] were the 3 UI voters (already deleted above)
      // createdVoterIds[3..19] are the 17 API voters
      const remainingIds = createdVoterIds.slice(3)
      for (const id of remainingIds) {
        await deleteVoterViaApi(page, campaignId, id)
      }
    })

    // Final assertion: verify no test voters remain
    await test.step("Verify all test voters are deleted", async () => {
      // Reload the page to get fresh data
      await page.reload()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

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
