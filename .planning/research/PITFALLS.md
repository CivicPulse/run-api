# Domain Pitfalls: v1.3 Voter Model & Import Enhancement

**Domain:** Expanding an existing voter model with ~20 new columns, multi-table import pipeline, voting history parsing, propensity score normalization, and sensitive demographic data handling
**Researched:** 2026-03-13
**Confidence:** HIGH (analysis based on direct codebase inspection of all affected files)

---

## Critical Pitfalls

Mistakes that cause data corruption, require rewrites, or break existing functionality.

### Pitfall 1: Upsert SET Clause Derived from First Row Instead of Full Column Set

**What goes wrong:** The `process_csv_batch` method in `import_service.py` (lines 401-406) dynamically builds the `ON CONFLICT DO UPDATE SET` clause from `valid_voters[0].keys()` -- the keys present in the first valid voter dict of the batch. When adding ~20 new columns, the chance that different rows in a batch have different mapped column sets increases substantially. L2 files with propensity scores, mailing addresses, and demographic fields will have varying column completeness across rows. If row 0 lacks `propensity_score` but row 47 has it, the SET clause will not include `propensity_score` and row 47's score is silently dropped into `extra_data` instead of the typed column, or worse -- the INSERT succeeds with the value but the ON CONFLICT UPDATE path ignores it.

**Why it happens:** The current pattern was adequate when all mapped rows had roughly the same shape (the ~20 original fields are present in most voter files). With 40+ potential columns, column sparsity across rows within a single batch becomes the norm, not the exception.

**Consequences:** Partial data on reimport. A campaign imports an L2 file, gets all fields populated. Later they reimport an updated file where some rows have new propensity scores but the first row in a batch does not. The UPDATE clause silently skips the propensity column, and previously-set values are preserved (which is actually OK in that case) -- but the reverse is the real problem: if the first row HAS a column that subsequent rows do NOT have, the SET clause includes it, and rows without that column get `NULL` written over their existing values.

**Prevention:**
1. Build `update_cols` from `_VOTER_COLUMNS` (the full set of known model columns), not from `valid_voters[0].keys()`.
2. Ensure `apply_field_mapping` always produces dicts with a consistent key set -- include all `_VOTER_COLUMNS` keys with `None` for unmapped values, rather than omitting them.
3. Alternatively, exclude columns with `None` values per-row from the SET clause -- but this requires per-row upsert statements (incompatible with batch insert). The consistent-key-set approach is simpler and preserves batch performance.

**Detection:** Write a test importing a batch where row 0 has only core fields and row 1 has propensity scores. Verify row 1's scores land in the typed column, not `extra_data`.

**Phase:** Must be fixed in the model/migration phase, before any import pipeline changes. This is a prerequisite.

---

### Pitfall 2: Multi-Table Import Transaction -- Getting Voter IDs Back for VoterPhone Creation

**What goes wrong:** The current import pipeline fires `session.execute(stmt)` on the voter upsert without `RETURNING`. To auto-create VoterPhone records during import, you need the voter's UUID -- which you do not have for newly inserted rows. The voter_id is server-generated (`default=uuid.uuid4` / `gen_random_uuid()`). Without it, you cannot INSERT into `voter_phones`.

**Why it happens:** The batch `INSERT ... ON CONFLICT DO UPDATE` was designed as a fire-and-forget upsert. VoterPhone creation was not part of the original pipeline.

**Consequences:**
- Without RETURNING: Cannot create VoterPhone records for newly imported voters. Only re-imported (already existing) voters could get phones via a second query.
- Naive two-pass (upsert voters, then SELECT all by source_id, then insert phones): Doubles query count per batch, may hit timeouts on large files.
- If phone INSERT fails mid-batch without savepoints: Either the entire batch rolls back (losing voter upserts) or orphaned voters exist without their phone records.

**Prevention:**
1. Add `RETURNING id, source_id` to the voter upsert statement. PostgreSQL supports RETURNING on INSERT ... ON CONFLICT DO UPDATE. In SQLAlchemy: `stmt = stmt.returning(Voter.id, Voter.source_id)`.
2. Execute the upsert and collect the result: `result = await session.execute(stmt); rows = result.fetchall()`.
3. Build a `source_id -> voter_id` mapping from the returned rows.
4. Use that mapping to construct a batch VoterPhone INSERT for all phone numbers in the batch.
5. Wrap the voter upsert + phone insert in the same transaction (which the current session pattern already provides). Use a per-batch savepoint only if you want phone failures to be non-fatal.

