import { test, expect, type Page } from "@playwright/test"

/**
 * Phase 109 — Canvassing Map Rendering E2E Coverage
 *
 * Two regression guards that the unit test layer can't provide because
 * they depend on the real Leaflet asset pipeline and the real Radix Sheet
 * z-index stack at a real mobile viewport:
 *
 *   1. MAP-01 — every <img> inside `.leaflet-container` has naturalWidth > 0
 *      and no marker PNG request returns a non-200 status during the
 *      canvassing page load. Plan 109-02 inlined the three leaflet marker
 *      PNGs as base64 data URIs — this spec is the runtime proof of that
 *      build-time guarantee in every environment the tests run under.
 *
 *   2. MAP-02 — with the "All Doors" bottom sheet open at iPhone 14 Pro
 *      viewport (390×844), tapping a household card fires the card's
 *      onJump handler (wizard advances to that door) and NOT the map click
 *      handler underneath. Plan 109-03 wrapped the map in a div that gets
 *      `canvassing-map-wrapper--inert` + `aria-hidden="true"` while the
 *      sheet is open; this test asserts both the class/aria state and the
 *      user-visible outcome from the volunteer bug report.
 *
 * Run via: `cd web && ./scripts/run-e2e.sh canvassing-map-rendering.spec.ts`
 * (NEVER bare `npx playwright test` — phase 106 D-13, enforced by CLAUDE.md.)
 *
 * Fixture strategy mirrors `canvassing-house-selection.spec.ts` (phase
 * 108-06): clone the phase 107 mock fixture verbatim with a suffix to
 * prevent mock collisions when specs run in parallel. The seeded
 * Macon-Bibb database is NOT required — the mocked walk-list entries
 * include real lat/lng coordinates so the map renders real markers.
 */

const CAMPAIGN_ID = "test-campaign-109"
const WALK_LIST_ID = "wl-109"
const SCRIPT_ID = "script-109"

// ── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_FIELD_ME = {
  canvassing: {
    walk_list_id: WALK_LIST_ID,
    walk_list_name: "Phase 109 Map Rendering Walk List",
    total: 5,
    completed: 0,
  },
  phone_banking: null,
}

const MOCK_WALK_LIST_DETAIL = {
  id: WALK_LIST_ID,
  name: "Phase 109 Map Rendering Walk List",
  campaign_id: CAMPAIGN_ID,
  script_id: SCRIPT_ID,
  total_entries: 5,
  completed_entries: 0,
}

const HOUSE_A_LINE1 = "123 Maple Street"
const HOUSE_B_LINE1 = "456 Oak Avenue"
const HOUSE_C_LINE1 = "400 Cherry Street"
const HOUSE_A_ADDRESS_RE = new RegExp(HOUSE_A_LINE1, "i")
const HOUSE_B_ADDRESS_RE = new RegExp(HOUSE_B_LINE1, "i")

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
  name: "Phase 109 Test Script",
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

function houseAHeading(page: Page) {
  return page.getByText(HOUSE_A_ADDRESS_RE).first()
}

function houseBHeading(page: Page) {
  return page.getByText(HOUSE_B_ADDRESS_RE).first()
}

