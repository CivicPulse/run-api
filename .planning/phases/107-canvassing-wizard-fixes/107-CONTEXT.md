# Phase 107: Canvassing Wizard Fixes - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three reported volunteer-facing bugs in the canvassing wizard plus a
broader audit of over-eager `required` validators across field-mode forms:

1. **CANV-01** — Auto-advance to next house after recording any simple outcome
2. **CANV-02** — Skip-house button reliably advances and surfaces the next
   house in one tap
3. **CANV-03** — Notes field is genuinely optional in the canvassing flow
4. **FORMS-01** — Audit and remove over-eager `required` validators across
   the canvassing AND phone-banking field-mode forms

Scope is the **existing canvassing wizard and shared field-mode form
components only**. No new wizard steps, no rewriting the survey engine, no
new outcome types, no design system overhaul. Phase 108 (house selection)
and phase 109 (map) deliberately follow.

Requirements satisfied: **CANV-01, CANV-02, CANV-03, FORMS-01**
(plus TEST-01/02/03 coverage obligation, anchored to phase 110).

</domain>

<decisions>
## Implementation Decisions

### CANV-01: Auto-Advance Behavior

- **D-01:** **All simple outcomes auto-advance** to the next house in the
  walk list immediately on save success. The `AUTO_ADVANCE_OUTCOMES` set in
  `web/src/hooks/useCanvassingWizard.ts` should be expanded to cover every
  outcome that does NOT trigger the survey panel (i.e., everything except
  `contacted`).
- **D-02:** **The `contacted` path keeps its current behavior** — the survey
  panel opens, the volunteer fills it, and `handleSubmitContact` advances
  on successful save (already implemented at hook line 347). Do NOT change
  the survey-and-notes path; it's already correct.
- **D-03:** **Triple-channel feedback on auto-advance:**
  - **Toast** — sonner toast `"Recorded — next house"` (~2s, dismissible)
  - **Card swap** — household card replaces with the next house. Honor
    `prefers-reduced-motion` by skipping any slide animation; just instant
    swap.
  - **Haptic** — `navigator.vibrate(50)` if `'vibrate' in navigator`. Brief,
    silent fallback if unsupported. No new permissions surface (vibrate
    requires no permission on Android).
  - Rationale: three independent channels (visual text, visual layout,
    tactile) so volunteers can confirm save without looking at the screen
    at the moment of advance — critical when their attention is on the
    door, not the device.
- **D-04:** **Save-failure path:** card stays on the failing house, sonner
  error toast `"Couldn't save — tap to retry"`, retry button on the toast.
  No advance until success. The volunteer never loses context. When phase
  110 lands the offline queue, this fits cleanly — failed saves go to the
  queue and the volunteer sees the connectivity indicator.

### CANV-02: Skip-House Mechanics

- **D-05:** **Skip is reversible.** Skipped houses stay in the queue with a
  `skipped` badge, sortable to the bottom of the household list. The
  volunteer can tap them again to re-activate at any time during the same
  shift. Matches real field behavior: skip-because-dog-barking, come back
  later. The existing `skippedEntries` array in the canvassing store
  already supports this; ensure the household list view honors it.
- **D-06:** **Single-tap, no confirmation modal.** Tap "Skip house" =
  immediate skip + advance. Optional: a brief sonner toast `"Skipped — Undo"`
  with an Undo action that restores the house to active **only if** no other
  outcome has been recorded since. Toast is the safety net; modals are not.
- **D-07:** **Investigate the current bug.** The handler at
  `useCanvassingWizard.ts:360` loops over entries and calls both local
  store skip AND `skipEntryMutation.mutate()`, then `setTimeout(300ms)`
  before advancing. The 300ms delay smells like a race-condition workaround.
  Researcher should determine: (a) is the race real, (b) is the bug that
  the mutation can fail leaving local+server out of sync, and (c) what
  conditions cause "skip doesn't surface next house within one tap" in
  practice. Fix the actual race rather than tuning the timeout.

