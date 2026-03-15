# Project Research Summary

**Project:** CivicPulse Run API — v1.4 Volunteer Field Mode
**Domain:** Mobile-first volunteer field operations (canvassing + phone banking)
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

v1.4 is a frontend-only milestone that adds a purpose-built mobile experience for campaign field volunteers. The product pattern is well-established: industry incumbents (MiniVAN, Ecanvasser, Qomon) all follow a linear wizard model — see assignment, work through it step by step, record outcomes. The core insight from research is that the existing backend is already complete. All required endpoints exist across v1.0–v1.3. The entire milestone is new frontend routes, new mobile-optimized components, and one new npm package (driver.js for guided tours). No new database migrations, no new API endpoints except one optional convenience aggregation (`GET /my-assignments`).

The recommended approach is a parallel route subtree (`/campaigns/$campaignId/field/...`) that bypasses the existing sidebar-heavy admin layout entirely. This is the single most important architectural decision: field mode must have its own layout shell with no admin navigation, no data tables, and no desktop chrome. All existing React Query hooks (`useWalkListEntries`, `useClaimEntry`, `useRecordDoorKnock`, etc.) are reused without modification — only the UI layer changes. One new package is required: driver.js (~5kB gzipped) replaces the commonly-suggested react-joyride, which is confirmed broken on React 19 due to deprecated APIs.

The primary risk is treating field mode as a "responsive version" of the existing admin UI. Research and competitor analysis make clear that a compressed admin interface is fundamentally unusable in field conditions (one-handed, gloves, sunlight, walking). The second risk is state loss: unlike office-based admin users, field volunteers experience constant interruptions (phone calls, physical movement, OS memory pressure) that destroy in-memory React state. Wizard state must be persisted to sessionStorage via Zustand persist middleware from day one — not retrofitted later (estimated 2–3 day retrofit cost if skipped).

## Key Findings

### Recommended Stack

The existing stack (React 19, TanStack Router, TanStack Query, shadcn/ui, Zustand, Tailwind v4, vaul, sonner) covers everything needed. One new runtime dependency is required and one shadcn component needs to be generated.

**Core technologies:**
- **driver.js ^1.4.0**: Guided onboarding tour — framework-agnostic, ~5kB gzipped, React 19 compatible. react-joyride is eliminated: uses deprecated `unmountComponentAtNode` removed in React 19, unmaintained 9+ months.
- **zustand/middleware (persist)** (already installed): Tour completion + wizard state persistence — zero new dependencies. Use `sessionStorage` for wizard state (tab-scoped, clears on close); `localStorage` only for tour completion flags and preferences.
- **vaul via shadcn Drawer** (vaul already installed): Mobile bottom sheet for wizard containers — run `npx shadcn@latest add drawer` to generate the component wrapper. Snap points at `["355px", 1]` for half/full screen.
- **Native `tel:` URI**: Tap-to-call — web standard, zero dependencies. Numbers must be stripped to E.164 format; always provide a "Copy Number" fallback for desktop/WebView contexts.
- **All existing hooks**: `useWalkListEntries`, `useRecordDoorKnock`, `useClaimEntry`, `useRecordCall`, `useSurveyScript`, `useRecordResponses`, `useShifts`, `usePermissions` — zero changes required.

**Installation summary:** `npm install driver.js` and `npx shadcn@latest add drawer`. Total new runtime dependencies: 1.

See `.planning/research/STACK.md` for full rationale and alternatives considered.

### Expected Features

Research against MiniVAN, Ecanvasser, and Qomon produced a clear feature hierarchy. The backend supports 90%+ of needed functionality already.

**Must have (table stakes):**
- Volunteer hub/landing page — entry point showing active assignment, routing to canvassing or phone banking
- Linear canvassing wizard — step-by-step: address card → knock → outcome buttons → inline survey → next
- Door-knock outcome buttons — large touch-target buttons (not dropdowns) for Not Home / Contact / Refused / etc.
- Phone banking tap-to-call — `tel:` links invoking native dialer; mobile-stacked layout
- Phone banking call flow — claim → voter info → tap-to-call → outcome → inline survey → next
- Inline survey after contact — reuse existing `SurveyPanel` logic in mobile-optimized layout
- Progress indicator — persistent "12 of 47 doors" bar in field header
- 44px minimum touch targets — across all interactive elements in field mode
- Session start/stop controls — clear entry and exit from each mode

