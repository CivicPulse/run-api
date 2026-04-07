# Stack Research

**Domain:** Voter-page free-text search and cross-field lookup in an existing FastAPI/PostgreSQL voter CRM
**Researched:** 2026-04-06
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PostgreSQL | 17.x, specifically 17.9 in current supported release docs; repo already targets `postgres:17` | Primary search engine for this milestone using `pg_trgm`, `unaccent`, full-text search, GIN/GiST indexes, and ranking | This app already depends on PostgreSQL + RLS. PostgreSQL 17 can cover typo tolerance, partial matches, exact/prefix boosts, and ranked lookup without adding a second search system or weakening tenant isolation. |
| SQLAlchemy PostgreSQL dialect | 2.0.48+ (already installed) | Build `similarity()`, `%`, `@@`, `websearch_to_tsquery()`, `ts_rank_cd()`, and weighted `CASE` ranking expressions from the existing async service layer | SQLAlchemy 2.x already exposes PostgreSQL full-text operators and functions cleanly. Use direct dialect functions instead of adding a search abstraction library. |
| FastAPI | 0.135.1+ (already installed) | Expose a search-first voter endpoint contract that returns ranked results and match metadata | No framework change is needed. The work is query construction, schema evolution, and result shaping, not API infrastructure. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg_trgm` PostgreSQL extension | Bundled with PostgreSQL 17 | Trigram similarity and index-backed typo-tolerant partial matching | Use for names, addresses, city, ZIP, source IDs, phone numbers, and email values where user input is messy or incomplete. |
| `unaccent` PostgreSQL extension | Bundled with PostgreSQL 17 | Accent-insensitive normalization before trigram or FTS comparison | Use anywhere text should match regardless of diacritics. Apply in indexed expressions, not only at query time. |
| `asyncpg` | 0.31.0+ (already installed) | Existing async PostgreSQL driver | Keep as-is. No driver change is needed for search. |
| Alembic | 1.18.4+ (already installed) | Roll out `CREATE EXTENSION`, functional indexes, and any search-specific columns safely | Use for all schema/index additions in this milestone. |
| `@tanstack/react-query` | 5.90.21 (already in `web/package.json`) | Debounced, cache-aware ranked search requests from the voter page | Reuse the current `useVoterSearch()` pattern for search-as-you-type and optional filter refinement. |
| `ky` | 1.14.3 (already in `web/package.json`) | Existing HTTP client for search requests | Keep as-is; no frontend client library change is required. |
| `RapidFuzz` | 3.14.3 (already installed) | Offline evaluation or fixture generation only | Do not use in the hot request path. It is appropriate for import mapping and test comparisons, not DB-backed voter lookup. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Alembic migrations | Enable extensions and add search indexes | Put `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and `CREATE EXTENSION IF NOT EXISTS unaccent;` in a dedicated migration before query changes ship. |
| `EXPLAIN (ANALYZE, BUFFERS)` | Validate that ranked queries use the intended GIN/GiST indexes | Required before rollout because search ranking queries can silently degrade into sequential scans. |
| Existing Vitest/Playwright stack | Verify ranked lookup behavior end-to-end | Add tests for typo tolerance, prefix matches, ranking order, and filter + search interaction. |

## Integration Points

### Database

Add PostgreSQL-native search features to the existing database, not a separate service:

1. Enable `pg_trgm` and `unaccent`.
2. Add normalized functional indexes on the fields users actually search:
   - `voters.first_name`
   - `voters.last_name`
   - concatenated full name
   - `voters.source_id`
   - registration and mailing address lines
   - city/state/ZIP
   - `voter_phones.value`
   - `voter_emails.value`
3. Add one weighted full-text search expression for voter-row text fields:
   - names highest weight
   - address and geography medium weight
   - source/vendor IDs lower weight
4. Keep phone/email lookup index-backed via joins or `EXISTS` subqueries with trigram/equality matching rather than introducing an async indexing pipeline.

Recommended query shape:

- Exact and prefix boosts first: exact phone, exact email, exact source ID, exact last name + first name prefix.
- FTS candidate/rank next: `to_tsvector(...) @@ websearch_to_tsquery(...)` with `ts_rank_cd(...)`.
- Trigram fallback for typo tolerance: `similarity(...)`, `word_similarity(...)`, and `%` on normalized expressions.
- Final blended score in SQL via `CASE` + weighted rank fields.

### Backend

Current implementation is only name `ILIKE` on concatenated fields in [app/services/voter.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/voter.py). Replace that narrow predicate with a dedicated ranked-search branch inside the existing `VoterService.search_voters()` flow.

Recommended backend changes:

- Extend [app/schemas/voter_filter.py](/home/kwhatcher/projects/civicpulse/run-api/app/schemas/voter_filter.py) so search-first requests can sort by relevance.
- Keep the existing `POST /campaigns/{campaign_id}/voters/search` endpoint in [app/api/v1/voters.py](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/voters.py); do not create a parallel search API unless response semantics materially diverge.
- Return match metadata useful to the UI:
  - `rank`
  - `matched_fields`
  - optional `match_type` such as `exact`, `prefix`, `fts`, `trigram`
- Preserve current RLS/session handling through `get_campaign_db`; search must stay inside the same transaction-scoped campaign context.

### Frontend

No new frontend search package is needed. The web app already has the right primitives:

- [web/src/hooks/useVoters.ts](/home/kwhatcher/projects/civicpulse/run-api/web/src/hooks/useVoters.ts) already posts search bodies via React Query.
- [web/src/components/voters/AddVotersDialog.tsx](/home/kwhatcher/projects/civicpulse/run-api/web/src/components/voters/AddVotersDialog.tsx) already demonstrates debounced voter search.

