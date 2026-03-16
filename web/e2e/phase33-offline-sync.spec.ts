import { test, expect } from "@playwright/test"

const CAMPAIGN_ID = "test-campaign-123"
const WALK_LIST_ID = "wl-1"

const MOCK_ENRICHED_ENTRIES = [
  {
    id: "e1",
    voter_id: "v1",
    household_key: "hk1",
    sequence: 1,
    status: "pending",
    voter: {
      id: "v1",
      first_name: "Alice",
      last_name: "Smith",
      full_address: "123 Main St",
      city: "Anytown",
      state: "CA",
      zip: "90210",
      party: "DEM",
      age: 42,
    },
    prior_interactions: { door_knocks: 0, calls: 0 },
  },
  {
    id: "e2",
    voter_id: "v2",
    household_key: "hk2",
    sequence: 2,
    status: "pending",
    voter: {
      id: "v2",
      first_name: "Bob",
      last_name: "Johnson",
      full_address: "456 Oak Ave",
      city: "Anytown",
      state: "CA",
      zip: "90210",
      party: "REP",
      age: 55,
    },
    prior_interactions: { door_knocks: 0, calls: 0 },
  },
]

async function setupCanvassingMocks(page: import("@playwright/test").Page) {
  // Mock field/me endpoint
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        campaign_name: "Test Campaign",
        canvassing: {
          walk_list_id: WALK_LIST_ID,
          name: "Test Walk List",
          total: 2,
          visited: 0,
        },
        phone_banking: null,
      }),
    })
  })

  // Mock walk list entries enriched
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/walk-lists/${WALK_LIST_ID}/entries/enriched`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ENRICHED_ENTRIES),
      })
    }
  )

  // Mock door-knock POST
  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/walk-lists/${WALK_LIST_ID}/door-knocks`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "dk1", interaction_id: "int1" }),
      })
    }
  )
}

test.describe("Offline Sync - Phase 33", () => {
  test.setTimeout(30_000)

  test("shows offline banner when network is lost", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)

    // Wait for field hub to load
    await expect(page.getByText("Test Campaign")).toBeVisible({ timeout: 10_000 })

    // Verify banner is NOT visible when online
    const banner = page.locator('[role="status"][aria-live="polite"]')
    // Banner should not be visible in online state with empty queue
    await expect(banner).not.toBeVisible()

    // Simulate going offline
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("offline"))
    })

    // Wait for banner to appear
    await expect(banner).toBeVisible({ timeout: 5_000 })

    // Verify banner text says "Offline"
    await expect(banner).toContainText("Offline")

    // Verify ARIA attributes
    await expect(banner).toHaveAttribute("aria-live", "polite")
  })

  test("banner disappears after going back online", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)
    await expect(page.getByText("Test Campaign")).toBeVisible({ timeout: 10_000 })

    // Go offline
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("offline"))
    })

    const banner = page.locator('[role="status"][aria-live="polite"]')
    await expect(banner).toBeVisible({ timeout: 5_000 })

    // Go back online
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("online"))
    })

    // Banner should disappear (no items in queue)
    await expect(banner).not.toBeVisible({ timeout: 5_000 })
  })

  test("offline banner shows queued outcome count", async ({ page }) => {
    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}`)
    await expect(page.getByText("Test Campaign")).toBeVisible({ timeout: 10_000 })

    // Pre-populate localStorage with offline queue items before page reload
    await page.evaluate(() => {
      const queueData = {
        state: {
          items: [
            {
              id: "q1",
              type: "door_knock",
              payload: {
                walk_list_entry_id: "e1",
                result_code: "not_home",
              },
              campaignId: "test-campaign-123",
              resourceId: "wl-1",
              createdAt: Date.now(),
              retryCount: 0,
            },
          ],
        },
        version: 0,
      }
      localStorage.setItem("offline-queue", JSON.stringify(queueData))
    })

    // Reload so store rehydrates from localStorage with the queued item
    await page.goto(`/field/${CAMPAIGN_ID}`)
    await expect(page.getByText("Test Campaign")).toBeVisible({ timeout: 10_000 })

    // Simulate going offline to trigger banner with count
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("offline"))
    })

    const banner = page.locator('[role="status"][aria-live="polite"]')
    await expect(banner).toBeVisible({ timeout: 5_000 })

    // Verify banner shows count
    await expect(banner).toContainText("1")
    await expect(banner).toContainText("outcomes saved")
  })
})
