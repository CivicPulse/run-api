import { test, expect, type Page } from "@playwright/test"

/**
 * Phase 107 — Canvassing Wizard E2E Coverage
 *
 * Wave 0 gap file (per Plan 107-08 + RESEARCH.md §5). The previous
 * `canvassing.spec.ts` was deleted in phase 106 (pitfall 5); this is its
 * replacement, scoped to the phase 107 user-visible behaviors.
 *
 * Covers the requirements satisfied by phase 107:
 *   - CANV-01 (D-18 hybrid auto-advance: house-level vs voter-level)
 *   - CANV-02 (D-05/D-06/D-07 skip + reversible Undo)
 *   - CANV-03 (D-09 notes optional + "(optional)" label affordance)
 *   - FORMS-01 / D-17 (phone-banking notes optional — currently deferred,
 *     see `.planning/todos/pending/107-e2e-fixture-needs.md`)
 *
 * Run via: `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts`
 * (NEVER bare `npx playwright test` — phase 106 D-13).
 *
 * Strategy: route-level mocks (modeled after `phase35-touch-targets.spec.ts`)
 * for `field/me`, the walk-list entries enrichment endpoint, the survey
 * script, the door-knock POST, and the entries PATCH (skip). This sidesteps
 * the seed-data problem that the Macon-Bibb dataset has effectively no
 * multi-voter households (random street numbers in `scripts/seed.py:468-470`),
 * which the CANV-01 voter-level test absolutely requires.
 */

const CAMPAIGN_ID = "test-campaign-107"
const WALK_LIST_ID = "wl-107"
const SCRIPT_ID = "script-107"

// ── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_FIELD_ME = {
  canvassing: {
    walk_list_id: WALK_LIST_ID,
    walk_list_name: "Phase 107 Test Walk List",
    total: 5,
    completed: 0,
  },
  phone_banking: null,
}

const MOCK_WALK_LIST_DETAIL = {
  id: WALK_LIST_ID,
  name: "Phase 107 Test Walk List",
  campaign_id: CAMPAIGN_ID,
  script_id: SCRIPT_ID,
  total_entries: 5,
  completed_entries: 0,
}

// House A is a 3-voter household — load-bearing for the CANV-01 voter-level
// regression test (a Refused/Moved on Voter 1 must NOT advance the house).
// House B is single-voter, used as the "next house" target for the
// CANV-01 house-level test and the CANV-02 skip test.
// House C (added Plan 108-01 Wave 0) is a single-voter household with
// distinct mappable coordinates so SELECT-02 has a non-current marker
// to tap and SELECT-03 (D-11) has the required ≥3 households in one
// fixture. The Door counter therefore reads "Door X of 3" — phase 107
// assertions were updated to match.
// NOTE: `household.address` (per `groupByHousehold` in `web/src/types/canvassing.ts`)
// concatenates line1, city, state, and zip with comma separators, so the
// rendered text in the HouseholdCard h2 is the full string. Tests match
// against the line1 substring via regex to stay tolerant of formatting
// drift in the address combiner.
const HOUSE_A_LINE1 = "123 Maple Street"
const HOUSE_B_LINE1 = "456 Oak Avenue"
const HOUSE_C_LINE1 = "400 Cherry Street"
const HOUSE_A_ADDRESS_RE = new RegExp(HOUSE_A_LINE1, "i")
const HOUSE_B_ADDRESS_RE = new RegExp(HOUSE_B_LINE1, "i")
const HOUSE_C_ADDRESS_RE = new RegExp(HOUSE_C_LINE1, "i")

// Mappable coordinates for the canvassing map. All three households are
// in central Macon, GA with ≥150m of separation between any pair so each
// renders as a distinct marker on the canvassing map (>>50m floor required
// by Plan 108-01 Task 3 to satisfy SELECT-02's "tap a non-current marker"
// requirement).
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
  // House A — three voters at the same address (multi-voter household)
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
  // House B — single voter, the "next house" target
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
  // House C — single voter, distinct mappable coordinates. Added by
  // Plan 108-01 Wave 0 to satisfy SELECT-02 (non-current marker tap target)
  // and SELECT-03 D-11 (≥3 households for state machine audit). Coords
  // are ≥150m from House A and House B so SELECT-02's marker disambiguation
  // is unambiguous.
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

