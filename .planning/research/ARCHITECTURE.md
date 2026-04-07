# Architecture Patterns

**Domain:** Voter-page free-text lookup for a multi-tenant campaign CRM
**Researched:** 2026-04-06
**Confidence:** HIGH

## Recommended Architecture

Keep the existing FastAPI + async SQLAlchemy + PostgreSQL monolith and add a dedicated voter lookup layer inside it. Do not create a separate search service. The new feature fits the current architecture if search remains campaign-scoped, database-native, and exposed through the existing `POST /campaigns/{campaign_id}/voters/search` flow.

The key architectural choice is to separate **deterministic filters** from **discovery-style lookup**:

- Keep `VoterFilter` for stable, composable filters used by voter lists and filter chips.
- Add a separate lookup payload for free-text search, ranking, and typo tolerance.
- Back that lookup with a denormalized PostgreSQL search projection plus indexes, instead of expanding the current name-only `ILIKE`.

This avoids leaking fuzzy semantics into dynamic lists, preserves existing filter behavior, and keeps ranking logic isolated to the voter page and other lookup UIs.

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                            React Web UI                             │
├──────────────────────────────────────────────────────────────────────┤
│ Voter page search box │ Filter builder │ DataTable │ Add-to-list UI │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │                               │
                │ POST /campaigns/:id/voters/search
                │ body = { filters, lookup, cursor, sort_by, sort_dir }
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         FastAPI voter API                            │
├──────────────────────────────────────────────────────────────────────┤
│ Request schema │ auth/RLS deps │ VoterSearchService │ serializers    │
└───────────────┬───────────────────────────────────────┬───────────────┘
                │                                       │
                │ structured filters                    │ ranked lookup
                ▼                                       ▼
┌──────────────────────────────┐      ┌────────────────────────────────┐
│ Existing voter filter query  │      │ New voter lookup query planner │
│ exact/range/tag predicates   │      │ FTS + trigram + boost rules    │
└───────────────┬──────────────┘      └───────────────┬────────────────┘
                │                                     │
                └──────────────────┬──────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL                                 │
├──────────────────────────────────────────────────────────────────────┤
│ voters │ voter_phones │ voter_emails │ voter_search_documents        │
│ RLS    │ RLS          │ RLS          │ RLS + GIN/GiST trigram/text   │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Status | Responsibility | Communicates With |
|-----------|--------|----------------|-------------------|
| `app/api/v1/voters.py` | Modified | Keep current endpoint; accept lookup payload; dispatch to ranked query path when present | Schemas, search service |
| `app/schemas/voter_filter.py` or split `voter_search.py` | Modified/New | Separate stable filters from fuzzy lookup contract | API, frontend types |
| `app/services/voter.py` | Modified | Continue owning CRUD and deterministic filter composition | Existing voter flows |
| `app/services/voter_search.py` | New | Build candidate set, rank matches, paginate relevance results | Voter API, SQLAlchemy |
| `app/models/voter_search_document.py` | New | Denormalized per-voter search projection including cross-table fields | Migration, write paths |
| `alembic` migration | New | Enable `pg_trgm`, add search table/indexes/RLS/backfill | PostgreSQL |
| Voter/contact write paths | Modified | Refresh search projection after voter/contact/import changes | Search document table |
| `web/src/routes/campaigns/$campaignId/voters/index.tsx` | Modified | Search-first UX; query + filters + relevance sort behavior | Hook, DataTable |
| `web/src/hooks/useVoters.ts` | Modified | Carry lookup payload and relevance cursor | Voter API |
| `web/src/components/voters/AddVotersDialog.tsx` | Modified | Reuse lookup API with a simpler UI mode | Hook |

## Why This Fits The Existing App

### Existing seam to preserve

The current voter page already routes all server-side search through `POST /voters/search`, and the backend already centralizes filter construction in `build_voter_query()` and `VoterService.search_voters()`. That is the correct seam to extend.

### Existing seam to avoid overloading

`VoterFilter.search` is currently a name substring match, but `VoterFilter` is also reused for dynamic lists and other deterministic filtering flows. If fuzzy cross-field lookup is pushed into that field, list definitions become unstable and hard to reason about.