**Should have (differentiators):**
- Guided onboarding tour (driver.js) — zero-training UX; runs once per user per campaign
- Contextual tooltips (`?` icons using existing Radix Tooltip) — ongoing reference beyond the tour
- Household grouping in canvassing — group entries by `household_key` (data already exists)
- Voter context card — name, party, age, propensity before the knock
- Milestone celebrations — toast at 25%/50%/75%/100% completion

**Defer (v1.5+):**
- Interactive map view — requires map SDK, GPS, pin rendering; address links to Google/Apple Maps serve as workaround for v1.4
- Offline mode / service worker — IndexedDB queue, conflict resolution, sync engine; not justified until real-world connectivity data exists
- Auto-advance timer — no architectural dependency; can layer on after core flow is stable
- Native mobile app / PWA wrapper — out of scope per PROJECT.md

See `.planning/research/FEATURES.md` for full feature dependency graph and existing API surface mapping.

### Architecture Approach

The field mode lives in a new parallel route subtree (`/campaigns/$campaignId/field/`) with its own layout file (`field.tsx`) rendering a mobile shell: sticky top bar, back navigation, progress indicator — no sidebar, no admin nav. A 3-line addition to `__root.tsx` bypasses the existing sidebar layout for all `/field` routes. All existing hooks are imported without modification into new field routes; only the UI layer is new. New components live in `web/src/components/field/`.

**Major components:**
1. `field.tsx` (layout route) — Mobile shell with FieldShell; bypasses admin sidebar via `__root.tsx` `isFieldMode` condition
2. `field/index.tsx` — Volunteer landing; queries active assignments and routes to canvassing or calling
3. `field/canvassing/$walkListId.tsx` — Linear canvassing wizard; discriminated union state machine (`navigating → at-door → recording → surveying → complete`)
4. `field/phone-banking/$sessionId.tsx` — Phone banking field mode; mirrors existing `call.tsx` state machine with mobile layout and `tel:` links
5. `components/field/OutcomeGrid.tsx` — Large touch-target outcome buttons (imports existing `OUTCOME_GROUPS` constant; extract `RESULT_CODES` from `DoorKnockDialog` to shared location)
6. `components/field/InlineSurvey.tsx` — Survey questions inline (imports existing `useSurveyScript`, `useRecordResponses`)
7. `components/field/TourOverlay.tsx` — driver.js onboarding wrapper with per-segment localStorage state via `onboardingStore`
8. `components/field/FieldProgress.tsx` — Progress bar using existing walk list stats and session progress APIs

**Patterns to follow:**
- State machine: discriminated union type (matches proven pattern in `call.tsx` lines 26-33)
- Hook reuse without modification: import existing hooks directly, no wrapper hooks
- New components, shared constants: `components/field/` uses same hooks + type constants as admin; no `isMobile` props on existing components
- `data-tour` attributes on all field elements from Phases 1–3 (enables tour in Phase 6 without retroactive annotation)

See `.planning/research/ARCHITECTURE.md` for full route structure, component boundaries, data flow maps, and 7-phase build order.

### Critical Pitfalls

1. **Admin layout leaking into field mode** — Field routes must have their own layout route (`field.tsx`) with no sidebar. Adding `/field` routes under the existing campaign layout inherits full admin nav; volunteers click into voter search and get lost or accidentally modify data. Recovery cost: LOW if caught early (1–2 days), but sets a bad precedent. Fix from Phase 1: `isFieldMode` bypass in `__root.tsx`.

2. **Wizard state loss on interruption** — React `useState` is destroyed by incoming phone calls, app switching, and OS memory pressure. Volunteers constantly lose in-progress door knock data. Fix from Phase 2: Zustand persist with `sessionStorage`; resume prompt on re-entry; save after each step transition, not only on final submit. Recovery cost if skipped: 2–3 days.

3. **"Responsive" admin UI shipped as field mode** — Wrapping existing admin components with `flex-col` on mobile produces an unusable shrunk-down admin interface. The two-panel desktop `call.tsx` layout and five-column walk list table are fundamentally incompatible with one-handed field use. Fix: share hooks only, never page-level components; new `components/field/` from the start. Recovery cost if skipped: 5+ day rewrite.

