# Phase 108: House Selection & Active-State - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Make any house in the volunteer's walk list reliably activatable from BOTH
the household list view AND the map view, with consistent state transitions
regardless of entry point. Document the active-house state machine end-to-end
so future contributors and offline-sync work (phase 110) have a single
source of truth.

Three requirements:

1. **SELECT-01** — Tap-to-activate from the household list (`DoorListView`)
2. **SELECT-02** — Tap-to-activate from the map (`CanvassingMap` markers)
3. **SELECT-03** — State machine audit covering all entry points

Scope is the **existing canvassing wizard infrastructure**. No new entity
types, no walk-list editor changes, no campaign-manager surfaces.

</domain>

<starting_state>
## Starting State (verified by scout)

| Requirement | Current state | Phase 108 work |
|---|---|---|
| **SELECT-01** list-tap | UI exists at `web/src/components/field/DoorListView.tsx:110` (`onClick={() => onJump(index)}`). `handleJumpToAddress` at `web/src/hooks/useCanvassingWizard.ts:583` calls the store's `jumpToAddress`. **Latent bug:** does NOT clear `pinnedHouseholdKey`, so the same visible-swap pinning bug 107-08.1 fixed for advance/skip will hit list-tap. | Fix the pin-clear gap; verify card visibly swaps; add behavioral tests |
| **SELECT-02** map-tap | Markers rendered at `web/src/components/field/CanvassingMap.tsx:173` with `<Marker icon={isActive ? activeHouseholdIcon : householdIcon}>`. **NO `eventHandlers` / no click handler.** Pure decoration today. | Add marker click handler that calls `handleJumpToAddress(index)`; auto-pan map; same feedback as list-tap |
| **SELECT-03** state machine audit | No state machine doc exists. | Produce `108-STATE-MACHINE.md` (Mermaid diagram + transition table) and a comprehensive integration test exercising every entry point |

</starting_state>

<decisions>
## Implementation Decisions

### SELECT-01: List-Tap Pin-Clear Fix

- **D-01: Apply the 107-08.1 pattern to `handleJumpToAddress`.** Wrap the
  store's `jumpToAddress` so that the wrapped version calls
  `setPinnedHouseholdKey(null)` BEFORE invoking the underlying store action.
  Mirror the exact wrap pattern used in 107-08.1 for `advanceAddress` and
  `skipEntry`. The pin should release on any intentional navigation
  (advance, skip, jump) — not just GPS-driven re-sorts.

- **D-02: Tap-to-activate feedback is `card swap + haptic` (NO toast).**
  Different from auto-advance feedback per phase 107 D-03 which is
  `toast + card swap + haptic`. Rationale: the user's own tap IS the
  feedback for an intentional navigation; a toast on every tap would be
  noisy when browsing the list. Card swap is the visible signal,
  `navigator.vibrate(50)` is the tactile confirmation, no auditory/visual
  redundancy needed.

- **D-03: List view closes on tap.** Current behavior at
  `DoorListView.tsx:112` (`onOpenChange(false)`) is correct — keep it.
  Tapping a household = "I want to work this house next" intent;
  returning to the wizard view satisfies that intent. No change to
  close-on-tap semantics.

### SELECT-02: Map-Tap Implementation

- **D-04: Single-tap = activate immediately.** No popup-with-confirmation,
  no long-press. Tapping a household marker on the map directly activates
  that household. Matches list-tap semantics (single tap = activate) for
  consistency. Tooltip continues to show address on hover/focus for desktop
  discoverability but tap is the activation gesture on mobile.

- **D-05: Map auto-pans, no auto-zoom.** When a marker is tapped, the map
  smoothly pans to center the new active household. Zoom level stays
  exactly where the volunteer set it. Pan animation is honored only when
  `prefersReducedMotion === false` (use `usePrefersReducedMotion` from
  phase 107 D-20); under reduced motion the pan is instant. Volunteer's
  spatial context is preserved.

