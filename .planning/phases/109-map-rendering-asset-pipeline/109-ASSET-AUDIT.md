# 109 Map Asset Audit (MAP-03)

**Phase:** 109-map-rendering-asset-pipeline
**Plan:** 109-01
**Date:** 2026-04-11
**Scope:** MAP-03 deliverable — every Leaflet-related asset (icon image,
sprite, CSS image, tile URL) catalogued with its resolution status under
`npm run dev`, `npm run build && npm run preview`, and the production
Docker image build.

This document is the single source of truth for Leaflet asset resolution
in the CivicPulse Run web app. Plan 109-02 (marker icon fixes) consumes
the Open Issues section verbatim — every entry there becomes a task in
that plan.

---

## Method

### Greps run (Task 1)

Seven deterministic greps over `web/src/` and `web/public/` via the Grep
tool (ripgrep):

1. `new L\.Icon|new L\.DivIcon|L\.icon\(|L\.divIcon\(` over
   `web/src/**/*.{ts,tsx}` — every icon construction site.
2. `iconUrl|iconRetinaUrl|shadowUrl` over `web/src/**/*.{ts,tsx}` —
   every asset path inside icon constructors.
3. `leaflet/dist/leaflet\.css|leaflet\.css` over `web/**` — CSS imports
   that pull in Leaflet marker sprite URLs.
4. `url\(.*marker|url\(.*leaflet` over `web/**` — CSS-side asset
   references.
5. `TileLayer|tileLayer\(|tile\.openstreetmap|arcgisonline|mapbox|maptiler`
   over `web/src/**/*.{ts,tsx}` — tile layer URL templates.
6. `ls web/public/leaflet/` — bundled static assets served by Vite's
   `public/` directory.
7. `unpkg\.com|cdn\.jsdelivr|cdnjs` over `web/src/**/*.{ts,tsx}` —
   remote/CDN asset references (known fragile pattern).

### Classification scheme

Each hit is classified by import style:

| Style           | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| `es-import`     | `import icon from "…"` — Vite fingerprints and bundles. Always safe.                         |
| `public-static` | `/leaflet/foo.png` served from `web/public/`. Works only if the file exists in `public/`.    |
| `css-url`       | `url(…)` inside a CSS file imported by `leaflet/dist/leaflet.css`. Vite rewrites if bundled. |
| `remote-cdn`    | `https://unpkg.com/...` — fragile (offline break, rate limits, CDN outage).                  |
| `tile-template` | Tile layer URL with `{z}/{x}/{y}` placeholders. Always remote, expected.                     |

### Verification protocol

- **Dev (`npm run dev`):** Load the affected routes
  (`/field/{campaignId}/canvassing`, any route rendering
  `VoterMarkerLayer`), open DevTools Network tab, filter on
  `marker-icon|marker-shadow|tile`, record which URLs return 200 vs
  404 / network error. Also check Console for broken-image warnings.
- **Preview (`npm run build && npm run preview`):** Repeat the same
  DevTools pass against the built bundle. Document how Vite
  fingerprinted each bundled asset (hashed filename) vs served untouched
  (`public/`).
- **Production:** Inspect the `web/` production Docker image build.
  Confirm `web/dist/` contains the expected hashed asset files. Because
  spinning up the production image just to screenshot one map view is
  out of scope for this audit, **`preview` is used as a proxy for
  production** — Vite's `build` step is identical between `preview` and
  the production Docker image, so asset resolution behavior is
  equivalent. Preview results are cited in the Production column unless
  explicitly stated otherwise.

### What the "Dev / Preview / Production" columns mean

- `OK` — asset resolves with HTTP 200 and no console warning.
- `CDN` — asset resolves only because a public CDN (unpkg) is reachable.
  Not a real PASS: flagged in Open Issues regardless of the 200.
- `REMOTE` — tile template. Always remote; out of scope for this audit.

---

## Asset Catalog

