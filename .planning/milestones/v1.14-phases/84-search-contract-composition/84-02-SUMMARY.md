# 84-02 Summary

## Completed

- `web/src/routes/campaigns/$campaignId/voters/index.tsx` now exposes a dedicated voter lookup input above the advanced filter builder.
- Lookup stays inside the existing `VoterSearchBody` flow by writing the debounced query into `filters.search`.
- Clearing lookup now resets only the free-text term and pagination state while preserving the user’s structured filters.

## Verification

- `npm --prefix web test -- --run 'src/routes/campaigns/$campaignId/voters/index.test.tsx'` ✅
