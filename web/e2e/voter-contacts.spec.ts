import { test, expect } from "@playwright/test"

/**
 * Voter Contacts E2E Spec
 *
 * Validates voter contact CRUD across 20 purpose-created test voters:
 * phone numbers, email addresses, and mailing addresses.
 *
 * Covers: CON-01 through CON-05
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 *
 * Self-contained: creates its own 20 test voters (no dependency on voter-crud.spec.ts)
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

/**
 * Navigate to a voter's detail page by their ID
 */
async function navigateToVoterDetail(
  page: import("@playwright/test").Page,
  campaignId: string,
  voterId: string,
): Promise<void> {
  await page.goto(`/campaigns/${campaignId}/voters/${voterId}`)
  await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })
  // Wait for the voter detail to load
  await expect(
    page.getByRole("tab", { name: /overview/i }),
  ).toBeVisible({ timeout: 10_000 })
}

// ── NATO Alphabet Voter Names ─────────────────────────────────────────────────

const NATO_NAMES = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliet",
  "Kilo",
  "Lima",
  "Mike",
  "November",
  "Oscar",
  "Papa",
  "Quebec",
  "Romeo",
  "Sierra",
  "Tango",
]

const PHONE_TYPES = ["mobile", "home", "work"]

// ── Serial Test Suite ─────────────────────────────────────────────────────────