**Detection:** Import a file with phone numbers where all voters are new (no existing records). Verify VoterPhone records are created with correct voter_id FK references.

**Phase:** Import pipeline enhancement phase. This is the hardest engineering change in the milestone.

---

### Pitfall 3: VoterPhone Duplicates on Reimport

**What goes wrong:** The `voter_phones` table has no unique constraint on `(voter_id, value)` or `(campaign_id, voter_id, value)`. When the same voter file is reimported (common for data refreshes), the voter upsert correctly updates existing rows via the `(campaign_id, source_type, source_id)` unique index. But VoterPhone INSERTs would create duplicate phone records every time -- the same number appearing 2, 3, N times per voter.

**Why it happens:** VoterPhone was designed for manual entry through the UI, where the user interface prevents duplicates naturally. Batch import bypasses this.

**Consequences:** Duplicate phone numbers per voter. Call list generation queries `voter_phones` and would create multiple call list entries for the same number. DNC filtering that expects one record per number misses duplicates.

**Prevention:**
1. Add a unique constraint on `voter_phones(campaign_id, voter_id, value)` in the migration.
2. Use `INSERT ... ON CONFLICT (campaign_id, voter_id, value) DO UPDATE SET type = EXCLUDED.type, source = EXCLUDED.source, updated_at = now()` for phone upserts during import.
3. This preserves idempotent reimport behavior -- same file imported twice produces the same result.

**Detection:** Import the same file twice. Verify `SELECT count(*) FROM voter_phones WHERE voter_id = X` returns the same count both times.

**Phase:** Same phase as VoterPhone auto-creation. The unique constraint must be in the migration.

---

### Pitfall 4: Voting History Normalization Breaks Existing Filters and Saved Lists

**What goes wrong:** The existing `voting_history` column is `ARRAY(String)` containing election identifiers. The frontend `VoterFilterBuilder` (line 38-39) generates year strings ("2026", "2025", ...) as filter values. The backend `build_voter_query` (lines 77-87) uses `Voter.voting_history.contains([election])` for array containment. If L2 voting history columns are parsed into entries like `"General_2024_11_05"` or `"Primary_2022_05_24"`, they will NOT match existing year-only filter values like `"2024"`. All existing dynamic voter lists with `voted_in` filters silently return wrong results.

**Why it happens:** L2 files encode voting history as separate columns: `General_2024`, `Primary_2022_06_28`, `Municipal_2023`. The column name IS the election identifier. There is no single standard format across states. Without an explicit normalization strategy, parsed values vary in format.

**Consequences:**
- Saved dynamic voter lists (stored as `filter_query` JSONB on `voter_lists` table) with `voted_in: ["2024"]` stop matching voters whose history now contains `"General_2024"` instead of `"2024"`.
- Frontend voting history checkboxes (year-based) no longer correspond to actual array values.
- Breaking change for existing campaigns that already have voting history data.

**Prevention:**
1. Define a canonical election identifier format now: `"{Type}_{Year}"` (e.g., `"General_2024"`, `"Primary_2022"`).
2. Parse L2 column names: `"General_2024_11_05"` -> extract type (`General`) and year (`2024`) -> store `"General_2024"`.
3. Update the backend `build_voter_query` to support BOTH formats: year-only (`"2024"`) should match any election in that year. Use a LIKE or regex check: `voting_history @> ARRAY['General_2024']` for exact match, or use `ANY(voting_history) LIKE '%_2024'` for year-based filter.
4. Update the frontend filter to show election type + year rather than just year. Fetch available election identifiers from the backend (aggregated from actual data) instead of hardcoding year ranges.
5. Provide backward compatibility: if a saved filter has `voted_in: ["2024"]`, interpret it as "any election in 2024."

**Detection:** Import an L2 file with voting history columns. Apply an existing year-based filter. Verify results include voters with the new format.

**Phase:** Voting history parsing must be its own focused sub-phase with explicit format specification agreed upon BEFORE implementation.

---

