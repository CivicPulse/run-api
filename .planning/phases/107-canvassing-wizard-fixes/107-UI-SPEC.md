---
phase: 107
slug: canvassing-wizard-fixes
status: draft
shadcn_initialized: true
preset: new-york / neutral (existing)
created: 2026-04-10
---

# Phase 107 — UI Design Contract

> Bug-fix phase. The visual surface (HouseholdCard, OutcomeGrid, InlineSurvey)
> already exists. This contract locks ONLY the small new behaviors the phase
> introduces — toast variants, card-swap transition, haptics, notes affordance,
> skip affordance, outcome button states, and reduced-motion fallbacks.
> Everything else inherits the existing tailwind/shadcn tokens unchanged.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized) |
| Preset | new-york style, neutral base color, CSS variables |
| Component library | shadcn/ui on Radix primitives |
| Icon library | lucide-react |
| Font | system stack via Tailwind defaults |
| Tailwind | v4 with oklch tokens (`src/index.css`) |
| Toasts | sonner (already in stack) |
| Animations | tw-animate-css (use sparingly, must honor reduced-motion) |

**No new dependencies.** No third-party shadcn registries declared.

---

## Spacing Scale

Inherits existing tailwind defaults (multiples of 4). Phase-specific touch
target floor:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps inside buttons |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing inside cards |
| lg | 24px | Section padding inside HouseholdCard |
| xl | 32px | Card outer breathing room |

**Exceptions:**
- Touch target floor is **44px** (`min-h-11`) on every interactive element in
  the canvassing wizard. This is non-negotiable per CLAUDE.md design principle
  2 (mobile-field parity) and is already honored by the existing components.
- Outcome buttons use `min-h-14` (56px) per current OutcomeGrid — keep as-is.

---

## Typography

Inherits existing Tailwind type scale. The contract uses these existing roles
unchanged — no new sizes, no new weights:

| Role | Tailwind class | Usage in phase 107 |
|------|----------------|--------------------|
| Body | `text-sm` (14px) / `text-base` (16px) | Toast text, helper text, button labels |
| Label | `text-sm font-medium` | "Notes (optional)" label |
| Helper | `text-sm text-muted-foreground` | "(optional)" affordance, status copy |
| Heading (card) | `text-xl font-bold` | Address line in HouseholdCard |
| Outcome label | `text-sm font-semibold` | OutcomeGrid buttons (existing) |

Line heights inherit Tailwind defaults (1.5 body, 1.25 heading). No overrides.

---

## Color

Inherits the existing oklch token set in `web/src/index.css`. Phase 107 uses
ONLY these existing semantic tokens — no new color values:

| Role | Token | Phase 107 usage |
|------|-------|-----------------|
| Dominant (60%) | `bg-background` / `text-foreground` | Wizard surface, card body |
| Secondary (30%) | `bg-card` / `bg-muted` | HouseholdCard, helper backgrounds |
| Accent (10%) | `bg-primary` / `text-primary` | Civic-blue: address MapPin icon, primary "Navigate" CTA, focused outcome button |
| Destructive | `text-destructive` / `bg-destructive` | Save-failure error toast only |
| Muted | `text-muted-foreground` | Skip button label, helper copy, "(optional)" hint |

**Accent reserved for** (explicit list — never "all interactive elements"):
1. The address MapPin icon in HouseholdCard
2. The "Navigate to Address" primary CTA
3. The currently-active VoterCard ring/highlight
4. The success toast leading icon (CheckCircle)

**Color-blindness rule:** Outcome states (active / pending / saving / saved /
failed) must NEVER rely on hue alone. Each state must combine color with at
least one of: icon (`Check`, `Loader2`, `AlertCircle`), text label, or
position. This is a hard requirement for AAA compliance.

---

## Toast Contract (sonner)

Sonner is the only feedback channel for save-success, skip, and save-failure
in this phase. Four canonical variants:

| Variant | Trigger | Copy (≤30 chars) | Duration | Icon | Action |
|---------|---------|------------------|----------|------|--------|
| Success — auto-advance | Outcome saved, advancing | `Recorded — next house` | 2000ms | `CheckCircle` (`text-primary`) | none |
| Info — skip with undo | Skip tapped | `Skipped — Undo` | 4000ms | `SkipForward` (`text-muted-foreground`) | `Undo` button |
| Error — save failed | Door knock POST failed | `Couldn't save — tap to retry` | persistent (until dismissed or retried) | `AlertCircle` (`text-destructive`) | `Retry` button |
| Warning — undo unavailable | Undo tapped after another outcome was recorded | `Can't undo — already moved on` | 3000ms | `AlertCircle` (`text-muted-foreground`) | none |

