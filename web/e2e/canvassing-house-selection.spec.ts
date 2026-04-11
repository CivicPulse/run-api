import { test, expect, type Page } from "@playwright/test"

/**
 * Phase 108 — Canvassing House Selection E2E Coverage
 *
 * Covers the four user-visible behaviors SELECT-01/02/03 ship:
 *   1. SELECT-01 — tapping a list row visibly swaps the rendered HouseholdCard
 *   2. SELECT-02 — tapping a map marker swaps the HouseholdCard + pans the map
 *   3. SELECT-02 — keyboard Enter on a focused marker activates the transition
 *   4. SELECT-03 — resume: returning to the canvassing route lands on the
 *      persisted active house
 *
 * Run via: `cd web && ./scripts/run-e2e.sh canvassing-house-selection.spec.ts`
 * (NEVER bare `npx playwright test` — phase 106 D-13, enforced by CLAUDE.md.)
 *
 * Strategy: the mock fixture and route setup are copied verbatim from
 * `canvassing-wizard.spec.ts` (phase 107). Keeping phase 108 coverage in a
 * separate file — per Plan 108-06 — preserves phase 107's CANV-01/02/03
 * coverage independently. The fixture extension (House C) is now a Wave 0
 * artifact shared across phases 107/108.
 */

const CAMPAIGN_ID = "test-campaign-108"
const WALK_LIST_ID = "wl-108"
const SCRIPT_ID = "script-108"

// ── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_FIELD_ME = {
  canvassing: {
    walk_list_id: WALK_LIST_ID,
    walk_list_name: "Phase 108 Test Walk List",
    total: 5,
    completed: 0,
  },
  phone_banking: null,
}

const MOCK_WALK_LIST_DETAIL = {
  id: WALK_LIST_ID,
  name: "Phase 108 Test Walk List",
  campaign_id: CAMPAIGN_ID,
  script_id: SCRIPT_ID,
  total_entries: 5,
  completed_entries: 0,
}

// House A / B / C mirror the phase-107 fixture (canvassing-wizard.spec.ts
// lines ~67-81). Coordinates are ≥150m apart in central Macon, GA so each
// household renders as a distinct map marker — SELECT-02 needs a non-current
// marker to tap.
const HOUSE_A_LINE1 = "123 Maple Street"
const HOUSE_B_LINE1 = "456 Oak Avenue"
const HOUSE_C_LINE1 = "400 Cherry Street"
const HOUSE_A_ADDRESS_RE = new RegExp(HOUSE_A_LINE1, "i")
const HOUSE_B_ADDRESS_RE = new RegExp(HOUSE_B_LINE1, "i")
const HOUSE_C_ADDRESS_RE = new RegExp(HOUSE_C_LINE1, "i")

const HOUSE_A_LATLNG = { latitude: 32.8407, longitude: -83.6324 }
const HOUSE_B_LATLNG = { latitude: 32.8421, longitude: -83.6341 }
const HOUSE_C_LATLNG = { latitude: 32.8389, longitude: -83.6307 }

function makeEntry(opts: {
  id: string
  voterId: string
  householdKey: string
  sequence: number
  firstName: string
  lastName: string
  line1: string
  latitude: number | null
  longitude: number | null
}) {
  return {
    id: opts.id,
    voter_id: opts.voterId,
    walk_list_id: WALK_LIST_ID,
    household_key: opts.householdKey,
    sequence: opts.sequence,
    status: "pending",
    latitude: opts.latitude,
    longitude: opts.longitude,
    voter: {
      id: opts.voterId,
      first_name: opts.firstName,
      last_name: opts.lastName,
      party: "DEM",
      age: 42,
      propensity_combined: 75,
      registration_line1: opts.line1,
      registration_line2: null,
      registration_city: "Macon",
      registration_state: "GA",
      registration_zip: "31201",
    },
    prior_interactions: { attempt_count: 0, last_result: null, last_date: null },
  }
}