- **D-06: Map-tap feedback = same as list-tap PLUS the existing icon swap.**
  Triple combo: (a) `HouseholdCard` swap in the wizard panel below the map,
  (b) `navigator.vibrate(50)` haptic, (c) the existing
  `activeHouseholdIcon` vs `householdIcon` swap on the marker (already
  implemented at `CanvassingMap.tsx:176`). No NEW visual layer (no pulse,
  no connection line — those are deferred). The icon change IS the
  map-side spatial feedback.

- **D-07: Implementation hooks into existing `handleJumpToAddress`.** Both
  list-tap and map-tap go through the same wrapped `handleJumpToAddress`
  function, ensuring identical state transitions. The CanvassingMap
  component receives `handleJumpToAddress` as a prop (pass-through from
  the canvassing route) and wires marker `eventHandlers={{ click: ... }}`
  to call it with the index of the tapped household.

### SELECT-03: State Machine Audit

- **D-08: Deliverable is `108-STATE-MACHINE.md` + behavioral integration
  test, NO refactor.** The audit doc lives at
  `.planning/phases/108-house-selection-active-state/108-STATE-MACHINE.md`
  and contains:
  - **Mermaid state diagram** of all entry points → states → transitions
  - **Transition table** with columns: Source state | Trigger | Target
    state | Side effects
  - **Behavioral integration test** (single comprehensive test, not
    multiple) that exercises every entry point against the same fixture
    walk list and asserts the same target state is reachable from each
  - **NO XState refactor**, **NO useReducer extraction**. The bug isn't
    "state machine is poorly modeled" — it's "tap handlers are missing or
    buggy." A doc + behavioral test is the right level of rigor for v1.18.

- **D-09: Entry points covered by the audit:**
  1. **list-tap** (`DoorListView` → `handleJumpToAddress`)
  2. **map-tap** (`CanvassingMap` marker → `handleJumpToAddress`)
  3. **auto-advance after outcome** (`advanceAfterOutcome` from phase 107)
  4. **skip** (`handleSkipAddress` from phase 107)
  5. **resume** (returning to canvassing route from a different route;
     `lastActiveAt` in `canvassingStore` + `ResumePrompt` flow)

  Excluded from this phase (deferred to phase 110): **reconciliation
  after offline sync**. See D-10.

- **D-10: Reconciliation placeholder in the doc.** `108-STATE-MACHINE.md`
  ends with a section `## Reconciliation (deferred to phase 110)` that
  lists open questions phase 110 must answer:
  - When the offline queue replays after reconnect, does the active house
    stay where it is, or jump to whatever the last queued action implies?
  - If the server's last-active state differs from the client's, which
    wins?
  - How are conflicts surfaced to the volunteer (silent, toast, modal)?
  Phase 110 fills in this section as part of OFFLINE-01/02/03 work.

- **D-11: Behavioral integration test scope.** Single test in
  `web/src/hooks/useCanvassingWizard.test.ts` (or a new
  `web/src/hooks/useCanvassingWizard.state-machine.test.ts` if cleaner)
  that for each of the 5 entry points (D-09):
  1. Sets up a fixture walk list with at least 3 households
  2. Triggers the entry point on a non-current household
  3. Asserts `currentAddressIndex` advances to the target
  4. Asserts `pinnedHouseholdKey` is cleared
  5. Asserts `currentHousehold` returns the new target (not stale)
  This test is the regression-guard for the audit doc — if the doc says
  "every entry point clears the pin," the test proves it.

### Test Coverage (TEST-01/02/03 obligation, same as phase 107)

- **D-12: All three layers for every fix:**
  - **Unit (vitest):** new tests in `useCanvassingWizard.test.ts` for the
    wrapped `handleJumpToAddress` (pin clear + state advance), plus the
    SELECT-03 cross-entry-point behavioral test from D-11.
  - **Component (vitest):** new tests in `CanvassingMap.test.tsx` for the
    marker click handler firing `handleJumpToAddress` with the right index,
    auto-pan call, and reduced-motion fallback.
  - **E2E (Playwright):** new specs in
    `web/e2e/canvassing-house-selection.spec.ts` (or extend
    `canvassing-wizard.spec.ts`) covering: tap a list item → wizard
    advances; tap a map marker → wizard advances + map pans; resume
    after route navigation lands on the same active house.

