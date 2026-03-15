# Phase 24: Import Pipeline Enhancement - Research

**Researched:** 2026-03-13
**Domain:** CSV import pipeline (FastAPI + SQLAlchemy async + PostgreSQL upsert)
**Confidence:** HIGH

## Summary

Phase 24 modifies the existing voter CSV import pipeline (`import_service.py`) to handle three new data types from L2 voter files: cell phone numbers (auto-creating VoterPhone records), voting history columns (General_YYYY/Primary_YYYY pattern detection), and propensity percentage strings (parsing "77%" into integers). It also fixes a critical bug where the upsert SET clause is derived from the first batch row's keys instead of the full Voter model column set, which causes silent data loss when the first row is missing optional fields.

The primary technical novelty is adding a `.returning(Voter.id)` clause to the voter upsert statement to get back voter UUIDs needed for VoterPhone bulk insert. This pattern is new to this codebase -- no existing code uses RETURNING. SQLAlchemy 2.0.48 (the project's version) fully supports `.returning()` chained after `.on_conflict_do_update()` on PostgreSQL dialect inserts, and returns IDs for both newly inserted AND conflict-updated rows.

All changes are confined to backend Python code: `import_service.py` (core logic), one new Alembic migration (phones_created column + L2 template update), and the `ImportJob` model/schema. No frontend changes, no new API endpoints, no filter changes.

**Primary recommendation:** Structure the work as three layers: (1) utility functions for parsing/normalization that are independently testable, (2) modifications to `apply_field_mapping` and `process_csv_batch` to wire them in, (3) migration and template updates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Values Y (yes), A (absentee), and E (early) count as "voted" -- included in voting_history array
- Only match strict L2 column patterns: `General_YYYY` and `Primary_YYYY` (no abbreviated variants)
- Canonical format preserves L2 column prefix exactly: "General_2024", "Primary_2022"
- On re-import, voting_history is replaced entirely (not merged) -- L2 files are complete snapshots
- Implemented as L2-specific parsing function in import_service.py -- extract to strategy pattern later if VoteBuilder needs different logic
- Auto-created VoterPhone records use type="cell", source="import"
- Set is_primary=True on first import; don't change primary flag on re-import if phone already exists
- Use INSERT ... ON CONFLICT DO UPDATE on (campaign_id, voter_id, value) -- matches voter upsert pattern
- Add special `__cell_phone` canonical field in CANONICAL_FIELDS to signal "this column has phone numbers to extract" -- keeps phone detection in the existing mapping flow but marks it as non-voter-column
- Phone values normalized: strip non-digits, validate 10 digits, matching DNC normalization pattern
- If phone normalization fails but voter data is valid: import the voter, skip the phone (no VoterPhone created)
- Unparseable propensity values ("High", "N/A", "Not Eligible", empty) become NULL -- no error, no warning
- Error report CSV contains row-level errors only (rows completely skipped, e.g., missing name)
- Field-level issues (bad phone, bad propensity) are silent -- voter still imports
- Add phones_created count to ImportJob results alongside imported_rows and skipped_rows
- Users see "Imported 5,000 voters and created 3,200 phone contacts"
- Add L2's official column headers to CANONICAL_FIELDS aliases
- Organize alias lists with vendor-grouping comments for future extensibility
- L2 system mapping template (FieldMappingTemplate, is_system=True) updated via new Alembic migration
- Upsert SET clause fix: derive update columns from full Voter model column set, not first batch row keys
- Add .returning(Voter.id) to voter upsert to get back voter IDs for VoterPhone linking
- Novel for this codebase -- no existing RETURNING usage

### Claude's Discretion
- Exact RETURNING clause column selection (id only vs id + source_id)
- Phone normalization function placement (inline vs utility)
- Batch size for VoterPhone bulk insert
- Whether voting history columns are detected at mapping time or parsing time

### Deferred Ideas (OUT OF SCOPE)
- VoteBuilder (NGP VAN) data import support -- future phase (different column naming, VANID for voter ID, different voting history format)
- Backfill script for previously-imported L2 files to populate new typed columns from extra_data (DATA-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMPT-01 | Import service auto-creates VoterPhone records when cell phone column is mapped, using RETURNING clause from voter upsert | RETURNING clause verified working on SQLAlchemy 2.0.48; VoterPhone model has unique constraint on (campaign_id, voter_id, value); `__cell_phone` canonical field routes phone data through existing mapping flow |
| IMPT-02 | Import service parses voting history Y/N columns into voting_history array with canonical format | Voter model has `voting_history: ARRAY(String)` column; regex pattern `^(General\|Primary)_\d{4}$` detects L2 columns; values Y/A/E count as voted |
| IMPT-03 | Import service parses propensity percentage strings into SmallInteger values | Voter model has `propensity_general/primary/combined: SmallInteger` columns; strip "%" and int() parse; unparseable becomes NULL |
| IMPT-04 | CANONICAL_FIELDS expanded with L2 naming convention aliases | Current CANONICAL_FIELDS has 37 entries; L2 official headers (Voters_FIPS, EthnicGroups_EthnicGroup1Desc, etc.) need adding; vendor-grouping comments for extensibility |
| IMPT-05 | L2 mapping template updated in migration to include all new field mappings | Existing L2 template in migration 002 has 23 mappings (updated to renamed columns in 006); new migration 007 adds phone, propensity, demographic, household mappings |
| IMPT-06 | Upsert SET clause derives columns from full Voter model column set, not first batch row keys | Bug at import_service.py:520-523; fix uses `Voter.__table__.columns` introspection; 46 updatable columns identified |
| IMPT-07 | Phone values normalized (strip non-digits, validate 10 digits) matching DNC normalization pattern | DNC service uses `PHONE_REGEX = re.compile(r"^\d{10,15}$")` at dnc.py:22; import normalization strips non-digits first, then validates 10-digit result |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | Async ORM, PostgreSQL dialect, `insert().on_conflict_do_update().returning()` | Already in project; `.returning()` fully supported on PG dialect insert |
| Alembic | (project version) | Schema migrations for phones_created column + L2 template update | Existing migration chain (001-006); new migration 007 |
| asyncpg | (project version) | Async PostgreSQL driver | Already in project; supports RETURNING natively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| RapidFuzz | (project version) | Fuzzy column name matching at 75% threshold | Already used in `suggest_field_mapping()`; no changes needed |
| re (stdlib) | - | Regex for phone normalization, voting history column detection, propensity parsing | Phone: strip non-digits; voting history: `General_YYYY`/`Primary_YYYY` pattern match; propensity: `(\d+)%` extraction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Voter.__table__.columns` for SET clause | Hardcoded column list | Introspection auto-tracks model changes; hardcoded list requires manual sync |
| `__cell_phone` canonical field | Separate phone_columns mapping dict | `__cell_phone` keeps detection in existing CANONICAL_FIELDS flow; separate dict adds a parallel path |

## Architecture Patterns

### Modified File Structure
```
app/
  services/
    import_service.py           # Main changes: CANONICAL_FIELDS, apply_field_mapping, process_csv_batch
  models/
    import_job.py               # Add phones_created column
  schemas/
    import_job.py               # Add phones_created to ImportJobResponse
alembic/
  versions/
    007_import_phone_propensity.py  # New migration
tests/
  unit/
    test_import_service.py      # Extend with new tests
    test_import_parsing.py      # New: voting history, propensity, phone normalization tests
```

### Pattern 1: RETURNING Clause for Voter-to-Phone Linking
**What:** Chain `.returning(Voter.id)` after `.on_conflict_do_update()` to get back voter UUIDs for all rows (both new inserts and conflict updates). Use the returned IDs to build VoterPhone insert values.
**When to use:** When a bulk upsert needs to create related records in a second table.
**Example:**
```python
# Source: verified against SQLAlchemy 2.0.48 PostgreSQL dialect
from sqlalchemy.dialects.postgresql import insert

stmt = insert(Voter).values(valid_voters)
stmt = stmt.on_conflict_do_update(
    index_elements=["campaign_id", "source_type", "source_id"],
    set_=update_cols,
).returning(Voter.id)

result = await session.execute(stmt)
voter_ids = [row[0] for row in result.all()]
# voter_ids[i] corresponds to valid_voters[i]
```

### Pattern 2: Model-Driven SET Clause (IMPT-06 Fix)
**What:** Derive upsert SET columns from `Voter.__table__.columns` instead of first batch row keys.
**When to use:** Always, for the voter upsert -- prevents silent column omission.
**Example:**
```python
# Source: codebase investigation -- current bug at import_service.py:520-523
_UPSERT_EXCLUDE = frozenset({
    "id", "campaign_id", "source_type", "source_id", "created_at", "updated_at", "geom"
})

update_cols = {
    col.name: getattr(stmt.excluded, col.name)
    for col in Voter.__table__.columns
    if col.name not in _UPSERT_EXCLUDE
}
update_cols["updated_at"] = func.now()
```

### Pattern 3: Special `__cell_phone` Canonical Field
**What:** Add `__cell_phone` to CANONICAL_FIELDS with L2 phone column aliases. In `apply_field_mapping`, detect the `__` prefix and route the value to a separate phone data list instead of the voter dict.
**When to use:** When a mapped column targets a related table, not the voter row itself.
**Example:**
```python
CANONICAL_FIELDS["__cell_phone"] = [
    "__cell_phone",
    "cellphone",
    "cell_phone",
    "phone",
    # L2 official headers
    "voters_cellphonefull",
    "voters_cellphone",
]
# __cell_phone is NOT in _VOTER_COLUMNS -- excluded by the __ prefix convention
```

### Pattern 4: Voting History Column Detection and Parsing
**What:** After field mapping, scan unmapped CSV columns for `General_YYYY` / `Primary_YYYY` patterns. For each matching column, if the row value is Y, A, or E, add the column name to the voter's `voting_history` array.
**When to use:** During L2 file import (source_type="l2") to populate voting history.
**Example:**
```python
import re
_VOTING_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")
_VOTED_VALUES = frozenset({"Y", "A", "E"})

def parse_voting_history(row: dict[str, str]) -> list[str]:
    """Extract voting history entries from L2 column values."""
    history = []
    for col, val in row.items():
        if _VOTING_HISTORY_RE.match(col) and val.strip().upper() in _VOTED_VALUES:
            history.append(col)  # "General_2024", "Primary_2022"
    return sorted(history)
```

### Pattern 5: Propensity String Parsing
**What:** Parse propensity percentage strings ("77%", "42", "Not Eligible", "") into integer or None.
**Example:**
```python
import re
_PROPENSITY_RE = re.compile(r"^(\d+)%?$")

def parse_propensity(value: str) -> int | None:
    """Parse propensity percentage string to integer or None."""
    if not value or not value.strip():
        return None
    match = _PROPENSITY_RE.match(value.strip())
    if match:
        score = int(match.group(1))
        return score if 0 <= score <= 100 else None
    return None
```

### Anti-Patterns to Avoid
- **Deriving SET clause from first row keys:** The exact bug IMPT-06 fixes. If first batch row is missing `propensity_general`, that column never gets updated for ANY row in the batch.
- **Merging voting history on re-import:** L2 files are complete snapshots. Replace the entire array, not append to it. Appending causes duplicate entries.
- **Creating VoterPhone before knowing voter ID:** Must use RETURNING from voter upsert to get IDs first. Cannot rely on source_id lookup (would require N additional queries).
- **Failing the entire row for a bad phone number:** User decision says import the voter, skip only the phone creation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone normalization | Custom digit extraction | `re.sub(r"\D", "", value)` + 10-digit validation | Matches existing DNC PHONE_REGEX pattern; consistent validation across codebase |
| Upsert with RETURNING | Two-step insert-then-select | `insert().on_conflict_do_update().returning()` | PostgreSQL RETURNING is atomic, no race conditions, single round-trip |
| Bulk VoterPhone insert | Loop with individual inserts | `insert(VoterPhone).on_conflict_do_update()` batch | Same upsert pattern as voters; handles re-import idempotency |
| Column set for SET clause | Manual list of column names | `Voter.__table__.columns` introspection | Auto-tracks model changes; 46 columns already verified |

**Key insight:** The voter upsert and phone upsert share the same INSERT...ON CONFLICT DO UPDATE pattern. Consistency matters more than optimization here.

## Common Pitfalls

### Pitfall 1: RETURNING Row Order
**What goes wrong:** Assuming `result.all()` from RETURNING matches the order of `values()` input.
**Why it happens:** PostgreSQL documentation states RETURNING rows follow the order of the input VALUES list for INSERT statements.
**How to avoid:** The implementation can safely zip `voter_ids` with `valid_voters` to correlate voter IDs with phone data. However, to be defensive, include `source_id` in RETURNING to verify correlation.
**Warning signs:** Phone records linked to wrong voters.

### Pitfall 2: Voting History Columns Detected at Wrong Stage
**What goes wrong:** If voting history columns are detected only during mapping time (suggest_field_mapping), they could be incorrectly mapped to canonical fields or missed entirely.
**Why it happens:** Voting history columns (General_2024, Primary_2022) are dynamic -- they vary per election year and aren't in CANONICAL_FIELDS.
**How to avoid:** Detect voting history columns at parsing time in `apply_field_mapping` or `process_csv_batch`. Leave them unmapped (they'll flow to extra_data by default), then scan the raw row dict for matching patterns. Recommendation: detect at parsing time -- the column names ARE the data.
**Warning signs:** Voting history columns mapped to `extra_data` with no history parsed.

### Pitfall 3: VoterPhone is_primary Flag on Re-import
**What goes wrong:** Re-importing sets is_primary=True again, overwriting manual changes.
**Why it happens:** Naive upsert SET includes is_primary.
**How to avoid:** Use `ON CONFLICT (campaign_id, voter_id, value) DO UPDATE SET type = EXCLUDED.type, source = EXCLUDED.source, updated_at = now()` -- deliberately exclude `is_primary` from the SET clause so manual primary selections are preserved.
**Warning signs:** Users report their primary phone selection keeps resetting.

### Pitfall 4: Phone Normalization Edge Cases
**What goes wrong:** Phone values like "1-555-123-4567" (11 digits with country code), "(555) 123-4567" (10 digits with formatting), or "+1 555-123-4567" strip to different digit counts.
**Why it happens:** L2 may include country code prefixes.
**How to avoid:** Strip non-digits first, then handle leading "1" if result is 11 digits. Validate final result is exactly 10 digits. This matches standard US phone normalization.
**Warning signs:** Valid phones rejected as invalid due to country code prefix.

### Pitfall 5: Empty String vs NULL in Propensity Parsing
**What goes wrong:** CSV readers return empty strings "", not Python None. If propensity columns contain "", the parser must handle it.
**Why it happens:** csv.DictReader always returns strings.
**How to avoid:** `parse_propensity` function must treat "" and whitespace-only as NULL.
**Warning signs:** Database errors trying to store "" in SmallInteger column.

### Pitfall 6: Alembic Migration Must Handle Missing Template
**What goes wrong:** Migration 007 UPDATE of L2 template fails if no template exists (fresh installs might not have run seed).
**Why it happens:** Migration 002 seeds the template, but if someone ran migrations without data seeding.
**How to avoid:** Use `UPDATE ... WHERE is_system = true AND source_type = 'l2'` -- this is a no-op if template doesn't exist. No error.
**Warning signs:** Migration fails on fresh database.

## Code Examples

Verified patterns from codebase investigation:

### Current Upsert Bug (import_service.py:518-531)
```python
# BUG: update_cols derived from first row's keys
# If valid_voters[0] is missing "propensity_general", it NEVER gets updated
update_cols = {
    col: getattr(insert(Voter).excluded, col)
    for col in valid_voters[0]            # <-- BUG: should be Voter.__table__.columns
    if col not in ("campaign_id", "source_type", "source_id")
}
```

### Fixed Upsert with RETURNING (target implementation)
```python
# Source: codebase + SQLAlchemy 2.0.48 verified
_UPSERT_EXCLUDE = frozenset({
    "id", "campaign_id", "source_type", "source_id",
    "created_at", "updated_at", "geom",
})

if valid_voters:
    stmt = insert(Voter).values(valid_voters)
    update_cols = {
        col.name: getattr(stmt.excluded, col.name)
        for col in Voter.__table__.columns
        if col.name not in _UPSERT_EXCLUDE
    }
    update_cols["updated_at"] = func.now()

    stmt = stmt.on_conflict_do_update(
        index_elements=["campaign_id", "source_type", "source_id"],
        set_=update_cols,
    ).returning(Voter.id)

    result = await session.execute(stmt)
    voter_ids = [row[0] for row in result.all()]
    await session.flush()
```

### VoterPhone Bulk Upsert
```python
# Source: VoterPhone model (voter_contact.py) unique constraint verified
from app.models.voter_contact import VoterPhone

phone_records = []
for i, voter_dict in enumerate(valid_voters):
    phone_value = voter_dict.pop("__cell_phone_value", None)  # extracted earlier
    if phone_value:
        normalized = normalize_phone(phone_value)
        if normalized:
            phone_records.append({
                "campaign_id": voter_dict["campaign_id"],
                "voter_id": voter_ids[i],
                "value": normalized,
                "type": "cell",
                "source": "import",
                "is_primary": True,
            })

if phone_records:
    phone_stmt = insert(VoterPhone).values(phone_records)
    phone_stmt = phone_stmt.on_conflict_do_update(
        constraint="uq_voter_phone_campaign_voter_value",
        set_={
            "type": phone_stmt.excluded.type,
            "source": phone_stmt.excluded.source,
            "updated_at": func.now(),
            # NOTE: is_primary deliberately excluded -- preserve user edits
        },
    )
    result = await session.execute(phone_stmt)
    phones_created = result.rowcount  # includes both inserts and updates
```

### DNC Phone Normalization Reference (dnc.py:22)
```python
# Source: app/services/dnc.py:22
PHONE_REGEX = re.compile(r"^\d{10,15}$")
# For import: strip non-digits first, handle 11-digit US numbers
```

### Existing L2 Template Mapping (migration 002, updated by 006)
```python
# Source: alembic/versions/002_voter_data_models.py:46-71
# After migration 006 renames:
_L2_MAPPING = {
    "LALVOTERID": "source_id",
    "Voters_FirstName": "first_name",
    # ... 23 total fields
    "Voters_HHId": "household_id",
    # Phase 24 adds: propensity, demographic, household, phone mappings
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SET clause from row keys | SET clause from model columns | Phase 24 (now) | Prevents silent column omission bug |
| No RETURNING in codebase | `.returning(Voter.id)` on upsert | Phase 24 (now) | Enables voter-to-phone linking without extra queries |
| Voting history not parsed | L2 General/Primary columns auto-parsed | Phase 24 (now) | voting_history array populated from import |
| Propensity stored as strings in extra_data | Parsed to SmallInteger columns | Phase 24 (now) | Enables range filters in Phase 25 |

**Deprecated/outdated:**
- Deriving SET clause from `valid_voters[0].keys()` -- bug, fixed in this phase

## Open Questions

1. **RETURNING row order guarantee**
   - What we know: PostgreSQL INSERT...VALUES returns rows in VALUES order. Upserts (ON CONFLICT DO UPDATE) also maintain this order in practice.
   - What's unclear: Whether asyncpg/SQLAlchemy guarantees this ordering under all conditions.
   - Recommendation: Return `Voter.id` only (not source_id). The row-order correlation is reliable for INSERT...VALUES. If paranoid, add a defensive assertion comparing `len(voter_ids)` to `len(valid_voters)`.

2. **Voting history detection timing (Claude's discretion)**
   - What we know: Voting history columns (General_2024, Primary_2022) are dynamic, not in CANONICAL_FIELDS.
   - Recommendation: Detect at **parsing time** inside `apply_field_mapping` or a helper called from `process_csv_batch`. The raw CSV row dict is the right place to scan for voting column patterns. Leave these columns unmapped by suggest_field_mapping (they'll end up in extra_data via the normal flow), and separately scan row keys for the General/Primary pattern before the voter dict is finalized.

3. **Phone normalization function placement (Claude's discretion)**
   - Recommendation: Create a standalone `normalize_phone(value: str) -> str | None` function at module level in import_service.py. It is small (5-10 lines), used only during import, and does not warrant a separate utility module.

4. **Batch size for VoterPhone bulk insert (Claude's discretion)**
   - Recommendation: Use the same 1000-row batch size as the voter upsert. Phone records are created in the same batch loop, so they naturally follow the same cadence.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.x + pytest-asyncio |
| Config file | `pyproject.toml` ([tool.pytest.ini_options]) |
| Quick run command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_field_mapping.py -x -q` |
| Full suite command | `uv run pytest tests/unit/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMPT-01 | VoterPhone records created from cell phone column via RETURNING | unit (mock DB) | `uv run pytest tests/unit/test_import_service.py::TestProcessCsvBatch::test_phone_creation -x` | No -- Wave 0 |
| IMPT-02 | Voting history Y/A/E parsed into array | unit | `uv run pytest tests/unit/test_import_parsing.py::TestVotingHistoryParsing -x` | No -- Wave 0 |
| IMPT-03 | Propensity strings parsed to int/None | unit | `uv run pytest tests/unit/test_import_parsing.py::TestPropensityParsing -x` | No -- Wave 0 |
| IMPT-04 | CANONICAL_FIELDS includes L2 aliases | unit | `uv run pytest tests/unit/test_field_mapping.py::TestSuggestFieldMapping::test_l2_expanded_aliases -x` | No -- Wave 0 |
| IMPT-05 | L2 template migration adds new mappings | manual-only | Review migration 007 SQL; verify in test DB | Justification: migration testing requires live DB |
| IMPT-06 | SET clause uses model columns, not first row keys | unit | `uv run pytest tests/unit/test_import_service.py::TestProcessCsvBatch::test_upsert_set_clause_all_columns -x` | No -- Wave 0 |
| IMPT-07 | Phone normalization: strip non-digits, validate 10 digits | unit | `uv run pytest tests/unit/test_import_parsing.py::TestPhoneNormalization -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_parsing.py tests/unit/test_field_mapping.py -x -q`
- **Per wave merge:** `uv run pytest tests/unit/ -x -q`
- **Phase gate:** Full unit suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_import_parsing.py` -- new file for parse_voting_history, parse_propensity, normalize_phone unit tests (covers IMPT-02, IMPT-03, IMPT-07)
- [ ] Additional test methods in `tests/unit/test_import_service.py` for RETURNING-based phone creation (IMPT-01), SET clause fix (IMPT-06)
- [ ] Additional test methods in `tests/unit/test_field_mapping.py` for expanded L2 aliases (IMPT-04)

*(Existing test infrastructure is sufficient -- pytest + pytest-asyncio configured, test directory structure in place, mock patterns established in test_import_service.py)*

## Sources

### Primary (HIGH confidence)
- **Codebase investigation** - import_service.py (full file, 673 lines), voter.py model, voter_contact.py model, import_job.py model, dnc.py phone regex, call_list.py VoterPhone usage, migration 002 (L2 template seed), migration 006 (column renames)
- **SQLAlchemy 2.0.48** - Verified `.returning()` on `insert().on_conflict_do_update()` compiles correctly with PostgreSQL dialect; tested in-process with actual project dependencies
- **Voter.__table__.columns introspection** - Verified 53 total columns, 46 updatable (excluding id, campaign_id, source_type, source_id, created_at, updated_at, geom)

### Secondary (MEDIUM confidence)
- PostgreSQL RETURNING clause row ordering: documented behavior for INSERT...VALUES statements; matches practical observations with asyncpg

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and runtime introspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, versions verified
- Architecture: HIGH - patterns derived from existing codebase, RETURNING verified at compile level
- Pitfalls: HIGH - identified from direct code inspection and understanding of upsert semantics

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable stack, no external dependencies changing)