4. **`tel:` links silently failing** — Formatted phone numbers (`(555) 123-4567`) passed to `href="tel:"` behave inconsistently; Android WebViews silently swallow `tel:` links; desktop shows nothing or opens random app. Fix: `formatForDial()` utility stripping to E.164; "Copy Number" fallback button on all tap-to-call elements; desktop detection showing copyable text.

5. **react-joyride broken on React 19** — The most popular React tour library uses `unmountComponentAtNode` and `unstable_renderSubtreeIntoContainer` (both removed in React 19). It has been unmaintained 9+ months. Fix: use driver.js (framework-agnostic, ~5kB, confirmed React 19 compatible). If driver.js is reconsidered, react-shepherd also has a known React 19 wrapper incompatibility.

## Implications for Roadmap

The architecture's dependency analysis maps directly to a 7-phase delivery. Phase ordering is driven by: layout infrastructure before content, canvassing before phone banking (produces shared components), tour after all screens exist, polish always last.

### Phase 1: Field Layout Shell + Root Bypass

**Rationale:** All field routes depend on this layout infrastructure. Establishing `/field/` as a no-sidebar zone from day one prevents the highest-cost pitfall (admin layout leaking) and sets the pattern that field mode shares hooks but not UI components.
**Delivers:** `field.tsx` layout with FieldShell component; `__root.tsx` `isFieldMode` bypass (3 lines); "Field Mode" nav link in AppSidebar; bare route tree accessible to test.
**Addresses:** Table stakes — back-to-hub navigation, session controls shell.
**Avoids:** Pitfall 1 (admin nav in field mode), Pitfall 3 (shared admin layout). Recovery cost if skipped: LOW now, but every subsequent phase builds on this foundation.

### Phase 2: Volunteer Landing Page

**Rationale:** The hub is the single entry point for all field features. Contains the only non-trivial new backend work: either `GET /my-assignments` endpoint (Low complexity) or client-side filter of existing `useShifts` + `useWalkLists` queries. Must exist before canvassing or phone banking can be reached naturally.
**Delivers:** Volunteer landing page showing active assignment type (canvassing vs. phone banking) and routing to appropriate wizard; optional `GET /campaigns/{id}/my-assignments` endpoint.
**Addresses:** Table stakes — volunteer hub page, session start controls.
**Uses:** `useShifts`, `useWalkLists`, `usePhoneBankSessions` (all existing hooks, zero changes).

### Phase 3: Canvassing Wizard + Shared Field Components

**Rationale:** Canvassing is more complex and produces all shared `components/field/` components (OutcomeGrid, VoterCard, AddressCard, WizardStepper, FieldProgress). Building it first means phone banking reuses finished components. Wizard state persistence with Zustand must be designed in here — retrofitting later is a 2–3 day cost. All `data-tour` attributes added to elements as they are built (required by Phase 6).
**Delivers:** `field/canvassing/$walkListId.tsx` with discriminated union state machine; `onboardingStore` (Zustand persist); Zustand persist wizard state in sessionStorage; resume-on-reentry prompt; `RESULT_CODES` extracted to shared constants; OutcomeGrid, VoterCard, AddressCard, WizardStepper, FieldProgress components; `data-tour` attributes on all elements.
**Addresses:** Table stakes — linear canvassing wizard, door-knock outcome buttons, mobile touch targets (44px minimum), progress indicator.
**Avoids:** Pitfall 2 (wizard state loss), Pitfall 3 (shared admin UI components).
**Uses:** `useWalkListEntries`, `useRecordDoorKnock`, `useUpdateEntryStatus` (existing).

### Phase 4: Inline Survey Integration

**Rationale:** Survey is used by both canvassing (after "Contact Made") and phone banking (after "Answered"). Building `InlineSurvey.tsx` as a standalone component here avoids duplication when phone banking is built next. Also adds `data-tour` attributes to survey elements before the tour phase.
**Delivers:** `InlineSurvey.tsx` component integrated into canvassing wizard; `data-tour` attributes on survey elements.
**Addresses:** Table stakes — inline survey after contact.
**Uses:** `useSurveyScript`, `useRecordResponses` (existing, zero changes).

### Phase 5: Phone Banking Field Mode

