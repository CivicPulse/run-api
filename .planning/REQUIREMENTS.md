# Requirements: CivicPulse Run API v1.3

**Defined:** 2026-03-13
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.

## v1.3 Requirements

Requirements for Voter Model & Import Enhancement milestone. Each maps to roadmap phases.

### Voter Model

- [x] **VMOD-01**: Voter model includes propensity_general, propensity_primary, propensity_combined as SmallInteger (0-100) first-class columns
- [x] **VMOD-02**: Voter model includes mailing address fields (line1, line2, city, state, zip, zip4, country, type) as first-class columns
- [x] **VMOD-03**: Voter model includes spoken_language as first-class String column
- [x] **VMOD-04**: Voter model includes marital_status, military_status, party_change_indicator as first-class String columns
- [x] **VMOD-05**: Voter model includes cell_phone_confidence as SmallInteger column
- [x] **VMOD-06**: Voter model includes household_party_registration, household_size, family_id as first-class columns
- [x] **VMOD-07**: Voter model includes zip_plus4 and apartment_type as first-class columns
- [x] **VMOD-08**: Alembic migration adds all new columns as nullable with appropriate indexes
- [x] **VMOD-09**: VoterResponse, VoterCreateRequest, VoterUpdateRequest schemas include all new fields
- [x] **VMOD-10**: VoterPhone table has unique constraint on (campaign_id, voter_id, value) for dedup

### Import Pipeline

- [ ] **IMPT-01**: Import service auto-creates VoterPhone records when cell phone column is mapped, using RETURNING clause from voter upsert
- [ ] **IMPT-02**: Import service parses voting history Y/N columns (General_YYYY, Primary_YYYY patterns) into voting_history array with canonical "{Type}_{Year}" format
- [ ] **IMPT-03**: Import service parses propensity percentage strings ("77%", "Not Eligible") into SmallInteger values (77, NULL)
- [ ] **IMPT-04**: CANONICAL_FIELDS expanded with aliases for all new columns including L2 naming conventions
- [ ] **IMPT-05**: L2 mapping template updated in migration to include all new field mappings
- [ ] **IMPT-06**: Upsert SET clause derives columns from full model column set, not first batch row keys (bug fix)
- [ ] **IMPT-07**: Phone values normalized (strip non-digits, validate 10 digits) matching DNC normalization pattern

### Filter & Query

- [ ] **FILT-01**: VoterFilter supports propensity_general_min/max, propensity_primary_min/max, propensity_combined_min/max range filters
- [ ] **FILT-02**: VoterFilter supports ethnicity, spoken_language, military_status as multi-select list filters
- [ ] **FILT-03**: VoterFilter supports mailing_city, mailing_state, mailing_zip as exact-match filters
- [ ] **FILT-04**: build_voter_query handles all new filter dimensions following existing pattern
- [ ] **FILT-05**: Voting history filter maintains backward compatibility (year-only values still match "{Type}_{Year}" entries)

### Frontend

- [ ] **FRNT-01**: Voter detail page displays propensity scores, mailing address, demographics, and household data in organized sections
- [ ] **FRNT-02**: VoterFilterBuilder includes controls for propensity ranges, ethnicity, language, military status with collapsible filter groups
- [ ] **FRNT-03**: VoterEditSheet includes editable fields for all new voter columns
- [ ] **FRNT-04**: ColumnMappingTable includes all new canonical fields for import wizard column mapping
- [ ] **FRNT-05**: TypeScript Voter and VoterFilter interfaces updated to match backend schemas

## Future Requirements

### Data Management

- **DATA-01**: Backfill script migrates extra_data values to typed columns for previously-imported L2 files
- **DATA-02**: Voter data export/download with expanded fields

### Advanced Filtering

- **AFLT-01**: Cell phone confidence as a filter dimension
- **AFLT-02**: Household-level aggregate targeting (e.g., "households where majority is DEM")

## Out of Scope

| Feature | Reason |
|---------|--------|
| Self-computed propensity scores | Vendor problem; PROJECT.md explicitly excludes voter score prediction |
| BISG/fBISG ethnicity prediction | 14-26% error rates, legal/ethical concerns; import vendor data as-is |
| Normalized ethnicity/language enums | L2 has 50+ values, TargetSmart 170+; fixed enums break with vendor data |
| Real-time propensity score updates | Requires ML infrastructure; scores are point-in-time vendor snapshots |
| Landline/cell type auto-detection | Requires NANPA API calls; trust vendor classification |
| Voting history deduplication across sources | Unbounded normalization problem across 50 states x vendors |
| Separate mailing address contact records | Mailing address is vendor data, not CRM contact; inline columns preferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VMOD-01 | Phase 23 | Complete |
| VMOD-02 | Phase 23 | Complete |
| VMOD-03 | Phase 23 | Complete |
| VMOD-04 | Phase 23 | Complete |
| VMOD-05 | Phase 23 | Complete |
| VMOD-06 | Phase 23 | Complete |
| VMOD-07 | Phase 23 | Complete |
| VMOD-08 | Phase 23 | Complete |
| VMOD-09 | Phase 23 | Complete |
| VMOD-10 | Phase 23 | Complete |
| IMPT-01 | Phase 24 | Pending |
| IMPT-02 | Phase 24 | Pending |
| IMPT-03 | Phase 24 | Pending |
| IMPT-04 | Phase 24 | Pending |
| IMPT-05 | Phase 24 | Pending |
| IMPT-06 | Phase 24 | Pending |
| IMPT-07 | Phase 24 | Pending |
| FILT-01 | Phase 25 | Pending |
| FILT-02 | Phase 25 | Pending |
| FILT-03 | Phase 25 | Pending |
| FILT-04 | Phase 25 | Pending |
| FILT-05 | Phase 25 | Pending |
| FRNT-01 | Phase 26 | Pending |
| FRNT-02 | Phase 26 | Pending |
| FRNT-03 | Phase 26 | Pending |
| FRNT-04 | Phase 26 | Pending |
| FRNT-05 | Phase 26 | Pending |

**Coverage:**
- v1.3 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*
