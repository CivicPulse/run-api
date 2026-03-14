# Roadmap: CivicPulse Run API

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-10)
- ✅ **v1.1 Local Dev & Deployment Readiness** — Phases 8-11 (shipped 2026-03-10)
- ✅ **v1.2 Full UI** — Phases 12-22 (shipped 2026-03-13)
- 🚧 **v1.3 Voter Model & Import Enhancement** — Phases 23-26 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Authentication and Multi-Tenancy (3/3 plans) — completed 2026-03-09
- [x] Phase 2: Voter Data Import and CRM (4/4 plans) — completed 2026-03-09
- [x] Phase 3: Canvassing Operations (4/4 plans) — completed 2026-03-09
- [x] Phase 4: Phone Banking (3/3 plans) — completed 2026-03-09
- [x] Phase 5: Volunteer Management (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Operational Dashboards (2/2 plans) — completed 2026-03-09
- [x] Phase 7: Integration Wiring Fixes (1/1 plan) — completed 2026-03-10

See: `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 Local Dev & Deployment Readiness (Phases 8-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 8: Containerization (2/2 plans) — completed 2026-03-10
- [x] Phase 9: Local Dev Environment (2/2 plans) — completed 2026-03-10
- [x] Phase 10: CI/CD Pipeline (1/1 plan) — completed 2026-03-10
- [x] Phase 11: Kubernetes & GitOps (2/2 plans) — completed 2026-03-10

See: `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Full UI (Phases 12-22) — SHIPPED 2026-03-13</summary>

- [x] Phase 12: Shared Infrastructure & Campaign Foundation (3/3 plans) — completed 2026-03-10
- [x] Phase 13: Voter Management Completion (7/7 plans) — completed 2026-03-11
- [x] Phase 14: Voter Import Wizard (4/4 plans) — completed 2026-03-11
- [x] Phase 15: Call Lists & DNC Management (6/6 plans) — completed 2026-03-11
- [x] Phase 16: Phone Banking (7/7 plans) — completed 2026-03-11
- [x] Phase 17: Volunteer Management (5/5 plans) — completed 2026-03-12
- [x] Phase 18: Shift Management (4/4 plans) — completed 2026-03-12
- [x] Phase 19: Verification & Validation Gap Closure (3/3 plans) — completed 2026-03-12
- [x] Phase 20: Caller Picker UX (2/2 plans) — completed 2026-03-12
- [x] Phase 21: Integration Polish (1/1 plan) — completed 2026-03-12
- [x] Phase 22: Final Integration Fixes (1/1 plan) — completed 2026-03-13

See: `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

### v1.3 Voter Model & Import Enhancement (In Progress)

**Milestone Goal:** Expand the voter model with first-class columns for all high-value L2 voter file fields (propensity scores, demographics, mailing address, household data, military status) and upgrade the import pipeline to auto-create phone contacts, parse voting history, and handle enriched field mapping.

- [x] **Phase 23: Schema Foundation** - Alembic migration, expanded Voter model, Pydantic schemas, VoterPhone constraint (completed 2026-03-13)
- [x] **Phase 24: Import Pipeline Enhancement** - RETURNING clause, phone creation, voting history parsing, propensity parsing, field mapping, SET clause fix (completed 2026-03-13)
- [x] **Phase 25: Filter Builder & Query Enhancement** - Propensity range filters, demographic multi-select, mailing address filters, voting history backward compat (completed 2026-03-14)
- [ ] **Phase 26: Frontend Updates** - TypeScript types, voter detail display, filter builder UI, edit sheet, column mapping

## Phase Details

### Phase 23: Schema Foundation
**Goal**: All new voter data columns exist in the database, the ORM model reflects them, and API schemas serialize/deserialize the expanded fields
**Depends on**: Phase 22 (v1.2 complete)
**Requirements**: VMOD-01, VMOD-02, VMOD-03, VMOD-04, VMOD-05, VMOD-06, VMOD-07, VMOD-08, VMOD-09, VMOD-10
**Success Criteria** (what must be TRUE):
  1. A voter record created via the API can include propensity_general, propensity_primary, and propensity_combined as integer values (0-100) and they persist and return correctly in GET responses
  2. A voter record can store and return all mailing address fields (line1, line2, city, state, zip, zip4, country, type) without error
  3. A voter record can store and return spoken_language, marital_status, military_status, party_change_indicator, cell_phone_confidence, household_party_registration, household_size, family_id, zip_plus4, and apartment_type fields
  4. Attempting to create two VoterPhone records with the same (campaign_id, voter_id, phone value) results in a conflict/update rather than a duplicate row
  5. The Alembic migration applies cleanly against a database with existing voter rows (all new columns are nullable)
**Plans**: 2 plans

Plans:
- [ ] 23-01-PLAN.md — Alembic migration, Voter/VoterPhone model updates, Pydantic schema updates
- [ ] 23-02-PLAN.md — Downstream service updates (voter, import, walk_list, turf) and test fixes

### Phase 24: Import Pipeline Enhancement
**Goal**: The CSV import pipeline auto-creates phone contacts, parses voting history and propensity scores from L2 files, and maps all new fields correctly without silent data loss
**Depends on**: Phase 23
**Requirements**: IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05, IMPT-06, IMPT-07
**Success Criteria** (what must be TRUE):
  1. Importing an L2 CSV file with a cell phone column automatically creates VoterPhone records linked to the correct voter, and those phone numbers appear in call list generation
  2. Importing an L2 CSV file with General_YYYY and Primary_YYYY columns populates the voting_history array with canonical "General_2024", "Primary_2022" format entries
  3. Importing an L2 CSV file with propensity percentage columns ("77%", "Not Eligible") stores the correct integer values (77, NULL) in the propensity columns
  4. Re-importing the same L2 file updates existing voters and phone records without creating duplicates (idempotent upsert)
  5. The upsert SET clause includes all model columns regardless of which columns appear in the first batch row (no silent column omission)
**Plans**: 3 plans

Plans:
- [ ] 24-01-PLAN.md — Utility functions (parse_propensity, normalize_phone, parse_voting_history), CANONICAL_FIELDS expansion with L2 aliases and __cell_phone
- [ ] 24-02-PLAN.md — Alembic migration 007 (phones_created column, L2 template update), ImportJob model/schema updates
- [ ] 24-03-PLAN.md — Core pipeline modifications: SET clause fix, RETURNING clause, VoterPhone creation, voting history/propensity parsing wired into apply_field_mapping and process_csv_batch

### Phase 25: Filter Builder & Query Enhancement
**Goal**: Users can filter voters by propensity score ranges, demographic attributes, and mailing address fields using the existing composable filter system
**Depends on**: Phase 23 (columns must exist), Phase 24 (voting history canonical format must be established)
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04, FILT-05
**Success Criteria** (what must be TRUE):
  1. A voter query with propensity_general_min=60 and propensity_general_max=90 returns only voters with propensity_general scores in that range
  2. A voter query filtering by ethnicity or spoken_language with multiple values returns voters matching any of the selected values
  3. A voter query filtering by mailing_city, mailing_state, or mailing_zip returns exact matches on those fields
  4. An existing saved voter list with voted_in: ["2024"] still matches voters whose voting_history contains "General_2024" or "Primary_2024" entries (backward compatibility)
**Plans**: 2 plans

Plans:
- [ ] 25-01-PLAN.md — VoterFilter schema extension (propensity ranges, demographic multi-select, mailing address), build_voter_query new conditions, registration address case-insensitive update
- [ ] 25-02-PLAN.md — Voting history backward compatibility (year-only expansion to General/Primary using overlap operator)

### Phase 26: Frontend Updates
**Goal**: The web UI displays all new voter fields, exposes filter controls for new dimensions, and supports editing and importing with the expanded schema
**Depends on**: Phase 23, Phase 24, Phase 25
**Requirements**: FRNT-01, FRNT-02, FRNT-03, FRNT-04, FRNT-05
**Success Criteria** (what must be TRUE):
  1. The voter detail page shows propensity scores, mailing address, extended demographics (language, marital status, military status), and household data in organized sections
  2. The voter filter builder includes range sliders or inputs for propensity scores and multi-select controls for ethnicity, language, and military status, grouped into collapsible filter sections
  3. The voter edit sheet allows editing all new voter fields and saves them correctly via the API
  4. The import wizard column mapping table includes all new canonical fields so users can map L2 columns to the expanded voter model
  5. TypeScript compilation succeeds with no type errors after all voter and filter interface updates
**Plans**: 4 plans

Plans:
- [ ] 26-01-PLAN.md — TypeScript types update, field rename propagation, shadcn component install, backend distinct-values endpoint
- [ ] 26-02-PLAN.md — Voter detail page expansion (propensity, mailing, household, voting history) and edit sheet expansion
- [ ] 26-03-PLAN.md — VoterFilterBuilder accordion rewrite with sliders, dynamic checkboxes, badge counts
- [ ] 26-04-PLAN.md — ColumnMappingTable grouped dropdown with human-readable labels and expanded fields

## Progress

**Execution Order:**
Phases execute in numeric order: 23 → 24 → 25 → 26

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Authentication and Multi-Tenancy | v1.0 | 3/3 | Complete | 2026-03-09 |
| 2. Voter Data Import and CRM | v1.0 | 4/4 | Complete | 2026-03-09 |
| 3. Canvassing Operations | v1.0 | 4/4 | Complete | 2026-03-09 |
| 4. Phone Banking | v1.0 | 3/3 | Complete | 2026-03-09 |
| 5. Volunteer Management | v1.0 | 3/3 | Complete | 2026-03-09 |
| 6. Operational Dashboards | v1.0 | 2/2 | Complete | 2026-03-09 |
| 7. Integration Wiring Fixes | v1.0 | 1/1 | Complete | 2026-03-10 |
| 8. Containerization | v1.1 | 2/2 | Complete | 2026-03-10 |
| 9. Local Dev Environment | v1.1 | 2/2 | Complete | 2026-03-10 |
| 10. CI/CD Pipeline | v1.1 | 1/1 | Complete | 2026-03-10 |
| 11. Kubernetes & GitOps | v1.1 | 2/2 | Complete | 2026-03-10 |
| 12. Shared Infrastructure & Campaign Foundation | v1.2 | 3/3 | Complete | 2026-03-10 |
| 13. Voter Management Completion | v1.2 | 7/7 | Complete | 2026-03-11 |
| 14. Voter Import Wizard | v1.2 | 4/4 | Complete | 2026-03-11 |
| 15. Call Lists & DNC Management | v1.2 | 6/6 | Complete | 2026-03-11 |
| 16. Phone Banking | v1.2 | 7/7 | Complete | 2026-03-11 |
| 17. Volunteer Management | v1.2 | 5/5 | Complete | 2026-03-12 |
| 18. Shift Management | v1.2 | 4/4 | Complete | 2026-03-12 |
| 19. Verification & Validation Gap Closure | v1.2 | 3/3 | Complete | 2026-03-12 |
| 20. Caller Picker UX | v1.2 | 2/2 | Complete | 2026-03-12 |
| 21. Integration Polish | v1.2 | 1/1 | Complete | 2026-03-12 |
| 22. Final Integration Fixes | v1.2 | 1/1 | Complete | 2026-03-13 |
| 23. Schema Foundation | 2/2 | Complete    | 2026-03-13 | - |
| 24. Import Pipeline Enhancement | 3/3 | Complete    | 2026-03-13 | - |
| 25. Filter Builder & Query Enhancement | 2/2 | Complete    | 2026-03-14 | - |
| 26. Frontend Updates | 1/4 | In Progress|  | - |