### Pitfall 5: Alembic Migration -- Non-Nullable Column on Table with Existing Data

**What goes wrong:** Adding a column with `nullable=False` and no `server_default` to the `voters` table will fail immediately if the table has existing rows, because PostgreSQL cannot satisfy the NOT NULL constraint for existing rows.

**Why it happens:** Copy-paste from a model definition that uses `Mapped[str]` (non-nullable in SQLAlchemy 2.0) instead of `Mapped[str | None]` (nullable). Or a Pydantic schema field that says `str` getting unconsciously mirrored in the model.

**Consequences:** Migration fails on any database with existing voter records. In production, this means a failed deployment. If Alembic is not configured with transactional DDL, the migration can be half-applied.

**Prevention:**
1. ALL new columns MUST be `nullable=True`. The existing pattern uses `Mapped[str | None]` consistently -- follow it.
2. No `server_default` is needed for nullable columns (but will not cause harm if present).
3. Test the migration against the Macon-Bibb demo dataset before merging.
4. Write a single migration file for all new columns, not separate migrations per column.

**Detection:** Run `alembic upgrade head` against a seeded database. If it succeeds, the constraint is satisfied.

**Phase:** First phase (model + migration). Must be verified before any subsequent work.

---

## Moderate Pitfalls

### Pitfall 6: Propensity Score Parsing -- "77%" vs "Not Eligible" vs Empty String

**What goes wrong:** L2 propensity scores are string values: `"77%"`, `"45%"`, `"Not Eligible"`, `"N/A"`, `""`, `"0%"`. Storing as `String` makes numeric filtering impossible (cannot query "propensity > 60"). Storing as `Integer` loses the "Not Eligible" semantic. Naive `int("77%".rstrip("%"))` crashes on `"Not Eligible"`.

**Why it happens:** Vendor data mixes numeric values with categorical status strings in the same column. No parsing is applied -- the raw value goes straight to the database.

**Prevention:**
1. Store as `Integer` (0-100 range), nullable. `NULL` means unknown or not eligible.
2. Create a dedicated `parse_propensity(raw: str) -> int | None` function:
   - Strip whitespace, strip `%` suffix.
   - Try `int()` conversion. If it succeeds and is 0-100, return the value.
   - If conversion fails or value is out of range, return `None`.
   - Log non-numeric values (like "Not Eligible") to the import error/warning report for transparency.
3. Test the parser with a matrix: `"77%"` -> 77, `"0%"` -> 0, `"100"` -> 100, `""` -> None, `"Not Eligible"` -> None, `"N/A"` -> None, `"  45 %  "` -> 45.

**Phase:** Model phase (column type decision) and import parsing phase (parser function).

---

### Pitfall 7: Mailing Address -- Inline Columns vs. VoterAddress Table

**What goes wrong:** The Voter model already has inline residential address fields (`address_line1` through `zip_code`). The `VoterAddress` table also exists for multi-address support. Adding mailing address creates a design fork: (a) add `mail_address_line1`, `mail_city`, `mail_state`, `mail_zip_code` as inline columns on Voter (6 new columns), or (b) insert a row into `voter_addresses` with `type='mailing'`. If the wrong choice is made, either the import pipeline becomes significantly more complex (option b -- now touching THREE tables per batch) or the data model becomes denormalized in a way that requires maintaining two address patterns (option a).

**Why it happens:** The original design put the primary residential address inline on the Voter model for query convenience, then also created the VoterAddress table for extensibility. This dual pattern was not harmful before, but mailing address forces a choice.

**Prevention:** Use inline columns on the Voter model because:
- The import pipeline already handles flat column -> Voter model mapping. No new table writes needed.
- Filtering on mailing state/zip is a simple WHERE clause, not a JOIN.
- Campaigns need at most 2 addresses (residential + mailing). The VoterAddress table can remain for any future address types.
- Prefix all mailing columns: `mail_address_line1`, `mail_address_line2`, `mail_city`, `mail_state`, `mail_zip_code`.

**Phase:** Model definition phase. This is a design decision that must be made before writing the migration.

---

### Pitfall 8: CANONICAL_FIELDS and _VOTER_COLUMNS Drift from Voter Model

