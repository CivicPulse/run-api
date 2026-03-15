---
phase: 32-phone-banking-field-mode
plan: 01
subsystem: ui
tags: [zustand, typescript, react, phone-banking, outcome-grid]

# Dependency graph
requires:
  - phase: 31-canvassing-wizard
    provides: OutcomeGrid component, canvassing types, canvassingStore pattern
provides:
  - OutcomeConfig shared type for both canvassing and phone banking outcome grids
  - calling.ts types (CallResultCode, CALL_OUTCOME_CONFIGS, formatPhoneDisplay, getPhoneStatus, CallingEntry, SessionStats)
  - callingStore.ts Zustand store with sessionStorage persistence
  - Generalized OutcomeGrid accepting OutcomeConfig[] props
  - CANVASSING_OUTCOMES config array
  - phone_attempts field on CallListEntry
affects: [32-02, 32-03, phone-banking-calling-flow, phone-banking-session-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared OutcomeConfig interface for cross-feature outcome grids, string-typed outcome callbacks with domain-specific casting]

key-files:
  created:
    - web/src/types/calling.ts
    - web/src/stores/callingStore.ts
  modified:
    - web/src/types/canvassing.ts
    - web/src/components/field/OutcomeGrid.tsx
    - web/src/components/field/VoterCard.tsx
    - web/src/components/field/HouseholdCard.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/types/call-list.ts

key-decisions:
  - "OutcomeGrid uses string callback type with domain-specific casting at call sites"
  - "CANVASSING_OUTCOMES built from existing OUTCOME_COLORS map to avoid duplication"

patterns-established:
  - "OutcomeConfig pattern: shared interface for any feature's outcome grid"
  - "String-typed callbacks through generic components, cast to domain types at consumption"

requirements-completed: [PHONE-07]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 32 Plan 01: Types, Store, and OutcomeGrid Summary

**Calling types with 8 outcome configs, Zustand sessionStorage store, and generalized OutcomeGrid shared by canvassing and phone banking**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T22:35:08Z
- **Completed:** 2026-03-15T22:37:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created calling.ts with OutcomeConfig, CallResultCode, CALL_OUTCOME_CONFIGS (8 outcomes), phone helpers, and session types
- Generalized OutcomeGrid to accept OutcomeConfig[] prop, eliminating hardcoded canvassing dependency
- Created callingStore.ts with sessionStorage persistence mirroring canvassingStore pattern
- Added phone_attempts field to CallListEntry for prior-try indicators

## Task Commits

Each task was committed atomically:

1. **Task 1: Create calling types and generalize OutcomeGrid** - `213d493` (feat)
2. **Task 2: Create Zustand calling store** - `426a1ed` (feat)

## Files Created/Modified
- `web/src/types/calling.ts` - OutcomeConfig, CallResultCode, CALL_OUTCOME_CONFIGS, formatPhoneDisplay, getPhoneStatus, SessionStats, CallingEntry
- `web/src/stores/callingStore.ts` - Zustand persist store for calling session state
- `web/src/types/canvassing.ts` - Added CANVASSING_OUTCOMES config array
- `web/src/components/field/OutcomeGrid.tsx` - Generalized to accept OutcomeConfig[] prop
- `web/src/components/field/VoterCard.tsx` - Passes CANVASSING_OUTCOMES, string callback type
- `web/src/components/field/HouseholdCard.tsx` - Updated onOutcomeSelect to string type
- `web/src/routes/field/$campaignId/canvassing.tsx` - Cast string results to DoorKnockResultCode
- `web/src/types/call-list.ts` - Added phone_attempts field to CallListEntry

## Decisions Made
- OutcomeGrid callback uses `string` type (not union types) for generic reuse; domain-specific types restored via casting at call sites
- CANVASSING_OUTCOMES references existing OUTCOME_COLORS map rather than duplicating color values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- calling.ts types ready for Plan 02 calling flow UI
- callingStore ready for session state management
- OutcomeGrid ready to render CALL_OUTCOME_CONFIGS in phone banking screens

---
*Phase: 32-phone-banking-field-mode*
*Completed: 2026-03-15*
