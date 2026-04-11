---
phase: 109-map-rendering-asset-pipeline
plan: 04
plan_id: 109-04
subsystem: web/canvassing/map/tests
tags: [testing, regression-guard, leaflet, MAP-01, TEST-01, TEST-02]
requires: [109-02, 109-03]
provides: [voterIcon-consumer-contract, leafletIcons-integration-guards]
affects:
  - web/src/components/canvassing/map/VoterMarkerLayer.test.tsx
  - web/src/components/canvassing/map/leafletIcons.test.ts
tech_stack:
  added: []
  patterns:
    - top-level-vi-mock-for-marker-prop-capture
    - identity-compare-icon-references
key_files:
  created: []
  modified:
    - web/src/components/canvassing/map/VoterMarkerLayer.test.tsx
    - web/src/components/canvassing/map/leafletIcons.test.ts
decisions:
  - "Replaced setupLeafletMocks() helper with a top-level capturing react-leaflet mock in VoterMarkerLayer.test.tsx (same pattern as CanvassingMap.test.tsx from 108-03)."
  - "Identity comparison (toBe) is used for voterIcon instead of deep-equality — the contract is literally 'same reference as the module export'."
  - "Cross-factory asset equality (voterIcon.iconUrl === volunteerIcon.iconUrl) is the tightest lock on asset consolidation."
metrics:
  tasks_completed: 2
  tests_added: 5
  duration_minutes: ~5
  completed_date: 2026-04-11
---

# Phase 109 Plan 04: Map Test Coverage Summary

Unit/integration tests now lock the MAP-01 fix at both the consumer layer (VoterMarkerLayer) and the module-integration layer (leafletIcons) — any future refactor that reintroduces a local icon definition or a remote CDN URL will fail CI before it lands.

## What Changed

### VoterMarkerLayer.test.tsx — 3 new tests (TEST-01)

The file previously contained only `it.todo` placeholders using `setupLeafletMocks()`. It now has a top-level `vi.mock("react-leaflet", ...)` that captures every `<Marker>` prop set into a module-level array, mirroring the pattern established by `CanvassingMap.test.tsx` in 108-03.

New tests:

1. **`renders one Marker per valid voter with voterIcon`** — Renders with three fixtures (two valid coords, one null-latitude). Asserts exactly two markers captured, each with `icon === voterIcon` (identity), and positions match the fixtures' `[latitude, longitude]` tuples.
2. **`voterIcon bundles a non-unpkg asset (MAP-01 regression guard)`** — Asserts `voterIcon.options.iconUrl` is a truthy string and does not match `/unpkg\.com/`.
3. **`renders nothing when every voter has null coords`** — Asserts zero captured markers and zero `[data-testid="mock-marker"]` elements in the container.

### leafletIcons.test.ts — 2 new integration-style tests (TEST-02)

Extends the 8 factory tests added by 109-02 with cross-factory regression guards:

1. **`every icon's asset paths come from bundled modules (no remote URLs)`** — Collects `iconUrl`, `iconRetinaUrl`, `shadowUrl` from `voterIcon` and `volunteerIcon`, plus every `src="..."` and `srcset="..."` URL extracted from the `householdIcon` and `activeHouseholdIcon` HTML. Asserts none match `/^https?:\/\//`, `/^\/\//`, `/unpkg\.com/`, or `/cdn\./`.
2. **`voterIcon and volunteerIcon share the same bundled marker-icon asset URL`** — Asserts identity of the bundled `iconUrl` between the two `L.Icon` factories, locking asset consolidation.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | ada93d5 | test(109-04): lock VoterMarkerLayer voterIcon consumer contract (MAP-01, TEST-01) |
| 2 | 3e63446 | test(109-04): integration-level regression guards for leafletIcons module (TEST-02) |

## Verification

```
cd web && npx vitest run \
  src/components/canvassing/map/VoterMarkerLayer.test.tsx \
  src/components/canvassing/map/leafletIcons.test.ts
```

Result: **13 passed** (3 in VoterMarkerLayer.test.tsx, 10 in leafletIcons.test.ts). No failures, no skips.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture helper leaked null coords into defaults**

- **Found during:** Task 1, first vitest run.
- **Issue:** Initial `makeVoter` used `overrides.latitude ?? 32.84`, so `latitude: null` in a fixture silently became `32.84` via nullish coalescing. This broke both the null-filter test and the all-null test (captured 3 markers instead of 0).
- **Fix:** Switched to `"latitude" in overrides ? (overrides.latitude as number | null) : 32.84` so an explicitly-passed `null` survives.
- **Files modified:** `web/src/components/canvassing/map/VoterMarkerLayer.test.tsx`
- **Commit:** Folded into `ada93d5` (fix happened during the RED→GREEN iteration inside Task 1; no separate commit).

No other deviations. No auth gates, no architectural changes, no out-of-scope items.

## Success Criteria Check

- [x] VoterMarkerLayer render path has a test asserting `capturedProps.icon === voterIcon` (identity).
- [x] Regression-guard test in VoterMarkerLayer.test.tsx asserts `voterIcon.options.iconUrl` does not match `/unpkg/`.
- [x] leafletIcons.test.ts has a cross-factory asset-path test (shared bundled URL).
- [x] All vitest runs green (13/13).
- [x] Commits follow `test(109-04):` prefix.

## Self-Check: PASSED

- `web/src/components/canvassing/map/VoterMarkerLayer.test.tsx` — FOUND (105 lines)
- `web/src/components/canvassing/map/leafletIcons.test.ts` — FOUND (145 lines)
- Commit `ada93d5` — FOUND
- Commit `3e63446` — FOUND