**Rationale:** Reuses OutcomeGrid, InlineSurvey, FieldProgress, and FieldShell already built in Phases 3–4. Closely mirrors existing `call.tsx` state machine but with mobile layout and `tel:` links. Shorter phase because shared components are already available.
**Delivers:** `field/phone-banking/$sessionId.tsx`; `formatForDial()` utility; `TapToCall` component with "Copy Number" desktop fallback; stacked vertical mobile layout.
**Addresses:** Table stakes — phone banking tap-to-call, phone banking call flow.
**Avoids:** Pitfall 4 (`tel:` formatting and WebView fallback handling).
**Implements:** Existing `useClaimEntry`, `useRecordCall`, `useSelfReleaseEntry` hooks in mobile layout.

### Phase 6: Guided Onboarding Tour

**Rationale:** Tour must come after all field routes are complete — tour steps describe screens that must exist. driver.js requires `data-tour` attributes set in Phases 1–5. Split into per-phase segment tours (welcome, canvassing basics, phone banking basics) to avoid the monolithic tour pitfall (breaks when any single step target is missing from DOM).
**Delivers:** `npm install driver.js`; `useTour` hook; `TourOverlay` component; per-segment completion flags in `onboardingStore`; "Replay Tour" button in field header; CSS overrides for `.driver-popover` matching shadcn/ui design tokens (~30 lines).
**Addresses:** Differentiator — guided onboarding tour (zero-training UX).
**Avoids:** Pitfall 5 (react-joyride React 19 breakage); monolithic tour breaking on dynamic/async content (split segments, controlled `stepIndex`).

### Phase 7: Contextual Help + Polish

**Rationale:** Final layer that can be applied to all field mode screens without architectural changes. Household grouping and voter context cards use data that already exists. Milestone celebrations require only the progress tracking built in Phase 3.
**Delivers:** `HelpTip` component (existing Radix Tooltip + `HelpCircle` icon); household grouping in canvassing wizard (group by `household_key`); voter context card; milestone celebration toasts; full touch target audit (min 44px verified on all elements including secondary actions: Skip, Back, Notes).
**Addresses:** Differentiators — contextual tooltips, household grouping, voter context card, milestone celebrations.
**Avoids:** UX pitfall — secondary action buttons not meeting 44px minimum (commonly missed in initial build).

### Phase Ordering Rationale

- Phase 1 is infrastructure-only: zero user-facing value but every other phase inherits its layout and route tree.
- Phases 3–4 are coupled as "canvassing core" because `InlineSurvey.tsx` is tightly coupled to the canvassing wizard's outcome recording completion event, and building them together produces clean shared components for Phase 5.
- Phase 5 (phone banking) comes after canvassing because it reuses all shared `components/field/` components already built; reversing the order would require duplicating components.
- Phase 6 (tour) requires all screens to exist; placing it earlier produces a tour for incomplete or missing screens.
- Phase 7 (polish) has no hard dependencies — it can be shrunk or expanded based on milestone timeline without blocking earlier phases.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (Canvassing Wizard):** Confirm that `useWalkListEntries` performance is acceptable for walk lists up to ~500 entries on a 3G connection before committing to the client-side-only approach. Verify Zustand persist + sessionStorage behavior across TanStack Router route transitions — confirm state survives navigation within the field subtree but not cross-campaign navigation.
- **Phase 6 (Guided Tour):** Verify driver.js CSS override specificity with Tailwind v4's CSS-first config (no `tailwind.config.js`). Confirm no z-index conflicts between `.driver-overlay` and vaul Drawer's overlay. These are likely resolved quickly but worth 30 minutes of integration testing before committing to the implementation approach.

Phases with standard patterns (skip research-phase):

- **Phase 1 (Field Layout Shell):** TanStack Router nested layouts are well-documented; the `__root.tsx` modification has direct precedent in the existing public route bypass logic (same 3-line pattern).
- **Phase 2 (Volunteer Landing):** Standard TanStack Query data fetching with existing hooks; client-side filter is trivial if the `GET /my-assignments` endpoint is deferred.
- **Phase 5 (Phone Banking):** Closely mirrors existing `call.tsx`; `tel:` URI is a web standard with a known implementation pattern documented in research.
- **Phase 7 (Polish):** Existing shadcn Tooltip component; `household_key` data structure already on `WalkListEntry`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | react-joyride React 19 breakage confirmed via GitHub issues + multiple independent sources. All other stack decisions use already-installed packages with verified compatibility. |
| Features | HIGH | Cross-referenced against MiniVAN, Ecanvasser, Qomon; backend API coverage confirmed by direct codebase analysis of all v1.0–v1.3 endpoints. 90%+ of required backend already exists. |
| Architecture | HIGH | Based on direct codebase analysis of `__root.tsx`, `call.tsx`, `DoorKnockDialog.tsx`, all hooks in `web/src/hooks/`, and existing layout files. Not inferred from documentation. |
| Pitfalls | HIGH | Pitfalls sourced from react-joyride GitHub issues (specific issue numbers cited), WCAG specifications, TanStack Query offline discussion, and direct analysis of existing `useState`-based state management patterns in `call.tsx`. Recovery costs documented. |

