---
phase: 109
fixed: 2026-04-11
scope: critical_and_warning
status: partial
findings_addressed:
  critical: 0
  warning: 1
  info: 0
  deferred: 1
---

# Phase 109 Code Review — Fix Report

## Fixed

**WR-01** — `web/src/index.css:312`. Bumped both drop-shadow blurs from `0 0 0` / `0 0 4px` to `0 0 2px` / `0 0 6px` so the stacked halo matches the code comment and provides a real non-hue-only visual cue for color-blindness fallback.

Commit: `97ce7b05 fix(109-review): WR-01 give active marker drop-shadows non-zero blur`

Verification: CSS change only — no test regression risk. Phase 108 E2E specs exercise the active marker class and would flag any `.canvassing-map-active-marker` rendering failure, but the filter property doesn't affect layout or pointer events.

## Deferred

**WR-02** — Redundant DOM-identity assertion in `canvassing.test.tsx:333-351`. Deferred because:
1. The real runtime-survival proof already exists in `canvassing-map-rendering.spec.ts:444-510` (Playwright E2E).
2. Fixing it properly requires wiring the `DoorListView` `onOpenChange` mock to flip `listViewOpen` false and reassert — a non-trivial test-infra change.
3. The test is not broken, only redundant — it passes and tests nothing harmful.

Tracked as a follow-up for the next testing-focused phase.

## Info items (not addressed)

All 5 info findings are tracking notes for future phases:
- IN-01: `voterIcon`/`volunteerIcon` dedup opportunity
- IN-02: Split `InteractiveHouseholdMarker` effects by concern
- IN-03: `?? "Unknown"` precision
- IN-04: Pointer-geometry E2E gap inherited from 108-06
- IN-05: Native `inert` attribute for stronger keyboard nav block
