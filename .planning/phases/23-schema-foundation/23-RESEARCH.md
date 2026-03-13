# Phase 23: Schema Foundation - Research

**Researched:** 2026-03-13
**Domain:** SQLAlchemy ORM model expansion, Alembic column rename/add migration, Pydantic schema evolution
**Confidence:** HIGH

## Summary

Phase 23 is a schema-layer change adding ~20 new columns to the Voter model, renaming 6 existing registration address columns with a `registration_` prefix, adding 8 new mailing address columns with a `mailing_` prefix, and adding a unique constraint to VoterPhone. All work is confined to: (1) one Alembic migration, (2) the Voter SQLAlchemy model, (3) the three Pydantic voter schemas, and (4) downstream Python code that references the renamed columns.

The rename of `address_line1` -> `registration_line1` (etc.) is the highest-risk operation because it touches the model, schemas, migration, voter service (query builder, CRUD), import service (CANONICAL_FIELDS, _VOTER_COLUMNS), walk_list service, turf service, voter contact API, and the frontend TypeScript types. However, all of these are well-understood, mechanical find-and-replace operations with existing test coverage to catch regressions.

**Primary recommendation:** Use a single Alembic migration with `op.alter_column(..., new_column_name=...)` for renames and `op.add_column()` for new columns. All new columns must be nullable (success criteria #5). Update the Python model, schemas, services, and tests atomically in the same task wave to avoid broken intermediate states.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `mailing_` prefix for all mailing address columns: mailing_line1, mailing_line2, mailing_city, mailing_state, mailing_zip, mailing_zip4, mailing_country, mailing_type
- Rename existing registration address fields to `registration_` prefix: address_line1 -> registration_line1, address_line2 -> registration_line2, city -> registration_city, state -> registration_state, zip_code -> registration_zip, county -> registration_county
- Registration address is no longer the "default" -- both addresses are explicitly prefixed
- `registration_zip` (not `registration_zip_code`) -- symmetric with mailing_zip
- County only exists on registration address (political geography), not mailing
- `registration_zip4` (String(4)) -- from VMOD-07 zip_plus4, belongs to registration address
- `registration_apartment_type` (String(20)) -- short codes: Apt, Unit, Ste, Lot, Bldg, Rm, Trlr, Fl, Lowr, Uppr, Rear, Frnt, Side, Spc, Dept, Hngr, Ph, Stop
- `mailing_zip4` (String(4)) -- from VMOD-02, belongs to mailing address
- No mailing equivalent for apartment_type
- household_id and family_id are distinct L2 concepts -- keep both
- household_id (existing, String(255)) -- geographic clustering, keeps its name
- family_id (new, String(255)) -- relational clustering
- household_size as SmallInteger (not Integer) -- values always small (1-20 range)
- household_party_registration as String(50)

### Claude's Discretion
- Migration ordering (single vs multiple migrations)
- Index strategy for new columns (which get indexed for Phase 25 filter queries)
- Column ordering within model sections
- Whether to add a registration_zip4 field alongside registration_zip (for symmetry with zip_plus4)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VMOD-01 | Voter model includes propensity_general, propensity_primary, propensity_combined as SmallInteger (0-100) | SmallInteger mapped_column pattern, nullable columns |
| VMOD-02 | Voter model includes mailing address fields (line1, line2, city, state, zip, zip4, country, type) | 8 new `mailing_*` String columns per locked decisions |
| VMOD-03 | Voter model includes spoken_language as String | Single new String(100) column |
| VMOD-04 | Voter model includes marital_status, military_status, party_change_indicator as String | Three new String columns |
| VMOD-05 | Voter model includes cell_phone_confidence as SmallInteger | SmallInteger nullable column |
| VMOD-06 | Voter model includes household_party_registration, household_size, family_id | String(50), SmallInteger, String(255) respectively |
| VMOD-07 | Voter model includes zip_plus4 and apartment_type | registration_zip4 String(4), registration_apartment_type String(20) per locked decisions |
| VMOD-08 | Alembic migration adds all new columns as nullable with appropriate indexes | Single migration file with rename + add_column + create_index + unique constraint |
| VMOD-09 | VoterResponse, VoterCreateRequest, VoterUpdateRequest include all new fields | Pydantic schema updates with Optional fields |
| VMOD-10 | VoterPhone unique constraint on (campaign_id, voter_id, value) | UniqueConstraint in model + op.create_unique_constraint in migration |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | ORM model definitions with Mapped[] | Already in project, async support |
| Alembic | 1.18.4 | Database migration for column adds/renames | Already in project, handles asyncpg |
| Pydantic | 2.12.5 | Request/response schema validation | Already in project via FastAPI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| asyncpg | 0.31.0 | PostgreSQL async driver | Runtime migrations (online mode) |
| psycopg2-binary | 2.9.11 | PostgreSQL sync driver | Offline migration generation |

No new libraries needed. This phase uses only existing dependencies.

## Architecture Patterns

### Column Rename Strategy (Critical Path)

The existing address columns must be renamed in the database using `op.alter_column()` with `new_column_name`. This is a PostgreSQL `ALTER TABLE ... RENAME COLUMN` which is metadata-only (no table rewrite) and safe for tables with existing data.

**Renames (6 columns):**
| Old Name | New Name | Index Impact |
|----------|----------|-------------|
| `address_line1` | `registration_line1` | None (no index on this column) |
| `address_line2` | `registration_line2` | None |
| `city` | `registration_city` | None (no index on city alone) |
| `state` | `registration_state` | None |
| `zip_code` | `registration_zip` | **YES** - must drop and recreate `ix_voters_campaign_zip` |
| `county` | `registration_county` | None |

**New columns (approximately 22):**

Registration address additions:
- `registration_zip4` String(4)
- `registration_apartment_type` String(20)

Mailing address (8 columns):
- `mailing_line1` String(500)
- `mailing_line2` String(500)
- `mailing_city` String(255)
- `mailing_state` String(2)
- `mailing_zip` String(10)
- `mailing_zip4` String(4)
- `mailing_country` String(100)
- `mailing_type` String(20)

Propensity scores (3 columns):
- `propensity_general` SmallInteger
- `propensity_primary` SmallInteger
- `propensity_combined` SmallInteger

Demographics (4 columns):
- `spoken_language` String(100)
- `marital_status` String(50)
- `military_status` String(50)
- `party_change_indicator` String(50)

Phone confidence (1 column):
- `cell_phone_confidence` SmallInteger

Household (3 columns):
- `household_party_registration` String(50)
- `household_size` SmallInteger
- `family_id` String(255)

### Recommended Model Organization

```python
# Registration Address (renamed from old Address section)
registration_line1: Mapped[str | None] = mapped_column(String(500))
registration_line2: Mapped[str | None] = mapped_column(String(500))
registration_city: Mapped[str | None] = mapped_column(String(255))
registration_state: Mapped[str | None] = mapped_column(String(2))
registration_zip: Mapped[str | None] = mapped_column(String(10))
registration_zip4: Mapped[str | None] = mapped_column(String(4))
registration_county: Mapped[str | None] = mapped_column(String(255))
registration_apartment_type: Mapped[str | None] = mapped_column(String(20))

# Mailing Address
mailing_line1: Mapped[str | None] = mapped_column(String(500))
mailing_line2: Mapped[str | None] = mapped_column(String(500))
mailing_city: Mapped[str | None] = mapped_column(String(255))
mailing_state: Mapped[str | None] = mapped_column(String(2))
mailing_zip: Mapped[str | None] = mapped_column(String(10))
mailing_zip4: Mapped[str | None] = mapped_column(String(4))
mailing_country: Mapped[str | None] = mapped_column(String(100))
mailing_type: Mapped[str | None] = mapped_column(String(20))

# Propensity Scores
propensity_general: Mapped[int | None] = mapped_column(SmallInteger)
propensity_primary: Mapped[int | None] = mapped_column(SmallInteger)
propensity_combined: Mapped[int | None] = mapped_column(SmallInteger)

# Demographics (expanded)
spoken_language: Mapped[str | None] = mapped_column(String(100))
marital_status: Mapped[str | None] = mapped_column(String(50))
military_status: Mapped[str | None] = mapped_column(String(50))
party_change_indicator: Mapped[str | None] = mapped_column(String(50))
cell_phone_confidence: Mapped[int | None] = mapped_column(SmallInteger)

# Household
household_party_registration: Mapped[str | None] = mapped_column(String(50))
household_size: Mapped[int | None] = mapped_column(SmallInteger)
family_id: Mapped[str | None] = mapped_column(String(255))
```

### Index Strategy (Claude's Discretion -- Recommendation)

Phase 25 will add filter queries on propensity ranges, ethnicity, spoken_language, military_status, mailing_city, mailing_state, and mailing_zip. Create indexes now to avoid a second migration later.

**Recommended indexes:**
| Index Name | Columns | Rationale |
|------------|---------|-----------|
| `ix_voters_campaign_reg_zip` | `campaign_id, registration_zip` | Replaces old `ix_voters_campaign_zip` after rename |
| `ix_voters_campaign_mailing_zip` | `campaign_id, mailing_zip` | FILT-03 mailing_zip filter |
| `ix_voters_campaign_mailing_city` | `campaign_id, mailing_city` | FILT-03 mailing_city filter |
| `ix_voters_campaign_mailing_state` | `campaign_id, mailing_state` | FILT-03 mailing_state filter |

**Not indexed (low cardinality or range queries better served by sequential scan):**
- propensity scores: Range queries on SmallInteger with campaign_id scoping -- unlikely to benefit from B-tree index on tables < 1M rows per campaign
- spoken_language, military_status, ethnicity: Multi-select IN filters, moderate cardinality -- add only if Phase 25 profiling shows need
- family_id: Not filtered until future phases

### Migration Pattern

```python
"""Expand voter model with address renames and new columns.

Revision ID: 006
Revises: 005
"""

import sqlalchemy as sa
from alembic import op

def upgrade() -> None:
    # 1. Rename registration address columns
    op.alter_column("voters", "address_line1", new_column_name="registration_line1")
    op.alter_column("voters", "address_line2", new_column_name="registration_line2")
    op.alter_column("voters", "city", new_column_name="registration_city")
    op.alter_column("voters", "state", new_column_name="registration_state")
    op.alter_column("voters", "zip_code", new_column_name="registration_zip")
    op.alter_column("voters", "county", new_column_name="registration_county")

    # 2. Drop and recreate renamed-column index
    op.drop_index("ix_voters_campaign_zip", table_name="voters")
    op.create_index("ix_voters_campaign_reg_zip", "voters", ["campaign_id", "registration_zip"])

    # 3. Add new registration address columns
    op.add_column("voters", sa.Column("registration_zip4", sa.String(4), nullable=True))
    op.add_column("voters", sa.Column("registration_apartment_type", sa.String(20), nullable=True))

    # 4. Add mailing address columns
    op.add_column("voters", sa.Column("mailing_line1", sa.String(500), nullable=True))
    # ... (all 8 mailing columns)

    # 5. Add propensity, demographics, household columns
    op.add_column("voters", sa.Column("propensity_general", sa.SmallInteger(), nullable=True))
    # ... (all remaining columns)

    # 6. Create indexes for Phase 25 filter queries
    op.create_index("ix_voters_campaign_mailing_zip", "voters", ["campaign_id", "mailing_zip"])
    # ... (additional indexes)

    # 7. VoterPhone unique constraint
    op.create_unique_constraint(
        "uq_voter_phone_campaign_voter_value",
        "voter_phones",
        ["campaign_id", "voter_id", "value"],
    )

    # 8. Update L2 mapping template for renamed columns
    op.execute("""
        UPDATE field_mapping_templates
        SET mapping = jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(mapping,
                                '{Residence_Addresses_AddressLine}', '"registration_line1"'),
                            '{Residence_Addresses_ExtraAddressLine}', '"registration_line2"'),
                        '{Residence_Addresses_City}', '"registration_city"'),
                    '{Residence_Addresses_State}', '"registration_state"'),
                '{Residence_Addresses_Zip}', '"registration_zip"'),
            '{Residence_Addresses_County}', '"registration_county"')
        WHERE is_system = true AND source_type = 'l2'
    """)

def downgrade() -> None:
    # Reverse all operations
    ...
```

### Downstream Code Changes (Blast Radius)

Files that reference old column names and must be updated:

**Backend (Python):**
| File | Change | Complexity |
|------|--------|-----------|
| `app/models/voter.py` | Rename 6 columns, add ~22 new columns, update `__table_args__` indexes | Medium |
| `app/models/voter_contact.py` | Add `__table_args__` with UniqueConstraint to VoterPhone | Low |
| `app/schemas/voter.py` | Rename 6 fields, add ~22 new fields across 3 schemas | Medium |
| `app/schemas/voter_filter.py` | Rename city/state/zip_code/county to registration_ prefix | Low |
| `app/services/voter.py` | Update build_voter_query to use `registration_city`, `registration_state`, `registration_zip`, `registration_county`; update `Voter.address_line1` references | Low |
| `app/services/import_service.py` | Update CANONICAL_FIELDS keys + _VOTER_COLUMNS set: `address_line1` -> `registration_line1`, `city` -> `registration_city`, etc. | Medium |
| `app/services/walk_list.py` | `v.address_line1` -> `v.registration_line1` | Low |
| `app/services/turf.py` | `voter.address_line1` -> `voter.registration_line1`, `voter.zip_code` -> `voter.registration_zip` | Low |

**Tests:**
| File | Change |
|------|--------|
| `tests/unit/test_voter_search.py` | Update filter field references (city/state/zip_code) |
| `tests/unit/test_field_mapping.py` | Update expected canonical field names |
| `tests/unit/test_import_service.py` | Update mapping values in test fixtures |

**Frontend (OUT OF SCOPE for Phase 23 per phase boundary):**
- `web/src/types/voter.ts` -- TypeScript types reference old field names
- Multiple components reference `address_line1`, `city`, `state`, `zip_code`
- These are Phase 26 (Frontend) concerns, but the API must handle backward compatibility OR the frontend must be updated in lockstep

**IMPORTANT**: The CONTEXT.md phase boundary says "No frontend changes." This means the frontend will break when the API schema changes field names. There are two approaches:
1. **Alias in Pydantic schemas** -- use `Field(alias="address_line1")` or `model_config = ConfigDict(populate_by_name=True)` to maintain backward compatibility
2. **Accept the break** -- frontend is Phase 26 anyway and will be rewritten

**Recommendation:** Do NOT add aliases. The frontend is Phase 26 work. The field rename is intentional and the frontend will adapt. During the gap between Phase 23 and Phase 26, the development environment will have mismatched fields, which is acceptable since this is a development milestone, not a production release.

### Anti-Patterns to Avoid
- **Creating separate migrations for renames vs adds:** This creates unnecessary complexity. One migration is cleaner and easier to reason about.
- **Using `op.drop_column` + `op.add_column` instead of `op.alter_column` for renames:** This loses existing data. Always use `alter_column` with `new_column_name`.
- **Adding NOT NULL constraints on new columns:** This will fail on tables with existing rows. All new columns MUST be nullable (success criteria #5).
- **Forgetting to update the L2 mapping template:** The seeded L2 template in `field_mapping_templates` maps L2 columns to the old names. Must update it in the migration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column renames | DROP + ADD | `op.alter_column(new_column_name=)` | Data loss risk; ALTER COLUMN RENAME is metadata-only in PostgreSQL |
| Unique constraint on VoterPhone | Application-level duplicate check | `UniqueConstraint` + `ON CONFLICT` | Race conditions; DB-level constraint is authoritative |
| Schema field validation | Manual validation | Pydantic `Field(ge=0, le=100)` for propensity scores | Automatic HTTP 422 responses |

## Common Pitfalls

### Pitfall 1: Index on Renamed Column
**What goes wrong:** After renaming `zip_code` to `registration_zip`, the existing index `ix_voters_campaign_zip` references the old column name internally but PostgreSQL auto-updates the column reference. However, the model's `__table_args__` still references `zip_code`.
**Why it happens:** SQLAlchemy model metadata and database metadata can diverge.
**How to avoid:** Drop the old index by name, create a new index with the correct name and column. Update `__table_args__` in the Voter model.
**Warning signs:** Alembic autogenerate shows spurious diffs after migration.

### Pitfall 2: Import Service CANONICAL_FIELDS Desync
**What goes wrong:** The `CANONICAL_FIELDS` dict and `_VOTER_COLUMNS` set in `import_service.py` still reference `address_line1`, `city`, `state`, `zip_code`, `county`. Imports silently fail to map these columns because the voter model no longer has those attributes.
**Why it happens:** The import service has its own hardcoded column registry separate from the model.
**How to avoid:** Update CANONICAL_FIELDS keys and _VOTER_COLUMNS in the same commit as the model change. The existing test `test_address_fields` will catch this if field names change.
**Warning signs:** Imported voter records have NULL address fields and address data in extra_data.

### Pitfall 3: VoterFilter Schema Desync
**What goes wrong:** `VoterFilter` schema has `city`, `state`, `zip_code`, `county` fields that map to `Voter.city`, `Voter.state`, etc. in `build_voter_query`. After rename, the query builder references non-existent model attributes.
**Why it happens:** Filter schema fields must match model column names when used in query builder.
**How to avoid:** Rename VoterFilter fields to `registration_city`, `registration_state`, `registration_zip`, `registration_county` and update `build_voter_query` accordingly.
**Warning signs:** AttributeError at runtime when filtering by city/state/zip.

### Pitfall 4: VoterPhone Unique Constraint with Existing Duplicates
**What goes wrong:** Adding a unique constraint fails if duplicate (campaign_id, voter_id, value) rows already exist.
**Why it happens:** Existing data may have been inserted before the constraint was added.
**How to avoid:** Add a deduplication step in the migration before creating the constraint, OR use `IF NOT EXISTS`-style handling. In this project, VoterPhone records are relatively new (Phase 4 phone banking) and unlikely to have duplicates. But the migration should handle it defensively.
**Warning signs:** Migration fails with `UniqueViolation` error.

### Pitfall 5: Alembic Revision Chain
**What goes wrong:** New migration revision doesn't connect properly to the existing chain.
**Why it happens:** Migration 005 has revision `005`. New migration must have `down_revision = "005"`.
**How to avoid:** Check the last migration's revision ID before creating the new one.
**Warning signs:** `alembic upgrade head` fails with "Can't locate revision" error.

## Code Examples

### Alembic Column Rename (verified pattern from PostgreSQL docs)
```python
# PostgreSQL ALTER TABLE ... RENAME COLUMN is metadata-only (instant, no table rewrite)
op.alter_column("voters", "address_line1", new_column_name="registration_line1")
```

### SmallInteger Column Definition (project pattern)
```python
from sqlalchemy import SmallInteger
# SmallInteger maps to PostgreSQL SMALLINT (2 bytes, range -32768 to 32767)
propensity_general: Mapped[int | None] = mapped_column(SmallInteger)
```

### UniqueConstraint on VoterPhone Model
```python
class VoterPhone(Base):
    __tablename__ = "voter_phones"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id", "voter_id", "value",
            name="uq_voter_phone_campaign_voter_value",
        ),
    )
```

### Pydantic Schema with New Fields
```python
class VoterResponse(BaseSchema):
    # Registration Address (renamed)
    registration_line1: str | None = None
    registration_line2: str | None = None
    registration_city: str | None = None
    registration_state: str | None = None
    registration_zip: str | None = None
    registration_zip4: str | None = None
    registration_county: str | None = None
    registration_apartment_type: str | None = None

    # Mailing Address (new)
    mailing_line1: str | None = None
    mailing_line2: str | None = None
    mailing_city: str | None = None
    mailing_state: str | None = None
    mailing_zip: str | None = None
    mailing_zip4: str | None = None
    mailing_country: str | None = None
    mailing_type: str | None = None

    # Propensity Scores (new)
    propensity_general: int | None = None
    propensity_primary: int | None = None
    propensity_combined: int | None = None

    # Demographics (new)
    spoken_language: str | None = None
    marital_status: str | None = None
    military_status: str | None = None
    party_change_indicator: str | None = None
    cell_phone_confidence: int | None = None

    # Household (new/expanded)
    household_party_registration: str | None = None
    household_size: int | None = None
    family_id: str | None = None
```

### Defensive Deduplication Before Unique Constraint
```python
# Remove duplicate VoterPhone rows before adding constraint
op.execute("""
    DELETE FROM voter_phones a USING voter_phones b
    WHERE a.id > b.id
      AND a.campaign_id = b.campaign_id
      AND a.voter_id = b.voter_id
      AND a.value = b.value
""")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Unnamed address columns (address_line1, city) | Prefixed columns (registration_line1, mailing_line1) | This phase | Explicit address type identity |
| Vendor data in extra_data JSONB | First-class typed columns | This phase | Queryable, indexable, type-safe |
| No phone dedup constraint | Unique constraint on (campaign_id, voter_id, value) | This phase | Import pipeline can use ON CONFLICT |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | pyproject.toml [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VMOD-01 | Propensity columns on Voter model | unit | `uv run pytest tests/unit/test_voter_model.py::test_propensity_columns -x` | No -- Wave 0 |
| VMOD-02 | Mailing address columns on Voter model | unit | `uv run pytest tests/unit/test_voter_model.py::test_mailing_address_columns -x` | No -- Wave 0 |
| VMOD-03 | spoken_language column exists | unit | `uv run pytest tests/unit/test_voter_model.py::test_spoken_language_column -x` | No -- Wave 0 |
| VMOD-04 | marital/military/party_change columns | unit | `uv run pytest tests/unit/test_voter_model.py::test_demographic_columns -x` | No -- Wave 0 |
| VMOD-05 | cell_phone_confidence column | unit | `uv run pytest tests/unit/test_voter_model.py::test_cell_phone_confidence_column -x` | No -- Wave 0 |
| VMOD-06 | household columns | unit | `uv run pytest tests/unit/test_voter_model.py::test_household_columns -x` | No -- Wave 0 |
| VMOD-07 | zip_plus4 and apartment_type | unit | `uv run pytest tests/unit/test_voter_model.py::test_zip4_apartment_type_columns -x` | No -- Wave 0 |
| VMOD-08 | Migration applies cleanly | integration | `uv run alembic upgrade head` (requires live DB) | manual-only |
| VMOD-09 | Schemas include all new fields | unit | `uv run pytest tests/unit/test_voter_schemas.py -x` | No -- Wave 0 |
| VMOD-10 | VoterPhone unique constraint | unit | `uv run pytest tests/unit/test_voter_model.py::test_voter_phone_unique_constraint -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_voter_model.py` -- covers VMOD-01 through VMOD-08, VMOD-10 (model column existence, types, constraints)
- [ ] `tests/unit/test_voter_schemas.py` -- covers VMOD-09 (schema field existence, serialization roundtrip)
- [ ] Update `tests/unit/test_voter_search.py` -- existing tests reference old field names (city, state, zip_code)
- [ ] Update `tests/unit/test_field_mapping.py` -- existing tests assert `address_line1` mapping
- [ ] Update `tests/unit/test_import_service.py` -- existing tests use old canonical field names

## Open Questions

1. **Should VoterFilter field names change in this phase or Phase 25?**
   - What we know: VoterFilter currently has `city`, `state`, `zip_code`, `county` fields that directly reference `Voter.city`, etc. After the rename, these must become `registration_city`, etc.
   - What's unclear: Phase 25 adds new filter dimensions. Should we rename existing filter fields now (Phase 23) since the model columns change, or defer to Phase 25?
   - Recommendation: Rename NOW in Phase 23 because `build_voter_query` will break at runtime if the filter field maps to a non-existent model attribute. This is a correctness issue, not a feature addition.

2. **Frontend breakage between Phase 23 and Phase 26**
   - What we know: The frontend directly uses `address_line1`, `city`, `state`, `zip_code` from the API response. After Phase 23, these fields no longer exist in the API schema.
   - What's unclear: Whether there's a gap between Phase 23 deployment and Phase 26 frontend update where the app is broken.
   - Recommendation: Since this is a development milestone (v1.3), accept the temporary breakage. No need for backward-compatible aliases. Document the field name changes for the Phase 26 implementer.

3. **registration_zip4 addition (Claude's Discretion)**
   - What we know: VMOD-07 specifies `zip_plus4` and `apartment_type`. Context says `registration_zip4` for the zip+4 portion, and existing `registration_zip` (renamed from `zip_code`) is String(10) which could hold "12345-6789".
   - Recommendation: YES, add `registration_zip4` as String(4) for symmetry with `mailing_zip4`. The existing `registration_zip` (String(10)) may contain the full "12345-6789" format from vendor data, but having a separate `zip4` field provides the clean 4-digit value when available.

## Sources

### Primary (HIGH confidence)
- Project source code: `app/models/voter.py`, `app/models/voter_contact.py`, `app/schemas/voter.py`, `app/services/voter.py`, `app/services/import_service.py` -- direct inspection of current implementation
- Existing Alembic migrations: `alembic/versions/002_voter_data_models.py`, `alembic/versions/003_canvassing_operations.py` -- established migration patterns
- Phase context: `.planning/phases/23-schema-foundation/23-CONTEXT.md` -- locked decisions and implementation details

### Secondary (MEDIUM confidence)
- PostgreSQL ALTER TABLE RENAME COLUMN behavior: metadata-only operation, no table rewrite -- well-documented PostgreSQL behavior
- SQLAlchemy SmallInteger mapping to PostgreSQL SMALLINT -- standard SQLAlchemy type mapping

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- patterns follow existing codebase conventions exactly
- Pitfalls: HIGH -- identified through direct code inspection and blast radius analysis
- Migration: HIGH -- `op.alter_column(new_column_name=)` is standard Alembic; column adds are trivial

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- no external dependencies changing)