**What goes wrong:** The import service maintains two hardcoded data structures: `CANONICAL_FIELDS` (50+ aliases mapping to canonical column names) and `_VOTER_COLUMNS` (set of 23 valid Voter model column names). Adding ~20 new columns means updating BOTH. Forgetting to add a column to `_VOTER_COLUMNS` means mapped values silently go to `extra_data` instead of the typed column. Forgetting to add aliases to `CANONICAL_FIELDS` means CSV columns with standard names (like `"MilitaryStatus"`) do not auto-map.

**Why it happens:** Two manually-maintained lists that must stay synchronized with the model. No automated validation.

**Prevention:**
1. Derive `_VOTER_COLUMNS` from the Voter model at import time rather than hardcoding:
   ```python
   _EXCLUDED = {"id", "campaign_id", "created_at", "updated_at", "geom"}
   _VOTER_COLUMNS = {c.key for c in Voter.__table__.columns} - _EXCLUDED
   ```
2. Add a test that asserts every key in `CANONICAL_FIELDS` is also in `_VOTER_COLUMNS`: `assert set(CANONICAL_FIELDS.keys()).issubset(_VOTER_COLUMNS | {"source_id"})`.
3. Add L2-specific aliases for every new field. L2 column names are documented and predictable.

**Phase:** Import enhancement phase. But the derive-from-model change should happen first in the model phase since it eliminates the manual sync requirement entirely.

---

### Pitfall 9: Ethnicity -- "Likely" Prefix Makes Filtering Miss Records

**What goes wrong:** L2 ethnicity values include a qualifier prefix: `"Likely African-American"`, `"Likely Hispanic and Portuguese"`, `"East and South Asian"`, `"European"`. If stored as-is in the existing `ethnicity` column (`String(100)`), a filter for `ethnicity = "African-American"` returns zero results because no record has exactly that value -- they all have `"Likely African-American"`.

**Why it happens:** The frontend or API filter sends a normalized category name, but the stored value includes the vendor's qualifier prefix. No normalization layer exists.

**Prevention:**
1. Store the raw vendor value in the existing `ethnicity` column for display purposes.
2. Optionally add an `ethnicity_category` column with normalized categories: strip `"Likely "` prefix, map compound values to primary category.
3. Or: Normalize on storage -- strip the `"Likely "` prefix before saving. Since the `"Likely"` qualifier applies to nearly all L2 ethnicity values, it adds no information value for campaign operations.
4. Use `ILIKE` or case-insensitive matching in the filter builder rather than exact match.

**Phase:** Model phase (decide on normalization strategy) and import parsing phase (apply normalization).

---

### Pitfall 10: New Filterable Columns Without Indexes

**What goes wrong:** Adding 20 columns is a metadata-only operation in PostgreSQL (fast). But when the VoterFilterBuilder adds filter dimensions for ethnicity, language, propensity score ranges, etc., queries against a 500K-row voter table without indexes on these columns degrade to sequential scans. The query planner cannot use the existing indexes (which cover campaign_id + party, precinct, zip_code, last_name) for new filter dimensions.

**Why it happens:** The column addition migration is focused on schema changes, not performance. Index planning is deferred and forgotten.

**Prevention:**
1. Add composite indexes ONLY for columns that will appear in `build_voter_query` filter conditions:
   - `(campaign_id, ethnicity_category)` -- if ethnicity filtering is implemented.
   - `(campaign_id, language)` -- if language filtering is implemented.
2. Do NOT add indexes for every new column. Columns that are display-only (like `mail_city`) do not need indexes.
3. For propensity scores (numeric range queries on `Integer` columns), a standard B-tree index on `(campaign_id, propensity_score)` is sufficient. BRIN indexes only help if data is physically ordered, which voter data is not.

**Phase:** Migration phase. Add indexes in the same migration as columns.

---

### Pitfall 11: L2 System Mapping Template Not Updated

**What goes wrong:** The L2 field mapping template was seeded in migration `002b` via an INSERT with a JSONB mapping of 22 L2 column names to voter model fields. Adding ~20 new columns means the L2 mapping needs ~20 new entries (e.g., `"MilitaryStatus" -> "military_status"`, `"CommercialData_EstimatedHHIncome" -> "estimated_hh_income"`, `"Mail_Addresses_City" -> "mail_city"`). If the template is not updated, L2 imports will map the old 22 fields but put all new fields into `extra_data`.

