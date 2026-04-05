---
status: resolved
trigger: "FIELD-07 door-knock submit returns HTTP 422 Unprocessable Entity, blocking E2E proof and M002 milestone closure"
created: 2026-04-04T00:00:00Z
updated: 2026-04-05
---

## Current Focus

hypothesis: After a successful contact submit with survey, handleSubmitContact calls maybeAdvanceAfterHouseholdSettled which only advances when ALL entries in the current household are completed. At "100 Survey Ave" (2 residents), recording one resident leaves the other pending -> allDone=false -> wizard stays on Door 1 of 3. The test expects the contact submit to advance past this household.
test: Change handleSubmitContact's advance behavior to unconditionally advance to the next household (not gated by allDone).
expecting: After supporter save, currentAddressIndex increments 0 -> 1, UI shows "Door 2 of 3" at revisitAddress (200 Survey Ave).
next_action: Update useCanvassingWizard.ts handleSubmitContact to advance unconditionally; update unit tests accordingly.

## Symptoms

expected: POST /api/v1/campaigns/:campaignId/walk-lists/:walkListId/door-knocks returns 200/201 with persisted door-knock record AND the wizard advances to the next door after the user clicks "Save Door Knock" from the InlineSurvey sheet.
actual: 422 was fixed in commit that added voter_id to survey responses. New distinct issue: after a successful save, household-door-position stays at "Door 1 of 3" instead of advancing to "Door 2 of 3".
errors: E2E assertion at web/e2e/field-mode.volunteer.spec.ts:1008 — expected "Door 2 of 3", got "Door 1 of 3" after 9 polling attempts.
reproduction: E2E_USE_DEV_SERVER=1 API_PROXY_TARGET=http://localhost:49371 playwright test e2e/field-mode.volunteer.spec.ts --grep 'FIELD-07' --project volunteer
started: M002-S04 wrap-up; commits d8bcc91 (extended door-knock schema) and c9f37f6 (refactored to hold drafts until online). The Door-2 assertion was added in e85e1eb and has NEVER passed before today because earlier assertions (survey-response readback) always failed first. This is newly exposed by the 422 fix.

## Eliminated

- hypothesis: Query key mismatch after Phase 75-04 consolidation
  evidence: useDoorKnockMutation.onSuccess invalidates ["walk-list-entries-enriched", campaignId, walkListId] which matches useEnrichedEntries' queryKey exactly. useCanvassing.test.ts:82 asserts this alignment. No mismatch.
  timestamp: 2026-04-05T10:25:00Z

- hypothesis: Draft state not cleared after successful online submit
  evidence: handleSubmitContactDraft calls closeDraft() only after submission.saved. But closing the draft does not affect currentAddressIndex. The draft clearing is not in the advance path.
  timestamp: 2026-04-05T10:25:00Z

- hypothesis: Mutation's onSuccess runs after mutateAsync resolves, causing stale state read in maybeAdvanceAfterHouseholdSettled
  evidence: In react-query, onSuccess callbacks run before mutateAsync resolves. submitDoorKnock awaits mutateAsync THEN calls maybeAdvanceAfterHouseholdSettled, which reads useCanvassingStore.getState() — state IS updated by the time we read it. Verified by tracing: recordOutcome is called inside onSuccess, setState is sync, getState reads updated state.
  timestamp: 2026-04-05T10:25:00Z

## Evidence

- timestamp: 2026-04-05T10:20:00Z
  checked: web/e2e/helpers.ts fixture construction for FIELD-07 (lines 400-424)
  found: "100 Survey Ave" (household 1) has TWO residents: Casey and Jordan. revisitAddress "200 Survey Ave" (household 2) has ONE resident: Taylor. "300 Survey Ave" (household 3) has ONE resident: Morgan. entryCount >= 4 assertion confirms 4 walk list entries across 3 households.
  implication: Clicking "supporter" for ONE voter at household 1 leaves the other resident pending. maybeAdvanceAfterHouseholdSettled's allDone check returns false -> no advance.

