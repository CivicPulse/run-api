# Phase 52: L2 Auto-Mapping Completion - Research

**Researched:** 2026-03-28
**Domain:** L2 voter file import auto-mapping, column detection, voting history parsing
**Confidence:** HIGH

## Summary

Phase 52 completes the L2 voter file auto-mapping so all 55 columns from L2 CSV exports map to canonical fields without manual intervention. The work spans four layers: (1) backend alias expansion and voting history parser expansion in `import_service.py`, (2) new Voter model columns with Alembic migration, (3) L2 format auto-detection in the detect-columns endpoint with response shape changes, and (4) frontend import wizard updates for L2 detection banner and per-field confidence badges.

The existing codebase is well-structured for this work. `CANONICAL_FIELDS` already maps 25 of 55 columns. The remaining 30 break down cleanly: 10 need aliases to existing fields, 12 need new Voter model columns plus aliases, and 8 are voting history columns handled by `parse_voting_history()` (which currently only handles `General_YYYY` / `Primary_YYYY` patterns and needs expansion).

**Primary recommendation:** Work in strict dependency order: Alembic migration first (new columns must exist in DB), then backend alias/parser/detection changes, then schema/endpoint changes, then frontend.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** "Voted in YYYY" (unqualified) maps to `General_YYYY` in canonical voting history. L2 convention: unqualified = general election.
- **D-02:** "Voted in YYYY Primary" maps to `Primary_YYYY`.
- **D-03:** Bare 4-digit year columns (e.g., "2024", "2022") with Y/A/E values map to `General_YYYY`. Handles edge-case L2 exports.
- **D-04:** Known L2 typos handled explicitly: "Voter in YYYY Primary" (missing 'd') treated as "Voted in YYYY Primary" -> `Primary_YYYY`.
- **D-05:** L2 detection happens in the backend detect-columns endpoint (not frontend). Returns `format_detected: "l2"` flag in the response. Single source of truth.
- **D-06:** When L2 is detected, the import wizard still shows the mapping step (not skipped) but with all fields pre-filled and fully editable. User can review and override any mapping before confirming.
- **D-07:** UI shows a blue info banner "L2 voter file detected -- columns auto-mapped" at top of mapping step. Each auto-mapped field gets a small checkmark or "auto" badge. Unmapped columns highlighted for attention.
- **D-08:** All L2 "friendly name" headers from `data/example-2026-02-24.csv` are added as explicit aliases in `CANONICAL_FIELDS`. This includes known L2 typos ("Lattitude", "Mailng Designator", "Mailing Aptartment Number") as explicit aliases -- do not rely on fuzzy matching for known typos.
- **D-09:** The existing `suggest_field_mapping()` fuzzy pipeline (RapidFuzz at 75%) handles all file types. No separate L2-specific code path. L2 headers match at near-100% because they're explicit aliases.
- **D-10:** Detection uses threshold percentage: if >80% of detected columns match known L2 aliases (exact match in `_ALIAS_TO_FIELD`), flag as L2 format.
- **D-11:** Add all unmapped L2 fields as first-class Voter columns (not extra_data). New columns: `house_number`, `street_number_parity`, `mailing_house_number`, `mailing_address_prefix`, `mailing_street_name`, `mailing_designator`, `mailing_suffix_direction`, `mailing_apartment_number`, `mailing_bar_code`, `mailing_verifier`, `mailing_household_party_registration`, `mailing_household_size`.
- **D-12:** Requires Alembic migration adding ~12 nullable String/Integer columns to voters table.
- **D-13:** "Mailing Household Size" -> `household_size` (existing). "Mailing_Families_HHCount" -> `mailing_household_size` (new).
- **D-14:** "Mailing Household Party Registration" -> `mailing_household_party_registration` (new). "Household Party Registration" -> `household_party_registration` (existing).
- **D-15:** "Mailing Family ID" -> `family_id` (existing). "Mailing Apartment Type" -> `mailing_type` (existing).
- **D-16:** Add `format_detected` string field to detect-columns response (values: `"l2"`, `"generic"`, `null`). Extensible for future vendor formats.
- **D-17:** Change `suggested_mapping` from `{col: field_or_null}` to `{col: {field: str|null, match_type: "exact"|"fuzzy"|null}}`. Frontend uses match_type to show checkmarks (exact) vs warning icons (fuzzy) per field.
- **D-18:** Unit tests: read header row from `data/example-2026-02-24.csv`, pass to `suggest_field_mapping()`, assert all 47 data columns map correctly.
- **D-19:** Integration tests: full import flow with sample L2 file, verify all voters created with correct field values.
- **D-20:** E2E Playwright test: upload sample file through import wizard, verify L2 detection banner appears.