**Why it happens:** The system template is baked into a migration. There is no mechanism to update it outside of writing a new migration.

**Prevention:**
1. Write an UPDATE statement in the new migration that replaces the L2 template's `mapping` JSONB with the expanded mapping.
2. Use `UPDATE field_mapping_templates SET mapping = :new_mapping WHERE is_system = true AND source_type = 'l2'`.
3. Include ALL new L2 column name -> model field mappings.

**Phase:** Migration phase, same migration file that adds new columns.

---

### Pitfall 12: `extra_data` Contains Data That Should Now Be in First-Class Columns

**What goes wrong:** Previously imported voter files put propensity scores, detailed ethnicity, language, military status, etc. into the `extra_data` JSONB blob because no typed columns existed. After adding first-class columns, these old records have data in `extra_data` but NULL in the new columns. Queries filtering on the new columns miss all previously imported voters. The campaign has 200K voters imported last week -- all with empty propensity scores in the new column, but valid scores in `extra_data.propensity_score`.

**Why it happens:** Schema migration adds columns. Data migration (copying from JSONB to typed columns) is a separate step that is easy to forget or defer.

**Prevention:**
1. Write a data migration step (in the same or a follow-up migration) that copies known keys from `extra_data` into the new typed columns:
   ```sql
   UPDATE voters SET propensity_score = (extra_data->>'propensity_score')::integer
   WHERE extra_data ? 'propensity_score' AND propensity_score IS NULL;
   ```
2. Apply the same propensity/ethnicity parsing logic to the data migration that the import pipeline uses -- do not just copy raw strings if the new column expects parsed values.
3. Optionally remove migrated keys from `extra_data` to avoid confusion: `UPDATE voters SET extra_data = extra_data - 'propensity_score'`.
4. This only matters for campaigns that have already imported L2 files with these fields. If no campaigns have imported yet, skip the data migration.

**Phase:** Post-schema-migration step. Can be a management command or a separate Alembic migration.

---

## Minor Pitfalls

### Pitfall 13: Pydantic Schema Explosion -- Three Schemas with Identical Field Lists

**What goes wrong:** `VoterResponse`, `VoterCreateRequest`, and `VoterUpdateRequest` all need ~20 new fields. All three currently list every voter field independently. Adding 20 fields to 3 schemas is 60 lines of boilerplate that can drift out of sync.

**Prevention:**
1. Create a `VoterFields` mixin/base with all the optional voter fields.
2. Have each schema inherit from it: `class VoterResponse(VoterFields, BaseSchema)`, etc.
3. Or: Write a test that asserts all three schemas have the same voter-related field names (excluding id, campaign_id, timestamps).

**Phase:** Schema update phase, alongside model changes.

---

### Pitfall 14: Frontend Type + Filter Interface Mismatch

**What goes wrong:** The TypeScript `Voter` interface in `web/src/types/voter.ts` must gain all ~20 new fields. The `VoterFilter` interface must gain new filter dimensions. The `VoterFilterBuilder` component must render new filter controls. If any of these three are out of sync, either data is fetched but not displayed, or filters are shown but do not work.

**Prevention:**
1. Add all new fields to the `Voter` interface as `type | null`.
2. Add filter dimensions to `VoterFilter` only for fields that have backend query support in `build_voter_query`.
3. Do not add a filter UI control without first implementing the backend filter condition.
4. Use TypeScript strict mode to catch missing fields at compile time.

**Phase:** UI update phase (final phase). Must exactly match backend schema and filter support.

---

### Pitfall 15: Import Performance Regression from Multi-Table Writes

**What goes wrong:** Current import: 1 batch INSERT per 1000 rows (voters only). After changes: 1 batch INSERT for voters + RETURNING, then 1 batch INSERT for phones per batch. This doubles the SQL statements per batch. For a 200K-row file with 200 batches, that is 200 extra INSERT statements. The progress UI (which updates after each batch flush) may appear to stall.

**Prevention:**
1. Batch phone inserts the same way voters are batched -- collect all phones for the batch and do a single bulk INSERT.
2. If performance degrades noticeably, reduce batch size from 1000 to 500 rows.
3. Benchmark import time before and after the change with the Macon-Bibb demo dataset.

**Phase:** Import pipeline phase. Benchmark after implementation.