Recommended UI stack change:

- Reuse existing React Query + `ky` plumbing.
- Add debounce and stale-request suppression in the voter-page search box.
- Show ranked results immediately, with the existing structured filters as secondary refinement.
- Do not add client-side fuzzy search libraries; ranking belongs in PostgreSQL so pagination and security stay correct.

## Installation

```bash
# Python: no new package required
# Frontend: no new package required

# Database migration contents
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

Representative index patterns to add in Alembic migrations:

```sql
CREATE INDEX IF NOT EXISTS ix_voters_full_name_trgm
ON voters
USING gin (
  unaccent(lower(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS ix_voters_search_tsv
ON voters
USING gin (
  to_tsvector(
    'simple',
    unaccent(
      concat_ws(
        ' ',
        first_name,
        middle_name,
        last_name,
        suffix,
        source_id,
        registration_line1,
        registration_city,
        registration_state,
        registration_zip,
        mailing_line1,
        mailing_city,
        mailing_state,
        mailing_zip
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS ix_voter_phones_value_trgm
ON voter_phones
USING gin (unaccent(lower(value)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_voter_emails_value_trgm
ON voter_emails
USING gin (lower(value) gin_trgm_ops);
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| PostgreSQL 17 + `pg_trgm` + FTS | Elasticsearch/OpenSearch | Only if voter lookup grows into a separate multi-entity search platform with cross-campaign/global search, heavy aggregations, or search-specific operational staff. Not justified for this milestone. |
| PostgreSQL-native ranking in SQL | Meilisearch or Typesense | Reasonable only if product direction shifts toward consumer-style instant search across many entities and languages. Today it adds another service, sync pipeline, and failure mode without solving a must-have gap. |
| Direct SQLAlchemy PostgreSQL functions | `sqlalchemy-searchable` or similar helper packages | Use a helper only if the team decides to standardize a shared search DSL across many models. For one voter lookup milestone, direct SQLAlchemy is clearer and lower risk. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Elasticsearch/OpenSearch for this milestone | New cluster, new ops surface, async indexing, failure/relevance debugging, and tenant-sync complexity for a feature PostgreSQL already covers | PostgreSQL 17 with `pg_trgm`, `unaccent`, FTS, and expression indexes |
| Meilisearch/Typesense for this milestone | Same dual-write/index-sync problem; also complicates RLS-aligned tenant isolation | PostgreSQL-native search inside the existing transaction and policy model |
| Python-side `RapidFuzz`/`fuzzywuzzy` in request handlers | Pulls ranking out of the database, breaks index use, complicates pagination, and becomes slow on large voter tables | SQL ranking functions plus indexed trigram matching |
| Client-side fuzzy filtering libraries | Searches only whatever page of results was already fetched and produces incorrect rank/order semantics | Server-side ranked search with React Query debounce |
| Redis or a background indexing worker just for search | Unnecessary operational complexity for a synchronous lookup feature | Direct PostgreSQL query execution on writes and reads |

## Stack Patterns by Variant

**If the query looks like a person/address lookup:**
- Use trigram similarity plus prefix boosts on normalized name and address expressions.
- Because users often type fragments, swapped spacing, or minor misspellings.

**If the query is multi-word free text:**
- Use `websearch_to_tsquery('simple', q)` against a weighted `to_tsvector(...)`.
- Because it handles natural user input better than raw `to_tsquery()` while still ranking results.

**If the query looks like phone, email, ZIP, or source ID:**
- Use exact and prefix comparisons before trigram fallback.
- Because identifier-style fields should rank precise matches above fuzzy name matches.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| PostgreSQL 17.x | `pg_trgm`, `unaccent`, built-in FTS | These are bundled contrib capabilities, not extra services. |
| SQLAlchemy 2.0.48+ | PostgreSQL full-text functions/operators | SQLAlchemy 2.0 docs explicitly support PostgreSQL FTS via `func` and boolean operators. |
| FastAPI 0.135.1+ | `asyncpg` 0.31.0+ and SQLAlchemy async | No framework upgrade is required to add ranked search. |
| React 19.2 + React Query 5.90.21 | Existing `ky` client hooks | Current frontend stack is already sufficient for search-as-you-type UX. |

## Sources

- [`.planning/PROJECT.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/PROJECT.md) - milestone scope, existing architecture, constraints
- [`pyproject.toml`](/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml) - current backend package versions
- [`web/package.json`](/home/kwhatcher/projects/civicpulse/run-api/web/package.json) - current frontend package versions
- [`app/services/voter.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/voter.py) - current voter search implementation
- [`app/api/v1/voters.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/voters.py) - current search endpoint integration point
- [`app/models/voter.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/voter.py) - searchable voter fields
- [`app/models/voter_contact.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/voter_contact.py) - searchable phone/email fields
- https://www.postgresql.org/docs/17/pgtrgm.html - official `pg_trgm` operators, similarity functions, and index support
- https://www.postgresql.org/docs/17/unaccent.html - official accent-insensitive text normalization support
- https://www.postgresql.org/docs/17/textsearch-controls.html - official `websearch_to_tsquery()` and `ts_rank_cd()` behavior
- https://docs.sqlalchemy.org/en/20/dialects/postgresql.html - official SQLAlchemy PostgreSQL full-text search support
- https://www.postgresql.org/docs/17/release-17.html - official PostgreSQL 17 release reference; repo currently targets `postgres:17`

---
*Stack research for: voter-page search and lookup*
*Researched: 2026-04-06*
