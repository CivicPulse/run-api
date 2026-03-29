# Phase 59: E2E Advanced Tests - Research

**Researched:** 2026-03-29
**Domain:** Playwright E2E testing across voter import, filtering, and all operational domains
**Confidence:** HIGH

## Summary

Phase 59 adds 11 comprehensive E2E spec files covering voter import with L2 auto-mapping, all 23 filter dimensions, and every operational domain (turfs, walk lists, call lists, DNC, phone banking, surveys, volunteers, volunteer tags/availability, and shifts). This phase builds on the established infrastructure from Phase 57 (Playwright config, auth setup, 15 test users) and the patterns from Phase 58 (API helper functions, serial describe blocks, hybrid data strategy).

The key technical challenges are: (1) creating a realistic L2 fixture CSV with 50+ rows matching the exact 55-column format, (2) testing the full import wizard flow including MinIO file upload, (3) exercising all 23 voter filter dimensions with real imported data, (4) creating turf polygons via both API and GeoJSON file import, and (5) testing phone banking active calling flow without real telephony. Each domain has well-defined API endpoints and UI routes already built; the work is purely test authoring.

**Primary recommendation:** Structure the 11 spec files with self-contained API helper functions per the Phase 58 pattern. Create the L2 fixture CSV and GeoJSON fixture first, then implement specs in dependency order: import -> data validation -> filters -> turfs -> walk lists -> call lists/DNC -> phone banking -> surveys -> volunteers -> volunteer tags/availability -> shifts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Turfs created via API (`POST /turfs`) with GeoJSON polygons as primary approach. No fragile Leaflet map-drawing automation.
- **D-02:** GeoJSON file import UI flow also tested using a fixture `.geojson` file with `setInputFiles()`.
- **D-03:** Turf verification checks turfs appear in list with correct names. No map canvas assertions.
- **D-04:** Checked-in fixture file at `web/e2e/fixtures/l2-test-voters.csv` with 50+ rows matching exact L2 column format.
- **D-05:** Fixture CSV must have same column structure as `data/example-2026-02-24.csv` (55 columns).
- **D-06:** Data validation spec validates ALL 50+ imported rows against CSV source.
- **D-07:** Old phase-verification specs in these domains are replaced. Delete: `voter-import.spec.ts` (old), `phone-bank.spec.ts` (old), `volunteer-management.spec.ts` (old), `turf-creation.spec.ts`, `filter-chips.spec.ts`, and any other pre-existing specs superseded by Phase 59's canonical suite.
- **D-08:** One spec file per requirement group -- 11 files total (listed in CONTEXT.md).
- **D-09:** Follow testing plan counts exactly: 20 shifts, 10 volunteers, 5 surveys, all 23 filter dimensions. Use API bulk creation.
- **D-10:** Filter testing: each of 23 dimensions tested individually, plus 10 representative multi-filter combinations. Total: 33 filter test cases.
- **D-11:** File suffix convention for role-based auth routing.
- **D-12:** Domain-based naming (no phase prefix).
- **D-13:** Hybrid data strategy: seed data for reads, fresh entities for mutations.
- **D-14:** Serial within spec (`test.describe.serial`), parallel across spec files.
- **D-15:** No cleanup -- fresh environment per CI run.
- **D-16:** API-based bulk entity creation for speed (create 2-3 via UI to validate form, rest via API).

