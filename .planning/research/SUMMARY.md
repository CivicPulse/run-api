# Project Research Summary

**Project:** CivicPulse Run API
**Domain:** Multi-tenant voter CRM free-text lookup and ranked search
**Researched:** 2026-04-06
**Confidence:** HIGH

## Executive Summary

This milestone is not a greenfield search product. It is a lookup upgrade inside an existing FastAPI/PostgreSQL voter CRM where campaign-scoped isolation, deterministic filters, and operational trust matter more than novelty. The research consistently points to a PostgreSQL-native search design: keep the current monolith, extend the existing voter search endpoint, and add ranked free-text lookup across names, contact fields, addresses, ZIP/city, and stable IDs without introducing Elasticsearch, Meilisearch, or Python-side fuzzy matching.

The recommended approach is to keep structured filters deterministic and separate from fuzzy lookup semantics. Experts would implement this as a hybrid search layer backed by PostgreSQL `pg_trgm`, `unaccent`, weighted full-text search, and a denormalized per-voter search projection that flattens voter plus contact data into an indexed, campaign-scoped search surface. The UI should become search-first on the voter page, but only after the API contract, projection sync, relevance cursoring, and RLS protections are in place.

The main risks are not feature gaps; they are trust failures. The highest-risk failures are cross-campaign leakage through a new search surface, stale denormalized search data, naive `%term%` expansion that collapses under real voter-file size, and unstable relevance pagination. Mitigation is straightforward but must be front-loaded: secure the projection table with campaign-aware isolation, define a deterministic ranking contract, refresh the projection on every relevant write/import path, and verify with representative query plans plus end-to-end search/filter interaction tests.

## Key Findings

### Recommended Stack

The stack recommendation is conservative on purpose. PostgreSQL 17 already covers typo tolerance, partial matching, ranking, and exact-match boosting while preserving the existing RLS model and async SQLAlchemy service layer. No new backend or frontend package is required for the core milestone; the work is mostly schema design, query design, sync ownership, and UI contract changes.

**Core technologies:**
- PostgreSQL 17.x: primary search engine using `pg_trgm`, `unaccent`, full-text search, and GIN/GiST indexes — keeps search inside the existing tenant-safe database model.
- SQLAlchemy 2.0.48+: builds PostgreSQL-native ranking and search expressions from the current async service layer — avoids adding a search abstraction library.
- FastAPI 0.135.1+: exposes ranked lookup through the existing voter search endpoint — no framework shift needed.
- Alembic 1.18.4+: rolls out extensions, projection table, and indexes safely — required for controlled schema evolution.
- TanStack Query 5.90.21 + `ky`: supports debounced search-first UX in the current web app — enough for request cancellation, caching, and stale-request handling.

### Expected Features

The launch bar is clear: users expect one-box, campaign-scoped lookup that can find a voter from partial known information and rank likely matches first. The differentiators are not flashy AI search features; they are mixed-token cross-field matching and query-aware ranking that reflect organizer intent without breaking trust.

**Must have (table stakes):**
- One-box lookup across name, phone, email, address fragments, city/ZIP, and stable identifiers.
- Partial matching on high-intent fields with normalized phone/email/address handling.
- Deterministic ranking that boosts exact identifier and exact-name hits above fuzzy candidates.
- Typo tolerance limited mainly to names and address text.
- Search-first plus existing filter refinement in one result set.
- Result rows with enough context to disambiguate duplicate names.

**Should have (competitive):**
- Mixed-token cross-field matching such as `maria 30309` or `smith 1212`.
- Query-aware ranking that treats emails, phone-like queries, and ZIP-like queries differently from names.
- Search-to-filter handoff with a removable query chip.
- Keyboard-first lookup flow once ranking is stable.

**Defer (v2+):**
- Saved/recent searches and ranking controls.
- Alias handling beyond straightforward normalization.
- Semantic or AI-assisted search.

### Architecture Approach

The architecture recommendation is explicit: keep `VoterFilter` deterministic, add a separate `lookup` contract for fuzzy search semantics, and implement ranked lookup in a dedicated `VoterSearchService` backed by a denormalized `voter_search_documents` table. That projection should store a weighted `tsvector`, flattened search text, and normalized phone/email/name fields keyed by `voter_id` and `campaign_id`, with RLS-aligned isolation and dedicated relevance cursoring. This isolates lookup complexity from stable list filtering and avoids turning the existing query builder into an unreadable pile of fuzzy OR clauses.