### CANV-03: Notes Optional + UX

- **D-08:** **Notes textarea stays always-visible**, label changes to
  `"Notes (optional)"`. Save button stays enabled with empty notes. Lowest
  friction — the field is right there if wanted, no extra tap to reveal it.
- **D-09:** **Frontend fix is at `web/src/components/field/InlineSurvey.tsx:135`**
  where `requiresNotes = isControlled` couples notes-required to canvassing
  mode. Replace with an explicit prop (e.g., `notesRequired?: boolean`,
  default `false`) so the canvassing wizard can pass `false` and the phone
  banking surface keeps its existing behavior.
- **D-10:** **API contract verification needed before implementation.**
  Researcher must confirm whether the door-knock POST endpoint
  (`POST /api/v1/campaigns/{id}/walk_lists/{id}/entries/{id}/door_knocks`
  or similar) currently accepts empty/null notes. Likely it does, since
  the bug report is about the frontend validator. If it does NOT, plan
  must include backend Pydantic schema fix + migration check (no NOT NULL
  constraint). Add an integration test that round-trips an empty-notes
  door_knock to lock the contract.
- **D-11:** **The phone banking call-notes path may also be affected** by
  the FORMS-01 audit (D-13). The `requiresNotes` change should NOT affect
  phone banking unless the audit determines that path's notes-required
  rule is also over-eager.

### FORMS-01: Audit Scope + Format

- **D-12:** **Deliverable is a markdown audit doc + inline code fixes in
  the same phase.** Path: `.planning/phases/107-canvassing-wizard-fixes/107-FORMS-AUDIT.md`.
  Structure: one row per form field, columns:
  - File path + line
  - Field name
  - Current validator (e.g., `required`, `min length`, `pattern`)
  - Validator intent (per the criterion in D-14)
  - Disposition: `kept` | `removed` | `reworded` | `loosened`
  - Justification (one line)
  The doc is the audit trail; the code changes implement it. Both land in
  the same phase commits per D-14.
- **D-13:** **Audit covers BOTH canvassing and phone banking field-mode
  forms.** Per REQUIREMENTS.md line 63, phone banking UX review is
  excluded from v1.18 *unless* uncovered during FORMS-01 — so this audit
  IS the gateway. Scope is field-mode only: the campaign manager
  desktop forms (turf editor, walk list builder) are out of scope.
- **D-14:** **Over-eager criterion:** a `required` validator (or any
  save-blocking constraint) is justified ONLY if absence of the field would
  cause **data integrity loss** (the API genuinely can't process the record
  without it) OR **real-world harm** (e.g., DNC list submission without
  consent text). Everything else — "helpful" notes, optional reasons, soft
  confirmations — is over-eager and must be removed or loosened to a
  warning toast. The criterion is binary and per-field; the audit doc
  records the decision per row.
- **D-15:** **Audit-discovered bugs** (e.g., a form field whose validator
  is technically over-eager but whose removal would surface a real product
  bug) get the D-08 treatment from phase 106: file a todo in
  `.planning/todos/pending/`, NOT a fix in this phase. The phase 107 scope
  is the audit + the safe removals.

### Post-Research Decisions (added 2026-04-10 after RESEARCH.md)