- timestamp: 2026-04-05T10:20:00Z
  checked: web/src/hooks/useCanvassingWizard.ts handleSubmitContact (lines 271-313) -> submitDoorKnock (line 202) -> maybeAdvanceAfterHouseholdSettled (line 187)
  found: handleSubmitContact passes advanceOnSuccess:true to submitDoorKnock. On success, submitDoorKnock calls maybeAdvanceAfterHouseholdSettled which only advances if every entry in currentHousehold has a completedOutcome or is skipped. For a 2-resident household with 1 submit, allDone=false.
  implication: Advance logic is gated on entire-household completion; blocks advance after per-voter contact submits.

- timestamp: 2026-04-05T10:20:00Z
  checked: Whether the Door-2 assertion has ever passed in CI/local
  found: S04/T03 summary ".gsd/milestones/M002-62wd19/slices/S04/tasks/T03-SUMMARY.md" documents 3 consecutive failing runs at the survey-response readback assertion, which appears BEFORE the "Door 2 of 3" assertion. The test has never reached line 1008 successfully.
  implication: The "Door 2 of 3" expectation was never exercised under real conditions. This bug is newly-exposed by the 422 fix.

- timestamp: 2026-04-05T10:20:00Z
  checked: web/src/components/field/OutcomeGrid.tsx and HouseholdCard.tsx
  found: Each VoterCard renders its own OutcomeGrid with data-tour="outcome-grid". outcomeGrid.getByRole("button", {name:/supporter/i}) matches the first VoterCard's supporter button in the current household (voter 1 of household 1).
  implication: Test records contact for ONLY voter 1 (Casey) at household 1, leaving voter 2 (Jordan) pending.

- timestamp: 2026-04-05T10:25:00Z
  checked: AUTO_ADVANCE_OUTCOMES set and outcome flow for non-contact outcomes (not_home, etc.)
  found: Simple outcomes go through handleOutcome which calls submitDoorKnock with advanceOnSuccess:AUTO_ADVANCE_OUTCOMES.has(result). This uses the same allDone gate — consistent with product intent that not_home waits for all residents.
  implication: The gated-advance model is correct for simple outcomes. The question is whether contact-submits (deep per-voter record with survey + notes) should use the same gate. Test and hint indicate they should not.

## Resolution

root_cause: handleSubmitContact in useCanvassingWizard.ts relies on maybeAdvanceAfterHouseholdSettled to advance the wizard, which only fires when every entry in the current household is completed or skipped. For multi-resident households, recording a deep contact (supporter/undecided/opposed/refused with survey) for ONE voter leaves other residents pending, so allDone is false and currentAddressIndex never increments. The E2E test expects advance after a single contact submit, consistent with product intent: after a deep per-voter save, the volunteer should move to the next household and can revisit remaining residents via All Doors.
fix: |
  In web/src/hooks/useCanvassingWizard.ts, change handleSubmitContact so that on successful save it advances unconditionally (calls advanceRef.current() directly) rather than going through the allDone-gated maybeAdvanceAfterHouseholdSettled. Keep handleOutcome (simple outcomes), handleBulkNotHome, and handlePostSurveyAdvance using the gated advance — their semantics (wait for household) is still correct.
verification: |
  - Unit: useCanvassingWizard.test.ts "holds contact outcomes as drafts until the final submit path runs" still passes (uses 1-entry-per-household fixture so allDone would have been true anyway).
  - Unit: add/extend a test asserting currentAddressIndex increments after handleSubmitContact even when household has remaining entries.
  - TypeScript: npx tsc --noEmit passes clean.
  - E2E: FIELD-07 reaches line 1008 assertion and passes — household-door-position shows "Door 2 of 3" with revisitAddress visible.
files_changed:
  - web/src/types/walk-list.ts
  - web/src/hooks/useCanvassingWizard.ts
  - web/src/hooks/useCanvassingWizard.test.ts
