---
phase: 31-canvassing-wizard
plan: 04
subsystem: ui
tags: [react, sheet, survey, sonner, aria, zustand, tanstack-query]

requires:
  - phase: 31-canvassing-wizard
    provides: "Plan 01 types/store, Plan 02 components, Plan 03 wizard hook and route"
provides:
  - "InlineSurvey bottom-sheet panel with multi-type question rendering"
  - "useResumePrompt hook with sonner toast and 10s auto-resume countdown"
  - "DoorListView bottom-sheet with status badges and jump navigation"
  - "ARIA live region announcing door transitions, outcomes, and completion"
affects: [32-phone-banking, 36-google-maps-navigation]

tech-stack:
  added: []
  patterns: ["Bottom sheet panels for mobile-first wizard overlays", "ARIA live region pattern for screen reader announcements"]

key-files:
  created:
    - web/src/components/field/InlineSurvey.tsx
    - web/src/components/field/ResumePrompt.tsx
    - web/src/components/field/DoorListView.tsx
  modified:
    - web/src/routes/field/$campaignId/canvassing.tsx

key-decisions:
  - "FieldProgress kept as separate row; All Doors button in its own row below to avoid modifying shared component"
  - "Scale question rendered as grid of buttons (not Slider) for better mobile tap targets"

patterns-established:
  - "Bottom Sheet overlay: side='bottom' with max-h-[70-80dvh] rounded-t-2xl for mobile wizard panels"
  - "useResumePrompt hook pattern: sonner toast with countdown interval for interrupted session recovery"
  - "ARIA live region at route level: sr-only div with aria-live='polite' updated via setState"

requirements-completed: [CANV-05, CANV-08, A11Y-04]

duration: 3min
completed: 2026-03-15
---

# Phase 31 Plan 04: Inline Survey, Resume Prompt, Door List View Summary

**Bottom-sheet survey panel with multi-type questions, sonner-based resume prompt with 10s auto-resume, all-doors list view with jump navigation, and ARIA live region for screen reader accessibility**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T21:14:53Z
- **Completed:** 2026-03-15T21:17:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- InlineSurvey renders bottom Sheet with multiple_choice (RadioGroup), scale (button grid), and free_text (Textarea) questions from linked SurveyScript, with Skip Survey and Save Answers buttons
- useResumePrompt detects interrupted sessions via Zustand store comparison and shows sonner toast with Resume/Start Over and 10-second countdown auto-resume
- DoorListView shows all addresses with Pending/Visited/Skipped status badges and tap-to-jump navigation
- ARIA live region announces door transitions, outcome recordings, and walk list completion for screen reader users
- Survey panel conditionally triggered only for contact outcomes (supporter, undecided, opposed, refused) when walk list has a linked script_id

## Task Commits

Each task was committed atomically:

1. **Task 1: InlineSurvey, ResumePrompt, and DoorListView components** - `96c47f8` (feat)
2. **Task 2: Wire InlineSurvey, ResumePrompt, DoorListView, and ARIA live regions into wizard route** - `06da745` (feat)

## Files Created/Modified
- `web/src/components/field/InlineSurvey.tsx` - Bottom sheet survey panel with question type rendering and batch response submission
- `web/src/components/field/ResumePrompt.tsx` - useResumePrompt hook with sonner toast, countdown, and auto-resume
- `web/src/components/field/DoorListView.tsx` - Bottom sheet door list with status badges and jump navigation
- `web/src/routes/field/$campaignId/canvassing.tsx` - Wired all three features plus ARIA live region into wizard route

## Decisions Made
- FieldProgress kept as separate row with All Doors button in its own row below, to avoid modifying the shared FieldProgress component
- Scale questions rendered as button grid instead of Slider for better mobile tap targets (min-h-11 per button)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All wizard features (types, store, components, orchestrator hook, route, survey, resume, door list, ARIA) are complete
- Ready for Plan 05 (final verification/polish) or Phase 32 (phone banking reuse of InlineSurvey)

---
*Phase: 31-canvassing-wizard*
*Completed: 2026-03-15*
