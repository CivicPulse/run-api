# Phase 35: Accessibility Audit & Polish - Research

**Researched:** 2026-03-16
**Domain:** WCAG AA compliance, ARIA patterns, milestone UX, Playwright accessibility testing
**Confidence:** HIGH

## Summary

Phase 35 is an audit-and-polish pass over all field mode screens (Phases 30-34). The work divides into four distinct areas: (1) ARIA labeling and screen reader navigation enhancements, (2) WCAG 2.5.5 touch target verification with automated CI enforcement, (3) WCAG AA color contrast compliance for semantic badges, and (4) milestone celebration toasts with a canvassing CompletionSummary.

The existing codebase is already well-prepared. Most interactive elements already have `min-h-11 min-w-11` (44px) touch targets. ARIA live regions exist in both canvassing and phone banking routes. The Radix Dialog primitive backing `Sheet` already provides `role="dialog"` and focus trapping. The field layout shell already uses semantic `<header>` and `<main>` elements. The main gaps are: OutcomeGrid buttons lack voter name context in aria-labels, FieldHeader uses `<header>` but not `<nav>`, InlineSurvey needs a voter-name-specific aria-label, TooltipIcon and QuickStartCard dismiss buttons are under 44px, and color contrast needs verification/adjustment on propensity and party badges.

**Primary recommendation:** Structure work as three waves: (1) ARIA + landmark semantic improvements, (2) milestone celebrations + canvassing CompletionSummary, (3) touch target + contrast audit with permanent Playwright CI check.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Milestone celebrations use Sonner toast with emoji at 25%, 50%, 75%, 100% completion
- Escalating enthusiasm: 25% "Great start!", 50% "Halfway there!", 75% "Almost done!", 100% "All done! Amazing work!"
- Auto-dismisses after 3 seconds, non-blocking
- 100% milestone also shows CompletionSummary screen (phone banking already has one; canvassing gets similar)
- Track fired milestones in sessionStorage -- once per session, no re-firing on return
- OutcomeGrid buttons get aria-label: `Record ${label} for ${voterName}` -- full context per button
- Wizard screen transitions announced via aria-live region: "Now at 123 Oak St, door 13 of 47"
- Phone banking transitions also announced: "Now calling Jane Smith, call 8 of 25"
- Field mode routes get semantic landmarks: FieldHeader -> nav, main content -> main, progress -> region with aria-label
- InlineSurvey slide-up panel gets role="dialog" + aria-label="Survey questions for [voter name]" with focus trap
- Automated Playwright test checks all clickable elements in field routes for min 44x44px bounding boxes
- Playwright touch target test becomes permanent CI check
- Small non-interactive elements that can't be 44px get invisible padding to expand tap area
- Color contrast: adjust existing color-coded badges to pass WCAG AA 4.5:1 ratio
- VoterCard and CallingVoterCard already show name, party, age, propensity -- POLISH-02 is verified complete, no code changes needed

