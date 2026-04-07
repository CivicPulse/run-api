# Phase 87 Context

## Goal

Make the voter page feel search-first with clearer async states and more identifying row context.

## Inputs

- `.planning/ROADMAP.md` Phase 87 requirements and success criteria
- `.planning/REQUIREMENTS.md` `LOOK-06`, `INT-01`, `INT-02`
- `web/src/routes/campaigns/$campaignId/voters/index.tsx`
- `web/src/hooks/useVoters.ts`
- `web/src/hooks/useVoterContacts.ts`

## Decisions

- Keep the voter page centered on one prominent lookup input above filters.
- Preserve previous query data during refetches while showing explicit searching/no-match states.
- Add row-level context under the voter name so similar names are easier to distinguish.
