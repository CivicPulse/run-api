# Feature Research

**Domain:** Voter-page free-text lookup and refinement for campaign CRM workflows
**Researched:** 2026-04-06
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a modern voter CRM lookup flow. Missing these makes the voter page feel slower than paper turf sheets or legacy campaign tools.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-box lookup across core identity fields | VAN Quick Look Up and NationBuilder quick search both center fast person lookup from a single box instead of forcing filter construction first. | MEDIUM | Search should cover voter name, phone, email, street/address fragments, city/ZIP, and stable identifiers already present in imported data. Depends on existing campaign-scoped isolation and voter list API. |
| Partial-match support on high-intent fields | Organizers often only know part of a last name, house number, phone suffix, or email fragment. | MEDIUM | Prefix/substring matching is table stakes for names, address text, email, and phone digits. Should reuse existing normalized contact/address data where possible instead of inventing new UI concepts. |
| Typo tolerance for human-entered fields | Mobile use, volunteer data entry, and street/name misspellings are common. Modern search products treat this as baseline. | MEDIUM | Apply typo tolerance to names and address text, not blindly to numeric identifiers, full phone numbers, or exact IDs. Depends on clear field weighting so fuzzy matches do not outrank exact hits. |
| Deterministic ranking with exact-match boost | Users expect the most likely voter to appear first, especially when the query is a full phone, email, or exact name. | HIGH | Ranking should prefer exact identifier matches, then exact full-name/address matches, then prefix/partial matches, then fuzzy matches. Must stay explainable enough for support/debugging. |
| Search-first plus filter refinement | Existing voter filters already exist; users expect search to narrow the starting set and filters to refine it. | LOW-MEDIUM | Free-text query should compose with current filter behavior, chips, pagination, and sorting instead of replacing them. This is the key dependency for roadmap sequencing. |
| Result rows with enough disambiguation context | Voter databases contain many duplicate names. Users need to distinguish “which Maria Garcia” without opening multiple profiles. | LOW | Each result should show the same identity signals users already trust: age or DOB when available, address, phone/email snippets, tags/lists or recent interaction context if already present in list rows. |
| Stable empty/ambiguous-result behavior | Search often fails because the data is incomplete, not because the voter does not exist. | LOW | Empty states should suggest broadening the query or adding filters, not imply deletion or offer risky cross-campaign fallback. |

### Differentiators (Competitive Advantage)

Features that are valuable but not required to make the milestone successful.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Mixed-token cross-field matching | Lets users find a voter from fragments like `maria 30309`, `smith 1212`, or `john peachtree` without knowing which field is which. | HIGH | Strong differentiator because it turns search into a real lookup workflow, not just “search first_name or last_name.” Depends on weighted matching across existing voter/contact/address fields. |
| Query-aware ranking tuned for organizer intent | Improves trust by ranking phone/email/address exact hits above fuzzy name hits when the query looks like a number, email, or ZIP. | HIGH | This is where the product can beat generic CRM search. Requires token classification and field-specific boosts, but no new user-facing concepts. |
| Search-to-filter handoff | After a lookup, users can keep refining with the existing filter builder without re-entering work. | MEDIUM | Examples: preserve the query while applying tags/lists/contactability filters; show the query as a removable chip next to current filter chips. Depends directly on existing filter state model. |
| Normalized alias handling | Helps with nicknames, punctuation-stripped phones, apartment/unit formatting, and vendor-specific address inconsistencies. | MEDIUM-HIGH | Valuable for real voter-file messiness. Should focus on deterministic normalization already available from imported fields before introducing nickname dictionaries or third-party identity enrichment. |
| Keyboard-first lookup flow | Power users can search, arrow through results, and open voter detail without leaving the keyboard. | LOW-MEDIUM | High usability payoff for call-time and clerk workflows, but not required for the first release. Depends on stable ranking and predictable result ordering. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that sound attractive but are likely to create noise, scope creep, or trust problems for this milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| “Search everything fuzzily” across all fields equally | Sounds simpler: one fuzzy engine over every column. | It produces bad ranking, false positives, and poor performance, especially for numeric IDs, phones, ZIPs, and campaign-import junk fields. | Use field-specific matching modes: exact for IDs, normalized exact/partial for phones and emails, fuzzy mainly for names/address text. |
| AI / semantic / natural-language voter search | Feels modern and promises “smart” lookup. | It is hard to explain, expensive, unnecessary for known-item lookup, and risky for campaign operations where users need deterministic results. | Ship weighted lexical lookup first; revisit semantic helpers only if future user research shows real unmet needs. |
| Replacing advanced filters with search | Search-first can tempt teams to de-prioritize the existing filter builder. | It would regress list-building workflows that need precise targeting, not just known-person lookup. | Keep filters as refinement and bulk-targeting tools; free-text search should narrow the universe, not replace query composition. |
| Cross-campaign or org-wide search expansion | Users may ask to “search everything” when they cannot find a person. | It directly conflicts with campaign-scoped data isolation and creates severe privacy/compliance risk. | Keep search strictly campaign-scoped and improve empty-state guidance about data quality or missing imports. |
| Instant backend search on every keystroke with no controls | Feels fast in demos. | It can create noisy ranking churn and unnecessary backend load on large voter files. | Use debounced typeahead or submit-driven search with request cancellation and stable result sets. |

## Feature Dependencies

