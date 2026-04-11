---
phase: 108
slug: house-selection-active-state
status: draft
shadcn_initialized: true
preset: new-york / neutral (existing)
created: 2026-04-11
---

# Phase 108 — UI Design Contract

> Small new-behavior phase on top of an existing surface. This contract locks
> ONLY the NEW interaction contracts phase 108 introduces: map marker tap
> affordance + hit area, map auto-pan behavior, active marker visual delta,
> keyboard/ARIA contract for markers, tap-to-activate feedback, and the list
> view affordance confirmation. Everything else inherits unchanged from
> phase 107's UI-SPEC (tokens, typography, toast contract, haptic contract,
> `usePrefersReducedMotion`, AAA baseline). Reference phase 107 rather than
> re-specify.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (initialized in earlier phases) |
| Preset | new-york style, neutral base, CSS variables (inherited) |
| Component library | shadcn/ui on Radix primitives |
| Map library | Leaflet + react-leaflet (existing) |
| Icon library | lucide-react (shell); Leaflet `L.Icon` for map markers |
| Reduced-motion hook | `usePrefersReducedMotion` (phase 107 D-20) |
| Toasts | sonner (NOT used in this phase per D-02) |
| Haptic | `navigator.vibrate(50)` via the feature-detect helper from phase 107 |

**No new dependencies.** No third-party shadcn registries declared.
No new lucide icons. No new sonner variants.

---

## Inheritance from Phase 107

Phase 108 does NOT re-specify these — they carry forward unchanged. Executor
must read `107-UI-SPEC.md` for the authoritative contract on each:

| Inherited contract | Source section | Phase 108 usage |
|--------------------|----------------|-----------------|
| Spacing scale (Tailwind defaults, 44px touch floor) | 107 §Spacing | All new tappable surfaces honor `min-h-11` |
| Typography | 107 §Typography | No new type roles introduced |
| Color tokens (oklch, accent reserved-for list) | 107 §Color | Active marker ring uses the existing `--primary` token |
| Haptic contract | 107 §Haptic | Reused verbatim for tap-to-activate (D-02/D-06) |
| `usePrefersReducedMotion` hook | 107 §Card Swap Transition, D-20 | Gates Leaflet `panTo` animate flag (D-05) |
| Card Swap Transition (card fade/slide + focus move + ARIA live) | 107 §Card Swap Transition | Reused verbatim for tap-to-activate card swap (D-02/D-06) |
| AAA accessibility baseline | 107 §Accessibility Contract | Extended with new marker ARIA contract below |
| Registry safety (no third-party) | 107 §Registry Safety | Unchanged |

**Explicit non-use of toast:** per CONTEXT.md D-02, tap-to-activate does NOT
fire a sonner toast. The intentional gesture is its own confirmation.
Auto-advance remains the only triple-channel event (from phase 107 D-03).
This asymmetry is documented and intentional — do not "normalize" it.

---

## New Contracts — Tap to Activate

### Contract 1 — List-Tap Affordance (SELECT-01)

The existing `DoorListView` button at `DoorListView.tsx:108-160` is already
visually correct. This contract LOCKS the existing affordance so downstream
work does not regress it.

| Concern | Spec | Source |
|---------|------|--------|
| Element | `<button>` per household row | existing `DoorListView.tsx:108` |
| Touch target | `min-h-11` (44px) — satisfies AAA + mobile-field parity | existing `:118` |
| Idle visual | Existing row layout: index, address, status badge, navigate icon | existing |
| Current/active visual | `bg-accent` applied when `isCurrent === true` | existing `:119` |
| Hover (desktop) | Inherit default shadcn hover on neutral surfaces; do not add a new hover token | existing |
| Pressed (mobile) | No new press animation. Mobile browsers render the default tap highlight. No `active:scale` on list rows — they are information rows, not primary CTAs. | new lock |
| ARIA current | `aria-current="step"` when row is the active household | existing `:114` |
| ARIA label | `Jump to door {n}, {address}, {statusLabel}` | existing `:115` |
| Close-on-tap | Sheet closes via `onOpenChange(false)` after `onJump(index)` | existing `:112`, locked by D-03 |
| Feedback on tap | **Card swap + haptic** (see "Tap Feedback" below). No toast. | D-02 |

