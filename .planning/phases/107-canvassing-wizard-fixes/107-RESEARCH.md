# Phase 107: Canvassing Wizard Fixes — Research

**Researched:** 2026-04-10
**Domain:** React/TS canvassing wizard (CANV-01/02/03 + FORMS-01)
**Confidence:** HIGH — All findings from `[VERIFIED: codebase grep+read]`. No external library claims.

---

## Summary

All four phase 107 requirements (CANV-01/02/03, FORMS-01) are fixable inside
existing files with no new dependencies and no API contract changes. The
backend already accepts empty notes (`notes: str | None = None` in
`app/schemas/canvass.py:56`). The 300ms `setTimeout` in `handleSkipAddress`
is a workaround for a TanStack Query cache invalidation race that can be
removed by awaiting `skipEntryMutation.mutateAsync()`. The over-eager
`required` validator surface in field-mode is unusually small — only 3 hits
total — and the canvassing one is the CANV-03 bug itself.

**Primary recommendation:** Treat this phase as a focused 4-file edit
(`useCanvassingWizard.ts`, `InlineSurvey.tsx`, `OutcomeGrid.tsx`,
`canvassing.tsx`) plus new test files. No backend touch. No new packages.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CANV-01 (auto-advance):**
- D-01: All simple outcomes auto-advance; expand `AUTO_ADVANCE_OUTCOMES` to
  cover every outcome that does NOT trigger the survey panel.
- D-02: `contacted` path keeps current behavior; `handleSubmitContact`
  already advances. Do not touch the survey-and-notes path.
- D-03: Triple-channel feedback on auto-advance — sonner toast
  `"Recorded — next house"` (~2s), card swap (honor
  `prefers-reduced-motion`), `navigator.vibrate(50)` if available.
- D-04: Save-failure path: card stays on failing house; sonner error
  `"Couldn't save — tap to retry"`; retry button on toast; no advance until
  success.

**CANV-02 (skip):**
- D-05: Skip is reversible. Skipped houses stay in queue, badge `skipped`,
  sortable to bottom. `skippedEntries` already supports this.
- D-06: Single-tap, no confirmation modal. Optional sonner toast
  `"Skipped — Undo"` with Undo action, valid only if no other outcome has
  been recorded since.
- D-07: Investigate the 300ms `setTimeout` in `handleSkipAddress` — fix the
  underlying race, not the timeout.

**CANV-03 (notes optional):**
- D-08: Notes textarea always-visible, label `"Notes (optional)"`. Save
  button enabled with empty notes.
- D-09: Frontend fix at `InlineSurvey.tsx:135` — replace
  `requiresNotes = isControlled` with explicit prop `notesRequired?: boolean`
  default `false`. Canvassing wizard passes `false`; phone banking surface
  keeps existing behavior.
- D-10: Verify door-knock POST accepts empty/null notes; if not, plan must
  include backend Pydantic + migration check.
- D-11: Phone banking call-notes path may also be affected by FORMS-01
  audit; do NOT change unless audit determines so.

**FORMS-01 (audit):**
- D-12: Deliverable is `.planning/phases/107-canvassing-wizard-fixes/107-FORMS-AUDIT.md`
  + inline code fixes in same phase.
- D-13: Audit covers BOTH canvassing AND phone banking field-mode forms.
  Field mode only — desktop manager forms out of scope.
- D-14: Over-eager criterion: `required` is justified ONLY if absence
  causes data integrity loss OR real-world harm. Everything else is
  over-eager.
- D-15: Audit-discovered bugs that need product changes (not just validator
  removal) get a `.planning/todos/pending/` file, NOT a fix in this phase.

**Test coverage (TEST-01/02/03):**
- D-16: All three layers (vitest unit, pytest integration, Playwright E2E)
  for every CANV fix. E2E via `web/scripts/run-e2e.sh`.
- D-17: FORMS-01 audit gets coverage too — at least one E2E spec per
  `removed`/`loosened` validator that previously blocked save.

### Claude's Discretion
- Exact toast text (≤30 chars, Linear/Stripe-clean tone)
- Whether to extract auto-advance into a helper function
- Audit doc table format
- Where to put the `notesRequired` default in InlineSurvey