### Claude's Discretion
- Which specific 10 multi-filter combinations to test
- Helper function structure for API-based entity creation across specs
- Exact rows to include in the L2 fixture CSV (must be 50+ rows with realistic L2 data)
- Which old phase-verification specs beyond the listed ones should be deleted
- GeoJSON fixture file content (valid polygon for Macon-Bibb area)
- How to structure the phone banking "active calling" flow test

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-04 | Import with L2 auto-mapping, progress tracking, cancellation, concurrent prevention (IMP-01 to IMP-04) | Import wizard has 4-step flow (Upload, Map Columns, Preview, Progress). API: `initiate_import`, `detect_columns`, `confirm_mapping`, `cancel_import`, `get_import_status`. DropZone + MinIO upload via `setInputFiles()`. L2 format auto-detection returns `format_detected: "l2"`. |
| E2E-05 | Validate imported voter data accuracy for 40+ voters (VAL-01, VAL-02) | Voter model has 55+ fields matching L2 columns. Fixture CSV rows can be parsed at test time for field-by-field comparison. Voter detail page shows all mapped fields. |
| E2E-06 | All 23 filter dimensions individually and in combination (FLT-01 to FLT-05) | `VoterFilter` interface has 23 distinct dimensions across 5 sections (demographics, location, political, scoring, advanced). `VoterFilterBuilder` component renders all dimensions. Filter chip utils map each to a category. |
| E2E-12 | Turf CRUD with GeoJSON import/export, overlap detection (TURF-01 to TURF-07) | `TurfCreate` schema requires `name` + `boundary` (GeoJSON Polygon). API: `create_turf`, `list_turfs`, `get_turf`, `update_turf`, `delete_turf`, `get_turf_overlaps`. `GeoJsonImport` component uses hidden file input accepting `.geojson`. |
| E2E-13 | Walk list generation, canvasser assignment, rename, deletion (WL-01 to WL-07) | `WalkListCreate` requires `turf_id` + `name`. API: `generate_walk_list`, `list_walk_lists`, `get_walk_list`, `update_walk_list`, `assign_canvasser`, `remove_canvasser`, `delete_walk_list`. |
| E2E-14 | Call list CRUD and DNC management (CL-01 to CL-05, DNC-01 to DNC-06) | `CallListCreate` requires `name`. API: `generate_call_list`, `list_call_lists`, `update_call_list_status`, `delete_call_list`. DNC API: `list_dnc_entries`, `add_dnc_entry`, `bulk_import_dnc`, `delete_dnc_entry`, `check_dnc`. |
| E2E-15 | Phone banking session CRUD, caller assignment, active calling (PB-01 to PB-10) | `PhoneBankSessionCreate` requires `name` + `call_list_id`. API: `create_session`, `assign_caller`, `remove_caller`, `check_in`, `check_out`, `record_call`, `get_progress`. Call screen at `/phone-banking/sessions/$sessionId/call`. |
| E2E-16 | Survey script CRUD, question management, reordering, status lifecycle (SRV-01 to SRV-08) | `ScriptCreate` requires `title`. `QuestionCreate` requires `question_text` + `question_type` (multiple_choice, scale, free_text). Status lifecycle: draft -> active -> archived. API: `create_script`, `add_question`, `update_question`, `delete_question`, `reorder_questions`. |
| E2E-17 | Volunteer registration, roster, detail, edit, delete (VOL-01 to VOL-08) | `VolunteerCreate` requires `first_name` + `last_name`. API: `create_volunteer`, `list_volunteers`, `get_volunteer_detail`, `update_volunteer`, `update_volunteer_status`. Routes: `/volunteers/register`, `/volunteers/roster`, `/volunteers/$volunteerId`. |
| E2E-18 | Volunteer tag and availability CRUD (VTAG-01 to VTAG-05, AVAIL-01 to AVAIL-03) | `VolunteerTagCreate` requires `name`. `AvailabilityCreate` requires `start_at` + `end_at`. API: `create_tag`, `list_tags`, `add_tag_to_volunteer`, `remove_tag_from_volunteer`, `delete_tag`, `add_availability`, `delete_availability`, `list_availability`. |
| E2E-19 | Shift CRUD, volunteer assignment, check-in/out, hours tracking (SHIFT-01 to SHIFT-10) | `ShiftCreate` requires `name`, `type` (canvassing/phone_banking/general), `start_at`, `end_at`, `max_volunteers`. API: `create_shift`, `assign_volunteer`, `check_in`, `check_out`, `adjust_hours`, `manager_remove_volunteer`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E test framework | Already installed, project standard |
| Node.js | v24.13.1 | Runtime | Already installed |
| npm | 11.8.0 | Package manager | Already installed |

### Supporting
No additional dependencies needed. All testing infrastructure exists from Phase 57/58.

## Architecture Patterns

### Spec File Organization (11 files)
```
web/e2e/
  fixtures/
    l2-test-voters.csv          # 50+ row L2 fixture (55 columns)
    macon-bibb-turf.geojson     # GeoJSON Polygon for turf import test
  voter-import.spec.ts          # E2E-04: IMP-01 to IMP-04
  data-validation.spec.ts       # E2E-05: VAL-01, VAL-02
  voter-filters.spec.ts         # E2E-06: FLT-01 to FLT-05
  turfs.spec.ts                 # E2E-12: TURF-01 to TURF-07
  walk-lists.spec.ts            # E2E-13: WL-01 to WL-07
  call-lists-dnc.spec.ts        # E2E-14: CL-01 to CL-05, DNC-01 to DNC-06
  phone-banking.spec.ts         # E2E-15: PB-01 to PB-10
  surveys.spec.ts               # E2E-16: SRV-01 to SRV-08
  volunteers.spec.ts            # E2E-17: VOL-01 to VOL-08
  volunteer-tags-availability.spec.ts  # E2E-18: VTAG-01 to VTAG-05, AVAIL-01 to AVAIL-03
  shifts.spec.ts                # E2E-19: SHIFT-01 to SHIFT-10
```

