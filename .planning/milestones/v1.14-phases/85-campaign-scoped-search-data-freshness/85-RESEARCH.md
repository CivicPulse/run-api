# Phase 85 Research

## Current State

- Phase 84 kept lookup name-based and intentionally deferred freshness/indexing work.
- Voter edits commit in `VoterService`, contact edits commit in `VoterContactService`,
  and imports write through `ImportService`.
- The repo already favors PostgreSQL-native patterns over external infrastructure.

## Recommended Scope

1. Add a denormalized `voter_search_records` table with campaign scoping and trigram indexes.
2. Backfill it from current voter/contact data and refresh it from all write paths.
3. Keep freshness synchronous on direct edits and eager during import processing.

## Risks

- Import write paths have many test expectations around SQL execution counts.
- Search freshness without a dedicated surface would force noisy joins into the hot lookup path.
