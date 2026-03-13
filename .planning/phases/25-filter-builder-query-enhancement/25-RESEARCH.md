# Phase 25: Filter Builder & Query Enhancement - Research

**Researched:** 2026-03-13
**Domain:** SQLAlchemy query builder extension, PostgreSQL ARRAY/ILIKE operations, Pydantic schema expansion
**Confidence:** HIGH

## Summary

Phase 25 extends the existing `VoterFilter` schema and `build_voter_query()` function with 12 new filter fields across three dimensions: propensity score ranges, multi-select demographics, and mailing address exact matches. It also adds backward compatibility logic for voting history year-only values.

The existing codebase already has established patterns for every operation needed. Propensity range filters follow the `age_min`/`age_max` pattern exactly. Multi-select demographics follow the `parties` list-to-`.in_()` pattern. Mailing address filters mirror the existing `registration_city`/`registration_state`/`registration_zip` exact-match pattern. Voting history backward compatibility requires adding an expansion helper that converts year-only values to canonical `{Type}_{Year}` format using the ARRAY `.overlap()` operator, which is already used in the volunteer skills filter.

No new dependencies, no migrations, no model changes, and no frontend changes are needed. This is purely backend schema + query builder work with comprehensive unit tests.

**Primary recommendation:** Extend VoterFilter and build_voter_query following existing patterns precisely; use `func.lower()` with `.in_()` for case-insensitive multi-value matching and `col.ilike(value)` for single-value address matching.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Year-only values (e.g., "2024") are expanded to OR match: `voting_history.overlap(["General_2024", "Primary_2024"])`
- Already-canonical values (e.g., "General_2024") use exact array containment as before
- Detection: regex `^\d{4}$` distinguishes year-only from canonical format
- `not_voted_in` expansion: "2024" means voter did NOT vote in General_2024 AND did NOT vote in Primary_2024 (skipped the entire election cycle)
- Expansion covers General and Primary only -- no Runoff/Special (L2 data doesn't have these)
- Frontend keeps sending year-only values; backend handles expansion transparently
- No migration of existing saved `filter_query` JSONB values needed
- Three independent propensity dimensions: propensity_general_min/max, propensity_primary_min/max, propensity_combined_min/max
- Either min, max, or both can be set per dimension (same flexibility as age_min/age_max)
- NULL propensity scores are excluded from range-filtered results (standard SQL NULL behavior -- no COALESCE)
- Pydantic validation: Field(ge=0, le=100) on all propensity filter fields
- Filter field names are plural lists: `ethnicities`, `spoken_languages`, `military_statuses`
- List-only -- no singular shorthand (avoid party/parties dual-field pattern proliferation)
- OR semantics within field: ethnicities=["Hispanic", "Asian"] returns voters matching ANY value
- Case-insensitive matching using ILIKE (L2 data may have inconsistent casing across vendors)
- New fields: mailing_city, mailing_state, mailing_zip as exact-match filters
- Independent from registration address filters -- no combined "any address" option
- Case-insensitive matching using ILIKE for all address filters (both mailing and registration)
- Existing registration address filters (registration_city, registration_state, registration_zip) updated to case-insensitive ILIKE for consistency
- Zip code filters remain exact match (no prefix matching)

### Claude's Discretion
- ILIKE implementation detail: whether to use `func.lower()` with `.in_()` or `or_(*[col.ilike(v) for v in values])` for multi-select
- Index considerations for case-insensitive queries (functional indexes if needed)
- Test structure and coverage approach
- Whether registration_county also gets ILIKE treatment for consistency

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILT-01 | VoterFilter supports propensity_general_min/max, propensity_primary_min/max, propensity_combined_min/max range filters | Follows existing `age_min`/`age_max` pattern in VoterFilter + build_voter_query (lines 70-74). Add 6 new Optional[int] fields with `Field(ge=0, le=100)` validation. |
| FILT-02 | VoterFilter supports ethnicity, spoken_language, military_status as multi-select list filters | Follows existing `parties` list pattern (line 44). Use `func.lower(col).in_([v.lower() for v in values])` for case-insensitive OR matching. |
| FILT-03 | VoterFilter supports mailing_city, mailing_state, mailing_zip as exact-match filters | Mirrors existing `registration_city`/`registration_state`/`registration_zip` pattern (lines 49-56). Add ILIKE for case-insensitive matching. |
| FILT-04 | build_voter_query handles all new filter dimensions following existing pattern | Each non-None filter appends a condition to the conditions list. 12 new condition blocks follow the same if-not-None-append pattern. |
| FILT-05 | Voting history filter maintains backward compatibility (year-only values still match "{Type}_{Year}" entries) | Use regex `^\d{4}$` to detect year-only, expand to `.overlap()` for voted_in and negated `.contains()` for not_voted_in. ARRAY `.overlap()` already used in volunteer service (line 302). |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | ORM, query builder | Already drives all voter queries |
| Pydantic | 2.12.5+ | Schema validation | VoterFilter schema definition |
| PostgreSQL (via asyncpg) | -- | ARRAY operators, ILIKE | Backend database |
| pytest | 9.0.2+ | Unit tests | Existing test infrastructure |
| pytest-asyncio | 1.3.0+ | Async test support | Existing test infrastructure |

### Supporting
No new dependencies required. All operations use SQLAlchemy core operators already available.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `func.lower(col).in_(lowered_list)` | `or_(*[col.ilike(v) for v in values])` | ILIKE generates N OR clauses; `func.lower().in_()` generates single `IN` with functional call -- cleaner SQL, works with functional indexes |
| Regex year detection | Hardcoded year list | Regex is more maintainable as election years change |

## Architecture Patterns

### Recommended Project Structure
No new files needed. Changes are in existing files:
```
app/
  schemas/
    voter_filter.py     # Add 12 new fields to VoterFilter
  services/
    voter.py            # Extend build_voter_query() with new condition blocks
tests/
  unit/
    test_voter_search.py  # Add tests for all new filter dimensions
```

### Pattern 1: Range Filter (Propensity)
**What:** Min/max range filters on SmallInteger columns, identical to age_min/age_max
**When to use:** Any numeric range filter
**Example:**
```python
# Source: app/services/voter.py lines 70-74 (existing age pattern)
if filters.propensity_general_min is not None:
    conditions.append(Voter.propensity_general >= filters.propensity_general_min)

if filters.propensity_general_max is not None:
    conditions.append(Voter.propensity_general <= filters.propensity_general_max)
```
NULL propensity values are automatically excluded by SQL comparison semantics (NULL >= X is NULL, which is falsy in WHERE).

### Pattern 2: Multi-Select List Filter (Demographics)
**What:** List of values with OR semantics on a single column, case-insensitive
**When to use:** Multi-value selection on string columns
**Recommendation:** Use `func.lower(col).in_([v.lower() for v in values])` rather than multiple ILIKE conditions.
**Rationale:**
- Generates `WHERE lower(ethnicity) IN ('hispanic', 'asian')` -- single clean SQL expression
- Compatible with functional indexes (`CREATE INDEX ... ON voters (lower(ethnicity))`)
- More efficient than `WHERE ethnicity ILIKE 'Hispanic' OR ethnicity ILIKE 'Asian'` for N>2 values
- Matches the shape of the existing `.in_()` pattern used by `parties` filter

```python
# Recommended pattern for multi-select demographics
if filters.ethnicities is not None:
    conditions.append(
        func.lower(Voter.ethnicity).in_([v.lower() for v in filters.ethnicities])
    )
```

### Pattern 3: Case-Insensitive Single-Value Filter (Addresses)
**What:** Single string exact match, case-insensitive
**When to use:** City, state, county filters where user provides one value
**Example:**
```python
# Update existing registration address filters + add mailing
if filters.registration_city is not None:
    conditions.append(
        func.lower(Voter.registration_city) == filters.registration_city.lower()
    )

if filters.mailing_city is not None:
    conditions.append(
        func.lower(Voter.mailing_city) == filters.mailing_city.lower()
    )
```
**Why func.lower() over .ilike():** For exact match (no wildcards), `func.lower() ==` is semantically clearer than `col.ilike(value)` and avoids any wildcard escaping concerns. Both approaches are functionally equivalent for exact match.

### Pattern 4: Voting History Year Expansion
**What:** Detect year-only values and expand to canonical format using ARRAY overlap
**When to use:** voted_in / not_voted_in filter processing
**Example:**
```python
import re

_YEAR_ONLY_RE = re.compile(r"^\d{4}$")

# In build_voter_query:
if filters.voted_in is not None:
    for election in filters.voted_in:
        if _YEAR_ONLY_RE.match(election):
            # Year-only: voter participated in ANY election that year
            expanded = [f"General_{election}", f"Primary_{election}"]
            conditions.append(Voter.voting_history.overlap(expanded))
        else:
            # Canonical format: exact containment (existing behavior)
            conditions.append(Voter.voting_history.contains([election]))

if filters.not_voted_in is not None:
    for election in filters.not_voted_in:
        if _YEAR_ONLY_RE.match(election):
            # Year-only: voter did NOT vote in ANY election that year
            # Must not contain General AND must not contain Primary
            conditions.append(~Voter.voting_history.contains([f"General_{election}"]))
            conditions.append(~Voter.voting_history.contains([f"Primary_{election}"]))
        else:
            conditions.append(~Voter.voting_history.contains([election]))
```

Key insight for `not_voted_in` with year expansion: "didn't vote in 2024" means "didn't vote in General_2024 AND didn't vote in Primary_2024" -- two separate NOT CONTAINS conditions (De Morgan's law). This is different from `voted_in` which uses overlap (OR semantics).

### Anti-Patterns to Avoid
- **Adding singular shorthand fields (e.g., `ethnicity` as filter alongside `ethnicities`):** The user explicitly decided list-only to avoid the party/parties proliferation pattern.
- **Using COALESCE on propensity NULLs:** User decided NULL scores are excluded from range results. Standard SQL NULL comparison behavior handles this correctly without any extra code.
- **Wildcard ILIKE for address exact match:** `col.ilike(f"%{value}%")` for addresses would be wrong -- these are exact-match filters, not substring searches. Use `func.lower(col) == value.lower()`.
- **Expanding year-only to Runoff/Special:** L2 data only has General and Primary elections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive IN | Custom SQL string building | `func.lower(col).in_(lowered_list)` | SQLAlchemy handles parameter binding and escaping |
| Array overlap test | Raw SQL `&&` operator | `col.overlap(values)` | SQLAlchemy ARRAY type method, already used in project |
| Pydantic range validation | Manual if/raise checks | `Field(ge=0, le=100)` | Pydantic handles validation + OpenAPI schema generation |
| Year-only detection | Parsing with split/try-int | `re.compile(r"^\d{4}$")` | Clear intent, fast, handles edge cases |

## Common Pitfalls

### Pitfall 1: ILIKE with Wildcards on Exact Match Fields
**What goes wrong:** Using `col.ilike(f"%{value}%")` instead of `func.lower(col) == value.lower()` would turn exact-match filters into substring searches -- "Austin" would match "East Austin" or "Austintown".
**Why it happens:** Developers conflate "case-insensitive" with "ILIKE pattern matching."
**How to avoid:** Use `func.lower()` equality for exact match; reserve `.ilike()` only for the `search` free-text field.
**Warning signs:** Test expectations using `==` but implementation using substring match.

### Pitfall 2: voted_in Year Expansion Uses Wrong Operator
**What goes wrong:** Using `.contains()` instead of `.overlap()` for year-only voted_in expansion. `contains(["General_2024", "Primary_2024"])` means voter voted in BOTH elections. `.overlap()` means voter voted in EITHER.
**Why it happens:** The existing voted_in handler uses `.contains()` for single values, so the natural reflex is to reuse it.
**How to avoid:** Year-only `voted_in` -> `.overlap()` (OR); year-only `not_voted_in` -> two separate `~.contains()` conditions (AND NOT).
**Warning signs:** Year-only voted_in filter returns fewer voters than expected.

### Pitfall 3: not_voted_in Year Expansion Logic Inversion
**What goes wrong:** Using `~.overlap()` for not_voted_in year expansion. `~overlap(["General_2024", "Primary_2024"])` means "doesn't overlap with EITHER" which is correct for "skipped entire cycle." BUT if `.overlap()` returns NULL for NULL voting_history, the NOT of NULL is still NULL (falsy), which excludes voters with NULL voting_history.
**Why it happens:** De Morgan's law confusion with SQL NULL semantics.
**How to avoid:** Use two separate `~.contains()` conditions. This matches the existing not_voted_in pattern and handles NULLs consistently (voters with NULL voting_history are already excluded by the existing pattern).
**Warning signs:** Voters with NULL voting_history unexpectedly included/excluded.

### Pitfall 4: Forgetting to Update Existing Registration Address Filters
**What goes wrong:** Adding ILIKE to new mailing filters but leaving existing registration filters case-sensitive.
**Why it happens:** Focus on "new fields" rather than "consistency across all address filters."
**How to avoid:** The user decision explicitly requires updating registration_city, registration_state, registration_zip to case-insensitive too. Treat this as one change set.
**Warning signs:** "ATLANTA" matches mailing_city but not registration_city.

### Pitfall 5: Pydantic Extra Fields Silently Ignored
**What goes wrong:** The GET `/voters` endpoint passes `city=`, `state=`, `county=` to VoterFilter, but VoterFilter uses `registration_city`, etc. Pydantic silently drops unknown fields.
**Why it happens:** Phase 23 renamed columns but GET endpoint query param names were not updated (deferred to Phase 26 per STATE.md).
**How to avoid:** This is a known pre-existing issue outside Phase 25 scope. Do NOT fix it here -- it's deferred to Phase 26 (frontend updates). The POST `/voters/search` endpoint works correctly with the full VoterFilter JSON body.
**Warning signs:** GET endpoint city/state/county filters appear broken.

## Code Examples

### Complete VoterFilter Schema Update
```python
# Source: app/schemas/voter_filter.py (existing structure)
from pydantic import BaseModel, Field

class VoterFilter(BaseModel):
    # ... existing 19 fields ...

    # Propensity score ranges (FILT-01)
    propensity_general_min: int | None = Field(default=None, ge=0, le=100)
    propensity_general_max: int | None = Field(default=None, ge=0, le=100)
    propensity_primary_min: int | None = Field(default=None, ge=0, le=100)
    propensity_primary_max: int | None = Field(default=None, ge=0, le=100)
    propensity_combined_min: int | None = Field(default=None, ge=0, le=100)
    propensity_combined_max: int | None = Field(default=None, ge=0, le=100)

    # Multi-select demographics (FILT-02)
    ethnicities: list[str] | None = None
    spoken_languages: list[str] | None = None
    military_statuses: list[str] | None = None

    # Mailing address exact match (FILT-03)
    mailing_city: str | None = None
    mailing_state: str | None = None
    mailing_zip: str | None = None
```

### Complete build_voter_query Extension
```python
# Source: app/services/voter.py (extend existing function)
import re
_YEAR_ONLY_RE = re.compile(r"^\d{4}$")

# Inside build_voter_query(), after existing conditions:

# --- Propensity ranges (FILT-01) ---
if filters.propensity_general_min is not None:
    conditions.append(Voter.propensity_general >= filters.propensity_general_min)
if filters.propensity_general_max is not None:
    conditions.append(Voter.propensity_general <= filters.propensity_general_max)
# ... repeat for propensity_primary and propensity_combined ...

# --- Multi-select demographics (FILT-02) ---
if filters.ethnicities is not None:
    conditions.append(
        func.lower(Voter.ethnicity).in_([v.lower() for v in filters.ethnicities])
    )
if filters.spoken_languages is not None:
    conditions.append(
        func.lower(Voter.spoken_language).in_([v.lower() for v in filters.spoken_languages])
    )
if filters.military_statuses is not None:
    conditions.append(
        func.lower(Voter.military_status).in_([v.lower() for v in filters.military_statuses])
    )

# --- Mailing address (FILT-03) ---
if filters.mailing_city is not None:
    conditions.append(func.lower(Voter.mailing_city) == filters.mailing_city.lower())
if filters.mailing_state is not None:
    conditions.append(func.lower(Voter.mailing_state) == filters.mailing_state.lower())
if filters.mailing_zip is not None:
    conditions.append(Voter.mailing_zip == filters.mailing_zip)  # zip is numeric, no case issue

# --- Update existing registration address filters to case-insensitive ---
# registration_city, registration_state, registration_zip
# Change from: Voter.registration_city == filters.registration_city
# Change to:   func.lower(Voter.registration_city) == filters.registration_city.lower()

# --- Voting history backward compat (FILT-05) ---
# Replace existing voted_in/not_voted_in blocks with year-aware expansion
```

### Compile-to-SQL Test Pattern
```python
# Source: tests/unit/test_voter_search.py (existing pattern)
def test_propensity_general_range(self):
    """build_voter_query with propensity range produces >= and <= conditions."""
    from app.services.voter import build_voter_query
    q = build_voter_query(VoterFilter(propensity_general_min=60, propensity_general_max=90))
    sql = self._compiled_sql(q)
    assert "propensity_general" in sql.lower()

def test_ethnicities_multi_select(self):
    """build_voter_query with ethnicities list produces case-insensitive IN clause."""
    from app.services.voter import build_voter_query
    q = build_voter_query(VoterFilter(ethnicities=["Hispanic", "Asian"]))
    sql = self._compiled_sql(q)
    assert "lower" in sql.lower()
    assert "ethnicity" in sql.lower()
    assert "in" in sql.lower()

def test_voted_in_year_only_expansion(self):
    """build_voter_query with year-only voted_in uses overlap for expansion."""
    from app.services.voter import build_voter_query
    q = build_voter_query(VoterFilter(voted_in=["2024"]))
    sql = self._compiled_sql(q)
    assert "general_2024" in sql.lower()
    assert "primary_2024" in sql.lower()

def test_voted_in_canonical_unchanged(self):
    """build_voter_query with canonical voted_in value uses contains as before."""
    from app.services.voter import build_voter_query
    q = build_voter_query(VoterFilter(voted_in=["General_2024"]))
    sql = self._compiled_sql(q)
    assert "general_2024" in sql.lower()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Voter.registration_city == value` | `func.lower(Voter.registration_city) == value.lower()` | Phase 25 | Case-insensitive address matching |
| `voting_history.contains([year])` | Year detection + `.overlap()` for year-only | Phase 25 | Backward compat with canonical format |
| Single-value party filter | Multi-select list demographics | Phase 25 | OR semantics within demographic fields |

**Note on indexes:** The existing B-tree indexes on `mailing_city`, `mailing_state`, `mailing_zip` (created in migration 006) work for exact-match equality but NOT for `func.lower()` queries. PostgreSQL requires functional indexes like `CREATE INDEX ... ON voters ((lower(mailing_city)))` to use indexes with `lower()` calls. However, since all queries are already scoped by `campaign_id` (via RLS), the campaign_id portion of the composite index still provides filtering. Functional indexes are an optimization that can be added later if query performance becomes an issue -- not needed for correctness.

**Recommendation on registration_county:** YES, update `registration_county` to case-insensitive too. It's a free-text string field with the same casing inconsistency risk as city/state. Since the user listed this as Claude's discretion, and the rationale for ILIKE on registration addresses applies equally, make it consistent.

## Open Questions

1. **GET endpoint param mismatch**
   - What we know: The GET `/campaigns/{id}/voters` endpoint passes `city`, `state`, `county` to VoterFilter but VoterFilter expects `registration_city`, etc. These params are silently ignored.
   - What's unclear: Whether this should be fixed in Phase 25 or deferred.
   - Recommendation: Leave as-is per STATE.md ("frontend field renames deferred to Phase 26"). The POST search endpoint works correctly. Document as known issue.

2. **Functional indexes for lower() queries**
   - What we know: Current composite indexes (campaign_id, mailing_city) use raw column values, not `lower()`.
   - What's unclear: Whether query performance will be acceptable without functional indexes.
   - Recommendation: Skip functional indexes for now. RLS campaign_id scoping limits the result set, and voter counts per campaign are typically < 500K. Add functional indexes only if query latency becomes measurable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2+ with pytest-asyncio 1.3.0+ |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/test_voter_search.py -x -q` |
| Full suite command | `uv run pytest tests/unit/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-01 | Propensity range filters produce >= / <= SQL conditions | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_propensity_general_range -x` | Exists (extend) |
| FILT-01 | Propensity Pydantic validation rejects out-of-range values | unit | `uv run pytest tests/unit/test_voter_search.py::TestVoterFilterSchema -x` | New class |
| FILT-02 | Multi-select demographics produce case-insensitive IN clause | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_ethnicities_multi_select -x` | Exists (extend) |
| FILT-03 | Mailing address filters produce case-insensitive equality | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_mailing_city_filter -x` | Exists (extend) |
| FILT-04 | All new filters integrated into build_voter_query | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery -x` | Exists (extend) |
| FILT-05 | Year-only voted_in expanded to overlap | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_voted_in_year_only_expansion -x` | Exists (extend) |
| FILT-05 | Year-only not_voted_in expanded to two NOT contains | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_not_voted_in_year_expansion -x` | Exists (extend) |
| FILT-05 | Canonical voted_in values unchanged | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_voted_in_canonical_unchanged -x` | Exists (extend) |
| FILT-03 | Existing registration address filters updated to case-insensitive | unit | `uv run pytest tests/unit/test_voter_search.py::TestBuildVoterQuery::test_registration_city_case_insensitive -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_voter_search.py -x -q`
- **Per wave merge:** `uv run pytest tests/unit/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. `tests/unit/test_voter_search.py` already has `TestBuildVoterQuery` class with the `_compiled_sql` helper and the compile-to-SQL pattern. New tests are added as methods to this existing class.

## Sources

### Primary (HIGH confidence)
- `app/schemas/voter_filter.py` - Current VoterFilter schema (19 fields, read directly)
- `app/services/voter.py` - Current build_voter_query implementation (lines 24-143, read directly)
- `app/models/voter.py` - Voter model with all columns including propensity, demographics, mailing address (read directly)
- `tests/unit/test_voter_search.py` - Existing compile-to-SQL test pattern (read directly)
- `app/services/volunteer.py:302` - Existing `.overlap()` usage on ARRAY column (read directly)
- `app/services/voter_list.py:267-268` - Dynamic list filter_query deserialization to VoterFilter (read directly)
- `alembic/versions/006_expand_voter_model.py` - Migration confirming indexes exist on mailing columns (read directly)
- SQLAlchemy 2.0.48 installed (verified via `uv pip show`)

### Secondary (MEDIUM confidence)
- [SQLAlchemy ARRAY overlap documentation](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html) - ARRAY `.overlap()` produces PostgreSQL `&&` operator
- [SQLAlchemy Operator Reference](https://docs.sqlalchemy.org/en/20/core/operators.html) - `.ilike()` uses ILIKE on PostgreSQL, `lower()` on generic backends
- [PostgreSQL ILIKE vs LOWER performance](https://www.visuality.pl/posts/ilike-vs-like-lower-postgres-stories) - `func.lower().in_()` generally more efficient than multiple ILIKE for multi-value matching

### Tertiary (LOW confidence)
None -- all findings verified against project source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; all operations use existing SQLAlchemy operators verified in codebase
- Architecture: HIGH - Every pattern mirrors an existing implementation in build_voter_query or volunteer service
- Pitfalls: HIGH - Identified from direct code analysis and user decisions
- Voting history compat: HIGH - `.overlap()` already used in project; year regex matches canonical format from Phase 24

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain; no fast-moving dependencies)