### Pattern 1: Self-Contained API Helpers Per Spec
**What:** Each spec file contains its own API helper functions for entity creation/deletion, following the Phase 58 pattern. No shared helper module across specs.
**When to use:** Every Phase 59 spec file.
**Why:** Specs run in parallel across files. Self-contained helpers prevent cross-spec coupling and make each file independently understandable.
**Example:**
```typescript
// From voter-crud.spec.ts (Phase 58 reference pattern)
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
```

### Pattern 2: API Helper Factory for Each Domain
**What:** Each domain spec creates domain-specific API helpers following the same cookie-forwarding pattern.
**When to use:** turfs, walk lists, call lists, phone bank sessions, surveys, volunteers, shifts, DNC.
**Example (turf domain):**
```typescript
async function createTurfViaApi(
  page: Page,
  campaignId: string,
  data: { name: string; boundary: object; description?: string },
): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/turfs`,
    {
      data,
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return body.id
}
```

### Pattern 3: Serial Describe Blocks with Shared State
**What:** `test.describe.serial` for ordered lifecycle operations. State (IDs, campaign context) shared via `let` variables in the outer scope.
**When to use:** Every spec file that has create -> modify -> delete lifecycle tests.
**Example:**
```typescript
test.describe.serial("Survey lifecycle", () => {
  let campaignId = ""
  let surveyId = ""

  test.setTimeout(120_000)

  test("Setup: navigate to seed campaign", async ({ page }) => {
    campaignId = await navigateToSeedCampaign(page)
    expect(campaignId).toBeTruthy()
  })

  test("SRV-01: Create a survey script", async ({ page }) => {
    // Create via UI...
    surveyId = extractedId
  })

  // Subsequent tests use surveyId...
})
```

### Pattern 4: File Upload via setInputFiles
**What:** Use Playwright's `setInputFiles()` for CSV import and GeoJSON import.
**When to use:** Import spec (L2 CSV upload), Turfs spec (GeoJSON import).
**Example:**
```typescript
// For the DropZone's hidden file input
const fileInput = page.locator('input[type="file"]')
await fileInput.setInputFiles('e2e/fixtures/l2-test-voters.csv')
```

### Pattern 5: navigateToSeedCampaign Helper
**What:** Standard helper to navigate to the seed campaign and extract campaignId.
**When to use:** Every spec file as the first setup step.
**Example:**
```typescript
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
```

### Anti-Patterns to Avoid
- **Shared helper module:** Do not create a shared `e2e/helpers.ts` -- each spec must be self-contained per project convention.
- **Map canvas assertions:** Do not assert on Leaflet canvas rendering (D-03). Verify turfs via list table, not map visual inspection.
- **Leaflet polygon drawing automation:** Do not automate drawing polygons on Leaflet maps (D-01). Use API creation with GeoJSON boundary objects.
- **Real telephony testing:** Do not attempt to make real phone calls. Test the UI flow of claiming entries, recording outcomes, and navigating the call screen.
- **CSS selector locators:** Use `getByRole()`, `getByLabel()`, `getByText()` per project convention. Avoid CSS selectors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload testing | Manual DOM event dispatch | `page.locator('input[type="file"]').setInputFiles()` | Playwright built-in, handles all edge cases |
| Response waiting | `page.waitForTimeout()` sleeps | `page.waitForResponse()` for API call verification | Deterministic, no flaky timing |
| Navigation waiting | Arbitrary delays | `page.waitForURL(/pattern/)` | Deterministic URL-based waiting |
| Entity creation for test setup | UI form filling for every entity | `page.request.post()` API calls | 10x faster, avoids UI flakiness |
| Cookie forwarding | Manual token extraction | `page.context().cookies()` + `Cookie` header | Established pattern, works with auth setup |

## Common Pitfalls

### Pitfall 1: Import Progress Polling Timeout
**What goes wrong:** The import wizard polls `get_import_status` for completion. With 50+ rows the import may take several seconds. Tests timeout waiting for "Complete" status.
**Why it happens:** Default `actionTimeout` is 30s, but the import polling + processing chain can exceed expectations.
**How to avoid:** Use `test.setTimeout(180_000)` for the import spec. Use `page.waitForResponse()` to wait for the status endpoint returning `completed` status, or poll with `expect(...).toContainText('Complete', { timeout: 60_000 })`.
**Warning signs:** Timeout errors in the import progress step.

### Pitfall 2: MinIO Upload Timing
**What goes wrong:** The DropZone uploads to MinIO via XHR, then the import wizard calls `detect_columns`. If the spec proceeds too fast, the upload may not be complete.
**Why it happens:** `setInputFiles()` triggers the file input change event, which starts an async upload chain.
**How to avoid:** After `setInputFiles()`, wait for the wizard to advance to Step 2 (Map Columns). Use `page.waitForURL()` with the step parameter, or wait for the mapping table to become visible.
**Warning signs:** "Column detection failed" errors, step not advancing.

### Pitfall 3: Filter Dimension UI Interaction Complexity
**What goes wrong:** Different filter dimensions use different UI patterns: checkboxes (party, ethnicity), text inputs (gender, city), number inputs (age range), sliders (propensity scores), checkbox groups for voting history.
**Why it happens:** The VoterFilterBuilder uses Accordion sections with diverse input types.
**How to avoid:** Map each of the 23 dimensions to its specific UI interaction pattern:
  - **Checkbox groups:** `page.getByLabel('DEM').check()` for party
  - **Text inputs:** `page.getByPlaceholder('Gender').fill('M')` for gender
  - **Number inputs:** `page.getByPlaceholder('Min').fill('25')` for age
  - **Sliders:** Propensity sliders need `page.locator('[role="slider"]')` interaction
  - **Voting history checkboxes:** Nested within specific sections

Open the appropriate Accordion section first before interacting with filters.
**Warning signs:** Filters not being applied, elements not visible because Accordion is collapsed.

### Pitfall 4: GeoJSON Polygon Coordinate Order
**What goes wrong:** GeoJSON uses [longitude, latitude] order, not [latitude, longitude]. A polygon with swapped coordinates will be valid GeoJSON but in the wrong location.
**Why it happens:** Common confusion between GeoJSON ([lng, lat]) and most mapping APIs ([lat, lng]).
**How to avoid:** The GeoJSON fixture for Macon-Bibb County should use coordinates centered around `[-83.6324, 32.8407]` (Macon, GA). Verify the polygon is in the correct area.
**Warning signs:** Zero voter count in turfs despite valid polygon.

### Pitfall 5: Serial Test Dependency Failure Cascade
**What goes wrong:** In a `test.describe.serial` block, if an early test (e.g., "Setup") fails, all subsequent tests skip. This is correct behavior but can mask real issues.
**Why it happens:** Serial blocks are designed for ordered lifecycle tests where each depends on the previous.
**How to avoid:** Keep setup steps minimal and reliable. Use API calls for setup rather than UI interactions. If a setup test fails, the diagnostic should be clear from the first failure.
**Warning signs:** Many skipped tests in a single spec.

### Pitfall 6: Concurrent Import Prevention Timing
**What goes wrong:** IMP-03 tests that a second import is blocked while the first is in progress. But with a 50-row fixture, the first import may complete before the second can be initiated.
**Why it happens:** Small fixture processes too quickly.
**How to avoid:** The fixture CSV has 50+ rows which should take several seconds. Start the second import attempt immediately after confirming the first is processing. Use `page.waitForResponse()` to confirm the 409 response, or check the UI error message. Alternatively, test via API: initiate import, then immediately try to initiate another.
**Warning signs:** Second import succeeds (first already completed).

### Pitfall 7: Stale Old Specs Interfering
**What goes wrong:** Old phase-verification specs in overlapping domains run alongside new comprehensive specs, causing data conflicts or CI shard imbalance.
**Why it happens:** D-07 requires deleting old specs but they may be missed.
**How to avoid:** Delete all old specs explicitly as part of the first plan wave. The complete list from CONTEXT.md D-07: `voter-import.spec.ts`, `phone-bank.spec.ts`, `volunteer-management.spec.ts`, `turf-creation.spec.ts`, `filter-chips.spec.ts`. Additional candidates for deletion: `phone-banking-verify.spec.ts`, `volunteer-verify.spec.ts`, `shift-verify.spec.ts`, `shift-assign-debug.spec.ts`, `voter-search.spec.ts`.
**Warning signs:** Duplicate test names, unexpected data state.

## Code Examples

### L2 Fixture CSV Structure (55 columns)
The fixture CSV must match the exact column headers from `data/example-2026-02-24.csv`:
```
Voter ID,First Name,Last Name,Registered Party,Gender,Age,Likelihood to vote,Primary Likelihood to Vote,Combined General and Primary Likelihood to Vote,Apartment Type,Ethnicity,Lattitude,Longitude,Household Party Registration,Mailing Household Size,Street Number Odd/Even,Cell Phone,Cell Phone Confidence Code,Voter Changed Party?,Spoken Language,Address,Second Address Line,House Number,City,State,Zipcode,Zip+4,Mailing Address,Mailing Address Extra Line,Mailing City,Mailing State,Mailing Zip,Mailing Zip+4,Mailing Bar Code,Mailing Verifier,Mailing House Number,Mailing Address Prefix,Mailing Street Name,Mailng Designator,Mailing Suffix Direction,Mailing Aptartment Number,Mailing Apartment Type,Marital Status,Mailing Family ID,Mailing_Families_HHCount,Mailing Household Party Registration,Military Active/Veteran,General_2024,Voted in 2022,Voted in 2020,Voted in 2018,Primary_2024,Voted in 2022 Primary,Voter in 2020 Primary,Voted in 2018 Primary
```

Note the typos in the original L2 format: "Lattitude", "Mailng Designator", "Mailing Aptartment Number" -- the fixture MUST preserve these exact spellings for L2 auto-detection to work.

### GeoJSON Fixture for Macon-Bibb County
```json
{
  "type": "Feature",
  "properties": { "name": "E2E Test Turf" },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-83.68, 32.87],
      [-83.62, 32.87],
      [-83.62, 32.82],
      [-83.68, 32.82],
      [-83.68, 32.87]
    ]]
  }
}
```
This covers a rectangular area in northwestern Macon-Bibb County, approximately 6km x 5.5km. The `GeoJsonImport` component accepts Feature, FeatureCollection, or raw Geometry types and extracts the Polygon.

### Turf Creation via API
```typescript
const MACON_POLYGONS = {
  north: {
    type: "Polygon",
    coordinates: [[[-83.67, 32.87], [-83.61, 32.87], [-83.61, 32.84], [-83.67, 32.84], [-83.67, 32.87]]],
  },
  south: {
    type: "Polygon",
    coordinates: [[[-83.67, 32.82], [-83.61, 32.82], [-83.61, 32.79], [-83.67, 32.79], [-83.67, 32.82]]],
  },
  // ... east, west, central
}