**No new styles, no new classes.** This contract's sole purpose is to declare
that the list-tap affordance is locked as-is and the phase 108 work is the
state-machine/pin-clear fix behind it — NOT a visual redesign.

**Render-path regression guard (D-13):** a HouseholdCard render test must
assert the visible address heading text changes after a simulated list-tap.
Hook-state assertions are insufficient.

---

### Contract 2 — Map Marker Tap Affordance (SELECT-02)

The existing `CanvassingMap` markers at `CanvassingMap.tsx:169-185` are
decoration only — they have no click handler and no discoverable tap
affordance. This contract introduces the minimum viable affordance without
changing the icon art or Leaflet tile layer.

#### 2a. Discoverability — "can I tap this?"

| Concern | Spec |
|---------|------|
| Desktop cursor | `cursor: pointer` on all household markers. Implemented via Leaflet marker `options.interactive = true` (default) plus a scoped CSS rule on the existing Leaflet class the marker already renders under. Do NOT change the icon art. |
| Mobile cursor | n/a (no cursor) — touch discoverability comes from the list-first UX; the map is secondary. We accept that map-tap is a power-user discovery. |
| Tooltip on hover/focus | Existing behavior kept (`<Tooltip>{address}</Tooltip>` at `:178`). Desktop users get the address on hover. Active marker tooltip remains `Current door: {address}` (existing `:180`). |
| No new overlay UI | Do NOT add a persistent "Tap markers to activate" hint bar. The tooltip + cursor + icon swap are sufficient. |

**Deferred (NOT in this phase):**
- Marker pulse / ripple / bounce animations
- Connection line from volunteer location to active marker
- Persistent help text in the map card header

#### 2b. Hit area — 44px touch target floor

| Concern | Spec |
|---------|------|
| Visible icon size (idle) | `[25, 41]` px (existing `householdIcon` definition at `CanvassingMap.tsx:39-47`). **Unchanged.** |
| Visible icon size (active) | `[30, 49]` px (existing `activeHouseholdIcon` definition at `:28-37`). **Unchanged.** |
| **Hit area (both states)** | Must be **≥ 44×44 px** to honor the phase 107 touch target floor and CLAUDE.md principle 2. Implemented via a transparent expanded hit-area layer on each marker's root icon element. |
| Implementation | Add a CSS rule targeting the Leaflet marker root (e.g. via the existing `canvassing-map-active-marker` class analog for the idle marker, or a new `canvassing-map-household-marker` class added to the `householdIcon` definition) with `::before` pseudo-element sized `min-width: 44px; min-height: 44px`, centered on the visible icon's anchor point, `background: transparent`, `pointer-events: auto`. The visible icon art itself is untouched. |
| Hit area and the tooltip | Leaflet's hover-tooltip must still open from the visible icon, not the invisible hit area edge. The `::before` expansion is click/tap-only — Leaflet's tooltip trigger is attached to the marker root which includes the pseudo-element automatically. Verify in manual test on both desktop hover and mobile tap. |
| Hit area and map pan/drag | The expanded hit area must NOT block map pan gestures on its transparent edges. Leaflet marker clicks already stop-propagation for clicks, not drags — the default behavior is correct. Do NOT add custom `stopPropagation`. |
| Overlap between markers | If two markers are <44 px apart at current zoom, the topmost (later z-index) wins the tap. We accept this — the volunteer can zoom in to disambiguate. Do NOT add a "which one did you mean?" disambiguation UI in this phase. |

**Acceptance test:** a Playwright click at coordinates 20px from the marker's
visible center activates the household. A click at 50px does not.

#### 2c. Keyboard and ARIA

Leaflet markers are `<div>` elements by default — not semantic buttons. This
contract upgrades them to satisfy AAA keyboard and screen reader access.

| Attribute | Value | Applied to |
|-----------|-------|-----------|
| `role` | `button` | Each household marker's DOM root |
| `aria-label` | `` `Activate door: ${household.address}` `` | Each household marker |
| `aria-pressed` | `true` when `isActive === true`, otherwise `false` | Each household marker |
| `tabIndex` | `0` | Each household marker |
| Keyboard activation | Enter AND Space both fire the same `handleJumpToAddress(index)` call as click | Each household marker |
| Focus visible | Leaflet default focus ring is insufficient — add `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible` for the marker root class | New CSS rule |
| Volunteer location marker | **Not** keyboard activatable (`tabIndex={-1}`, no `role`). It's informational, not interactive. | `volunteerIcon` marker |