**Major components:**
1. API contract extension on the existing voter search endpoint — accepts `lookup`, `relevance` sorting, and returns match metadata.
2. `VoterSearchService` — builds hybrid FTS + trigram candidate sets, deterministic boosts, and relevance pagination.
3. `voter_search_documents` projection table — precomputes cross-table searchable data with campaign-scoped indexes and sync ownership.
4. Voter/contact/import write-path refresh hooks — keep the projection fresh after edits, upserts, and bulk imports.
5. Search-first voter page and shared hooks — debounce input, preserve filter composition, and surface ranked results predictably.

### Critical Pitfalls

1. **Search surface bypasses tenant isolation** — secure the projection layer itself with campaign-aware storage/query design and dedicated cross-tenant tests, not just endpoint checks.
2. **Naive `%term%` expansion across many fields** — do not scale the current `ILIKE` pattern; use indexed normalized expressions, FTS, trigram, and a precomputed projection.
3. **Denormalized search data goes stale** — define one owner for projection refresh and cover voter CRUD, contact CRUD, imports, and merge-like flows.
4. **Ranking is unstable for pagination** — design a deterministic relevance tuple and a dedicated cursor format before UI rollout.
5. **Search-first UI causes request storms** — debounce, cancel stale requests, gate fuzzy search for very short input, and revisit rate limits with real typing behavior.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Search Contract and Safety Boundary
**Rationale:** This must come first because the biggest failure mode is not low relevance quality; it is leaking fuzzy search semantics into the wrong layers or weakening campaign isolation.
**Delivers:** Separate `lookup` request contract, `relevance` sort mode, response metadata, and explicit semantics for how free-text composes with deterministic filters.
**Addresses:** Search-first plus filter refinement, deterministic ranking expectations, disambiguation context.
**Avoids:** Tenant-isolation bypass, search/filter semantic drift, unstable pagination contracts.

### Phase 2: Search Projection and Database Primitives
**Rationale:** Ranked lookup across voter plus contact fields is not credible without an indexed projection and database-native search primitives.
**Delivers:** `pg_trgm` and `unaccent`, `voter_search_documents`, campaign-scoped indexes/RLS, and backfill/rebuild tooling.
**Uses:** PostgreSQL 17, Alembic, SQLAlchemy PostgreSQL functions.
**Implements:** Denormalized search storage, exact/prefix/fuzzy-safe field normalization.
**Avoids:** Naive multi-join `%term%` search, stale data ownership confusion, production-only performance collapse.

### Phase 3: Ranked Backend Read/Write Path
**Rationale:** Once the projection exists, the backend can safely implement the actual lookup planner and keep it fresh.
**Delivers:** `VoterSearchService`, hybrid FTS + trigram candidate retrieval, deterministic score formula, relevance cursoring, and projection refresh hooks for voter/contact/import updates.
**Addresses:** One-box cross-field lookup, partial matching, typo tolerance, exact-match boosting.
**Avoids:** Duplicate rows from live joins, unstable ranking, freshness drift after imports or edits.

### Phase 4: Search-First Voter Page UX
**Rationale:** The UI should land after the backend contract and ranking behavior are stable enough to support interactive use.
**Delivers:** Search box on the voter page, debounce/cancellation, default relevance sort when a query exists, result-row disambiguation, and preserved filter refinement flow.
**Uses:** TanStack Query, existing `ky` hooks, current voter page route/data table patterns.
**Implements:** Search-first plus filter refinement, clear loading/empty states, optional query chip behavior.
**Avoids:** Request storms, stale-result flicker, confusing state resets, user mistrust from opaque matches.

### Phase 5: Secondary Consumers, Tuning, and Rollout Hardening
**Rationale:** Reuse and tuning should happen only after the primary voter page proves stable.
**Delivers:** Add Voters dialog adoption, EXPLAIN-based tuning, import/write throughput verification, staged backfill/index rollout, and production monitoring for relevance and freshness.
**Addresses:** Secondary lookup surfaces, query-aware ranking tuning, operational readiness.
**Avoids:** Rollout regressions, import slowdowns, hidden freshness lag, support-only discovery of bad ranking.

