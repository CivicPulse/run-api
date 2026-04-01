import { test, expect } from "./fixtures"
import { apiPost, apiDelete } from "./helpers"

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

async function createVoterViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const url = `/api/v1/campaigns/${campaignId}/voters`
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const resp = await apiPost(page, url, data)
      if (resp.ok()) return (await resp.json()).id
      if ((resp.status() === 429 || resp.status() >= 500) && attempt < 7) {
        await page.waitForTimeout(2000 * (attempt + 1))
        continue
      }
      throw new Error(`POST ${url} failed: ${resp.status()} — ${await resp.text()}`)
    } catch (err) {
      // Retry on network timeouts and transient errors
      if (attempt < 7 && err instanceof Error && (err.message.includes("Timeout") || err.message.includes("ERR_"))) {
        await page.waitForTimeout(3000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
  throw new Error(`POST ${url} failed after 8 retries`)
}

async function deleteVoterViaApi(
  page: import("@playwright/test").Page,
  campaignId: string,
  voterId: string,
): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/voters/${voterId}`)
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
  // Retry navigation up to 3 times to handle transient ERR_ABORTED from the dev server
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`/campaigns/${campaignId}/voters/${voterId}`)
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })
      // Wait for the voter detail to load — tabs only appear after skeleton clears
      await expect(
        page.getByRole("tab", { name: /overview/i }),
      ).toBeVisible({ timeout: 20_000 })
      return
    } catch (err) {
      if (attempt < 2) {
        await page.waitForTimeout(1000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
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

  test.setTimeout(360_000)

  test("Setup: Create 20 test voters for contact operations", async ({
    page,
    campaignId: cid,
  }) => {
    campaignId = cid
    await test.step("Navigate to seed campaign", async () => {
      await page.goto(`/campaigns/${campaignId}/dashboard`)
      await page.waitForURL(/campaigns\//, { timeout: 10_000 })
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
        // Small delay between creates to stay under 30/min rate limit
        if (i > 0 && i % 10 === 0) {
          await page.waitForTimeout(2000)
        }
      }
      expect(testVoterIds.length).toBe(20)
    })

    await test.step("Verify last voter exists in the list", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      await page.waitForURL(/voters/, { timeout: 10_000 })
      await expect(page.locator('table[data-slot="table"]')).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByText("Contact Tango").first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test("CON-01: Add phone numbers to 20 voters", async ({ page, campaignId }) => {
    // Navigate to establish context
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    for (let i = 0; i < 20; i++) {
      await test.step(`Add phone to Contact ${NATO_NAMES[i]}`, async () => {
        const phoneNum = `478-555-${String(i + 1).padStart(4, "0")}`
        const phoneType = PHONE_TYPES[i % 3]

        // Retry the full voter navigation + form submission if anything fails (e.g., OIDC session drop)
        for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
          try {
            await navigateToVoterDetail(page, campaignId, testVoterIds[i])
            const contactsTab = page.getByRole("tab", { name: /contacts/i })
            await contactsTab.click()
            await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
            await expect(page.getByRole("button", { name: /add phone/i }).first()).toBeVisible({ timeout: 30_000 })

            // Check if the phone was already added in a previous attempt
            const alreadyAdded = await page.getByText(phoneNum).first().isVisible().catch(() => false)
            if (alreadyAdded) break

            // Click "Add phone" button
            await page
              .getByRole("button", { name: /add phone/i })
              .first()
              .click()

            // Wait for the form to be visible and any background fetch to settle
            await expect(page.locator("#phone-value")).toBeVisible({ timeout: 5_000 })
            // Small wait for any in-flight TanStack Query fetch that could re-render the form
            await page.waitForTimeout(500)

            // Fill phone number
            await page.locator("#phone-value").fill(phoneNum)

            // Select phone type (cycle through mobile, home, work)
            // mobile is the default — only interact with the Select when changing to home/work
            if (phoneType !== "mobile") {
              for (let selectAttempt = 0; selectAttempt < 3; selectAttempt++) {
                try {
                  // Close any residual open dropdown first
                  await page.keyboard.press("Escape")
                  await page.waitForTimeout(200)
                  const selectTrigger = page.locator("#phone-type")
                  await expect(selectTrigger).toBeVisible({ timeout: 5_000 })
                  await selectTrigger.click()
                  // Wait for options to appear
                  const option = page.getByRole("option", { name: new RegExp(`^${phoneType}$`, "i") })
                  await expect(option).toBeVisible({ timeout: 5_000 })
                  await option.click()
                  // Verify selection was registered by checking SelectValue text
                  await expect(selectTrigger).toContainText(phoneType, { timeout: 3_000 })
                  break
                } catch {
                  if (selectAttempt < 2) {
                    await page.keyboard.press("Escape")
                    await page.waitForTimeout(500)
                    continue
                  }
                  // All select attempts exhausted — throw to trigger navAttempt retry
                  throw new Error(`Failed to select phone type "${phoneType}" after 3 attempts`)
                }
              }
              // Wait for re-render after select change before submitting
              await page.waitForTimeout(200)
            }

            // Save — wait for the save button to be stable before clicking
            const saveBtn = page.getByRole("button", { name: /^save$/i }).first()
            await expect(saveBtn).toBeVisible({ timeout: 5_000 })
            await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
            await saveBtn.click()

            // Wait for the phone number to appear in the contact list (primary success signal)
            await expect(
              page.getByText(phoneNum).first(),
            ).toBeVisible({ timeout: 15_000 })

            break // success — exit navAttempt loop
          } catch (err) {
            if (navAttempt < 2) {
              // Page might have lost auth — reload to re-initialize OIDC
              await page.keyboard.press("Escape").catch(() => {})
              await page.reload()
              await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
              await page.waitForTimeout(1000)
              continue
            }
            throw err
          }
        }
      })
    }

    // Add a second phone to Contact Alpha to test multiple contacts
    await test.step("Add second phone to Contact Alpha", async () => {
      await navigateToVoterDetail(page, campaignId, testVoterIds[0])
      await page.getByRole("tab", { name: /contacts/i }).click()
      await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 10_000 })

      await page
        .getByRole("button", { name: /add phone/i })
        .first()
        .click()

      await page.locator("#phone-value").fill("478-555-9000")

      // Select work type — use retry with keyboard-safe click for Radix Select
      for (let selectAttempt = 0; selectAttempt < 3; selectAttempt++) {
        try {
          await page.keyboard.press("Escape")
          await page.waitForTimeout(200)
          await page.locator("#phone-type").click()
          const workOption = page.getByRole("option", { name: /^work$/i })
          await expect(workOption).toBeVisible({ timeout: 5_000 })
          await workOption.click()
          await expect(page.locator("#phone-type")).toContainText("work", { timeout: 3_000 })
          break
        } catch {
          if (selectAttempt < 2) {
            await page.keyboard.press("Escape")
            await page.waitForTimeout(500)
            continue
          }
        }
      }

      await page.getByRole("button", { name: /^save$/i }).first().click()
      await expect(
        page.getByText("478-555-9000").first(),
      ).toBeVisible({ timeout: 10_000 })

      // Verify both phones are listed
      await expect(page.getByText("478-555-0001").first()).toBeVisible()
    })
  })

  test("CON-02: Add email addresses to 10 voters", async ({ page, campaignId }) => {
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Add emails to Contact Alpha through Contact Juliet (first 10)
    for (let i = 0; i < 10; i++) {
      await test.step(`Add email to Contact ${NATO_NAMES[i]}`, async () => {
        const email = `contact-${NATO_NAMES[i].toLowerCase()}@test.com`

        // Retry the full navigation + form submission to handle OIDC session drops
        for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
          try {
            await navigateToVoterDetail(page, campaignId, testVoterIds[i])
            const contactsTab = page.getByRole("tab", { name: /contacts/i })
            await contactsTab.click()
            await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
            await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 20_000 })

            // Check if already added in a previous attempt
            const alreadyAdded = await page.getByText(email).first().isVisible().catch(() => false)
            if (alreadyAdded) break

            // Click "Add email" button
            await page
              .getByRole("button", { name: /add email/i })
              .first()
              .click()

            await expect(page.locator("#email-value")).toBeVisible({ timeout: 5_000 })
            await page.locator("#email-value").fill(email)

            // Email type defaults to "personal"; vary to "work" for every 3rd voter
            if (i % 3 === 1) {
              for (let selectAttempt = 0; selectAttempt < 3; selectAttempt++) {
                try {
                  await page.keyboard.press("Escape")
                  await page.waitForTimeout(200)
                  await page.locator("#email-type").click()
                  const workEmailOption = page.getByRole("option", { name: /^work$/i })
                  await expect(workEmailOption).toBeVisible({ timeout: 5_000 })
                  await workEmailOption.click()
                  await expect(page.locator("#email-type")).toContainText("work", { timeout: 3_000 })
                  break
                } catch {
                  if (selectAttempt < 2) {
                    await page.keyboard.press("Escape")
                    await page.waitForTimeout(500)
                    continue
                  }
                  throw new Error(`Failed to select email type "work" after 3 attempts`)
                }
              }
            }

            // Dismiss any open dropdown before submitting
            await page.keyboard.press("Escape").catch(() => {})
            await page.waitForTimeout(100)

            const saveBtn = page.getByRole("button", { name: /^save$/i }).first()
            await expect(saveBtn).toBeVisible({ timeout: 5_000 })
            await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
            await saveBtn.click()

            // Verify email appears in the contact list
            await expect(
              page.getByText(email).first(),
            ).toBeVisible({ timeout: 10_000 })

            break // success
          } catch (err) {
            if (navAttempt < 2) {
              await page.keyboard.press("Escape").catch(() => {})
              await page.reload()
              await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
              await page.waitForTimeout(1000)
              continue
            }
            throw err
          }
        }
      })
    }
  })

  test("CON-03: Add mailing addresses to 5 voters", async ({ page, campaignId }) => {
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

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
        const addr = addresses[i]

        // Retry the full navigation + form submission to handle OIDC session drops
        for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
          try {
            await navigateToVoterDetail(page, campaignId, testVoterIds[i])
            const contactsTab = page.getByRole("tab", { name: /contacts/i })
            await contactsTab.click()
            await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
            await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 20_000 })

            // Check if already added in a previous attempt
            const alreadyAdded = await page.getByText(addr.line1).first().isVisible().catch(() => false)
            if (alreadyAdded) break

            // Click "Add address" button
            await page
              .getByRole("button", { name: /add address/i })
              .first()
              .click()

            // Fill address fields
            await expect(page.locator("#addr-line1")).toBeVisible({ timeout: 5_000 })
            await page.locator("#addr-line1").fill(addr.line1)
            await page.locator("#addr-city").fill(addr.city)
            await page.locator("#addr-state").fill(addr.state)
            await page.locator("#addr-zip").fill(addr.zip)

            const saveBtn = page.getByRole("button", { name: /^save$/i }).first()
            await expect(saveBtn).toBeVisible({ timeout: 5_000 })
            await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
            await saveBtn.click()

            // Verify address appears
            await expect(
              page.getByText(addr.line1).first(),
            ).toBeVisible({ timeout: 10_000 })

            break // success
          } catch (err) {
            if (navAttempt < 2) {
              await page.reload()
              await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
              await page.waitForTimeout(1000)
              continue
            }
            throw err
          }
        }
      })
    }
  })

  test("CON-04: Edit contacts", async ({ page, campaignId }) => {
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Edit Contact Alpha's phone number
    await test.step("Edit Contact Alpha phone: change to 478-555-9999", async () => {
      for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
        try {
          await navigateToVoterDetail(page, campaignId, testVoterIds[0])
          const contactsTab = page.getByRole("tab", { name: /contacts/i })
          await contactsTab.click()
          await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
          await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 20_000 })

          // Check if already edited
          const alreadyEdited = await page.getByText("478-555-9999").first().isVisible().catch(() => false)
          if (alreadyEdited) break

          // Click edit (pencil) button on the first phone
          const editBtn = page.getByRole("button", { name: /edit phone/i }).first()
          await editBtn.click()

          // Clear and fill new phone number in the inline edit form
          await expect(page.locator("#phone-value")).toBeVisible({ timeout: 5_000 })
          await page.locator("#phone-value").fill("478-555-9999")

          const saveBtn = page.getByRole("button", { name: /^save$/i }).first()
          await expect(saveBtn).toBeVisible({ timeout: 5_000 })
          await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
          await saveBtn.click()

          // Verify new phone number appears
          await expect(page.getByText("478-555-9999").first()).toBeVisible({ timeout: 10_000 })
          break // success
        } catch (err) {
          if (navAttempt < 2) {
            await page.reload()
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
            await page.waitForTimeout(1000)
            continue
          }
          throw err
        }
      }
    })

    // Edit Contact Bravo's email
    await test.step("Edit Contact Bravo email: change to bravo-updated@test.com", async () => {
      for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
        try {
          await navigateToVoterDetail(page, campaignId, testVoterIds[1])
          const contactsTab = page.getByRole("tab", { name: /contacts/i })
          await contactsTab.click()
          await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
          await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 20_000 })

          // Check if already edited
          const alreadyEdited = await page.getByText("bravo-updated@test.com").first().isVisible().catch(() => false)
          if (alreadyEdited) break

          // Click edit button on the email
          const editBtn = page.getByRole("button", { name: /edit email/i }).first()
          await editBtn.click()

          await expect(page.locator("#email-value")).toBeVisible({ timeout: 5_000 })
          await page.locator("#email-value").fill("bravo-updated@test.com")

          const saveBtn = page.getByRole("button", { name: /^save$/i }).first()
          await expect(saveBtn).toBeVisible({ timeout: 5_000 })
          await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
          await saveBtn.click()

          // Verify new email appears
          await expect(page.getByText("bravo-updated@test.com").first()).toBeVisible({ timeout: 10_000 })
          break // success
        } catch (err) {
          if (navAttempt < 2) {
            await page.reload()
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
            await page.waitForTimeout(1000)
            continue
          }
          throw err
        }
      }
    })
  })

  test("CON-05: Delete contacts", async ({ page, campaignId }) => {
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Delete Contact Alpha's edited phone
    await test.step("Delete Contact Alpha phone", async () => {
      for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
        try {
          await navigateToVoterDetail(page, campaignId, testVoterIds[0])
          const contactsTab = page.getByRole("tab", { name: /contacts/i })
          await contactsTab.click()
          await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
          await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 20_000 })

          // Check if already deleted
          const alreadyDeleted = !(await page.getByText("478-555-9999").first().isVisible().catch(() => false))
          if (alreadyDeleted) break

          // Wait for the edited phone to appear, then click its delete button
          await expect(page.getByText("478-555-9999").first()).toBeVisible({ timeout: 10_000 })
          const phoneEntry = page.locator("div").filter({ hasText: /^478-555-9999/ }).first()
          // Use .first() to avoid strict mode violation when UI renders mobile+desktop
          // versions of the delete button simultaneously in different display states
          const deleteBtn = phoneEntry.getByRole("button", { name: /delete phone/i }).first()
          await deleteBtn.click()

          // Confirm deletion
          const confirmInput = page.getByTestId("destructive-confirm-input")
          await expect(confirmInput).toBeVisible({ timeout: 5_000 })
          await expect(confirmInput).toBeEnabled({ timeout: 5_000 })
          await confirmInput.click()
          await confirmInput.fill("remove")
          await expect(confirmInput).toHaveValue("remove", { timeout: 3_000 })

          await page.getByRole("button", { name: /^remove$/i }).click()

          await expect(
            page.getByText(/phone removed|removed/i).first(),
          ).toBeVisible({ timeout: 10_000 })
          await expect(page.getByText("478-555-9999")).not.toBeVisible({ timeout: 10_000 })
          break // success
        } catch (err) {
          if (navAttempt < 2) {
            await page.reload()
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
            await page.waitForTimeout(1000)
            continue
          }
          throw err
        }
      }
    })

    // Delete Contact Bravo's email
    await test.step("Delete Contact Bravo email", async () => {
      for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
        try {
          await navigateToVoterDetail(page, campaignId, testVoterIds[1])
          const contactsTab = page.getByRole("tab", { name: /contacts/i })
          await contactsTab.click()
          await expect(contactsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 })
          await expect(page.getByRole("heading", { name: "Phone Numbers", exact: true })).toBeVisible({ timeout: 20_000 })

          // Check if already deleted
          const alreadyDeleted = !(await page.getByText("bravo-updated@test.com").first().isVisible().catch(() => false))
          if (alreadyDeleted) break

          const deleteBtn = page.getByRole("button", { name: /delete email/i }).first()
          await deleteBtn.click()

          const confirmInput = page.getByTestId("destructive-confirm-input")
          await expect(confirmInput).toBeVisible({ timeout: 5_000 })
          await expect(confirmInput).toBeEnabled({ timeout: 5_000 })
          await confirmInput.click()
          await confirmInput.fill("remove")
          await expect(confirmInput).toHaveValue("remove", { timeout: 3_000 })

          await page.getByRole("button", { name: /^remove$/i }).click()

          await expect(
            page.getByText(/email removed|removed/i).first(),
          ).toBeVisible({ timeout: 10_000 })
          await expect(page.getByText("bravo-updated@test.com")).not.toBeVisible({ timeout: 10_000 })
          break // success
        } catch (err) {
          if (navAttempt < 2) {
            await page.reload()
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
            await page.waitForTimeout(1000)
            continue
          }
          throw err
        }
      }
    })
  })

  test("Final: Verify all test voters can be deleted (lifecycle assertion)", async ({
    page,
  }) => {
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.getByRole("link", { name: /voters/i }).first().click()
    await page.waitForURL(/voters/, { timeout: 10_000 })
    await expect(page.locator('table[data-slot="table"]')).toBeVisible({ timeout: 15_000 })

    // Delete 2 test voters via UI to prove UI deletion works
    await test.step("Delete 2 test voters via UI", async () => {
      for (let i = 0; i < 2; i++) {
        const voterName = testVoterNames[i] // "Contact Alpha", "Contact Bravo"
        for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
          try {
            // Ensure we're on the voters page
            await page.waitForURL(/voters/, { timeout: 5_000 }).catch(() => {})
            await expect(page.locator('table[data-slot="table"]')).toBeVisible({ timeout: 15_000 })

            // Check if already deleted
            const voterRow = page.getByRole("row").filter({ hasText: voterName }).first()
            const rowVisible = await voterRow.isVisible().catch(() => false)
            if (!rowVisible) break // already deleted

            const actionBtn = voterRow.getByRole("button", {
              name: /open voter actions/i,
            })
            await expect(actionBtn).toBeVisible({ timeout: 10_000 })
            await actionBtn.click()

            // Wait for the dropdown menu to be fully rendered before clicking
            const deleteMenuItem = page.getByRole("menuitem", { name: /delete/i })
            await expect(deleteMenuItem).toBeVisible({ timeout: 5_000 })
            await deleteMenuItem.click()

            // Wait for the destructive confirm dialog to fully open
            const confirmInput = page.getByTestId("destructive-confirm-input")
            await expect(confirmInput).toBeVisible({ timeout: 15_000 })
            await confirmInput.fill(voterName)
            await expect(confirmInput).toHaveValue(voterName, { timeout: 10_000 })

            const deleteBtn = page.getByRole("button", { name: /^delete$/i })
            await expect(deleteBtn).toBeVisible({ timeout: 5_000 })
            await expect(deleteBtn).toBeEnabled({ timeout: 5_000 })
            await deleteBtn.click()

            await expect(
              page.getByText(/deleted|removed|success/i).first(),
            ).toBeVisible({ timeout: 10_000 })

            // Wait for navigation back to voter list after deletion
            await page.waitForURL(/voters/, { timeout: 5_000 }).catch(() => {})
            break // success
          } catch (err) {
            if (navAttempt < 2) {
              await page.keyboard.press("Escape").catch(() => {})
              await page.goto(`/campaigns/${campaignId}/voters`)
              await page.waitForURL(/voters/, { timeout: 10_000 })
              await page.waitForTimeout(500)
              continue
            }
            throw err
          }
        }
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
      await expect(page.locator('table[data-slot="table"]')).toBeVisible({ timeout: 15_000 })

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
