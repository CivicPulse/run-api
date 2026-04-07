# Pitfalls Research

**Domain:** Adding free-text voter lookup to an existing multi-tenant voter CRM
**Researched:** 2026-04-06
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Search Surface Bypasses Tenant Isolation

**What goes wrong:**
Teams add a denormalized search table, materialized view, or background-indexed document and assume the existing voter-table RLS protections still apply. Search starts returning records, snippets, or counts from the wrong campaign because the new search surface is not protected the same way as the primary tables.

**Why it happens:**
This codebase already had to harden transaction-scoped RLS because pool reuse caused cross-campaign leakage. Retrofitting search creates a second path to the same data, and it is easy to secure the API endpoint while forgetting to secure the underlying projection, refresh job, or backfill query.

**How to avoid:**
- Keep tenant scoping in the database path, not only in application code.
- If search stays inside PostgreSQL, ensure every search query still runs under the same campaign-scoped DB session used elsewhere.
- If you introduce a projection table or materialized search document, include `campaign_id` in the primary key/index strategy and enforce RLS or equivalent isolation on that object too.
- Add explicit cross-tenant tests for search hits, hit counts, ranked ordering, and typo-tolerant matches.
- Treat reindex/backfill jobs as security-sensitive code: they must preserve campaign boundaries end to end.

**Warning signs:**
- Search passes normal happy-path tests but has no dedicated isolation tests.
- Search documents or helper tables are keyed only by `voter_id` or text fields, not by `campaign_id`.
- Engineers describe tenant safety as “the endpoint already filters by campaign.”
- Ranking/debug output includes records from other campaigns in staging logs or explain samples.

**Phase to address:**
Search architecture and data-model phase, before any relevance or UI work.

---

### Pitfall 2: Naive `%term%` Expansion Across Many Fields

**What goes wrong:**
The existing name-only `ILIKE '%q%'` search gets expanded to many voter columns and contact joins. On real voter-file volumes this turns into sequential scans, duplicate rows, huge sort costs, and unpredictable latency under production traffic.

**Why it happens:**
Substring search feels like the smallest possible change. It works on a small campaign and demo data, so teams keep bolting on more `OR ... ILIKE '%q%'` clauses instead of designing a real search surface with indexes and field weighting.

**How to avoid:**
- Do not scale the current concatenated-name `ILIKE` pattern into a general lookup engine.
- Build an explicit search strategy: exact-match branch for high-signal identifiers, trigram for typo tolerance, and weighted full-text or normalized field matching for broader lookup.
- Index the exact expressions you query. If you normalize with `lower()` or `unaccent()`, index that normalized expression.
- Profile with representative campaign sizes and ugly queries, not only “John Smith”.
- Keep joins out of the hot search path where possible; search against a precomputed projection instead of fan-out joining phones, emails, tags, and addresses on every keystroke.

**Warning signs:**
- `EXPLAIN ANALYZE` shows seq scans or wide bitmap heap scans on `voters`.
- Search latency rises sharply when adding phone/email/address fields.
- Result rows duplicate the same voter because of one-to-many joins.
- Engineers are adding more `%...%` clauses but no new index or projection design.

**Phase to address:**
Search indexing and query-design phase.

---

### Pitfall 3: Denormalized Search Data Goes Stale

**What goes wrong:**
Cross-field lookup appears to work, but new phone numbers, edited emails, updated mailing addresses, merges, tag changes, or imports do not show up in search immediately or ever. Users lose trust because the record exists on the detail page but cannot be found from the main voter page.

**Why it happens:**
Useful lookup fields in this app live across multiple tables. PostgreSQL generated columns cannot use subqueries or reference other rows, so teams cannot solve this cleanly with a single computed column on `voters`. They often ship a trigger or async sync job that updates only some change paths.

**How to avoid:**
- Decide upfront which fields are in the search document and who owns synchronization.
- Prefer one explicit projection mechanism over scattered “also update search text here” code.
- Cover every mutation path: voter CRUD, contact CRUD, import upserts, dedupe/merge flows, tag membership changes if tags are searchable.
- Add drift detection: sample records and compare canonical data to the search projection.
- Expose freshness expectations in the product. If updates are async, make that delay intentional and bounded.

**Warning signs:**
- Search projection updates are spread across several services or event handlers.
- Backfills fix missing results temporarily.
- Support issues say “editing the voter fixed the search result.”
- Import-created phones or emails exist in relational tables but are absent from search results.

**Phase to address:**
Search data-model and synchronization phase, alongside import/update integration.

---

### Pitfall 4: Ranking Is Not Stable Enough for Pagination

**What goes wrong:**
Results look reasonable on page 1 but become inconsistent across refreshes and pagination. The same voter moves between pages, duplicates appear, or likely matches vanish because cursor pagination was designed around deterministic column sorting, not a relevance score that can tie or change as the query changes.

