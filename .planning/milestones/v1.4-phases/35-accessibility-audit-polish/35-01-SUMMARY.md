---
phase: 35-accessibility-audit-polish
plan: 01
subsystem: ui
tags: [aria, wcag, accessibility, react, screen-reader, landmarks]

# Dependency graph
requires:
  - phase: 31-canvassing-field-ui
    provides: "Field components (VoterCard, OutcomeGrid, HouseholdCard, DoorListView, InlineSurvey)"
  - phase: 32-phone-banking-field-ui
    provides: "Phone banking route with CallingVoterCard and OutcomeGrid"
provides:
  - "ARIA landmarks on all field headers (nav > header pattern)"
  - "Voter-name-aware aria-labels on OutcomeGrid buttons"
  - "Contextual aria-labels on InlineSurvey sheets"
  - "Descriptive aria-labels on DoorListView door buttons"
  - "Call count context in phone banking ARIA announcements"
  - "WCAG AA compliant propensity badge text colors"
affects: [35-accessibility-audit-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: ["nav landmark wrapping header elements", "voterName prop threading for ARIA context", "-800 text variants for WCAG AA on -100 backgrounds"]

key-files:
  created: []
  modified:
    - web/src/components/field/FieldHeader.tsx
    - web/src/components/field/OutcomeGrid.tsx
    - web/src/components/field/VoterCard.tsx
    - web/src/components/field/InlineSurvey.tsx
    - web/src/components/field/DoorListView.tsx
    - web/src/routes/field/$campaignId.tsx
    - web/src/routes/field/$campaignId/phone-banking.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/types/canvassing.ts

key-decisions:
  - "Nav landmark wraps header (not replaces) to preserve sticky positioning"
  - "voterName prop is optional to maintain backward compatibility"
  - "Canvassing ARIA announcement simplified to address-first format per CONTEXT.md"

patterns-established:
  - "ARIA landmark pattern: <nav aria-label='Field navigation'><header>...</header></nav>"
  - "Voter context threading: voterName optional prop for screen reader labels"
  - "WCAG AA contrast: use -800 text on -100 backgrounds for colored badges"

requirements-completed: [A11Y-01, A11Y-03, POLISH-02]

# Metrics
duration: 3min
completed: 2026-03-16
---

# Phase 35 Plan 01: ARIA Landmarks and Contrast Fixes Summary

**ARIA landmarks, voter-name-aware screen reader labels, and WCAG AA contrast fixes across all field mode components**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T19:13:55Z
- **Completed:** 2026-03-16T19:17:20Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- All field headers wrapped in nav landmarks for screen reader navigation
- OutcomeGrid buttons announce voter name context (e.g., "Record Supporter for John Smith")
- InlineSurvey sheets include voter-name-specific aria-labels
- DoorListView buttons have descriptive labels with door number, address, and status
- Phone banking ARIA announcements include call count context
- All propensity badge text colors upgraded to -800 variants for WCAG AA 4.5:1 contrast
- POLISH-02 confirmed complete: VoterCard and CallingVoterCard both render name, party, age, and propensity

## Task Commits

Each task was committed atomically:

1. **Task 1: ARIA landmarks and screen reader labels** - `7a698ae` (feat)
2. **Task 2: Color contrast fixes for WCAG AA compliance** - `90db679` (fix)

## Files Created/Modified
- `web/src/components/field/FieldHeader.tsx` - Nav landmark wrapping header
- `web/src/components/field/OutcomeGrid.tsx` - voterName prop for contextual aria-labels
- `web/src/components/field/VoterCard.tsx` - Passes voterName to OutcomeGrid
- `web/src/components/field/InlineSurvey.tsx` - voterName prop and aria-label on SheetContent
- `web/src/components/field/DoorListView.tsx` - aria-labels on door list buttons
- `web/src/routes/field/$campaignId.tsx` - aria-label on main element
- `web/src/routes/field/$campaignId/phone-banking.tsx` - Nav landmark, voterName on OutcomeGrid/InlineSurvey, call count in ARIA
- `web/src/routes/field/$campaignId/canvassing.tsx` - voterName on InlineSurvey, updated ARIA announcement format
- `web/src/types/canvassing.ts` - getPropensityDisplay text colors upgraded to -800 variants

## Decisions Made
- Nav landmark wraps header (not replaces) to preserve sticky positioning and existing class structure
- voterName prop is optional on OutcomeGrid and InlineSurvey to maintain backward compatibility
- Canvassing ARIA announcement simplified to "Now at [address], door X of Y" per CONTEXT.md format
- POLISH-02 verified by reading VoterCard and CallingVoterCard -- both already render all voter context fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All field components have proper ARIA landmarks and labels
- Ready for Plan 02 (focus management and keyboard navigation) and Plan 03 (typography and layout polish)

---
*Phase: 35-accessibility-audit-polish*
*Completed: 2026-03-16*
