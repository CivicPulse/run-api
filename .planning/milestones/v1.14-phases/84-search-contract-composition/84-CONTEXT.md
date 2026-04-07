# Phase 84 Context

## Goal

Add free-text lookup to the existing voter search flow without breaking filter composition,
cursor pagination, or the current voter-page browse experience.

## Why This Phase Exists

The repo already has a composable `POST /voters/search` flow and a rich advanced filter
builder, but the main voter page still exposes only structured filtering. Milestone v1.14
starts by making lookup a first-class part of the current flow while keeping the contract
safe for later phases that will expand freshness, ranking, and UX polish.

## Inputs

- `.planning/ROADMAP.md` Phase 84 requirements and success criteria
- `.planning/REQUIREMENTS.md` `LOOK-01`, `LOOK-05`, `SRCH-01`, `SRCH-03`, `INT-03`
- `app/api/v1/voters.py`
- `app/services/voter.py`
- `app/schemas/voter_filter.py`
- `web/src/routes/campaigns/$campaignId/voters/index.tsx`
- `web/src/hooks/useVoters.ts`
- `tests/unit/test_voter_search.py`
- `tests/unit/test_api_voters.py`
- `web/src/routes/campaigns/$campaignId/voters/index.test.tsx`

## Requirements

- LOOK-01: Add a free-text lookup entry point on the voter page without requiring the filter builder first.
- LOOK-05: Free-text lookup and structured filters must refine one result set together.
- SRCH-01: Keep lookup inside the existing voter search contract rather than creating a separate flow.
- SRCH-03: Query + filter pagination must stay stable across pages with no duplicate/disappearing rows.
- INT-03: Clearing the lookup term must return the user cleanly to the prior browse/filter state.

## Constraints

- Do not jump ahead to Phase 85 or 86 by introducing cross-field search infrastructure, freshness indexing, or typo-tolerant ranking.
- Preserve current campaign scoping and existing deterministic filters.
- Keep the frontend wired to the current `useVoterSearch` hook and `POST /voters/search` API.
- Treat ranking in this phase as a lightweight contract for the current name-based lookup only.

## Phase Decisions

- Free-text lookup stays in `filters.search` on the existing `VoterSearchBody`.
- The voter page gets a dedicated lookup input separate from the advanced filter builder.
- Search pagination uses an explicit cursor contract for default lookup ordering so later ranking work can evolve without breaking page traversal.
- Clearing lookup resets only the free-text term and pagination state; structured filters remain intact.