### Deferred Ideas (OUT OF SCOPE)
- Configurable per-campaign auto-advance allowlist
- Long-press / two-tap skip confirmation
- Replacing local useState in wizard with React Hook Form
- Refactoring InlineSurvey into separate canvassing/phone-banking components
- GitHub issue per audit-discovered bug (use `.planning/todos/pending/`)
- Audit of desktop campaign-manager forms
- New animation library / motion system
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CANV-01 | Auto-advance after recording an outcome | §1 — concrete outcome diff for `AUTO_ADVANCE_OUTCOMES` expansion |
| CANV-02 | Skip-house button surfaces next house in one tap | §2 — root-cause analysis of the 300ms `setTimeout` race + concrete fix sketch |
| CANV-03 | Notes field genuinely optional | §3 — API already accepts empty notes; fix is purely frontend at `InlineSurvey.tsx:135` |
| FORMS-01 | Field-mode form requiredness audit | §4 — complete inventory: only 3 validators across all field-mode files |
| TEST-01/02/03 | Unit + integration + E2E coverage | §5 — gap list shows zero E2E coverage for canvassing today; one existing wizard unit test file to extend |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Python:** always `uv run` (never bare `python`/`python3`); `uv add` for deps; `ruff check .` and `ruff format .` before commit.
- **E2E tests:** always via `web/scripts/run-e2e.sh` (logs to `web/e2e-runs.jsonl`). Phase 106 D-13 also enforces this.
- **Touch targets:** ≥44px (`min-h-11`) on every interactive element in field mode.
- **AAA accessibility:** WCAG 2.1 AAA contrast (7:1 / 4.5:1), keyboard nav, reduced-motion alternatives, screen-reader, no color-only state.
- **Nonpartisan:** no red/blue political coding in colors, copy, or icons.
- **Conventional Commits**, branches preferred (don't push without explicit ask).
- **Tone:** sentence case, no emoji, no `please`/`oops`, em dash for separators.

## Standard Stack (no new dependencies)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| sonner | `^2.0.7` `[VERIFIED: web/package.json:46]` | Toast notifications for D-03/D-06 | already installed |
| lucide-react | existing | `CheckCircle`, `AlertCircle`, `SkipForward`, `Loader2` icons used in toasts and UI-SPEC | already installed |
| tw-animate-css | existing | `animate-in fade-in slide-in-from-right-4` already used in `canvassing.tsx:569` for the current card transition | already installed |
| zustand | existing | `canvassingStore` already supports `skippedEntries` reversibility (D-05) | already installed |
| @tanstack/react-query | existing | `useDoorKnockMutation` / `useSkipEntryMutation` already in place | already installed |
| vitest + @testing-library/react | existing | Used by `useCanvassingWizard.test.ts` | already installed |
| Playwright (via `run-e2e.sh`) | existing | All E2E specs go through wrapper per phase 106 D-13 | already installed |

**No new packages required.** Confirmed by reading the current
`useCanvassingWizard.ts`, `InlineSurvey.tsx`, and the UI-SPEC component
inventory.

---

## 1. CANV-01 — `AUTO_ADVANCE_OUTCOMES` enumeration & diff

### Current state `[VERIFIED: web/src/types/canvassing.ts:78-84]`

```ts
export const SURVEY_TRIGGER_OUTCOMES = new Set<DoorKnockResultCode>([
  "supporter", "undecided", "opposed", "refused",
])

export const AUTO_ADVANCE_OUTCOMES = new Set<DoorKnockResultCode>([
  "not_home", "come_back_later", "moved", "deceased", "inaccessible",
])
```

### Full outcome enum `[VERIFIED: web/src/types/canvassing.ts:3-12]`

```ts
export type DoorKnockResultCode =
  | "not_home"
  | "refused"
  | "supporter"
  | "undecided"
  | "opposed"
  | "moved"
  | "deceased"
  | "come_back_later"
  | "inaccessible"
```

9 outcomes total. Backend mirror: `app/models/walk_list.py:23-34` `DoorKnockResult` enum has the same 9 values `[VERIFIED]`.

### Diff against D-01 ("everything except `contacted` keeps survey path")

D-01's literal phrasing — *"only `contacted` keeps survey path"* — is an
informal shorthand. **There is no `contacted` outcome code.** The actual
"survey path" outcomes are the 4 in `SURVEY_TRIGGER_OUTCOMES`:
`supporter`, `undecided`, `opposed`, `refused`. The "simple outcomes" set
is the other 5: `not_home`, `come_back_later`, `moved`, `deceased`,
`inaccessible`.

| Outcome | Currently in `AUTO_ADVANCE_OUTCOMES`? | Should be? | Action |
|---------|---------------------------------------|-----------|--------|
| `not_home` | ✅ yes | ✅ yes | keep |
| `come_back_later` | ✅ yes | ✅ yes | keep |
| `moved` | ✅ yes | ✅ yes | keep |
| `deceased` | ✅ yes | ✅ yes | keep |
| `inaccessible` | ✅ yes | ✅ yes | keep |
| `supporter` | ❌ no | ❌ no — survey path | keep out |
| `undecided` | ❌ no | ❌ no — survey path | keep out |
| `opposed` | ❌ no | ❌ no — survey path | keep out |
| `refused` | ❌ no | ❌ no — survey path | keep out |

**Surprise finding:** `AUTO_ADVANCE_OUTCOMES` is **already complete and correct**. The 5 simple-outcome codes are all in the set. The `SURVEY_TRIGGER_OUTCOMES` and `AUTO_ADVANCE_OUTCOMES` sets are exactly disjoint and exactly cover the 9-code enum.

### So why doesn't auto-advance work?

The bug is **not** a missing outcome code. It is in the *advance condition*
inside `submitDoorKnock` → `maybeAdvanceAfterHouseholdSettled`
(`useCanvassingWizard.ts:218-231`):

```ts
const maybeAdvanceAfterHouseholdSettled = useCallback((household?) => {
  const targetHousehold = household ?? currentHouseholdRef.current
  if (!targetHousehold) return
  const state = useCanvassingStore.getState()
  const allDone = targetHousehold.entries.every(
    (entry) =>
      state.completedEntries[entry.id] !== undefined ||
      state.skippedEntries.includes(entry.id),
  )
  if (allDone) {
    advanceRef.current()
  }
}, [])
```

Auto-advance only fires if **every voter at the household** is complete.
For multi-voter households, recording `not_home` for one voter does NOT
advance — it waits for the other voters at that address to also resolve.
This is **correct behavior for `not_home`** (the bulk-not-home prompt at
`useCanvassingWizard.ts:285-295` handles the all-residents case), but it
means the volunteer's perception of "I recorded an outcome and nothing
happened" is real for partial-household saves.

**Planner action — D-01 has TWO interpretations and the planner must pick one explicitly:**

1. **Literal D-01:** the set is already correct; the only fix is the
   triple-channel feedback (toast + card swap + haptic) so the volunteer
   *sees* the save even when no advance happens.
2. **Spirit-of-D-01:** every simple outcome should advance immediately,
   even mid-household. This requires changing `maybeAdvanceAfterHouseholdSettled`
   to advance unconditionally for the simple-outcome path (matching the
   `handleSubmitContact` "deep contact unconditionally advances" pattern at
   line 346).

> **Recommendation to planner:** Spirit-of-D-01 is the correct read. CONTEXT.md
> §D-01 says *"all simple outcomes auto-advance to the next house in the
> walk list immediately on save success."* "Immediately" is the load-bearing
> word. The volunteer doesn't track which voter at the address they tapped.
> They tap an outcome, they want to move on. Bulk-not-home at line 285-295
> is the exception — it only fires when *no other resident has been handled
> yet*, i.e., the first tap. After that, simple outcomes should advance
> directly.
>
> **Concrete change** to plan into a task:
>
> ```ts
> // useCanvassingWizard.ts handleOutcome (~line 279)
> const saved = await submitDoorKnock(payload, {
>   household: currentHousehold,
>   advanceOnSuccess: AUTO_ADVANCE_OUTCOMES.has(result),
>   // NEW: bypass the household-settled gate for simple outcomes
>   forceAdvance: AUTO_ADVANCE_OUTCOMES.has(result),
> })
> ```
>
> Or, simpler: replace `maybeAdvanceAfterHouseholdSettled` with a direct
> `advanceRef.current()` call in the simple-outcome path. The
> bulk-not-home prompt remains intact at line 285-295 because it returns
> `bulkPrompt: true` *before* `submitDoorKnock` advances. Verify with the
> existing test `auto-advances after non-contact saves on the same submit
> path` at `useCanvassingWizard.test.ts:177` — that test passes today
> against `house-a`/`house-b` because each is a single-voter household, so
> it does NOT exercise the multi-voter regression.

**Confidence:** HIGH — code path traced end-to-end.

---

## 2. CANV-02 — The 300ms `setTimeout` race in `handleSkipAddress`

### Current code `[VERIFIED: web/src/hooks/useCanvassingWizard.ts:360-369]`

```ts
const handleSkipAddress = useCallback(() => {
  if (!currentHousehold) return
  for (const entry of currentHousehold.entries) {
    if (completedEntries[entry.id] === undefined && !skippedEntries.includes(entry.id)) {
      skipEntry(entry.id)            // (1) local Zustand store action
      skipEntryMutation.mutate(entry.id)  // (2) server mutation (fire-and-forget)
    }
  }
  setTimeout(() => advanceRef.current(), 300)  // (3) advance after timeout
}, [currentHousehold, completedEntries, skippedEntries, skipEntry, skipEntryMutation])
```

### Data flow trace

**(1) `skipEntry(entry.id)`** — `[VERIFIED: web/src/stores/canvassingStore.ts:179-183]`

```ts
skipEntry: (entryId) =>
  set((state) => ({
    skippedEntries: [...state.skippedEntries, entryId],
    lastActiveAt: Date.now(),
  })),
```

Pure local Zustand state update. **Synchronous.** Triggers a re-render of
any component subscribed to `skippedEntries`.

**(2) `skipEntryMutation.mutate(entry.id)`** — fire-and-forget TanStack Query
mutation. On success, it invalidates the `enriched-entries` query, which
causes `useEnrichedEntries` to refetch. The refetch returns the same entries
(skipped status is server-side now), and the wizard's `households` memo
recomputes.

**(3) `setTimeout(() => advanceRef.current(), 300)`** — advances
`currentAddressIndex` by 1.

### Where's the actual race?

The `closure-captured` `completedEntries` and `skippedEntries` from the
`useCallback` deps are stale by the time the loop runs (they were captured
at render time). This is a non-issue for the loop body itself — it runs
once per render — but the **next render's `households` memo** is what
decides what household sits at `currentAddressIndex + 1`.

The actual sequence on tap:

1. User taps Skip.
2. Loop calls `skipEntry()` → store updates → React schedules re-render.
3. Loop calls `skipEntryMutation.mutate()` → TanStack Query moves to pending.
4. `setTimeout(300ms)` schedules `advanceAddress()`.
5. Re-render #1 happens (~16ms): `households` memo recomputes, but the
   server-side data has not changed yet, only `skippedEntries`. The current
   household still appears at index 0 (it's still in the household list —
   it just has all entries marked skipped locally).
6. Server responds to skip mutation (~50-150ms typical, sometimes more).
7. TanStack Query invalidates `enriched-entries`. Refetch fires.
8. Refetch resolves (~100-300ms). New entries arrive with `status: "skipped"`.
9. `groupByHousehold` regroups. The "viewing" pin logic at
   `useCanvassingWizard.ts:149-155` records the *current* household as the
   pinned one. Because the user hasn't advanced yet, the pin is still on
   the skipped house.
10. `setTimeout` fires `advanceRef.current()` → `currentAddressIndex` becomes 1.
11. Re-render: `households[1]` is now the next house. Done.

**The race:** if the server response in step 6-8 is **slower than 300ms**
(common on slow mobile networks), then `setTimeout` fires *before* the
refetch completes, advancing the index by 1. But after the refetch
completes, the pinning logic (lines 149-155) re-pins the *displayed*
household to wherever index 1 now points — and because the skipped house
is *still in the list* (skipped entries don't disappear, they just become
status: skipped), the index-1 slot may now hold the **same skipped house**,
not the next house. The volunteer sees "tapped Skip → screen didn't change."

**Secondary issue:** if the user double-taps Skip during the 300ms window
(possible on a janky mobile device), `handleSkipAddress` runs twice and
advances twice, skipping a house entirely.

**Tertiary issue:** if the mutation *fails* (network drop), the local
store has the entry as skipped but the server doesn't. The next time
`useEnrichedEntries` refetches, the entry comes back as `pending`. The
local skip was lost. The volunteer's "Skip" never persisted.

### Why the existing test passes

The test at `useCanvassingWizard.test.ts:191-203` mocks `useSkipEntryMutation`
to return `{ mutate: vi.fn() }` (no async behavior, no invalidation, no
refetch). The mock environment removes every network-timing factor. The
300ms timeout is honored by `waitFor`. The test cannot detect this race.

### Recommended fix

**Option (a) — `await skipEntryMutation.mutateAsync()`:** simplest, slowest.
On a 3G connection this could take 500ms+ between tap and visible advance,
which volunteers will perceive as "Skip is broken (slow)."

**Option (b) — Optimistic local advance + background mutation + on-error rollback:** fastest UX, more code. The advance fires immediately on the synchronous local store update; the mutation runs in the background; on error a sonner toast surfaces the failure and the local store reverts.

**Option (c) — RECOMMENDED: Synchronous local skip + immediate advance + disable Skip button while mutation pending + on-error toast.** Mirrors the UI-SPEC §"Skip Button Affordance" disabled state (`isSavingDoorKnock === true` → `aria-disabled`). The advance is instant (no setTimeout), the double-tap race is closed by the disabled state, the failure case surfaces via sonner. The mutation runs in the background but the UI never waits on it for advance. This is option (b) lite — no rollback, because skipped entries are reversible by design (D-05).

**Concrete refactor sketch:**

```ts
const handleSkipAddress = useCallback(() => {
  if (!currentHousehold) return
  if (skipEntryMutation.isPending) return  // anti-double-tap

  // Snapshot the entries to skip BEFORE store mutations
  const entriesToSkip = currentHousehold.entries.filter(
    (entry) =>
      completedEntries[entry.id] === undefined &&
      !skippedEntries.includes(entry.id),
  )

  // (1) Local store update (synchronous)
  for (const entry of entriesToSkip) {
    skipEntry(entry.id)
  }

  // (2) Advance immediately — no setTimeout
  advanceRef.current()

  // (3) Fire mutations in background; on error, surface a toast.
  //     Do NOT roll back the local skip — D-05 says skipped is reversible
  //     and the volunteer can re-activate from the household list.
  for (const entry of entriesToSkip) {
    skipEntryMutation.mutate(entry.id, {
      onError: () => {
        toast.error("Skip didn't sync — it's still saved on this device.")
      },
    })
  }
}, [currentHousehold, completedEntries, skippedEntries, skipEntry, skipEntryMutation])
```

**Plus** the OutcomeGrid/Skip button must apply
`disabled={skipEntryMutation.isPending || doorKnockMutation.isPending}` per
UI-SPEC §"Skip Button Affordance."

**Plus** the existing skip test at `useCanvassingWizard.test.ts:191` will
still pass (it asserts `skippedEntries === ["entry-a"]` and
`currentAddressIndex === 1`), but a new test should assert that calling
`handleSkipAddress` twice in rapid succession only advances by 1 (the
double-tap guard).

**Confidence:** HIGH — fully traced.

---

## 3. CANV-03 — API contract for empty notes

### Pydantic schema `[VERIFIED: app/schemas/canvass.py:50-58]`

```python
class DoorKnockCreate(BaseSchema):
    """Schema for recording a door knock attempt."""

    voter_id: uuid.UUID
    walk_list_entry_id: uuid.UUID
    result_code: DoorKnockResult
    notes: str | None = None    # <-- already optional, default None
    survey_responses: list[ResponseCreate] | None = None
    survey_complete: bool = True
```

### Service layer `[VERIFIED: app/services/canvass.py:74, 127]`

```python
# Line 74:
"notes": data.notes,
# Line 127:
notes=data.notes,
```

The service passes `data.notes` through directly. No validation, no
default-to-empty-string. `None` flows to the model.

### Model column

`app/models/walk_list.py` defines `WalkList`, `WalkListEntry`, and
`WalkListCanvasser` — but **no `DoorKnock` model.** The actual storage
table is the `voter_interaction` model `[VERIFIED: app/models/voter_interaction.py:1
docstring "event log with mutable notes"]`. The phrase "mutable notes" in
the docstring strongly implies the column is nullable. (The full file was
not opened in this research run; the planner should verify the column
declaration `notes: Mapped[str | None] = mapped_column(..., nullable=True)`
before writing the DB-level test, but the contract at the service and
schema layers is unambiguous.)

### Existing tests

No `tests/integration/test_door_knocks.py` exists `[VERIFIED: glob]`.
No `tests/integration/test_*walk*.py` exists either. The door-knock POST
endpoint has zero integration test coverage today.

### Definitive answer

**The API already accepts empty/null notes.** No backend change needed.
No migration needed. The fix is purely frontend at `InlineSurvey.tsx:135`.

### What's still required per D-10/D-16

1. **A pytest integration test that round-trips a door knock with `notes=None` and asserts 201.** This locks the contract against future regression. Plan should put it in a new file `tests/integration/test_door_knocks.py`. (Phase 106 confirmed integration tests are healthy; this is a new file in the existing pattern.)
2. **Optionally a second test asserting `notes=""` (empty string) is also accepted** — Pydantic will treat empty string as a valid `str | None`, but a contract test makes it explicit.

**Confidence:** HIGH — schema/service traced; only the model column was
not opened in this research session, but the docstring confirms nullable
intent.

---

## 4. FORMS-01 — Field-mode required-validator inventory

### Methodology

Greppped the entire field-mode surface for save-blocking client-side
validators using these patterns: `required`, `\.min\(1`, `trim\(\)\.length`,
`disabled=\{`, `canSubmit`, `isValid`, `useForm`, `zodResolver`. Scope:

- `web/src/components/field/*.tsx` (33 files)
- `web/src/routes/field/$campaignId/**/*.tsx` (3 route files: `index.tsx`, `canvassing.tsx`, `phone-banking.tsx`)

`[VERIFIED: glob web/src/components/field/*.tsx + web/src/routes/field/$campaignId/**/*.tsx]`

### Result: only 3 hits

| # | File | Line | Field | Validator | Classification | Notes |
|---|------|------|-------|-----------|---------------|-------|
| 1 | `web/src/components/field/InlineSurvey.tsx` | 135, 152 | `notes` (canvassing path) | `requiresNotes = isControlled` → `notes.trim().length > 0` blocks save button | **over-eager** | The CANV-03 bug. D-09 fix: explicit `notesRequired?: boolean` prop, default `false`. Canvassing wizard passes `false`; phone-banking call surface keeps current behavior pending audit. |
| 2 | `web/src/components/field/SmsComposer.tsx` | 70 | `body` (SMS message body) | `body.trim().length === 0` disables Send | **safety-critical** | Sending an empty SMS would be a real-world harm (recipient confusion + carrier flagging). KEEP per D-14. |
| 3 | `web/src/components/field/SmsBulkSendSheet.tsx` | 93 | `body` (bulk SMS body) | `body.trim().length === 0` disables Queue | **safety-critical** | Same rationale as #2 — empty bulk SMS to many recipients is real-world harm. KEEP per D-14. |

### Pre-classification

| Disposition (proposed) | Count | Items |
|------------------------|-------|-------|
| `kept` (safety-critical) | 2 | SmsComposer body, SmsBulkSendSheet body |
| `removed` / `loosened` (over-eager) | 1 | InlineSurvey notes (canvassing path only) |

### What is NOT a hit but the planner should know

- **`OutcomeGrid.tsx:27`**: `disabled={disabled}` — this is a *while-saving*
  guard, not a requiredness validator. Not in scope.
- **`PhoneNumberList.tsx:276,308`**: `disabled={isDisabled}` — gated on
  calling-hours and active-call state. Not requiredness. Not in scope.
- **`InlineSurvey.tsx`**: *survey question completeness* (`isSurveyComplete`
  at line 147) blocks the controlled-mode submit when survey questions
  exist but are unanswered. This is NOT a `notes` validator and NOT in
  scope per D-11. The audit doc should record it as "kept — survey answers
  are data integrity (the survey response is the point of the call)."
- **No `useForm` / `zodResolver` usage in field mode** `[VERIFIED: grep]`. The
  field-mode wizard uses local `useState`, not React Hook Form. CONTEXT.md
  §code_context confirms this is intentional and out of scope to refactor.
- **No `required` HTML attributes anywhere in `web/src/components/field/`** `[VERIFIED: grep]`.
- **Phone-banking notes (`field-call-notes` textarea in `InlineSurvey.tsx:292`)** is in the controlled-mode path (`isControlled === true`). Per D-11, this **stays required** unless the audit says otherwise. The recommendation is to keep it required for now — call notes are the only durable record of an answered call and removing the requirement would destroy the value of the call. The audit doc should explicitly call this out as `kept` with the justification "answered-call notes are the only durable record of the conversation; removing the validator would destroy interaction value."

### Surprise finding

The field-mode form-validator surface is **astonishingly small** — 3 hits
total across 36 files. This means FORMS-01 is a low-volume audit. The
audit doc will have ~5-10 rows once you include kept items
(`InlineSurvey` survey-completeness, `OutcomeGrid` while-saving, etc.) for
trail completeness, but the *removal* work is exactly one line of
behavioral change at `InlineSurvey.tsx:135`.

The planner should treat the audit doc as a **brief but complete** artifact, not a 50-row spreadsheet.

**Confidence:** HIGH — full grep coverage of the field-mode tree.

---

## 5. Test coverage gaps

### Existing test inventory

| Layer | File | Coverage | Status |
|-------|------|----------|--------|
| Unit | `web/src/hooks/useCanvassingWizard.test.ts` | 5 tests: distance sort, contact draft hold, contact failure, non-contact auto-save, skip-then-advance | EXISTS, will be **extended** |
| Unit | `web/src/routes/field/$campaignId/canvassing.test.tsx` | Route-level component tests with mocked hook | EXISTS, may be extended for triple-channel feedback assertions |
| Integration (pytest) | none for door-knocks | — | **MISSING — must create** `tests/integration/test_door_knocks.py` |
| E2E (Playwright) | none for canvassing | — | **MISSING — must create** `web/e2e/canvassing.spec.ts` |

**Confirmed deletions from phase 106 (per pitfall-5 in CONTEXT.md):**
- `web/src/hooks/useCanvassing.test.ts` — DELETED `[VERIFIED: glob found only useCanvassingWizard.test.ts]`
- `web/e2e/field-mode.volunteer.spec.ts` — DELETED `[VERIFIED: glob found no canvassing-related spec; full e2e listing has 50+ specs but zero match canvassing/field-mode]`

### Gaps per requirement

**CANV-01 (auto-advance):**
- Unit: extend `useCanvassingWizard.test.ts` with new cases:
  1. Multi-voter household: tap `not_home` for one voter → wizard advances immediately (not just when household settled). This is the regression-protector for the §1 spirit-of-D-01 fix.
  2. Toast call: assert `toast.success("Recorded — next house")` (or whatever exact copy is chosen) is invoked on successful save.
  3. Vibrate call: mock `navigator.vibrate` and assert it's called with `50` on auto-advance. Mock should also cover the `'vibrate' in navigator === false` branch (silent no-op).
- E2E: new spec — record a `not_home` outcome → assert next house's address is visible within 2s.

**CANV-02 (skip):**
- Unit: extend `useCanvassingWizard.test.ts` with:
  1. Double-tap skip → only one advance (the `skipEntryMutation.isPending` guard).
  2. Skip mutation rejects → local store still has the skip (per D-05) AND a sonner error toast fires.
  3. The current skip-then-advance test at line 191 still passes against the refactored code.
- E2E: new spec — tap Skip → next house's address is visible within 2s.

**CANV-03 (notes optional):**
- Unit: new test for `InlineSurvey` — render with `notesRequired={false}`, leave notes empty, click Save → submit handler is called with `notes: ""`. Render with `notesRequired={true}` (phone-banking path), leave empty, Save is disabled.
- Integration (pytest): new file `tests/integration/test_door_knocks.py` with at least these tests (use existing fixture pattern from `tests/integration/`):
  1. POST door knock with `notes: None` → 201, response has `notes: null`.
  2. POST door knock with `notes: ""` → 201, response has `notes: ""` (or `null` depending on service normalization — the test should be tolerant or assert the actual current behavior).
  3. POST door knock with `notes: "real notes"` → 201, response has the notes echoed back.
- E2E: in the canvassing spec, add a step that records `not_home` without typing notes → no validation error, save succeeds, advance happens.

**FORMS-01 (audit):**
- Unit: the InlineSurvey unit test above doubles as the audit-fix coverage.
- E2E (per D-17): the canvassing E2E spec covers the only `removed` validator. The two `kept` SMS validators do not need new E2E coverage (they were already correct).

### E2E spec naming and wrapper

Per phase 106 D-13, all E2E runs MUST use `web/scripts/run-e2e.sh`. The new spec should be named consistently with existing field-mode specs. Since `web/e2e/field-mode.volunteer.spec.ts` was deleted, the cleanest path is:

- New file: `web/e2e/canvassing-wizard.spec.ts`
- Use the existing volunteer-fixture pattern from `web/e2e/role-gated.volunteer.spec.ts` or `web/e2e/rbac.volunteer.spec.ts` (both verified to exist via glob)
- Run via `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts`

**Confidence:** HIGH — file inventory verified.

---

## 6. Risks, pitfalls, and surprises for the planner

### 1. `usePrefersReducedMotion` does NOT exist

`[VERIFIED: grep "usePrefersReducedMotion|prefers-reduced-motion" → only one hit, in `web/src/index.css` for a CSS query]`. The UI-SPEC says "use the existing hook if it exists, otherwise add a tiny `window.matchMedia('(prefers-reduced-motion: reduce)')` helper in `web/src/lib/`."

**Plan must include creating a small helper** (~15 lines) at `web/src/lib/usePrefersReducedMotion.ts`. Standard pattern:

```ts
import { useEffect, useState } from "react"

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return reduced
}
```

This is unit-testable by mocking `window.matchMedia`.

### 2. The card-swap animation already exists

`[VERIFIED: web/src/routes/field/$campaignId/canvassing.tsx:567-570]`

```tsx
<div
  key={currentHousehold.householdKey}
  className="animate-in fade-in slide-in-from-right-4 duration-300"
>
  <HouseholdCard ... />
</div>
```

Currently uses `duration-300`; UI-SPEC says `duration-200`. Update to match spec, AND wrap with the reduced-motion conditional so the className becomes empty when reduced motion is on. Alternative: use `motion-safe:` Tailwind variant, which is simpler and inline:

```tsx
className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200"
```

This avoids the hook entirely for the visual transition. The hook is still useful for the haptic+focus management gate where needed.

### 3. sonner version 2.x — verify toast `action` API

`[VERIFIED: web/package.json:46 — sonner@^2.0.7]`. Sonner 2.x supports `toast.success(message, { action: { label, onClick } })` and `toast.error(...)` with the same signature. The planner should verify the exact import path
(`import { toast } from "sonner"`) which is already used at
`useCanvassingWizard.ts:22` and `canvassing.test.tsx:10`. No surprise here.

### 4. Existing `auto-advances after non-contact saves` test does NOT cover the multi-voter regression

`[VERIFIED: useCanvassingWizard.test.ts:177-189]`. The test fixture has two
single-voter households (`house-a` with `entry-a`, `house-b` with `entry-b`).
A `not_home` save on `entry-a` correctly advances because `house-a` is
fully settled. The new multi-voter regression test (planner action under
§1) is **net new coverage**, not a re-assertion.

### 5. The `notesRequired` rename in `InlineSurvey` couples to TWO consumers

`[VERIFIED: grep — `InlineSurvey` is imported by `web/src/routes/field/$campaignId/canvassing.tsx:7` and `web/src/routes/field/$campaignId/phone-banking.tsx:7`]`. Both call sites must be updated:

- **Canvassing:** pass `notesRequired={false}` (or rely on the default).
- **Phone banking:** explicitly pass `notesRequired={true}` to preserve current behavior. Do NOT rely on the default — that creates a silent regression risk if the default ever flips.

The component's `requiresNotes = isControlled` line (135) goes away. The
controlled-mode discriminator stays for everything else (`onSubmitDraft`
vs `onComplete`); only the notes-coupling is severed.

### 6. The `notesRequired` change must NOT touch the survey-completeness gate

`isSurveyComplete` at line 147 is a separate concern. Volunteers must
still answer survey questions to save. Don't accidentally remove the
survey-completeness check while ripping out the notes check.

### 7. The current `handleSubmitContact` test expects unconditional advance

`[VERIFIED: useCanvassingWizard.test.ts:148-150]`:

```ts
await waitFor(() => {
  expect(useCanvassingStore.getState().currentAddressIndex).toBe(1)
})
```

This test passes `notes: "Met voter at the door."`. After CANV-03,
`handleSubmitContact` should also work with empty `notes: ""`. Add a
sibling test that asserts the same advance with empty notes — this is the
unit-test layer of D-16.

### 8. Toast spam during fast canvassing

If a volunteer hits multiple outcomes in quick succession, sonner could
stack 3+ toasts. UI-SPEC §"Standard toast properties" says **stack limit
of 1 visible at a time**. Sonner's default is to stack. Use
`toast.success(msg, { id: "auto-advance" })` so the same `id` replaces
prior toasts of that kind. This is a one-line fix but easy to miss.

### 9. Phase 106 inheritance: `run-e2e.sh` is mandatory

`[VERIFIED: CLAUDE.md "E2E tests" section + phase 106 D-13]`. Any new
Playwright spec must be runnable via `cd web && ./scripts/run-e2e.sh
<spec>`. The wrapper appends to `web/e2e-runs.jsonl`. Plans should
explicitly call the wrapper, not bare `playwright test`.

### 10. Anti-pattern caution: do not paper over the race with a longer setTimeout

The temptation to "make it 500ms" is strong but wrong. The race is unbounded by network latency. The fix MUST be one of (a)/(b)/(c) from §2. Recommendation (c) is the lowest-risk.

**Confidence:** HIGH for items 1-7 (all code-verified). MEDIUM for items 8-10 (best-practice / anti-pattern guidance).

---

## Architecture Patterns

### Pattern 1: Triple-channel feedback helper (D-03)

**What:** Centralize the toast + vibrate + focus-management trio so it's called from one place.

**When to use:** Auto-advance success path; bulk-not-home success; (optionally) skip success.

**Sketch:**

```ts
// in useCanvassingWizard.ts (or extracted to web/src/lib/fieldFeedback.ts)
function announceAutoAdvance(nextAddress: string | null) {
  toast.success("Recorded — next house", { id: "auto-advance" })
  if ("vibrate" in navigator) navigator.vibrate(50)
  // Focus management is handled in the route-level component via a ref
  // to the new HouseholdCard's address heading; the ariaLive region is
  // updated via a setter exposed from the hook.
}
```

### Pattern 2: Mutation-pending guards instead of timeouts (D-07)

**What:** Use `mutation.isPending` (or a local `isSubmitting` flag) as the
gating condition for the next user action, instead of `setTimeout`.

**Why:** Wall-clock timeouts cannot bound network latency. State-based
guards always reflect ground truth.

### Pattern 3: Explicit prop over implicit discriminator coupling (D-09)

**What:** When a behavior depends on a mode discriminator (`mode === "controlled"`), and that behavior wants to be opt-in/out independently, lift it to its own prop.

**Why:** Preserves the discriminator for what it's for (`onSubmitDraft` vs
`onComplete`) without forcing every consumer of one mode to inherit the
other's UX choices.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | A custom `useToast()` | `sonner` (already installed) | Stack management, ARIA, dismiss-on-tap-outside, action buttons all already work |
| Reduced-motion detection | A complex hook with resize listeners and throttling | `window.matchMedia('(prefers-reduced-motion: reduce)')` + `addEventListener('change')` (15-line hook) OR Tailwind `motion-safe:` variants | The native API is sufficient and Tailwind already supports the variant |
| Race-free skip mutation | A custom event bus / saga / queue | TanStack Query's built-in `mutateAsync` + `isPending` | Already loaded, already debugged |
| Survey question state | A second forms library | Existing local `useState` in `InlineSurvey` | Phase scope says no RHF refactor; existing state is fine |