```text
Free-text query
    └──requires──> Campaign-scoped voter search endpoint
                         └──requires──> Existing RLS / campaign isolation

Free-text query
    └──composes with──> Existing filter builder
                             └──drives──> Shared chips / pagination / sorting state

Deterministic ranking
    └──requires──> Field normalization + field-specific match modes

Typo tolerance
    └──depends on──> Ranking guardrails
                           └──prevents──> Fuzzy false positives outranking exact matches

Disambiguated result rows
    └──reuses──> Existing voter CRM list/detail context

Cross-campaign search ──conflicts──> Campaign-scoped isolation
Search-only workflow ──conflicts──> Existing advanced targeting/filter workflows
```

### Dependency Notes

- **Free-text query requires the existing campaign-scoped voter search contract:** This milestone should extend the current voter search/list API, not create a second parallel lookup system with different permissions or pagination behavior.
- **Free-text query composes with the existing filter builder:** The highest-value UX is search first, then refine with tags, lists, contactability, geography, or interaction filters already shipped.
- **Deterministic ranking requires field normalization:** Phone digits, email casing, address punctuation, and whitespace normalization must be settled before ranking feels trustworthy.
- **Typo tolerance depends on ranking guardrails:** Fuzzy matches are useful only if exact phone/email/ID and exact-name matches still win.
- **Disambiguated result rows reuse current CRM context:** Existing list/detail flows already expose tags, contact info, and interaction history. Search results should leverage that context instead of inventing a separate voter-preview model.
- **Cross-campaign search conflicts with campaign isolation:** This is a hard product boundary, not a future nice-to-have.
- **Search-only workflows conflict with advanced targeting:** Users still need filters to build universes and operational lists; search should not collapse those capabilities.

## MVP Definition

### Launch With (v1)

- [ ] One-box campaign-scoped voter lookup across name, phone, email, and address fragments — core milestone value
- [ ] Partial matching with normalized phone/email/address handling — necessary for real organizer input quality
- [ ] Deterministic ranking that boosts exact and likely matches first — necessary for trust
- [ ] Typo tolerance limited to names/address text — necessary for usability without flooding results
- [ ] Search + existing filters working together in one result set — required to avoid regressing current voter workflows
- [ ] Result rows with enough identity context to disambiguate duplicate names — required for quick opening of the correct voter

### Add After Validation (v1.x)

- [ ] Mixed-token cross-field ranking improvements — add once baseline search logs show common ambiguous query patterns
- [ ] Query chip integrated with existing filter chips — add once the base composition model is stable
- [ ] Keyboard-first result navigation — add after ranking and result layout are stable
- [ ] Alias/normalization expansions for messy vendor data — add when real miss cases are observed in production

### Future Consideration (v2+)

- [ ] Saved recent searches or suggested lookups — useful only after heavy repeat usage is confirmed
- [ ] Admin-tunable ranking controls — defer until actual campaign needs diverge
- [ ] Semantic/helper search — defer unless lexical search fails real user tasks

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| One-box cross-field lookup | HIGH | MEDIUM | P1 |
| Partial matching on names/phones/emails/addresses | HIGH | MEDIUM | P1 |
| Deterministic ranking with exact-match boost | HIGH | HIGH | P1 |
| Limited typo tolerance | HIGH | MEDIUM | P1 |
| Search + filter composition | HIGH | LOW-MEDIUM | P1 |
| Disambiguated result rows | HIGH | LOW | P1 |
| Mixed-token cross-field matching | HIGH | HIGH | P2 |
| Query-aware ranking by token type | HIGH | HIGH | P2 |
| Keyboard-first lookup flow | MEDIUM | LOW-MEDIUM | P2 |
| Alias handling beyond normalization | MEDIUM | MEDIUM-HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| Fast one-box person lookup | VAN Quick Look Up searches known info like name, phone, address, and VANID. | NationBuilder quick search searches phone, email, first name, last name, and ID with inline dropdown results. | Match the one-box expectation, but tailor fields to voter CRM usage and existing imported voter/contact/address data. |
| Filters vs. quick lookup | VAN separates quick lookup from deeper list creation/filtering. | NationBuilder explicitly directs broader targeting to filters. | Keep the same mental model: search for known-person lookup, filters for refinement and bulk targeting. |
| Partial / contains behavior | Legacy campaign tools commonly support finding a person from partial known info. | NationBuilder explicitly supports contains-style lookup such as email-domain fragments and name fragments. | Support partials where users actually have fragments, especially name, address, email, and phone suffixes. |
| Ranked, typo-tolerant results | Commercial search platforms treat typo tolerance and exact-first ranking as default relevance behavior. | Same. | Use explainable, field-weighted lexical ranking rather than opaque “smart search.” |

## Sources

- PostgreSQL `pg_trgm` docs: https://www.postgresql.org/docs/current/pgtrgm.html
- PostgreSQL text search ranking docs: https://www.postgresql.org/docs/current/textsearch-controls.html
- Typesense search API docs: https://typesense.org/docs/29.0/api/search.html
- Algolia typo tolerance docs, last modified March 12, 2026: https://www.algolia.com/doc/guides/managing-results/optimize-search-results/typo-tolerance
- NationBuilder quick search docs: https://support.nationbuilder.com/en/articles/2306501-find-people-and-pages-with-quick-search
- NationBuilder filters docs: https://support.nationbuilder.com/en/articles/3055676-use-filters-to-target-your-audience
- The Official Vanual (VAN training guide PDF), pages 9-12 and glossary: https://www.deldems.org/sites/default/files/2024-04/The%20Official%20Vanual.pdf

---
*Feature research for: voter-page free-text lookup and refinement*
*Researched: 2026-04-06*
