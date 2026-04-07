---
status: resolved
trigger: "canvass-field-distance-sort: walk list doesn't resort by distance from GPS"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T16:15:00Z
resolved: 2026-04-07T16:15:00Z
---

## Resolution

**Root cause (3 layers):**

1. **No continuous GPS tracking** — `getCurrentPosition` (one-shot) meant location never updated after the initial button click. Fixed with `useGeolocationWatch` hook using `watchPosition` with 50m movement threshold.

2. **Pinning defeated the initial sort** — The `households` memo pinned the "current" household to `currentAddressIndex` on every render, preventing distance ordering from having any visible effect when the sort mode changed.

3. **Pinning derived from the wrong array** — `pinnedCurrentHousehold` was computed from `sequenceHouseholds[currentAddressIndex]` (the sequence-order array), so in distance mode at index 0 it always resolved to the first-in-sequence door (1521 1st Ave), not the nearest door. Even after clearing the pin on sort-mode transition, the next render re-derived it from sequence order and put the old door back.

**Fix:** Track the actually-displayed household key in a ref (`pinnedHouseholdKeyRef`). On sort mode change, clear the ref inside the `useMemo` (not in a `useLayoutEffect` which runs too late) so the distance-sorted order takes immediate effect. After the transition settles, record the viewed household for future location updates.

**Files changed:**
- `web/src/hooks/useGeolocationWatch.ts` — new hook (watchPosition with throttle)
- `web/src/routes/field/$campaignId/canvassing.tsx` — wired useGeolocationWatch
- `web/src/hooks/useCanvassingWizard.ts` — replaced sequence-derived pinning with ref-based pinning, removed `getPinnedCurrentHousehold`
- `web/src/hooks/useCanvassingWizard.test.ts` — updated test to verify nearest door jumps to front

**Deployed:** sha-1c5f61d, verified working in production.

## Symptoms

expected: Walk list in field canvassing mode should sort addresses by distance from user's current GPS position
actual: List stays in server-provided order regardless of user location
errors: No errors in browser console or UI
reproduction: Open field canvassing mode with walk list assignment, move around — order never changes
started: Has never worked

## Evidence

- timestamp: 2026-04-07
  checked: web/src/routes/field/$campaignId/canvassing.tsx - requestDistanceOrder function
  found: Uses navigator.geolocation.getCurrentPosition (one-shot) only. Zero calls to watchPosition anywhere.
  implication: GPS position is never automatically re-captured as the user moves.

- timestamp: 2026-04-07
  checked: Production database — voters in walk list b01e9d60 have valid lat/lng (32.84x, -83.64x)
  found: All entries have coordinates; data is not the issue.
  implication: Sorting algorithm has correct inputs; bug is in the React state flow.

- timestamp: 2026-04-07
  checked: useCanvassingWizard.ts — households useMemo pinning logic
  found: pinnedCurrentHousehold derived from sequenceHouseholds[currentAddressIndex] always yields the first-in-sequence household regardless of active sort mode.
  implication: Pinning overrides distance sort on every render after the transition.

- timestamp: 2026-04-07
  checked: React render cycle with sortModeJustChanged flag
  found: useLayoutEffect clears the flag AFTER the memo computes, so the stale pinned key still applies on the transition render.
  implication: Must clear the pin inside the memo itself, not in a post-render effect.