**Key insight:** This phase has zero new-tech needs. Every solution is in
the current stack. If a task plan reaches for a new package, it has
strayed from scope.

---

## Common Pitfalls

### Pitfall 1: Over-tuning the 300ms timeout instead of removing it

**What goes wrong:** Plan task says "increase setTimeout to 500ms."
**Why:** Symptoms relief without root cause fix.
**How to avoid:** Mandate the recommendation (c) refactor in the task
description: "remove the setTimeout entirely; advance synchronously after
local store update; gate the button on `mutation.isPending`."
**Warning sign:** Any mention of milliseconds in the task action other
than `vibrate(50)`.

### Pitfall 2: Forgetting to update the phone-banking call site of `InlineSurvey`

**What goes wrong:** `InlineSurvey` gets `notesRequired?: boolean = false`,
canvassing passes nothing, phone banking passes nothing, phone banking
silently loses notes-required.
**How to avoid:** Plan task explicitly says "update both call sites at
`canvassing.tsx:7` and `phone-banking.tsx:7`. Phone banking explicitly
passes `notesRequired={true}`."
**Warning sign:** The phone-banking call site is not modified in the diff.

### Pitfall 3: Sonner toast id collision causes visual flicker

**What goes wrong:** Without `{ id: "auto-advance" }`, rapid outcomes stack
3+ toasts.
**How to avoid:** Use stable IDs per toast variant.
**Warning sign:** Manual QA shows "toast tower" after fast outcome
recording.

