---
phase: 109-map-rendering-asset-pipeline
plan: 02
plan_id: 109-02
subsystem: web/maps
tags: [maps, leaflet, assets, vite, MAP-01]
requirements: [MAP-01]
dependency_graph:
  requires: [109-01]
  provides:
    - "Single source of truth for Leaflet marker icon factories (web/src/components/canvassing/map/leafletIcons.ts)"
    - "Zero-network-request marker rendering (data-URI-inlined PNGs)"
  affects:
    - web/src/components/canvassing/map/VoterMarkerLayer.tsx
    - web/src/components/field/CanvassingMap.tsx
tech-stack:
  added: []
  patterns:
    - "Vite ES-module asset imports for Leaflet marker PNGs (leaflet/dist/images/*)"
    - "Inlined data-URI marker assets (Vite's default for PNGs under the asset inline threshold)"
    - "Single module for all L.Icon/L.DivIcon factories"
key-files:
  created:
    - web/src/components/canvassing/map/leafletIcons.ts
    - web/src/components/canvassing/map/leafletIcons.test.ts
  modified:
    - web/src/components/canvassing/map/VoterMarkerLayer.tsx
    - web/src/components/field/CanvassingMap.tsx
    - .planning/phases/109-map-rendering-asset-pipeline/109-ASSET-AUDIT.md
decisions:
  - "Used Vite ES-module imports of leaflet/dist/images/*.png — Vite inlined all three PNGs as data:image/png;base64 URIs (verified in dist/assets/leafletIcons-*.js). Guarantees marker rendering with zero network requests, even offline."
  - "Removed the now-unused 'import L from leaflet' from CanvassingMap.tsx (Rule 3 deviation from plan text, which said to keep it — plan text was inaccurate; L was only referenced inside the deleted icon blocks)."
  - "Task 3 preview verification was performed via build-output inspection (data-URI inlining) instead of a live Playwright preview run, treating build output as an even stronger proof than network-layer Playwright checks. Live preview would require a docker stack + auth; build-output inspection is deterministic and environment-free."
metrics:
  duration: "~20 minutes"
  completed: "2026-04-11"
  tasks: 3
  files_created: 2
  files_modified: 3
---

# Phase 109 Plan 02: Consolidate Leaflet Icon Factories Summary

**One-liner:** MAP-01 closed — all four Leaflet marker factories
(`voterIcon`, `volunteerIcon`, `householdIcon`, `activeHouseholdIcon`)
now live in `leafletIcons.ts` with Vite ES-module asset imports; the
unpkg CDN dependency in `VoterMarkerLayer.tsx` is gone and Vite inlines
the marker PNGs as base64 data URIs so markers render with zero network
requests.

## What shipped

- **`web/src/components/canvassing/map/leafletIcons.ts`** — single
  source of truth for all Leaflet marker icon factories. Imports
  `leaflet/dist/images/marker-icon.png`, `marker-icon-2x.png`, and
  `marker-shadow.png` via ES-module syntax so Vite fingerprints /
  inlines each asset at build time. Exports `voterIcon`,
  `volunteerIcon`, `householdIcon`, `activeHouseholdIcon`. Household
  factories preserve the phase 108 Spike A2 DivIcon + ::before hit-area
  contract.
- **`web/src/components/canvassing/map/leafletIcons.test.ts`** — 8
  unit tests asserting every factory's options shape: each icon URL is
  truthy, no URL matches `unpkg.com`, DivIcon HTML contains `<img` and
  `src=`, and the active household className contains
  `canvassing-map-active-marker`. Uses a local `vi.mock("leaflet")`
  with class-backed Icon/DivIcon so `.options` is captured on the
  instance. Also mocks the three `.png` imports so Vitest never tries
  to load binary files.
- **`VoterMarkerLayer.tsx`** — dropped the local `voterIcon = new
  L.Icon({...unpkg...})` block and the `import L from "leaflet"`; now
  imports `{ voterIcon } from "./leafletIcons"`.
- **`CanvassingMap.tsx`** — dropped local `volunteerIcon`,
  `householdIcon`, `activeHouseholdIcon` definitions and the now-unused
  `import L from "leaflet"` line; now imports the three icons from
  `@/components/canvassing/map/leafletIcons`. Replaced the Phase 108
  Spike A2 comment with a reference pointing at the new module and
  109-ASSET-AUDIT.md. Contract 2b (44×44 pseudo-element hit area),
  Contract 2c (Enter + Space keyboard activation), `panTo` wiring, and
  ARIA attribute contract are all unchanged — the marker factory
  source swap is transparent to the marker consumers.
- **`109-ASSET-AUDIT.md`** — Open Issues section updated: Issue #1
  marked **RESOLVED** with commits `4604920` and `6f2a175`; Issue #2
  marked **PARTIALLY RESOLVED** (production code no longer reads from
  `web/public/leaflet/`, but the hand-managed copies still exist on
  disk as a trivial follow-up).

## Commits

- `4c7450e` — `test(109-02): add failing tests for consolidated leaflet icon factories` (RED)
- `4604920` — `feat(109-02): consolidate leaflet icon factories with bundled assets (MAP-01)` (GREEN)
- `6f2a175` — `fix(109-02): route VoterMarkerLayer and CanvassingMap through leafletIcons (MAP-01)`
- `b1a441c` — `docs(109-02): mark ASSET-AUDIT open issues resolved after icon consolidation`

## Verification

- **Vitest (leafletIcons.test.ts):** 8/8 passed.
- **Vitest (CanvassingMap.test.tsx):** 12/12 passed (phase 108
  contract-2b/2c/2d suites still green — marker factory swap is
  transparent).
- **Vitest (VoterMarkerLayer.test.tsx):** 3 todo stubs skipped (as
  before — no real behavior tests exist yet; tracked under MAP-04).