**Why it happens:**
The existing endpoint uses cursor pagination with explicit sortable columns and an `id` tiebreaker. Search ranking introduces computed scores, exact-match boosts, and join-derived signals that are easy to order by informally but hard to paginate deterministically.

**How to avoid:**
- Define a ranking contract before implementation: exact ID/phone/email matches first, then strong name+location matches, then fuzzy candidates.
- Use a deterministic sort key such as `(relevance_score, exactness_bucket, stable secondary fields, id)`.
- Add pagination tests for repeated queries, ties, inserts during browsing, and mixed exact/fuzzy result sets.
- Keep a separate search sort mode from the existing generic table sort modes if necessary.
- Log top-N ranking features during rollout so bad boosts are diagnosable.

**Warning signs:**
- Cursor encoding/decoding has no plan for a computed relevance score.
- PM feedback is “the right voter is somewhere in the list, but not near the top.”
- QA sees duplicate voters across pages or different ordering after a refresh.
- Engineers say “we’ll just sort by similarity desc.”

**Phase to address:**
Relevance design and API contract phase before frontend rollout.

---

### Pitfall 5: Typo Tolerance Is Too Loose for Civic Data

**What goes wrong:**
Typo tolerance helps with names but pollutes results for short tokens, ZIP codes, apartment numbers, house numbers, precincts, and party abbreviations. Users searching `Ann`, `GA`, `303`, or `D` get noisy matches that outrank the intended voter.

**Why it happens:**
Trigram and fuzzy matching are powerful, but civic data contains many short, code-like fields that should not be fuzzified the same way as names. Teams often apply one threshold globally instead of using field-specific rules.

**How to avoid:**
- Separate fields into fuzzy-safe and exact-first categories.
- Apply typo tolerance mainly to person-name and free-text-like fields, not every tokenized field.
- Introduce minimum query-length rules before fuzzy matching engages.
- Use exact-match boosts for phone suffixes, voter file IDs, ZIPs, precincts, and email prefixes when those are searchable.
- Validate ranking against real query sets from support, organizers, and imports.

**Warning signs:**
- One similarity threshold governs every field.
- Very short queries return large noisy candidate sets.
- Users start adding more characters than necessary to “fight” the search.
- Exact phone/ZIP/ID lookups lose to fuzzy name matches.

**Phase to address:**
Relevance tuning and query-parsing phase.

---

### Pitfall 6: Search-First UI Causes Request Storms and Stale Results

**What goes wrong:**
Moving to a search-first voter page increases request volume dramatically. Every keystroke triggers POST `/voters/search`, users hit the existing 30/minute search rate limit, and slower responses race newer ones, causing the UI to briefly show outdated results.

**Why it happens:**
The current app already rate-limits the search endpoint, and the React query hook fires directly from the request body. Retrofitting a live-search UX without debounce, cancellation, and stale-response protection turns a backend feature into a frontend reliability problem.

**How to avoid:**
- Debounce user input before issuing search requests.
- Cancel or ignore stale in-flight requests when the query changes.
- Require a minimum input length before fuzzy search; optionally use exact-only behavior for 1-2 characters.
- Distinguish “search still loading” from “no results”.
- Revisit search endpoint rate limits after measuring real interactive behavior, not batch API behavior alone.

**Warning signs:**
- Typing quickly produces flicker or result reordering.
- Search UIs show intermittent 429s in testing.
- Network logs show one request per keystroke with no cancellation.
- Users report “I erased the query but old results stayed for a second.”

**Phase to address:**
Frontend interaction and API hardening phase.

---

### Pitfall 7: Search and Structured Filters Drift Apart

**What goes wrong:**
The product promises “search first, filters refine after lookup,” but the free-text query and structured filters are implemented in different ways. The same voter appears when filtered but not when searched, or combining a search term with filters yields surprising exclusions because the logic model is unclear.

**Why it happens:**
This system already has a mature composable filter builder with AND/OR semantics. Teams often bolt on search as an extra clause without redefining how free-text should interact with filters, sorts, chips, saved dynamic lists, and empty states.

**How to avoid:**
- Define combination semantics explicitly: free-text narrows within filter results, not a parallel query path.
- Decide whether free-text participates in saved searches/dynamic lists or remains an ephemeral UI-only lookup layer.
- Keep one backend contract for all voter-page retrieval, even if the ranking logic is specialized.
- Add tests for combined search+filters, chip clearing, pagination reset, and sort changes.

**Warning signs:**
- Product copy says “search first” but implementation still treats search as just another table filter.
- Clearing the search box does not restore the prior filtered set cleanly.
- Saved or shareable views behave differently depending on whether search was used.
- Engineers debate whether search should obey `logic="OR"` with structured filters.

