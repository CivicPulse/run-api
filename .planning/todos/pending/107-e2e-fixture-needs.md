# 107 E2E Fixture Needs

**Filed:** 2026-04-10 (Plan 107-08 execution)
**Owner:** v1.19 test infra phase or whoever picks up phone-banking E2E
**Related:** Phase 107 D-17, FORMS-01

## Background

Plan 107-08 created `web/e2e/canvassing-wizard.spec.ts` with five passing
Playwright tests covering CANV-01 (house-level + voter-level auto-advance),
CANV-02 (skip + Undo toast), and CANV-03 (empty-notes save + "(optional)"
label affordance).

The sixth planned test — **FORMS-01 D-17: phone-banking call notes are
optional** — is currently `test.skip()` in the spec because the
phone-banking field-mode flow needs a non-trivial mock surface to reach the
`InlineSurvey` panel from a clean E2E start:

1. `GET /api/v1/campaigns/{id}/field/me` → must return a `phone_banking.session_id`
2. `GET /api/v1/campaigns/{id}/phone-bank-sessions/{sid}` → session detail
   (status, call_list_id, script_id)
3. `POST /api/v1/campaigns/{id}/phone-bank-sessions/{sid}/checkin`
4. `POST /api/v1/campaigns/{id}/call-lists/{cid}/claim` (batch claim)
5. `GET /api/v1/campaigns/{id}/voters/{vid}/phones` (selected number)
6. Survey script `GET /api/v1/campaigns/{id}/surveys/{scriptId}`
7. `POST /api/v1/campaigns/{id}/phone-bank-sessions/{sid}/calls` (record call)

That's ~7 mock routes vs the canvassing flow's ~4. Beyond fixture cost, the
calling-session state machine (pending → claiming → ready → in-call → recording)
adds reproducibility risk that the canvassing wizard doesn't have.

## What we need

Either:

- **A.** A reusable phone-banking mock helper (`web/e2e/helpers/phone-banking-mocks.ts`)
  modeled after the canvassing mocks already in `phase35-touch-targets.spec.ts`,
  exposing a single `setupPhoneBankingMocks(page, { sessionId, scriptId, voter })`
  function. Once that helper exists, FORMS-01 D-17 becomes ~30 lines of test code.

- **B.** A real fixture seeded by `scripts/seed.py` that creates a phone-bank
  session with a single claimable voter and a 1-question survey script attached,
  scoped to a deterministic ID (`E2E-FORMS-01-SESSION`). The volunteer fixture
  picks it up automatically. Heavier infra cost but exercises the real backend.

Recommendation: **Option A** is consistent with the existing pattern in
`phase35-touch-targets.spec.ts` and avoids growing the seed script.

## Coverage already in place (no regression risk during the gap)

- **Vitest unit:** `web/src/components/field/InlineSurvey.test.tsx` carries 7
  unit tests including a regression guard at `isControlled=true` +
  `notesRequired={false}` → Save enabled with empty notes (Plan 107-06,
  commit `cd7e629`). This is the load-bearing decoupling test.
- **Wiring:** `grep -n 'notesRequired={false}' web/src/routes/field/$campaignId/phone-banking.tsx`
  → 1 hit (line 479). Static guarantee that the prop is wired through.
- **Plan 107-06 SUMMARY** documents D-19 (phone-banking notes optional) as
  satisfied at the source.

So the FORMS-01 D-17 contract is unit-tested and statically wired; only the
end-to-end "user clicks Save with empty notes in phone banking" path is
deferred. Risk of regression slipping past unit tests is low because the
shared `InlineSurvey` component is the only locus of the bug.

## Acceptance for closing this todo

- Mock helper or seed fixture exists
- `test.skip` in `web/e2e/canvassing-wizard.spec.ts` is removed and
  replaced with the live test
- `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts` exits 0 with 6
  passing tests
