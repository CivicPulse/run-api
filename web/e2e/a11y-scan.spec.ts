import { test, expect } from "./axe-test"
import type { Page } from "@playwright/test"
import { OIDC_STORAGE_KEY, setupMockAuth, mockConfigEndpoint } from "./a11y-helpers"

// ── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "test-campaign-a11y"
const VOTER_ID = "voter-a11y-001"
const LIST_ID = "list-a11y-001"
const WALK_LIST_ID = "wl-a11y-001"
const TURF_ID = "turf-a11y-001"
const SESSION_ID = "session-a11y-001"
const CALL_LIST_ID = "cl-a11y-001"
const VOLUNTEER_ID = "vol-a11y-001"
const SHIFT_ID = "shift-a11y-001"
const SCRIPT_ID = "script-a11y-001"

// ── Route Definitions ────────────────────────────────────────────────────────

interface RouteEntry {
  path: string
  name: string
  needsCampaign?: boolean
}

const ROUTES: RouteEntry[] = [
  // Org-level
  { path: "/", name: "org-dashboard" },
  { path: "/org/members", name: "org-members" },
  { path: "/org/settings", name: "org-settings" },
  // Campaign-level
  { path: `/campaigns/${CAMPAIGN_ID}/dashboard`, name: "campaign-dashboard", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters`, name: "voters-list", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters/${VOTER_ID}`, name: "voter-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters/imports`, name: "voter-imports", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters/imports/new`, name: "voter-import-new", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters/lists`, name: "voter-lists", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters/lists/${LIST_ID}`, name: "voter-list-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/voters/tags`, name: "voter-tags", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/canvassing`, name: "canvassing-overview", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/canvassing/turfs/new`, name: "turf-new", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/canvassing/turfs/${TURF_ID}`, name: "turf-edit", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/canvassing/walk-lists/${WALK_LIST_ID}`, name: "walk-list-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking`, name: "phone-banking-overview", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking/sessions`, name: "phone-sessions", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking/sessions/${SESSION_ID}`, name: "phone-session-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists`, name: "call-lists", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking/call-lists/${CALL_LIST_ID}`, name: "call-list-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking/dnc`, name: "dnc-list", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/phone-banking/my-sessions`, name: "my-sessions", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers`, name: "volunteers-overview", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers/roster`, name: "volunteer-roster", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers/${VOLUNTEER_ID}`, name: "volunteer-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers/shifts`, name: "volunteer-shifts", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers/shifts/${SHIFT_ID}`, name: "shift-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers/tags`, name: "volunteer-tags", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/volunteers/register`, name: "volunteer-register", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/surveys`, name: "surveys", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/surveys/${SCRIPT_ID}`, name: "survey-detail", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/settings`, name: "settings-overview", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/settings/general`, name: "settings-general", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/settings/members`, name: "settings-members", needsCampaign: true },
  { path: `/campaigns/${CAMPAIGN_ID}/settings/danger`, name: "settings-danger", needsCampaign: true },
  // Field routes
  { path: `/field/${CAMPAIGN_ID}`, name: "field-hub", needsCampaign: true },
  { path: `/field/${CAMPAIGN_ID}/canvassing`, name: "field-canvassing", needsCampaign: true },
  { path: `/field/${CAMPAIGN_ID}/phone-banking`, name: "field-phone-banking", needsCampaign: true },
]

