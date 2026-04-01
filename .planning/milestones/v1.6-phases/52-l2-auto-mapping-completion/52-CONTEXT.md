# Phase 52: L2 Auto-Mapping Completion - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the L2 voter file auto-mapping so all 55 columns from L2 CSV exports map to canonical fields without manual intervention. Expand voting history parsing to handle "Voted in YYYY", "Voted in YYYY Primary", and bare year patterns. Add L2 format auto-detection to the detect-columns endpoint with format indicator and per-field match confidence. Add ~12 new Voter model columns for L2 fields that currently lack canonical mappings. Update the import wizard frontend to show L2 detection banner and per-field auto-mapped badges.

</domain>

<decisions>
## Implementation Decisions

### Voting History Formats
- **D-01:** "Voted in YYYY" (unqualified) maps to `General_YYYY` in canonical voting history. L2 convention: unqualified = general election.
- **D-02:** "Voted in YYYY Primary" maps to `Primary_YYYY`.
- **D-03:** Bare 4-digit year columns (e.g., "2024", "2022") with Y/A/E values map to `General_YYYY`. Handles edge-case L2 exports.
- **D-04:** Known L2 typos handled explicitly: "Voter in YYYY Primary" (missing 'd') treated as "Voted in YYYY Primary" → `Primary_YYYY`.

### Auto-Detect & Skip UX
- **D-05:** L2 detection happens in the backend detect-columns endpoint (not frontend). Returns `format_detected: "l2"` flag in the response. Single source of truth.
- **D-06:** When L2 is detected, the import wizard still shows the mapping step (not skipped) but with all fields pre-filled and fully editable. User can review and override any mapping before confirming.
- **D-07:** UI shows a blue info banner "L2 voter file detected — columns auto-mapped" at top of mapping step. Each auto-mapped field gets a small checkmark or "auto" badge. Unmapped columns highlighted for attention.

### Column Coverage & Alias Strategy
- **D-08:** All L2 "friendly name" headers from `data/example-2026-02-24.csv` are added as explicit aliases in `CANONICAL_FIELDS`. This includes known L2 typos ("Lattitude", "Mailng Designator", "Mailing Aptartment Number") as explicit aliases — do not rely on fuzzy matching for known typos.
- **D-09:** The existing `suggest_field_mapping()` fuzzy pipeline (RapidFuzz at 75%) handles all file types. No separate L2-specific code path. L2 headers match at near-100% because they're explicit aliases.

### L2 Detection Heuristic
- **D-10:** Detection uses threshold percentage: if >80% of detected columns match known L2 aliases (exact match in `_ALIAS_TO_FIELD`), flag as L2 format. More robust than checking for specific header names, handles variant L2 exports.

### New Voter Model Columns
- **D-11:** Add all unmapped L2 fields as first-class Voter columns (not extra_data). New columns:
  - `house_number` — registration address house number
  - `street_number_parity` — odd/even street number (useful for walk list optimization)
  - `mailing_house_number`
  - `mailing_address_prefix`
  - `mailing_street_name`
  - `mailing_designator` — suffix type (St, Ave, Blvd)
  - `mailing_suffix_direction`
  - `mailing_apartment_number`
  - `mailing_bar_code` — USPS delivery point barcode
  - `mailing_verifier` — USPS address verifier code
  - `mailing_household_party_registration` — distinct from registration household party
  - `mailing_household_size` — distinct from household_size (registration)
- **D-12:** Requires Alembic migration adding ~12 nullable String/Integer columns to voters table.

### Column Mapping Specifics
- **D-13:** "Mailing Household Size" → `household_size` (existing). "Mailing_Families_HHCount" → `mailing_household_size` (new).
- **D-14:** "Mailing Household Party Registration" → `mailing_household_party_registration` (new). "Household Party Registration" → `household_party_registration` (existing).
- **D-15:** "Mailing Family ID" → `family_id` (existing). "Mailing Apartment Type" → `mailing_type` (existing).

### API Response Shape
- **D-16:** Add `format_detected` string field to detect-columns response (values: `"l2"`, `"generic"`, `null`). Extensible for future vendor formats (TargetSmart, Aristotle).
- **D-17:** Change `suggested_mapping` from `{col: field_or_null}` to `{col: {field: str|null, match_type: "exact"|"fuzzy"|null}}`. Frontend uses match_type to show checkmarks (exact) vs warning icons (fuzzy) per field.

### Test Strategy
- **D-18:** Unit tests: read header row from `data/example-2026-02-24.csv`, pass to `suggest_field_mapping()`, assert all 47 data columns map correctly to expected canonical fields.
- **D-19:** Integration tests: full import flow with the sample L2 file, verify all voters created with correct field values in all new and existing columns, voting history parsed for all 8 history columns.
- **D-20:** E2E Playwright test: upload sample file through import wizard, verify L2 detection banner appears, all columns show auto-mapped badges, import completes successfully.

