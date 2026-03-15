---
phase: 32-phone-banking-field-mode
plan: 02
subsystem: ui
tags: [react, zustand, phone-banking, tanstack-router, react-query, accessibility]

# Dependency graph
requires:
  - phase: 32-phone-banking-field-mode
    provides: calling.ts types, callingStore, generalized OutcomeGrid
  - phase: 31-canvassing-wizard
    provides: FieldHeader, FieldProgress, InlineSurvey, VoterCard pattern, canvassing types
provides:
  - useCallingSession orchestrator hook with auto check-in, batch claiming, pre-fetch
  - PhoneNumberList component with tel: links, long-press copy, prior attempt indicators
  - CallingVoterCard with voter detail enrichment (party, propensity, age via useVoter)
  - CompletionSummary with session stats display
  - Full phone banking route replacing placeholder
affects: [32-03, phone-banking-session-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [orchestrator hook composing store + API mutations + derived state, custom header with back arrow intercepting navigation for confirmation dialog]

key-files:
  created:
    - web/src/hooks/useCallingSession.ts
    - web/src/components/field/PhoneNumberList.tsx
    - web/src/components/field/CallingVoterCard.tsx
    - web/src/components/field/CompletionSummary.tsx
  modified:
    - web/src/routes/field/$campaignId/phone-banking.tsx

key-decisions:
  - "Custom header replaces FieldHeader in main calling view to intercept back arrow for end session confirmation"
  - "Batch claim uses inline mutation (not modified useClaimEntry) to override batch_size to 5"
  - "CallingVoterCard fetches voter detail via useVoter for party/propensity/age enrichment per locked decision"

patterns-established:
  - "Calling orchestrator hook pattern: init guard via useRef, batch claiming, pre-fetch at threshold"
  - "Long-press copy pattern: onTouchStart/End/Move with 500ms timeout for clipboard"

requirements-completed: [PHONE-01, PHONE-02, PHONE-03, PHONE-04, PHONE-05, PHONE-06, PHONE-07, A11Y-05]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 32 Plan 02: Calling Flow UI Summary

**Full phone banking calling flow with orchestrator hook, voter card enrichment, tap-to-call via tel: links, outcome recording, inline survey on Answered, and session lifecycle management**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T22:39:55Z
- **Completed:** 2026-03-15T22:42:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built useCallingSession orchestrator hook with auto check-in, batch claiming (5 entries), pre-fetch at 2 remaining, and full session lifecycle
- Created PhoneNumberList with tel: native dialer links, long-press clipboard copy with toast, prior attempt indicators, and terminal number strikethrough
- Created CallingVoterCard with useVoter enrichment showing party badge, propensity score, age, and call attempt history
- Replaced placeholder phone-banking route with complete calling flow including loading/error/empty/complete states, ARIA live region, Skip, End Session with AlertDialog confirmation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create orchestrator hook, PhoneNumberList, CallingVoterCard, CompletionSummary** - `fb7d87e` (feat)
2. **Task 2: Build phone banking route with full calling flow** - `7cc0160` (feat)

## Files Created/Modified
- `web/src/hooks/useCallingSession.ts` - Orchestrator hook composing callingStore + API mutations + derived state
- `web/src/components/field/PhoneNumberList.tsx` - Phone numbers with Call button, type labels, prior attempt status, long-press copy
- `web/src/components/field/CallingVoterCard.tsx` - Voter context card with party/propensity/age from useVoter and integrated phone numbers
- `web/src/components/field/CompletionSummary.tsx` - Session completion screen with stats and Back to Hub
- `web/src/routes/field/$campaignId/phone-banking.tsx` - Full phone banking calling flow route

## Decisions Made
- Custom header in main calling view (not FieldHeader) to intercept back arrow click and open end session AlertDialog instead of navigating directly
- Batch claim uses inline mutation with api.post rather than modifying the shared useClaimEntry hook (which defaults to batch_size: 1)
- CallingVoterCard calls useVoter(campaignId, voterId) to fetch full voter detail for party/propensity/age display per the locked context decision

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phone banking calling flow complete, ready for Plan 03 (testing/polish)
- All PHONE requirements and A11Y-05 fulfilled
- OutcomeGrid, FieldProgress, InlineSurvey reused without modification

---
*Phase: 32-phone-banking-field-mode*
*Completed: 2026-03-15*