**Recommendation:** keep fuzzy lookup out of stored `VoterFilter`. Introduce a separate contract such as:

```ts
type VoterSearchBody = {
  filters: VoterFilter
  lookup?: {
    query: string
    mode?: "broad" | "name_only"
  }
  cursor?: string
  limit?: number
  sort_by?: "relevance" | existingSortableColumns
  sort_dir?: "asc" | "desc"
}
```

## Search Storage Pattern

### Recommended pattern: denormalized search projection table

Add a new table, for example `voter_search_documents`, keyed by `voter_id`, with its own `campaign_id` for RLS and index locality.

Suggested contents:

| Column | Purpose |
|--------|---------|
| `voter_id` | One row per voter |
| `campaign_id` | RLS and query scoping |
| `document` (`tsvector`) | Weighted full-text document |
| `search_text` (`text`) | Flattened text for trigram / substring matching |
| `name_text` (`text`) | Name-specific lookup and exact/prefix boosts |
| `phone_text` (`text`) | Normalized joined phone digits |
| `email_text` (`text`) | Joined emails if included |
| `updated_at` | Operational visibility |

### Why a projection table instead of only columns on `voters`

- Cross-field lookup wants data from `voters` plus related contact tables.
- Generated columns on `voters` are good for same-row data, but do not solve phone/email joins cleanly.
- A projection table keeps search-specific write logic and indexes isolated from the canonical voter model.
- It makes rebuild/backfill possible without risking voter CRUD semantics.

### Recommended indexed search strategy

Use a **hybrid** query:

1. Full-text search for broad cross-field retrieval and stemming.
2. Trigram similarity for typo tolerance and partial-name recovery.
3. Explicit boosts for exact and prefix matches.

Suggested PostgreSQL primitives:

- `document @@ websearch_to_tsquery('english', :query)` for forgiving raw user input.
- `ts_rank_cd(document, tsquery, 32)` for relevance ranking.
- `pg_trgm` similarity / word similarity against `name_text`, `search_text`, and normalized phone fragments.
- GIN index on `document`.
- GIN trigram indexes on `name_text` and `search_text`.

### Recommended rank formula

Treat ranking as a deterministic composite score, not a single opaque function:

```text
score =
  exact_name_boost +
  prefix_name_boost +
  phone_exact_boost +
  source_id_exact_boost +
  (ts_rank_cd * fts_weight) +
  (greatest(name_similarity, search_similarity) * trigram_weight)
```

Recommended ordering:

1. Exact identifier / phone matches
2. Exact full-name matches
3. Prefix name matches
4. Strong FTS matches
5. Trigram fallback matches
6. Stable tiebreakers: `last_name`, `first_name`, `id`

This is more explainable to users and easier to tune than pure `ts_rank_cd`.

## Data Flow

### Read path: voter page lookup

```text
User types query
    ↓
Debounced route/page state updates
    ↓
TanStack Query posts { filters, lookup, cursor, sort_by }
    ↓
FastAPI endpoint validates request and sets campaign-scoped DB context
    ↓
VoterSearchService builds:
  - base campaign scope
  - deterministic filter predicates
  - ranked lookup candidate CTE
    ↓
PostgreSQL returns voters + optional score/match metadata
    ↓
API serializes results
    ↓
DataTable renders ranked voters; filters remain active as refinements
```

### Write path: maintaining the search projection

```text
Voter/contact/import write completes
    ↓
Refresh search document for affected voter_ids
    ↓
Projection row recomputed from voters + phones/emails
    ↓
Indexes updated transactionally
```

### Batch/import path

Do not rebuild the projection one voter at a time during large imports if it materially slows ingestion. Add a bulk refresh helper for imported voter IDs per committed batch, so the import pipeline preserves its current bounded-commit model.

## API and Query Contract Changes

### Recommended request contract

- Keep `filters` exactly as the deterministic refinement layer.
- Add `lookup.query` as the free-text entry point.
- Add `"relevance"` as a first-class sort mode.
- When `lookup.query` is present and no explicit sort is supplied, default to `relevance desc`.

