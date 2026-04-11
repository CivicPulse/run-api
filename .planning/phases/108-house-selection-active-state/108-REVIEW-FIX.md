---
phase: 108
fixed: 2026-04-11
scope: critical_and_warning
status: fixed
findings_addressed:
  critical: 0
  warning: 5
  info: 0
commits:
  - 1e96766 fix(108-review): WR-01 remove redundant classList churn on markers
  - 47f71bd fix(108-review): WR-02 stabilize marker onClick via ref
  - 2c216bb fix(108-review): WR-03 handle Enter key for marker activation (a11y)
  - 9e05115 test(108-review): WR-03 cover Enter key activation unit + E2E
  - e6fb1dd fix(108-review): WR-04 rename milestoneKey to avoid shadowing
  - 1c556a4 fix(108-review): WR-05 correct tour-session increment effect deps
---

# Phase 108 Code Review Fix Report

**Fixed at:** 2026-04-11
**Source review:** `.planning/phases/108-house-selection-active-state/108-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 warnings (no critical, info deferred)
- Fixed: 5
- Skipped: 0

All five warning-level findings from phase 108 review were addressed. The
real a11y gap (WR-03 — Enter key activation) is now closed with production
code + unit + E2E coverage. WR-01/02/04/05 are code-quality cleanups that
reduce churn and remove variable shadowing / stale dep tricks.

## Fixed Issues

### WR-01 — Remove redundant classList manipulation

**Files modified:** `web/src/components/field/CanvassingMap.tsx`
**Commit:** 1e96766
**Applied fix:** Deleted the six lines in `InteractiveHouseholdMarker`'s
`useEffect` that manually added `canvassing-map-household-marker` and
toggled `canvassing-map-active-marker`. The DivIcon `className`
constructors already bake in both variants, and react-leaflet swaps
the DOM element via `marker.setIcon(newIcon)` when `isActive` toggles,
so the classList ops were running against elements that already had
the correct classes.

**Verification:** Tier 1 re-read confirmed deletion clean, Tier 2
`npx tsc --noEmit` reported no new errors touching CanvassingMap.tsx.

### WR-02 — Stabilize marker onClick via ref

**Files modified:** `web/src/components/field/CanvassingMap.tsx`
**Commit:** 47f71bd
**Applied fix:** Added `onClickRef = useRef(onClick)` synced in a
`useLayoutEffect`, and changed the keydown handler to call
`onClickRef.current(household)`. Removed `onClick` from the main
useEffect's dep array so the listener only re-binds when the element
identity or `household`/`isActive` actually changes. Previously the
listener tore down + re-attached every time the upstream
distance-sort memo produced a fresh callback identity (which churns
on every geolocation tick).

**Verification:** Tier 1 re-read, Tier 2 `npx tsc --noEmit` clean.
Existing CanvassingMap vitest suite still passes (10 tests).

### WR-03 — Handle Enter key for marker activation (MOST IMPORTANT — real a11y gap)

**Files modified:** `web/src/components/field/CanvassingMap.tsx`
**Commits:** 2c216bb (production), 9e05115 (tests)
**Applied fix:** Extended the keydown matcher to
`e.key === " " || e.code === "Space" || e.key === "Enter"`, calling
`e.preventDefault()` and `onClickRef.current(household)` for all
three. Also corrected the misleading source comment that claimed
Leaflet synthetic-clicks Enter via `role="button"` — modern browsers
only dispatch click on Enter for native `<button>` elements, not for
`<div role="button">`. Contract 2c keyboard activation is now fully
met for both Space and Enter.

**Test coverage added (commit 9e05115):**
- **Unit:** Extended the `react-leaflet` mock in
  `CanvassingMap.test.tsx` to `forwardRef` a real `<div>` so
  `InteractiveHouseholdMarker`'s post-mount effect runs against a
  real DOM node. Added two new tests — one dispatching a synthetic
  `Enter` KeyboardEvent, one dispatching Space — both assert
  `onHouseholdSelect` is called with the correct households[] index
  and `event.defaultPrevented === true`.
- **E2E:** Added `WR-03: keyboard Enter on a focused map marker
  activates the same transition` to
  `canvassing-house-selection.spec.ts`, mirroring the existing Space
  case: focus the House B marker, press Enter, assert the
  HouseholdCard swaps, the door counter reads "Door 2 of 3", and the
  marker's `aria-pressed` flips to `"true"`.
- Rewrote the stale "Enter is covered by Space symmetry" comment in
  the Space E2E test to reflect the new WR-03 fix.

**Verification:** `npx vitest run src/components/field/CanvassingMap.test.tsx`
reports 12/12 tests passing (was 10 before). Typecheck clean.

### WR-04 — Rename milestoneKey to avoid shadowing

**Files modified:** `web/src/routes/field/$campaignId/canvassing.tsx`
**Commit:** e6fb1dd
**Applied fix:** Renamed the inner `const key = \`milestones-fired-canvassing-${walkListId}\``
to `const milestoneKey` and updated the `checkMilestone(...)` call
accordingly. The outer `const key = userId ? tourKey(campaignId, userId) : ""`
at line 80 is now the only `key` binding in scope, removing the
future-refactor footgun where hoisting the inner block would silently
clobber the tour key.

**Verification:** Tier 1 re-read + Tier 2 `npx tsc --noEmit` clean.

### WR-05 — Correct tour-session increment effect deps

**Files modified:** `web/src/routes/field/$campaignId/canvassing.tsx`
**Commit:** 1c556a4
**Applied fix:** Added `Boolean(currentHousehold)` to the
`incrementSession` useEffect's dep array alongside `key`. Previously
the effect guarded on `!currentHousehold` but depended only on
`[key]`, so on the first render where `key` was truthy but the
wizard hadn't yet hydrated `currentHousehold`, the counter was never
incremented (analytics under-count). With the new dep, the effect
re-runs once `currentHousehold` hydrates and the increment lands.
The `eslint-disable react-hooks/exhaustive-deps` comment is kept
because we intentionally depend on a boolean projection rather than
the full object identity (re-running on every household change
would over-count).

**Verification:** Tier 1 re-read + Tier 2 `npx tsc --noEmit` clean.

## Skipped Issues

None. All five in-scope findings were applied successfully.

## Info-level findings (out of scope)

IN-01 through IN-07 from the review remain open as informational notes
for future phases — none are blockers for phase 108 merge.

---

_Fixed: 2026-04-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