### Claude's Discretion
- Exact naming of new Voter model columns (snake_case as proposed or adjusted for consistency)
- Alembic migration naming and column ordering
- Frontend component structure for L2 banner and confidence badges
- Whether to extract L2 detection as a separate function or inline in detect-columns handler
- Exact threshold value for L2 detection (80% proposed, may tune based on test results)
- Structured logging for L2 detection events

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| L2MP-01 | All 55 columns from L2 voter files auto-map to canonical fields without manual intervention | Alias expansion in CANONICAL_FIELDS (10 existing-field aliases + 12 new-column aliases), 12 new Voter model columns, _VOTER_COLUMNS update |
| L2MP-02 | Voting history columns in "Voted in YYYY", "General_YYYY", and "Voted in YYYY Primary" formats are parsed correctly | parse_voting_history() regex expansion to handle 3 new patterns + typo pattern per D-01 through D-04 |
| L2MP-03 | Import wizard auto-detects L2 format from headers and skips the manual mapping step | Backend L2 detection heuristic in detect-columns endpoint, format_detected response field, suggest_field_mapping match_type response shape, frontend L2 banner + confidence badges |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | ORM for Voter model column additions | Already in use, async support |
| Alembic | 1.18.4 | Database migrations for new columns | Already in use, async via asyncpg |
| RapidFuzz | 3.14.3 | Fuzzy string matching for field mapping | Already in use at 75% threshold |
| Pydantic | 2.12.5 | Schema validation for API responses | Already in use for all schemas |
| FastAPI | 0.135.1 | API endpoint modifications | Already in use |

### Frontend
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React | (existing) | UI components | Import wizard modifications |
| shadcn/ui | (existing) | UI primitives (Select, Badge, Alert) | L2 banner, confidence badges |
| Lucide React | (existing) | Icons (CheckCircle2, AlertTriangle, Info) | Per-field match type icons |
| TanStack Query | (existing) | Data fetching hooks | useDetectColumns response shape |
| Vitest | 4.0.18 | Frontend unit tests | ColumnMappingTable tests |
| Playwright | 1.58.2 | E2E browser tests | Import wizard E2E test |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Modification Targets (Exact Files)

```
app/
  models/voter.py              # +12 new nullable columns
  services/import_service.py   # CANONICAL_FIELDS aliases, parse_voting_history expansion,
                               #   suggest_field_mapping return shape, L2 detection helper,
                               #   _VOTER_COLUMNS additions
  api/v1/imports.py            # detect_columns endpoint: L2 detection + format_detected
  schemas/import_job.py        # ImportJobResponse: +format_detected field
alembic/
  versions/019_l2_voter_columns.py  # New migration: 12 nullable columns on voters table
web/
  src/types/import-job.ts      # ImportDetectResponse: format_detected + match_type shape
  src/hooks/useImports.ts      # useDetectColumns response type
  src/components/voters/
    column-mapping-constants.ts  # FIELD_GROUPS + FIELD_LABELS: add 12 new fields
    ColumnMappingTable.tsx       # match_type badges (exact vs fuzzy), L2 banner prop
  src/routes/campaigns/$campaignId/voters/imports/new.tsx  # L2 banner, pass format_detected
tests/
  unit/test_l2_mapping.py           # L2 header mapping: all 47 data columns
  unit/test_voting_history_l2.py    # New voting history patterns
  unit/test_l2_detection.py         # L2 detection heuristic tests
```

