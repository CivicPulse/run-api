# Phase 107 — Field-Mode Form Requiredness Audit (FORMS-01)

**Phase:** 107-canvassing-wizard-fixes
**Requirement:** FORMS-01 — Field-mode form audit identifies every `required`
validator and every form field in the canvassing and phone-banking flows;
each is reviewed against its UX intent and over-eager validations are removed.
**Decision references:** D-12 (audit format), D-13 (scope = canvassing +
phone-banking field mode only), D-14 (over-eager criterion), D-15 (product
bugs get todos, not fixes), D-19 (phone-banking call notes disposition).
**Audited on:** 2026-04-11 (post Plans 04/05/06).
**Audit method:** `rg` across `web/src/components/field/*.tsx` (33 files) and
`web/src/routes/field/$campaignId/**/*.tsx` (3 route files). Patterns:
`required`, `\.min\(1`, `trim\(\)\.length`, `disabled=\{`, `canSubmit`,
`isValid`, `useForm`, `zodResolver`, `notesRequired`. See RESEARCH.md §4 for
the full methodology.

## D-14 criterion (binary)

A save-blocking validator is JUSTIFIED only if absence of the field would
cause **data integrity loss** (the API genuinely can't process the record
without it) OR **real-world harm** (e.g., sending an empty SMS to a voter).
Everything else is over-eager.

## Save-blocking validators (the actual audit)

| # | File | Line | Field | Current validator | Intent | Disposition | Justification | Tests added |
|---|------|------|-------|-------------------|--------|-------------|---------------|-------------|
| 1 | `web/src/components/field/InlineSurvey.tsx` | 146, 163 (canvassing path) | `notes` (canvassing door-knock notes) | `requiresNotes = props.notesRequired ?? false` → `isNotesComplete = !requiresNotes \|\| notes.trim().length > 0` gates `canSubmitControlled` | Block save until volunteer types notes | **REMOVED** | CANV-03 bug. Notes are bonus context; the outcome IS the record. Backend already accepts empty notes (locked by `tests/integration/test_door_knocks.py` per Plan 03). D-09 decoupling via explicit `notesRequired?: boolean` prop (default `false`); canvassing route at `web/src/routes/field/$campaignId/canvassing.tsx:618` passes `notesRequired={false}`. Landed in Plan 06 commit `cd7e629`. | `web/src/components/field/InlineSurvey.test.tsx` (7 tests, Plan 06) + `web/src/hooks/useCanvassingWizard.test.ts` empty-notes coverage (Plan 04) + `web/e2e/canvassing-wizard.spec.ts` empty-notes E2E (Plan 08) |
| 2 | `web/src/components/field/SmsComposer.tsx` | 70 | `body` (SMS message body) | `body.trim().length === 0` disables Send | Prevent sending empty SMS | **KEPT** | Safety-critical per D-14: sending an empty SMS is real-world harm — recipient confusion, carrier flagging, wasted credit, and the action is irrecoverable once dispatched. Data integrity: the carrier rejects empty bodies. | n/a — behavior unchanged. |
| 3 | `web/src/components/field/SmsBulkSendSheet.tsx` | 93 | `body` (bulk SMS body) | `body.trim().length === 0` disables Queue | Prevent bulk-sending empty SMS | **KEPT** | Safety-critical per D-14: same rationale as #2, amplified by the bulk-send blast radius across N recipients. | n/a — behavior unchanged. |
| 4 | `web/src/components/field/InlineSurvey.tsx` | 146, 163, 316 (controlled-mode `field-call-notes` block at 301-323) | `notes` (phone-banking call notes) | Was coupled to `requiresNotes = isControlled` before Plan 06; now gated on the explicit `notesRequired` prop, which `web/src/routes/field/$campaignId/phone-banking.tsx:479` passes as `false` | Block save until volunteer types call notes | **REMOVED** (per D-19) | D-19 extends the canvassing rule to phone banking: notes are optional, the volunteer marks the call outcome and may add notes but isn't blocked. "Consistency with CANV-03; outcome IS the record, notes are bonus context." Phone-banking route explicitly passes `notesRequired={false}` as of Plan 06 commit `cd7e629`. | `InlineSurvey.test.tsx` regression guard test `"isControlled=true with notesRequired=false does NOT require notes"` (Plan 06) + phone-banking empty-notes E2E in `canvassing-wizard.spec.ts` (Plan 08, if added per D-17) |

