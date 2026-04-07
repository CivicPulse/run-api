---
status: awaiting_human_verify
trigger: "canvass-field-distance-sort: walk list doesn't resort by distance from GPS"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Fix applied: useGeolocationWatch hook provides continuous GPS updates
test: TypeScript compiles cleanly, existing canvassing wizard tests pass (5/5)
expecting: Walk list re-sorts automatically as user moves >50m while in distance mode
next_action: Await human verification in real field workflow

## Symptoms

expected: Walk list in field canvassing mode should sort addresses by distance from user's current GPS position
actual: List stays in server-provided order regardless of user location
errors: No errors in browser console or UI
reproduction: Open field canvassing mode with walk list assignment, move around — order never changes
started: Has never worked

## Eliminated

## Evidence

- timestamp: 2026-04-07
  checked: web/src/routes/field/$campaignId/canvassing.tsx - requestDistanceOrder function (lines 301-351)
  found: Uses navigator.geolocation.getCurrentPosition (one-shot) only. Zero calls to watchPosition anywhere in the codebase. Location is captured once when user clicks "Use my location" or "Refresh location" and stored as locationSnapshot in the Zustand store.
  implication: GPS position is never automatically re-captured as the user moves.

- timestamp: 2026-04-07
  checked: web/src/stores/canvassingStore.ts - setLocationState and setSortMode actions
  found: locationSnapshot is set once via setLocationState and persisted in sessionStorage. No mechanism to periodically refresh it. setSortMode guards against distance mode without a snapshot but never triggers a new capture.
  implication: The store correctly holds and persists a snapshot, but nothing feeds it updated positions.

- timestamp: 2026-04-07
  checked: web/src/hooks/useCanvassingWizard.ts - households useMemo (lines 104-132)
  found: The households memo correctly branches on sortMode, calling orderHouseholdsByDistance(sequenceHouseholds, locationSnapshot) when mode is "distance". It depends on locationSnapshot in its dependency array, so it WOULD re-sort if locationSnapshot changed. But locationSnapshot never changes after initial capture.
  implication: The sorting infrastructure is wired correctly; the missing piece is continuous location updates feeding new snapshots.

- timestamp: 2026-04-07
  checked: web/src/types/canvassing.ts - orderHouseholdsByDistance function (lines 250-273)
  found: Pure function that sorts households by haversine distance from a given origin CoordinatePoint. Works correctly for any origin. No bugs in the math or sorting logic.
  implication: The distance calculation and sorting logic is sound. The problem is upstream - the origin point is stale.

## Resolution

root_cause: The canvassing field UI only captures the user's GPS position once (via navigator.geolocation.getCurrentPosition) when the user manually clicks "Use my location" or "Refresh location". There is no continuous location tracking (no watchPosition call). The locationSnapshot in the Zustand store is set once and never updated automatically. The downstream sorting infrastructure (useCanvassingWizard households memo, orderHouseholdsByDistance) is correctly wired and would re-sort if locationSnapshot changed, but it never does.
fix: Created useGeolocationWatch hook that calls navigator.geolocation.watchPosition when distance sort is active, with a 50-meter movement threshold to avoid excessive re-renders. Wired the hook into canvassing.tsx to feed continuous position updates into the Zustand store. The existing reactive sorting chain (locationSnapshot dependency in useCanvassingWizard households memo) automatically re-sorts when the snapshot updates. Manual "Use my location" / "Refresh location" buttons preserved as instant triggers.
verification: TypeScript compiles cleanly (npx tsc --noEmit), all 5 useCanvassingWizard tests pass. Awaiting human field verification.
files_changed: [web/src/hooks/useGeolocationWatch.ts, web/src/routes/field/$campaignId/canvassing.tsx]