### Pattern 1: Alias-Based Auto-Mapping
**What:** Add explicit aliases to `CANONICAL_FIELDS` dict for every L2 friendly-name header.
**When to use:** For all 22 unmapped L2 data columns (10 existing + 12 new).
**Example:**
```python
# Existing pattern in import_service.py
"party": [
    "party",
    "party_affiliation",
    "political_party",
    "parties_description",
    # L2 friendly name headers
    "registered_party",         # "Registered Party" -> normalized
],
```
The normalizer in `suggest_field_mapping()` converts "Registered Party" to "registered_party" via `.strip().lower().replace(" ", "_")`. This normalized form must match an alias exactly or fuzz above 75%.

### Pattern 2: Voting History Regex Expansion
**What:** Expand `parse_voting_history()` to handle "Voted in YYYY", "Voted in YYYY Primary", bare year, and typo patterns.
**When to use:** For the 8 voting history columns in L2 files.
**Example:**
```python
# Current regex: only matches General_YYYY / Primary_YYYY
_VOTING_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")

# Expanded: must also match:
# "Voted in YYYY"        -> General_YYYY  (D-01)
# "Voted in YYYY Primary" -> Primary_YYYY (D-02)
# "Voter in YYYY Primary" -> Primary_YYYY (D-04, typo)
# Bare "YYYY"            -> General_YYYY  (D-03)
# Plus the existing General_YYYY / Primary_YYYY
```

### Pattern 3: Response Shape Change (D-17)
**What:** Change `suggest_field_mapping()` return from `dict[str, str | None]` to `dict[str, dict]`.
**When to use:** To provide per-field match quality information to the frontend.
**Example:**
```python
# Before: {"First Name": "first_name", "Unknown Col": None}
# After:  {"First Name": {"field": "first_name", "match_type": "exact"},
#          "Unknown Col": {"field": null, "match_type": null}}

# match_type values:
# "exact" - normalized header matched an alias in _ALIAS_TO_FIELD directly
# "fuzzy" - matched via RapidFuzz above 75% threshold
# null    - no match found
```

### Pattern 4: L2 Detection Heuristic (D-10)
**What:** After mapping is computed, count how many columns matched via exact alias lookup vs total columns. If >80%, flag as L2.
**When to use:** In the detect-columns endpoint, after suggest_field_mapping returns.
**Example:**
```python
def detect_l2_format(mapping_result: dict[str, dict]) -> str | None:
    """Detect if columns indicate an L2 voter file format.

    Returns 'l2' if >80% of columns have exact alias matches,
    'generic' otherwise.
    """
    total = len(mapping_result)
    if total == 0:
        return None
    exact_count = sum(
        1 for v in mapping_result.values()
        if v.get("match_type") == "exact" and v.get("field") is not None
    )
    ratio = exact_count / total
    return "l2" if ratio > 0.80 else "generic"
```

### Anti-Patterns to Avoid
- **Separate L2 code path:** Per D-09, do NOT create a separate L2 mapping function. The existing fuzzy pipeline handles all file types. L2 columns succeed because they have explicit aliases.
- **Fuzzy-only for known typos:** Per D-08, known L2 typos ("Lattitude", "Mailng Designator", "Mailing Aptartment Number") MUST be explicit aliases. Do not rely on fuzzy matching for predictable patterns.
- **Frontend-side detection:** Per D-05, L2 detection is backend-only. Frontend reads `format_detected` from the response.
- **Skipping the mapping step:** Per D-06, the wizard still shows the mapping step with all fields pre-filled. It is NOT skipped.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| String fuzzy matching | Custom distance algo | RapidFuzz `fuzz.ratio` with `process.extractOne` | Already integrated, handles Unicode, fast C implementation |
| Alembic migration boilerplate | Manual SQL scripts | `op.add_column()` with `sa.Column()` | Standard Alembic pattern, handles upgrade/downgrade |
| Info banner component | Custom styled div | shadcn/ui `Alert` with `AlertDescription` | Consistent with existing UI, accessible |
| Per-field badges | Custom icon components | Lucide React icons (CheckCircle2, AlertTriangle, Sparkles) | Already used in ColumnMappingTable.tsx |