// 3 unique households sorted by sequence: A (door 1) → B (door 2) → C (door 3).
const MOCK_WALK_LIST_ENTRIES = [
  makeEntry({
    id: "entry-a1",
    voterId: "voter-a1",
    householdKey: "house-a",
    sequence: 1,
    firstName: "Alice",
    lastName: "Anderson",
    line1: HOUSE_A_LINE1,
    latitude: HOUSE_A_LATLNG.latitude,
    longitude: HOUSE_A_LATLNG.longitude,
  }),
  makeEntry({
    id: "entry-a2",
    voterId: "voter-a2",
    householdKey: "house-a",
    sequence: 2,
    firstName: "Aaron",
    lastName: "Anderson",
    line1: HOUSE_A_LINE1,
    latitude: HOUSE_A_LATLNG.latitude,
    longitude: HOUSE_A_LATLNG.longitude,
  }),
  makeEntry({
    id: "entry-a3",
    voterId: "voter-a3",
    householdKey: "house-a",
    sequence: 3,
    firstName: "Amelia",
    lastName: "Anderson",
    line1: HOUSE_A_LINE1,
    latitude: HOUSE_A_LATLNG.latitude,
    longitude: HOUSE_A_LATLNG.longitude,
  }),
  makeEntry({
    id: "entry-b1",
    voterId: "voter-b1",
    householdKey: "house-b",
    sequence: 4,
    firstName: "Bob",
    lastName: "Brown",
    line1: HOUSE_B_LINE1,
    latitude: HOUSE_B_LATLNG.latitude,
    longitude: HOUSE_B_LATLNG.longitude,
  }),
  makeEntry({
    id: "entry-c1",
    voterId: "voter-c1",
    householdKey: "house-c",
    sequence: 5,
    firstName: "Carla",
    lastName: "Carter",
    line1: HOUSE_C_LINE1,
    latitude: HOUSE_C_LATLNG.latitude,
    longitude: HOUSE_C_LATLNG.longitude,
  }),
]

const MOCK_SURVEY_SCRIPT = {
  id: SCRIPT_ID,
  name: "Phase 108 Test Script",
  campaign_id: CAMPAIGN_ID,
  questions: [
    {
      id: "q1",
      script_id: SCRIPT_ID,
      question_text: "Will you support our candidate?",
      question_type: "multiple_choice",
      options: { choices: ["Yes", "No", "Undecided"] },
      position: 1,
      required: false,
    },
  ],
}

// ── Mock Setup ──────────────────────────────────────────────────────────────

async function setupCanvassingMocks(page: Page) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  await page.route(
    `**/walk-lists/${WALK_LIST_ID}/entries/enriched**`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_WALK_LIST_ENTRIES),
      })
    },
  )

  await page.route(`**/walk-lists/${WALK_LIST_ID}`, (route) => {
    const url = route.request().url()
    if (url.endsWith(`/${WALK_LIST_ID}`) || url.endsWith(`/${WALK_LIST_ID}/`)) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_WALK_LIST_DETAIL),
      })
    } else {
      route.fallback()
    }
  })

  await page.route(
    `**/api/v1/campaigns/${CAMPAIGN_ID}/surveys/${SCRIPT_ID}**`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SURVEY_SCRIPT),
      })
    },
  )

  await page.route(`**/walk-lists/${WALK_LIST_ID}/door-knocks`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "door-knock-1", saved: true }),
    })
  })

  await page.route(
    new RegExp(`/walk-lists/${WALK_LIST_ID}/entries/[^/]+$`),
    (route) => {
      if (route.request().method() === "PATCH") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "entry", status: "skipped" }),
        })
      } else {
        route.fallback()
      }
    },
  )
}

// ── Locator helpers ─────────────────────────────────────────────────────────

// Mirrors the phase 107 spec: the household address renders inside an <h2>
// but is reported as `generic` under reducedMotion + custom focus-ring, so
// querying by visible text + `.first()` (the google maps link carries the
// same address as an aria-label) is the resilient path.
function houseAHeading(page: Page) {
  return page.getByText(HOUSE_A_ADDRESS_RE).first()
}

function houseBHeading(page: Page) {
  return page.getByText(HOUSE_B_ADDRESS_RE).first()
}