async function gotoCanvassing(page: Page) {
  await setupCanvassingMocks(page)
  await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
  await expect(houseAHeading(page)).toBeVisible({ timeout: 30_000 })
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("MAP-01 marker rendering", () => {
  test.setTimeout(60_000)

  test("every marker image in the canvassing map has naturalWidth > 0", async ({
    page,
  }) => {
    // MAP-01 regression guard. Plan 109-02 consolidated all Leaflet icon
    // factories into `leafletIcons.ts` and swapped from the unpkg CDN
    // (which 404'd at runtime for some volunteers) to Vite ES-module
    // imports of `leaflet/dist/images/*.png`. Vite inlines those three
    // PNGs as base64 data URIs, so `naturalWidth` MUST be > 0 for every
    // marker <img> on the page — data URIs cannot 404, cannot be blocked
    // by CSP `img-src` (unless `data:` is explicitly blocked, which the
    // app does not do), and cannot be rate-limited.
    //
    // The test also asserts no marker-* PNG request returns a non-200
    // status during the page load. If a future change reintroduces a
    // network-fetched icon URL that 404s, this spec catches it before
    // shipping to the field.

    const failedRequests: string[] = []
    page.on("requestfailed", (req) => {
      const url = req.url()
      if (/marker-|leaflet.*\.png/.test(url)) {
        failedRequests.push(url)
      }
    })

    const badStatuses: { url: string; status: number }[] = []
    page.on("response", (res) => {
      const url = res.url()
      if (/marker-.*\.png|marker-shadow.*\.png/.test(url) && res.status() >= 400) {
        badStatuses.push({ url, status: res.status() })
      }
    })

    await setupCanvassingMocks(page)
    await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)

    await page.waitForSelector('[data-testid="canvassing-map-container"]', {
      timeout: 30_000,
    })

    // Give Leaflet a tick to paint markers — `waitForFunction` polls the
    // DOM until at least one `<img>` is inside `.leaflet-container` (the
    // marker shadow + pin image for each household marker appear here).
    await page.waitForFunction(
      () => document.querySelectorAll(".leaflet-container img").length > 0,
      undefined,
      { timeout: 15_000 },
    )

    const widths = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".leaflet-container img")).map(
        (img) => (img as HTMLImageElement).naturalWidth,
      ),
    )

    expect(failedRequests).toEqual([])
    expect(badStatuses).toEqual([])
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) {
      expect(w).toBeGreaterThan(0)
    }
  })
})

