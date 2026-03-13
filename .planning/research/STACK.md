# Technology Stack

**Project:** CivicPulse Run v1.3 -- Voter Model & Import Enhancement
**Researched:** 2026-03-13
**Confidence:** HIGH

## Context

This research covers ONLY the backend changes needed for v1.3. The existing validated stack is not re-evaluated. This milestone is primarily a schema expansion + import pipeline enhancement -- no new libraries are required.

**Already installed and validated (DO NOT ADD):**
- FastAPI >=0.135.1, Uvicorn >=0.41.0
- SQLAlchemy >=2.0.48 (async, mapped_column style)
- asyncpg >=0.31.0, psycopg2-binary >=2.9.11
- PostgreSQL + PostGIS (via GeoAlchemy2 >=0.18.4)
- Alembic >=1.18.4 (migration management)
- RapidFuzz >=3.14.3 (fuzzy field matching at 75% threshold)
- Pydantic >=2.12.5, pydantic-settings >=2.13.1
- aioboto3 >=15.5.0 (MinIO/S3 for file storage)
- TaskIQ >=0.12.1 (background job processing)
- Loguru >=0.7.3

## Recommended Stack Changes

### Zero New Dependencies Required

This milestone requires **no new Python packages**. All capabilities needed for the voter model expansion and import pipeline enhancement are provided by the existing stack:

| Capability Needed | Provided By | Already Installed |
|---|---|---|
| New Voter model columns (propensity scores) | SQLAlchemy `SmallInteger` / `Integer` | Yes (>=2.0.48) |
| New Voter model columns (strings) | SQLAlchemy `String` / `mapped_column` | Yes (>=2.0.48) |
| Alembic ADD COLUMN migration | Alembic `op.add_column()` | Yes (>=1.18.4) |
| Expanded L2 field mapping aliases | RapidFuzz `fuzz.ratio` (existing pattern) | Yes (>=3.14.3) |
| Phone number parsing/normalization | Python `re` stdlib | Yes (stdlib) |
| Voting history Y/N column detection | Python `re` stdlib + string ops | Yes (stdlib) |
| Batch VoterPhone upsert during import | SQLAlchemy `insert().on_conflict_do_update()` | Yes (>=2.0.48) |
| Updated Pydantic schemas | Pydantic `BaseModel` | Yes (>=2.12.5) |

## Column Type Decisions for New Voter Fields

### Propensity Scores: Use `SmallInteger` (not Numeric, not Float)

L2 propensity scores are expressed in deciles from 10 to 100 (representing 0-10th percentile through 90-99th percentile). They are integer values, never fractional.

| Decision | Rationale |
|---|---|
| Use `SmallInteger` | Scores are integers 0-100. SmallInteger uses 2 bytes vs Integer's 4 bytes -- saves ~40 bytes per voter row across ~20 score columns. At 500K voters, that is 20MB savings. |
| NOT `Numeric(5,2)` | Propensity scores from L2 are integer deciles (10, 20, ..., 100), never 85.73. Numeric adds Decimal overhead in Python (serialization complexity, Pydantic string coercion in JSON) for no benefit. |
| NOT `Float` | Float has IEEE 754 rounding issues. Scores are exact integers. Also, Float uses 8 bytes vs SmallInteger's 2 bytes. |

**SQLAlchemy pattern:**
```python
# In Voter model -- ~20 propensity score columns
propensity_turnout: Mapped[int | None] = mapped_column(SmallInteger)
propensity_partisan: Mapped[int | None] = mapped_column(SmallInteger)
# ... etc.
```

**Pydantic pattern:**
```python
# In VoterResponse schema -- no special handling needed
propensity_turnout: int | None = None
propensity_partisan: int | None = None
```

**Why this matters:** Using `Numeric` would cause Pydantic v2 to serialize scores as strings in JSON (Pydantic v2 serializes `Decimal` as strings by default). That would require either custom serializers on every score field or `asdecimal=False` on the SQLAlchemy column. `SmallInteger` avoids this entirely -- scores serialize as plain JSON integers.

**Confidence:** HIGH -- L2's own documentation states scores are decile integers 10-100. SmallInteger is the correct PostgreSQL type for this range.

### String Demographic Fields: Use `String` (not Enum)

