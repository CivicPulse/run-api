---
phase: 34-guided-onboarding-tour
plan: 03
subsystem: ui
tags: [driver.js, zustand, react, tour, onboarding]

requires:
  - phase: 34-guided-onboarding-tour/01
    provides: "useTour hook, tourStore, tourSteps definitions"
  - phase: 34-guided-onboarding-tour/02
    provides: "QuickStartCard component, data-tour attributes on shared components"
provides:
  - "Complete working tour system: auto-triggers, help replay, quick-start cards"
  - "All 3 field routes wired to tour infrastructure"
  - "Context-aware help button in FieldHeader and phone-banking custom header"
affects: [34-guided-onboarding-tour/04]

tech-stack:
  added: []
  patterns: ["Reactive Zustand selectors for conditional UI rendering", "useEffect auto-trigger with completion guard and DOM settle delay"]

key-files:
  created: []
  modified:
    - web/src/components/field/FieldHeader.tsx
    - web/src/routes/field/$campaignId.tsx
    - web/src/routes/field/$campaignId/index.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/routes/field/$campaignId/phone-banking.tsx

key-decisions:
  - "Reactive Zustand selectors for QuickStartCard visibility instead of getState() in render"
  - "Session counting fires on key change (mount-equivalent) not on data change"

patterns-established:
  - "Tour auto-trigger pattern: useEffect with key+data guard, isSegmentComplete check, 200ms setTimeout"
  - "QuickStartCard reactive visibility: useTourStore selector checking sessionCounts and dismissedThisSession"

requirements-completed: [TOUR-01, TOUR-04, TOUR-05, TOUR-06]

duration: 3min
completed: 2026-03-16
---

# Phase 34 Plan 03: Tour Route Wiring Summary

**Tour triggers wired into all 3 field routes with auto-start on first visit, context-aware help replay, and QuickStartCards for first 3 sessions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T18:02:13Z
- **Completed:** 2026-03-16T18:05:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- FieldHeader help button activates with onHelpClick prop, replays context-aware tour based on current route
- All 3 field routes auto-trigger their segment tour on first visit (guarded by completion check + 200ms DOM settle)
- Canvassing and phone banking show QuickStartCards for first 3 sessions, hidden during active tour
- Phone banking custom header has dedicated help button for tour replay

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire FieldHeader help button and field layout tour context** - `0d1d40a` (feat)
2. **Task 2: Wire tour auto-triggers and QuickStartCards on all 3 routes** - `7f81b10` (feat)

## Files Created/Modified
- `web/src/components/field/FieldHeader.tsx` - Added onHelpClick prop, data-tour attributes on help button and avatar menu
- `web/src/routes/field/$campaignId.tsx` - Tour context construction, context-aware help click handler
- `web/src/routes/field/$campaignId/index.tsx` - Welcome tour auto-trigger, hub-greeting data-tour attribute
- `web/src/routes/field/$campaignId/canvassing.tsx` - Canvassing tour auto-trigger, QuickStartCard, session counting, door-list-button data-tour
- `web/src/routes/field/$campaignId/phone-banking.tsx` - Phone banking tour auto-trigger, QuickStartCard, help button in custom header, skip/end-session data-tour attributes

## Decisions Made
- Used reactive Zustand selectors for QuickStartCard visibility instead of calling getState() in render (ensures reactivity)
- Session counting useEffect depends only on key (mount-equivalent) to avoid double-counting on data changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tour system fully functional: auto-triggers, replays, quick-start cards all working
- Ready for Plan 04 (Playwright e2e verification)
- All data-tour attributes match tourSteps.ts selectors

---
*Phase: 34-guided-onboarding-tour*
*Completed: 2026-03-16*

## Self-Check: PASSED