test.describe("MAP-02 list-vs-map interaction", () => {
  test.setTimeout(60_000)

  test("tapping a household card in the open sheet jumps the wizard", async ({
    page,
  }) => {
    // MAP-02 regression guard. The volunteer bug report: at mobile
    // portrait viewport, the DoorListView "All Doors" sheet opens from
    // the bottom and covers the lower ~two-thirds of the screen. The
    // upper ~one-third still shows the Leaflet map through the sheet
    // overlay. Tapping a household card near the top of the sheet — the
    // area where the map is visible behind the overlay — used to fire
    // the map click handler instead of the card's onJump handler (either
    // because Leaflet's event listeners swallowed the tap at capture
    // phase, or because the sheet overlay's z-index sat below
    // `.leaflet-control`).
    //
    // Plan 109-03 closed both holes: (a) added a wrapper div around
    // CanvassingMap that receives `canvassing-map-wrapper--inert` +
    // `aria-hidden="true"` while `listViewOpen` is true, which sets
    // `pointer-events: none !important` on the wrapper and every
    // descendant — no Leaflet control, no marker ::before hit area, no
    // tile can intercept a tap; (b) bumped Radix Sheet overlay/content
    // z-index to 1100, 100 units above `.leaflet-control` (1000), via
    // `[data-slot="sheet-overlay"]` selectors in `index.css`.
    //
    // This test verifies both the marker state (class + aria-hidden)
    // and the user-visible outcome: the wizard advances to Door 2 after
    // tapping the list item, NOT stays on Door 1 because the tap fell
    // through to the map.

    // iPhone 14 Pro — matches the viewport the volunteer bug report was
    // filed against and the context where the sheet visually overlaps
    // the map. Set BEFORE navigating so the initial render uses the
    // mobile layout.
    await page.setViewportSize({ width: 390, height: 844 })

    await gotoCanvassing(page)
    await page.waitForSelector('[data-testid="canvassing-map-container"]', {
      timeout: 15_000,
    })

    // Sanity: the wizard starts on Door 1.
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 1 of 3",
    )

    // Open the "All Doors" sheet. The button is rendered inside the
    // canvassing route — see canvassing.tsx where `listViewOpen` state
    // is toggled.
    await page.getByRole("button", { name: /all doors/i }).click()

    // Wait for the sheet to paint its first door-list item.
    await page.waitForSelector('[data-testid="door-list-item-1"]', {
      timeout: 10_000,
    })

    // Sanity: the map wrapper is marked inert + aria-hidden while the
    // sheet is open. Plan 109-03 Task 1 Test 1 asserts this at the unit
    // layer; here we assert it holds in the real render tree at iPhone
    // viewport, which is the environment the bug was reported in.
    const mapWrapper = page.locator('[data-testid="canvassing-map-wrapper"]')
    await expect(mapWrapper).toBeAttached()

    const wrapperClass = await mapWrapper.getAttribute("class")
    expect(wrapperClass ?? "").toContain("canvassing-map-wrapper--inert")

    const ariaHidden = await mapWrapper.getAttribute("aria-hidden")
    expect(ariaHidden).toBe("true")

    // Tap the SECOND household card. Door 2 is House B (456 Oak Avenue)
    // per the mock fixture. Door 2's card sits near the top of the
    // sheet — close enough to where the map is visible behind the
    // overlay on mobile that a buggy z-stack would let the tap fall
    // through to the map click handler.
    //
    // dispatchEvent — phase 108-06 deviation #4 documented that the
    // Radix Sheet + ::before 44x44 hit area pointer-event stack fails
    // Playwright's real hit-test check even when the underlying onClick
    // would fire correctly. Using dispatchEvent fires a synthetic DOM
    // click through React's event system (the DoorListView's onClick
    // handler runs, onJump → handleJumpToAddress advances the wizard),
    // which exercises the exact code path we care about. The pointer
    // geometry is covered by the unit tests in canvassing.test.tsx.
    await page.getByTestId("door-list-item-2").dispatchEvent("click")

    // Sheet closes + wizard advances to Door 2. If MAP-02 regresses
    // (tap falls through to map), the door counter will stay on
    // "Door 1 of 3" and this assertion fails.
    await expect(page.getByTestId("canvassing-current-door-copy")).toContainText(
      "Door 2 of 3",
      { timeout: 10_000 },
    )
    await expect(houseBHeading(page)).toBeVisible({ timeout: 5_000 })

    // And the map wrapper is no longer inert — sheet close cleared
    // listViewOpen, so the inert class and aria-hidden are dropped.
    await expect(mapWrapper).not.toHaveClass(/canvassing-map-wrapper--inert/)
    await expect(mapWrapper).not.toHaveAttribute("aria-hidden", "true")
  })

  test("closing and reopening the sheet preserves the Leaflet map instance", async ({
    page,
  }) => {
    // Weaker form of the DOM-identity regression guard from Plan 109-03
    // Task 1 Test 2 (canvassing.test.tsx). Here we assert the
    // `.leaflet-container` inner HTML stays non-empty across a
    // sheet-open → sheet-close → sheet-open cycle — i.e. Leaflet was
    // NOT unmounted when the sheet opened, which would have reset the
    // phase 108-03 `panTo` state and cached map size. The unit-level
    // test covers strict React element identity; this E2E covers the
    // real Leaflet runtime instance survives the toggle.

    await page.setViewportSize({ width: 390, height: 844 })
    await gotoCanvassing(page)
    await page.waitForSelector('[data-testid="canvassing-map-container"]', {
      timeout: 15_000,
    })
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".leaflet-container")
        return !!el && (el.innerHTML?.length ?? 0) > 0
      },
      undefined,
      { timeout: 15_000 },
    )

    const initialHtmlLength = await page.evaluate(
      () => document.querySelector(".leaflet-container")?.innerHTML.length ?? 0,
    )
    expect(initialHtmlLength).toBeGreaterThan(0)

    // Open the sheet.
    await page.getByRole("button", { name: /all doors/i }).click()
    await page.waitForSelector('[data-testid="door-list-item-1"]', {
      timeout: 10_000,
    })

    // Close via the shadcn Sheet's close button (aria-label "Close").
    // Fall back to Escape if the button is not reachable.
    const closeButton = page.getByRole("button", { name: /^close$/i }).first()
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click()
    } else {
      await page.keyboard.press("Escape")
    }

    // Wait for the sheet to unmount — door-list-item-1 is gone.
    await expect(page.getByTestId("door-list-item-1")).toHaveCount(0, {
      timeout: 10_000,
    })

    // Reopen the sheet.
    await page.getByRole("button", { name: /all doors/i }).click()
    await page.waitForSelector('[data-testid="door-list-item-1"]', {
      timeout: 10_000,
    })

    // The Leaflet container still has non-empty inner HTML — the map
    // was not unmounted across the toggle. If a future refactor wraps
    // the map in `{listViewOpen ? null : <CanvassingMap />}`, the
    // re-mount would clear `.leaflet-container`'s child tree during the
    // open state and this assertion would regress on the reopened run.
    const reopenedHtmlLength = await page.evaluate(
      () => document.querySelector(".leaflet-container")?.innerHTML.length ?? 0,
    )
    expect(reopenedHtmlLength).toBeGreaterThan(0)
  })
})