**Standard toast properties (apply to ALL variants):**
- Position: `bottom-center` (sonner default for mobile-first; do not override
  to top — it collides with the address heading)
- Width: `max-w-sm` (~384px) — prevents overflow on 360px viewports
- Action button: shadcn `Button` style `size="sm"`, `variant="outline"`, with
  `min-h-11` to honor 44px touch floor
- Dismiss-on-tap-outside: enabled
- Stack limit: 1 visible at a time. New toasts replace prior toasts of the
  same kind (no toast-flood when the volunteer taps fast)
- Screen reader: sonner's built-in `role="status"` for success/info,
  `role="alert"` for error. Do not suppress.

**Reduced-motion:** sonner's slide-in animation is auto-disabled by sonner
when `prefers-reduced-motion: reduce` is set. No additional config needed,
but the executor must verify with the OS toggle in DevTools.

---

## Card Swap Transition

When auto-advance fires (D-03), `HouseholdCard` is replaced with the next
house. The contract:

| Concern | Default (motion enabled) | Reduced-motion fallback |
|---------|--------------------------|------------------------|
| Visual transition | tw-animate-css `animate-in fade-in slide-in-from-right-4 duration-200` on the new card | Instant swap. No fade. No slide. New card mounted directly. |
| Duration | 200ms | 0ms |
| Outgoing card | Unmounted immediately when new house resolves | Same |
| Focus management | Move keyboard focus to the new card's `address` heading via `ref.focus()` after mount. Use `tabindex={-1}` on the heading so it's focusable but not in the tab order. | Same — focus management is mandatory regardless of motion preference |
| ARIA announcement | `aria-live="polite"` region in the wizard root: `Now at {address}. Door {n} of {total}.` | Same |

**Detection:** Use the existing `usePrefersReducedMotion` hook if it exists,
otherwise add a tiny `window.matchMedia('(prefers-reduced-motion: reduce)')`
helper in `web/src/lib/`. Do not import a new package.

**Critical:** Focus must NOT be lost during the swap. If focus was on an
outcome button when it was tapped, the new card's address heading receives
focus. If focus was elsewhere, it stays where it was. Never let focus fall
back to `<body>`.

---

## Haptic Contract

Per D-03, haptic is the third feedback channel for auto-advance.

| Event | Pattern | Fallback |
|-------|---------|---------|
| Auto-advance success | `navigator.vibrate(50)` (single 50ms pulse) | Silent no-op if `'vibrate' in navigator` is false (iOS Safari, desktop) |
| Save failure | none | Toast + visual is sufficient; do not punish the volunteer with a buzz |
| Skip | none | Toast handles it |

**Implementation rules:**
- Wrap in a feature-detect helper: `function vibrate(ms){ if ('vibrate' in navigator) navigator.vibrate(ms) }`
- Never use a vibration pattern (e.g., `[50,50,50]`) — single pulse only
- Never call vibrate while a sheet/modal is open (could conflict with system gestures)
- No user-facing setting to disable vibration in this phase. iOS users naturally get the silent path. Android users can disable system-wide vibrate in OS settings.
- No new permission prompt — `navigator.vibrate` requires no permission

---

## Notes Field Affordance (CANV-03)

The InlineSurvey notes textarea label changes from required-style to
optional-style. The contract:

| Element | Spec |
|---------|------|
| Label text | `Notes` |
| Optional indicator | The literal string `(optional)` rendered inline as a sibling span, NOT a badge, NOT a tooltip |
| Optional indicator class | `text-muted-foreground font-normal ml-1` (visually quieter than the label itself) |
| Full label markup | `<Label htmlFor="field-call-notes" className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal ml-1">(optional)</span></Label>` |
| Placeholder | `Anything worth remembering? (optional)` |
| Min height | `min-h-[100px]` (existing) |
| Validation message | NONE when empty. Remove the `Add notes before saving this answered call.` destructive paragraph for the canvassing path. The phone-banking controlled-mode path keeps its current behavior unless FORMS-01 audit changes it. |
| Save button enabled state | Enabled with empty notes (the hard fix in D-08) |

