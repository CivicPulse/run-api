# Requirements: CivicPulse Run API

**Defined:** 2026-04-06
**Core Value:** Any candidate, regardless of party or budget, can run professional-grade field operations — canvassing, phone banking, and volunteer coordination — from a single API.

## v1 Requirements

Requirements for milestone v1.14 Voter Search & Lookup.

### Lookup Experience

- [ ] **LOOK-01**: User can enter a free-text query on the voter page to search the current campaign's voter records without opening the advanced filter builder first.
- [ ] **LOOK-02**: User can find a voter from partial information including name fragments, phone fragments, email fragments, address fragments, city or ZIP, or stable imported identifiers.
- [ ] **LOOK-03**: User sees likely exact matches ranked above weaker partial or fuzzy matches for the same query.
- [ ] **LOOK-04**: User can still find the intended voter when the query contains minor misspellings in names or address text.
- [ ] **LOOK-05**: User can combine a free-text query with the existing structured voter filters and get one refined result set.
- [ ] **LOOK-06**: User can distinguish between duplicate or similar voter names from the result list using enough identifying context in each row.

### Search Contract & Safety

- [ ] **SRCH-01**: User gets free-text lookup results through the existing voter search flow without breaking existing deterministic filter behavior used elsewhere in the product.
- [ ] **SRCH-02**: User only sees search results from the active campaign, including fuzzy and ranked matches.
- [ ] **SRCH-03**: User gets stable relevance-sorted pagination for the same query without duplicate or disappearing voters across pages.
- [ ] **SRCH-04**: User sees search results that reflect voter and contact changes within the milestone's defined freshness boundary after edits and imports.

### Interaction Quality

- [ ] **INT-01**: User can type into the voter-page search box without stale or out-of-order responses replacing the current query's results.
- [ ] **INT-02**: User gets clear loading, empty, and no-match states that distinguish between "still searching" and "nothing matched".
- [ ] **INT-03**: User can clear the free-text query and return cleanly to the prior voter-page browsing and filtering state.

### Verification & Operational Trust

- [ ] **TRST-01**: User gets voter-page lookup performance that remains acceptable on production-scale campaign datasets.
- [ ] **TRST-02**: User lookup behavior is covered by automated tests for ranking, typo tolerance, search-plus-filter composition, and campaign isolation.

## v2 Requirements

Deferred beyond milestone v1.14.

### Search Enhancements

- **NEXT-01**: User can navigate voter search results with a keyboard-first interaction model.
- **NEXT-02**: User can reuse the same ranked lookup experience consistently in secondary surfaces such as add-to-list dialogs.
- **NEXT-03**: User can see or use saved recent searches.
- **NEXT-04**: User benefits from ranking tuned with broader alias and normalization rules beyond the initial milestone.

## Out of Scope

Explicitly excluded from milestone v1.14.

| Feature | Reason |
|---------|--------|
| Cross-campaign or org-wide voter lookup | Conflicts with campaign-scoped data isolation and privacy expectations |
| Replacing the advanced filter builder with free-text search | Filters remain necessary for precise targeting and saved audience workflows |
| AI, semantic, or natural-language search | Adds cost and opacity without solving the core lookup problem |
| New external search infrastructure such as Elasticsearch, Meilisearch, or Typesense | PostgreSQL-native search is sufficient and lower risk for this milestone |
| Blanket fuzzy matching across every field equally | Produces weak ranking and noisy results for civic data |
| Persisting fuzzy lookup semantics into dynamic voter lists by default | Dynamic lists need deterministic, explainable filter behavior |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOOK-01 | Unmapped | Pending |
| LOOK-02 | Unmapped | Pending |
| LOOK-03 | Unmapped | Pending |
| LOOK-04 | Unmapped | Pending |
| LOOK-05 | Unmapped | Pending |
| LOOK-06 | Unmapped | Pending |
| SRCH-01 | Unmapped | Pending |
| SRCH-02 | Unmapped | Pending |
| SRCH-03 | Unmapped | Pending |
| SRCH-04 | Unmapped | Pending |
| INT-01 | Unmapped | Pending |
| INT-02 | Unmapped | Pending |
| INT-03 | Unmapped | Pending |
| TRST-01 | Unmapped | Pending |
| TRST-02 | Unmapped | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after milestone v1.14 definition*