async function createTurfViaApi(page: Page, campaignId: string, name: string, boundary: object): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/turfs`,
    { data: { name, boundary }, headers: { Cookie: cookieHeader, "Content-Type": "application/json" } },
  )
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}
```

### Walk List Generation via API
```typescript
async function generateWalkListViaApi(page: Page, campaignId: string, turfId: string, name: string): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/walk-lists`,
    { data: { turf_id: turfId, name }, headers: { Cookie: cookieHeader, "Content-Type": "application/json" } },
  )
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}
```

### Phone Bank Session Creation via API
```typescript
async function createSessionViaApi(page: Page, campaignId: string, name: string, callListId: string): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/phone-banks`,
    { data: { name, call_list_id: callListId }, headers: { Cookie: cookieHeader, "Content-Type": "application/json" } },
  )
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}
```

### Volunteer Creation via API
```typescript
async function createVolunteerViaApi(page: Page, campaignId: string, data: { first_name: string; last_name: string; [key: string]: unknown }): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/volunteers`,
    { data, headers: { Cookie: cookieHeader, "Content-Type": "application/json" } },
  )
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}
```

### Shift Creation via API
```typescript
async function createShiftViaApi(page: Page, campaignId: string, data: {
  name: string; type: string; start_at: string; end_at: string; max_volunteers: number;
  [key: string]: unknown;
}): Promise<string> {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
  const resp = await page.request.post(
    `https://localhost:4173/api/v1/campaigns/${campaignId}/shifts`,
    { data, headers: { Cookie: cookieHeader, "Content-Type": "application/json" } },
  )
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}
```

### Filter Dimension Testing Pattern
```typescript
// Open filter panel accordion section first
await page.getByRole("button", { name: /demographics/i }).click()