### Phase Ordering Rationale

- The order follows hard dependencies: contract and semantics first, storage/indexing second, lookup implementation third, interactive UX fourth, reuse and tuning last.
- The grouping matches the architecture pattern from research: deterministic filters remain stable while lookup-specific complexity is isolated behind a new service and projection table.
- This order front-loads the highest-risk pitfalls: tenant isolation, projection freshness, query-plan performance, and relevance pagination all get solved before the search-first UI increases traffic.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** projection-table design and RLS policy details need careful validation against the current schema and import/write paths.
- **Phase 3:** relevance cursor encoding and deterministic score tuning need implementation-level design review before coding.
- **Phase 5:** rollout strategy needs operational validation for concurrent index builds, backfill sequencing, and import throughput.

Phases with standard patterns (skip research-phase):
- **Phase 1:** API contract split between deterministic filters and lookup is already strongly supported by the research and current architecture.
- **Phase 4:** frontend debounce, stale-request suppression, and query-driven relevance sort are standard patterns in the current React Query stack.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strongly grounded in current repo state plus official PostgreSQL and SQLAlchemy documentation; recommendation is conservative and low-novelty. |
| Features | HIGH | Table stakes and differentiators align across campaign CRM examples and the stated milestone scope; low ambiguity about launch requirements. |
| Architecture | HIGH | Fits existing seams in the codebase and uses well-understood PostgreSQL patterns; the main choices are opinionated but defensible. |
| Pitfalls | HIGH | Risks are concrete, domain-specific, and consistent with this repo’s known RLS/history and the operational realities of indexed search. |

**Overall confidence:** HIGH

### Gaps to Address

- **Projection contents:** Final searchable field list needs a deliberate cut so write amplification stays acceptable while user value stays high.
- **Ranking weights:** Exact boost thresholds and trigram/FTS weights should be tuned against representative real campaign queries, not guessed once.
- **Freshness model during imports:** Planning must decide whether projection refresh is synchronous per batch or intentionally delayed with explicit rebuild tooling.
- **Persistability of free-text search:** The roadmap should decide whether `lookup` is strictly ephemeral UI state or can ever participate in saved views/list definitions.

## Sources

### Primary (HIGH confidence)
- [STACK.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/STACK.md) — stack and version recommendations grounded in repo state and official PostgreSQL/SQLAlchemy docs.
- [FEATURES.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/FEATURES.md) — table stakes, differentiators, and anti-features for voter CRM lookup.
- [ARCHITECTURE.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/ARCHITECTURE.md) — component boundaries, data flow, projection-table pattern, and build order.
- [PITFALLS.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/PITFALLS.md) — domain-specific failure modes, operational warnings, and verification targets.
- [PROJECT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/PROJECT.md) — milestone scope, constraints, and current product context.
- PostgreSQL `pg_trgm` docs: https://www.postgresql.org/docs/17/pgtrgm.html
- PostgreSQL `unaccent` docs: https://www.postgresql.org/docs/17/unaccent.html
- PostgreSQL text search controls: https://www.postgresql.org/docs/17/textsearch-controls.html
- PostgreSQL text search tables/indexes: https://www.postgresql.org/docs/current/textsearch-tables.html
- SQLAlchemy PostgreSQL dialect docs: https://docs.sqlalchemy.org/en/20/dialects/postgresql.html

### Secondary (MEDIUM confidence)
- NationBuilder quick search docs: https://support.nationbuilder.com/en/articles/2306501-find-people-and-pages-with-quick-search
- NationBuilder filters docs: https://support.nationbuilder.com/en/articles/3055676-use-filters-to-target-your-audience
- The Official Vanual (VAN training guide PDF): https://www.deldems.org/sites/default/files/2024-04/The%20Official%20Vanual.pdf
- Algolia typo tolerance docs: https://www.algolia.com/doc/guides/managing-results/optimize-search-results/typo-tolerance
- Typesense search API docs: https://typesense.org/docs/29.0/api/search.html

### Tertiary (LOW confidence)
- RLS planner/search interaction discussion: https://jfagoagas.github.io/blog/posts/psql-rls-ts/ — useful cautionary context, but not required for the core recommendation.

---
*Research completed: 2026-04-06*
*Ready for roadmap: yes*