**Implementation path:** Leaflet's `Marker` exposes `options.keyboard = true`
(default) which wires Enter/Space, and `options.alt` populates an `alt`
attribute. Richer ARIA requires post-mount DOM access via
`markerRef.current?.getElement()` in a `useEffect` that runs when the marker
registers. Apply `setAttribute` calls to the returned element. Alternatively
(and cleaner) use react-leaflet's `ref` on each `<Marker>` and set attributes
in an effect. Executor picks the cleaner path; the ARIA spec above is
non-negotiable regardless.

#### 2d. Active marker visual state

The existing code swaps `activeHouseholdIcon` (30×49, class
`canvassing-map-active-marker`) vs `householdIcon` (25×41, no class). This
contract locks the VISUAL delta — not by changing the PNG, but by ensuring
the `canvassing-map-active-marker` CSS class gives a clear, AAA-contrast
differentiator beyond the ~20% size bump.

| Concern | Spec |
|---------|------|
| Size delta | Existing: 25×41 → 30×49 (~20% linear). **Keep** — do not enlarge further. |
| Color delta | The `canvassing-map-active-marker` class MUST apply a visual emphasis that is NOT hue-only (AAA color-blindness rule from phase 107 §Color). Use a filter-based approach: `filter: drop-shadow(0 0 0 var(--primary)) drop-shadow(0 0 4px var(--primary))` to render a civic-blue glow halo around the default Leaflet marker PNG. The halo is ~4px wide and carries the "I am active" signal even for colorblind users because the halo + the size delta + the ARIA `aria-pressed=true` combine. |
| Z-index | Active marker must render ABOVE idle markers. Use Leaflet's `zIndexOffset: 1000` on the active marker (new prop on the `<Marker>` when `isActive === true`). |
| Anti-flicker on swap | When activation changes, the old active marker's class drops instantly and the new active marker's class applies instantly. No transition on the halo (drop-shadow transitions are expensive and not necessary). |
| Reduced motion | Halo is static, not animated — nothing to gate. |

**Why not a new PNG:** changing the icon art forks the asset pipeline (phase
109 scope). Using CSS `drop-shadow` on the existing PNG delivers the visual
delta with zero new assets.

**Fallback:** if `filter: drop-shadow` produces a rendering glitch on any
target browser in manual verification, the fallback is a
`outline: 3px solid var(--primary); outline-offset: 0` on the marker's icon
element. Executor documents whichever approach shipped in the plan.

#### 2e. Auto-pan on activation

Per D-05: tapping a marker smoothly pans the map to center the new active
household. **No auto-zoom.**

| Concern | Spec |
|---------|------|
| Leaflet API | `map.panTo([lat, lng], { animate: !prefersReducedMotion, duration: 0.5 })` |
| Duration (motion enabled) | `0.5` seconds (Leaflet `duration` is in seconds). Leaflet's default easing is fine. |
| Duration (reduced motion) | `animate: false` — instant jump. Do not pass a `duration` key. |
| Zoom | **NOT changed.** Do not call `setView`, `flyTo`, or `setZoom`. Volunteer's zoom level is a deliberate user choice. |
| Pan trigger | Only on marker tap. Do NOT auto-pan on `auto-advance`, `skip`, or `resume` entry points in this phase. The existing logic that centers on mount stays — only NEW pans are added for map-tap. |
| Ref wiring | `MapProvider` exposes the underlying Leaflet map via a ref callback or context hook. If no such access exists, add it via react-leaflet's `useMap` hook inside a small child component that holds the marker rendering. Executor picks the simpler path; the contract is the pan call itself. |
| Prefers-reduced-motion source | `usePrefersReducedMotion` hook from phase 107 D-20. Do NOT add a new helper. |
| Idempotent | Tapping the already-active marker re-pans anyway (useful: the volunteer may have panned away and wants to re-center). No-op prevention is NOT in this phase's scope. |

---

### Contract 3 — Tap Feedback (shared by list-tap and map-tap)

