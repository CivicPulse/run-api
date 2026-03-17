# Phase 34: Guided Onboarding Tour - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Volunteers understand how to use field mode without any training or documentation. This phase delivers: a driver.js-powered step-by-step tour with three contextual segments (welcome, canvassing, phone banking), per-segment completion persistence in localStorage, help button wiring for context-aware tour replay, persistent contextual tooltip icons on key actions, and inline quick-start instruction cards. The tour targets existing field mode screens built in Phases 30-32. Accessibility audit (Phase 35) is a separate phase.

</domain>

<decisions>
## Implementation Decisions

### Tour segments & step content
- Three segments: welcome (hub), canvassing (wizard), phone banking (calling)
- **Welcome segment** (4 steps on landing hub):
  1. "Welcome! This is your home base." → highlights hub layout
  2. "Tap your assignment to get started" → highlights AssignmentCard
  3. "Need help? Tap here anytime" → highlights help button
  4. "Your account & sign out" → highlights avatar menu
- **Canvassing segment** (5 steps, live element targeting on first door):
  1. "Here's your first house" → highlights HouseholdCard/address
  2. "Tap a result after each door" → highlights OutcomeGrid
  3. "Track your progress up here" → highlights FieldProgress
  4. "Jump to any door from the list" → highlights list view button
  5. "Need to skip? No problem" → highlights skip button
- **Phone banking segment** (3 steps, shorter echo since patterns learned):
  1. "Tap a number to call" → highlights PhoneNumberList / tap-to-call
  2. "Record the result — same as canvassing!" → highlights OutcomeGrid
  3. "Done calling? End your session here" → highlights End Session button
- Tap-to-advance (Next button) — no auto-advance timers
- Friendly casual tone matching Phase 30's "Hey Sarah!" style (warm, encouraging, action verbs)
- Each step shows "Step N of M" indicator and a "Skip" button to exit the tour early

### Tour triggers & segment activation
- Welcome segment auto-triggers on first visit to `/field/{campaignId}` (hub)
- Canvassing segment auto-triggers on first visit to `/field/{campaignId}/canvassing`
- Phone banking segment auto-triggers on first visit to `/field/{campaignId}/phone-banking`
- Segments are independent — a volunteer who only does canvassing never sees the phone banking tour until they visit that screen
- Tour waits for page content to load before starting (elements must be in DOM)

### Completion & persistence
- localStorage-based persistence keyed by `tour_{campaignId}_{userId}`
- Per-segment tracking: `{ welcome: true, canvassing: true, phoneBanking: false }`
- Skipping/dismissing mid-tour marks that segment as complete — won't auto-trigger again
- Completing all steps in a segment marks it as complete
- No backend API needed — device-local only (acceptable for v1.4)

