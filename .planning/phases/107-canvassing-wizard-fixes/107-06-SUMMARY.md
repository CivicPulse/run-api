---
phase: 107
plan: 06
subsystem: web/field/canvassing
tags: [canvassing, inline-survey, forms, accessibility, ui]
requires:
  - 107-04
provides:
  - InlineSurvey notesRequired explicit prop (D-09)
  - Phone-banking notes parity with canvassing (D-19)
affects:
  - web/src/components/field/InlineSurvey.tsx
  - web/src/routes/field/$campaignId/canvassing.tsx
  - web/src/routes/field/$campaignId/phone-banking.tsx
tech-stack:
  added: []
  patterns:
    - explicit-prop-defaults
    - tdd-red-green
key-files:
  created:
    - web/src/components/field/InlineSurvey.test.tsx
  modified:
    - web/src/components/field/InlineSurvey.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/routes/field/$campaignId/phone-banking.tsx
key-decisions:
  - "D-09: Replace `requiresNotes = isControlled` coupling with explicit `notesRequired?: boolean` prop, default `false`"
  - "D-19: Phone-banking call notes follow canvassing rule (notes optional) — both call sites pass `notesRequired={false}`"
  - "UI-SPEC: Notes label uses inline muted span '(optional)' rather than a Badge component (Linear/Stripe-clean tone)"
requirements-completed: [CANV-03]
duration: 8 min
completed: 2026-04-10
---

# Phase 107 Plan 06: CANV-03 InlineSurvey notesRequired Decoupling Summary

**One-liner:** Replaced the load-bearing `requiresNotes = isControlled` coupling
in `InlineSurvey.tsx` with an explicit `notesRequired?: boolean` prop (default
`false`), removing the last save-blocking notes validator from the canvassing
flow and propagating the same rule to phone-banking per D-19.

## Outcome

CANV-03 fixed at the source. The volunteer can now save an answered call (door
knock OR phone banking) with empty notes — the textarea stays visible with a
muted "(optional)" inline label, the destructive "Add notes before saving"
paragraph no longer renders, and the Save button is enabled the moment the
survey questions are answered. The new `InlineSurvey.test.tsx` carries 7 unit
tests including a regression guard that exercises the exact `isControlled=true`
+ `notesRequired=false` combination — proving the legacy coupling is fully
decoupled.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (RED)   | Add 7 failing InlineSurvey unit tests | `97a94ae` | `web/src/components/field/InlineSurvey.test.tsx` |
| 1 (GREEN) | Decouple notesRequired + update both call sites | `cd7e629` | `InlineSurvey.tsx`, `canvassing.tsx`, `phone-banking.tsx` |

**Tasks:** 1 (TDD: RED + GREEN, no REFACTOR needed)
**Files modified:** 3
**Files created:** 1
**Duration:** ~8 min
**Started:** 2026-04-10T23:33:00Z
**Completed:** 2026-04-10T23:35:30Z

## Implementation Notes

### D-09 — Explicit prop replaces isControlled coupling

The legacy line at `InlineSurvey.tsx:135`:

```ts
const requiresNotes = isControlled
```

…became:

```ts
const requiresNotes = props.notesRequired ?? false
```

The `notesRequired?: boolean` field was added to `BaseInlineSurveyProps` so
both the `direct-save` and `controlled` discriminated-union branches inherit
it without divergence. Default is `false` — the canvassing/phone-banking
common case — and both call sites pass it explicitly per RESEARCH.md §6 risk
#5 (explicit > implicit at integration boundaries).

### D-08 — Notes UI affordance

Per UI-SPEC §"Notes Field Affordance", the controlled-mode notes label now
renders:

```tsx
<Label htmlFor="field-call-notes" className="text-sm font-medium">
  Notes
  {!requiresNotes && (
    <span className="text-muted-foreground font-normal ml-1">(optional)</span>
  )}
</Label>
```

The placeholder also adapts: `"Anything worth remembering? (optional)"` when
`!requiresNotes`, falling back to the legacy `"What happened on this call?"`
copy when notes are required (preserved for any future caller that opts in).