- **D-18: CANV-01 root cause is the household-settled gate, not the
  outcome set.** Researcher discovered that `AUTO_ADVANCE_OUTCOMES` in
  `web/src/types/canvassing.ts:82-84` is **already complete and correct**.
  The actual stall is in `useCanvassingWizard.ts:218-231`
  (`maybeAdvanceAfterHouseholdSettled`), which gates advance on EVERY
  voter at the household being settled. So tapping `not_home` on Voter 1
  of a 3-voter household leaves the volunteer stuck on that house.

  **Decision: HYBRID interpretation of D-01.** Outcomes are split into
  two categories by domain:

  - **House-level outcomes** (apply to the whole household, advance the
    HOUSE immediately): `not_home`, `vacant`, `wrong_address`
  - **Voter-level outcomes** (apply to one person, mark that voter and
    iterate to the next voter at the same house; advance the house only
    when all voters are settled OR the volunteer taps Skip):
    `refused`, `moved`, `deceased`, `do_not_contact`, `language_barrier`
  - **Survey path** (`contacted`): unchanged per D-02 — opens survey
    panel, advances on save success.

  Implementation: introduce a `HOUSE_LEVEL_OUTCOMES` set in
  `types/canvassing.ts` next to `AUTO_ADVANCE_OUTCOMES`. Modify
  `maybeAdvanceAfterHouseholdSettled` (or replace it with a new helper)
  so that:
  - If the recorded outcome is in `HOUSE_LEVEL_OUTCOMES` → mark all
    remaining unrecorded voters at the household as
    "covered by house outcome" (or just mark them as `not_home`/whatever
    the house outcome was — backend may need to accept this) and
    advance to next house immediately.
  - Otherwise → use the existing per-voter advance logic.
  - Researcher should confirm during planning whether the backend
    accepts a single "house outcome" record or whether the frontend must
    create per-voter records. If per-voter, the frontend writes the
    house outcome to all voters at that household in one batch, then
    advances.

- **D-19: Phone-banking call notes follow the canvassing rule (notes
  optional).** FORMS-01 audit found 3 save-blocking validators total:
  1. `InlineSurvey.tsx:135` — the CANV-03 bug → **REMOVE**
  2. `SmsComposer.tsx:70` — empty SMS body → **KEEP** (you cannot send a
     blank SMS; data integrity)
  3. `SmsBulkSendSheet.tsx:93` — bulk SMS body → **KEEP** (same reason)
  4. **Phone-banking call notes (location TBD by researcher during
     planning)** → **REMOVE**. Same rule as canvassing: notes are
     optional, the volunteer marks the call outcome and may add notes
     but isn't blocked. Audit doc records this with rationale "consistency
     with CANV-03; outcome IS the record, notes are bonus context."
  Net audit surface is tiny (~4 hits total), so the FORMS-AUDIT.md doc
  will be brief but explicit.

- **D-20: `usePrefersReducedMotion` hook is added in this phase.** UI-SPEC
  references `usePrefersReducedMotion` for conditional vibrate, conditional
  toast duration, and conditional card-swap animation. Researcher confirmed
  no such hook exists. Create
  `web/src/hooks/usePrefersReducedMotion.ts` (~15 lines) using
  `matchMedia('(prefers-reduced-motion: reduce)')` with a useEffect
  listener. Reusable in phases 108-110 (which will also have animations).
  Add a unit test at `web/src/hooks/usePrefersReducedMotion.test.ts`.

### Test Coverage (TEST-01/02/03 obligation)

- **D-16:** **All three layers for every CANV fix:**
  - **Unit (vitest):** new tests in `web/src/hooks/useCanvassingWizard.test.ts`
    covering: simple outcome → auto-advance, contacted → survey path
    advance, skip → next house, save with empty notes.
  - **Integration (pytest):** if D-10 reveals an API change, add a
    `tests/integration/test_door_knocks.py` test that round-trips an empty
    notes door_knock and confirms the response. If D-10 confirms no API
    change is needed, add a contract test anyway to lock the empty-notes
    surface against future regression.
  - **E2E (Playwright):** new specs in `web/e2e/canvassing-wizard.spec.ts`
    (or extend `canvassing.spec.ts`) covering: record outcome → next house
    appears, tap Skip → next house appears, save outcome with empty notes
    succeeds. Run via `web/scripts/run-e2e.sh` per phase 106 D-13.
- **D-17:** **FORMS-01 audit gets coverage too** — at least one E2E
  spec per `removed`/`loosened` validator that previously blocked save,
  proving the new behavior. The audit doc lists the specs in a "Tests
  added" column.

### Claude's Discretion

- Exact toast text (D-03, D-06) — micro-copy can be improved at executor
  discretion as long as it's under 30 chars and follows the
  Linear/Stripe-clean tone from CLAUDE.md.