---

### Pitfall 16: Phone Number Format Inconsistency Breaks DNC Filtering

**What goes wrong:** L2 phone numbers come in varying formats: `"(478) 555-1234"`, `"4785551234"`, `"+14785551234"`, `"478-555-1234"`. The VoterPhone `value` column stores whatever is provided. The DNC list stores normalized numbers. The call list generation joins VoterPhone to DNC entries. If imported phone numbers are not normalized, DNC lookups produce false negatives (phone is on DNC list but does not match because of formatting).

**Why it happens:** The existing frontend DNC search strips non-digits client-side (noted in PROJECT.md as a key decision). But the import pipeline has no phone normalization. These two paths produce different formats for the same number.

**Prevention:**
1. Create a `normalize_phone(raw: str) -> str | None` utility:
   - Strip all non-digit characters.
   - If 11 digits starting with `1`, strip leading `1`.
   - If 10 digits, return as-is.
   - Otherwise return `None` (invalid).
2. Apply normalization during import before inserting into VoterPhone.
3. Verify DNC import also applies the same normalization.
4. Validate that `call_list.py`'s phone query matches normalized values.

**Phase:** Import pipeline phase, VoterPhone auto-creation sub-task.

---

### Pitfall 17: VoterFilterBuilder UI Becomes Overwhelming

**What goes wrong:** The current filter builder has 13 filter dimensions (party, age, voting history, tags, city, zip, state, gender, precinct, congressional district, phone, registered after/before, logic). Adding ethnicity, language, propensity score ranges, military status, and mailing address filters would push it to 18+ dimensions. The component already uses a "More filters" toggle -- adding more to the expanded section makes it a wall of inputs.

**Prevention:**
1. Group filters into collapsible sections: Demographics (age, gender, ethnicity, language), Geography (city, state, zip, precinct, district), Political (party, registration, voting history), Scores (propensity), Contact (phone), Tags.
2. Keep the 4 most-used filters always visible (party, age, city, voting history).
3. Use an "Add filter" pattern: new dimensions default to hidden and users activate them explicitly.
4. Extract `FilterSection` sub-components to keep the main component manageable.

**Phase:** UI update phase (final phase of milestone).

---

### Pitfall 18: Household ID Already Exists -- Adding household_size Without Confusion

**What goes wrong:** `household_id` already exists on the Voter model. If adding `household_size`, campaigns may expect it to be computed from the count of voters sharing the same `household_id` in their campaign. But L2 provides `household_size` as a pre-computed value from their full national file. If a campaign imports only a subset of voters, the computed count and the vendor value disagree.

**Prevention:**
1. Store L2's household_size as-is. Do not auto-compute.
2. Name the column clearly: `household_size` (vendor-provided). Document that it reflects the vendor's data, not the campaign's imported subset.
3. If campaigns also want the imported household count, that is a derived metric (computed at query time via `COUNT(*) OVER (PARTITION BY household_id)`) -- do not store it.

**Phase:** Model definition phase.

---

## Integration Pitfalls (Cross-Cutting Concerns)

### Call List Generation After Model Changes

The `CallListService.generate_call_list` method queries VoterPhone records to build call entries. If VoterPhone auto-creation during import works correctly, call lists will automatically include more voters (previously, voters without manually-added phones were excluded from phone banking). This is the desired outcome -- but verify that:
1. DNC filtering works against normalized phone numbers (Pitfall 16).
2. Duplicate phone records do not create duplicate call list entries (Pitfall 3).
3. The call list entry count increases as expected after importing a file with phone data.

### Walk List and Turf Operations

Walk lists use `Voter.geom` for PostGIS spatial queries (`ST_Contains`). New columns (mailing address, propensity scores, demographics) do not affect spatial operations. The residential address and lat/long remain the source of truth for canvassing. No action needed -- but do NOT import mailing address coordinates into the `latitude`/`longitude` columns.

### Dynamic Voter Lists with Saved Filters

The `filter_query` JSONB on `voter_lists` stores serialized `VoterFilter` objects. Adding new filter dimensions is additive -- old saved filters continue to work because they simply do not include the new keys. However:
1. Do NOT rename any existing filter keys (`party`, `age_min`, `voted_in`, etc.).
2. Do NOT change the semantics of existing keys (e.g., do not change `voted_in` from exact-match to partial-match without handling backward compat).
3. New filter keys should be optional and default to `None` (no filtering) when absent from saved filters.