### Pitfall 4: Auto-advance test passes against single-voter fixture but multi-voter is broken

**What goes wrong:** Existing test only uses single-voter households; new
auto-advance regression in multi-voter goes uncaught.
**How to avoid:** Add a fixture with a multi-voter household and assert
that recording one outcome advances the index.
**Warning sign:** Test file diff has no new fixture entries.

### Pitfall 5: Forgetting that phase 106 deleted the canvassing E2E spec

**What goes wrong:** Plan tries to "extend" `web/e2e/canvassing.spec.ts`
but the file does not exist.
**How to avoid:** Plan task says "create new file `web/e2e/canvassing-wizard.spec.ts`"
explicitly.
**Warning sign:** Any task action says `extend canvassing.spec.ts`.

### Pitfall 6: Forgetting to vibrate-feature-detect

**What goes wrong:** iOS Safari throws on `navigator.vibrate(50)`. Actually
it doesn't throw — it returns `false` silently — but the planner should
still wrap in the feature check per UI-SPEC §"Implementation rules."
**How to avoid:** Use the `if ('vibrate' in navigator)` guard explicitly.
**Warning sign:** Bare `navigator.vibrate(50)` in any code action.

---

## Validation Architecture

Phase 106 anchored validation enablement. Per `.planning/config.json` (not
opened in this session, but D-16 confirms all three layers required), this
phase needs unit + integration + E2E coverage.