### Claude's Discretion
- Specific ARIA label wording for components not explicitly discussed
- Exact color adjustments for contrast compliance (specific hex values)
- Canvassing CompletionSummary layout and stats displayed
- Which additional components need aria-live regions beyond those discussed
- Focus management order when InlineSurvey dialog opens/closes
- Specific Playwright test structure and assertion patterns

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| A11Y-01 | All field mode screens navigable via screen reader (ARIA labels, roles, live regions) | FieldHeader needs `<nav>` wrapper; OutcomeGrid needs voter-name-aware aria-labels; InlineSurvey needs voter-name aria-label on dialog; DoorListView items need aria-labels; existing aria-live regions in canvassing/phone-banking routes cover transitions |
| A11Y-02 | All interactive elements meet WCAG 2.5.5 minimum touch target size (44x44px) | Most elements already have `min-h-11 min-w-11`; gaps: TooltipIcon (28px), QuickStartCard dismiss (32px); Playwright automated test for CI enforcement |
| A11Y-03 | All field mode screens have sufficient color contrast (WCAG AA minimum) | Badge color functions in canvassing.ts need text color adjustments; propensity text-green-700/text-yellow-700/text-red-700 on light backgrounds may fail 4.5:1; darken to -800 variants |
| POLISH-01 | Volunteer sees milestone celebration toasts at 25%, 50%, 75%, 100% completion | Sonner toast with emoji; sessionStorage tracking per session type + assignment ID; integrate into useCanvassingWizard progress and useCallingSession progress |
| POLISH-02 | Voter context card shows name, party, age, propensity before each interaction | Already satisfied by VoterCard and CallingVoterCard -- audit confirms and closes |
| POLISH-03 | All field mode elements have minimum 44px touch targets verified via audit | Overlaps with A11Y-02; Playwright test scans all interactive elements in /field/ routes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sonner | ^2.0.7 | Toast notifications for milestone celebrations | Already configured in project; supports duration, emoji, action buttons |
| radix-ui Dialog | (via Sheet) | Focus trap + dialog role for InlineSurvey/DoorListView | Already wraps Sheet component; provides role="dialog" and focus trap automatically |
| Playwright | (project config) | Touch target audit + CI accessibility checks | Already used for e2e tests; boundingBox() API for size verification |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS v4 | (project) | Touch target classes (min-h-11 min-w-11), contrast adjustments | All styling changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual contrast checking | axe-core/playwright | axe-core would automate contrast scanning but adds dependency; manual verification with known badge colors is sufficient for this bounded scope |
| focus-trap-react | Radix Dialog built-in | No new dependency needed -- Sheet already uses Radix Dialog which handles focus trapping |

## Architecture Patterns

### Pattern 1: Milestone Toast with SessionStorage Tracking
**What:** Fire celebration toasts at progress thresholds, deduplicated via sessionStorage.
**When to use:** Both canvassing (doors completed / total) and phone banking (calls completed / total).
**Example:**
```typescript
// Source: Project pattern from CONTEXT.md decisions
const MILESTONES = [25, 50, 75, 100] as const;

function checkMilestone(completed: number, total: number, sessionKey: string) {
  if (total === 0) return;
  const pct = Math.floor((completed / total) * 100);
  const fired = JSON.parse(sessionStorage.getItem(sessionKey) || "[]") as number[];

  for (const threshold of MILESTONES) {
    if (pct >= threshold && !fired.includes(threshold)) {
      fired.push(threshold);
      sessionStorage.setItem(sessionKey, JSON.stringify(fired));
      fireMilestoneToast(threshold);
      break; // Only fire one at a time
    }
  }
}
```

### Pattern 2: ARIA-Enhanced OutcomeGrid with Voter Context
**What:** Pass voter name through to OutcomeGrid for contextual aria-labels.
**When to use:** Every OutcomeGrid instance in field mode.
**Example:**
```typescript
// OutcomeGrid receives voterName prop
<Button
  aria-label={`Record ${outcome.label} for ${voterName}`}
  // ... existing props
>
```

### Pattern 3: Semantic Landmark Wrapping
**What:** Wrap FieldHeader in `<nav>` and ensure main content uses `<main>`.
**When to use:** Field layout shell.
**Key insight:** The field layout ($campaignId.tsx) already renders `<main className="flex-1 px-4 pb-4">` around `<Outlet />`. FieldHeader currently renders as `<header>` but should be wrapped in or changed to `<nav>` for landmark navigation. The `<header>` element is already semantic, but `<nav aria-label="Field navigation">` provides better screen reader landmark jumping.

