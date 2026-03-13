# Project Research Summary

**Project:** CivicPulse Run v1.3 — Voter Model & Import Enhancement
**Domain:** Political campaign voter data management — schema expansion, import pipeline, search/filter
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

v1.3 is a schema-and-pipeline expansion milestone, not a greenfield build. The research confirms that all four change vectors — voter model columns, import pipeline logic, filter query builder, and frontend display — can be implemented entirely within the existing validated stack with zero new dependencies. The work is additive: roughly 23 new nullable columns on the `voters` table, expanded CANONICAL_FIELDS mappings, a multi-table import transaction that auto-creates VoterPhone records, and parallel frontend updates. The existing SQLAlchemy/Alembic/FastAPI/RapidFuzz stack already covers every capability required.

The recommended approach follows a strict dependency order: migration first (columns must exist before anything reads or writes them), then model + schemas, then import pipeline enhancement, then filter builder, then frontend. This order is non-negotiable — all four research files independently converged on the same critical path. The import pipeline phase carries the highest engineering risk because it introduces a two-table transactional write (voters + VoterPhone) using a RETURNING clause that does not yet exist in the current upsert. Every other phase follows well-understood, low-risk patterns from the existing codebase.

The primary category of risk is silent data loss, not crashes. Three pitfalls in particular can silently drop data without raising errors: the ON CONFLICT SET clause derived from the first batch row (causes sparse column writes for later rows), voting history format mismatch (breaks existing saved filters without error), and stale CANONICAL_FIELDS / _VOTER_COLUMNS (routes values to extra_data silently). All three have clear preventions documented in the research. Treat each as a test requirement: if the test is not written and passing, the feature is not done.

## Key Findings

### Recommended Stack

No new packages are required. See `STACK.md` for the full breakdown. The existing stack covers every v1.3 capability: SQLAlchemy `SmallInteger` and `String` for new column types, Alembic `op.add_column()` for migration, Python stdlib `re` for phone normalization and voting history pattern matching, RapidFuzz for fuzzy field mapping (already in use), and SQLAlchemy `insert().on_conflict_do_update()` for the existing batch upsert pattern extended with RETURNING.

**Core technologies (all existing):**
- `SQLAlchemy >= 2.0.48`: New `mapped_column(SmallInteger)` for propensity scores (2 bytes, no Decimal serialization overhead), `String(N)` for demographic fields — consistent with `native_enum=False` project convention
- `Alembic >= 1.18.4`: Single migration file with ~23 `op.add_column()` calls — all nullable, so PostgreSQL executes as metadata-only (no table rewrite, no downtime on large tables)
- `Python re` stdlib: Phone normalization (strip non-digits, validate 10 digits) and voting history column detection (`^(General|Primary|Runoff|Municipal|Special)_\d{4}$`)
- `RapidFuzz >= 3.14.3`: Existing fuzzy matching at 75% threshold covers minor L2 column name variations — no structural changes needed

**Critical column type decisions:**
- Propensity scores: `SmallInteger` (not Numeric, not Float) — L2 scores are integer deciles 0-100; Numeric would cause Pydantic v2 to serialize as strings in JSON
- Demographic strings: `String(N)` (not StrEnum) — vendor values vary and expand; consistent with project's `native_enum=False` convention
- Mailing address: inline columns on Voter model (not VoterAddress) — keeps the batch upsert atomic with one table write

### Expected Features

See `FEATURES.md` for full specification including per-field L2 column name mappings.

**Must have (table stakes):**
- Propensity scores as first-class columns (`propensity_general`, `propensity_primary`, `propensity_combined`) — every major competitor (VAN, PDI, TargetSmart) surfaces these; campaigns build target universes around them
- Mailing address fields (8 columns inline on Voter) — direct mail is one of three core outreach channels; without it, campaigns need external mail house lookups
- Voting history Y/N column parsing — L2 delivers history as dozens of separate `General_YYYY`/`Primary_YYYY` columns; without parsing, history data lands in `extra_data` and the existing filter builder cannot use it
- Auto-create VoterPhone from cell phone column — the call list generator filters on VoterPhone existence; without this, imported phone numbers are invisible to phone banking
- Spoken language column (`spoken_language`) — multilingual campaign filtering in high-diversity states (CA, TX, FL, NV, AZ)
- Updated L2 mapping template — must ship with the migration or L2 imports still route new fields to `extra_data`
- Filter builder updates for propensity ranges — the primary reason to make propensity first-class is enabling range queries