| Field | Type | Size | Rationale |
|---|---|---|---|
| `language_preference` | `String(100)` | Variable | L2 has dozens of language values. Enum would require ALTER TYPE for new values. Project convention is `native_enum=False` for all enums anyway. Plain String is simpler and consistent. |
| `marital_status` | `String(50)` | Variable | Values: Single, Married, Divorced, etc. Same rationale as language. |
| `military_status` | `String(50)` | Variable | Values: Active, Veteran, Reserves, etc. Small value set but may expand. |
| `occupation` | `String(255)` | Variable | Free-text from L2 commercial data. |
| `education` | `String(100)` | Variable | Values from L2 modeling. |
| `home_owner_renter` | `String(50)` | Variable | Owner/Renter/Unknown. |
| `estimated_hh_income` | `String(100)` | Variable | L2 encodes as range strings like "$50K-$75K". Store as-is, not as numeric. |

**Why String over StrEnum:** The existing project uses `native_enum=False` for all StrEnum columns (documented in Key Decisions). For demographic fields with vendor-provided values, plain `String` is even simpler -- no Python enum class needed, values pass through from import directly. If the UI later needs validated dropdown values, those can be driven from a frontend enum or a lookup table without schema changes.

**Confidence:** HIGH -- consistent with the existing `native_enum=False` project convention.

### Mailing Address Fields: Inline on Voter Model (not VoterAddress)

| Field | Type | Size | Why |
|---|---|---|---|
| `mail_address_line1` | `String(500)` | Variable | L2 provides separate mailing address distinct from residence. |
| `mail_address_line2` | `String(500)` | Variable | Secondary line. |
| `mail_city` | `String(255)` | Variable | Mailing city. |
| `mail_state` | `String(2)` | Fixed | Mailing state abbreviation. |
| `mail_zip_code` | `String(10)` | Variable | Mailing ZIP. |

**Why inline on Voter instead of using VoterAddress model:** The VoterAddress model is for user-managed contact records with CRUD operations, primary flags, and interaction event emission. L2 mailing addresses are imported data, not user-editable contacts. Mixing imported vendor data into the contact CRUD model creates confusion about data provenance and bloats the contact service with non-interactive records.

**Confidence:** HIGH -- architecture decision based on existing data model separation.

### ZIP+4 and Household Enrichment: Column Additions

| Field | Type | Size | Why |
|---|---|---|---|
| `zip4` | `String(4)` | Fixed | L2 provides +4 extension separately from ZIP. Existing `zip_code` is `String(10)` so it *could* hold "12345-6789", but L2 sends them in separate columns. Store separately for clean filtering and avoid requiring users to parse ZIP+4 format. |
| `household_size` | `SmallInteger` | 2 bytes | Integer count of household members. SmallInteger is sufficient (max 32,767). |
| `num_children` | `SmallInteger` | 2 bytes | Count of children in household. |
| `dwelling_type` | `String(50)` | Variable | Single Family, Multi-Family, etc. |
| `home_value` | `String(100)` | Variable | L2 encodes as range strings. Store as-is. |

**Confidence:** HIGH -- straightforward column additions following existing patterns.

### Complete New Column List (~20 columns)

**Propensity Scores (SmallInteger, all nullable):**
1. `propensity_turnout` -- General election turnout propensity
2. `propensity_partisan` -- Partisan propensity (higher = more R-leaning in L2 encoding)
3. `propensity_primary` -- Primary election turnout propensity
4. `propensity_caucus` -- Caucus participation propensity
5. `propensity_gun_owner` -- Gun ownership propensity
6. `propensity_religious` -- Religious propensity

**Demographics (String, all nullable):**
7. `language_preference` -- Primary language
8. `marital_status` -- Marital status
9. `military_status` -- Military/veteran status
10. `occupation` -- Occupation
11. `education` -- Education level
12. `home_owner_renter` -- Homeownership status
13. `estimated_hh_income` -- Estimated household income range

**Mailing Address (String, all nullable):**
14. `mail_address_line1` -- Mailing street address
15. `mail_address_line2` -- Mailing secondary line
16. `mail_city` -- Mailing city
17. `mail_state` -- Mailing state
18. `mail_zip_code` -- Mailing ZIP

**Household/Residence Enrichment (various, all nullable):**
19. `zip4` -- ZIP+4 extension
20. `household_size` -- Household member count
21. `num_children` -- Children in household
22. `dwelling_type` -- Dwelling classification
23. `home_value` -- Home value range

## Import Pipeline Enhancements (No New Libraries)

### Auto-Create VoterPhone During Import

**Approach:** Extend `ImportService.process_csv_batch()` to detect phone columns, normalize phone numbers, and batch-insert VoterPhone records in the same transaction.