### Recommended response additions

Return optional metadata alongside each voter:

| Field | Purpose |
|------|---------|
| `search_score` | Debuggable relevance score |
| `match_reason` | Short explanation such as `exact_name`, `phone`, `address`, `typo_name` |

This is useful for UI trust and for test assertions, even if the first UI version does not display it prominently.

### Pagination change

The current cursor scheme assumes a single physical sort column. Relevance search needs a separate cursor format, based on the relevance tuple. Keep cursor pagination, but branch the encoding when `sort_by == "relevance"`:

```text
cursor = score|match_bucket|last_name|first_name|id
```

The backend should reject reusing a relevance cursor with a different query.

## Recommended Project Structure

```text
app/
├── api/v1/voters.py                  # extend search endpoint contract
├── models/
│   ├── voter.py                      # existing canonical voter
│   └── voter_search_document.py      # new search projection model
├── schemas/
│   ├── voter_filter.py               # stable filters
│   └── voter_search.py               # new lookup request/response metadata
├── services/
│   ├── voter.py                      # existing deterministic query builder
│   └── voter_search.py               # hybrid lookup planner + ranking
└── db/ or utils/                     # normalization helpers if needed

web/src/
├── hooks/useVoters.ts                # extend request typing
├── routes/campaigns/$campaignId/voters/index.tsx
│                                     # search-first page state + relevance UX
├── components/voters/                # search input / result affordances
└── types/voter.ts                    # request and response metadata
```

### Structure rationale

- `services/voter.py` should remain the home of stable voter CRUD and filter logic.
- `services/voter_search.py` should own ranking and lookup-specific SQL so filter logic does not become unreadable.
- A separate schema module helps prevent accidental reuse of fuzzy lookup fields in dynamic list storage.

## Architectural Patterns

### Pattern 1: Hybrid candidate retrieval

**What:** build a candidate set from full-text matches and trigram matches, union them, then rank once.

**When to use:** default voter-page lookup and add-to-list lookup.

**Trade-offs:** slightly more SQL complexity, but much better recall than FTS-only and much better precision than trigram-only.

**Example:**

```sql
WITH q AS (
  SELECT websearch_to_tsquery('english', :query) AS tsq
),
candidates AS (
  SELECT d.voter_id
  FROM voter_search_documents d, q
  WHERE d.campaign_id = :campaign_id
    AND d.document @@ q.tsq
  UNION
  SELECT d.voter_id
  FROM voter_search_documents d
  WHERE d.campaign_id = :campaign_id
    AND d.name_text % :query
)
SELECT ...
```

### Pattern 2: Projection-table refresh on write

**What:** keep search state denormalized and refresh it whenever canonical voter or contact data changes.

**When to use:** any write path that touches searchable fields.

**Trade-offs:** extra write work, but dramatically simpler and faster reads.

### Pattern 3: Search-first plus filter refinement

**What:** lookup query narrows the universe first; filter builder remains optional refinement.

**When to use:** voter page default experience.

**Trade-offs:** users get faster lookup, but UI must clearly distinguish free-text lookup from structured filters.

## Anti-Patterns

### Anti-Pattern 1: Reusing `filters.search` for fuzzy global lookup

**What people do:** replace the current name `ILIKE` with a huge fuzzy cross-field query inside `VoterFilter.search`.

**Why it’s wrong:** dynamic lists and stored filters inherit unstable fuzzy semantics, and the shared query builder becomes unmaintainable.

**Do this instead:** keep `VoterFilter` deterministic and add a separate lookup object / service.

### Anti-Pattern 2: Joining phones/emails directly into every lookup query

**What people do:** build one giant live join from `voters` to contacts for every search request.

**Why it’s wrong:** ranking queries become expensive, duplicates are easy to introduce, and indexes become less effective.

**Do this instead:** query a pre-flattened search projection.

### Anti-Pattern 3: Adding Elasticsearch/OpenSearch immediately

**What people do:** introduce a separate search cluster for typo tolerance.