// Test a checkbox filter (party)
await page.getByLabel("DEM").check()
await page.waitForResponse(/voters/)
// Verify results changed
await expect(page.getByRole("table")).toBeVisible()
// Check filter chip appeared
await expect(page.getByText(/DEM/)).toBeVisible()
// Clear
await page.getByLabel("DEM").uncheck()
```

### Data Validation Pattern (CSV Parsing at Test Time)
```typescript
import { readFileSync } from "fs"
import { resolve } from "path"

function parseFixtureCSV(): Array<Record<string, string>> {
  const csv = readFileSync(resolve(__dirname, "fixtures/l2-test-voters.csv"), "utf-8")
  const [header, ...rows] = csv.split("\n").filter(Boolean)
  const columns = header.split(",")
  return rows.map((row) => {
    const values = row.split(",")
    const record: Record<string, string> = {}
    columns.forEach((col, i) => { record[col] = values[i] ?? "" })
    return record
  })
}
```

## API Endpoint Reference

| Domain | Base URL | Key Endpoints |
|--------|----------|---------------|
| Imports | `/api/v1/campaigns/{cid}/imports` | POST (initiate), POST `/{jid}/detect` (columns), POST `/{jid}/confirm` (mapping), POST `/{jid}/cancel`, GET `/{jid}` (status) |
| Voters | `/api/v1/campaigns/{cid}/voters` | GET (list with filters), GET `/{vid}` (detail) |
| Turfs | `/api/v1/campaigns/{cid}/turfs` | POST, GET, GET `/{tid}`, PATCH `/{tid}`, DELETE `/{tid}`, GET `/{tid}/overlaps` |
| Walk Lists | `/api/v1/campaigns/{cid}/walk-lists` | POST, GET, GET `/{wid}`, PATCH `/{wid}`, DELETE `/{wid}`, POST `/{wid}/canvassers`, DELETE `/{wid}/canvassers/{uid}` |
| Call Lists | `/api/v1/campaigns/{cid}/call-lists` | POST, GET, GET `/{clid}`, PATCH `/{clid}`, DELETE `/{clid}` |
| DNC | `/api/v1/campaigns/{cid}/dnc` | GET, POST, POST `/bulk`, DELETE `/{did}`, POST `/check` |
| Phone Banks | `/api/v1/campaigns/{cid}/phone-banks` | POST, GET, GET `/{sid}`, PATCH `/{sid}`, DELETE never mentioned, POST `/{sid}/callers`, DELETE `/{sid}/callers/{uid}`, POST `/{sid}/calls` |
| Surveys | `/api/v1/campaigns/{cid}/surveys` | POST, GET, GET `/{sid}`, PATCH `/{sid}`, DELETE `/{sid}`, POST `/{sid}/questions`, PATCH `/{sid}/questions/{qid}`, DELETE `/{sid}/questions/{qid}`, POST `/{sid}/questions/reorder` |
| Volunteers | `/api/v1/campaigns/{cid}/volunteers` | POST, GET, GET `/{vid}`, PATCH `/{vid}`, POST `/tags`, GET `/tags`, PATCH `/tags/{tid}`, DELETE `/tags/{tid}`, POST `/{vid}/tags/{tid}`, DELETE `/{vid}/tags/{tid}`, POST `/{vid}/availability`, DELETE `/{vid}/availability/{aid}`, GET `/{vid}/availability` |
| Shifts | `/api/v1/campaigns/{cid}/shifts` | POST, GET, GET `/{sid}`, PATCH `/{sid}`, DELETE `/{sid}`, POST `/{sid}/volunteers`, DELETE `/{sid}/volunteers/{vid}`, POST `/{sid}/check-in/{vid}`, POST `/{sid}/check-out/{vid}`, POST `/{sid}/hours/{vid}` |

## 23 Filter Dimensions Enumeration

Based on `VoterFilter` interface and `VoterFilterBuilder` component:

| # | Dimension | UI Component | Filter Key | Category |
|---|-----------|-------------|------------|----------|
| 1 | Party | Checkbox group (DEM, REP, NPA, LIB, GRN, OTH) | `parties` | demographics |
| 2 | Gender | Text input | `gender` | demographics |
| 3 | Age Min | Number input | `age_min` | demographics |
| 4 | Age Max | Number input | `age_max` | demographics |
| 5 | Ethnicity | Dynamic checkbox group | `ethnicities` | demographics |
| 6 | Spoken Language | Dynamic checkbox group | `spoken_languages` | demographics |
| 7 | Military Status | Dynamic checkbox group | `military_statuses` | demographics |
| 8 | Registration City | Text input | `registration_city` | location |
| 9 | Registration State | Text input | `registration_state` | location |
| 10 | Registration Zip | Text input | `registration_zip` | location |
| 11 | Registration County | Text input | `registration_county` | location |
| 12 | Precinct | Text input | `precinct` | location |
| 13 | Mailing City | Text input | `mailing_city` | location |
| 14 | Mailing State | Text input | `mailing_state` | location |
| 15 | Mailing Zip | Text input | `mailing_zip` | location |
| 16 | Congressional District | Text input | `congressional_district` | political |
| 17 | Voted In | Year checkbox group | `voted_in` | political |
| 18 | Not Voted In | Year checkbox group | `not_voted_in` | political |
| 19 | Propensity General | Dual slider (min/max) | `propensity_general_min/max` | scoring |
| 20 | Propensity Primary | Dual slider (min/max) | `propensity_primary_min/max` | scoring |
| 21 | Propensity Combined | Dual slider (min/max) | `propensity_combined_min/max` | scoring |
| 22 | Has Phone | Boolean toggle | `has_phone` | advanced |
| 23 | Tags | Tag badge selector | `tags` | advanced |

Note: The testing plan's 23 dimensions from FLT-02 map slightly differently -- it lists "Voted in 2022 Primary" as a separate dimension from "General_2024". In the UI, voting history is one dimension with year checkboxes for "Voted in" and "Not voted in." The implementation should count each filterable field in the VoterFilterBuilder as one dimension. Age min/max count as one combined dimension per the testing plan ("Age range"), making the count: party, gender, age_range, propensity_general, propensity_primary, propensity_combined, has_phone, has_no_phone, voted_in, voted_in_primary, voted_in_multiple, registration_city, registration_state, registration_zip, ethnicity, spoken_language, marital_status, household_size, household_party, military, party_change, odd_even, apartment_type = 23.

The testing plan FLT-02 lists these 23 dimensions explicitly. Several (marital_status, household_size, household_party, party_change, odd_even, apartment_type) appear in the testing plan but may not have corresponding UI filter controls in `VoterFilterBuilder`. These dimensions may need to be tested via API query parameters or may require identifying additional UI filter fields not in the current builder. The planner should verify which of these 23 are accessible in the current UI and handle any gaps.

## Old Specs to Delete

Per D-07 (explicitly listed):
1. `web/e2e/voter-import.spec.ts` (109 lines) -- mock-based, superseded by real import spec
2. `web/e2e/phone-bank.spec.ts` (110 lines) -- superseded by phone-banking.spec.ts
3. `web/e2e/volunteer-management.spec.ts` (568 lines) -- superseded by volunteers.spec.ts + volunteer-tags-availability.spec.ts
4. `web/e2e/turf-creation.spec.ts` (111 lines) -- superseded by turfs.spec.ts
5. `web/e2e/filter-chips.spec.ts` (193 lines) -- superseded by voter-filters.spec.ts

Additional candidates for deletion (overlapping domains, old phase-verification):
6. `web/e2e/phone-banking-verify.spec.ts` (112 lines) -- old phase verification for phone banking
7. `web/e2e/volunteer-verify.spec.ts` (108 lines) -- old phase verification for volunteers
8. `web/e2e/shift-verify.spec.ts` (87 lines) -- old phase verification for shifts
9. `web/e2e/shift-assign-debug.spec.ts` (80 lines) -- debug spec for shift assignment
10. `web/e2e/voter-search.spec.ts` (92 lines) -- superseded by voter-filters.spec.ts (covers FLT-01 text search)

Total: 10 specs to delete, ~1,560 lines removed.

## Spec Dependency Chain

Some specs depend on data created by earlier specs or the seed data. Within a single CI run:

```
1. voter-import.spec.ts       -- imports 50+ voters from fixture CSV (creates import data)
2. data-validation.spec.ts    -- reads imported voter data (depends on import having run)
3. voter-filters.spec.ts      -- filters imported + seed voters (needs voters in DB)
4. turfs.spec.ts              -- creates turfs via API (independent, uses seed voter coordinates)
5. walk-lists.spec.ts         -- generates walk lists from turfs (needs turfs from #4 OR seed turfs)
6. call-lists-dnc.spec.ts     -- creates call lists and DNC entries (independent)
7. phone-banking.spec.ts      -- creates sessions from call lists (needs call lists)
8. surveys.spec.ts            -- creates survey scripts (independent)
9. volunteers.spec.ts         -- creates volunteers (independent)
10. volunteer-tags-availability.spec.ts  -- manages volunteer tags/availability (needs volunteers)
11. shifts.spec.ts            -- creates shifts, assigns volunteers (needs volunteers)
```

Since specs run in parallel across files (D-14), each spec MUST be self-contained using seed data or its own API-created entities. The import spec creates its own data. The data validation spec should either:
- Import its own data (duplicate import), OR
- Use the seed data voters (already present), OR
- Reference the fixture CSV directly for expected values

**Recommendation:** The data validation spec should use the fixture CSV for expected values and import its own copy of the data. This avoids cross-spec dependency on import execution order.

However, if the planner decides the import and data validation specs should share a dependency (import runs first, validation reads results), they can be structured so the validation spec imports its own copy OR reads seed voters that match known values.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock-based E2E (api route mocking) | Real API interaction with seed data | Phase 57-58 | Tests validate actual system behavior |
| Page Object Model | Inline helpers per spec file | Phase 57 decision | Each spec self-contained, no shared abstractions |
| UI-only entity creation | Hybrid: 2-3 UI + rest API | Phase 58 | 10x faster test execution |
| Phase-prefixed spec names | Domain-based names | Phase 57 decision | Cleaner naming, no phase coupling |

## Open Questions

1. **Filter dimensions gap**
   - What we know: The testing plan lists 23 specific dimensions (FLT-02) including marital_status, household_size, household_party, party_change, odd/even, apartment_type. The `VoterFilterBuilder` component has explicit UI for ~17 dimensions.
   - What's unclear: Whether the remaining 6 dimensions (marital_status, household_size, household_party, party_change, odd/even, apartment_type) have UI filter controls or only exist as API query parameters.
   - Recommendation: The planner should check whether the `VoterFilterBuilder` component's location section includes these fields. If not, they may need to be tested via URL query parameters or these dimensions may need to be documented as "API-only filters" in the spec.

2. **Import concurrent prevention timing**
   - What we know: IMP-03 requires blocking a second import while the first is in progress.
   - What's unclear: Whether 50 rows process quickly enough that the window for testing concurrency is too narrow.
   - Recommendation: Test via API (initiate two imports in quick succession) rather than full UI wizard flow for the concurrency check.

3. **Data validation spec approach**
   - What we know: D-06 requires validating ALL 50+ imported rows. VAL-01 + VAL-02 from testing plan specify 40 + 20 voters = 60 total, but our fixture has 50+.
   - What's unclear: Whether to loop through all rows programmatically or test a representative sample.
   - Recommendation: Parse the fixture CSV at test time, import via the wizard, then programmatically verify each row by searching for the voter and checking key fields. Use API endpoint to fetch voter by name for faster verification than navigating to each voter's detail page.

## Project Constraints (from CLAUDE.md)

- **Python tooling:** Use `uv` for all Python commands (not relevant to this phase but noted)
- **Linting:** Use `ruff` to lint Python code (not relevant to this phase)
- **Git:** Commit after each task/phase completion; use branches (currently on `gsd/v1.7-testing-validation`)
- **No push:** Never push to GitHub unless specifically requested
- **Conventional Commits:** Required for commit messages
- **Screenshots:** After UI changes, verify with Playwright MCP (this phase creates tests, not UI changes)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.58.2 |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test <spec-file> --project=chromium` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-04 | L2 import with auto-mapping, progress, cancel, concurrent | e2e | `cd web && npx playwright test voter-import.spec.ts --project=chromium` | Wave 0 |
| E2E-05 | Imported voter data accuracy validation | e2e | `cd web && npx playwright test data-validation.spec.ts --project=chromium` | Wave 0 |
| E2E-06 | 23 filter dimensions + combinations | e2e | `cd web && npx playwright test voter-filters.spec.ts --project=chromium` | Wave 0 |
| E2E-12 | Turf CRUD with GeoJSON | e2e | `cd web && npx playwright test turfs.spec.ts --project=chromium` | Wave 0 |
| E2E-13 | Walk list lifecycle | e2e | `cd web && npx playwright test walk-lists.spec.ts --project=chromium` | Wave 0 |
| E2E-14 | Call list + DNC management | e2e | `cd web && npx playwright test call-lists-dnc.spec.ts --project=chromium` | Wave 0 |
| E2E-15 | Phone banking sessions + calling | e2e | `cd web && npx playwright test phone-banking.spec.ts --project=chromium` | Wave 0 |
| E2E-16 | Survey script management | e2e | `cd web && npx playwright test surveys.spec.ts --project=chromium` | Wave 0 |
| E2E-17 | Volunteer management | e2e | `cd web && npx playwright test volunteers.spec.ts --project=chromium` | Wave 0 |
| E2E-18 | Volunteer tags + availability | e2e | `cd web && npx playwright test volunteer-tags-availability.spec.ts --project=chromium` | Wave 0 |
| E2E-19 | Shift management + check-in/out | e2e | `cd web && npx playwright test shifts.spec.ts --project=chromium` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test <modified-spec> --project=chromium`
- **Per wave merge:** `cd web && npx playwright test --project=chromium`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/fixtures/l2-test-voters.csv` -- 50+ row L2 fixture
- [ ] `web/e2e/fixtures/macon-bibb-turf.geojson` -- GeoJSON polygon fixture
- [ ] Delete 10 old specs that are superseded

## Sources

### Primary (HIGH confidence)
- Project codebase direct inspection: Playwright config, existing Phase 58 specs, API route files, Pydantic schemas, TypeScript types, VoterFilterBuilder component, GeoJsonImport component, import wizard page, DropZone component
- `data/example-2026-02-24.csv` -- L2 CSV column structure (55 columns, 552 rows including header)
- `docs/testing-plan.md` -- Comprehensive testing plan with all test case definitions

### Secondary (MEDIUM confidence)
- Playwright 1.58.2 API -- `setInputFiles()`, `page.request.post()`, `test.describe.serial` patterns verified via existing project usage

### Tertiary (LOW confidence)
- None -- all findings verified against project codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- using existing Playwright 1.58.2, no new dependencies
- Architecture: HIGH -- follows established Phase 58 patterns exactly
- Pitfalls: HIGH -- identified from actual project code analysis (import flow, filter UI, GeoJSON format)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- test infrastructure is set, only spec authoring needed)