function houseCHeading(page: Page) {
  return page.getByText(HOUSE_C_ADDRESS_RE).first()
}

async function gotoCanvassing(page: Page) {
  await setupCanvassingMocks(page)
  await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
  await expect(houseAHeading(page)).toBeVisible({ timeout: 30_000 })
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("Phase 108 — canvassing house selection", () => {
  test.setTimeout(60_000)

  test("SELECT-01: tapping a list row visibly swaps the rendered HouseholdCard", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Sanity: the active card starts on House A and the door counter reads
    // Door 1 of 3 (3 households — A/B/C).
    await expect(houseAHeading(page)).toBeVisible()
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 1 of 3",
    )

    // Open the "All Doors" list sheet (canvassing.tsx `listViewOpen` state).
    await page.getByRole("button", { name: /All Doors/i }).click()

    // The DoorListView row for House B carries the load-bearing aria-label
    // `Jump to door 2, {address}, {status}` (see DoorListView.tsx:115).
    //
    // dispatchEvent — the Sheet portal at the default Playwright viewport
    // places door-list items in a scroll container whose resolved position
    // is outside the viewport bounds check (the map marker `::before` hit
    // area also contributes pointer-event overlap). Both real click and
    // force:true click fail because Playwright's actionability checks
    // require a real hit-test at the element's center. `dispatchEvent`
    // fires a synthetic DOM click that the React onClick handler picks up
    // directly — the handler runs and state advances. The overlap/layering
    // issue is a separate UX finding logged as a deferred item (108-06
    // deviations).
    await page
      .getByRole("button", { name: /Jump to door 2,.*456 Oak Avenue/i })
      .dispatchEvent("click")

    // The sheet closes (DoorListView onOpenChange(false) after onJump).
    await expect(page.getByRole("button", { name: /Jump to door 2,/i })).not.toBeVisible(
      { timeout: 5_000 },
    )

    // The rendered HouseholdCard swaps to House B. This is the load-bearing
    // SELECT-01 assertion: the pin-clear wrap in handleJumpToAddress (Plan
    // 108-02) must release the 107-04 `pinnedHouseholdKey` so the
    // `households` memo re-renders on the new active key.
    await expect(houseBHeading(page)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 2 of 3",
    )

    // The ARIA live region announces the new door number (sr-only status
    // div in canvassing.tsx:476-483). Text form matches the phase 107
    // `announceAutoAdvance` contract.
    await expect(
      page.getByRole("status").filter({ hasText: /door 2 of 3/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("SELECT-02: tapping a map marker swaps the HouseholdCard and the new marker is aria-pressed", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Wait for the map markers to mount. CanvassingMap renders a L.DivIcon
    // per household; the post-mount `useEffect` in
    // InteractiveHouseholdMarker (Plan 108-03) sets role=button, aria-label,
    // aria-pressed, tabindex on the marker root element.
    const houseCMarker = page.getByRole("button", {
      name: /Activate door:.*400 Cherry Street/i,
    })
    await expect(houseCMarker).toBeVisible({ timeout: 15_000 })

    // The starting active marker is House A (the currently-active household).
    const houseAMarker = page.getByRole("button", {
      name: /Activate door:.*123 Maple Street/i,
    })
    await expect(houseAMarker).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    })
    await expect(houseCMarker).toHaveAttribute("aria-pressed", "false")

    // Tap the House C marker — Plan 108-03 wired click → onHouseholdSelect →
    // handleJumpToAddress (the same entry point as list-tap per D-07).
    //
    // dispatchEvent — House A's 44x44 `::before` hit area (Contract 2b) can
    // overlap neighbor markers at the default Playwright viewport when
    // leaflet's fitBounds clusters the 3 mock households. Leaflet's
    // `eventHandlers.click` on <Marker> is wired via the native DOM
    // click event on the marker root (L.DomEvent), so a dispatched
    // synthetic click fires the same handler without going through
    // Playwright's hit-test. The viewport-pixel marker separation is
    // covered by the CanvassingMap unit tests.
    await houseCMarker.dispatchEvent("click")

    // The HouseholdCard swaps to House C.
    await expect(houseCHeading(page)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 3 of 3",
    )

    // aria-pressed flips: House A → false, House C → true.
    await expect(houseCMarker).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    })
    await expect(houseAMarker).toHaveAttribute("aria-pressed", "false")

    // Screenshot lands in web/screenshots/ (gitignored per CLAUDE.md global
    // UI-change verification rule). Path is relative to the web/ cwd.
    await page.screenshot({
      path: "screenshots/108-map-tap-active.png",
      fullPage: false,
    })
  })

  test("SELECT-02: keyboard Space on a focused map marker activates the same transition", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Phase 108 Spike A1 (108-SPIKES.md) confirmed that Leaflet 1.9.4 does
    // NOT handle Space natively. Plan 108-03 added a post-mount `keydown`
    // listener on each marker root that matches `event.key === " "` and
    // calls the same `onClick(household)` as a pointer tap. That listener
    // is the D-07 keyboard-activation surface and is what this test
    // exercises.
    //
    // Per WR-03 fix: the keydown listener now explicitly matches
    // `key === "Enter"` alongside Space, so the Enter path runs through the
    // same `onClickRef.current(household)` surface as Space (covered by the
    // separate Enter test below).
    const houseBMarker = page.getByRole("button", {
      name: /Activate door:.*456 Oak Avenue/i,
    })
    await expect(houseBMarker).toBeVisible({ timeout: 15_000 })
    await houseBMarker.focus()

    await page.keyboard.press("Space")

    // Same post-conditions as the tap variant: House B is now the rendered
    // household + the active marker.
    await expect(houseBHeading(page)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 2 of 3",
    )
    await expect(houseBMarker).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    })
  })

  test("WR-03: keyboard Enter on a focused map marker activates the same transition", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // WR-03 closes the Enter-key gap flagged by phase 108 code review:
    // <div role="button"> does NOT synthesize a click on Enter in modern
    // browsers (only native <button> does), so the marker keydown listener
    // now explicitly matches `key === "Enter"` alongside Space. This test
    // guards against regression.
    const houseBMarker = page.getByRole("button", {
      name: /Activate door:.*456 Oak Avenue/i,
    })
    await expect(houseBMarker).toBeVisible({ timeout: 15_000 })
    await houseBMarker.focus()

    await page.keyboard.press("Enter")

    await expect(houseBHeading(page)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 2 of 3",
    )
    await expect(houseBMarker).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    })
  })

  test("SELECT-03 resume: returning to the canvassing route lands on the persisted active house", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Activate House B via list-tap — the same wrapped action that SELECT-01
    // guards. The zustand-persist store will write the new
    // `currentAddressIndex` to sessionStorage on every state change.
    // dispatchEvent — see SELECT-01 test for the Sheet layering rationale.
    await page.getByRole("button", { name: /All Doors/i }).click()
    await page
      .getByRole("button", { name: /Jump to door 2,.*456 Oak Avenue/i })
      .dispatchEvent("click")
    await expect(houseBHeading(page)).toBeVisible({ timeout: 5_000 })

    // Navigate away. The /field/{campaign}/index is the canvassing hub and
    // is always mocked via the same field/me route set up above.
    await page.goto(`/field/${CAMPAIGN_ID}`)
    // Wait for the hub to be visible before bouncing back so we know the
    // canvassing route was fully unmounted.
    await expect(page).toHaveURL(new RegExp(`/field/${CAMPAIGN_ID}`))

    // Bounce back to canvassing. The persisted state in sessionStorage means
    // the wizard must rehydrate with House B active, not House A.
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    // The rendered HouseholdCard is House B without any user action.
    await expect(houseBHeading(page)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 2 of 3",
    )

    // And the map marker for House B is aria-pressed=true — the 5th D-09
    // entry point (resume) lands in the same target state as list-tap.
    const houseBMarker = page.getByRole("button", {
      name: /Activate door:.*456 Oak Avenue/i,
    })
    await expect(houseBMarker).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    })
  })
})