The destructive paragraph `"Add notes before saving this answered call."` is
now gated behind `{requiresNotes && !isNotesComplete && (...)}` — it cannot
render when notes are optional.

### D-19 — Phone-banking parity

Per the post-research D-19 decision, phone-banking adopts the same rule.
`web/src/routes/field/$campaignId/phone-banking.tsx:479` now passes
`notesRequired={false}` explicitly, matching the canvassing call site at
`web/src/routes/field/$campaignId/canvassing.tsx:618`. The FORMS-01 audit
in plan 08 will document this disposition.

### Survey-completeness gate untouched (RESEARCH §6 risk #6)

The `isSurveyComplete` calculation at line 147 was deliberately left alone.
The notes-required and survey-required gates are independent — answering
every survey question is still mandatory before Save enables, only the notes
requirement is now opt-in.

## Tests Added

`web/src/components/field/InlineSurvey.test.tsx` — 7 unit tests, all passing:

1. Renders label `Notes` with muted `(optional)` span when `notesRequired` is false (default)
2. Save button is enabled with empty notes when `notesRequired` is false
3. Save handler receives empty-string notes when user saves without typing
4. Does NOT render the `Add notes before saving` paragraph when `notesRequired` is false
5. When `notesRequired={true}`, Save is disabled with empty notes (legacy behavior preserved)
6. When `notesRequired={true}`, Save is enabled once notes has content
7. **Regression guard for D-09 decoupling:** `isControlled=true` + `notesRequired={false}` → Save enabled with empty notes (proves the old coupling is gone)

The tests pass an empty `scriptId=""` to the controlled-mode component so the
`useSurveyScript` query stays disabled and `requiresSurvey` becomes false —
isolating the notes-required logic under test from the survey-question gate.

## Acceptance Criteria — All Met

- `grep -n 'requiresNotes = isControlled' web/src/components/field/InlineSurvey.tsx` → 0 matches (legacy coupling removed)
- `grep -n 'notesRequired' web/src/components/field/InlineSurvey.tsx` → 3 matches (prop def + comment + usage)
- `grep -n 'notesRequired={false}' web/src/routes/field/$campaignId/canvassing.tsx` → 1 match (line 618)
- `grep -n 'notesRequired={false}' web/src/routes/field/$campaignId/phone-banking.tsx` → 1 match (line 479)
- `test -f web/src/components/field/InlineSurvey.test.tsx` → exists (7 `it(` blocks)
- `npx vitest run src/components/field/InlineSurvey.test.tsx` → 7/7 passing
- `npx tsc --noEmit` → clean (no new errors)

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-3 auto-fixes were
required; the source bug was a single coupled assignment and the fix scoped
cleanly to the four files in the plan's `files_modified` field.

## Authentication Gates

None — pure frontend refactor + unit tests, no auth surface touched.

## Issues Encountered

None.

## Known Stubs

None — the prop is fully wired through both call sites, the label and
placeholder copy are real, and the destructive paragraph is correctly gated.

## Next Phase Readiness

Plan 107-06 complete. Plan 107-05 (the parallel Wave 3 sibling) executes
independently. After both Wave 3 plans land, the phase advances to plan
107-07 (the FORMS-01 audit doc) and then to plan 107-08 (test coverage).

## Self-Check: PASSED

- `web/src/components/field/InlineSurvey.test.tsx` exists
- `web/src/components/field/InlineSurvey.tsx` modified (lines 17-32 prop addition, line 146 default, lines 295-307 label/paragraph gate)
- `web/src/routes/field/$campaignId/canvassing.tsx` line 618 has `notesRequired={false}`
- `web/src/routes/field/$campaignId/phone-banking.tsx` line 479 has `notesRequired={false}`
- Commits `97a94ae` (RED) and `cd7e629` (GREEN) both present in `git log`
- `cd web && npx vitest run src/components/field/InlineSurvey.test.tsx` → 7/7 PASS
- `cd web && npx tsc --noEmit` → clean