test.describe.serial("Voter contacts CRUD", () => {
  let campaignId = ""
  let testVoterIds: string[] = []
  let testVoterNames: string[] = []

  test.setTimeout(180_000)

  test("Setup: Create 20 test voters for contact operations", async ({
    page,
  }) => {
    await test.step("Navigate to seed campaign", async () => {
      campaignId = await navigateToSeedCampaign(page)
      expect(campaignId).toBeTruthy()
    })

    await test.step("Create 20 voters via API", async () => {
      for (let i = 0; i < NATO_NAMES.length; i++) {
        const name = NATO_NAMES[i]
        const id = await createVoterViaApi(page, campaignId, {
          first_name: "Contact",
          last_name: name,
          date_of_birth: "1990-01-15",
        })
        testVoterIds.push(id)
        testVoterNames.push(`Contact ${name}`)
      }
      expect(testVoterIds.length).toBe(20)
    })

    await test.step("Verify last voter exists in the list", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByText("Contact Tango").first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("CON-01: Add phone numbers to 20 voters", async ({ page }) => {
    // Navigate to establish context
    await navigateToSeedCampaign(page)

    for (let i = 0; i < 20; i++) {
      await test.step(`Add phone to Contact ${NATO_NAMES[i]}`, async () => {
        await navigateToVoterDetail(page, campaignId, testVoterIds[i])

        // Click Contacts tab and wait for panel
        await page.getByRole("tab", { name: /contacts/i }).click()
        await expect(page.getByRole("tabpanel")).toBeVisible()

        // Click "Add phone" button
        await page
          .getByRole("button", { name: /add phone/i })
          .first()
          .click()

        // Fill phone number with unique last 4 digits
        const phoneNum = `478-555-${String(i + 1).padStart(4, "0")}`
        await page.locator("#phone-value").fill(phoneNum)

        // Select phone type (cycle through mobile, home, work)
        const phoneType = PHONE_TYPES[i % 3]
        await page.locator("#phone-type").locator("..").locator("button").first().click()
        await page.getByRole("option", { name: new RegExp(`^${phoneType}$`, "i") }).click()

        // Save
        await page.getByRole("button", { name: /^save$/i }).first().click()

        // Verify phone appears
        await expect(
          page.getByText(phoneNum).first(),
        ).toBeVisible({ timeout: 10_000 })
      })
    }

    // Add a second phone to Contact Alpha to test multiple contacts
    await test.step("Add second phone to Contact Alpha", async () => {
      await navigateToVoterDetail(page, campaignId, testVoterIds[0])
      await page.getByRole("tab", { name: /contacts/i }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()

      await page
        .getByRole("button", { name: /add phone/i })
        .first()
        .click()

      await page.locator("#phone-value").fill("478-555-9000")

      // Select work type
      await page.locator("#phone-type").locator("..").locator("button").first().click()
      await page.getByRole("option", { name: /^work$/i }).click()

      await page.getByRole("button", { name: /^save$/i }).first().click()
      await expect(
        page.getByText("478-555-9000").first(),
      ).toBeVisible({ timeout: 10_000 })

      // Verify both phones are listed
      await expect(page.getByText("478-555-0001").first()).toBeVisible()
    })
  })

  test("CON-02: Add email addresses to 10 voters", async ({ page }) => {
    await navigateToSeedCampaign(page)

    // Add emails to Contact Alpha through Contact Juliet (first 10)
    for (let i = 0; i < 10; i++) {
      await test.step(`Add email to Contact ${NATO_NAMES[i]}`, async () => {
        await navigateToVoterDetail(page, campaignId, testVoterIds[i])

        await page.getByRole("tab", { name: /contacts/i }).click()
        await expect(page.getByRole("tabpanel")).toBeVisible()

        // Click "Add email" button
        await page
          .getByRole("button", { name: /add email/i })
          .first()
          .click()

        const email = `contact-${NATO_NAMES[i].toLowerCase()}@test.com`
        await page.locator("#email-value").fill(email)

        // Email type defaults to "personal" which is fine; vary some
        if (i % 3 === 1) {
          await page.locator("#email-type").locator("..").locator("button").first().click()
          await page.getByRole("option", { name: /^work$/i }).click()
        }

        await page.getByRole("button", { name: /^save$/i }).first().click()

        // Verify email appears
        await expect(
          page.getByText(email).first(),
        ).toBeVisible({ timeout: 10_000 })
      })
    }
  })

  test("CON-03: Add mailing addresses to 5 voters", async ({ page }) => {
    await navigateToSeedCampaign(page)

    const addresses = [
      {
        line1: "100 Alpha Rd",
        city: "Macon",
        state: "GA",
        zip: "31201",
      },
      {
        line1: "200 Bravo St",
        city: "Atlanta",
        state: "GA",
        zip: "30301",
      },
      {
        line1: "300 Charlie Ave",
        city: "Savannah",
        state: "GA",
        zip: "31401",
      },
      {
        line1: "400 Delta Blvd",
        city: "Augusta",
        state: "GA",
        zip: "30901",
      },
      {
        line1: "500 Echo Dr",
        city: "Columbus",
        state: "GA",
        zip: "31901",
      },
    ]

    // Add addresses to Contact Alpha through Contact Echo (first 5)
    for (let i = 0; i < 5; i++) {
      await test.step(`Add address to Contact ${NATO_NAMES[i]}`, async () => {
        await navigateToVoterDetail(page, campaignId, testVoterIds[i])

        await page.getByRole("tab", { name: /contacts/i }).click()
        await expect(page.getByRole("tabpanel")).toBeVisible()

        // Click "Add address" button
        await page
          .getByRole("button", { name: /add address/i })
          .first()
          .click()

        // Fill address fields
        await page.locator("#addr-line1").fill(addresses[i].line1)
        await page.locator("#addr-city").fill(addresses[i].city)
        await page.locator("#addr-state").fill(addresses[i].state)
        await page.locator("#addr-zip").fill(addresses[i].zip)

        await page.getByRole("button", { name: /^save$/i }).first().click()

        // Verify address appears (the component formats as "line1 city, state zip")
        await expect(
          page.getByText(addresses[i].line1).first(),
        ).toBeVisible({ timeout: 10_000 })
      })
    }
  })

  test("CON-04: Edit contacts", async ({ page }) => {
    await navigateToSeedCampaign(page)

    // Edit Contact Alpha's phone number
    await test.step("Edit Contact Alpha phone: change to 478-555-9999", async () => {
      await navigateToVoterDetail(page, campaignId, testVoterIds[0])
      await page.getByRole("tab", { name: /contacts/i }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()

      // Click edit (pencil) button on the first phone
      const editBtn = page
        .getByRole("button", { name: /edit phone/i })
        .first()
      await editBtn.click()

      // Clear and fill new phone number in the inline edit form
      await page.locator("#phone-value").fill("478-555-9999")

      await page.getByRole("button", { name: /^save$/i }).first().click()

      // Verify new phone number appears
      await expect(
        page.getByText("478-555-9999").first(),
      ).toBeVisible({ timeout: 10_000 })
    })

    // Edit Contact Bravo's email
    await test.step("Edit Contact Bravo email: change to bravo-updated@test.com", async () => {
      await navigateToVoterDetail(page, campaignId, testVoterIds[1])
      await page.getByRole("tab", { name: /contacts/i }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()

      // Click edit button on the email
      const editBtn = page
        .getByRole("button", { name: /edit email/i })
        .first()
      await editBtn.click()

      await page.locator("#email-value").fill("bravo-updated@test.com")

      await page.getByRole("button", { name: /^save$/i }).first().click()

      // Verify new email appears
      await expect(
        page.getByText("bravo-updated@test.com").first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("CON-05: Delete contacts", async ({ page }) => {
    await navigateToSeedCampaign(page)

    // Delete Contact Alpha's edited phone
    await test.step("Delete Contact Alpha phone", async () => {
      await navigateToVoterDetail(page, campaignId, testVoterIds[0])
      await page.getByRole("tab", { name: /contacts/i }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()

      // Click delete button on the first phone (the edited 478-555-9999)
      const deleteBtn = page
        .getByRole("button", { name: /delete phone/i })
        .first()
      await deleteBtn.click()

      // Confirm deletion -- the DestructiveConfirmDialog for contacts uses confirmText="remove"
      const confirmInput = page.getByTestId("destructive-confirm-input")
      await expect(confirmInput).toBeVisible({ timeout: 5_000 })
      await confirmInput.fill("remove")

      await page.getByRole("button", { name: /^remove$/i }).click()

      // Verify phone removed toast
      await expect(
        page.getByText(/phone removed|removed/i).first(),
      ).toBeVisible({ timeout: 10_000 })

      // Verify the phone number no longer shows
      await expect(
        page.getByText("478-555-9999"),
      ).not.toBeVisible({ timeout: 3_000 })
    })

    // Delete Contact Bravo's email
    await test.step("Delete Contact Bravo email", async () => {
      await navigateToVoterDetail(page, campaignId, testVoterIds[1])
      await page.getByRole("tab", { name: /contacts/i }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()

      // Click delete button on the email
      const deleteBtn = page
        .getByRole("button", { name: /delete email/i })
        .first()
      await deleteBtn.click()

      const confirmInput = page.getByTestId("destructive-confirm-input")
      await expect(confirmInput).toBeVisible({ timeout: 5_000 })
      await confirmInput.fill("remove")

      await page.getByRole("button", { name: /^remove$/i }).click()

      await expect(
        page.getByText(/email removed|removed/i).first(),
      ).toBeVisible({ timeout: 10_000 })

      await expect(
        page.getByText("bravo-updated@test.com"),
      ).not.toBeVisible({ timeout: 3_000 })
    })
  })

  test("Final: Verify all test voters can be deleted (lifecycle assertion)", async ({
    page,
  }) => {
    await navigateToSeedCampaign(page)
    await page.getByRole("link", { name: /voters/i }).first().click()
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

    // Delete 2 test voters via UI to prove UI deletion works
    await test.step("Delete 2 test voters via UI", async () => {
      for (let i = 0; i < 2; i++) {
        const voterName = testVoterNames[i] // "Contact Alpha", "Contact Bravo"
        const voterRow = page.getByRole("row").filter({ hasText: voterName })
        const actionBtn = voterRow.getByRole("button", {
          name: /open voter actions/i,
        })
        await expect(actionBtn).toBeVisible({ timeout: 10_000 })
        await actionBtn.click()

        await page.getByRole("menuitem", { name: /delete/i }).click()

        const confirmInput = page.getByTestId("destructive-confirm-input")
        await expect(confirmInput).toBeVisible({ timeout: 5_000 })
        await confirmInput.fill(voterName)

        await page.getByRole("button", { name: /^delete$/i }).click()

        await expect(
          page.getByText(/deleted|removed|success/i).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Wait for navigation back to voter list after deletion
        await page.waitForURL(/voters/, { timeout: 5_000 }).catch(() => {})
      }
    })

    // Delete remaining 18 test voters via API for speed
    await test.step("Delete remaining 18 test voters via API", async () => {
      const remainingIds = testVoterIds.slice(2)
      for (const id of remainingIds) {
        await deleteVoterViaApi(page, campaignId, id)
      }
    })

    // Final verification
    await test.step("Verify no test voters remain", async () => {
      await page.reload()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

      // Check several representative names
      for (const name of [
        "Contact Alpha",
        "Contact Bravo",
        "Contact Tango",
        "Contact Juliet",
      ]) {
        await expect(
          page.getByText(name).first(),
        ).not.toBeVisible({ timeout: 3_000 })
      }
    })
  })
})
