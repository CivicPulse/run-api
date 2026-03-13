# Feature Landscape: v1.3 Voter Model & Import Enhancement

**Domain:** Political campaign voter data management -- expanded voter model, import pipeline, search/filter
**Researched:** 2026-03-13
**Overall confidence:** HIGH (existing codebase well-understood, vendor field structures verified against L2 mapping template and industry sources)

## Table Stakes

Features campaigns expect from any voter data platform. Missing = campaigns choose a competitor.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Propensity scores as first-class columns** | Every major platform (VAN, PDI, TargetSmart, i360) provides turnout propensity on a 0-100 scale. Campaigns build target universes around "likely voters" (score 60+) vs "low-propensity" (score < 40). Storing in extra_data makes filtering slow and unintuitive. | Medium | Alembic migration, voter model, schema, import mapping | Three columns: `propensity_general` (0-100, general election turnout likelihood), `propensity_primary` (0-100, primary turnout likelihood), `propensity_combined` (0-100, overall turnout likelihood). All vendor-provided, NOT self-computed. L2 provides these as `Voters_GeneralElectionTurnout`, `Voters_PrimaryElectionTurnout`, and similar columns. Store as `SmallInteger` (0-100) for efficient range queries. |
| **Ethnicity as first-class column** | Already exists as `ethnicity` on the voter model. L2 maps to `Ethnic_Description`. TargetSmart appends 170+ ethnicities. This is already table stakes and IS implemented. No change needed to the column itself. | None (exists) | -- | Already mapped in L2 template as `Ethnic_Description` -> `ethnicity`. May want to add aliases to import mapping for TargetSmart format compatibility. |
| **Mailing address fields (8 columns)** | L2 provides separate mailing address distinct from residence address. Campaigns need mailing addresses for direct mail programs -- one of the three core outreach channels (mail, phone, door). Without mailing address, direct mail targeting requires external mail house lookups. | Medium | Alembic migration, voter model, schema, import mapping, UI | Eight columns: `mailing_address_line1`, `mailing_address_line2`, `mailing_city`, `mailing_state`, `mailing_zip`, `mailing_zip4`, `mailing_country`, `mailing_type` (apartment/house/PO Box). L2 fields: `MailAddress_AddressLine`, `MailAddress_City`, `MailAddress_State`, `MailAddress_Zip`, etc. |
| **Voting history Y/N column parsing** | L2 delivers voting history as dozens of individual columns like `General_2020_11_03`, `Primary_2022_08_02` with "Y"/"N" values (or similar election-type codes). The current import puts these in `extra_data` because they don't match canonical fields. Campaigns need these parsed into the `voting_history` array for the filter builder to work. | High | Import service refactoring, L2 mapping template update | This is the hardest single feature. Must detect columns matching election patterns (regex: `^(General|Primary|Municipal|Special)_\d{4}` or similar), parse Y/N values, and append matching election identifiers to the `voting_history` ARRAY column. The L2 template must be updated to mark these as "voting_history_columns" rather than individual field mappings. |
| **Filter on propensity score ranges** | Once propensity scores are first-class, campaigns expect range filtering ("show me voters with general propensity 60-100 who didn't vote in the last primary"). VAN, PDI, and i360 all provide this. | Low | Propensity columns exist, VoterFilter schema, voter query builder | Add `propensity_general_min/max`, `propensity_primary_min/max`, `propensity_combined_min/max` to VoterFilter. Six new fields, same pattern as existing `age_min`/`age_max`. |
| **Auto-create VoterPhone from cell phone column** | L2 and other vendors provide cell phone numbers in the voter file (e.g., `Phone_Cell`, `Voters_CellPhoneNumber`). Currently these end up in `extra_data`. Campaigns need them as VoterPhone records for phone banking -- the call list generator already filters on VoterPhone existence. Without this, imported phone numbers are invisible to the phone banking pipeline. | Medium | Import service, VoterPhone model, phone banking pipeline integration | During import, when a column is mapped to a special "cell_phone" canonical target, create a VoterPhone record with type="cell" alongside the voter upsert. Must handle dedup (don't create duplicate phones on re-import). Also handle landline column mapping -> type="home". |
| **Spoken language** | L2 provides `Voters_SpokenLanguage` or `Languages_Description`. TargetSmart appends 80+ languages. Campaigns doing multilingual outreach (especially in states like CA, TX, FL, NV, AZ) need to filter by language for volunteer matching (Spanish-speaking canvassers to Spanish-speaking voters). | Low | Alembic migration, voter model, schema, import mapping | Single column: `spoken_language` (String(100)). L2 field: `Languages_Description`. |
| **Updated L2 mapping template** | The existing L2 system template maps 21 fields. Adding new first-class columns requires updating the template to map L2 columns to the new canonical fields. Without this, campaigns importing L2 files still get new fields dumped into `extra_data`. | Low | All new columns must exist first | Update the seed migration or add a new migration to UPDATE the L2 template mapping JSON with new field entries. |

## Differentiators

Features that set the platform apart. Not expected by every campaign, but valued by sophisticated operations.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Cell phone confidence score** | L2 provides a `CellConfidenceCode` (typically 1-10 or similar scale) indicating how likely the cell phone number is correct. Campaigns with limited phone banking hours should call high-confidence numbers first. No competitors surface this in their standard UI. | Low | Alembic migration, voter model | Single column: `cell_phone_confidence` (SmallInteger). Import mapping handles `CellConfidenceCode` or `Phone_CellConfidenceCode`. Surfaced in UI as a badge on phone numbers or a filter dimension. |
| **Party change indicator** | L2 tracks `Voters_PartyChange` -- whether a voter recently changed party registration. This is gold for persuasion targeting: a voter who switched from REP to DEM (or vice versa) signals persuadability. Few platforms surface this explicitly. | Low | Alembic migration, voter model | Single column: `party_change_indicator` (String(50)). L2 provides values like "Changed from Republican" or date-based change flags. Store the vendor-provided value as-is. |
| **Household-level fields (party registration, size, family ID)** | L2 provides `Voters_HHParty_REG` (household party composition), household size, and family grouping IDs. Campaigns use this for "household targeting" -- if 3 of 4 household members are registered DEM, the 4th is a persuasion target. Also useful for canvassing optimization (visit once, reach multiple voters). | Low | Alembic migration, voter model | Three columns: `household_party_registration` (String(50)), `household_size` (SmallInteger), `family_id` (String(255)). The existing `household_id` groups physical addresses; `family_id` is L2's family-level grouping within a household. |
| **Zip+4** | L2 provides 9-digit ZIP (Zip+4) for more precise geographic targeting. Standard zip_code field holds 5 or 10 chars already, but a dedicated `zip_plus4` field makes it explicit and filterable. Useful for micro-targeting within zip codes for direct mail. | Low | Alembic migration, voter model | Single column: `zip_plus4` (String(4)). Stores just the +4 extension. L2 field: `Residence_Addresses_ZipPlus4`. |
| **Apartment type** | L2 provides `Residence_Addresses_ApartmentType` -- indicates if address is a single-family home, apartment, condo, etc. Canvassing operations need this to plan door-knock logistics (apartments may need building access, intercom, etc.). | Low | Alembic migration, voter model | Single column: `apartment_type` (String(50)). L2 field: `Residence_Addresses_ApartmentType`. |
| **Marital status** | L2 provides modeled `CommercialData_MaritalStatus`. Campaigns use this for household-based targeting strategies and certain outreach messaging. | Low | Alembic migration, voter model | Single column: `marital_status` (String(50)). Modeled data, not from public records. |
| **Military status** | L2 provides `MilitaryStatus` or `CommercialData_MilitaryStatus`. Important for campaigns with veteran-focused platforms or military community outreach. Enables filtering "active military" or "veteran" voters. | Low | Alembic migration, voter model, filter builder | Single column: `military_status` (String(50)). Add to VoterFilter as exact match. |
| **Filter on ethnicity, language, military status** | Once these are first-class columns, exposing them in the filter builder enables targeted outreach programs. Ethnicity filter already partially supported via extra_data, but first-class makes it fast and discoverable. | Low | Columns exist, VoterFilter schema, voter query builder, UI filter builder | Add `ethnicity`, `spoken_language`, `military_status` to VoterFilter. Ethnicity and language as multi-select (campaigns target "Hispanic OR Asian"), military_status as exact match or multi-select. |
| **Mailing address filter dimensions** | Filter voters by mailing city, mailing state, or mailing zip. Useful for campaigns targeting voters who live in one jurisdiction but receive mail elsewhere (snowbirds, college students, military). | Low | Mailing address columns exist, VoterFilter schema, voter query builder | Add `mailing_city`, `mailing_state`, `mailing_zip` to VoterFilter. |

## Anti-Features

Features to explicitly NOT build. These are traps that look valuable but create more problems than they solve.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Self-computed propensity scores** | Building a turnout prediction model requires training data, validation infrastructure, ML pipeline, and ongoing calibration. The PROJECT.md explicitly marks "Voter score prediction" as out of scope. Vendors like L2 and TargetSmart spend millions on these models; a campaign tool should consume them, not compete with them. | Import vendor-provided scores as-is into `propensity_general`, `propensity_primary`, `propensity_combined` columns. |
| **BISG/fBISG ethnicity prediction** | Bayesian Improved Surname Geocoding is the academic standard for race prediction, but it requires census data integration, has known accuracy issues (14-26% error rates among minority groups per Harvard research), and raises ethical/legal concerns when used for campaign targeting. | Import vendor-provided ethnicity as-is. L2 and TargetSmart already model this. Store their value in the `ethnicity` column without second-guessing it. |
| **Normalized ethnicity/language enums** | Tempting to create an enum like `EthnicityType` with fixed values (WHITE, BLACK, HISPANIC, ASIAN, etc.). But L2 provides 50+ ethnic descriptions, TargetSmart provides 170+. A fixed enum immediately breaks with vendor data and requires migrations for every new value. | Store as free-form String(100). Display the vendor-provided description as-is. Filter with IN for multi-select flexibility. |
| **Voting history deduplication across sources** | Different vendors encode elections differently (L2: "General_2020_11_03", TargetSmart: "2020_GEN", state files: "11/03/2020 General"). Trying to normalize these into a universal election ID scheme is an unbounded problem with 50 states x multiple election types x multiple vendors. | Store election identifiers as the import pipeline produces them. Each import source has its own convention. Filter operates within the source's naming scheme. Accept that multi-source campaigns may have duplicate entries in voting_history -- this is cosmetic, not functional. |
| **Real-time propensity score updates** | Some platforms claim to update scores in real-time based on interactions. This requires ML infrastructure and produces scores that campaigns cannot validate or explain. | Accept that propensity scores are point-in-time snapshots from the vendor. Campaigns re-import updated files periodically (typically monthly or quarterly). The upsert pipeline handles updates naturally. |
| **Separate mailing address contact records** | Tempting to create VoterAddress records for mailing addresses (the contact model already has type="mailing"). But mailing addresses from voter files are inherently tied to the voter record -- they are not "contacts" in the CRM sense. Creating VoterAddress records for every imported mailing address doubles the contact table size for marginal benefit. | Store mailing address as first-class columns on the voter record. The existing VoterAddress model is for manually-added or campaign-discovered addresses. Import pipeline writes mailing fields directly to voter columns. |
| **Landline/cell phone type auto-detection** | Guessing phone type from the number itself (NANPA database lookups, carrier detection). This requires external API calls, costs money per lookup, and is unreliable as numbers port between carriers. | Trust the vendor's classification. L2 provides separate columns for cell phone and landline. Map them to VoterPhone records with the appropriate type. If a column is mapped as "cell_phone", create type="cell". If "home_phone", create type="home". |

## Feature Dependencies

```
Alembic migration (new columns) --> All new voter model columns
  |
  +--> Updated L2 mapping template (depends on columns existing)
  |
  +--> Updated import service CANONICAL_FIELDS (depends on columns)
  |     |
  |     +--> Auto-create VoterPhone from cell phone column (depends on import service changes)
  |     |
  |     +--> Voting history Y/N column parsing (depends on import service changes)
  |
  +--> Updated VoterFilter schema (depends on columns)
  |     |
  |     +--> Updated voter query builder (depends on filter schema)
  |           |
  |           +--> Updated VoterFilterBuilder UI (depends on query builder)
  |
  +--> Updated VoterResponse schema (depends on columns)
        |
        +--> Updated voter detail UI (depends on response schema)
        |
        +--> Updated VoterEditSheet (depends on response schema)
```

Critical path: Migration -> Model -> Schema -> Import service -> Filter builder -> UI

## MVP Recommendation

Prioritize (must have for milestone):

1. **Alembic migration adding all ~20 new columns** -- Everything downstream depends on this. Do it in one migration to avoid migration chain complexity. Columns: `propensity_general`, `propensity_primary`, `propensity_combined`, `spoken_language`, `marital_status`, `military_status`, `party_change_indicator`, `cell_phone_confidence`, `mailing_address_line1`, `mailing_address_line2`, `mailing_city`, `mailing_state`, `mailing_zip`, `mailing_zip4`, `mailing_country`, `mailing_type`, `household_party_registration`, `household_size`, `family_id`, `zip_plus4`, `apartment_type`. Add B-tree indexes on `(campaign_id, propensity_general)`, `(campaign_id, spoken_language)`, `(campaign_id, military_status)`.

2. **Updated voter model, schemas (response/create/update), and CANONICAL_FIELDS** -- Mechanical but extensive. Add all new columns to model, response schema, create/update schemas, and add L2 column aliases to the import service's CANONICAL_FIELDS dict.

3. **Voting history Y/N column parsing** -- Highest complexity, highest campaign value. Without this, L2 voting history data (the most commonly imported vendor) is unusable for filtering. Implement a "voting_history_parser" that detects columns matching election patterns, parses Y/N values, and aggregates into the ARRAY column.

4. **Auto-create VoterPhone from cell phone column** -- Critical for phone banking pipeline. Without this, imported phone numbers require manual re-entry. The call list generator's `has_phone` filter depends on VoterPhone records existing.

5. **Updated L2 mapping template** -- Must ship with the migration so L2 imports immediately use new fields.

6. **Updated VoterFilter + query builder for propensity ranges** -- Propensity score filtering is the primary reason campaigns want first-class propensity columns. Ship range filters.

7. **UI updates: voter detail, filter builder, edit sheet** -- Display new fields and expose new filter dimensions.

Defer to future milestone:
- **Mailing address filter dimensions** -- Low priority; mailing address is primarily for export to mail houses, not for in-app filtering. Can add later if campaigns request it.
- **Cell phone confidence as a filter** -- Nice-to-have for sophisticated phone banking optimization. Not blocking any workflow.
- **Household-level analytics** -- The columns exist for data storage, but building household-based targeting logic (e.g., "households where majority is DEM") is a separate feature requiring aggregate queries.

## Field-Level Specification

### New Voter Model Columns

| Column Name | Type | L2 Field(s) | Purpose | Index |
|-------------|------|-------------|---------|-------|
| `propensity_general` | SmallInteger | `Voters_GeneralElectionTurnout` / `GeneralTurnoutScore` | General election turnout likelihood (0-100) | B-tree on (campaign_id, propensity_general) |
| `propensity_primary` | SmallInteger | `Voters_PrimaryElectionTurnout` / `PrimaryTurnoutScore` | Primary election turnout likelihood (0-100) | No (query via combined) |
| `propensity_combined` | SmallInteger | `Voters_CombinedTurnout` / `OverallTurnoutScore` | Combined turnout likelihood (0-100) | No (query via general) |
| `spoken_language` | String(100) | `Languages_Description` / `Voters_SpokenLanguage` | Primary spoken language | No |
| `marital_status` | String(50) | `CommercialData_MaritalStatus` | Modeled marital status | No |
| `military_status` | String(50) | `MilitaryStatus` / `CommercialData_MilitaryStatus` | Military/veteran status | No |
| `party_change_indicator` | String(50) | `Voters_PartyChange` | Recent party registration change | No |
| `cell_phone_confidence` | SmallInteger | `CellConfidenceCode` / `Phone_CellConfidenceCode` | Cell phone accuracy score | No |
| `mailing_address_line1` | String(500) | `MailAddress_AddressLine` / `Mailing_Addresses_AddressLine` | Mailing street address | No |
| `mailing_address_line2` | String(500) | `MailAddress_ExtraAddressLine` | Mailing unit/apt | No |
| `mailing_city` | String(255) | `MailAddress_City` / `Mailing_Addresses_City` | Mailing city | No |
| `mailing_state` | String(2) | `MailAddress_State` / `Mailing_Addresses_State` | Mailing state | No |
| `mailing_zip` | String(10) | `MailAddress_Zip` / `Mailing_Addresses_Zip` | Mailing ZIP code | No |
| `mailing_zip4` | String(4) | `MailAddress_ZipPlus4` | Mailing ZIP+4 extension | No |
| `mailing_country` | String(10) | `MailAddress_Country` | Mailing country (default "US") | No |
| `mailing_type` | String(50) | `MailAddress_Type` / `Mailing_Addresses_ApartmentType` | Mailing address type | No |
| `household_party_registration` | String(50) | `Voters_HHParty_REG` | Household-level party composition | No |
| `household_size` | SmallInteger | `HHSize` / `Voters_HHSize` | Number of voters in household | No |
| `family_id` | String(255) | `FamilyId` / `Voters_FamilyId` | Family grouping within household | No |
| `zip_plus4` | String(4) | `Residence_Addresses_ZipPlus4` | Residence ZIP+4 extension | No |
| `apartment_type` | String(50) | `Residence_Addresses_ApartmentType` | Residence address type (apt/house/condo) | No |

### New VoterFilter Fields

| Filter Field | Type | Query Logic | Notes |
|-------------|------|-------------|-------|
| `propensity_general_min` | int | `Voter.propensity_general >= value` | Range filter, same pattern as age_min |
| `propensity_general_max` | int | `Voter.propensity_general <= value` | Range filter |
| `propensity_primary_min` | int | `Voter.propensity_primary >= value` | Range filter |
| `propensity_primary_max` | int | `Voter.propensity_primary <= value` | Range filter |
| `propensity_combined_min` | int | `Voter.propensity_combined >= value` | Range filter |
| `propensity_combined_max` | int | `Voter.propensity_combined <= value` | Range filter |
| `ethnicity` | list[str] | `Voter.ethnicity.in_(values)` | Multi-select, free-form vendor values |
| `spoken_language` | list[str] | `Voter.spoken_language.in_(values)` | Multi-select |
| `military_status` | list[str] | `Voter.military_status.in_(values)` | Multi-select |
| `mailing_city` | str | `Voter.mailing_city == value` | Exact match |
| `mailing_state` | str | `Voter.mailing_state == value` | Exact match |
| `mailing_zip` | str | `Voter.mailing_zip == value` | Exact match |

### Import Pipeline Changes

| Change | Description | Complexity |
|--------|-------------|------------|
| **Expand CANONICAL_FIELDS dict** | Add 21+ new entries with L2 aliases for all new columns | Low |
| **Expand _VOTER_COLUMNS set** | Add all new column names so they route to model columns instead of extra_data | Low |
| **Voting history parser** | New function `parse_voting_history_columns(row, field_mapping) -> list[str]` that detects election columns by pattern, extracts Y/N values, returns list of election identifiers like "General_2020", "Primary_2022" | High |
| **VoterPhone auto-creation** | After voter upsert in batch, iterate valid voters, find cell_phone/home_phone mapped values, create VoterPhone records with dedup (ON CONFLICT DO NOTHING on voter_id + value) | Medium |
| **Updated L2 template seed** | New migration or seed script updating the system L2 template JSON to include mappings for all new columns plus voting history marker | Low |
| **Import service phone dedup** | When auto-creating phones, check for existing VoterPhone with same voter_id + value to avoid duplicates on re-import. Use INSERT ON CONFLICT DO NOTHING. | Low |

## Vendor Field Naming Reference

Based on the existing L2 mapping template (from migration 002b) and research:

### L2 Column Naming Convention
L2 uses a hierarchical prefix convention:
- `Voters_` -- core voter registration fields (FirstName, LastName, BirthDate, Gender, Age, etc.)
- `Residence_Addresses_` -- residential address fields (AddressLine, City, State, Zip, Latitude, Longitude)
- `MailAddress_` or `Mailing_Addresses_` -- mailing address fields
- `Parties_` -- party registration (Description)
- `ElectionDistricts_` -- district assignments (USCongress, StateSenate, StateHouse)
- `EthnicGroups_` or `Ethnic_` -- ethnicity data (EthnicGroup1Desc)
- `Languages_` -- spoken language (Description)
- `CommercialData_` -- commercially-modeled data (MaritalStatus, EstimatedHHIncome)
- `Phone_` -- phone number fields (Cell, Home, CellConfidenceCode)
- Election columns: `General_YYYY_MM_DD`, `Primary_YYYY_MM_DD` with Y/N values

### TargetSmart Naming Convention (MEDIUM confidence)
TargetSmart uses flat naming with vendor prefixes:
- `ts_tsmart_partisan_score` -- partisan leaning (0-100)
- `ts_tsmart_midterm_general_turnout_score` -- midterm turnout propensity
- `ts_tsmart_presidential_general_turnout_score` -- presidential turnout propensity
- `vb_voterbase_race` -- race/ethnicity
- `vb_voterbase_phone` -- phone number
- Per-client field configuration means exact names vary

### Aristotle Naming Convention (LOW confidence)
Aristotle documentation is not publicly available. Their VoterListsOnline platform exports with custom field names configured per client. The fuzzy matching system should handle most Aristotle exports without specific aliases.

## Sources

### HIGH confidence
- Project codebase: `app/models/voter.py`, `app/services/import_service.py`, `app/services/voter.py`, `app/schemas/voter_filter.py` -- current model and pipeline
- L2 migration 002b (`alembic/versions/002_voter_data_models.py`) -- existing L2 mapping template with exact field names
- [Pew Research: Political data in voter files](https://www.pewresearch.org/methods/2018/02/15/political-data-in-voter-files/) -- propensity score structure (0-100 scale), modeled partisanship, turnout models
- [L2 Data](https://www.l2-data.com/) -- 600+ fields, modeled demographics, voting history
- [L2 2025 Voter Data Dictionary](https://www.l2-data.com/wp-content/uploads/2025/08/L2-2025-VOTER-DATA-DICTIONARY-1.pdf) -- current field specifications

### MEDIUM confidence
- [TargetSmart Data Solutions](https://targetsmart.com/data-solutions/) -- 208M+ voters, partisan/turnout/issue models, 170+ ethnicities, 80+ languages
- [TargetSmart Data Products Documentation](https://docs.targetsmart.com/my_tsmart/data-products.html) -- VoterBase, CellBase, ContributorBase product descriptions
- [NationBuilder voter file fields](https://support.nationbuilder.com/en/articles/2471295-national-voter-file-fields) -- state_file_id, support_probability_score, turnout_probability_score, mailing address fields
- [Michigan Dems VoteBuilder Scores](https://michigandems.freshdesk.com/support/solutions/articles/66000476711-scores-in-van) -- DNC Dem Party Support Score (0-100), Turnout Targeting (0-100)
- [NGP VAN CRM Guide](https://www.ngpvan.com/blog/crm-for-political-campaigns/) -- table stakes CRM features
- [Redistricting Data Hub - Voter File](https://redistrictingdatahub.org/data/about-our-data/voter-file/) -- L2 modeled ethnicity and party, Census Block assignment

### LOW confidence
- [Aristotle Data](https://www.aristotle.com/data/) -- 1000+ data points, 235M+ voters, specific field names not publicly documented
- L2 voting history column format (General_YYYY_MM_DD pattern) -- inferred from L2 documentation references and common patterns; exact naming varies by state data dictionary
- TargetSmart field name prefixes (ts_tsmart_, vb_voterbase_) -- from API documentation fragments, per-client configuration may vary