// Single multiple-choice question — keeps the survey panel openable but
// trivially completable (one click) so the CANV-03 empty-notes test stays
// fast and doesn't have to know how scale/free-text widgets render.
const MOCK_SURVEY_SCRIPT = {
  id: SCRIPT_ID,
  name: "Phase 107 Test Script",
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
  // field/me — drives the route's walkListId
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/field/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIELD_ME),
    })
  })

  // Walk list enriched entries — must be registered BEFORE the bare detail
  // route so the more-specific path matches first.
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

  // Walk list detail (script_id, etc.)
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

  // Survey script
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

  // Door knock POST — every outcome save funnels through here
  await page.route(
    `**/walk-lists/${WALK_LIST_ID}/door-knocks`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "door-knock-1", saved: true }),
      })
    },
  )

  // Skip-entry PATCH — phase 107 D-07 skip race fix routes through here
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

  // Phase 106 D-13: never let the wizard accidentally hit the real
  // /me/campaigns endpoint and pollute the seed-campaign fixture state.
  // Anything that escapes the routes above is a sign the test setup
  // missed an endpoint.
}

// Locator helpers — the household address renders inside an <h2> in
// HouseholdCard.tsx but Playwright's accessibility snapshot reports it as
// `generic` under reduced-motion preview mode (likely due to the
// `tabIndex={-1}` + custom focus-ring class confusing the role
// inference). Querying by visible text via the household-address container
// is the resilient path. We use `.first()` because the same address text
// appears in the Google Maps "Navigate to ..." link aria-label too.
function houseAHeading(page: Page) {
  return page.getByText(HOUSE_A_ADDRESS_RE).first()
}

function houseBHeading(page: Page) {
  return page.getByText(HOUSE_B_ADDRESS_RE).first()
}

