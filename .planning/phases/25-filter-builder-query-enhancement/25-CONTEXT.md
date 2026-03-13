# Phase 25: Filter Builder & Query Enhancement - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can filter voters by propensity score ranges, demographic attributes, and mailing address fields using the existing composable filter system. Voting history backward compatibility ensures existing saved filters with year-only values still work against the new canonical format. No frontend changes, no new model columns, no import changes.

</domain>

<decisions>
## Implementation Decisions

### Voting history backward compatibility
- Year-only values (e.g., "2024") are expanded to OR match: `voting_history.overlap(["General_2024", "Primary_2024"])`
- Already-canonical values (e.g., "General_2024") use exact array containment as before
- Detection: regex `^\d{4}$` distinguishes year-only from canonical format
- `not_voted_in` expansion: "2024" means voter did NOT vote in General_2024 AND did NOT vote in Primary_2024 (skipped the entire election cycle)
- Expansion covers General and Primary only — no Runoff/Special (L2 data doesn't have these)
- Frontend keeps sending year-only values; backend handles expansion transparently
- No migration of existing saved `filter_query` JSONB values needed

### Propensity range filters
- Three independent propensity dimensions: propensity_general_min/max, propensity_primary_min/max, propensity_combined_min/max
- Either min, max, or both can be set per dimension (same flexibility as age_min/age_max)
- NULL propensity scores are excluded from range-filtered results (standard SQL NULL behavior — no COALESCE)
- Pydantic validation: Field(ge=0, le=100) on all propensity filter fields

### Multi-select demographic filters
- Filter field names are plural lists: `ethnicities`, `spoken_languages`, `military_statuses`
- List-only — no singular shorthand (avoid party/parties dual-field pattern proliferation)
- OR semantics within field: ethnicities=["Hispanic", "Asian"] returns voters matching ANY value
- Case-insensitive matching using ILIKE (L2 data may have inconsistent casing across vendors)

### Mailing address filters
- New fields: mailing_city, mailing_state, mailing_zip as exact-match filters
- Independent from registration address filters — no combined "any address" option
- Case-insensitive matching using ILIKE for all address filters (both mailing and registration)
- Existing registration address filters (registration_city, registration_state, registration_zip) updated to case-insensitive ILIKE for consistency
- Zip code filters remain exact match (no prefix matching)

### Claude's Discretion
- ILIKE implementation detail: whether to use `func.lower()` with `.in_()` or `or_(*[col.ilike(v) for v in values])` for multi-select
- Index considerations for case-insensitive queries (functional indexes if needed)
- Test structure and coverage approach
- Whether registration_county also gets ILIKE treatment for consistency

</decisions>

<specifics>
## Specific Ideas

- Year-only expansion follows the same pattern as the existing `parties` vs `party` filter — detect the shape of the input and adapt query behavior
- Case-insensitive address matching prevents "ATLANTA" vs "Atlanta" mismatches common in L2 data
- Propensity filters follow the exact age_min/age_max pattern — no new query patterns needed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VoterFilter` schema (`app/schemas/voter_filter.py`): 19 existing fields — add 12 new fields (6 propensity, 3 demographic, 3 mailing)
- `build_voter_query()` (`app/services/voter.py:24-143`): Established condition-appending pattern — extend with new filter handlers
- `TestBuildVoterQuery` (`tests/unit/test_voter_search.py:16-151`): Compile-to-SQL test pattern — add tests for all new dimensions
- `parties` filter pattern (`.in_()` clause): Reuse for multi-select demographics
- `age_min/age_max` pattern (range comparison): Reuse for propensity ranges

### Established Patterns
- Each non-None filter field appends a condition to the conditions list
- Conditions combined with AND (default) or OR based on `filters.logic`
- Array containment for voting_history: `Voter.voting_history.contains([value])`
- Subquery pattern for tags (EXISTS with GROUP BY/HAVING)
- EXISTS subquery for has_phone boolean filter

### Integration Points
- `VoterFilter` is used by: voter search endpoint, dynamic voter list filter_query JSONB, call list generation, walk list generation
- Registration address field name changes (city→registration_city) already done in Phase 23 — filter schema already uses `registration_city`
- Phase 23 created indexes on mailing_zip, mailing_city, mailing_state for this phase's queries

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-filter-builder-query-enhancement*
*Context gathered: 2026-03-13*