**Why a span and not a Badge:** Linear/Stripe-clean tone. A badge shouts;
inline muted text whispers. The optional state should feel like the default,
not like an exception.

---

## Skip Button Affordance (CANV-02)

The existing skip button at the bottom of HouseholdCard. Contract:

| Property | Value |
|----------|-------|
| Variant | `ghost` (existing — keep) |
| Color | `text-muted-foreground` (existing — NOT destructive; skip is reversible per D-05, so destructive red would mislead) |
| Icon | `SkipForward` from lucide (existing) |
| Min height | `min-h-11` (44px, existing) |
| Label | `Skip` (existing) |
| Position | Bottom-right of HouseholdCard, paired with TooltipIcon (existing) |
| Disabled state | Disabled while a save is in flight (`isSavingDoorKnock === true`). Apply `aria-disabled="true"` and `pointer-events-none`. Reason: prevents a skip racing the save mutation (the actual D-07 race fix). |
| Loading state | None — skip is fire-and-advance. The undo toast is the reassurance. |
| ARIA label | `Skip this house. You can come back to it.` (longer than visible label, but speaks the reversibility for screen readers) |

**No confirmation modal.** Single tap skips. Undo lives in the toast.

---

## Outcome Button States (OutcomeGrid)

OutcomeGrid is the primary interaction surface. State machine for each
button during a save → advance window:

| State | Visual | Interactive |
|-------|--------|-------------|
| Idle | Existing variant (outline + per-outcome `bg/text/border` from `OUTCOME_CONFIG`) | Tappable |
| Pressed | `active:scale-[0.97] transition-transform duration-100` (existing — keep) | Tappable |
| Saving (this button) | Add `Loader2` icon spinning to the LEFT of the label, and apply `aria-busy="true"` to the grid wrapper. The button retains its color, does not gray out. | Disabled |
| Saving (other buttons) | Apply `opacity-50 pointer-events-none` to the WHOLE grid (already supported via `disabled` prop) | Disabled |
| Saved (success) | The button shows the existing checkmark/state for ~150ms before card swap. Optional — only if it doesn't slow down advance. | Disabled (auto-advance fires immediately) |
| Failed | Button returns to idle. The error toast carries the failure message. The button does NOT turn red — failure is a toast concern, not a button concern. | Tappable |

**Anti-double-tap rule:** The grid `disabled` prop must be set the moment
the first tap fires the mutation, BEFORE the network request resolves.
This is the load-bearing fix that prevents duplicate door knocks. It is the
real fix for the 300ms `setTimeout` smell in D-07 — gate the next user
action on the mutation's `isPending` flag, not on a wall-clock timeout.