**Implementation uses existing tools:**
- Phone number detection: Add phone-related entries to `CANONICAL_FIELDS` mapping (e.g., `"phone"`, `"cell_phone"`, `"home_phone"`)
- Phone normalization: Python `re.sub(r'[^0-9]', '', value)` to strip non-digits. No library needed.
- Phone insertion: `insert(VoterPhone).values(...)` with `on_conflict_do_nothing()` -- same pattern as the existing voter upsert
- Transaction boundary: Use `session.flush()` after voter upsert (to get voter IDs), then insert phones in the same session -- no new transaction management needed

**Critical design choice:** Use `on_conflict_do_nothing()` for phones (not `on_conflict_do_update()`). Phone numbers from import should not overwrite user-edited phone records. The VoterPhone table has no unique constraint on (voter_id, value) currently, so one will need to be added via migration.

**Why not a phone number library (python-phonenumbers):** L2 and most US voter files provide 10-digit US phone numbers. The strip-non-digits approach handles the common cases (dashes, parens, spaces). International phone validation (E.164) is not needed for US voter files. Adding a 10MB library (python-phonenumbers includes the entire Google libphonenumber database) for strip-and-validate-length is not justified.

**Confidence:** HIGH -- phone normalization is string manipulation, not a library problem.

### Voting History Y/N Column Parsing

**Approach:** Detect columns matching election patterns (e.g., `General_2024`, `Primary_2022`, `General_2020_11_03`) where values are "Y" or "N", and convert them into the existing `voting_history` ARRAY.

**Implementation uses existing tools:**
- Column detection: `re.match(r'^(General|Primary|Municipal|Special|Runoff)_\d{4}', col)` pattern matching
- Value parsing: Simple `value.strip().upper() == 'Y'` check
- Array building: Collect matching election identifiers into a list, assign to `voting_history` field
- Integration point: New step in `apply_field_mapping()` that runs after standard field mapping, before the row is yielded

**Why regex pattern matching instead of fuzzy matching for election columns:** Election columns follow a strict naming convention in L2 files (`General_YYYY_MM_DD` or `General_YYYY`). Fuzzy matching would be wrong here -- we need exact pattern recognition. A column named "General_2024" should map to a voting history entry, not fuzzy-match against a canonical field.

**Confidence:** HIGH -- pattern matching on election column names is deterministic.

### Expanded L2 Field Mapping

**Approach:** Add new aliases to the existing `CANONICAL_FIELDS` dictionary and the `_L2_MAPPING` template. No structural changes to the mapping system.

New CANONICAL_FIELDS entries to add:
```python
"language_preference": [
    "language_preference", "language", "primary_language",
    "languages_description",
],
"marital_status": [
    "marital_status", "marital", "voters_maritalstatus",
],
"military_status": [
    "military_status", "military", "commercialdata_militarystatus",
],
"mail_address_line1": [
    "mail_address_line1", "mailing_address", "mail_address",
    "mail_addresses_addressline",
],
# ... etc. for all new fields
```

New L2 mapping template entries:
```python
"Languages_Description": "language_preference",
"Voters_MaritalStatus": "marital_status",
"CommercialData_MilitaryStatus": "military_status",
"Mail_Addresses_AddressLine": "mail_address_line1",
"Mail_Addresses_City": "mail_city",
"Mail_Addresses_State": "mail_state",
"Mail_Addresses_Zip": "mail_zip_code",
"Residence_Addresses_Zip4": "zip4",
# ... propensity scores ...
"Modeled_TurnoutScore": "propensity_turnout",
"Modeled_PartisanScore": "propensity_partisan",
# ... etc.
```

**Confidence:** MEDIUM for exact L2 column names -- L2's data dictionary is behind institutional access. The naming convention follows the established pattern in the existing L2 mapping (CamelCase with category prefixes). Exact names should be verified against an actual L2 file during implementation. The fuzzy matching system will handle minor naming variations.

## Database Migration Strategy

### Single Alembic Migration for All Column Additions

**Approach:** One migration file using `op.add_column()` for each new column. All columns are nullable (no default values needed), so this is an instant metadata-only operation in PostgreSQL -- no table rewrite.

```python
# Pattern for the migration
op.add_column("voters", sa.Column("propensity_turnout", sa.SmallInteger(), nullable=True))
op.add_column("voters", sa.Column("propensity_partisan", sa.SmallInteger(), nullable=True))
# ... ~20 more add_column calls
```

**Critical:** PostgreSQL ADD COLUMN with no DEFAULT and nullable=True is a metadata-only operation. It does NOT rewrite the table or lock it. This means:
- Safe to run on tables with millions of rows
- Near-instant execution
- No downtime required