**Overall confidence:** HIGH

### Gaps to Address

- **`GET /my-assignments` vs. client-side filter:** Decision deferred to Phase 2 planning. If campaign walk list count is low (< 20 per campaign), client-side filter of `useWalkLists` is acceptable for v1.4. If Phase 2 performance testing shows slow landing page on large campaigns, add the backend endpoint (Low complexity, ~1 day backend work).

- **Walk list entry pagination:** `useWalkListEntries` fetches the full list. Research flags this as acceptable up to ~500 entries. Walk lists larger than this need a server-side "next unvisited entry" endpoint (not researched). Flag for Phase 3 implementation review — if pilot campaign walk lists exceed 200 entries, test on a throttled connection before committing to the full-list approach.

- **driver.js CSS override with Tailwind v4:** Tailwind v4 uses a CSS-first config. driver.js styling relies on `.driver-popover` CSS class overrides. Verify specificity works in practice during Phase 6; fallback is CSS custom properties which driver.js also supports natively.

- **Offline outbox pattern deferred:** PITFALLS.md flags poor connectivity as a critical pitfall with HIGH recovery cost if addressed late. v1.4 does not include a full offline outbox. Partial mitigations for v1.4: TanStack Query `networkMode: 'offlineFirst'`, persistent offline banner, optimistic UI. These are not a full solution. The gap is explicitly deferred to v1.5, but the architecture decision (Zustand persist for state, sessionStorage scoping) does not preclude retrofitting an outbox later.

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis — `web/src/routes/.../call.tsx`, `__root.tsx`, `DoorKnockDialog.tsx`, `SurveyWidget.tsx`, all hooks in `web/src/hooks/`, all backend API files in `app/api/v1/`
- [driver.js official documentation](https://driverjs.com) — React 19 integration, CSS theming, controlled mode
- [driver.js GitHub (25K+ stars, 436K+ weekly downloads)](https://github.com/kamranahmedse/driver.js)
- [Zustand persist middleware official docs](https://zustand.docs.pmnd.rs/reference/middlewares/persist)
- [shadcn/ui Drawer component (vaul)](https://ui.shadcn.com/docs/components/radix/drawer)
- [W3C WCAG 2.5.5: Target Size guidelines (44x44px minimum)](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [MiniVAN Canvassing Guide (NGP VAN)](https://www.ngpvan.com/blog/canvassing-with-minivan/)
- [web.dev — Click to Call best practices](https://web.dev/articles/click-to-call)

### Secondary (MEDIUM confidence)

- [OnboardJS — 5 Best React Onboarding Libraries (2026)](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared) — confirms react-joyride React 19 incompatibility
- [Sandro Roth — Evaluating tour libraries for React](https://sandroroth.com/blog/evaluating-tour-libraries/)
- [Ecanvasser Platform](https://www.ecanvasser.com/) — competitor feature set
- [Qomon — Understanding Canvassing Apps](https://qomon.com/blog/understanding-canvassing-apps)
- [TanStack Query: Offline discussion (#4296)](https://github.com/TanStack/query/discussions/4296)
- [Smashing Magazine: Accessible Tap Target Sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)
- [Phone Banking Guide (Solidarity Tech)](https://www.solidarity.tech/how-to-run-a-phonebank)

### Tertiary (LOW confidence — verify in implementation)

- [react-joyride GitHub issues #585, #519, #109](https://github.com/gilbarbara/react-joyride/issues) — tour element targeting failures on async content (informs driver.js segmented tour approach)
- [CSS-Tricks: Current State of Telephone Links](https://css-tricks.com/the-current-state-of-telephone-links/) — `tel:` link edge cases on WebView (may have changed since publication; test on real devices)

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