// ── Mock API Setup ───────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  // Config endpoint must be mocked BEFORE the catch-all so the app
  // gets a consistent authority/client_id matching the OIDC storage key.
  await mockConfigEndpoint(page)
  // Catch-all API mock: return empty/minimal valid responses for all API calls
  // This prevents network errors while scanning pages for accessibility
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Campaign detail
    if (url.includes(`/campaigns/${CAMPAIGN_ID}`) && !url.includes("/campaigns/" + CAMPAIGN_ID + "/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CAMPAIGN_ID,
          name: "A11Y Test Campaign",
          description: "Test campaign for accessibility scanning",
          slug: "a11y-test",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        }),
      })
    }

    // Dashboard stats
    if (url.includes("/dashboard") || url.includes("/stats")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_voters: 50,
          total_interactions: 100,
          total_volunteers: 10,
          contact_rate: 0.45,
          voters_contacted: 22,
          doors_knocked: 30,
          calls_made: 20,
        }),
      })
    }

    // Voter search (POST)
    if (url.includes("/voters/search") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: VOTER_ID,
              first_name: "Alice",
              last_name: "Smith",
              party: "DEM",
              age: 42,
              registration_city: "Springfield",
              registration_state: "OH",
            },
          ],
          next_cursor: null,
          prev_cursor: null,
        }),
      })
    }

    // Voter detail
    if (url.includes(`/voters/${VOTER_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: VOTER_ID,
          first_name: "Alice",
          last_name: "Smith",
          party: "DEM",
          age: 42,
          propensity_combined: 85,
          registration_line1: "123 Elm St",
          registration_city: "Springfield",
          registration_state: "OH",
          registration_zip: "45501",
          interactions: [],
          phones: [],
          emails: [],
          tags: [],
        }),
      })
    }

    // Voters list (GET)
    if (url.includes("/voters") && method === "GET" && !url.includes("/imports") && !url.includes("/lists") && !url.includes("/tags")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          next_cursor: null,
          prev_cursor: null,
        }),
      })
    }

    // Voter imports
    if (url.includes("/voters/imports")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Voter lists
    if (url.includes(`/voters/lists/${LIST_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: LIST_ID,
          name: "Test List",
          type: "static",
          voter_count: 5,
          voters: [],
        }),
      })
    }
    if (url.includes("/voters/lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Voter tags
    if (url.includes("/voters/tags")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Canvassing turfs
    if (url.includes(`/turfs/${TURF_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TURF_ID,
          name: "Test Turf",
          description: "Test turf for a11y",
          boundary: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
          voter_count: 10,
        }),
      })
    }
    if (url.includes("/turfs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Walk lists
    if (url.includes(`/walk-lists/${WALK_LIST_ID}/entries`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }
    if (url.includes(`/walk-lists/${WALK_LIST_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: WALK_LIST_ID,
          name: "Test Walk List",
          campaign_id: CAMPAIGN_ID,
          total_entries: 0,
          completed_entries: 0,
        }),
      })
    }
    if (url.includes("/walk-lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Phone banking sessions
    if (url.includes(`/phone-bank-sessions/${SESSION_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SESSION_ID,
          name: "Test Session",
          call_list_id: CALL_LIST_ID,
          status: "active",
          callers: [],
        }),
      })
    }
    if (url.includes("/phone-bank-sessions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Call lists
    if (url.includes(`/call-lists/${CALL_LIST_ID}/entries`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }
    if (url.includes(`/call-lists/${CALL_LIST_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CALL_LIST_ID,
          name: "Test Call List",
          campaign_id: CAMPAIGN_ID,
          script_id: SCRIPT_ID,
          total_entries: 0,
          dnc_filtered: 0,
        }),
      })
    }
    if (url.includes("/call-lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // DNC list
    if (url.includes("/dnc")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Surveys
    if (url.includes(`/surveys/${SCRIPT_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SCRIPT_ID,
          name: "Test Survey",
          questions: [
            {
              id: "q1",
              question_text: "How likely are you to vote?",
              question_type: "scale",
              options: { min: 1, max: 5 },
              position: 1,
              required: false,
            },
          ],
        }),
      })
    }
    if (url.includes("/surveys")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Volunteers
    if (url.includes(`/volunteers/${VOLUNTEER_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: VOLUNTEER_ID,
          user_id: "mock-user",
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@test.com",
          status: "active",
          skills: [],
          tags: [],
          hours: { total: 0, this_week: 0 },
        }),
      })
    }
    if (url.includes("/volunteers/tags")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }
    if (url.includes("/volunteers")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Shifts
    if (url.includes(`/shifts/${SHIFT_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SHIFT_ID,
          name: "Test Shift",
          start_time: "2026-03-25T09:00:00Z",
          end_time: "2026-03-25T12:00:00Z",
          capacity: 10,
          signups: [],
        }),
      })
    }
    if (url.includes("/shifts")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Settings - campaign members
    if (url.includes("/members")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null }),
      })
    }

    // Invites
    if (url.includes("/invites")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    }

    // Org-level endpoints
    if (url.includes("/orgs/") || url.includes("/organizations")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "org-1",
          name: "Test Org",
          members: [],
          settings: {},
        }),
      })
    }

    // My campaigns (org dashboard)
    if (url.includes("/campaigns") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: CAMPAIGN_ID,
              name: "A11Y Test Campaign",
              status: "active",
              role: "owner",
            },
          ],
          next_cursor: null,
        }),
      })
    }

    // My role in campaign
    if (url.includes("/me") || url.includes("/my-role")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          role: "owner",
          canvassing: null,
          phone_banking: null,
        }),
      })
    }

    // Field /me endpoint
    if (url.includes("/field/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          canvassing: {
            walk_list_id: WALK_LIST_ID,
            walk_list_name: "Test Walk List",
            total: 3,
            completed: 0,
          },
          phone_banking: {
            session_id: SESSION_ID,
            name: "Test Session",
            total: 3,
            completed: 0,
          },
        }),
      })
    }

    // Canvassing overview stats
    if (url.includes("/canvassing") && url.includes("/stats")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total_turfs: 0, total_walk_lists: 0, total_door_knocks: 0 }),
      })
    }

    // Default: return empty success
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  })
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test.describe("A11Y Scan: axe-core WCAG 2.1 AA compliance", () => {
  test.setTimeout(60_000)

  for (const route of ROUTES) {
    test(`a11y scan: ${route.name}`, async ({ page, makeAxeBuilder }, testInfo) => {
      // Set up auth for admin routes
      const isFieldRoute = route.path.startsWith("/field")
      if (!isFieldRoute) {
        await setupMockAuth(page)
      }

      // Set up API mocks
      await setupApiMocks(page)

      // Navigate to the route
      await page.goto(route.path)

      // Wait for page to settle (loading states to resolve)
      await page.waitForLoadState("networkidle")

      // Additional wait for React hydration/rendering
      await page.waitForTimeout(1000)

      // Run axe-core analysis
      const results = await makeAxeBuilder().analyze()

      // Save full results as JSON artifact (per D-04)
      await testInfo.attach(`axe-${route.name}`, {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      })

      // Gate on zero critical/serious violations (per D-02)
      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      )

      // Log moderate/minor as warnings
      const warnings = results.violations.filter(
        (v) => v.impact === "moderate" || v.impact === "minor",
      )
      if (warnings.length > 0) {
        console.warn(
          `[${route.name}] ${warnings.length} moderate/minor violations:`,
          warnings.map((w) => `${w.id}: ${w.description}`).join(", "),
        )
      }

      expect(
        critical,
        `Critical/serious violations on ${route.name}: ${critical.map((v) => `${v.id}: ${v.help}`).join("; ")}`,
      ).toEqual([])
    })
  }
})