**Reduced-motion:** The `active:scale-[0.97]` press effect is OK to keep
under reduced-motion (it's a press feedback, not a transition). The
`Loader2` spin is also OK — sonner and Radix both keep their spinners under
reduced-motion. No exception needed.

---

## Transition State (Save Success → Next House Ready)

The 200-500ms window between mutation success and the next HouseholdCard
mounting:

| Sub-state | UI |
|-----------|----|
| Mutation pending | Outcome grid disabled (see above). Card body unchanged. Loader2 on the active outcome button. |
| Mutation success, next house resolving | Card body unchanged. Toast already showing success. Do NOT show a skeleton — it would flash and feel slow. |
| Next house mounted | New HouseholdCard fades in (or instant under reduced-motion). Focus moves. ARIA announces. Haptic fires. |
| No next house (queue empty) | Replace card with `CanvassingCompletionSummary` (existing component). Toast says `All doors complete` and uses the success variant. |

**Held-card principle:** the volunteer should never see "nothing." The
current card stays mounted until the next card is ready to take its place.
This is why no skeleton — the old card IS the loading state.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Notes label | `Notes (optional)` |
| Notes placeholder | `Anything worth remembering? (optional)` |
| Skip button label | `Skip` |
| Skip ARIA | `Skip this house. You can come back to it.` |
| Auto-advance toast | `Recorded — next house` |
| Skip toast | `Skipped — Undo` (with Undo action) |
| Save-failure toast | `Couldn't save — tap to retry` (with Retry action) |
| Undo unavailable toast | `Can't undo — already moved on` |
| Completion summary toast | `All doors complete` |
| ARIA live announce | `Now at {address}. Door {n} of {total}.` |
| Outcome button (existing) | unchanged — set is the set per phase scope |

**Tone rules (per CLAUDE.md):**
- Sentence case, never Title Case
- Em dash `—` for the toast separator (looks more polished than `-`)
- Verbs first when possible (`Recorded`, `Skipped`, `Couldn't save`)
- Never use `please`, `oops`, `oh no`, exclamation marks, or emoji
- ≤ 30 chars for any toast text
- No party-coded language (`vote`, `polls`, `district` are fine; `red state`, `blue wave`, etc. are not — though none of these come up in this phase)

---

## Accessibility Contract (AAA — non-negotiable)

| Requirement | How phase 107 satisfies it |
|-------------|---------------------------|
| Contrast 7:1 normal text, 4.5:1 large text | Inherited from existing oklch tokens. No new colors introduced, so no new contrast risk. |
| Touch targets ≥ 44px | `min-h-11` on every button. `min-h-14` on outcome buttons. Verified in HouseholdCard, OutcomeGrid, sonner action buttons. |
| Keyboard navigation | Tab order: outcome grid → skip button. After auto-advance, focus moves to new card's address heading via `tabindex={-1}` + `ref.focus()`. Sonner action buttons are reachable via tab when toast is visible. |
| Screen reader | `aria-live="polite"` region in wizard root announces auto-advance. `aria-busy="true"` on outcome grid during save. Sonner uses `role="status"` / `role="alert"`. Skip button has descriptive `aria-label`. |
| Reduced motion | Card swap, slide animations honor `prefers-reduced-motion`. Outcome press scale is allowed (it's a tactile press feedback, not a transition). |
| Color blindness | Outcome states combine color + icon + label. Toast states combine color + icon + verb. Skip button uses muted gray, not red. |
| Focus visible | Inherited from shadcn `focus-visible:ring-ring focus-visible:ring-2` defaults. Do not override. |
| No motion-only feedback | Auto-advance uses three channels (toast + visual swap + haptic). Volunteers with reduced-motion still get toast + instant swap + haptic. |
| No haptic-only feedback | Haptic is a redundant third channel; toast and visual carry the same information. |

---

## Component Inventory (Modified, Not New)

| Component | Phase 107 changes |
|-----------|------------------|
| `HouseholdCard.tsx` | Receive new card via animation wrapper. Address heading gets `tabindex={-1}` + ref for focus management. Skip button gets `aria-disabled` while save in flight. |
| `OutcomeGrid.tsx` | Add per-button `Loader2` for saving state. Add `aria-busy` on grid wrapper. Disable on first tap (not on timeout). |
| `InlineSurvey.tsx` | `requiresNotes` becomes explicit prop with default `false` (D-09). Remove notes-required destructive paragraph for canvassing path. Update label markup to include muted `(optional)` span. |
| `useCanvassingWizard.ts` | Expand `AUTO_ADVANCE_OUTCOMES` set (D-01). Replace 300ms setTimeout in skip handler with mutation-await (D-07). Wire up triple-channel feedback function (toast + focus + vibrate). Add `aria-live` text setter. |
| `canvassing.tsx` (route) | Add the `aria-live="polite"` region. Add the `prefers-reduced-motion` detection (or use shared hook). |

**No new components are introduced by this phase.** No `web/src/components/ui/` additions. No third-party shadcn registry pulls.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none new — existing `button`, `card`, `badge`, `separator`, `tooltip`, `sheet`, `radio-group`, `textarea`, `label` only | not required |

**No third-party registries declared.** Vetting gate not applicable.

---

## Out of Scope (do NOT redesign)

These are explicitly NOT in the phase 107 design contract — leave them
exactly as they are:

- Survey question rendering (multiple choice, scale, free text layouts)
- Outcome icons, labels, codes, or color assignments
- Map/list view layout (phase 108/109)
- VoterCard internals
- Tailwind color palette / oklch tokens / typography scale
- Tour overlay positioning
- ResumePrompt sheet
- DoorListView sort/filter UI
- CanvassingCompletionSummary internals
- Phone banking UX (except whatever the FORMS-01 audit surfaces, in which
  case the audit doc records the visual change row by row — this contract
  does NOT pre-spec phone banking)

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