Both SELECT-01 and SELECT-02 produce the SAME in-wizard feedback. The
difference is SELECT-02 additionally pans the map and swaps the marker icon;
the wizard-side feedback below is identical.

| Channel | Behavior | Source |
|---------|----------|--------|
| Visual — card swap | The `HouseholdCard` in the wizard panel is replaced with the new active household. Animation is `animate-in fade-in slide-in-from-right-4 duration-200` when motion is allowed; instant mount under `prefersReducedMotion`. Reuses the transition defined in phase 107 §Card Swap Transition. | 107 inheritance, D-02, D-06 |
| Focus move | Focus moves to the new HouseholdCard's address heading (`tabindex={-1}` + `ref.focus()` — already supported by `HouseholdCard.tsx:97-102`). For map-tap from keyboard, focus leaves the Leaflet marker and lands on the address heading. For list-tap, focus already leaves the sheet when `onOpenChange(false)` fires; it must land on the address heading, not `<body>`. | 107 inheritance, AAA rule |
| Haptic | `navigator.vibrate(50)` via the phase 107 feature-detect helper. Single 50 ms pulse. Silent no-op on iOS Safari / desktop. | 107 inheritance, D-02, D-06 |
| ARIA live | The existing `aria-live="polite"` region in the canvassing route announces `Now at {address}. Door {n} of {total}.` — identical to auto-advance. | 107 inheritance |
| Toast | **NONE.** Do not fire sonner on tap-to-activate. | D-02 (explicit) |
| Map marker icon swap (SELECT-02 only) | `activeHouseholdIcon` replaces `householdIcon` on the new target; old active marker returns to `householdIcon`. Existing code at `CanvassingMap.tsx:176` already does this when `activeHouseholdKey` updates. No new code. | D-06 |

**Why no toast for tap:** the user's own gesture IS the acknowledgement.
Toasting on every list-browse tap creates noise. Auto-advance gets a toast
because the SYSTEM initiated the transition; tap-to-activate gets none
because the USER initiated it. This asymmetry is documented intentionally in
CONTEXT.md D-02 — future contributors must not "normalize" it.

**Single-tap gesture:** per D-04, single tap (or single Enter/Space press)
activates immediately. No long-press, no popup-with-confirmation, no
double-tap-to-confirm. Matches list-tap.

---

## Focus Management — Full Matrix

AAA requires focus never falls to `<body>`. This phase's entry points:

| Entry point | Focus source | Focus destination |
|-------------|--------------|-------------------|
| List-tap (mouse) | Row button | HouseholdCard address heading |
| List-tap (keyboard) | Row button (Enter/Space) | HouseholdCard address heading |
| Map-tap (mouse/touch) | Marker root div | HouseholdCard address heading |
| Map-tap (keyboard, Enter) | Marker root div | HouseholdCard address heading |
| Map-tap (keyboard, Space) | Marker root div | HouseholdCard address heading |

All five land on the address heading via the existing `ref.focus()` path the
phase 107 auto-advance wiring already uses. The route component receives
`handleJumpToAddress` from the hook and must invoke the existing focus-move
effect after the card swap. Executor wires the trigger; the contract above
is the target.

**Edge case:** if the `HouseholdCard` ref is not yet mounted when
`handleJumpToAddress` fires (e.g. under a conditional render), focus falls to
the wizard root section `<section aria-labelledby="...">`, NOT to `<body>`.
Add a `tabIndex={-1}` fallback target if the existing route doesn't already
have one.

---

## Accessibility Contract Delta (additions to phase 107)

Phase 107's AAA baseline carries forward unchanged. New requirements:

| New requirement | How phase 108 satisfies it |
|-----------------|---------------------------|
| Map markers keyboard accessible | `tabIndex={0}`, `role="button"`, Enter/Space activation (§Contract 2c) |
| Map markers screen reader labeled | `aria-label="Activate door: {address}"`, `aria-pressed={isActive}` (§Contract 2c) |
| Map marker focus visible | `:focus-visible` outline matches `var(--ring)`, 2px width, 2px offset (§Contract 2c) |
| Map marker touch target ≥ 44px | Transparent `::before` hit area expansion (§Contract 2b) |
| Active marker NOT hue-only | CSS `drop-shadow` halo + size delta + `aria-pressed` combine (§Contract 2d) |
| Map pan respects reduced motion | `animate: false` under `prefersReducedMotion` (§Contract 2e) |
| Focus never falls to body on activation | Five entry points all land on address heading (§Focus Management) |

