import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

// ── Constants ──────────────────────────────────────────────────────────────
const CAMPAIGN_ID = "test-campaign-l2"
const JOB_ID = "import-job-l2-001"
const OIDC_STORAGE_KEY =
  "oidc.user:https://auth.civpulse.org:363437283614916644"

// ── Auth & Mock Helpers ────────────────────────────────────────────────────

function mockOidcUser(): string {
  return JSON.stringify({
    id_token: "mock-id-token",
    session_state: null,
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: "mock-user-l2",
      name: "Test Admin",
      email: "admin@test.com",
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })
}

async function setupAuth(page: Page) {
  await page.addInitScript(
    ({ key, user }: { key: string; user: string }) => {
      localStorage.setItem(key, user)
    },
    { key: OIDC_STORAGE_KEY, user: mockOidcUser() },
  )
}

// L2-shaped detect response with all columns having exact matches
const L2_COLUMNS = [
  "Voter ID",
  "First Name",
  "Last Name",
  "Registered Party",
  "Gender",
  "Age",
  "City",
  "State",
  "Zipcode",
  "House Number",
  "Mailng Designator",
  "Mailing Aptartment Number",
]

const L2_MAPPING: Record<
  string,
  { field: string | null; match_type: string | null }
> = {
  "Voter ID": { field: "source_id", match_type: "exact" },
  "First Name": { field: "first_name", match_type: "exact" },
  "Last Name": { field: "last_name", match_type: "exact" },
  "Registered Party": { field: "party", match_type: "exact" },
  Gender: { field: "gender", match_type: "exact" },
  Age: { field: "age", match_type: "exact" },
  City: { field: "registration_city", match_type: "exact" },
  State: { field: "registration_state", match_type: "exact" },
  Zipcode: { field: "registration_zip", match_type: "exact" },
  "House Number": { field: "house_number", match_type: "exact" },
  "Mailng Designator": { field: "mailing_designator", match_type: "exact" },
  "Mailing Aptartment Number": {
    field: "mailing_apartment_number",
    match_type: "exact",
  },
}

const GENERIC_COLUMNS = ["First Name", "Last Name", "Unknown Col"]

const GENERIC_MAPPING: Record<
  string,
  { field: string | null; match_type: string | null }
> = {
  "First Name": { field: "first_name", match_type: "fuzzy" },
  "Last Name": { field: "last_name", match_type: "fuzzy" },
  "Unknown Col": { field: null, match_type: null },
}