**Phase to address:**
Product semantics and endpoint-contract phase.

---

### Pitfall 8: Production Rollout Ignores Index Build and Import Side Effects

**What goes wrong:**
The search design is correct, but rollout degrades the live system. Index creation blocks writes, GIN pending lists bloat under imports/updates, backfills compete with user traffic, and search freshness regresses during heavy voter-file loads.

**Why it happens:**
This is an existing production app with import workflows and ongoing writes. Teams focus on query correctness and forget that adding trigram/GIN-heavy search surfaces changes write amplification and deployment risk.

**How to avoid:**
- Build large indexes concurrently in production.
- Schedule search backfills and projection rebuilds as operational events with monitoring, not hidden migration side effects.
- Test imports and bulk updates with the new indexes enabled.
- Decide whether search freshness is synchronous or eventually consistent during imports, and document that behavior.
- Capture p95/p99 latency for both search reads and import writes before and after rollout.

**Warning signs:**
- Migration plan says “add index” with no concurrency or rollout note.
- Import throughput drops after enabling search indexes.
- CPU and I/O spike during backfill while ordinary voter edits slow down.
- Search results are freshest on newly edited rows but lag after bulk imports.

**Phase to address:**
Migration, rollout, and operational hardening phase.

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep extending `ILIKE '%q%'` with more `OR` clauses | Fastest first demo | Poor latency, poor ranking, fragile SQL, no typo control | Never for production-scale voter lookup |
| Maintain search text in application code across many services | No schema redesign upfront | Drift, missed update paths, hard debugging | Only for a very short-lived spike |
| Use one global fuzzy threshold for every field | Simple implementation | Terrible precision on short civic codes and identifiers | Never |
| Reuse generic table sort/pagination for relevance | Less API work | Duplicates, unstable pages, impossible ranking guarantees | Only if search stays exact-only |
| Backfill search projection in an ordinary migration step | One deploy artifact | Long locks, rollout risk, hard rollback | Never on production-sized datasets |

## Integration Gotchas

Common mistakes when connecting to existing system components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| RLS campaign scoping | Assuming endpoint-level `campaign_id` filtering is sufficient | Keep tenant isolation on every search object and query path, including projections and refresh jobs |
| Voter contacts tables | Joining phones/emails live into every search query | Precompute searchable contact fields into a projection or dedicated search document |
| Import pipeline | Updating search only for direct voter edits, not import-created contacts/upserts | Include import upsert paths in search sync ownership and tests |
| TanStack Query UI | Firing a network request on every keystroke | Debounce, cancel stale requests, and gate fuzzy search on query length |
| Existing cursor API | Adding `ORDER BY similarity()` without redesigning cursor semantics | Introduce deterministic relevance sort keys and dedicated tests |
| Dynamic lists / saved filters | Letting ephemeral free-text leak into saved filter semantics accidentally | Decide explicitly whether free-text is persistable; keep contracts separate if not |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `%term%` search over many columns | p95 search latency climbs, seq scans, high CPU | Use indexed normalized expressions and a real search projection | Often at tens of thousands of voters per campaign |
| One-to-many joins in hot search path | Duplicate voters, expensive DISTINCT, unstable ranking | Search a denormalized document keyed by voter | As soon as phone/email fan-out becomes common |
| Fuzzy matching on 1-2 character queries | Huge candidate sets, noisy rankings | Minimum query length and exact-only mode for short queries | Immediately in interactive UI |
| Heavy GIN/trigram indexing without write testing | Import throughput drops, VACUUM pressure rises | Benchmark imports and updates with final index set enabled | During large voter-file loads |
| Production index creation without concurrency planning | Writes stall during deployment | Use `CREATE INDEX CONCURRENTLY` and staged rollout | On any live campaign with active writes |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Securing only the API endpoint, not the search projection | Cross-campaign voter disclosure | Apply tenant isolation to every search storage layer and refresh path |
| Logging raw search strings with matched personal data for ranking debug | PII exposure in logs and observability tools | Redact or sample safely; avoid logging query plus matched voter payloads together |
| Making typo-tolerant search too broad on voter identifiers | Easier enumeration of sensitive records inside a campaign | Keep exact-first handling for IDs, phones, emails, and code-like fields |
| Returning total-hit counts cheaply via unsafe side queries | Side-channel leakage across campaigns or filters | Compute counts inside the same tenant-scoped query path or omit them |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Search returns “kind of close” results above exact known matches | Users stop trusting lookup and revert to filters | Hard-boost exact email, phone, voter ID, and full-name matches |
| No indication of why a result matched | Users cannot tell whether search found the right person | Highlight or label match reason at least for exact and strong-field matches |
| Search wipes out current filter context invisibly | Users think records disappeared | Make search-plus-filter state explicit and easy to clear independently |
| Empty state treats “still typing” as “no voters found” | Users over-correct queries and blame data quality | Use clear loading, debounced searching, and “keep typing” guidance for short queries |