### Voter Detail View

The frontend voter detail page displays all voter fields. Adding ~20 new fields to a flat display creates an overwhelming detail page. Group fields into sections (Personal, Residential Address, Mailing Address, Political, Demographics, Scores, Voting History) with collapsible panels.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Model + Migration | Pitfall 5 (non-nullable column), Pitfall 7 (mailing address design) | All columns nullable; decide inline vs VoterAddress BEFORE writing migration |
| Migration (indexes + L2 template) | Pitfall 10 (missing indexes), Pitfall 11 (stale L2 template) | Add indexes for filterable fields only; update L2 template in same migration |
| Data backfill | Pitfall 12 (extra_data to columns) | Separate data migration from schema migration; apply same parsing logic |
| Import pipeline -- voter upsert | Pitfall 1 (SET clause drift) | Derive update_cols from full column set, not first row |
| Import pipeline -- VoterPhone | Pitfall 2 (missing voter IDs), Pitfall 3 (phone dedup), Pitfall 16 (phone normalization) | Add RETURNING; add unique constraint; normalize phone numbers |
| Voting history parsing | Pitfall 4 (format breaks existing filters) | Define canonical format first; support backward-compat year-only lookups |
| Propensity/demographic parsing | Pitfall 6 (percent parsing), Pitfall 9 (ethnicity prefix) | Dedicated parser functions with exhaustive test matrices |
| Schema/API update | Pitfall 8 (CANONICAL_FIELDS sync), Pitfall 13 (schema explosion) | Derive _VOTER_COLUMNS from model; use schema mixin |
| Frontend update | Pitfall 14 (type mismatch), Pitfall 17 (filter UX) | Exact type parity; grouped filter sections |
| Performance | Pitfall 10 (missing indexes), Pitfall 15 (import slowdown) | Benchmark with realistic data after implementation |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SET clause drift (Pitfall 1) | LOW | Fix update_cols derivation; reimport affected files |
| Missing voter IDs for phones (Pitfall 2) | MEDIUM | Add RETURNING; backfill phones for voters imported without them |
| Duplicate phones (Pitfall 3) | LOW | Add unique constraint; deduplicate with `DELETE FROM voter_phones WHERE id NOT IN (SELECT MIN(id) ...)` |
| Broken voting history filters (Pitfall 4) | HIGH | Must migrate all voting_history arrays to new format; update all saved filter_query JSONB; hardest to fix retroactively |
| Non-nullable migration failure (Pitfall 5) | LOW | Fix column definition; re-run migration |
| Stale extra_data (Pitfall 12) | MEDIUM | Run data migration script to copy JSONB keys to typed columns |
| Unnormalized phone numbers (Pitfall 16) | MEDIUM | Run UPDATE to normalize existing VoterPhone values; verify DNC matches |

---

## Sources

- Direct codebase inspection: `app/models/voter.py` (Voter model, 96 lines), `app/services/import_service.py` (import pipeline, 554 lines), `app/services/voter.py` (query builder, 385 lines), `app/schemas/voter_filter.py` (filter schema, 35 lines) -- HIGH confidence
- Direct codebase inspection: `alembic/versions/002_voter_data_models.py` (RLS policies, L2 template seeding) -- HIGH confidence
- Direct codebase inspection: `app/models/voter_contact.py` (VoterPhone schema, no unique constraint on value) -- HIGH confidence
- Direct codebase inspection: `web/src/components/voters/VoterFilterBuilder.tsx` (349 lines, year-based voting history filter) -- HIGH confidence
- Direct codebase inspection: `app/services/call_list.py` (VoterPhone query pattern for call list generation) -- HIGH confidence
- PostgreSQL documentation: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` is supported -- HIGH confidence
- PostgreSQL documentation: `ADD COLUMN` with `NULL` default is metadata-only (no table rewrite) -- HIGH confidence
- SQLAlchemy 2.0: `Mapped[T | None]` infers `nullable=True` automatically -- HIGH confidence

---
*Pitfalls research for: v1.3 Voter Model & Import Enhancement*
*Researched: 2026-03-13*
