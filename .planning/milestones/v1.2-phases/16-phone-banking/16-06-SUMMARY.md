---
phase: 16-phone-banking
plan: "06"
subsystem: ui
tags: [react, tanstack-router, tanstack-query, phone-banking, calling-screen]

requires:
  - phase: 16-02
    provides: useClaimEntry, useRecordCall, useSelfReleaseEntry hooks in usePhoneBankSessions.ts
  - phase: 16-04
    provides: useCallList hook for fetching call list details including script_id

provides:
  - Active calling screen at /sessions/$sessionId/call with full claim-record-skip lifecycle
  - VoterInfoPanel showing voter name and selectable phone number buttons
  - OutcomePanel rendering OUTCOME_GROUPS with Connected/Unanswered/Terminal button variants
  - SurveyPanel with inline useQuery for survey questions; notes textarea always shown
  - State machine: idle → claiming → claimed → recorded → complete

affects:
  - Any future caller experience enhancements (survey full implementation, address display)

tech-stack:
  added: []
  patterns:
    - Local state machine using discriminated union type for complex UI flow (CallingState)
    - call_started_at captured at claim time; call_ended_at captured at outcome click time
    - survey_responses payload included only when result_code === "answered"
    - Sub-components (VoterInfoPanel, SurveyPanel, OutcomePanel) co-located in single route file

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx
  modified:
    - web/src/routeTree.gen.ts

key-decisions:
  - "Inline useQuery for script questions (not a dedicated hook) — hook does not exist yet; added TODO comment for future extraction"
  - "notes textarea always shown — provides consistent UI regardless of script_id; notes field optional in RecordCallPayload"
  - "SurveyPanel receives campaignId and scriptId props (not session) — avoids prop drilling session object and aligns with narrowest required interface"
  - "state.phase === recording removed from layout — plan showed claimed|recording as union but recording phase was unused in handleOutcome (transitions directly to recorded); simplified to claimed only"

patterns-established:
  - "CallingState discriminated union: guards on state.phase === 'claimed' before mutating"
  - "handleClaim resets surveyResponses and notes on new claim — clean state for each voter"

requirements-completed:
  - PHON-05
  - PHON-06
  - PHON-07
  - PHON-08

duration: 100sec
completed: 2026-03-11
---

# Phase 16 Plan 06: Active Calling Screen Summary

**Stateful calling screen with claim/record/skip lifecycle, voter info panel, grouped outcome buttons (Connected/Unanswered/Terminal), and inline survey support via useQuery**

## Performance

- **Duration:** 100 seconds (~1.7 min)
- **Started:** 2026-03-11T21:25:28Z
- **Completed:** 2026-03-11T21:26:48Z
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 auto-updated by TanStack Router)

## Accomplishments

- Full active calling screen at `/campaigns/$campaignId/phone-banking/sessions/$sessionId/call`
- State machine with 5 phases: idle, claiming, claimed, recorded, complete — handles all lifecycle transitions
- VoterInfoPanel shows voter name and all phone numbers as selectable buttons (highlights active selection)
- OutcomePanel renders OUTCOME_GROUPS with button variants: default (Connected), outline (Unanswered), destructive (Terminal)
- SurveyPanel fetches questions via inline useQuery when script_id present; notes textarea always rendered
- Payload correctness: call_started_at set at claim time, call_ended_at set at outcome click, survey_responses only when answered

## Task Commits

1. **Task 1: Active calling screen — claim lifecycle, voter info panel, outcome recording, skip** - `eb14a7c` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx` - Active calling screen with all sub-components (VoterInfoPanel, SurveyPanel, OutcomePanel) and state machine
- `web/src/routeTree.gen.ts` - Auto-updated by TanStack Router to register new call route

## Decisions Made

- Used inline `useQuery` for script questions rather than a dedicated hook — the `useScript` hook doesn't exist yet; added TODO comment pointing to where it should live
- `notes` textarea always shown (not conditioned on script_id) — provides consistent UX and notes field is optional in RecordCallPayload
- Removed `recording` phase from the active layout union — the plan showed `claimed | recording` but `handleOutcome` transitions directly from `claimed` to `recorded` (no intermediate rendering needed)

## Deviations from Plan

None - plan executed exactly as written. Minor simplification: `recording` phase not rendered separately (transitions directly to `recorded` per handleOutcome logic).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All PHON-05 through PHON-08 requirements fulfilled by this screen
- Phase 16 phone banking is now complete (6/6 plans done)
- Future enhancement: extract inline `useQuery` into dedicated `useScript(campaignId, scriptId)` hook when survey support is hardened

---
*Phase: 16-phone-banking*
*Completed: 2026-03-11*