**Should have (differentiators):**
- Cell phone confidence score (`cell_phone_confidence`) — L2's CellConfidenceCode; allows high-confidence calls first; no competitor surfaces this in standard UI
- Party change indicator (`party_change_indicator`) — L2's `Voters_PartyChange`; signals persuadability; rare to surface explicitly
- Household-level fields (`household_party_registration`, `household_size`, `family_id`) — enables household-level targeting logic
- Military status filter — important for veteran-focused platforms
- Filter on ethnicity, language, military status — once first-class, filter exposure is low effort and high value

**Defer to future milestone:**
- Mailing address filter dimensions — mailing address is primarily for export to mail houses; in-app filtering is low priority
- Cell phone confidence as a filter — nice-to-have for sophisticated phone banking; not blocking any workflow
- Household-level analytics (aggregate queries across household_id) — data storage column ships in v1.3; query logic is a separate feature

**Explicit anti-features (do not build):**
- Self-computed propensity scores (vendor problem; out of scope in PROJECT.md)
- BISG/fBISG ethnicity prediction (accuracy issues, legal/ethical concerns)
- Normalized ethnicity/language enums (breaks with L2's 50+ and TargetSmart's 170+ values)
- Real-time propensity score updates (requires ML infrastructure)
- Landline/cell type auto-detection via NANPA lookups (trust vendor classification)

### Architecture Approach

The architecture is entirely additive — no new tables, no new services, no new API endpoints. One Alembic migration adds columns and indexes and updates the L2 template JSONB. The Voter model grows from 23 to ~46 data columns. The import service gains phone extraction + voting history detection logic and a second bulk INSERT (VoterPhone) after the voter upsert, connected via a RETURNING clause. The filter builder gains ~13 new condition handlers following the exact same pattern as the 13 already in place. The frontend mirrors every backend change in TypeScript types, ColumnMappingTable, VoterFilterBuilder, VoterDetail, and VoterEditSheet.

**Major components:**
1. **Alembic migration** — single file: ADD COLUMN x23, CREATE UNIQUE INDEX on voter_phones(campaign_id, voter_id, value), CREATE INDEX on (campaign_id, turnout_score) and (campaign_id, language), UPDATE L2 template JSONB via `||` merge operator
2. **Import pipeline** (import_service.py) — enhanced `apply_field_mapping()` extracts phone records + parses voting history columns; enhanced `process_csv_batch()` adds RETURNING clause to voter upsert, uses returned voter IDs to bulk-insert VoterPhone records in same transaction
3. **Filter builder** (voter.py + voter_filter.py) — additive: new VoterFilter fields and corresponding `build_voter_query()` condition blocks; no changes to existing logic
4. **Frontend** (4 files) — TypeScript Voter/VoterFilter interfaces, ColumnMappingTable canonicals, VoterFilterBuilder controls, VoterDetail display cards, VoterEditSheet fields

**Key patterns to follow:**
- All new columns: `Mapped[T | None]` (nullable=True) — mandatory for ADD COLUMN on populated tables
- Phone normalization: `re.sub(r'[^0-9]', '', value)` + 10-digit length check — match DNC filter normalization
- Election column detection: `re.compile(r'^(General|Primary|Runoff|Municipal|Special)_(\d{4})$')` — extract type + year into canonical identifier `"General_2024"` format
- VoterPhone dedup: `INSERT ... ON CONFLICT (campaign_id, voter_id, value) DO UPDATE SET type = EXCLUDED.type` — idempotent reimport
- Derive `_VOTER_COLUMNS` from `Voter.__table__.columns` at import time — eliminates manual sync with model

### Critical Pitfalls

Full details in `PITFALLS.md`. The top five that require explicit implementation decisions:

1. **ON CONFLICT SET clause built from first batch row** (PITFALL 1) — Silent data loss for sparse rows. Fix: derive `update_cols` from full `_VOTER_COLUMNS` set (or derive from `Voter.__table__.columns`), not from `valid_voters[0].keys()`. This change must land in Phase 1 before import pipeline expansion begins.

2. **Missing RETURNING clause for VoterPhone creation** (PITFALL 2) — Cannot link VoterPhone records to newly-inserted voter UUIDs without it. Fix: add `.returning(Voter.id, Voter.source_id)` to the voter upsert statement; build `source_id -> voter_id` mapping from results. This is the hardest single engineering change in the milestone.