### Help button & tour replay
- Wire the disabled help "?" button in FieldHeader to trigger tour replay
- Context-aware replay: on hub → replays welcome segment, on canvassing → replays canvassing segment, on phone banking → replays phone banking segment
- Replay always runs regardless of completion state (that's the point of replay)
- Help button becomes enabled (full opacity, tappable) once this phase is complete

### Quick-start instruction cards
- Dismissible inline card at the top of canvassing/phone-banking screens, above the first voter card
- Shows for the first 3 sessions of each activity type, then stops appearing
- Session count tracked in localStorage alongside tour completion state
- Segment-specific content:
  - **Canvassing:** "Tap a result after each door • Skip houses you can't reach • Your progress saves automatically"
  - **Phone banking:** "Tap a number to call • Record the result after hanging up • End session when you're done"
- Card has an "X" dismiss button; dismissing hides it for the current session
- Card does NOT appear while the tour is actively running (avoid double-instruction)

### Contextual tooltip icons
- Persistent small muted "?" icons next to 4 key actions:
  1. **Outcome buttons area** — explains what each outcome means (e.g., "Not Home = no one answered")
  2. **Progress bar** — explains what counts as complete and how progress is tracked
  3. **Skip button** — explains that skipped doors/calls can be revisited later
  4. **Phone number / tap-to-call** — explains tap-to-call and long-press-to-copy behavior
- Always visible regardless of tour completion state
- Tap opens a popover bubble with 1-2 sentences of explanation; tap anywhere else to dismiss
- Icons use the same HelpCircle lucide icon as the header help button, but smaller (14px) and muted

### Claude's Discretion
- Exact driver.js configuration (overlay color/opacity, popover positioning, animation timing)
- driver.js CSS customization to work with Tailwind v4
- Tooltip popover positioning and arrow placement
- Quick-start card styling and animation
- Whether to use a Zustand store or raw localStorage for tour state
- Step content copy refinement (exact wording within the friendly casual tone)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### driver.js library
- driver.js documentation — Tour API, step configuration, popover customization, highlight options

### Field infrastructure (from prior phases)
- `web/src/components/field/FieldHeader.tsx` — Header with disabled help button to wire up (line 60-67)
- `web/src/routes/field/$campaignId.tsx` — Field layout shell; tour initialization point
- `web/src/routes/field/$campaignId/index.tsx` — Landing hub; welcome segment target
- `web/src/routes/field/$campaignId/canvassing.tsx` — Canvassing wizard; canvassing segment target
- `web/src/routes/field/$campaignId/phone-banking.tsx` — Phone banking; phone banking segment target

### Tour target components
- `web/src/components/field/OutcomeGrid.tsx` — Outcome buttons targeted by tour + tooltip
- `web/src/components/field/FieldProgress.tsx` — Progress bar targeted by tour + tooltip
- `web/src/components/field/HouseholdCard.tsx` — Household card targeted by canvassing tour
- `web/src/components/field/PhoneNumberList.tsx` — Phone numbers targeted by phone banking tour + tooltip
- `web/src/components/field/AssignmentCard.tsx` — Assignment card targeted by welcome tour
- `web/src/components/field/CallingVoterCard.tsx` — Contains End Session button targeted by phone banking tour

### Existing patterns
- `web/src/stores/canvassingStore.ts` — Zustand persist + localStorage pattern to follow
- `web/src/stores/offlineQueueStore.ts` — localStorage persistence pattern (not sessionStorage)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FieldHeader` (disabled help button at line 60-67): Wire onClick to trigger context-aware tour replay
- `useAuthStore`: Provides userId for localStorage key construction
- shadcn/ui `Popover` + `PopoverContent`: For contextual tooltip popovers
- `lucide-react` HelpCircle icon: Already used in FieldHeader, reuse at smaller size for tooltips
- Zustand persist with `createJSONStorage(() => localStorage)`: Established pattern in offlineQueueStore

### Established Patterns
- Field layout shell renders children in flex column — quick-start card inserts above content
- Zustand persist stores use `partialize` to exclude transient state from persistence
- `sonner` toast for transient feedback — could use for "Tour complete!" feedback
- Component `data-tour-*` attributes can serve as driver.js step selectors without coupling to CSS classes

### Integration Points
- `FieldHeader.tsx` help button: Change from `disabled` to `onClick` handler
- `canvassing.tsx` route: Add tour trigger on mount (check completion state first)
- `phone-banking.tsx` route: Add tour trigger on mount
- `$campaignId/index.tsx` hub route: Add welcome tour trigger on mount
- `OutcomeGrid.tsx`, `FieldProgress.tsx`, skip button, `PhoneNumberList.tsx`: Add `data-tour` attributes and tooltip icons

</code_context>

<specifics>
## Specific Ideas

- Tour should feel like a friendly teammate showing you around, not a software tutorial
- Quick-start cards are the "cheat sheet you can glance at" — not the tour itself
- Tooltip popovers should be short enough to read in 3 seconds — one sentence ideally
- The fact that tour segments run independently means a volunteer who only phone banks gets a relevant, focused experience
- Skip button on tour steps respects volunteer autonomy — some people learn by doing, not by reading

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-guided-onboarding-tour*
*Context gathered: 2026-03-16*