**Why it’s wrong:** this milestone’s requirements are well within PostgreSQL capability, and an external search system adds indexing lag, ops overhead, and multi-tenant consistency risk.

**Do this instead:** use PostgreSQL FTS + `pg_trgm` first. Revisit only if later requirements include facets, multilingual analyzers, or cross-campaign global search.

## Integration Points

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| voter page → voter search API | HTTP JSON | Preserve existing endpoint path; extend body |
| voter API → search service | direct function call | New ranked path only when `lookup.query` present |
| search service → existing filter builder | direct call / composed predicates | Filters remain reusable |
| voter/contact writes → search projection refresh | direct service call | Must happen for CRUD and import writes |
| import pipeline → projection bulk refresh | direct service call | Refresh affected voter IDs per committed batch |
| dynamic lists → filter builder only | direct call | Do not use fuzzy lookup contract in stored lists |

### External services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL full-text search | native SQL functions | `websearch_to_tsquery`, `ts_rank_cd`, weighted `tsvector` |
| PostgreSQL trigram | extension + indexes | `pg_trgm` supports similarity and indexed `LIKE`/`ILIKE` |

## New vs Modified Pieces

### New

- `voter_search_documents` table and model
- `pg_trgm` extension migration
- search-specific indexes
- `VoterSearchService`
- lookup request/response schema types
- relevance cursor encoder/decoder

### Modified

- voter search endpoint
- voter/contact/import write paths
- voter page route state and hook payload
- Add Voters dialog search behavior
- tests for search ranking, typo tolerance, and tenant isolation

## Suggested Build Order

1. **Define the contract boundary**
   - Add `lookup` to the request schema.
   - Add `relevance` sort mode and response metadata.
   - Keep `VoterFilter` deterministic.

2. **Add database primitives**
   - Enable `pg_trgm`.
   - Create `voter_search_documents`.
   - Add RLS policy and indexes.
   - Backfill from existing voter/contact data.

3. **Implement backend read path**
   - Create `VoterSearchService`.
   - Compose deterministic filters with ranked lookup.
   - Add relevance cursor pagination.

4. **Implement backend write-path sync**
   - Refresh projection on voter CRUD.
   - Refresh projection on phone/email changes.
   - Add bulk refresh hook for import batches.

5. **Switch the voter page to search-first**
   - Add free-text input.
   - Default to relevance sort when query exists.
   - Keep filter panel as optional refinement.

6. **Expand to secondary consumers**
   - Update Add Voters dialog.
   - Decide whether other list/member pickers should opt in.

7. **Tune and verify**
   - Add ranking tests.
   - Add typo-tolerance tests.
   - Add EXPLAIN-based performance checks on representative campaign sizes.
   - Add RLS coverage for the new search table.

## Scaling Considerations

| Scale | Architecture Adjustment |
|-------|--------------------------|
| 0-100k voters per campaign | PostgreSQL-only hybrid search is enough |
| 100k-1M voters per campaign | Tune weights, keep projection table lean, verify index selectivity |
| 1M+ voters per campaign or multi-region search pressure | Consider partitioning by `campaign_id` or a dedicated search system only if PostgreSQL tuning is exhausted |

### What breaks first

1. **Read performance on poorly indexed fuzzy queries**
   - Fix with projection indexes and candidate-set narrowing.

2. **Projection freshness during heavy imports**
   - Fix with batch refresh strategy and explicit rebuild tooling.

## Sources

- Local codebase: `app/services/voter.py`, `app/api/v1/voters.py`, `app/schemas/voter_filter.py`, `web/src/routes/campaigns/$campaignId/voters/index.tsx`, `web/src/components/voters/AddVotersDialog.tsx`
- PostgreSQL full-text search docs: https://www.postgresql.org/docs/current/textsearch-controls.html
- PostgreSQL full-text indexing docs: https://www.postgresql.org/docs/current/textsearch-tables.html
- PostgreSQL trigram docs: https://www.postgresql.org/docs/current/pgtrgm.html

---
*Architecture research for: voter-page free-text search and lookup*
*Researched: 2026-04-06*