**Contrast check for the halo:** `var(--primary)` is civic blue; its contrast
against both light and dark map tile areas must be verified manually during
implementation. If the halo is invisible on mid-value tile regions (urban
map gray ~#888), executor adds a 1px white inner stroke via a second
`drop-shadow(0 0 0 white)` layer. Document the final stack in the plan.

---

## Copywriting Contract

Phase 108 adds zero user-facing strings except ARIA labels. No new toasts,
no new buttons, no new empty states.

| Element | Copy | Notes |
|---------|------|-------|
| Marker ARIA label (idle) | `Activate door: {address}` | e.g. `Activate door: 123 Main St` |
| Marker ARIA label (active) | Same — the `aria-pressed="true"` conveys the active state | Do NOT change the label text based on state (screen readers handle `aria-pressed`) |
| Marker hover tooltip (idle) | `{address}` (existing, unchanged) | `CanvassingMap.tsx:181` |
| Marker hover tooltip (active) | `Current door: {address}` (existing, unchanged) | `CanvassingMap.tsx:180` |
| List row ARIA label | `Jump to door {n}, {address}, {statusLabel}` (existing, unchanged) | `DoorListView.tsx:115` |
| ARIA live announcement on activation | `Now at {address}. Door {n} of {total}.` (inherited from phase 107) | Reused verbatim |

**Tone rules** (inherited from phase 107):
- Sentence case. Never Title Case.
- Verbs first where possible (`Activate`, `Jump`, `Now at`).
- No exclamation marks, no emoji, no `please`.
- No party-coded language.

---

## Component Inventory (Modified, Not New)

| Component | Phase 108 changes |
|-----------|------------------|
| `CanvassingMap.tsx` | Accept new `onHouseholdSelect(index)` prop. Add marker click handlers via react-leaflet `eventHandlers={{ click }}` OR a shared `handleMarkerClick(index)` callback (Claude's discretion per CONTEXT.md). Add marker `ref` + `useEffect` to set `role`, `aria-label`, `aria-pressed`, `tabIndex`, and focus-visible outline class on each marker root. Add `zIndexOffset={1000}` on the active marker. Wire `usePrefersReducedMotion` and call `map.panTo(..., { animate: !prefersReducedMotion, duration: 0.5 })` in the tap handler. Add a `canvassing-map-household-marker` CSS class to the idle `householdIcon`. Add CSS for hit area expansion and `drop-shadow` halo on the active class. |
| `HouseholdCard.tsx` | No visual changes. The existing address heading + `tabIndex={-1}` + ref from phase 107 is already the focus target. May need a render-path test extension for D-13. |
| `DoorListView.tsx` | **No visual changes.** Existing affordance is already correct. Locked by Contract 1. |
| `useCanvassingWizard.ts` | Wrap `handleJumpToAddress` to clear `pinnedHouseholdKey` BEFORE calling the store's `jumpToAddress` (mirrors 107-08.1 advance/skip pattern). Fire haptic and trigger the same card-swap focus move and ARIA announce that phase 107 uses for auto-advance. |
| `canvassing.tsx` (route) | Pass `handleJumpToAddress` down to `CanvassingMap` as `onHouseholdSelect`. No new UI. |

**No new components.** No new lucide icons. No new sonner variants. No new
shadcn blocks.

---

## Out of Scope (do NOT redesign)

Leave exactly as-is:

- Leaflet marker PNG art (phase 109 asset pipeline scope)
- Map tile provider / base layer
- Zoom level on activation (D-05 — NOT changed)
- Volunteer location marker interactivity (informational only)
- Map header, legend, geolocation copy block
- `DoorListView` row layout, sort modes, badges
- `HouseholdCard` body layout, outcome grid, navigate CTA, skip button
- Toast system (no new variants)
- All phase 107 contracts (inherited verbatim)
- Offline queue state UI (phase 110 scope)
- Map layer ordering vs list view (phase 109 MAP-02 scope)

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none new — no new components added in this phase | not required |

**No third-party registries declared.** Vetting gate not applicable.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