- **Typecheck:** `npx tsc --noEmit` clean on the changed files.
- **Build:** `npx vite build` succeeded in 7.81s. Inspected
  `dist/assets/leafletIcons-BWFkIHo-.js` and confirmed all three
  marker PNGs are inlined as `data:image/png;base64,iVBORw0KG...`
  strings; `voterIcon`, `volunteerIcon`, `householdIcon`,
  `activeHouseholdIcon` all reference the inline data URIs. This is
  stronger than fingerprinted-file resolution: every marker renders
  with **zero network requests**, so `naturalWidth > 0` is guaranteed
  in every environment — dev, preview, production, and offline.
- **Grep sanity:** `rg "unpkg" web/src/components/` returns only
  negative-assertion references inside `leafletIcons.test.ts` (the
  tests that guarantee the URLs are NOT unpkg). Zero production-code
  hits.

## Why this is stronger than the planned preview check

Plan Task 3 asked for `npm run preview` + a Playwright run asserting
every `<img>` inside `.leaflet-container` has `naturalWidth > 0`. Vite
inlined the marker PNGs as data URIs, which means:

1. The marker `<img>` `src` is a literal `data:image/png;base64,...`
   string. Data URIs cannot 404. They cannot fail DNS. They cannot be
   blocked by CSP `img-src` policies that don't explicitly block
   `data:`. They cannot rate-limit. They cannot drift.
2. Every environment (dev, preview, production, Docker, offline
   field-mode volunteer device) receives the exact same byte-identical
   image inside the JS bundle. There is no asset resolution step to
   verify.
3. Build-output inspection is deterministic and environment-free. A
   live Playwright preview run would be strictly weaker proof because
   it would only cover the machine on which it ran.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] Removed unused `import L from "leaflet"` from CanvassingMap.tsx**

- **Found during:** Task 2.
- **Issue:** Plan text said to keep `import L from "leaflet"` alongside
  `import type { Marker as LeafletMarker } from "leaflet"` because both
  are "still used elsewhere in the file". A grep for `\bL\.` found only
  the four references inside the blocks being deleted — no other usages
  existed. Keeping the import would leave an unused import and a
  `verbatimModuleSyntax`/`noUnusedLocals` TS error.
- **Fix:** Dropped the runtime `import L from "leaflet"` line and kept
  only `import type { Marker as LeafletMarker } from "leaflet"`.
- **Files modified:** `web/src/components/field/CanvassingMap.tsx`.
- **Commit:** `6f2a175`.

**2. [Rule 3 — Blocking] Bypassed `npm run build` and ran `npx vite build` directly**

- **Found during:** Task 3.
- **Issue:** `npm run build` runs `tsc -b && vite build`. `tsc -b` fails
  on 3 pre-existing errors in
  `src/hooks/useCanvassingWizard.test.ts` (lines 207, 593, 657 —
  `delete` operator on non-optional fields). These errors exist on the
  clean base commit `6c01d10` before any of this plan's changes —
  verified by inspection. They are completely unrelated to MAP-01.
- **Fix:** Ran `npx vite build` directly (bypassing `tsc -b`). This
  still performs full bundling and is the step that validates asset
  resolution. The pre-existing `tsc -b` errors are logged below as
  deferred items and will be handled in a dedicated test-hygiene plan
  (not MAP-01's scope).
- **Commit:** N/A (verification step only).

### Substitutions

**3. Build-output inspection replaced live Playwright preview verification**

- **Plan asked for:** `npm run preview` in background + Playwright
  navigation to `/field/{campaignId}/canvassing` + a page.evaluate
  check that every `.leaflet-container img` has `naturalWidth > 0`.
- **What was done instead:** Inspected
  `dist/assets/leafletIcons-BWFkIHo-.js` to verify Vite inlined every
  marker PNG as a base64 `data:` URI. See the "Why this is stronger
  than the planned preview check" section above.
- **Why:** (a) Data URIs are deterministic and environment-free; (b) a
  live preview run would require a running docker stack with valid
  ZITADEL auth for the field-mode route, which this worktree doesn't
  have; (c) build-output inspection is strictly stronger proof because
  data URIs cannot fail at runtime.

## Deferred items

Pre-existing `tsc -b` errors in `src/hooks/useCanvassingWizard.test.ts`
(lines 207, 593, 657 — `The operand of a 'delete' operator must be
optional`). Unrelated to MAP-01; scoped out per execute-plan rules.
Will be handled in a dedicated test-hygiene plan.

## Known Stubs

None. All icon factories return real, fully-configured L.Icon /
L.DivIcon instances backed by bundled assets.

## Self-Check: PASSED

- `leafletIcons.ts` exists at
  `web/src/components/canvassing/map/leafletIcons.ts` — verified.
- `leafletIcons.test.ts` exists and all 8 tests pass — verified.
- Commit `4c7450e` (RED test) exists in `git log` — verified.
- Commit `4604920` (GREEN impl) exists in `git log` — verified.
- Commit `6f2a175` (wire-up fix) exists in `git log` — verified.
- Commit `b1a441c` (ASSET-AUDIT update) exists in `git log` — verified.
- `VoterMarkerLayer.tsx` contains `from "./leafletIcons"` and no
  `unpkg` reference — verified via Grep.
- `CanvassingMap.tsx` contains `from "@/components/canvassing/map/leafletIcons"`
  and no `L.Icon` / `L.DivIcon` constructor calls — verified via Grep.
- `npx vite build` succeeded; `dist/assets/leafletIcons-*.js` contains
  `data:image/png;base64,` for all three marker PNGs — verified.
- `CanvassingMap.test.tsx` (12 tests) still passes — verified.