- Whether to extract the auto-advance logic into a standalone helper
  function vs. inlining it in the existing handlers. Refactor only if
  it makes the test cases cleaner.
- Audit doc table format — if a different layout is more readable for
  ~30-50 form fields, that's fine.
- Where to put the `notesRequired` prop default in InlineSurvey (D-09) —
  TypeScript optional with default `false` is fine; a discriminated union
  also acceptable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions
- `CLAUDE.md` — design principles 1-5 (clarity over cleverness, mobile-field
  parity, nonpartisan, AAA accessibility, progressive density). Field mode
  is mobile-first with 44px+ touch targets.
- `.planning/PROJECT.md` — vision and non-negotiables.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §CANV (lines 24-26), §FORMS (line 42),
  §TEST (line 55, anchored to phase 110), §"Out of Scope" (lines 62-65)
  — phone banking UX is in scope only via FORMS-01.
- `.planning/ROADMAP.md` §Phase 107 (line 238) — goal, success criteria
  1-5, dependency on phase 106.

### Existing code (must read before modifying)
- `web/src/hooks/useCanvassingWizard.ts` — main hook. `AUTO_ADVANCE_OUTCOMES`
  set lives here (~line 281). `handleSkipAddress` at line 360 has the
  300ms `setTimeout` D-07 calls out. `handleSubmitContact` at line 302+
  is the survey-and-notes path that already advances correctly.
- `web/src/components/field/InlineSurvey.tsx` — the shared survey component.
  `requiresNotes = isControlled` at line 135 is the CANV-03 bug source.
- `web/src/routes/field/$campaignId/canvassing.tsx` — the canvassing route
  that wires the hook to the UI.
- `web/src/components/field/HouseholdCard.tsx` — household card; relevant
  for the auto-advance card-swap behavior (D-03).
- `web/src/components/field/OutcomeGrid.tsx` — outcome buttons; relevant
  for triggering auto-advance.
- `web/src/stores/canvassingStore.ts` — local skip/complete state; the
  `skippedEntries` array supports D-05 reversibility.
- `web/src/types/canvassing.ts` — outcome type definitions; the canonical
  list of outcomes that need to be classified as auto-advance vs. survey.

### Phase 106 inheritance
- `web/scripts/run-e2e.sh` (phase 106 D-13) — mandatory wrapper for any
  Playwright run, including the new specs added by this phase. Default
  worker count is now 8 after phase 106's gate-time fix.
- `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` D-08
  — the "test reveals product bug → file todo, don't fix in test phase"
  rule. D-15 from phase 107 is the analog for the FORMS-01 audit.

### No external specs
No ADRs or design specs exist for the canvassing wizard. The decisions
above ARE the spec for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current Wizard Architecture (from scout)
- **Entry route:** `web/src/routes/field/$campaignId/canvassing.tsx` —
  thin route component that pulls everything from `useCanvassingWizard`.
- **Main hook:** `useCanvassingWizard.ts` (434 lines) — orchestrates
  household state, advance logic, skip handler, completion tracking,
  geolocation sorting. Already has the `AUTO_ADVANCE_OUTCOMES` set
  concept; the bug is that not all simple outcomes are in it.
- **Survey panel:** `InlineSurvey.tsx` (328 lines) — shared between
  canvassing and phone banking via an `isControlled` discriminator. The
  CANV-03 bug is that `requiresNotes` is wired to `isControlled` instead
  of being an explicit prop.
- **Skip mutation:** `useSkipEntryMutation` (referenced from the hook) —
  exists, server-side endpoint exists. The 300ms `setTimeout` workaround
  in `handleSkipAddress` suggests there's a race that should be fixed
  properly, not papered over.
- **Local state store:** `canvassingStore.ts` — Zustand store with
  `skippedEntries`, `completedEntries`, `walkListId`, `lastActiveAt`.
  Already supports D-05 reversibility.