3. **VoterPhone duplicate records on reimport** (PITFALL 3) — No unique constraint exists on voter_phones(voter_id, value). Fix: add UNIQUE constraint in migration; use `ON CONFLICT (campaign_id, voter_id, value) DO UPDATE` for phone inserts during import.

4. **Voting history format breaks existing saved filters** (PITFALL 4) — If L2 columns like `General_2024_11_05` are stored as-is, year-based filter values like `"2024"` stop matching. Fix: define canonical format now as `"{Type}_{Year}"` (e.g., `"General_2024"`); implement backward-compat in `build_voter_query` so year-only filter values still match; parse L2 column names to extract type + year.

5. **Stale L2 template + CANONICAL_FIELDS / _VOTER_COLUMNS drift** (PITFALLS 8 + 11) — New columns silently route to `extra_data` if not registered in both structures. Fix: derive `_VOTER_COLUMNS` from model automatically; update L2 template JSONB in the migration; add a CI test asserting CANONICAL_FIELDS keys are a subset of `_VOTER_COLUMNS`.

## Implications for Roadmap

All four research files independently recommend the same four-phase build order. The architecture analysis provides detailed pseudocode for each phase. There is no significant ambiguity about sequencing.

### Phase 1: Schema Foundation (Migration + Model + Core Schemas)

**Rationale:** Every downstream change depends on the database columns existing. This is the only phase with no predecessor dependencies. PostgreSQL ADD COLUMN with nullable=True is metadata-only — safe to run immediately on any size table.
**Delivers:** All ~23 new nullable columns on the voters table, VoterPhone unique constraint on (campaign_id, voter_id, value), filter indexes on (campaign_id, turnout_score) and (campaign_id, language), updated L2 template JSONB, updated Voter ORM model with `Mapped[T | None]` fields, updated VoterResponse/VoterCreateRequest/VoterUpdateRequest schemas
**Addresses:** All table-stakes features — columns must exist before import or filtering can use them
**Avoids:**
- Pitfall 5 (non-nullable column migration failure) — all columns must be `Mapped[T | None]`
- Pitfall 7 (mailing address design fork) — commit to inline columns on Voter model, not VoterAddress, before writing the migration
- Pitfall 10 (missing indexes) — add filter indexes in the same migration, not deferred
- Pitfall 18 (household_size confusion) — store vendor value as-is, document that it reflects vendor data not the imported subset

**Key action:** Fix `_VOTER_COLUMNS` derivation (from `Voter.__table__.columns`) in this phase, before any import changes touch it.

**Research flag:** Skip — purely additive Alembic operations; well-established patterns in the existing codebase.

### Phase 2: Import Pipeline Enhancement

**Rationale:** Depends on Phase 1 columns. Highest-risk, highest-value engineering work. Must be isolated so failures do not affect other changes. Contains the only structurally novel change in the milestone (RETURNING clause).
**Delivers:** Phone normalization utility (`normalize_phone()`), propensity score parser (`parse_propensity()`), voting history Y/N parser with canonical `"{Type}_{Year}"` format, VoterPhone auto-creation via RETURNING clause + batch INSERT, expanded CANONICAL_FIELDS + L2 aliases for all new fields, updated L2 mapping template aliases in suggest_field_mapping
**Addresses:** Auto-create VoterPhone (critical for phone banking pipeline), voting history parsing (critical for filter builder), mailing address + demographic field mapping
**Avoids:**
- Pitfall 1 (SET clause drift) — use derived full column set, not first-row keys
- Pitfall 2 (missing voter IDs) — RETURNING clause with source_id -> voter_id mapping
- Pitfall 3 (duplicate phones) — ON CONFLICT DO UPDATE with unique constraint from Phase 1
- Pitfall 4 (voting history format) — implement `"{Type}_{Year}"` canonical format
- Pitfall 6 (percent string parsing) — dedicated `parse_propensity()` with exhaustive test matrix
- Pitfall 9 (ethnicity "Likely" prefix) — normalize on storage, strip qualifier prefix
- Pitfall 16 (phone normalization) — strip non-digits, validate 10 digits, match DNC normalization
- Pitfall 15 (import performance) — batch phone inserts identically to voter batch; benchmark with Macon-Bibb demo dataset

