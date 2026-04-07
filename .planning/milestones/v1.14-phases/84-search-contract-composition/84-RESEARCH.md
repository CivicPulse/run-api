# Phase 84 Research

## Current State

- `web/src/routes/campaigns/$campaignId/voters/index.tsx` already builds a `VoterSearchBody`
  and calls `useVoterSearch`, but the page exposes only the advanced `VoterFilterBuilder`.
- `app/services/voter.py` applies `filters.search` as a simple `ILIKE` on
  `first_name || ' ' || last_name`, then falls back to the generic cursor logic used for
  normal sorting.
- The generic cursor format only stores one sort value plus the voter ID. That is fine for
  deterministic single-column sorts, but it is not enough for stable default lookup ordering
  once search relevance becomes part of the sort key.
- `web/src/components/voters/AddVotersDialog.tsx` already shows a local debounce pattern that
  can be reused for the voter-page lookup input.

## Key Risks

- If Phase 84 adds default lookup ordering without changing the cursor contract, a search with
  many tied rows can page inconsistently.
- If the page stores lookup inside the same state blob as advanced filters, clearing the query
  can accidentally wipe structured filters and violate `INT-03`.
- If this phase tries to solve fuzzy ranking now, it will blur the milestone boundary with
  Phases 85 and 86.

## Recommended Scope

1. Keep the backend search surface name-based for now, but normalize free-text input and define
   a stable default lookup ordering when no explicit user sort is active.
2. Introduce a dedicated voter-page lookup input that still flows through `filters.search`.
3. Add unit and route tests for the new cursor/search contract and clear-search behavior.

## Phase Breakdown

### 84-01
Backend lookup contract and stable pagination cursor for default search ordering.

### 84-02
Voter-page lookup input, clear-search behavior, and active-chip wiring.

### 84-03
Regression coverage for backend cursor behavior and voter-page search state.
