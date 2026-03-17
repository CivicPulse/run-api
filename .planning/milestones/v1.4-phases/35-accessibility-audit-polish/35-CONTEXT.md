# Phase 35: Accessibility Audit & Polish - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Field mode meets WCAG AA standards and delights volunteers with milestone celebrations and rich voter context. This phase is a final pass over all field screens (Phases 30-34) delivering: comprehensive ARIA labeling and screen reader navigation, WCAG 2.5.5 touch target verification with automated CI enforcement, WCAG AA color contrast compliance, and milestone celebration toasts at progress thresholds. Voter context cards (POLISH-02) are already satisfied by existing VoterCard and CallingVoterCard components — this phase verifies and closes that requirement.

</domain>

<decisions>
## Implementation Decisions

### Milestone celebrations
- Sonner toast with emoji at 25%, 50%, 75%, and 100% completion
- Escalating enthusiasm: 25% "Great start!", 50% "Halfway there!", 75% "Almost done!", 100% "All done! Amazing work!"
- Auto-dismisses after 3 seconds, non-blocking
- 100% milestone also shows CompletionSummary screen (already exists for phone banking; canvassing gets a similar summary)
- Applies to both canvassing (doors completed) AND phone banking (calls completed)
- Track fired milestones in sessionStorage — once per session, no re-firing on return
- Phone banking already has CompletionSummary at 100%; canvassing needs one added

### ARIA & screen reader coverage
- OutcomeGrid buttons get aria-label: `Record ${label} for ${voterName}` — full context per button
- Wizard screen transitions announced via aria-live region: "Now at 123 Oak St, door 13 of 47"
- Phone banking transitions also announced: "Now calling Jane Smith, call 8 of 25"
- Field mode routes get semantic landmarks: FieldHeader → nav, main content → main, progress → region with aria-label
- InlineSurvey slide-up panel gets role="dialog" + aria-label="Survey questions for [voter name]" with focus trap
- Extend existing partial ARIA coverage (OfflineBanner, FieldProgress, InlineSurvey already have some attributes)

### Touch target & contrast audit
- Automated Playwright test checks all clickable elements in field routes for min 44x44px bounding boxes
- Playwright touch target test becomes a permanent CI check (runs on PRs touching field components)
- Manual sweep after automated pass to catch edge cases (badges, close buttons, navigation links)
- Small non-interactive elements that can't be 44px get invisible padding to expand tap area (standard WCAG 2.5.5 technique)
- Color contrast: adjust existing color-coded badges (party, propensity, outcome buttons) to pass WCAG AA 4.5:1 ratio
- Preserve color-coding intent but darken/lighten text or background as needed

### Voter context card (POLISH-02)
- VoterCard (canvassing) already shows name, party, age, propensity — verified complete
- CallingVoterCard (phone banking) already shows name, party, age, propensity via useVoter hook — verified complete
- No code changes needed — audit confirms and marks requirement complete

### Claude's Discretion
- Specific ARIA label wording for components not explicitly discussed
- Exact color adjustments for contrast compliance (specific hex values)
- Canvassing CompletionSummary layout and stats displayed
- Which additional components need aria-live regions beyond those discussed
- Focus management order when InlineSurvey dialog opens/closes
- Specific Playwright test structure and assertion patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Field components (audit targets)
- `web/src/components/field/OutcomeGrid.tsx` — Outcome buttons needing aria-labels with voter name context
- `web/src/components/field/VoterCard.tsx` — Canvassing voter card (verify POLISH-02 fields present)
- `web/src/components/field/CallingVoterCard.tsx` — Phone banking voter card (verify POLISH-02 fields present)
- `web/src/components/field/HouseholdCard.tsx` — Household grouping card needing ARIA structure
- `web/src/components/field/InlineSurvey.tsx` — Needs dialog role + focus trap added
- `web/src/components/field/FieldHeader.tsx` — Needs nav landmark role
- `web/src/components/field/FieldProgress.tsx` — Already has role="status", verify complete
- `web/src/components/field/OfflineBanner.tsx` — Already has aria-live="polite", verify complete
- `web/src/components/field/DoorListView.tsx` — Door list needing ARIA labels
- `web/src/components/field/PhoneNumberList.tsx` — Phone number buttons needing aria-labels
- `web/src/components/field/CompletionSummary.tsx` — Phone banking completion (template for canvassing)
- `web/src/components/field/QuickStartCard.tsx` — Needs ARIA verification
- `web/src/components/field/TooltipIcon.tsx` — Needs ARIA verification
- `web/src/components/field/ResumePrompt.tsx` — Needs ARIA verification

### Field routes (landmark structure targets)
- `web/src/routes/field/$campaignId.tsx` — Field layout shell needing main landmark
- `web/src/routes/field/$campaignId/canvassing.tsx` — Canvassing wizard (transition announcements, milestone toasts)
- `web/src/routes/field/$campaignId/phone-banking.tsx` — Phone banking (transition announcements, milestone toasts)

### Existing patterns
- `web/src/components/ui/sonner.tsx` — Sonner toast configuration (reuse for celebrations)
- `web/src/hooks/useCanvassingWizard.ts` — Canvassing orchestrator hook (milestone tracking integration point)
- `web/src/hooks/useCanvassing.ts` — Canvassing state/data hooks

### Prior phase context
- `.planning/phases/31-canvassing-wizard/31-CONTEXT.md` — Canvassing decisions (outcome buttons, voter card, wizard flow)
- `.planning/phases/32-phone-banking-field-mode/32-CONTEXT.md` — Phone banking decisions (call flow, outcome buttons, voter card)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sonner` toast library: Already configured in `web/src/components/ui/sonner.tsx` — direct reuse for milestone celebration toasts
- `CompletionSummary`: Phone banking completion screen with stats — template for canvassing equivalent
- `min-h-11 min-w-11` (44px) pattern: Already applied to most interactive elements in field components
- `role="status"` + `aria-live="polite"`: Already on OfflineBanner, FieldProgress — extend pattern to other components
- Zustand persist + sessionStorage: Established pattern for tracking milestone-fired state

### Established Patterns
- Touch targets use Tailwind `min-h-11 min-w-11` utility classes (44px = 2.75rem = h-11)
- ARIA live regions use `aria-live="polite"` with `role="status"` for non-urgent updates
- Field layout shell: FieldHeader + content area structure suits nav/main landmark pattern
- Playwright e2e tests with `page.route()` API mocking — established in Phases 31-32

### Integration Points
- `useCanvassingWizard` hook: Progress tracking already computed — add milestone threshold check
- Phone banking orchestrator: Progress already tracked — add milestone threshold check
- Canvassing route: Needs CompletionSummary equivalent when all doors completed
- `OutcomeGrid.onSelect` callback: Pass voter name through for aria-label construction
- InlineSurvey Sheet component: Add dialog role and focus-trap-react or equivalent

</code_context>

<specifics>
## Specific Ideas

- Milestone toasts should feel rewarding but not block the workflow — auto-dismiss is key
- Escalating emoji and messaging makes progress feel like momentum building
- Screen reader announcements on transitions give orientation without requiring manual navigation
- Focus trap on InlineSurvey prevents tab-escaping into dimmed content behind the panel
- Permanent CI check for touch targets prevents regression as new field components are added

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 35-accessibility-audit-polish*
*Context gathered: 2026-03-16*