**Research flag:** NEEDS ATTENTION — The RETURNING clause change is structurally novel; verify behavior with new voter inserts (not just updates) against real test data. Exact L2 propensity column names are MEDIUM confidence; verify against an actual L2 file before finalizing aliases.

### Phase 3: Filter Builder + Query Enhancement

**Rationale:** Depends on Phase 1 columns. Independent of Phase 2 (can run in parallel or sequentially). Low engineering risk — identical pattern to existing 13 filter conditions. Sequenced after Phase 2 because voting history canonical format (established in Phase 2) must be known before implementing backward-compat in the query builder.
**Delivers:** VoterFilter schema additions (~13 new dimensions including propensity ranges, ethnicity/language/military multi-select, has_mailing_address boolean), `build_voter_query()` condition handlers for all new dimensions
**Addresses:** Propensity range filtering (primary table-stakes reason to make scores first-class), demographic filters (differentiators)
**Avoids:**
- Pitfall 4 (voting history backward compat) — implement year-only lookup alongside canonical format from Phase 2 so `voted_in: ["2024"]` still matches `"General_2024"` entries
- Pitfall 12 (extra_data stale data) — assess whether a data migration is needed for campaigns that previously imported L2 files; run UPDATE to copy JSONB keys to typed columns if needed

**Research flag:** Skip — exact same pattern as 13 existing conditions; no novel patterns.

### Phase 4: Frontend Updates

**Rationale:** Depends on Phases 1-3. Pure additive UI work with low risk. Must come last because it exposes only what the API already returns and already filters.
**Delivers:** TypeScript Voter/VoterFilter interface updates, ColumnMappingTable new canonical field entries, VoterFilterBuilder new controls grouped into collapsible sections, VoterDetail new display cards (Propensity Scores, Mailing Address, Extended Demographics, Household), VoterEditSheet new editable fields
**Addresses:** Display of all new vendor data fields, filter UI for new dimensions
**Avoids:**
- Pitfall 14 (frontend type mismatch) — only add filter UI controls that have backend condition handlers from Phase 3
- Pitfall 17 (filter UX overwhelm) — group filter controls into collapsible sections (Demographics, Political, Geography, Scores, Contact, Tags); keep 4 most-used always visible

**Research flag:** Skip — mirrors backend schema; TypeScript strict mode catches drift at compile time.

### Phase Ordering Rationale

- **Migration must be first** because ADD COLUMN is metadata-only and instant in PostgreSQL — there is no cost to doing it before the application code that uses those columns is written; everything downstream requires columns to exist
- **Import and filter are independent after migration** — they share only the Voter model, not each other's logic; the suggested sequence (import before filter) exists because voting history parsing (Phase 2) defines the canonical identifier format that the filter query builder (Phase 3) must match for backward compatibility
- **Frontend is always last** — it depends on the API returning new fields (Phase 1) and accepting new filters (Phase 3); deferring avoids incomplete-feature UI states during development
- **Single migration file** — one `op.add_column()` batch for all ~23 columns avoids migration chain complexity; columns are all nullable so the migration is instant regardless of table size

### Research Flags

**Phases needing closer attention during implementation:**
- **Phase 2 (RETURNING clause):** The most structurally novel change. Recommend a focused implementation session with explicit test cases covering new voter inserts (not just updates). Test: import a file with phone numbers where all voters are new; verify VoterPhone records exist with correct voter_id FK.
- **Phase 2 (Voting history canonical format):** The `"{Type}_{Year}"` format decision has downstream impact on saved filters. Lock in the format specification in writing before coding begins. Audit actual voting_history array contents in production before implementing the parser.
- **Phase 3 (Backward compatibility):** Existing `voter_lists` with saved `voted_in` filters using year-only strings must continue to work. Requires an explicit test with a seeded saved filter containing `voted_in: ["2024"]`.
- **Phase 1 (extra_data backfill decision):** If campaigns have already imported L2 files, propensity and demographic data may be in `extra_data` on existing voter records. Assess before shipping Phase 1 whether a data migration script is needed.

