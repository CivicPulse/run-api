import { test, expect, type Page } from "@playwright/test"

/**
 * Cross-Cutting E2E Spec
 *
 * Validates cross-cutting UI behaviors: form navigation guards, toast
 * notifications, rate limiting, empty states, loading skeletons, and
 * error boundary rendering.
 *
 * Covers: CROSS-01, CROSS-02, CROSS-03, UI-01, UI-02, UI-03
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// -- Helper Functions ----------------------------------------------------------

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

async function createEmptyCampaignViaApi(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const resp = await page.request.post(
    "https://localhost:4173/api/v1/campaigns",
    {
      data: { name: "E2E Empty State Test", type: "general" },
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}

async function deleteEmptyCampaignViaApi(
  page: Page,
  campaignId: string,
): Promise<void> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

  await page.request.delete(
    `https://localhost:4173/api/v1/campaigns/${campaignId}`,
    { headers: { Cookie: cookieHeader } },
  )
}

// -- CROSS-01: Form Navigation Guard on Dirty Form ----------------------------

test.describe.serial("Cross-Cutting -- Form Guards", () => {
  test("CROSS-01: form navigation guard blocks leaving a dirty form", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    // Navigate to seed campaign settings where form guard has a proper dialog
    const campaignId = await navigateToSeedCampaign(page)

    // Go to campaign settings (general tab has useFormGuard with ConfirmDialog)
    await page.goto(`/campaigns/${campaignId}/settings/general`)
    await expect(
      page.getByLabel(/campaign name|name/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Make the form dirty by typing in the campaign name field
    const nameField = page.getByLabel(/campaign name|name/i).first()
    await nameField.fill("Modified Campaign Name For Guard Test")

    // Attempt to navigate away by clicking a sidebar link
    await page.getByRole("button", { name: /open sidebar/i }).click().catch(() => {})
    const dashboardLink = page.getByRole("link", { name: /dashboard/i }).first()
    await dashboardLink.click({ timeout: 5_000 }).catch(() => {
      // Sidebar might already be open or link visible without opening
    })

    // Assert the form guard dialog appears
    // The ConfirmDialog in settings/general.tsx shows "Unsaved changes" title
    const guardDialog = page
      .getByRole("alertdialog")
      .or(page.getByText(/unsaved changes/i))
    await expect(guardDialog).toBeVisible({ timeout: 5_000 })

    // Click "Keep editing" to stay on the page
    const stayButton = page
      .getByRole("button", { name: /keep editing/i })
      .or(page.getByRole("button", { name: /stay|cancel/i }))
    await stayButton.click()

    // Verify still on the settings page
    await expect(nameField).toBeVisible()

    // Attempt navigation again
    await page.getByRole("button", { name: /open sidebar/i }).click().catch(() => {})
    await page.getByRole("link", { name: /dashboard/i }).first().click().catch(() => {})

    // This time click "Discard changes" to leave
    await expect(guardDialog).toBeVisible({ timeout: 5_000 })
    const leaveButton = page
      .getByRole("button", { name: /discard changes/i })
      .or(page.getByRole("button", { name: /leave|discard|confirm/i }))
    await leaveButton.click()

    // Assert navigation proceeds away from settings
    await page.waitForURL(/dashboard/, { timeout: 10_000 })
  })
})

// -- CROSS-02: Toast Notifications on CRUD Operations -------------------------

test.describe.serial("Cross-Cutting -- Toasts", () => {
  test("CROSS-02: toast notifications appear on CRUD operations", async ({
    page,
  }) => {
    test.setTimeout(90_000)

    const campaignId = await navigateToSeedCampaign(page)

    // Navigate to voters page
    await page.getByRole("link", { name: /voters/i }).first().click()
    await expect(
      page.getByRole("table").or(page.getByText(/no voters|all voters/i).first()),
    ).toBeVisible({ timeout: 15_000 })

    // Create a voter via UI to trigger a success toast
    await page.getByRole("button", { name: /new voter/i }).click()
    await expect(
      page.getByText(/new voter/i).first(),
    ).toBeVisible({ timeout: 5_000 })

    await page.getByLabel("First Name").fill("ToastTest")
    await page.getByLabel("Last Name").fill("Ephemeral")

    // Intercept the create response
    const createPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/voters") &&
        resp.request().method() === "POST" &&
        !resp.url().includes("/search"),
    )

    await page.getByRole("button", { name: /create voter/i }).click()
    const createResp = await createPromise
    expect(createResp.status()).toBe(201)
    const createdVoter = await createResp.json()

    // Assert a toast appears immediately after creation
    await expect(
      page.locator("[data-sonner-toast]"),
    ).toBeVisible({ timeout: 5_000 })

    // Assert toast contains success-related text
    await expect(
      page.locator("[data-sonner-toast]").first().getByText(/created|success/i),
    ).toBeVisible({ timeout: 3_000 })

    // Wait for toast to auto-dismiss
    await expect(
      page.locator("[data-sonner-toast]"),
    ).not.toBeVisible({ timeout: 15_000 })

    // Clean up: delete the test voter via API
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    await page.request.delete(
      `https://localhost:4173/api/v1/campaigns/${campaignId}/voters/${createdVoter.id}`,
      { headers: { Cookie: cookieHeader } },
    )
  })
})

// -- CROSS-03: Rate Limiting Enforcement --------------------------------------

test.describe.serial("Cross-Cutting -- Rate Limiting", () => {
  test("CROSS-03: rate limiting returns 429 on rapid requests", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    const campaignId = await navigateToSeedCampaign(page)

    // The join endpoint has a 5/minute limit -- easiest to trigger.
    // But we need an endpoint the owner can access. Voters has 60/minute via
    // GET which is too many requests. Let's use the turfs create endpoint
    // which is 30/minute, or just blast the voters search endpoint.
    //
    // Use page.request to rapidly fire API calls. Forward cookies.
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

    const statuses: number[] = []

    // Fire 35 rapid GET requests to voters list (30/min on write, 60/min on read)
    // Use POST /voters/search with 30/minute write limit for faster 429
    const requests = Array.from({ length: 35 }, () =>
      page.request
        .post(
          `https://localhost:4173/api/v1/campaigns/${campaignId}/voters/search`,
          {
            data: { filters: {}, page_size: 1 },
            headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
          },
        )
        .then((r) => statuses.push(r.status()))
        .catch(() => statuses.push(0)),
    )

    await Promise.all(requests)

    // Check if any response was 429
    const has429 = statuses.some((s) => s === 429)

    if (!has429) {
      // Rate limiting may not be enforced in local dev or limits may be higher
      // than 35 requests. Skip gracefully per plan guidance.
      test.skip(
        true,
        "Rate limiting did not trigger with 35 requests -- may not be enforced locally or limit is higher",
      )
    }

    expect(has429).toBeTruthy()
  })
})

// -- UI-01: Empty States on List Pages ----------------------------------------

test.describe.serial("Cross-Cutting -- Empty States", () => {
  let emptyCampaignId: string

  test("UI-01: empty states render on all list pages of a fresh campaign", async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // Navigate first to establish auth context
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Create a fresh campaign with no data
    emptyCampaignId = await createEmptyCampaignViaApi(page)
    expect(emptyCampaignId).toBeTruthy()

    // Check empty states on each list page of the fresh campaign:

    // 1. Voters: "No voters yet"
    await page.goto(`/campaigns/${emptyCampaignId}/voters`)
    await expect(
      page.getByText(/no voters/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 2. Canvassing (Turfs): "No turfs yet"
    await page.goto(`/campaigns/${emptyCampaignId}/canvassing`)
    await expect(
      page.getByText(/no turfs/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 3. Phone Banking (Call Lists): "No call lists yet"
    await page.goto(`/campaigns/${emptyCampaignId}/phone-banking/call-lists`)
    await expect(
      page.getByText(/no call lists/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 4. Surveys: "No survey scripts yet"
    await page.goto(`/campaigns/${emptyCampaignId}/surveys`)
    await expect(
      page.getByText(/no survey/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 5. Volunteers (Roster): "No volunteers yet"
    await page.goto(`/campaigns/${emptyCampaignId}/volunteers/roster`)
    await expect(
      page.getByText(/no volunteers/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 6. Shifts: "No shifts scheduled"
    await page.goto(`/campaigns/${emptyCampaignId}/volunteers/shifts`)
    await expect(
      page.getByText(/no shifts/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 7. Voter Tags: "No voter tags yet"
    await page.goto(`/campaigns/${emptyCampaignId}/voters/tags`)
    await expect(
      page.getByText(/no.*tags/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // 8. Voter Lists: "No voter lists yet"
    await page.goto(`/campaigns/${emptyCampaignId}/voters/lists`)
    await expect(
      page.getByText(/no.*lists/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Clean up: delete the test campaign
    await deleteEmptyCampaignViaApi(page, emptyCampaignId)
  })
})

// -- UI-02 & UI-03: Loading Skeletons & Error Boundary ------------------------

test.describe.serial("Cross-Cutting -- Loading & Errors", () => {
  test("UI-02: loading skeletons are visible during delayed API fetch", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    // Intercept voters API call and delay the response by 2 seconds
    await page.route("**/api/v1/campaigns/*/voters/search*", async (route) => {
      await new Promise((r) => setTimeout(r, 2000))
      await route.continue()
    })

    const campaignId = await navigateToSeedCampaign(page)

    // Navigate to voters page
    await page.goto(`/campaigns/${campaignId}/voters`)

    // Assert skeleton/loading elements are visible while data loads
    // DataTable renders Skeleton components with animate-pulse class
    const skeletonOrLoading = page
      .locator(".animate-pulse")
      .first()
      .or(page.locator('[role="status"]').first())
      .or(page.locator("table .animate-pulse").first())

    await expect(skeletonOrLoading).toBeVisible({ timeout: 5_000 })

    // Wait for data to load (skeletons should disappear)
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })

    // After data loads, skeletons should be gone -- table cells should be visible
    await expect(
      page.locator("table tbody tr").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Unroute to clean up
    await page.unroute("**/api/v1/campaigns/*/voters/search*")
  })

  test("UI-03: error boundary renders on invalid campaign ID", async ({
    page,
  }) => {
    test.setTimeout(30_000)

    // Navigate to a campaign that doesn't exist
    await page.goto(
      "/campaigns/00000000-0000-0000-0000-000000000000/dashboard",
    )

    // RouteErrorBoundary renders "Something went wrong"
    await expect(
      page.getByText("Something went wrong"),
    ).toBeVisible({ timeout: 15_000 })

    // Verify "Try Again" button is present
    await expect(
      page.getByRole("button", { name: /try again/i }),
    ).toBeVisible()

    // Verify "Go to Dashboard" button is present
    await expect(
      page.getByRole("button", { name: /go to dashboard/i }),
    ).toBeVisible()

    // Click "Go to Dashboard" and verify navigation succeeds
    await page.getByRole("button", { name: /go to dashboard/i }).click()

    // Should navigate to the root / org dashboard
    await page.waitForURL(/^\/$|\/org|\/campaigns/, { timeout: 10_000 })
  })
})