## Kept-for-trail items (NOT save-blocking, documented for completeness)

| File | Line | Field | What it is | Why it's not a hit |
|------|------|-------|------------|--------------------|
| `web/src/components/field/InlineSurvey.tsx` | 158-161 | `isSurveyComplete` | Gates controlled-mode submit when survey questions exist but are unanswered | Survey answers ARE data integrity — the survey response is the point of the answered call. **KEPT.** Do not confuse with the notes validator. |
| `web/src/components/field/InlineSurvey.tsx` | 316 | `requiresNotes && !isNotesComplete` destructive copy | Inline error paragraph "Add notes before saving this answered call." | Only renders when caller opts in via `notesRequired={true}`. Default field-mode call sites pass `false`, so this paragraph never renders in canvassing or phone banking. Future opt-in (e.g., a non-field campaign-manager flow) can still use it. |
| `web/src/components/field/OutcomeGrid.tsx` | (per RESEARCH §4) | `disabled={disabled}` | While-saving guard (+ while-skip-pending per Plan 05) | This is a race-guard, not a requiredness validator. Not in FORMS-01 scope. |
| `web/src/components/field/PhoneNumberList.tsx` | (per RESEARCH §4) | `disabled={isDisabled}` | Gated on calling-hours and active-call state | Operational gate, not requiredness. Not in FORMS-01 scope. |

## Form libraries checked

- **`useForm` / `zodResolver`**: NOT USED in field-mode per RESEARCH.md §4. The
  field-mode wizard uses local `useState`; this is intentional and CONTEXT.md
  §code_context confirms it is out of scope to refactor for v1.18.
- **HTML `required` attribute**: ZERO occurrences in
  `web/src/components/field/` per `rg 'required' web/src/components/field/`.
- **`.min(1)` Zod validators**: ZERO occurrences in field-mode. Field forms
  do not use zod schemas at the call-recording layer.

## Audit-discovered product bugs (D-15 → `.planning/todos/pending/`)

None surfaced. The audit is binary — `REMOVED` or `KEPT` — and all four hits
have clear dispositions per D-14 and D-19. If on review the user flips the
D-19 disposition back to "keep phone-banking notes required," the change is
a single-line flip in `web/src/routes/field/$campaignId/phone-banking.tsx:479`
(`notesRequired={false}` → `notesRequired={true}`) plus a row update here.

## Summary

- **Total save-blocking validators in field mode:** 4
- **Removed:** 2 (InlineSurvey canvassing notes, phone-banking call notes — both
  via the same `notesRequired` prop default of `false`)
- **Kept:** 2 (SmsComposer body, SmsBulkSendSheet body — both safety-critical)
- **Net effect:** Volunteers can save canvassing outcomes and phone-banking
  call records without typing notes. SMS composition still requires a body.
- **Code landed in:** Plan 06 (`107-06-PLAN.md`, commit `cd7e629`). This
  document is the audit trail per D-12.

## Cross-references

- Requirements: FORMS-01 (milestone v1.18, traceability row in REQUIREMENTS.md)
- Decision log: CONTEXT.md §Decisions D-12, D-13, D-14, D-15, D-19
- Research log: RESEARCH.md §4 (full inventory) and §6 risk #5 (phone-banking
  call-site caveat)
- Code: `web/src/components/field/InlineSurvey.tsx`,
  `web/src/routes/field/$campaignId/canvassing.tsx`,
  `web/src/routes/field/$campaignId/phone-banking.tsx`,
  `web/src/components/field/SmsComposer.tsx`,
  `web/src/components/field/SmsBulkSendSheet.tsx`
- Tests: `web/src/components/field/InlineSurvey.test.tsx`,
  `web/src/hooks/useCanvassingWizard.test.ts`,
  `web/e2e/canvassing-wizard.spec.ts` (Plan 08),
  `tests/integration/test_door_knocks.py`
