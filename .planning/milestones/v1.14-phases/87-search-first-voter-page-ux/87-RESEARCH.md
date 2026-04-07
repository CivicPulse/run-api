# Phase 87 Research

## Current State

- Phase 84 added the first voter-page lookup input.
- The route already owns pagination, sorting, filters, and the top-level query body.
- TanStack Query can preserve previous data and cancel stale requests through the query `signal`.

## Recommended Scope

1. Keep previous data during refetches and pass abort `signal` into the search request.
2. Surface searching, no-match, and result-count states distinct from the initial empty state.
3. Add secondary row context under the voter name.
