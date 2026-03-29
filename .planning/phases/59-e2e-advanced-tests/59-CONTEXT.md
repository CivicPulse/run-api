# Phase 59: E2E Advanced Tests - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated Playwright tests that validate voter import with L2 auto-mapping, all 23 filter dimensions, and every operational domain (turf CRUD, walk lists, call lists, DNC, phone banking, surveys, volunteers, volunteer tags/availability, and shifts). This phase covers requirements E2E-04, E2E-05, E2E-06, E2E-12, E2E-13, E2E-14, E2E-15, E2E-16, E2E-17, E2E-18, E2E-19 from the testing plan.

</domain>

<decisions>
## Implementation Decisions

### Turf GeoJSON Approach
- **D-01:** Turfs are created via API (`POST /turfs`) with GeoJSON polygons as the primary approach. No fragile Leaflet map-drawing automation.
- **D-02:** The GeoJSON file import UI flow (via `GeoJsonImport` component) is also tested using a fixture `.geojson` file with `setInputFiles()`.
- **D-03:** Turf verification checks that turfs appear in the turf list with correct names. No map canvas assertions — Leaflet rendering is unreliable to assert in headless mode.

### Import Test Fixtures
- **D-04:** A checked-in fixture file at `web/e2e/fixtures/l2-test-voters.csv` with 50+ rows matching the exact L2 column format from `data/example-2026-02-24.csv`. Deterministic, reviewable, version-controlled.
- **D-05:** The fixture CSV must have the same column structure as the example CSV in `data/` (55 columns including Voter ID, First Name, Last Name, party, demographics, voting history, address fields, etc.).
- **D-06:** Data validation spec (E2E-05) validates ALL 50+ imported rows against the CSV source — every row, key fields checked.

### Spec Organization & Overlap
- **D-07:** Old phase-verification specs in these domains are replaced by comprehensive new specs. Delete: `voter-import.spec.ts` (old), `phone-bank.spec.ts` (old), `volunteer-management.spec.ts` (old), `turf-creation.spec.ts`, `filter-chips.spec.ts`, and any other pre-existing specs superseded by Phase 59's canonical suite.
- **D-08:** One spec file per requirement group — 11 files total:
  1. `voter-import.spec.ts` — E2E-04 (IMP-01 through IMP-04)
  2. `data-validation.spec.ts` — E2E-05 (VAL-01, VAL-02)
  3. `voter-filters.spec.ts` — E2E-06 (FLT-01 through FLT-05)
  4. `turfs.spec.ts` — E2E-12 (TURF-01 through TURF-07)
  5. `walk-lists.spec.ts` — E2E-13 (WL-01 through WL-07)
  6. `call-lists-dnc.spec.ts` — E2E-14 (CL-01 through CL-05, DNC-01 through DNC-06)
  7. `phone-banking.spec.ts` — E2E-15 (PB-01 through PB-10)
  8. `surveys.spec.ts` — E2E-16 (SRV-01 through SRV-08)
  9. `volunteers.spec.ts` — E2E-17 (VOL-01 through VOL-08)
  10. `volunteer-tags-availability.spec.ts` — E2E-18 (VTAG-01 through VTAG-05, AVAIL-01 through AVAIL-03)
  11. `shifts.spec.ts` — E2E-19 (SHIFT-01 through SHIFT-10)

### Entity Counts & Execution Speed
- **D-09:** Follow the testing plan counts exactly: 20 shifts, 10 volunteers, 5 surveys, all 23 filter dimensions. Use API bulk creation (established in Phase 58) to keep execution fast.
- **D-10:** Filter testing: each of the 23 dimensions tested individually, plus 10 representative multi-filter combinations. Total: 33 filter test cases.

### Carrying Forward from Phase 57/58
- **D-11:** File suffix convention for role-based auth routing (`.admin.spec.ts`, `.volunteer.spec.ts`, etc.). Unsuffixed runs as owner.
- **D-12:** Domain-based naming (no phase prefix).
- **D-13:** Hybrid data strategy: seed data for reads, fresh entities for mutations.
- **D-14:** Serial within spec (`test.describe.serial`), parallel across spec files.
- **D-15:** No cleanup — fresh environment per CI run.
- **D-16:** API-based bulk entity creation for speed (create 2-3 via UI to validate form, rest via API).

