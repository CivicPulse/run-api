---
phase: 31-canvassing-wizard
plan: 03
subsystem: ui
tags: [react, zustand, tanstack-router, canvassing, wizard, field-mode]

requires:
  - phase: 31-canvassing-wizard
    provides: "Enriched entries hook, door knock mutation, canvassing store, types (Plan 01); HouseholdCard, VoterCard, OutcomeGrid, FieldProgress components (Plan 02)"
  - phase: 30-field-hub
    provides: "FieldHeader, useFieldMe hook, field route tree"
provides:
  - "useCanvassingWizard orchestrator hook combining store + query layer"
  - "Full canvassing wizard route with household navigation and outcome recording"
  - "Bulk Not Home toast prompt at multi-voter addresses"
  - "Auto-advance for non-contact outcomes, survey trigger signal for contact outcomes"
affects: [31-04-survey-panel, 31-05-completion]

tech-stack:
  added: []
  patterns: ["Orchestrator hook pattern: useCanvassingWizard combines Zustand + React Query into single interface", "Bulk action via sonner toast with action/cancel buttons", "Slide-in animation via key-based remount with Tailwind animate-in"]

key-files:
  created:
    - web/src/hooks/useCanvassingWizard.ts
  modified:
    - web/src/routes/field/$campaignId/canvassing.tsx

key-decisions:
  - "Bulk Not Home uses sonner toast with action buttons (not modal dialog) for lightweight inline prompt"
  - "OutcomeResult return type from handleOutcome signals bulk/survey to route (not callback nesting)"
  - "advanceRef pattern for stable setTimeout references to latest advanceAddress"

patterns-established:
  - "Orchestrator hook: combine Zustand store + React Query into single return object for route consumption"
  - "Bulk action prompt: sonner toast with action/cancel for quick inline decisions"

requirements-completed: [CANV-02, CANV-03, CANV-04, CANV-06]

duration: 2min
completed: 2026-03-15
---

# Phase 31 Plan 03: Canvassing Wizard Assembly Summary

**Orchestrator hook + wizard route wiring household navigation, outcome recording with auto-advance, bulk Not Home toast, and progress tracking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T21:11:37Z
- **Completed:** 2026-03-15T21:13:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- useCanvassingWizard orchestrator hook combining Zustand store state with React Query data into single interface
- Full canvassing wizard route replacing placeholder with household cards, outcome recording, and auto-advance
- Bulk "Not Home" toast prompt at multi-voter addresses after first Not Home outcome
- Progress bar, slide animations, completion screen, loading/error/no-assignment states

## Task Commits

Each task was committed atomically:

1. **Task 1: useCanvassingWizard orchestrator hook** - `87dca99` (feat)
2. **Task 2: Canvassing wizard route replacing placeholder** - `feb4dab` (feat)

## Files Created/Modified
- `web/src/hooks/useCanvassingWizard.ts` - Orchestrator hook: derives households, activeEntryId, completedAddresses from store+query; handles outcome, skip, bulk, jump, post-survey actions
- `web/src/routes/field/$campaignId/canvassing.tsx` - Full wizard route with household card display, bulk Not Home toast, slide animation, completion screen

## Decisions Made
- Bulk Not Home uses sonner toast with action/cancel buttons rather than a modal dialog -- keeps the flow lightweight and inline
- handleOutcome returns an OutcomeResult object to signal bulk prompt or survey trigger to the route layer
- Used advanceRef pattern (useRef for advanceAddress) to ensure setTimeout callbacks reference the latest store action

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wizard route is fully functional for non-contact outcomes (auto-advance)
- Contact outcomes return `{ surveyTrigger: true }` -- ready for Plan 04 to wire survey panel
- handlePostSurveyAdvance callback ready for survey panel integration
- Completion screen in place for Plan 05 summary/stats overlay

---
*Phase: 31-canvassing-wizard*
*Completed: 2026-03-15*