**Phases with standard patterns (low uncertainty):**
- **Phase 1 (Migration + model):** Purely additive Alembic operations. Well-understood pattern in this codebase.
- **Phase 3 (Filter builder):** Exact same pattern as 13 existing conditions. No architectural questions.
- **Phase 4 (Frontend):** Mirror backend schema. TypeScript strict mode catches drift at compile time.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies. All capabilities verified against existing installed versions. Column type decisions (SmallInteger vs Numeric vs Float) verified against SQLAlchemy docs and Pydantic v2 serialization behavior. |
| Features | HIGH | Core features verified against L2 documentation and existing codebase. Differentiators based on industry research (Pew, VAN, NGP). L2 exact column names for new propensity fields are MEDIUM — verify against a real L2 file. |
| Architecture | HIGH | Based on direct codebase analysis of all affected files. Pseudocode patterns derived from existing service code. No external architecture research needed. |
| Pitfalls | HIGH | All critical pitfalls identified through direct code inspection. Three pitfalls (1, 4, 8) are subtle silent-failure modes that would not surface in basic testing without specific test cases. Recovery costs documented. |

**Overall confidence:** HIGH

### Gaps to Address

- **L2 exact propensity column names** (MEDIUM confidence): The research lists likely names (`Voters_GeneralElectionTurnout`, `Modeled_Turnout`, etc.) but L2's full data dictionary is behind institutional access. Exact names vary by state. The RapidFuzz fuzzy matcher provides a safety net, but explicit aliases should be verified against an actual L2 file before the import pipeline changes go to production. Flag for early validation in Phase 2.

- **TargetSmart field name prefixes** (LOW confidence): TargetSmart per-client configuration means `ts_tsmart_*` prefixes may vary. The fuzzy matcher should handle most cases. If a TargetSmart import fails to map propensity scores, add aliases after first real import.

- **Existing extra_data backfill** (depends on production state): If campaigns have already imported L2 files, propensity and demographic data may be in `extra_data` on existing voter records. Whether a data migration script is needed depends on which campaigns are in production and what they have imported. Assess before shipping Phase 1.

- **Voting history backward compatibility** (must be locked in before Phase 2): If existing production data has year-only strings in `voting_history` (e.g., `"2024"`) from prior manual imports or other sources, the canonical format decision affects those records. Audit actual voting_history array contents before implementing the parser.

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/models/voter.py`, `app/services/import_service.py`, `app/services/voter.py`, `app/schemas/voter_filter.py`, `app/models/voter_contact.py`, `alembic/versions/002_voter_data_models.py` — direct analysis of all affected files
- [SQLAlchemy 2.0 Type Hierarchy](https://docs.sqlalchemy.org/en/20/core/type_basics.html) — Numeric vs Float vs Integer column type selection
- [L2 2025 Voter Data Dictionary](https://www.l2-data.com/wp-content/uploads/2025/08/L2-2025-VOTER-DATA-DICTIONARY-1.pdf) — 698 demographic variables, propensity score specification
- [PostgreSQL ALTER TABLE ADD COLUMN](https://www.postgresql.org/docs/current/sql-altertable.html) — confirms nullable ADD COLUMN is metadata-only, no table rewrite
- [SQLAlchemy INSERT ON CONFLICT RETURNING](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html) — VoterPhone creation pattern

### Secondary (MEDIUM confidence)
- [Pew Research: Political data in voter files](https://www.pewresearch.org/methods/2018/02/15/political-data-in-voter-files/) — propensity score structure (0-100 scale), modeled partisanship conventions
- [L2 Partisanship Models](https://www.l2-data.com/l2-modeled-partisanship-models/) — confirms propensity scores are decile integers 10-100
- [TargetSmart Data Products Documentation](https://docs.targetsmart.com/my_tsmart/data-products.html) — VoterBase, CellBase field descriptions
- [NationBuilder voter file fields](https://support.nationbuilder.com/en/articles/2471295-national-voter-file-fields) — mailing address field patterns
- [Pydantic v2 Decimal Serialization Issue #7457](https://github.com/pydantic/pydantic/issues/7457) — confirms SmallInteger over Numeric for JSON serialization

### Tertiary (LOW confidence — needs validation)
- [Aristotle Data](https://www.aristotle.com/data/) — 1000+ data points cited; field names not publicly documented; fuzzy matching is the mitigation
- L2 voting history column format (`General_YYYY_MM_DD` pattern) — inferred from documentation references; exact naming varies by state; must validate against real L2 file
- TargetSmart field name prefixes (`ts_tsmart_*`, `vb_voterbase_*`) — from API documentation fragments; per-client configuration may vary

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