- **D-13: Render-path test for SELECT-01 too.** Following the lesson from
  107-08.1: add a render-path test in `HouseholdCard.test.tsx` (or
  similar) that asserts the visible HouseholdCard text changes after a
  list-tap, not just hook state. Mirror the regression-guard pattern from
  107-08.1 — the test must FAIL on a buggy version (where pin doesn't
  clear) and PASS on the fix.

### Claude's Discretion

- Whether to add the marker click handler via `eventHandlers={{ click: ... }}`
  on each `<Marker>` or via a shared `handleMarkerClick(householdKey)`
  callback. Either is fine; pick whichever produces simpler code.
- Whether the behavioral integration test (D-11) lives in the existing
  `useCanvassingWizard.test.ts` or a new file. Pick by readability — if
  the existing file is already 500+ lines, split it; otherwise inline.
- Pan animation duration (Leaflet default vs custom). Use Leaflet's
  default `panTo` unless that conflicts with reduced-motion semantics.
- Mermaid diagram style (state diagram vs flowchart). State diagram is
  more semantically correct; flowchart is more readable for casual viewers.
  Either is fine.
- Whether the wrapped `handleJumpToAddress` lives inline in the hook (like
  107-08.1's wrapped advance) or is extracted to a helper. Inline is fine
  for one usage; extract if SELECT-03 reveals more entry points.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions
- `CLAUDE.md` — design principles 1-5 (clarity, mobile-field parity,
  nonpartisan, AAA accessibility, progressive density). 44px+ touch
  targets. Reduced-motion alternative for every animation.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §SELECT (lines 30-32), §TEST anchored to
  phase 110 (line 55).
- `.planning/ROADMAP.md` §Phase 108 (line 253).

### Phase 107 inheritance
- `.planning/phases/107-canvassing-wizard-fixes/107-CONTEXT.md` §D-01..D-20
  — full context for the wizard surface this phase extends.
- `.planning/phases/107-canvassing-wizard-fixes/107-08.1-SUMMARY.md` —
  the pinning bug fix that this phase REPLICATES for jumpToAddress.
- `.planning/phases/107-canvassing-wizard-fixes/107-VERIFICATION-RESULTS.md`
  — the phase 107 exit gate baseline this phase must not regress.
- `web/src/hooks/usePrefersReducedMotion.ts` (added phase 107 D-20) — used
  for D-05 map pan animation gating.

### Existing code (must read before modifying)
- `web/src/hooks/useCanvassingWizard.ts` — `handleJumpToAddress` at
  line 583, the wrapped `advanceAddress`/`skipEntry` patterns at ~119-135
  from 107-08.1, the `pinnedHouseholdKey` state at line 117.
- `web/src/components/field/DoorListView.tsx` — list-tap UI at line 110.
- `web/src/components/field/CanvassingMap.tsx` — marker rendering at
  lines 169-185, currently no click handlers.
- `web/src/components/field/HouseholdCard.tsx` — the rendered card whose
  visible swap is the SELECT-01 acceptance signal.
- `web/src/stores/canvassingStore.ts` — `jumpToAddress`, `advanceAddress`,
  `skipEntry`, `lastActiveAt` (for resume), `walkListId`.
- `web/src/routes/field/$campaignId/canvassing.tsx` — the wizard route
  that wires everything together. Will need a small update to pass
  `handleJumpToAddress` down to `CanvassingMap`.

### Phase 106 inheritance
- `web/scripts/run-e2e.sh` — mandatory wrapper for any Playwright run
  (D-13 from phase 106). Default 8 workers (set by phase 106-05).
- `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` D-08
  — "test reveals product bug → file todo, don't fix in test phase"
  rule still applies.

</canonical_refs>

<code_context>
## Existing Code Insights

### What works today
- `handleJumpToAddress(index)` correctly calls the store's
  `jumpToAddress(index)` which updates `currentAddressIndex`.
- `DoorListView` already has a `<button onClick={() => onJump(index)}>`
  pattern that's wired to `handleJumpToAddress`.
- `CanvassingMap` correctly distinguishes the active marker via
  `isActive ? activeHouseholdIcon : householdIcon` at line 176.
- `usePrefersReducedMotion` hook from phase 107 D-20 is already imported
  and used by `canvassing.tsx` for the auto-advance card-swap animation.

### What's broken
- `handleJumpToAddress` does NOT clear `pinnedHouseholdKey` — same class
  of bug as 107-08.1. The visible HouseholdCard will continue showing
  the OLD household after a list-tap on slow devices or under sort
  pinning conditions. Verified by scout.
- `CanvassingMap` markers have NO `eventHandlers` prop. Tapping does
  nothing. Verified by scout.

### Established patterns
- The 107-08.1 pin-clear pattern (wrap the store action, call
  `setPinnedHouseholdKey(null)` first, then call the original) is the
  template to follow.
- The triple-channel feedback pattern from 107 D-03 is the template for
  D-02 (minus the toast for tap navigation).
- The render-path test pattern from 107-08.1 (assert visible DOM, not
  hook state) is the template for D-13.

### Integration points
- New code lives in: `useCanvassingWizard.ts` (wrap jumpToAddress),
  `CanvassingMap.tsx` (add click handlers + pan), `canvassing.tsx`
  (pass handleJumpToAddress to CanvassingMap), possibly
  `HouseholdCard.test.tsx` (extend the render-path tests from 107-08.1).
- New tests: extend `useCanvassingWizard.test.ts` AND
  `CanvassingMap.test.tsx` AND extend `canvassing-wizard.spec.ts` (or
  create `canvassing-house-selection.spec.ts`).

### What NOT to touch
- The pinning logic for GPS-driven re-sorts (lines 129-176 of the hook)
  — that works correctly, only the action wrappers need pin-clear.
- `playwright.config.ts` retries field (D-04 from phase 106).
- Backend canvass schemas — no API changes for SELECT-01/02/03.
- The `activeHouseholdIcon` vs `householdIcon` swap logic in CanvassingMap
  — already correct, just doesn't get triggered today because no click
  handler updates `activeHouseholdKey`.

</code_context>

<specifics>
## Specific Ideas

- **Render-path test as a class of regression-guard:** the lesson from
  107-08.1 was that hook-state tests can pass while the rendered DOM is
  wrong. Phase 108 adopts this as a phase-level rule: every state-changing
  user gesture (list-tap, map-tap) gets a render-path assertion in
  addition to a hook-state assertion. The cost is small; the catch rate
  is high.
- **`108-STATE-MACHINE.md` as a phase-level audit doc** is durable
  documentation that survives the milestone. It also makes phase 110's
  reconciliation work much easier — the doc is the contract phase 110
  must extend, not invent.
- **Map auto-pan respects volunteer's zoom intent:** auto-zoom would
  yank a volunteer who'd zoomed out to see the neighborhood. Auto-pan-only
  respects "I'm exploring at zoom 16 and want to keep that overview."
- **Tap feedback differs by intent:** auto-advance gets toast (the user
  needs to know the system did something), tap-to-activate gets no toast
  (the user did the something themselves). This asymmetry is a feature,
  not an inconsistency.

</specifics>

<deferred>
## Deferred Ideas

- **Reconciliation after offline sync** — deferred to phase 110 per D-10.
  The state machine doc has a placeholder section.
- **Marker pulse animation on activation** — rejected. The icon swap is
  sufficient feedback. Add later if real volunteer reports show a
  visibility gap.
- **Connection line from volunteer location to active marker** — rejected.
  Useful for navigation but adds geometry rendering and is its own phase
  if revisited.
- **Multi-select / bulk-activate from list** — rejected. Out of scope for
  v1.18 single-active-house model. Could be a v1.20+ admin feature.
- **XState refactor of the active-house state machine** — rejected per
  D-08. v1.18 needs working tap handlers, not architectural rigor. The
  state machine doc + behavioral test deliver the audit value without
  the refactor cost.
- **`useReducer` extraction** — rejected per D-08. Same reasoning.
- **Map-tap shows address popup before activation** — rejected per D-04
  in favor of single-tap activation.
- **Auto-zoom on activation** — rejected per D-05. Volunteer's zoom is
  preserved.

</deferred>

---

*Phase: 108-house-selection-active-state*
*Context gathered: 2026-04-11 via interactive discuss-phase*