## Common Pitfalls

### Pitfall 1: _VOTER_COLUMNS Not Updated
**What goes wrong:** New columns added to Voter model but not to `_VOTER_COLUMNS` set in import_service.py. Values silently go to `extra_data` instead of the new columns.
**Why it happens:** `_VOTER_COLUMNS` is a manually maintained set separate from the model definition.
**How to avoid:** After adding columns to Voter model, immediately add them to `_VOTER_COLUMNS`. The unit test in D-18 will catch this if all 47 data columns are asserted.
**Warning signs:** L2 import completes but new column values are NULL while `extra_data` has the values.

### Pitfall 2: Voting History Columns Counted in L2 Detection
**What goes wrong:** The 8 voting history columns (General_2024, Voted in 2022, etc.) should NOT be counted in the L2 detection ratio because they are not alias-mapped data columns -- they are handled by the parser.
**Why it happens:** Detection heuristic naively counts all columns.
**How to avoid:** Either exclude columns that match voting history patterns from the detection count, or accept that voting history columns will have `match_type: null` (they don't map to a canonical field). Since 47 of 55 columns are data columns and 8 are history, even if history columns get null, 47/55 = 85% which exceeds 80%. However, be aware of this edge case for smaller L2 exports.
**Warning signs:** L2 detection returns "generic" for valid L2 files.

### Pitfall 3: suggest_field_mapping Return Shape Breaking Existing Code
**What goes wrong:** Changing the return type from `dict[str, str | None]` to `dict[str, dict]` breaks all downstream consumers: `detect_columns` endpoint (stores in `suggested_mapping` JSONB), `apply_field_mapping()` (reads `field_mapping.get(csv_col)`), and the frontend.
**Why it happens:** The return shape change is fundamental and touches multiple integration points.
**How to avoid:** The change applies ONLY to `suggested_mapping` (auto-detected). The `field_mapping` (confirmed by user) remains `dict[str, str]`. In the detect endpoint, store the new shape in `suggested_mapping` JSONB. The confirm endpoint's `field_mapping` is already a separate field. Frontend must be updated to read the new shape. Existing `apply_field_mapping()` takes `field_mapping` (not `suggested_mapping`) so it is unaffected.
**Warning signs:** Runtime errors in confirm flow or frontend crash on mapping step.

### Pitfall 4: Alembic Migration Revision Chain
**What goes wrong:** New migration 019 specifies wrong `down_revision`, breaking the migration chain.
**Why it happens:** Manual revision ID management.
**How to avoid:** Set `down_revision = "018_last_committed_row"` (the current head).
**Warning signs:** `alembic upgrade head` fails with "Can't locate revision" error.

### Pitfall 5: Integer Coercion for New Columns
**What goes wrong:** `mailing_household_size` and `street_number_parity` values are strings from CSV but stored as Integer columns. Import fails with DB type errors.
**Why it happens:** `apply_field_mapping()` only coerces known int fields (`age`, `household_size`, `cell_phone_confidence`).
**How to avoid:** Add new integer columns to the coercion loop in `apply_field_mapping()`, or make them String columns. Based on D-11, most new columns should be String. Only `mailing_household_size` is Integer (like `household_size`).
**Warning signs:** Import fails with "invalid input syntax for type integer" error.

### Pitfall 6: Frontend Type Mismatch After D-17 Shape Change
**What goes wrong:** Frontend `ImportDetectResponse.suggested_mapping` type is `Record<string, string | null>` but backend now returns `Record<string, {field: string | null, match_type: string | null}>`. Frontend crashes trying to use the value as a string.
**Why it happens:** Type definition not updated, or only partially updated.
**How to avoid:** Update `web/src/types/import-job.ts` type, update `useDetectColumns` response handling, update `ImportWizardPage` to extract `field` from the new shape when initializing mapping state, update `ColumnMappingTable` props to pass match_type.
**Warning signs:** "Cannot read properties of object" errors in browser console.

## Code Examples

### Complete L2 Alias List for CANONICAL_FIELDS

Based on analysis of all 55 columns from `data/example-2026-02-24.csv`, here are the exact aliases needed for the 10 existing-field mappings:

```python
# Aliases to ADD to existing fields in CANONICAL_FIELDS:
"party": [..., "registered_party"],                          # "Registered Party"
"propensity_general": [..., "likelihood_to_vote"],           # "Likelihood to vote"
"propensity_primary": [..., "primary_likelihood_to_vote"],   # "Primary Likelihood to Vote"
"propensity_combined": [..., "combined_general_and_primary_likelihood_to_vote"],  # long name
"registration_line2": [..., "second_address_line"],          # "Second Address Line"
"party_change_indicator": [..., "voter_changed_party?"],     # "Voter Changed Party?"
"mailing_line2": [..., "mailing_address_extra_line"],        # "Mailing Address Extra Line"
"mailing_type": [..., "mailing_apartment_type"],             # "Mailing Apartment Type" per D-15
"family_id": [..., "mailing_family_id"],                     # "Mailing Family ID" per D-15
"military_status": [..., "military_active/veteran"],         # "Military Active/Veteran"
"latitude": [..., "lattitude"],                              # L2 typo: double-t
```

Note: "Lattitude" already fuzzy-matches to "latitude" (current behavior confirmed), but per D-08 it must be an explicit alias.

### New CANONICAL_FIELDS Entries for New Columns (D-11)

```python
# NEW entries in CANONICAL_FIELDS for new Voter model columns:
"house_number": [
    "house_number",
    # No other common aliases needed
],
"street_number_parity": [
    "street_number_parity",
    "street_number_odd/even",    # "Street Number Odd/Even"
],
"mailing_house_number": [
    "mailing_house_number",
],
"mailing_address_prefix": [
    "mailing_address_prefix",
],
"mailing_street_name": [
    "mailing_street_name",
],
"mailing_designator": [
    "mailing_designator",
    "mailng_designator",         # L2 typo: missing 'i'
],
"mailing_suffix_direction": [
    "mailing_suffix_direction",
],
"mailing_apartment_number": [
    "mailing_apartment_number",
    "mailing_aptartment_number", # L2 typo: transposed letters
],
"mailing_bar_code": [
    "mailing_bar_code",
],
"mailing_verifier": [
    "mailing_verifier",
],
"mailing_household_size": [
    "mailing_household_size",
    "mailing_families_hhcount",  # "Mailing_Families_HHCount" per D-13
],
"mailing_household_party_registration": [
    "mailing_household_party_registration",
    # "Mailing Household Party Registration" per D-14
],
```

### Expanded parse_voting_history

```python
# Current: only General_YYYY / Primary_YYYY
_VOTING_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")

# Expanded patterns needed:
_CANONICAL_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")
_VOTED_IN_RE = re.compile(r"^Vote[dr]?\s+in\s+(\d{4})(?:\s+Primary)?$", re.IGNORECASE)
_BARE_YEAR_RE = re.compile(r"^(\d{4})$")

def parse_voting_history(row: dict[str, str]) -> list[str]:
    history: list[str] = []
    for col, val in row.items():
        if not val or val.strip().upper() not in _VOTED_VALUES:
            continue

        # Pattern 1: General_YYYY / Primary_YYYY (existing)
        m = _CANONICAL_HISTORY_RE.match(col)
        if m:
            history.append(col)
            continue

        # Pattern 2: "Voted in YYYY" -> General_YYYY (D-01)
        # Pattern 3: "Voted in YYYY Primary" -> Primary_YYYY (D-02)
        # Pattern 4: "Voter in YYYY Primary" -> Primary_YYYY (D-04, typo)
        m = _VOTED_IN_RE.match(col)
        if m:
            year = m.group(1)
            is_primary = col.strip().lower().endswith("primary")
            canonical = f"Primary_{year}" if is_primary else f"General_{year}"
            history.append(canonical)
            continue

        # Pattern 5: Bare "YYYY" -> General_YYYY (D-03)
        m = _BARE_YEAR_RE.match(col.strip())
        if m:
            history.append(f"General_{m.group(1)}")
            continue

    return sorted(history)
```

### Alembic Migration Pattern

```python
# alembic/versions/019_l2_voter_columns.py
revision: str = "019_l2_voter_columns"
down_revision: str = "018_last_committed_row"

def upgrade() -> None:
    # All new columns are nullable String unless noted
    op.add_column("voters", sa.Column("house_number", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("street_number_parity", sa.String(10), nullable=True))
    op.add_column("voters", sa.Column("mailing_house_number", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_address_prefix", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_street_name", sa.String(255), nullable=True))
    op.add_column("voters", sa.Column("mailing_designator", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_suffix_direction", sa.String(10), nullable=True))
    op.add_column("voters", sa.Column("mailing_apartment_number", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_bar_code", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_verifier", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_household_party_registration", sa.String(50), nullable=True))
    op.add_column("voters", sa.Column("mailing_household_size", sa.SmallInteger(), nullable=True))

def downgrade() -> None:
    for col in [
        "mailing_household_size", "mailing_household_party_registration",
        "mailing_verifier", "mailing_bar_code", "mailing_apartment_number",
        "mailing_suffix_direction", "mailing_designator", "mailing_street_name",
        "mailing_address_prefix", "mailing_house_number",
        "street_number_parity", "house_number",
    ]:
        op.drop_column("voters", col)
```

### Frontend: Updated ImportDetectResponse Type

```typescript
// web/src/types/import-job.ts
export interface FieldMapping {
  field: string | null
  match_type: "exact" | "fuzzy" | null
}

export interface ImportDetectResponse {
  detected_columns: string[]
  suggested_mapping: Record<string, FieldMapping>
  format_detected: "l2" | "generic" | null
}
```

## Complete Column Analysis

### All 55 L2 Columns and Their Disposition

**Already mapped (25 data columns):**
| # | L2 Header | Maps To | Match Type |
|---|-----------|---------|------------|
| 1 | Voter ID | source_id | fuzzy (via "voter_id" alias) |
| 2 | First Name | first_name | fuzzy (via "first_name" alias) |
| 3 | Last Name | last_name | fuzzy (via "last_name" alias) |
| 5 | Gender | gender | exact |
| 6 | Age | age | exact |
| 10 | Apartment Type | registration_apartment_type | fuzzy (via "apartment_type" alias) |
| 11 | Ethnicity | ethnicity | exact |
| 12 | Lattitude | latitude | fuzzy (typo still matches) |
| 13 | Longitude | longitude | exact |
| 14 | Household Party Registration | household_party_registration | fuzzy |
| 15 | Mailing Household Size | household_size | fuzzy (per D-13) |
| 17 | Cell Phone | __cell_phone | fuzzy (via "cell_phone" alias) |
| 18 | Cell Phone Confidence Code | cell_phone_confidence | fuzzy |
| 20 | Spoken Language | spoken_language | fuzzy |
| 21 | Address | registration_line1 | fuzzy (via "address" alias) |
| 24 | City | registration_city | fuzzy (via "city" alias) |
| 25 | State | registration_state | fuzzy (via "state" alias) |
| 26 | Zipcode | registration_zip | fuzzy (via "zipcode" alias) |
| 27 | Zip+4 | registration_zip4 | fuzzy |
| 28 | Mailing Address | mailing_line1 | fuzzy |
| 30 | Mailing City | mailing_city | fuzzy |
| 31 | Mailing State | mailing_state | fuzzy |
| 32 | Mailing Zip | mailing_zip | fuzzy |
| 33 | Mailing Zip+4 | mailing_zip4 | fuzzy |
| 43 | Marital Status | marital_status | fuzzy |

**Need alias to existing field (10 columns):**
| # | L2 Header | Target Existing Field | Normalized Alias |
|---|-----------|----------------------|------------------|
| 4 | Registered Party | party | registered_party |
| 7 | Likelihood to vote | propensity_general | likelihood_to_vote |
| 8 | Primary Likelihood to Vote | propensity_primary | primary_likelihood_to_vote |
| 9 | Combined General and Primary Likelihood to Vote | propensity_combined | combined_general_and_primary_likelihood_to_vote |
| 22 | Second Address Line | registration_line2 | second_address_line |
| 19 | Voter Changed Party? | party_change_indicator | voter_changed_party? |
| 29 | Mailing Address Extra Line | mailing_line2 | mailing_address_extra_line |
| 42 | Mailing Apartment Type | mailing_type | mailing_apartment_type (per D-15) |
| 44 | Mailing Family ID | family_id | mailing_family_id (per D-15) |
| 47 | Military Active/Veteran | military_status | military_active/veteran |

**Need NEW Voter model column + alias (12 columns):**
| # | L2 Header | New Column | Type |
|---|-----------|-----------|------|
| 23 | House Number | house_number | String(50) |
| 16 | Street Number Odd/Even | street_number_parity | String(10) |
| 36 | Mailing House Number | mailing_house_number | String(50) |
| 37 | Mailing Address Prefix | mailing_address_prefix | String(50) |
| 38 | Mailing Street Name | mailing_street_name | String(255) |
| 39 | Mailng Designator | mailing_designator | String(50) |
| 40 | Mailing Suffix Direction | mailing_suffix_direction | String(10) |
| 41 | Mailing Aptartment Number | mailing_apartment_number | String(50) |
| 34 | Mailing Bar Code | mailing_bar_code | String(50) |
| 35 | Mailing Verifier | mailing_verifier | String(50) |
| 45 | Mailing_Families_HHCount | mailing_household_size | SmallInteger |
| 46 | Mailing Household Party Registration | mailing_household_party_registration | String(50) |

**Voting history columns (8 -- handled by parser, not alias mapping):**
| # | L2 Header | Canonical Form | Parser Pattern |
|---|-----------|---------------|----------------|
| 48 | General_2024 | General_2024 | Existing regex |
| 52 | Primary_2024 | Primary_2024 | Existing regex |
| 49 | Voted in 2022 | General_2022 | New: D-01 |
| 50 | Voted in 2020 | General_2020 | New: D-01 |
| 51 | Voted in 2018 | General_2018 | New: D-01 |
| 53 | Voted in 2022 Primary | Primary_2022 | New: D-02 |
| 54 | Voter in 2020 Primary | Primary_2020 | New: D-04 (typo) |
| 55 | Voted in 2018 Primary | Primary_2018 | New: D-02 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Voting history: General_YYYY/Primary_YYYY only | + "Voted in YYYY", bare year, typo patterns | This phase | Handles all L2 voting history variants |
| suggest_field_mapping returns str or None | Returns {field, match_type} dict per column | This phase (D-17) | Enables per-field confidence display |
| No vendor format detection | format_detected field in detect response | This phase (D-16) | Extensible for TargetSmart, Aristotle later |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 (backend), vitest 4.0.18 (frontend) |
| Config file | `pyproject.toml` [tool.pytest.ini_options], `web/vitest.config.ts` |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/unit/ -q && cd web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| L2MP-01 | All 47 data columns map to correct canonical fields | unit | `uv run pytest tests/unit/test_l2_mapping.py -x` | Wave 0 |
| L2MP-01 | New Voter columns exist in _VOTER_COLUMNS | unit | `uv run pytest tests/unit/test_l2_mapping.py::test_new_columns_in_voter_columns -x` | Wave 0 |
| L2MP-02 | "Voted in YYYY" maps to General_YYYY | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | Wave 0 |
| L2MP-02 | "Voted in YYYY Primary" maps to Primary_YYYY | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | Wave 0 |
| L2MP-02 | Typo "Voter in YYYY Primary" handled | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | Wave 0 |
| L2MP-02 | Bare year columns handled | unit | `uv run pytest tests/unit/test_voting_history_l2.py -x` | Wave 0 |
| L2MP-03 | L2 format detected when >80% exact matches | unit | `uv run pytest tests/unit/test_l2_detection.py -x` | Wave 0 |
| L2MP-03 | format_detected in API response | unit | `uv run pytest tests/unit/test_l2_detection.py -x` | Wave 0 |
| L2MP-03 | match_type in suggested_mapping | unit | `uv run pytest tests/unit/test_l2_mapping.py -x` | Wave 0 |
| L2MP-03 | Frontend: L2 banner shown | vitest | `cd web && npx vitest run src/components/voters/ColumnMappingTable.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/unit/ -q && cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_l2_mapping.py` -- covers L2MP-01 (all 47 data columns mapped, new columns in _VOTER_COLUMNS)
- [ ] `tests/unit/test_voting_history_l2.py` -- covers L2MP-02 (all 4 new voting history patterns)
- [ ] `tests/unit/test_l2_detection.py` -- covers L2MP-03 (detection heuristic, format_detected, match_type)
- [ ] `web/src/components/voters/ColumnMappingTable.test.tsx` updates -- covers L2MP-03 frontend (L2 banner, match_type badges)

## Open Questions

1. **Normalized alias for "Voter Changed Party?"**
   - What we know: `suggest_field_mapping()` normalizes via `.strip().lower().replace(" ", "_")`, producing `"voter_changed_party?"`. The `?` character passes through normalization.
   - What's unclear: Whether RapidFuzz handles the `?` well in fuzzy matching at 75%.
   - Recommendation: Add `"voter_changed_party?"` as an explicit alias to guarantee exact match. The `?` is preserved in both the normalized header and the alias, so exact lookup in `_ALIAS_TO_FIELD` will match.

2. **String length for mailing_bar_code and mailing_verifier**
   - What we know: USPS delivery point barcodes are typically 12 digits. Address verification codes are short.
   - What's unclear: Maximum possible lengths in L2 data.
   - Recommendation: Use String(50) for both -- generous enough for any variant. These are informational fields, not queried.

3. **mailing_household_size type: SmallInteger vs String**
   - What we know: D-11 lists it alongside other new columns. The existing `household_size` is `SmallInteger`. The L2 value in the sample is empty for this voter.
   - Recommendation: Use SmallInteger to match existing `household_size` pattern. Add it to the integer coercion loop in `apply_field_mapping()`.

## Sources

### Primary (HIGH confidence)
- `data/example-2026-02-24.csv` -- L2 sample file with all 55 column headers. Verified programmatically.
- `app/services/import_service.py` -- Current CANONICAL_FIELDS (lines 38-338), parse_voting_history (lines 420-435), suggest_field_mapping (lines 500-536), _VOTER_COLUMNS (lines 451-497)
- `app/models/voter.py` -- Current Voter model with all existing columns
- `app/api/v1/imports.py` -- detect_columns endpoint (lines 102-182)
- `app/schemas/import_job.py` -- ImportJobResponse, ImportDetectResponse shapes
- `web/src/components/voters/column-mapping-constants.ts` -- Frontend FIELD_GROUPS and FIELD_LABELS
- `web/src/components/voters/ColumnMappingTable.tsx` -- Current badge logic
- `web/src/types/import-job.ts` -- Frontend type definitions
- `alembic/versions/018_add_last_committed_row.py` -- Most recent migration (revision chain reference)

### Secondary (MEDIUM confidence)
- `tests/unit/test_import_parsing.py`, `test_import_service.py`, `test_field_mapping.py` -- Existing test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies needed
- Architecture: HIGH -- all modification targets identified with exact line numbers, existing patterns well understood
- Pitfalls: HIGH -- identified from direct code analysis and D-17 shape change implications
- Column mapping: HIGH -- programmatically verified current mapping state against actual L2 sample file

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependencies changing)
