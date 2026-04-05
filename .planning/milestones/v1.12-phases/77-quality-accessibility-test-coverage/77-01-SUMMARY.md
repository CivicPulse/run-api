---
phase: 77-quality-accessibility-test-coverage
plan: 01
subsystem: web-frontend
tags: [a11y, assets, leaflet, wcag, offline]
requires: []
provides:
  - self-hosted-leaflet-markers
  - aria-label-associations-3-dialogs
affects:
  - web/src/components/field/CanvassingMap.tsx
  - web/src/components/canvassing/DoorKnockDialog.tsx
  - web/src/components/canvassing/WalkListGenerateDialog.tsx
  - web/src/components/field/InlineSurvey.tsx
tech-stack:
  added: []
  patterns:
    - "React useId() for SSR-stable unique form control IDs"
    - "Self-host third-party static assets under /public for offline capability"
key-files:
  created:
    - web/public/leaflet/marker-icon.png
    - web/public/leaflet/marker-icon-2x.png
    - web/public/leaflet/marker-shadow.png
  modified:
    - web/src/components/field/CanvassingMap.tsx
    - web/src/components/canvassing/DoorKnockDialog.tsx
    - web/src/components/canvassing/WalkListGenerateDialog.tsx
    - web/src/components/field/InlineSurvey.tsx
decisions:
  - "Use absolute /leaflet/ URLs (leading slash) so assets resolve identically regardless of current route depth"
  - "No unpkg fallback — field users must work fully offline, so CDN availability must not affect marker rendering"
  - "For InlineSurvey multiple_choice radios, wrap in div + Label htmlFor rather than wrapping Label around RadioGroupItem — Radix role=radio buttons don't bind to wrapping labels"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-04"
  tasks: 2
  files_changed: 7
---

# Phase 77 Plan 01: Leaflet self-host + 3-dialog ARIA labels Summary

Self-hosts Leaflet marker images under `web/public/leaflet/` and wires explicit `htmlFor`/`id` label associations into DoorKnockDialog, WalkListGenerateDialog, and InlineSurvey using React `useId()`.

## What Was Built

### Task 1: Self-host Leaflet marker assets (QUAL-01)

Copied the three Leaflet marker PNGs from `web/node_modules/leaflet/dist/images/` into `web/public/leaflet/`:

- `marker-icon.png`
- `marker-icon-2x.png`
- `marker-shadow.png`

Replaced all 9 `https://unpkg.com/leaflet@1.9.4/dist/images/...` references in `web/src/components/field/CanvassingMap.tsx` (across `volunteerIcon`, `activeHouseholdIcon`, and `householdIcon` `L.Icon` definitions) with absolute same-origin paths `/leaflet/marker-icon.png`, `/leaflet/marker-icon-2x.png`, `/leaflet/marker-shadow.png`.

Field users now see map markers even when offline or when unpkg CDN is unreachable.

**Commit:** `d06e661`

### Task 2: Explicit htmlFor/id label associations (QUAL-02)

Added `useId()`-driven label/control associations in 3 dialogs:

1. **DoorKnockDialog.tsx** — "Result" label now uses `htmlFor={resultId}` bound to `<SelectTrigger id={resultId}>`.
2. **WalkListGenerateDialog.tsx** — "Turf" label now uses `htmlFor={turfId}` bound to `<SelectTrigger id={turfId}>`.
3. **InlineSurvey.tsx** — `multiple_choice` radio items restructured from `<Label><RadioGroupItem/>text</Label>` (which doesn't associate with Radix `role="radio"` buttons) to `<div><RadioGroupItem id={choiceId}/><Label htmlFor={choiceId}>text</Label></div>`. Choice IDs are built from a stable `useId()` prefix plus question ID and index. Retains 44px touch target (`min-h-11`) and `cursor-pointer` on the label.

**Commit:** `6b80cd4`

## Verification

- `cd web && npx tsc --noEmit` — passed (no output, clean).
- `grep -c "/leaflet/marker" src/components/field/CanvassingMap.tsx` → `9` (all 9 references updated).
- `grep "unpkg.com" src/components/field/CanvassingMap.tsx` → empty (zero references).
- `grep "htmlFor={resultId}" src/components/canvassing/DoorKnockDialog.tsx` → match.
- `grep "htmlFor={turfId}" src/components/canvassing/WalkListGenerateDialog.tsx` → match.
- `grep "htmlFor=" src/components/field/InlineSurvey.tsx` → matches (existing `field-call-notes` plus new `choiceId` binding).

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Closed

- **QUAL-01** — Leaflet self-hosted; no external CDN fetches for markers.
- **QUAL-02** — Explicit WCAG-compliant label/control associations in all 3 named dialogs.

## Self-Check: PASSED

- web/public/leaflet/marker-icon.png: FOUND
- web/public/leaflet/marker-icon-2x.png: FOUND
- web/public/leaflet/marker-shadow.png: FOUND
- Commit d06e661: FOUND
- Commit 6b80cd4: FOUND