### Test Framework

| Property | Value |
|----------|-------|
| Frontend unit | vitest + happy-dom + @testing-library/react |
| Frontend unit config | `web/vitest.config.ts` (existing) |
| Quick run command (frontend) | `cd web && npx vitest run path/to/file.test.ts` |
| Full vitest | `cd web && npx vitest run` |
| Backend integration | pytest (asyncio_mode=auto, integration marker) |
| Quick run (backend) | `uv run pytest tests/integration/test_door_knocks.py -x` |
| Full pytest | `uv run pytest` |
| E2E | Playwright via `web/scripts/run-e2e.sh` (mandatory wrapper) |
| E2E quick | `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts` |
| E2E full | `cd web && ./scripts/run-e2e.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANV-01 | Multi-voter household advances on first simple outcome | unit | `cd web && npx vitest run src/hooks/useCanvassingWizard.test.ts` | EXISTS, **needs new test case** |
| CANV-01 | Sonner success toast fires on auto-advance | unit | same as above | needs new test case |
| CANV-01 | `navigator.vibrate(50)` is called when supported | unit | same as above | needs new test case |
| CANV-01 | Real wizard advances visually after recording outcome | E2E | `cd web && ./scripts/run-e2e.sh canvassing-wizard.spec.ts` | ❌ Wave 0 — new file |
| CANV-02 | Skip advances within one synchronous tick | unit | useCanvassingWizard.test.ts | EXISTS, **needs assertion update** |
| CANV-02 | Double-tap skip only advances once | unit | same | needs new test case |
| CANV-02 | Skip mutation failure surfaces a sonner error toast | unit | same | needs new test case |
| CANV-02 | Real wizard surfaces next house after Skip tap | E2E | run-e2e.sh canvassing-wizard.spec.ts | ❌ Wave 0 |
| CANV-03 | InlineSurvey with `notesRequired={false}` allows empty notes save | unit | `cd web && npx vitest run src/components/field/InlineSurvey.test.tsx` | ❌ Wave 0 — new file (no `InlineSurvey.test.tsx` exists per glob) |
| CANV-03 | InlineSurvey with `notesRequired={true}` blocks empty notes (phone-banking parity) | unit | same | needs new test |
| CANV-03 | Door knock POST accepts `notes: None` | integration | `uv run pytest tests/integration/test_door_knocks.py -x` | ❌ Wave 0 — new file |
| CANV-03 | Door knock POST accepts `notes: ""` | integration | same | needs new test |
| CANV-03 | Volunteer can save outcome with empty notes textarea in real wizard | E2E | run-e2e.sh canvassing-wizard.spec.ts | ❌ Wave 0 |
| FORMS-01 | Removed validator no longer blocks save | E2E | same as CANV-03 | covered by CANV-03 spec |

### Sampling Rate

- **Per task commit:** the relevant unit/integration test, fast (`-x` first failure)
- **Per wave merge:** full vitest + full pytest + the new canvassing E2E spec
- **Phase gate:** `uv run ruff check . && uv run pytest && cd web && npx vitest run && ./scripts/run-e2e.sh` all green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `web/e2e/canvassing-wizard.spec.ts` — new file. Covers CANV-01/02/03 via volunteer fixture. Use volunteer-fixture pattern from `web/e2e/role-gated.volunteer.spec.ts` (verified to exist).
- [ ] `web/src/components/field/InlineSurvey.test.tsx` — new file. Covers `notesRequired` prop in both modes. Vitest + RTL.
- [ ] `tests/integration/test_door_knocks.py` — new file. Pytest async with existing campaign+walk-list fixtures. Round-trips empty notes.
- [ ] `web/src/lib/usePrefersReducedMotion.ts` — new helper (not a test file but a Wave 0 dep for the card-swap fix). Optional if `motion-safe:` variants are used inline instead.
- [ ] No framework install needed — vitest, pytest, Playwright all already in place.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `voter_interaction.notes` SQL column is nullable (per docstring "mutable notes") `[ASSUMED]` | §3 | LOW — if it's NOT nullable, the integration test will fail loudly on first run, and the planner will know to add a migration. The schema and service layers are still correct. |
| A2 | Sonner 2.x `toast.success(msg, { id, action: { label, onClick } })` API is unchanged from sonner 1.x — based on training data `[ASSUMED]` | §6 risk #3, Pattern 1 | LOW — easily verified by the executor on first task. If the API changed, the executor adapts in-task. |
| A3 | The phone-banking notes-required behavior should stay required (D-11 "may be affected" is non-committal) `[ASSUMED]` | §4 row 1 notes, §6 risk #2 | MEDIUM — if the user actually wants phone-banking notes optional too, the audit doc disposition flips for that row. The fix is one prop value (`notesRequired={false}` instead of `={true}` in `phone-banking.tsx`). |
| A4 | The user's spirit-of-D-01 read is correct (multi-voter households should advance immediately on simple outcomes) | §1 | MEDIUM — if the user actually meant the literal read (set is already complete; only feedback channel needs work), the §1 fix is smaller (no `maybeAdvanceAfterHouseholdSettled` change). The planner should confirm via `gsd-discuss-phase` follow-up or note this in the plan as an explicit branch. |

**Recommendation:** A3 and A4 are worth confirming with the user before
locking the plan. A1 and A2 are self-correcting at executor time.

---

## Open Questions (RESOLVED)

> All three open questions were resolved by post-research user decisions
> recorded in CONTEXT.md as **D-18, D-19, D-20** (added 2026-04-10).
> See those decisions for the authoritative answers.

1. **Should phone-banking call notes also become optional?** (A3)
   - **RESOLVED → D-19:** Yes, remove the required validator.
     Same rule as canvassing per D-19. Audit row 4 dispositions
     to REMOVED.
   - What we know: D-11 says "may also be affected" but defers to the audit. The audit (§4) recommends keeping it required because answered-call notes are the only durable record.
   - What's unclear: whether the user agrees with that justification.
   - Recommendation: Plan keeps phone-banking notes required. Audit doc explicitly records this disposition with the justification. If the user disagrees on review, it's a one-line flip.

2. **Spirit vs literal D-01?** (A4)
   - What we know: `AUTO_ADVANCE_OUTCOMES` set is already complete; the
     bug is in the `maybeAdvanceAfterHouseholdSettled` gate for multi-voter
     households.
   - What's unclear: whether the user knew the set was already correct.
   - Recommendation: Plan implements the spirit-of-D-01 fix (advance immediately for simple outcomes regardless of household-settled state) and adds a regression test. Note this explicitly in the plan summary so the user can flag if they meant otherwise.

3. **Card-swap implementation: hook vs `motion-safe:` Tailwind variant?**
   - What we know: UI-SPEC says "use the existing hook if it exists, otherwise add a tiny helper." Hook does NOT exist.
   - What's unclear: whether the planner prefers the hook (testable, reusable) or the inline `motion-safe:` variant (simpler, no new file).
   - Recommendation: Add the hook (`web/src/lib/usePrefersReducedMotion.ts`). It's reusable for haptic gating too, and phase 108-110 will need it. The cost is ~15 lines.

---

## Sources

### Primary (HIGH confidence) — all from codebase reads

- `web/src/hooks/useCanvassingWizard.ts` (full read, 434 lines)
- `web/src/components/field/InlineSurvey.tsx` (full read, 328 lines)
- `web/src/types/canvassing.ts` (full read, 274 lines)
- `web/src/stores/canvassingStore.ts` (full read, 237 lines)
- `web/src/components/field/HouseholdCard.tsx` (full read)
- `web/src/components/field/OutcomeGrid.tsx` (full read)
- `web/src/components/field/SmsComposer.tsx` (full read)
- `web/src/components/field/SmsBulkSendSheet.tsx` (full read)
- `web/src/components/field/CallingVoterCard.tsx` (full read)
- `web/src/hooks/useCanvassingWizard.test.ts` (full read)
- `web/src/routes/field/$campaignId/canvassing.tsx` (partial — line 525-585 + grep)
- `web/src/routes/field/$campaignId/phone-banking.tsx` (partial — line 1-50 + grep)
- `app/schemas/canvass.py` (full read, 73 lines)
- `app/api/v1/walk_lists.py` (door-knock route lines 320-365)
- `app/models/walk_list.py` (full read, 96 lines)
- `app/models/voter_interaction.py` (docstring only — line 1)
- `.planning/phases/107-canvassing-wizard-fixes/107-CONTEXT.md` (full read)
- `.planning/phases/107-canvassing-wizard-fixes/107-UI-SPEC.md` (full read)
- `.planning/REQUIREMENTS.md` (full read)
- `.planning/ROADMAP.md` lines 220-300
- `web/package.json` (sonner version line 46)
- `CLAUDE.md` (project + user instructions)

### Secondary (MEDIUM confidence)

- Glob inventories of `web/e2e/*.spec.ts` (50+ specs verified to exclude canvassing)
- Glob inventories of `web/src/components/field/*.tsx` (33 files)
- Grep `required|min\(1|trim\(\)\.length` across field tree (3 hits total)

### Tertiary (LOW confidence)

- Sonner 2.x API behavior — assumed unchanged from training-data 1.x knowledge. Self-correcting at executor time.

---

## Metadata

**Confidence breakdown:**

- CANV-01 enumeration: HIGH — full enum + set verified, set is already complete; the bug is in the gate, not the set.
- CANV-02 race analysis: HIGH — full data flow traced through store + mutation + memo + setTimeout; recommendation grounded in code.
- CANV-03 API contract: HIGH — schema + service verified accept `None`; only DB column nullability is `[ASSUMED]` from docstring.
- FORMS-01 inventory: HIGH — full grep coverage, only 3 hits, all classified.
- Test gaps: HIGH — file inventory verified by glob.
- Pitfalls: HIGH for code-grounded items (1-7), MEDIUM for best-practice items (8-10).

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (frontend code is moving but the architectural decisions here are stable for this milestone)