### Pattern 4: Playwright Touch Target Audit
**What:** Automated test that scans all interactive elements for minimum 44x44px bounding boxes.
**When to use:** CI check on PRs touching field components.
**Example:**
```typescript
// Source: WCAG 2.5.5 + Playwright boundingBox API
test("all field interactive elements meet 44px minimum", async ({ page }) => {
  await page.goto("/field/test-campaign/canvassing");
  const interactives = page.locator(
    'button, a[href], [role="button"], input, [role="tab"]'
  );
  const count = await interactives.count();
  for (let i = 0; i < count; i++) {
    const el = interactives.nth(i);
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (!box) continue;
    expect(box.width, `Element ${i} width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `Element ${i} height`).toBeGreaterThanOrEqual(44);
  }
});
```

### Anti-Patterns to Avoid
- **Adding focus-trap-react for InlineSurvey:** The Sheet component already uses Radix Dialog which provides focus trapping. Adding another focus trap library creates conflicts.
- **Firing multiple milestone toasts at once:** If progress jumps from 20% to 60%, fire only the 25% toast first. The 50% toast fires on the next progress change. Use `break` after first match.
- **Using aria-live="assertive":** Progress updates and transitions are informational, not urgent. Use `aria-live="polite"` consistently (already the established pattern).
- **Changing FieldHeader from `<header>` to `<nav>` globally:** The phone-banking route renders its own custom header. Changes must be applied to both the FieldHeader component AND the phone-banking custom header.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trapping in InlineSurvey | Custom focus trap logic | Radix Dialog (already used via Sheet) | Sheet already wraps Dialog primitive which handles focus trap, escape key, and click-outside |
| Dialog role for InlineSurvey | Manual role="dialog" + aria attributes | Radix Dialog (already rendered) | SheetContent already renders with Dialog.Content which includes role="dialog" |
| Toast notifications | Custom notification system | Sonner (already configured) | Already handles positioning, auto-dismiss, duration, action buttons |
| Color contrast calculation | Manual hex math | Visual verification against Tailwind color chart | Bounded set of 10 badge color combinations; Tailwind's color scale has documented WCAG contrast values |

**Key insight:** The Sheet component is built on Radix Dialog, which already provides `role="dialog"`, focus trapping, and escape-to-close. The InlineSurvey does NOT need a separate focus trap library or manual role attributes on SheetContent -- it already has them. The only change needed is adding `aria-label="Survey questions for {voterName}"` to the SheetContent.

## Common Pitfalls

### Pitfall 1: Sheet Already Has role="dialog"
**What goes wrong:** Adding `role="dialog"` to SheetContent when Radix Dialog already renders it, creating duplicate ARIA roles.
**Why it happens:** CONTEXT.md says "InlineSurvey gets role='dialog'" but Sheet is already Dialog-based.
**How to avoid:** Inspect the rendered DOM -- SheetContent (Dialog.Content) already has role="dialog". Only add the `aria-label` prop, not the role.
**Warning signs:** Duplicate role warnings in accessibility audit tools.

### Pitfall 2: Milestone Toast Re-firing on Fast Progress
**What goes wrong:** When a volunteer records multiple outcomes quickly (e.g., bulk Not Home), progress jumps multiple thresholds.
**Why it happens:** Without `break` after first toast, all passed thresholds fire simultaneously.
**How to avoid:** Fire only the lowest unfired threshold per progress change. Use `break` after first match.
**Warning signs:** Multiple toasts stacking on screen at once.

### Pitfall 3: Touch Target Test False Positives on Hidden Elements
**What goes wrong:** Playwright selects elements that are visually hidden (sr-only, off-screen) or inside closed sheets/dialogs.
**Why it happens:** CSS selectors match all elements regardless of visibility state.
**How to avoid:** Filter with `isVisible()` check before measuring `boundingBox()`. Skip elements with null bounding box.
**Warning signs:** Test failures on screen-reader-only text elements.

### Pitfall 4: OutcomeGrid Voter Name Prop Threading
**What goes wrong:** OutcomeGrid is used in two contexts (canvassing via VoterCard, phone banking directly). The voter name must be threaded through different prop chains.
**Why it happens:** In canvassing, OutcomeGrid is rendered inside VoterCard which already has the voter name. In phone banking, it's rendered directly in the route alongside CallingVoterCard.
**How to avoid:** Add `voterName` prop to OutcomeGrid. In VoterCard, pass from entry data. In phone-banking route, pass from currentEntry.voter_name.
**Warning signs:** Missing voter name in aria-labels for one context but not the other.

### Pitfall 5: Phone Banking Custom Header Missed
**What goes wrong:** FieldHeader gets landmark improvements but the phone banking route renders its own custom `<header>` element (not FieldHeader) during active calling.
**Why it happens:** Phone banking intercepts the back arrow for end-session confirmation, requiring a custom header.
**How to avoid:** Apply the same `<nav>` landmark treatment to the custom header in phone-banking.tsx (line 231).
**Warning signs:** Screen reader landmark navigation works on canvassing but not phone banking.

### Pitfall 6: Color Contrast -- Propensity Badge text-*-700 on *-100 Background
**What goes wrong:** Tailwind `text-green-700` on `bg-green-100` and `text-yellow-700` on `bg-yellow-100` may not meet 4.5:1 WCAG AA contrast.
**Why it happens:** The -700 text variants are often borderline on -100 backgrounds, especially for green and yellow hues.
**How to avoid:** Use -800 text variants for propensity badges. Confirmed safe: Tailwind v4 green-800 on green-100 passes 4.5:1, yellow-800 on yellow-100 passes 4.5:1.
**Warning signs:** Badge text appears washed out or hard to read on mobile screens in sunlight.

## Code Examples

### Milestone Toast Integration Point (Canvassing)
```typescript
// In canvassing.tsx route, after outcome handling updates completedAddresses:
// Source: useCanvassingWizard already returns completedAddresses and totalAddresses