**Index additions:** Add composite indexes on high-cardinality filter fields:
```python
op.create_index("ix_voters_campaign_language", "voters", ["campaign_id", "language_preference"])
op.create_index("ix_voters_campaign_military", "voters", ["campaign_id", "military_status"])
```

Also add the unique constraint for VoterPhone deduplication:
```python
op.create_unique_constraint(
    "uq_voter_phone_voter_value",
    "voter_phones",
    ["campaign_id", "voter_id", "value"],
)
```

**Confidence:** HIGH -- Alembic `add_column` is the established migration pattern in this project.

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| `python-phonenumbers` (10MB) | US voter files have 10-digit numbers. Strip non-digits + validate length is sufficient. | `re.sub(r'[^0-9]', '', value)` + length check |
| `pandas` for CSV processing | The existing `csv.DictReader` + batch upsert pipeline works well. Pandas would add a 50MB+ dependency for no benefit over the streaming batch approach. | Existing `csv.DictReader` + `process_csv_batch()` |
| `SQLAlchemy Numeric` for scores | Propensity scores are integers. Numeric adds Decimal serialization complexity. | `SmallInteger` -- 2 bytes, native int |
| `StrEnum` classes for demographics | Vendor values vary. Plain `String` with validation at the API layer is more flexible. Consistent with `native_enum=False` project convention. | `String(N)` with Pydantic validation if needed |
| `phonenumbers` or `E.164` validation | Voter files are US-only. Full international phone validation is overkill. | Regex strip + 10-digit validation |
| Any ORM relationship changes | New columns are all on the Voter model (flat). VoterPhone creation during import uses direct `insert()` statements, not ORM relationships. | Direct `insert(VoterPhone).values(...)` |

## Integration Points

### Files That Change

| File | Change Type | What Changes |
|---|---|---|
| `app/models/voter.py` | Modify | Add ~23 new `mapped_column` fields |
| `app/schemas/voter.py` | Modify | Add fields to VoterResponse, VoterCreateRequest, VoterUpdateRequest |
| `app/schemas/voter_filter.py` | Modify | Add new filter fields (language, military_status, propensity ranges, etc.) |
| `app/services/voter.py` | Modify | Extend `build_voter_query()` with new filter conditions |
| `app/services/import_service.py` | Modify | Add phone extraction, voting history parsing, new CANONICAL_FIELDS entries |
| `alembic/versions/006_*.py` | New | Migration for new voter columns + VoterPhone unique constraint |
| L2 mapping template | Modify | Update system template in migration with new field mappings |

### Files That Do NOT Change

| File | Why Not |
|---|---|
| `app/models/voter_contact.py` | VoterPhone model is unchanged. New unique constraint is migration-only. |
| `app/services/voter_contact.py` | Contact CRUD service is unchanged. Import creates phones directly. |
| `app/db/base.py` | No new models, just new columns on existing Voter model. |
| `pyproject.toml` | No new dependencies. |

## Installation

```bash
# No new packages to install.
# The existing stack covers all v1.3 requirements.

# To verify current versions:
uv pip list | grep -E "sqlalchemy|alembic|rapidfuzz|pydantic"
```

## Sources

- [SQLAlchemy 2.0 Type Hierarchy -- Numeric vs Float vs Integer](https://docs.sqlalchemy.org/en/20/core/type_basics.html) -- Column type selection reference
- [Pydantic v2 Decimal Serialization Issue #7457](https://github.com/pydantic/pydantic/issues/7457) -- Confirms Decimal-as-string serialization in JSON
- [L2 Partisanship Models](https://www.l2-data.com/l2-modeled-partisanship-models/) -- Confirms propensity scores are decile integers 10-100
- [L2 Data Dictionary Reference](https://www.l2-data.com/datamapping/voter-data-dictionary/) -- Field naming conventions (full dictionary behind institutional access)
- [L2 2025 Voter Data Dictionary](https://www.l2-data.com/wp-content/uploads/2025/08/L2-2025-VOTER-DATA-DICTIONARY-1.pdf) -- Current field listing (698 demographic variables)
- [PostgreSQL ADD COLUMN performance](https://www.postgresql.org/docs/current/sql-altertable.html) -- Confirms nullable ADD COLUMN is metadata-only
- [SQLAlchemy insert().on_conflict_do_nothing()](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html) -- Pattern for VoterPhone dedup during import
- Existing codebase: `app/models/voter.py`, `app/services/import_service.py`, `alembic/versions/002_voter_data_models.py` -- Established patterns

---
*Stack research for: CivicPulse Run v1.3 Voter Model & Import Enhancement -- backend changes only*
*Researched: 2026-03-13*
