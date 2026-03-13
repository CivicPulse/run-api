# Phase 24: Import Pipeline Enhancement - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The CSV import pipeline auto-creates phone contacts, parses voting history and propensity scores from L2 files, and maps all new fields correctly without silent data loss. Fixes the upsert SET clause bug. No filter changes, no frontend changes, no new vendor support (VoteBuilder deferred).

</domain>

<decisions>
## Implementation Decisions

### Voting history parsing
- Values Y (yes), A (absentee), and E (early) count as "voted" — included in voting_history array
- Only match strict L2 column patterns: `General_YYYY` and `Primary_YYYY` (no abbreviated variants)
- Canonical format preserves L2 column prefix exactly: "General_2024", "Primary_2022"
- On re-import, voting_history is replaced entirely (not merged) — L2 files are complete snapshots
- Implemented as L2-specific parsing function in import_service.py — extract to strategy pattern later if VoteBuilder needs different logic

### Phone creation behavior
- Auto-created VoterPhone records use type="cell", source="import"
- Set is_primary=True on first import; don't change primary flag on re-import if phone already exists
- Use INSERT ... ON CONFLICT DO UPDATE on (campaign_id, voter_id, value) — matches voter upsert pattern
- Add special `__cell_phone` canonical field in CANONICAL_FIELDS to signal "this column has phone numbers to extract" — keeps phone detection in the existing mapping flow but marks it as non-voter-column
- Phone values normalized: strip non-digits, validate 10 digits, matching DNC normalization pattern

### Error tolerance
- If phone normalization fails but voter data is valid: import the voter, skip the phone (no VoterPhone created)
- Unparseable propensity values ("High", "N/A", "Not Eligible", empty) become NULL — no error, no warning
- Error report CSV contains row-level errors only (rows completely skipped, e.g., missing name)
- Field-level issues (bad phone, bad propensity) are silent — voter still imports

### Import job tracking
- Add phones_created count to ImportJob results alongside imported_rows and skipped_rows
- Users see "Imported 5,000 voters and created 3,200 phone contacts"

### L2 column detection & aliases
- Add L2's official column headers to CANONICAL_FIELDS aliases (Voters_FIPS, Residence_Addresses_Latitude, EthnicGroups_EthnicGroup1Desc, etc.)
- Organize alias lists with vendor-grouping comments for future extensibility
- L2 system mapping template (FieldMappingTemplate, is_system=True) updated via new Alembic migration

### Upsert SET clause fix (IMPT-06)
- Derive update columns from full Voter model column set, not first batch row keys
- Prevents silent column omission when first row is missing optional fields

### RETURNING clause for phone creation (IMPT-01)
- Add .returning(Voter.id) to voter upsert to get back voter IDs for VoterPhone linking
- Novel for this codebase — no existing RETURNING usage

### Claude's Discretion
- Exact RETURNING clause column selection (id only vs id + source_id)
- Phone normalization function placement (inline vs utility)
- Batch size for VoterPhone bulk insert
- Whether voting history columns are detected at mapping time or parsing time

</decisions>

<specifics>
## Specific Ideas

- VoteBuilder (NGP VAN) support is coming eventually — alias structure and parsing functions should be clean enough to extend without refactoring
- Phone creation uses the same upsert pattern as voters for consistency
- `__cell_phone` prefix convention signals "extract to related table" vs "store on voter row"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CANONICAL_FIELDS` dict (import_service.py:30-280): Already has aliases for all Phase 23 fields — needs L2 official names added
- `_VOTER_COLUMNS` set (import_service.py:291-337): Defines which canonical fields are voter model columns — phone fields excluded by design
- VoterPhone model (voter_contact.py): Unique constraint on (campaign_id, voter_id, value) already in place from Phase 23
- DNC phone validation pattern (dnc.py:22): `PHONE_REGEX = re.compile(r"^\d{10,15}$")` — reuse for phone normalization
- FieldMappingTemplate model (import_job.py:65-86): System templates with is_system=True, campaign_id=NULL

### Established Patterns
- `insert(Voter).on_conflict_do_update()` for voter upsert (import_service.py:527-531) — extend with .returning()
- Batch processing in 1000-row batches (import_service.py:599) — phone creation follows same batching
- `suggest_field_mapping()` uses RapidFuzz at 75% threshold — aliases supplement fuzzy matching
- `extra_data` JSONB catches unmapped columns — continues to catch anything not in CANONICAL_FIELDS

### Integration Points
- `process_csv_batch()` (import_service.py:474): Main method to modify — add RETURNING, phone creation, voting history parsing, propensity parsing
- `apply_field_mapping()` (import_service.py:418): Needs to route __cell_phone to separate phone data, not voter dict
- ImportJob model (import_job.py:27): Needs phones_created column added
- Alembic migrations: New migration for phones_created column + L2 template update

</code_context>

<deferred>
## Deferred Ideas

- VoteBuilder (NGP VAN) data import support — future phase (different column naming, VANID for voter ID, different voting history format)
- Backfill script for previously-imported L2 files to populate new typed columns from extra_data (DATA-01)

</deferred>

---

*Phase: 24-import-pipeline-enhancement*
*Context gathered: 2026-03-13*