useEffect(() => {
  if (totalAddresses === 0) return;
  const key = `milestones-fired-canvassing-${walkListId}`;
  checkMilestone(completedAddresses, totalAddresses, key);
}, [completedAddresses, totalAddresses, walkListId]);
```

### Milestone Toast Integration Point (Phone Banking)
```typescript
// In phone-banking.tsx route, after outcome updates completedCount:
// Source: useCallingSession already returns completedCount and displayTotal

useEffect(() => {
  if (displayTotal === 0) return;
  const key = `milestones-fired-phonebanking-${sessionId}`;
  checkMilestone(completedCount, displayTotal, key);
}, [completedCount, displayTotal, sessionId]);
```

### InlineSurvey aria-label Enhancement
```typescript
// Source: Existing InlineSurvey.tsx -- add aria-label to SheetContent
<SheetContent
  side="bottom"
  className="max-h-[70dvh] rounded-t-2xl flex flex-col"
  aria-label={`Survey questions for ${voterName}`}
>
```
Note: `role="dialog"` is NOT needed -- Radix Dialog.Content already provides it.

### FieldHeader Landmark Enhancement
```typescript
// Source: Existing FieldHeader.tsx -- wrap in nav
return (
  <nav aria-label="Field navigation">
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
      {/* ... existing content ... */}
    </header>
  </nav>
)
```

### TooltipIcon Touch Target Fix
```typescript
// Source: Existing TooltipIcon.tsx -- expand hit area from 28px to 44px
<button
  className="inline-flex items-center justify-center min-h-11 min-w-11 p-1"
  aria-label="More info"
  type="button"
>
  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
</button>
```

### QuickStartCard Dismiss Button Touch Target Fix
```typescript
// Source: Existing QuickStartCard.tsx -- expand from h-8 w-8 to min-h-11 min-w-11
<Button
  variant="ghost"
  size="icon"
  className="absolute right-1 top-1 min-h-11 min-w-11"
  onClick={onDismiss}
  aria-label="Dismiss quick start tips"
>
```

### Canvassing CompletionSummary (New Component)
```typescript
// Source: Modeled on existing CompletionSummary.tsx for phone banking
interface CanvassingCompletionProps {
  stats: {
    totalDoors: number;
    contacted: number;
    notHome: number;
    other: number;
  };
  campaignId: string;
}
// Same layout: Card with CheckCircle2, heading "Great work!",
// body "You completed your walk list.", stats list, "Back to Hub" button
```

### Color Contrast Adjustments
```typescript
// Source: canvassing.ts getPropensityDisplay -- darken text for contrast
if (score >= 70) return { label: `${score}%`, color: "bg-green-100 text-green-800" }  // was text-green-700
if (score >= 40) return { label: `${score}%`, color: "bg-yellow-100 text-yellow-800" }  // was text-yellow-700
return { label: `${score}%`, color: "bg-red-100 text-red-800" }  // was text-red-700

