# Phase 86 Research

## Current State

- Phase 85 adds a document-style search surface containing names, contacts, addresses, ZIPs,
  and source identifiers.
- `POST /voters/search` already composes lookup and structured filters in one request body.

## Recommended Scope

1. Filter lookup through the search surface rather than raw voter-name matching.
2. Order by rank bucket plus a stable penalty/cursor contract.
3. Add targeted unit coverage proving the search contract references the search surface.

## Risks

- Ranking semantics need to stay stable enough for cursor pagination.
- Campaign isolation still needs a DB-backed integration pass in this environment.