### Established Patterns
- HTTP via ky (`web/src/api/client.ts`)
- TanStack Query for mutations with `queryKey` invalidation
- TanStack Router file-based routes
- shadcn/ui components, sonner for toasts
- Vitest with happy-dom for unit, Playwright via run-e2e.sh for E2E
- React Hook Form + zod for desktop forms (phone banking hub uses this);
  field-mode wizard uses local `useState` not RHF — keep that, this phase
  is not the place to refactor

### Integration Points
- New code lives in: `useCanvassingWizard.ts`, `InlineSurvey.tsx`,
  `OutcomeGrid.tsx`, `HouseholdCard.tsx`, possibly `canvassingStore.ts`
- New tests live in: existing `*.test.ts(x)` files for the modified
  components, `web/e2e/canvassing.spec.ts` (or a new
  `canvassing-wizard.spec.ts`), and possibly
  `tests/integration/test_door_knocks.py` if the API contract test is needed
- The FORMS-01 audit may surface phone-banking files: `InlineSurvey.tsx`
  (already in scope), `web/src/components/field/CallingVoterCard.tsx`,
  `web/src/components/field/SmsComposer.tsx`,
  `web/src/components/field/PhoneNumberList.tsx`, plus any forms in
  `web/src/routes/field/$campaignId/phone-banking/**`

### What NOT to touch
- Survey engine itself (question rendering, response submission)
- Outcome types/codes — the set is the set
- Walk-list ordering, geolocation sorting, distance calculations
- Phone-banking UX broadly — only the requiredness fixes from the
  FORMS-01 audit, nothing else

</code_context>

<specifics>
## Specific Ideas

- The volunteer's "did it actually save?" anxiety is the load-bearing user
  concern. Triple-channel feedback (D-03) is specifically designed to
  defeat that anxiety from any one channel being missed.
- The 300ms `setTimeout` in `handleSkipAddress` is a code smell — the plan
  should treat fixing the underlying race as the real fix, not adjusting
  the timeout. If researcher discovers the race is in store/mutation
  ordering, the proper fix is awaiting the mutation success before
  advancing (with optimistic UI for instant feedback).
- The FORMS-01 audit doc is the highest-leverage durable artifact in this
  phase — it documents WHY each remaining `required` survives, which
  prevents future "is this validator necessary?" debates. Make it
  greppable and human-readable.
- Phone-banking field-mode forms have NEVER had a UX review (per
  REQUIREMENTS.md line 63). The audit may surface 5+ over-eager validators
  there. That's good — we want to find them.

</specifics>

<deferred>
## Deferred Ideas

- **Configurable per-campaign auto-advance allowlist** (option 3 in CANV-01
  discussion) — rejected as out of scope. If a campaign manager needs to
  disable auto-advance for safety reasons, that's a v1.20+ admin feature.
- **Long-press to skip / two-tap confirmation** — rejected in favor of
  immediate skip with Undo toast (D-06). Reconsider only if real
  accidental-skip incident reports come in from v1.18 production.
- **Replacing local useState in the wizard with React Hook Form** —
  rejected as scope creep. The wizard's simple state works fine; RHF
  is for complex desktop forms.
- **Refactoring InlineSurvey into separate canvassing/phone-banking
  components** — rejected. The shared component is the right architecture;
  the bug is just the over-coupled `requiresNotes` (D-09).
- **GitHub issue per audit-discovered product bug** — rejected in favor
  of `.planning/todos/pending/` files (D-15). Lower overhead, in-source.
- **Audit-and-fix of desktop campaign-manager forms** — rejected as out
  of scope. v1.18 is field UX. Desktop forms are a separate audit if/when.
- **New animation library / motion system for the card swap** — rejected.
  Use `tw-animate-css` (already in stack) sparingly with
  `prefers-reduced-motion` honor, or just instant swap. No new deps.

</deferred>

---

*Phase: 107-canvassing-wizard-fixes*
*Context gathered: 2026-04-10 via interactive discuss-phase*