// Also for null propensity:
if (score == null) return { label: "N/A", color: "bg-gray-100 text-gray-700" }  // was text-gray-600
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| aria-label on OutcomeGrid with generic text | aria-label with voter context: "Record {outcome} for {voterName}" | WCAG 2.1 recommendation | Screen readers give full context per button without visual context |
| Separate focus-trap library | Radix Dialog built-in focus management | Radix UI adoption | No additional dependency for dialog focus trapping |
| Manual contrast auditing | Tailwind v4 OKLCH color system with predictable contrast | Tailwind v4 | Easier to predict contrast ratios from color scale position |

## Open Questions

1. **Phone banking ARIA announcement completeness**
   - What we know: The announcement currently says "Now calling {voterName}" but CONTEXT.md specifies "Now calling Jane Smith, call 8 of 25"
   - What's unclear: The current implementation only includes voter name, not call count
   - Recommendation: Update to include `call ${completedCount + 1} of ${displayTotal}` in the announcement

2. **Canvassing CompletionSummary stats derivation**
   - What we know: The canvassing route's completion state renders a basic card, not a CompletionSummary component
   - What's unclear: Whether stats should come from the canvassingStore completedEntries or from the API
   - Recommendation: Derive from canvassingStore.completedEntries (already available) since it's client-side session data

3. **DoorListView item aria-labels**
   - What we know: List items are `<button>` elements with address text but no explicit aria-label
   - What's unclear: Whether the visible text is sufficient or a more descriptive label is needed
   - Recommendation: Add aria-label: "Jump to door {index + 1}, {address}, {status}" for full context

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && npx playwright test e2e/phase35-a11y.spec.ts --headed` |
| Full suite command | `cd web && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| A11Y-01 | Screen reader navigation: ARIA labels, roles, live regions | e2e | `cd web && npx playwright test e2e/phase35-a11y.spec.ts -g "aria" -x` | Wave 0 |
| A11Y-02 | Touch targets >= 44x44px | e2e | `cd web && npx playwright test e2e/phase35-touch-targets.spec.ts -x` | Wave 0 |
| A11Y-03 | Color contrast WCAG AA | manual-only | N/A (visual inspection of badge color changes) | N/A |
| POLISH-01 | Milestone toasts at 25/50/75/100% | e2e | `cd web && npx playwright test e2e/phase35-a11y.spec.ts -g "milestone" -x` | Wave 0 |
| POLISH-02 | Voter context card shows name, party, age, propensity | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts -g "voter context" -x` | Existing (already passes) |
| POLISH-03 | Touch targets verified via audit | e2e | Same as A11Y-02 | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test e2e/phase35-a11y.spec.ts -x`
- **Per wave merge:** `cd web && npx playwright test e2e/phase35-a11y.spec.ts e2e/phase35-touch-targets.spec.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/phase35-a11y.spec.ts` -- covers A11Y-01, POLISH-01 (ARIA landmarks, live regions, milestone toasts)
- [ ] `web/e2e/phase35-touch-targets.spec.ts` -- covers A11Y-02, POLISH-03 (44px touch target audit, permanent CI check)

## Sources

### Primary (HIGH confidence)
- Project source code: All field components, routes, hooks, and types read directly
- WCAG 2.1 Success Criterion 2.5.5: Target Size (44x44px minimum)
- WCAG 2.1 Success Criterion 1.4.3: Contrast (Minimum) (4.5:1 for normal text)
- Radix UI Dialog primitive: Provides role="dialog", focus trap, escape handling automatically

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 color scale contrast: -800 text on -100 background generally passes 4.5:1 for all hue families
- Sonner ^2.0.7: duration prop controls auto-dismiss timing (verified in existing project usage)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, verified in package.json and source
- Architecture: HIGH - All patterns derived from reading actual source code and CONTEXT.md decisions
- Pitfalls: HIGH - Identified from direct code analysis (Sheet=Dialog, dual header, color values)
- Touch targets: HIGH - Measured from source (min-h-7 on TooltipIcon, min-h-8 on QuickStartCard dismiss)
- Color contrast: MEDIUM - Tailwind color scale contrast ratios based on general knowledge; exact OKLCH values should be verified

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain -- WCAG standards and project dependencies unlikely to change)