async function setupApiMocks(
  page: Page,
  opts: {
    columns: string[]
    mapping: Record<
      string,
      { field: string | null; match_type: string | null }
    >
    formatDetected: string | null
  },
) {
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Public config — /config/public
    if (url.includes("/config/public")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          zitadel_issuer: "https://auth.civpulse.org",
          zitadel_client_id: "363437283614916644",
          zitadel_project_id: "363437283614916644",
        }),
      })
    }

    // User info — /me
    if (url.includes("/api/v1/me") && !url.includes("/campaigns") && !url.includes("/orgs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "mock-user-l2",
          display_name: "Test Admin",
          email: "admin@test.com",
        }),
      })
    }

    // My campaigns — /me/campaigns
    if (url.includes("/me/campaigns")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            campaign_id: CAMPAIGN_ID,
            campaign_name: "L2 Test Campaign",
            role: "owner",
          },
        ]),
      })
    }

    // My orgs — /me/orgs
    if (url.includes("/me/orgs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Campaign detail
    if (
      url.includes(`/campaigns/${CAMPAIGN_ID}`) &&
      !url.includes(`/campaigns/${CAMPAIGN_ID}/`)
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CAMPAIGN_ID,
          name: "L2 Test Campaign",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        }),
      })
    }

    // Initiate import — POST /imports (returns job_id + upload_url)
    if (
      url.includes(`/campaigns/${CAMPAIGN_ID}/imports`) &&
      method === "POST" &&
      !url.includes("/detect") &&
      !url.includes("/confirm") &&
      !url.includes(JOB_ID)
    ) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: JOB_ID,
          upload_url: "https://localhost:9000/mock-upload-bucket/mock-key",
          expires_in: 3600,
        }),
      })
    }

    // Detect columns — POST /imports/{jobId}/detect
    if (url.includes(`/imports/${JOB_ID}/detect`) && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: JOB_ID,
          campaign_id: CAMPAIGN_ID,
          status: "columns_detected",
          filename: "example-2026-02-24.csv",
          detected_columns: opts.columns,
          suggested_mapping: opts.mapping,
          format_detected: opts.formatDetected,
          total_rows: null,
          processed_rows: null,
          error_count: null,
          created_at: "2026-03-28T00:00:00Z",
        }),
      })
    }

    // Import job detail — GET /imports/{jobId}
    if (url.includes(`/imports/${JOB_ID}`) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: JOB_ID,
          campaign_id: CAMPAIGN_ID,
          status: "uploaded",
          filename: "example-2026-02-24.csv",
          detected_columns: opts.columns,
          suggested_mapping: opts.mapping,
          format_detected: opts.formatDetected,
        }),
      })
    }

    // Voter imports list
    if (url.includes("/voters/imports")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Default fallthrough
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })

  // Mock MinIO upload (PUT to presigned URL)
  await page.route("**/mock-upload**", (route) => {
    return route.fulfill({ status: 200 })
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("L2 Import Wizard", () => {
  test.setTimeout(30_000)

  test("shows L2 detection banner and auto-mapped badges after file upload", async ({
    page,
  }) => {
    await setupAuth(page)
    await setupApiMocks(page, {
      columns: L2_COLUMNS,
      mapping: L2_MAPPING,
      formatDetected: "l2",
    })

    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new`)
    await page.waitForLoadState("networkidle")

    // Wait for the wizard page to render (Step 1 heading visible)
    await expect(
      page.getByRole("heading", { name: /upload file/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Upload a CSV file — the detect mock returns L2 response
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: "example-2026-02-24.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Voter ID,First Name,Last Name\n1,John,Doe\n",
      ),
    })

    // Wait for the mapping step to render with L2 banner
    const l2Banner = page.getByText(
      "L2 voter file detected — columns auto-mapped",
    )
    await expect(l2Banner).toBeVisible({ timeout: 15_000 })

    // Per D-07: auto-mapped badges should be visible
    const exactBadges = page.getByLabel("Exact match — auto-mapped")
    await expect(exactBadges.first()).toBeVisible()

    // Per D-06: mapping step is shown (not skipped) — Select triggers present
    const selectTriggers = page.getByRole("combobox")
    await expect(selectTriggers.first()).toBeVisible()
    const count = await selectTriggers.count()
    // Should have one combobox per column (12 L2 columns)
    expect(count).toBeGreaterThanOrEqual(10)
  })

  test("does not show L2 banner for generic CSV", async ({ page }) => {
    await setupAuth(page)
    await setupApiMocks(page, {
      columns: GENERIC_COLUMNS,
      mapping: GENERIC_MAPPING,
      formatDetected: "generic",
    })

    await page.goto(`/campaigns/${CAMPAIGN_ID}/voters/imports/new`)
    await page.waitForLoadState("networkidle")

    // Wait for the wizard page to render (Step 1 heading visible)
    await expect(
      page.getByRole("heading", { name: /upload file/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Upload a generic CSV file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: "generic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("First Name,Last Name,Unknown Col\nJohn,Doe,xyz\n"),
    })

    // Wait for mapping step to render (comboboxes visible)
    await expect(page.getByRole("combobox").first()).toBeVisible({
      timeout: 15_000,
    })

    // L2 banner should NOT appear
    await expect(
      page.getByText("L2 voter file detected — columns auto-mapped"),
    ).not.toBeVisible()
  })

  test("restores mapping state when reopening uploaded import from history", async ({
    page,
  }) => {
    await setupAuth(page)
    await setupApiMocks(page, {
      columns: L2_COLUMNS,
      mapping: L2_MAPPING,
      formatDetected: "l2",
    })

    // Navigate directly with jobId (simulates clicking from history/details)
    await page.goto(
      `/campaigns/${CAMPAIGN_ID}/voters/imports/new?jobId=${JOB_ID}&step=1`,
    )
    await page.waitForLoadState("networkidle")

    // The step-restore effect should hydrate mapping and navigate to step 2
    // Wait for the column mapping heading to appear (step 2)
    await expect(
      page.getByRole("heading", { name: /column mapping/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Verify columns from detected_columns rendered in the mapping table
    // Use .first() since column names appear both as labels and as select values
    await expect(page.getByText("Voter ID").first()).toBeVisible()
    await expect(page.getByText("First Name").first()).toBeVisible()
    await expect(page.getByText("Last Name").first()).toBeVisible()

    // Verify L2 detection banner is shown
    await expect(
      page.getByText("L2 voter file detected — columns auto-mapped"),
    ).toBeVisible()

    // Verify comboboxes are populated (mapping was restored, not empty)
    const selectTriggers = page.getByRole("combobox")
    const count = await selectTriggers.count()
    expect(count).toBeGreaterThanOrEqual(10)
  })

  test("reopened import can proceed from mapping to preview step", async ({
    page,
  }) => {
    await setupAuth(page)
    await setupApiMocks(page, {
      columns: L2_COLUMNS,
      mapping: L2_MAPPING,
      formatDetected: "l2",
    })

    // Navigate directly with jobId (reopen from history)
    await page.goto(
      `/campaigns/${CAMPAIGN_ID}/voters/imports/new?jobId=${JOB_ID}&step=1`,
    )
    await page.waitForLoadState("networkidle")

    // Should auto-navigate to step 2 with mapping populated
    await expect(
      page.getByRole("heading", { name: /column mapping/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Click "Next" to proceed to the preview step (step 2.5)
    const nextButton = page.getByRole("button", { name: /next/i })
    await expect(nextButton).toBeVisible()
    await nextButton.click()

    // Preview step should render with mapping summary
    await expect(
      page.getByRole("heading", { name: /preview.*mapping/i }),
    ).toBeVisible({ timeout: 10_000 })
  })
})