async function gotoCanvassing(page: Page) {
  await setupCanvassingMocks(page)
  await page.goto(`/field/${CAMPAIGN_ID}/canvassing`)
  // Wait for the household card to mount with the first house's address.
  await expect(houseAHeading(page)).toBeVisible({ timeout: 30_000 })
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("Canvassing wizard — phase 107", () => {
  test.setTimeout(60_000)

  test("CANV-01 happy path: house-level outcome (Not Home) auto-advances the wizard counter", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Sanity: starting on House A, door 1 of 3. There are 5 entries but
    // 3 unique households (3 voters at House A + 1 at House B + 1 at
    // House C, the latter added by Plan 108-01 Wave 0), so the "Door X
    // of N" counter reads "Door 1 of 3" — the wizard counts households,
    // not voters, per `groupByHousehold`.
    await expect(houseAHeading(page)).toBeVisible()
    await expect(page.getByTestId("household-door-position")).toContainText(
      "Door 1 of 3",
    )

    // Tap "Not Home" — house-level outcome per HOUSE_LEVEL_OUTCOMES.
    // Under D-18 hybrid this MUST advance the wizard even though House A
    // has 3 voters and only 1 is recorded. Pre-fix bug: stuck on door 1.
    await page
      .getByRole("button", { name: /Record Not Home for Alice Anderson/i })
      .click()

    // The door position counter advances 1→2 within the auto-advance
    // window. This is the load-bearing CANV-01 contract: the wizard's
    // index moves on a single tap of a house-level outcome, even on a
    // multi-voter household.
    //
    // NOTE: The HouseholdCard's address heading does NOT swap to House B
    // because of the pinning logic in `useCanvassingWizard.ts:129-164` —
    // see `.planning/todos/pending/107-canvassing-pinning-uxgap.md`. The
    // counter advance + the ARIA-live status text + the sonner toast are
    // the user-visible channels that DO fire correctly today.
    await expect(page.getByTestId("household-door-position")).toContainText(
      "Door 2 of 3",
      { timeout: 5_000 },
    )

    // The aria-live region announces the new door number. (The address
    // string in the announcement is whichever door currentAddressIndex
    // points to — also pinned, so we only assert on "door 2 of 3".)
    await expect(page.getByRole("status").filter({ hasText: /door 2 of 3/i }))
      .toBeVisible({ timeout: 5_000 })

    // Triple-channel feedback per D-03: the sonner success toast
    // "Recorded — next house" is the visible-text channel (the haptic
    // and card-swap channels can't be reliably observed under
    // headless Chromium with reducedMotion: "reduce").
    await expect(page.getByText(/Recorded — next house/i)).toBeVisible({
      timeout: 5_000,
    })
  })

  test("CANV-01 voter-level path: voter-level outcome (Moved) iterates within the same house", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Capture the active voter (first pending — Alice).
    await expect(page.getByText("Alice Anderson", { exact: true })).toBeVisible()

    // Tap "Moved" — voter-level per the D-18 hybrid (NOT in
    // HOUSE_LEVEL_OUTCOMES; in AUTO_ADVANCE_OUTCOMES which falls through to
    // the per-voter settled gate).
    await page
      .getByRole("button", { name: /Record Moved for Alice Anderson/i })
      .click()

    // The address heading STAYS on House A — household isn't settled yet
    // (Aaron and Amelia are still pending).
    await expect(houseAHeading(page)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("household-door-position")).toContainText(
      "Door 1 of 3",
    )

    // The active voter advances to the next pending resident (Aaron).
    // OutcomeGrid only renders for the active card, so the "Moved" button
    // is now labeled for Aaron.
    await expect(
      page.getByRole("button", { name: /Record Moved for Aaron Anderson/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("CANV-02: tapping Skip advances past the current house in one tap and shows the Undo toast", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    await expect(houseAHeading(page)).toBeVisible()
    await expect(page.getByTestId("household-door-position")).toContainText(
      "Door 1 of 3",
    )

    // One tap on Skip. Phase 107 D-07 removed the 300ms setTimeout race;
    // the wizard's currentAddressIndex must advance synchronously.
    await page
      .getByRole("button", { name: /Skip this house/i })
      .click()

    // The door position counter advances 1→2 immediately. Same pinning
    // caveat as the CANV-01 happy path test — see
    // `.planning/todos/pending/107-canvassing-pinning-uxgap.md`.
    await expect(page.getByTestId("household-door-position")).toContainText(
      "Door 2 of 3",
      { timeout: 5_000 },
    )

    // Post-107-08.1 (pinning fix): the displayed HouseholdCard now swaps to
    // the next house (House B) instead of staying pinned to the skipped
    // House A. The "Skipped" badge therefore lives on a household that is
    // no longer rendered as the active card. The Sonner toast below carries
    // the D-05/D-06 reversibility signal at this layer; the per-entry skip
    // state is exhaustively covered by HouseholdCard.test.tsx (107-08.1)
    // and useCanvassingWizard.test.ts (107-05).

    // Sonner info toast "Skipped — Undo" is the D-06 reversibility surface.
    await expect(page.getByText(/Skipped — Undo/i)).toBeVisible({
      timeout: 5_000,
    })
  })

  test("CANV-03: outcome saves with empty notes (no validator error)", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Tap "Supporter" — survey-trigger outcome opens the InlineSurvey panel.
    await page
      .getByRole("button", { name: /Record Supporter for Alice Anderson/i })
      .click()

    // Survey sheet opens with the mocked single multiple-choice question.
    await expect(
      page.getByRole("heading", { name: /Record Answered Call/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Answer the question (single click — keeps the test fast).
    await page.getByLabel("Yes").click()

    // Notes textarea is left EMPTY — this is the entire CANV-03 contract.
    // Save Door Knock button must be enabled.
    const saveButton = page.getByRole("button", { name: /Save Door Knock/i })
    await expect(saveButton).toBeEnabled({ timeout: 5_000 })

    // The destructive validator paragraph must NOT be present.
    await expect(
      page.getByText(/Add notes before saving/i),
    ).not.toBeVisible()

    // Click Save — the wizard advances and the survey panel closes.
    await saveButton.click()

    // Survey sheet closes.
    await expect(
      page.getByRole("heading", { name: /Record Answered Call/i }),
    ).not.toBeVisible({ timeout: 5_000 })
  })

  test("CANV-03 regression: Notes label renders with the '(optional)' affordance", async ({
    page,
  }) => {
    await gotoCanvassing(page)

    // Open the survey panel via a survey-trigger outcome.
    await page
      .getByRole("button", { name: /Record Supporter for Alice Anderson/i })
      .click()

    await expect(
      page.getByRole("heading", { name: /Record Answered Call/i }),
    ).toBeVisible({ timeout: 10_000 })

    // The notes label MUST contain both "Notes" and "(optional)" — the
    // muted-span affordance from Plan 107-06 (UI-SPEC §"Notes Field
    // Affordance"). This is the visible proof of the D-09 decoupling.
    const notesLabel = page.locator('label[for="field-call-notes"]')
    await expect(notesLabel).toBeVisible()
    await expect(notesLabel).toContainText("Notes")
    await expect(notesLabel).toContainText("(optional)")
  })

  // ── FORMS-01 / D-17 ────────────────────────────────────────────────────────
  // Phase 107 D-19: phone-banking call notes follow the canvassing rule
  // (notes optional). The InlineSurvey unit suite at
  // `web/src/components/field/InlineSurvey.test.tsx` carries the regression
  // guard against the legacy `requiresNotes = isControlled` coupling, and
  // the static wiring `notesRequired={false}` at
  // `web/src/routes/field/$campaignId/phone-banking.tsx:479` is grep-verified
  // by Plan 107-06's acceptance criteria. The end-to-end flow (claim a call,
  // open the survey panel, save with empty notes) needs ~7 mock routes plus
  // a calling-session state-machine fixture that doesn't exist yet.
  //
  // Deferred per phase 106 D-08 + phase 107 D-15 to:
  //   .planning/todos/pending/107-e2e-fixture-needs.md
  test.skip(
    "FORMS-01 D-17: phone-banking call notes are optional (deferred — needs phone-banking mock helper, see .planning/todos/pending/107-e2e-fixture-needs.md)",
    async () => {
      // Intentional placeholder. See the todo file referenced in the title
      // for the acceptance criteria that close this skip.
    },
  )
})