### Claude's Discretion
- Exact naming of new Voter model columns (snake_case as proposed or adjusted for consistency)
- Alembic migration naming and column ordering
- Frontend component structure for L2 banner and confidence badges
- Whether to extract L2 detection as a separate function or inline in detect-columns handler
- Exact threshold value for L2 detection (80% proposed, may tune based on test results)
- Structured logging for L2 detection events

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Import Service (primary modification target)
- `app/services/import_service.py` lines 35-338 — `CANONICAL_FIELDS` dict, `_ALIAS_LIST`, `_ALIAS_TO_FIELD` reverse lookup. All L2 aliases are added here.
- `app/services/import_service.py` lines 420-435 — `parse_voting_history()` regex and handler. Needs expansion for "Voted in YYYY", bare year, and typo patterns.
- `app/services/import_service.py` lines 500-536 — `suggest_field_mapping()` fuzzy matching function. Response shape changes from `str|None` to `{field, match_type}`.

### Detect-Columns Endpoint
- `app/api/v1/imports.py` lines 120-182 — `detect_columns` endpoint. L2 detection heuristic added here. Response gains `format_detected` field.

### Voter Model (column additions)
- `app/models/voter.py` — Voter model. ~12 new nullable columns added.
- `app/services/import_service.py` lines 450-497 — `_VOTER_COLUMNS` set. Must include all new column names.

### Import Job Model
- `app/models/import_job.py` — ImportJob model. `suggested_mapping` JSONB shape changes to include match_type.

### L2 Sample Data
- `data/example-2026-02-24.csv` — Truncated L2 export with all 55 columns. Source of truth for alias verification.
- `data/full-2026-02-24.csv` — Full L2 export. Same headers, more rows.

### Frontend Import Wizard
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` — Import wizard route. Needs L2 detection banner and auto-mapped badges.
- `web/src/components/voters/ColumnMappingTable.tsx` — Column mapping table component. Needs confidence badge per row.
- `web/src/components/voters/column-mapping-constants.ts` — Frontend column mapping constants. Must include new canonical fields.

### Schemas
- `app/schemas/import_job.py` — ImportJobResponse schema. Needs `format_detected` field.

### Requirements
- `.planning/REQUIREMENTS.md` — L2MP-01 (55-column auto-map), L2MP-02 (voting history formats), L2MP-03 (auto-detect skip)

### Prior Phase Context
- `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-CONTEXT.md` — D-05 (queueing_lock), D-08 (202 Accepted)
- `.planning/phases/50-per-batch-commits-crash-resilience/50-CONTEXT.md` — D-01 (last_committed_row), D-08 (per-batch commit)
- `.planning/phases/51-memory-safety-streaming/51-CONTEXT.md` — D-01 (streaming CSV), D-02 (per-batch loop unchanged)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CANONICAL_FIELDS` dict — Existing alias dictionary with ~30 L2 aliases already. Extend with remaining ~15 friendly name aliases.
- `_ALIAS_TO_FIELD` reverse lookup — Used by `suggest_field_mapping()`. Automatically rebuilt when `CANONICAL_FIELDS` is extended.
- `suggest_field_mapping()` — RapidFuzz at 75% threshold. Core mapping function, needs response shape change.
- `parse_voting_history()` — Regex-based voting history extractor. Needs additional patterns.
- `FieldMappingTemplate` model — System template support exists but NOT used for L2 detection (D-09: aliases approach instead).
- `_VOTER_COLUMNS` set — Must be updated with new column names for upsert SET clause derivation.

### Established Patterns
- L2 aliases follow `# L2 official headers` comment convention in `CANONICAL_FIELDS`
- Voter model uses `mapped_column()` with nullable strings for optional fields
- Alembic migrations in `alembic/` with async engine via asyncpg
- Frontend uses column-mapping-constants.ts for dropdown grouping

### Integration Points
- `detect_columns` endpoint → add L2 detection heuristic and `format_detected` field
- `suggest_field_mapping()` → change return type to include `match_type`
- `ImportJobResponse` schema → add `format_detected` field
- Voter model → add ~12 columns + Alembic migration
- `_VOTER_COLUMNS` → add new column names
- `CANONICAL_FIELDS` → add remaining L2 friendly name aliases
- `parse_voting_history()` → add "Voted in YYYY", bare year, and typo patterns
- Frontend ColumnMappingTable → L2 banner + per-field confidence badges
- Frontend column-mapping-constants → new canonical fields in dropdown

</code_context>

<specifics>
## Specific Ideas

- The actual L2 header row from `data/example-2026-02-24.csv` is the source of truth for all 55 columns. Every alias must be verified against this file.
- L2 contains known typos: "Lattitude" (double-t), "Mailng Designator" (missing 'i'), "Mailing Aptartment Number" (transposed letters), "Voter in 2020 Primary" (should be "Voted"). All must be explicit aliases.
- The 55 columns break down as: 47 data columns (mapped to canonical fields) + 8 voting history columns (handled by parser).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 52-l2-auto-mapping-completion*
*Context gathered: 2026-03-28*
