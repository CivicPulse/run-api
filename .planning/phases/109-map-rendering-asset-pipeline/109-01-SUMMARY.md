---
phase: 109-map-rendering-asset-pipeline
plan: 01
plan_id: 109-01
subsystem: web/maps
tags: [maps, leaflet, assets, audit, MAP-03]
requirements: [MAP-03]
dependency_graph:
  requires: []
  provides:
    - "109-ASSET-AUDIT.md Open Issues list (consumed by Plan 109-02)"
  affects:
    - web/src/components/canvassing/map/VoterMarkerLayer.tsx
    - web/src/components/field/CanvassingMap.tsx
    - web/src/components/canvassing/map/MapProvider.tsx
tech-stack:
  added: []
  patterns:
    - "Asset-pipeline audit table with Dev/Preview/Production columns"
    - "Preview-as-production-proxy justification"
key-files:
  created:
    - .planning/phases/109-map-rendering-asset-pipeline/109-ASSET-AUDIT.md
  modified: []
decisions:
  - "Used `preview` as a proxy for the production Docker image build — Vite's `build` step is identical, so asset resolution is equivalent."
  - "Recommend `bundle-es-import` over `copy-to-public` for the VoterMarkerLayer fix to keep a single source of truth pinned to the installed Leaflet version."
metrics:
  duration: "~10 minutes"
  completed: "2026-04-11"
  tasks: 2
  files_created: 1
---

# Phase 109 Plan 01: Map Asset Pipeline Audit Summary

**One-liner:** MAP-03 audit cataloguing every Leaflet asset reference in
the frontend and flagging the `voterIcon` unpkg CDN URLs as the sole
hard failure cluster blocking MAP-01.

## What shipped

- **`109-ASSET-AUDIT.md`** — 13-row catalog of every Leaflet asset site
  across `VoterMarkerLayer.tsx`, `CanvassingMap.tsx`, and
  `MapProvider.tsx`, with Dev/Preview/Production resolution status and
  an Open Issues section ready for Plan 109-02 consumption.

## Headline findings

1. **7 of 7 `public-static` references pass** in all environments —
   `CanvassingMap.tsx` `volunteerIcon`, `householdIcon`, and
   `activeHouseholdIcon` all reference `/leaflet/marker-*.png`, which
   exist at `web/public/leaflet/` (verified via `ls`).
2. **3 `remote-cdn` references fail the audit** — `VoterMarkerLayer.tsx`
   hard-codes `https://unpkg.com/leaflet@1.9.4/dist/images/marker-*.png`
   for its `voterIcon`. Works when unpkg is reachable, but is the MAP-01
   root cause for voter-marker rendering on offline / restricted
   networks and is fragile against CDN outages, CSP, and proxies.
3. **1 `es-import`** — `leaflet/dist/leaflet.css` in `MapProvider.tsx`.
   Vite rewrites the transitively-referenced marker URLs inside
   Leaflet's own CSS during build, so this passes in all environments.
4. **2 `tile-template` URLs** (OSM + ArcGIS World Imagery) in
   `MapProvider.tsx` — acknowledged as always-remote and out of scope.
5. **No app-side CSS `url(.*marker|.*leaflet)` references** — the only
   CSS-side marker URLs in the app come from Leaflet's own stylesheet.
6. **No other `L.Icon` / `L.DivIcon` construction sites** exist in
   `web/src/`. The walk list map and volunteer hub map referenced in
   109-CONTEXT.md do not yet instantiate their own icons.

## Open Issues (handed to Plan 109-02)

| # | File | Issue | Fix category |
| - | ---- | ----- | ------------ |
| 1 | `web/src/components/canvassing/map/VoterMarkerLayer.tsx` (lines 7–16) | `voterIcon` uses 3 remote unpkg CDN URLs | `bundle-es-import` (preferred) |
| 2 | `web/public/leaflet/marker-*.png` | Hand-managed copy duplicates `node_modules/leaflet/dist/images/*` and risks drift | `bundle-es-import` (drop `public/leaflet/` after Issue #1 lands) |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- Task 2 automated verify: `test -s ... && grep -q "Open Issues|unpkg|VoterMarkerLayer|CanvassingMap"` → **VERIFY_PASS**.
- File committed with `docs(109-01): map asset pipeline audit (MAP-03)`.

## Self-Check: PASSED

- `109-ASSET-AUDIT.md` exists at the prescribed path (verified post-write).
- Commit `81ee684` exists in `git log --oneline -1`.
- All 8 baseline catalog rows from the plan are present (verified via
  grep for `VoterMarkerLayer`, `CanvassingMap`, `MapProvider`, `unpkg`,
  `STREET_TILES`, `SATELLITE_TILES`).

## Commits

- `81ee684` — `docs(109-01): map asset pipeline audit (MAP-03)`