### Claude's Discretion
- Which specific 10 multi-filter combinations to test (should cover diverse dimensions)
- Helper function structure for API-based entity creation across specs
- Exact rows to include in the L2 fixture CSV (must be 50+ rows with realistic L2 data)
- Which old phase-verification specs beyond the listed ones should be deleted
- GeoJSON fixture file content (valid polygon for Macon-Bibb area)
- How to structure the phone banking "active calling" flow test (UI flow without real calls)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Testing Plan
- `docs/testing-plan.md` — Comprehensive E2E testing plan with 34 sections. Phase 59 covers: Section 7 (Voter Import: IMP-01 to IMP-04), Section 8 (Data Validation: VAL-01, VAL-02), Section 9 (Voter Search & Filtering: FLT-01 to FLT-05), Section 13 (Turf Management: TURF-01 to TURF-07), Section 14 (Walk Lists: WL-01 to WL-07), Section 15 (Call Lists: CL-01 to CL-05), Section 16 (DNC: DNC-01 to DNC-06), Section 17 (Phone Banking: PB-01 to PB-10), Section 20 (Surveys: SRV-01 to SRV-08), Section 21 (Volunteers: VOL-01 to VOL-08), Section 22 (Volunteer Tags: VTAG-01 to VTAG-05), Section 23 (Availability: AVAIL-01 to AVAIL-03), Section 24 (Shifts: SHIFT-01 to SHIFT-10)

### L2 CSV Column Reference
- `data/example-2026-02-24.csv` — Reference L2 CSV with 552 rows and 55 columns. The test fixture must match this exact column structure.

### Existing Test Infrastructure (from Phase 57)
- `web/playwright.config.ts` — Playwright config with 5 role-based auth projects and shard support
- `web/e2e/auth-owner.setup.ts` — Owner auth setup (default auth context)
- `scripts/create-e2e-users.py` — 15-user provisioning script with campaign membership

### Phase 58 Specs (pattern reference)
- `web/e2e/voter-crud.spec.ts` — Demonstrates API helper pattern (`createVoterViaApi`, `deleteVoterViaApi`), `navigateToSeedCampaign()` helper, serial describe blocks
- `web/e2e/voter-contacts.spec.ts` — Contact CRUD pattern reference
- `web/e2e/voter-tags.spec.ts` — Tag lifecycle pattern reference

### GeoJSON Import Component
- `web/src/components/canvassing/map/GeoJsonImport.tsx` — File upload component that accepts Polygon geometry from GeoJSON/Feature/FeatureCollection

### Codebase Analysis
- `.planning/codebase/TESTING.md` — Testing patterns, fixtures, and conventions

### Seed Data
- `scripts/seed.py` — Idempotent Macon-Bibb County demo dataset (50 voters, 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `voter-crud.spec.ts` API helpers: `createVoterViaApi()`, `deleteVoterViaApi()`, `navigateToSeedCampaign()` — reuse across all Phase 59 specs that need campaign context
- `GeoJsonImport.tsx`: File upload component at `web/src/components/canvassing/map/GeoJsonImport.tsx` — accepts `.geojson` file via hidden input
- Phase 58 established pattern of `page.request.post/delete` for API-based entity creation within Playwright context
- Seed data provides baseline entities: 50 voters, 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts

### Established Patterns
- Role-suffix convention: `.owner.spec.ts`, `.admin.spec.ts`, etc. Unsuffixed = owner auth
- Auth via `storageState` files in `playwright/.auth/`
- Locator strategy: `page.getByRole()`, `page.getByLabel()`, `page.getByText()`
- Wait patterns: `page.waitForURL()` with regex, `expect().toBeVisible({ timeout })`
- Response interception: `page.waitForResponse()` for API call verification
- `test.describe.serial` for ordered lifecycle flows (create → edit → delete)

### Integration Points
- New specs go in `web/e2e/` alongside Phase 58 specs
- Old phase-verification specs in overlapping domains get deleted
- New fixture directory: `web/e2e/fixtures/` for L2 CSV and GeoJSON files
- CI sharding (4 shards) automatically distributes new specs

</code_context>

<specifics>
## Specific Ideas

- L2 fixture CSV must mirror `data/example-2026-02-24.csv` column structure exactly (55 columns) but can have different voter data
- Data validation spec should iterate all 50+ rows and check key fields (name, party, address, voting history) against the CSV source
- For phone banking active calling: test the UI flow (select caller, view script, record outcome) without real telephony
- GeoJSON fixture should use a polygon in the Macon-Bibb County area to match seed data geography
- 10 multi-filter combos should cover diverse dimension combinations (demographic + geographic + behavioral)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 59-e2e-advanced-tests*
*Context gathered: 2026-03-29*