| # | File                                                       | Line | Asset path                                                                                 | Import style    | Dev | Preview | Production | Notes                                                                  |
| - | ---------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ | --------------- | --- | ------- | ---------- | ---------------------------------------------------------------------- |
| 1 | `web/src/components/field/CanvassingMap.tsx`               | 21   | `/leaflet/marker-icon.png`                                                                 | `public-static` | OK  | OK      | OK         | `volunteerIcon.iconUrl`. File exists at `web/public/leaflet/marker-icon.png`.      |
| 2 | `web/src/components/field/CanvassingMap.tsx`               | 22   | `/leaflet/marker-icon-2x.png`                                                              | `public-static` | OK  | OK      | OK         | `volunteerIcon.iconRetinaUrl`. File exists at `web/public/leaflet/marker-icon-2x.png`. |
| 3 | `web/src/components/field/CanvassingMap.tsx`               | 23   | `/leaflet/marker-shadow.png`                                                               | `public-static` | OK  | OK      | OK         | `volunteerIcon.shadowUrl`. File exists at `web/public/leaflet/marker-shadow.png`.  |
| 4 | `web/src/components/field/CanvassingMap.tsx`               | 35   | `/leaflet/marker-icon.png` (inline `<img src>`)                                            | `public-static` | OK  | OK      | OK         | `householdIcon` L.DivIcon HTML — 1x src.                               |
| 5 | `web/src/components/field/CanvassingMap.tsx`               | 35   | `/leaflet/marker-icon-2x.png` (inline `<img srcset>`)                                      | `public-static` | OK  | OK      | OK         | `householdIcon` L.DivIcon HTML — 2x srcset.                            |
| 6 | `web/src/components/field/CanvassingMap.tsx`               | 43   | `/leaflet/marker-icon.png` (inline `<img src>`)                                            | `public-static` | OK  | OK      | OK         | `activeHouseholdIcon` L.DivIcon HTML — 1x src.                         |
| 7 | `web/src/components/field/CanvassingMap.tsx`               | 43   | `/leaflet/marker-icon-2x.png` (inline `<img srcset>`)                                      | `public-static` | OK  | OK      | OK         | `activeHouseholdIcon` L.DivIcon HTML — 2x srcset.                      |
| 8 | `web/src/components/canvassing/map/VoterMarkerLayer.tsx`   | 8    | `https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png`                              | `remote-cdn`    | CDN | CDN     | CDN        | `voterIcon.iconUrl`. **FRAGILE** — Open Issue #1.                      |
| 9 | `web/src/components/canvassing/map/VoterMarkerLayer.tsx`   | 10   | `https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png`                           | `remote-cdn`    | CDN | CDN     | CDN        | `voterIcon.iconRetinaUrl`. **FRAGILE** — Open Issue #1.                |
| 10 | `web/src/components/canvassing/map/VoterMarkerLayer.tsx`  | 11   | `https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png`                            | `remote-cdn`    | CDN | CDN     | CDN        | `voterIcon.shadowUrl`. **FRAGILE** — Open Issue #1.                    |
| 11 | `web/src/components/canvassing/map/MapProvider.tsx`       | 3    | `leaflet/dist/leaflet.css` (bare import → pulls Leaflet's own CSS marker URLs transitively) | `es-import`     | OK  | OK      | OK         | Vite rewrites any `url(...)` inside the CSS to hashed asset imports during build. No CSS `url(.*marker)` hits found in app CSS, so no app-side overrides. |
| 12 | `web/src/components/canvassing/map/MapProvider.tsx`       | 6    | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`                                       | `tile-template` | REMOTE | REMOTE | REMOTE | `STREET_TILES`. Out of scope — see Out-of-scope section.               |
| 13 | `web/src/components/canvassing/map/MapProvider.tsx`       | 10   | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | `tile-template` | REMOTE | REMOTE | REMOTE | `SATELLITE_TILES`. Out of scope — see Out-of-scope section.        |

### Static files present in `web/public/leaflet/`

- `marker-icon.png` (1466 bytes)
- `marker-icon-2x.png` (2464 bytes)
- `marker-shadow.png` (618 bytes)

All three public-static references (rows 1–7) resolve because these files
are present and Vite serves `web/public/` at the site root. During
`vite build`, files in `public/` are copied verbatim to `dist/` without
hashing — so Preview and Production behavior is identical to Dev.

### Negative findings

- `url\(.*marker|url\(.*leaflet` over `web/**` — **no matches in app
  CSS.** `web/src/index.css` references `.leaflet-marker-icon` and
  `.canvassing-map-household-marker` class selectors only (lines 249,
  253, 266, 275), never a `url(...)` pointing to a marker asset. This
  means the only CSS-side marker URLs come from Leaflet's own
  `leaflet.css`, which Vite rewrites correctly.
- `unpkg\.com|cdn\.jsdelivr|cdnjs` over `web/src/**` — **only 3 matches,
  all in `VoterMarkerLayer.tsx`** (rows 8–10). No other remote CDN asset
  references exist.
- No other `L.Icon` / `L.DivIcon` construction sites exist in
  `web/src/`. Walk list map and volunteer hub map (referenced in
  `109-CONTEXT.md`) do not yet instantiate their own icons — they rely
  on `CanvassingMap.tsx` or have not been built.

---

## Open Issues

Plan 109-02 will consume this list verbatim.

### Issue #1 — `voterIcon` uses remote unpkg CDN URLs (MAP-01 blocker) — **RESOLVED**

**Status:** RESOLVED by plan 109-02 (commits `4604920` feat +
`6f2a175` fix). All four marker factories now live in
`web/src/components/canvassing/map/leafletIcons.ts` using Vite
ES-module imports of `leaflet/dist/images/marker-*.png`. Vite inlines
the marker PNGs as `data:image/png;base64,...` data URIs at build time
(verified in `dist/assets/leafletIcons-*.js` after `npx vite build`),
so every marker renders with zero network requests and zero CDN
dependency. `VoterMarkerLayer.tsx` imports `voterIcon` from the shared
module, and `CanvassingMap.tsx` imports `volunteerIcon`,
`householdIcon`, `activeHouseholdIcon` from the same module. No
`unpkg.com` references remain in `web/src/` production code.

<details>
<summary>Original finding (for history)</summary>


- **File:** `web/src/components/canvassing/map/VoterMarkerLayer.tsx`
- **Lines:** 7–16
- **Asset paths:**
  - `https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png`
  - `https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png`
  - `https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png`
- **Import style:** `remote-cdn`
- **Failure mode:** Works only when unpkg.com is reachable. Fails on:
  - Offline or restricted networks (field volunteers without cell
    coverage).
  - unpkg rate limiting / outages.
  - Strict CSP policies that block third-party images.
  - Enterprise proxies that block unpkg.
- **Proposed fix category:** `bundle-es-import` (preferred) — convert
  to:
  ```typescript
  import markerIcon from "leaflet/dist/images/marker-icon.png"
  import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
  import markerShadow from "leaflet/dist/images/marker-shadow.png"
  ```
  so Vite fingerprints and bundles the assets. Alternative: `copy-to-public`
  (reuse `web/public/leaflet/marker-*.png` — already present — by
  switching the URLs to `/leaflet/marker-icon.png` etc., matching
  `CanvassingMap.tsx` rows 1–3).
- **Recommended path:** `bundle-es-import`. It gives cache-friendly
  fingerprinted URLs and avoids a second source of truth with the
  `public/leaflet/` copy.
- **Priority:** High — this is the root MAP-01 finding for
  VoterMarkerLayer. While the CDN currently returns 200, every audit
  environment depends on network reachability of a third-party host, so
  the column status `CDN` is not a pass.

</details>

### Issue #2 — Two copies of the same marker PNGs risk drift — **PARTIALLY RESOLVED**

**Status:** PARTIALLY RESOLVED by plan 109-02. After the fix,
`VoterMarkerLayer.tsx` and `CanvassingMap.tsx` both use bundled
`leaflet/dist/images/*` via `leafletIcons.ts`, so the production code
no longer reads from `web/public/leaflet/`. The hand-managed
`web/public/leaflet/marker-*.png` copies still exist on disk and are
still copied to `dist/leaflet/` by Vite, but nothing in `web/src/`
references them anymore. Deleting the `public/leaflet/` directory is a
trivial follow-up that can land in any subsequent plan without risk.

<details>
<summary>Original finding (for history)</summary>


- **Files:** `web/public/leaflet/marker-icon*.png` vs. Leaflet's own
  `node_modules/leaflet/dist/images/marker-icon*.png` (transitively
  referenced by `leaflet/dist/leaflet.css` row 11).
- **Failure mode:** Currently benign. If Leaflet ships a marker-sprite
  refresh in a minor version, `public/leaflet/` will drift from the
  `node_modules` copy because `public/` is a hand-managed copy. Future
  contributors may not realize there are two copies.
- **Proposed fix category:** `bundle-es-import` (preferred) — drop
  `web/public/leaflet/` entirely once Issue #1 is fixed and every caller
  uses the ES-import path. Leaves a single source of truth pinned to the
  installed Leaflet version.
- **Priority:** Medium. Only relevant after Issue #1 is resolved, but
  worth tracking now so Plan 109-02 can close it in the same change.

</details>

---

## Out-of-scope / Acknowledged

- **Tile layer templates** (rows 12–13) — OSM and ArcGIS World Imagery
  URLs. Tile templates are always remote by definition. They are
  acknowledged, not an audit failure.
- **Offline tile caching** — deferred to Phase 110 (`OFFLINE-01`). Not
  this phase's problem.
- **Production Docker image runtime verification** — Preview is used as
  a proxy, per the Method section. A runtime Docker verification would
  duplicate Vite's `build` step (identical code path) and yield no new
  information.
- **New marker styles / map performance / new map features** — out of
  scope per `109-CONTEXT.md` phase boundary.

---

## Summary

- 13 asset references catalogued across 3 files.
- 7 of 7 public-static references resolve in all environments.
- 1 CSS es-import (Leaflet's own) resolves in all environments.
- 2 tile templates are acknowledged as always-remote.
- **3 remote-CDN references** (all in `VoterMarkerLayer.tsx`) are the
  single failure cluster. Plan 109-02 will convert them to
  `bundle-es-import` and remove the fragile unpkg dependency.
- Issue #2 (duplicate `public/leaflet/` copies) is a latent drift risk
  that should be closed once Issue #1 lands.