## "Looks Done But Isn't" Checklist

- [ ] **Cross-field lookup:** Often missing contact-table updates and import paths — verify edited and imported phones/emails become searchable.
- [ ] **Typo tolerance:** Often missing field-specific guardrails — verify short ZIP/precinct/party-like queries stay precise.
- [ ] **Ranking:** Often missing deterministic tie-breakers — verify repeated queries return the same page boundaries.
- [ ] **Search-first UI:** Often missing debounce/cancellation — verify fast typing does not trigger stale results or 429s.
- [ ] **Tenant safety:** Often missing projection-level isolation tests — verify typo-tolerant and ranked search never leaks cross-campaign hits.
- [ ] **Rollout:** Often missing operational plan — verify index creation, backfill, and imports are tested against production-scale data.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tenant leakage through search surface | HIGH | Disable new search path, revoke/rotate any exported debug data, fix isolation at storage/query layer, rerun cross-tenant verification |
| Stale search projection | MEDIUM | Rebuild projection from canonical tables, add drift checks, patch missing mutation hooks, communicate freshness expectations |
| Bad ranking / unstable pagination | MEDIUM | Freeze current boosting, add deterministic secondary sort, capture real query samples, retune against labeled examples |
| Request storms / 429s | LOW | Add debounce and cancellation, lower eager-query behavior, adjust rate limits after measurement, ship a guarded short-query mode |
| Import slowdown after index rollout | MEDIUM | Pause nonessential backfills, tune index strategy, rebuild concurrently if needed, benchmark import path before re-enabling |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Search surface bypasses tenant isolation | Search architecture and data model | Cross-campaign integration tests for exact, fuzzy, ranked, and counted search |
| Naive `%term%` expansion across many fields | Search indexing and query design | `EXPLAIN ANALYZE` on representative datasets shows indexed plan and bounded latency |
| Denormalized search data goes stale | Search data sync and import integration | Edit/import/contact CRUD tests prove search freshness or documented async lag |
| Ranking is not stable enough for pagination | Relevance design and API contract | Repeated-query pagination tests show deterministic order and no duplicates |
| Typo tolerance is too loose | Relevance tuning and query parsing | Labeled query set shows exact known lookups beat fuzzy candidates |
| Search-first UI causes request storms | Frontend interaction and API hardening | Browser/network tests show debounce, stale-request suppression, and no 429s under normal typing |
| Search and structured filters drift apart | Product semantics and endpoint contract | Combined search+filter tests match documented behavior and chip/reset UX |
| Rollout ignores index/import side effects | Migration, rollout, and operational hardening | Staging rehearsal covers concurrent index builds, backfill, import throughput, and rollback |

## Sources

- Project context: [.planning/PROJECT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/PROJECT.md)
- Existing search implementation: [app/services/voter.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/voter.py)
- Existing filter/search contract: [app/schemas/voter_filter.py](/home/kwhatcher/projects/civicpulse/run-api/app/schemas/voter_filter.py)
- Existing rate-limit expectations: [docs/production-testing-runbook.md](/home/kwhatcher/projects/civicpulse/run-api/docs/production-testing-runbook.md)
- Existing search endpoint stress test: [web/e2e/cross-cutting.spec.ts](/home/kwhatcher/projects/civicpulse/run-api/web/e2e/cross-cutting.spec.ts)
- Existing frontend search hook: [web/src/hooks/useVoters.ts](/home/kwhatcher/projects/civicpulse/run-api/web/src/hooks/useVoters.ts)
- PostgreSQL generated column restrictions: https://www.postgresql.org/docs/current/ddl-generated-columns.html
- PostgreSQL text search controls and ranking: https://www.postgresql.org/docs/current/textsearch-controls.html
- PostgreSQL text search tables and indexes: https://www.postgresql.org/docs/current/textsearch-tables.html
- PostgreSQL `pg_trgm` similarity, thresholds, and index support: https://www.postgresql.org/docs/current/pgtrgm.html
- PostgreSQL `unaccent` extension: https://www.postgresql.org/docs/current/unaccent.html
- PostgreSQL `CREATE INDEX`, including `CONCURRENTLY` and GIN storage parameters: https://www.postgresql.org/docs/current/sql-createindex.html
- RLS planner/search interaction discussion: https://jfagoagas.github.io/blog/posts/psql-rls-ts/ (MEDIUM confidence)

---
*Pitfalls research for: voter-page free-text search and lookup retrofit in a multi-tenant voter CRM*
*Researched: 2026-04-06*
