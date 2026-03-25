# Phase 45: WCAG Compliance Audit - Research

**Researched:** 2026-03-24
**Domain:** WCAG 2.1 AA accessibility compliance, automated scanning, keyboard navigation, screen reader verification
**Confidence:** HIGH

## Summary

This phase audits and remediates all admin and field mode pages for WCAG 2.1 AA compliance. The work splits into four tracks: (1) automated axe-core scanning across all routes, (2) screen reader flow verification via Playwright ARIA snapshots, (3) keyboard navigation and focus management remediation, and (4) map accessibility with skip-nav and GeoJSON fallback.

The project already has `@playwright/test` installed and an existing Playwright config. Field mode components (from v1.4) already have ARIA patterns (landmarks, live regions, aria-labels) that serve as reference implementations. Admin mode pages have zero ARIA attributes -- the `__root.tsx` RootLayout has no landmarks, no skip-nav, and the sidebar lacks `role="navigation"` (though shadcn sidebar components may provide some built-in accessibility).

**Primary recommendation:** Install `@axe-core/playwright` and create a shared test fixture that pre-configures WCAG 2.1 AA tags. Build a single parameterized test file that iterates all routes. Create shared utility components (SkipNav, VisuallyHidden, LiveRegion, FocusScope) and apply them to the root layout before scanning individual routes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `@axe-core/playwright` with a single parameterized test that iterates all admin and field mode routes. One test file with a route array -- add new routes by appending to the array.
- **D-02:** Violation threshold: zero critical and serious violations gate CI. Moderate and minor violations logged as warnings but do not block.
- **D-03:** Scan covers both admin routes (`/campaigns/*`, `/org/*`) AND field mode routes (`/field/*`). Field mode should already pass from v1.4 ARIA work -- this confirms it.
- **D-04:** Save axe violation results as JSON artifacts per route alongside test results for tracking remediation progress and auditing.
- **D-05:** Verify 5 critical flows (voter search, voter import, walk list creation, phone bank session, campaign settings) via Playwright accessibility tree snapshots. Assert correct heading hierarchy, labeled form inputs, ARIA landmarks (nav, main, complementary), and live region announcements after actions.
- **D-06:** Each flow test combines keyboard-only navigation AND accessibility tree assertions in a single test. Proves the flow is both keyboard-operable and screen-reader-friendly in one pass.
- **D-07:** Voter import wizard test verifies accessibility at every step (file upload, column mapping, preview, import progress) -- not just start and end.
- **D-08:** Create shared accessibility utility components in `components/shared/`: SkipNav, VisuallyHidden, LiveRegion, and FocusScope. Reusable across admin and field mode for consistency.
- **D-09:** Heading hierarchy: audit and fix manually per route. No HeadingLevel context provider -- heading structure is page-specific.
- **D-10:** Explicit focus management after key interactions: modal/dialog close (return to trigger), form submission (focus success/error message), delete actions (focus next item). Browser defaults for everything else.
- **D-11:** Color contrast fixes applied at the theme level -- audit and adjust CSS custom properties in globals.css so all components inherit compliant contrast ratios. One fix cascades everywhere.
- **D-12:** Add a skip-nav link on map pages that jumps past the Leaflet map to the turf details/form section.
- **D-13:** GeoJSON textarea fallback: a collapsible "Edit as GeoJSON" panel below the map. Users paste/edit raw GeoJSON polygon coordinates. Validates on blur. Create, edit, and delete turf boundaries all work through this panel.
- **D-14:** GeoJSON panel is hidden/collapsed by default with an "Edit as GeoJSON" button. Screen readers announce it; keyboard users can tab to it. Keeps visual UI clean for mouse users.

### Claude's Discretion
- Exact route list for the parameterized axe scan (enumerate from the route tree)
- Specific ARIA landmark placement decisions per page
- Focus trap implementation details for modal components
- Which shadcn components need ARIA additions beyond their built-in accessibility
- Skeleton/loading state accessibility announcements

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| A11Y-01 | axe-core automated scan passes on all admin routes with zero critical/serious violations | @axe-core/playwright v4.11.1 with shared fixture, parameterized route array, WCAG 2.1 AA tags, JSON artifact output |
| A11Y-02 | Screen reader testing passes on 5 critical flows | Playwright ARIA snapshots (`toMatchAriaSnapshot()` + `ariaSnapshot()`) for heading/landmark verification, keyboard Tab/Enter navigation assertions |
| A11Y-03 | Keyboard navigation works for all interactive components | Shared SkipNav, FocusScope, VisuallyHidden components; focus management on dialog close, form submit, delete; visible focus indicators via CSS |
| A11Y-04 | Map component has skip-nav link and all CRUD operations work without the map (JSON fallback) | Skip-nav anchor link on turf pages, collapsible GeoJSON textarea panel with validation, turf CRUD operable without map interaction |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @axe-core/playwright | 4.11.1 | Automated WCAG scanning in Playwright tests | Official Deque integration, same engine as browser DevTools audit |
| @playwright/test | ^1.58.2 | E2E test framework (already installed) | Already in use, ARIA snapshot support built-in |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axe-core | 4.11.1 | Underlying accessibility engine (peer dep) | Installed automatically with @axe-core/playwright |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @axe-core/playwright | axe-playwright (community) | Community package, less maintained; official package preferred |
| Manual VoiceOver/NVDA | Playwright ARIA snapshots | ARIA snapshots verify tree structure programmatically; D-05 specifies this approach |

**Installation:**
```bash
cd web && npm install -D @axe-core/playwright
```

## Architecture Patterns

### Recommended Project Structure
```
web/
├── e2e/
│   ├── axe-test.ts                    # Shared fixture with WCAG 2.1 AA tags
│   ├── a11y-scan.spec.ts             # Parameterized route scan (A11Y-01)
│   ├── a11y-voter-search.spec.ts     # Flow: voter search (A11Y-02)
│   ├── a11y-voter-import.spec.ts     # Flow: voter import (A11Y-02)
│   ├── a11y-walk-list.spec.ts        # Flow: walk list creation (A11Y-02)
│   ├── a11y-phone-bank.spec.ts       # Flow: phone bank session (A11Y-02)
│   └── a11y-campaign-settings.spec.ts # Flow: campaign settings (A11Y-02)
├── src/
│   ├── components/shared/
│   │   ├── SkipNav.tsx               # Skip navigation link (A11Y-03, A11Y-04)
│   │   ├── VisuallyHidden.tsx        # Screen-reader-only text
│   │   ├── LiveRegion.tsx            # aria-live announcements
│   │   └── FocusScope.tsx            # Focus trap for modals
│   ├── index.css                      # Theme contrast fixes (A11Y-03)
│   └── routes/__root.tsx             # SkipNav + landmark additions
```

### Pattern 1: Shared axe-core Fixture
**What:** Custom Playwright test fixture that pre-configures AxeBuilder with WCAG 2.1 AA tags
**When to use:** Every axe scan test
**Example:**
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
import { test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
  makeAxeBuilder: () => AxeBuilder;
};

export const test = base.extend<AxeFixture>({
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.leaflet-container'); // Leaflet internals not controllable
    await use(makeAxeBuilder);
  },
});

export { expect } from '@playwright/test';
```

### Pattern 2: Parameterized Route Scan
**What:** Single test file with route array, iterating axe scans per route
**When to use:** A11Y-01 compliance gate
**Example:**
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
import { test, expect } from './axe-test';

const ROUTES = [
  { path: '/', name: 'org-dashboard', needsCampaign: false },
  { path: '/org/members', name: 'org-members', needsCampaign: false },
  { path: '/org/settings', name: 'org-settings', needsCampaign: false },
  { path: '/campaigns/$id/dashboard', name: 'campaign-dashboard', needsCampaign: true },
  { path: '/campaigns/$id/voters', name: 'voters', needsCampaign: true },
  // ... enumerate all routes
];

for (const route of ROUTES) {
  test(`a11y scan: ${route.name}`, async ({ page, makeAxeBuilder }, testInfo) => {
    // Setup mocks for the route...
    await page.goto(route.path);
    // Wait for content to load...

    const results = await makeAxeBuilder().analyze();

    await testInfo.attach(`axe-${route.name}`, {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(critical).toEqual([]);
  });
}
```

### Pattern 3: ARIA Snapshot Flow Test
**What:** Combined keyboard navigation + accessibility tree verification
**When to use:** A11Y-02 screen reader flow verification
**Example:**
```typescript
import { test, expect } from '@playwright/test';

test('voter search flow is keyboard-operable and screen-reader-friendly', async ({ page }) => {
  // Setup mocks...
  await page.goto('/campaigns/$id/voters');

  // Verify landmarks
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();

  // Verify heading hierarchy
  const snapshot = await page.getByRole('main').ariaSnapshot();
  expect(snapshot).toContain('heading');

  // Keyboard navigation: Tab to search input
  await page.keyboard.press('Tab'); // Skip nav
  await page.keyboard.press('Tab'); // Search input
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('type', 'search');

  // Type and verify live region update
  await page.keyboard.type('Smith');
  await expect(page.locator('[aria-live]')).toBeVisible();
});
```

### Pattern 4: SkipNav Component
**What:** Hidden link that becomes visible on focus, jumps to main content
**When to use:** Every page layout (root layout and map pages)
**Example:**
```tsx
export function SkipNav({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  );
}
```

### Pattern 5: LiveRegion Component
**What:** Wrapper for aria-live announcements (polite or assertive)
**When to use:** After async operations (form submit, data load, delete)
**Example:**
```tsx
interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Using div for interactive elements:** Always use `<button>` or `<a>` for clickable elements. Never add onClick to a div without role="button" and tabIndex.
- **Missing label on icon-only buttons:** Every icon button needs `aria-label`. The existing `SidebarTrigger` button may lack this.
- **Heading level skipping:** Never jump from h1 to h3. Each page should have exactly one h1, followed by h2s for sections.
- **Focus not returning after dialog close:** Dialog/modal close MUST return focus to the trigger element. shadcn Dialog handles this, but custom close logic may break it.
- **Using `display: none` for screen reader text:** Use `sr-only` (visually hidden) class instead. `display: none` hides from screen readers too.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility scanning | Custom DOM walker | @axe-core/playwright | Covers 57+ WCAG rules, maintained by Deque |
| Focus trapping in modals | Manual keydown listeners | Radix/shadcn Dialog (built-in) | Already handles edge cases (nested modals, restore focus) |
| Visually hidden text | Custom CSS class | Tailwind `sr-only` class | Already standard in Tailwind, well-tested |
| Screen reader announcements | Manual aria-live div | Sonner toast (already has aria-live) | Sonner handles announcement timing |
| Color contrast checking | Manual OKLCH calculations | axe-core contrast rules | Handles all edge cases (opacity, gradients, pseudo-elements) |

**Key insight:** The shadcn/ui component library (built on Radix) already handles most component-level accessibility (Dialog, DropdownMenu, Accordion, Tabs). The remediation work is primarily at the page/layout level: landmarks, headings, skip-nav, and custom components.

## Common Pitfalls

### Pitfall 1: Leaflet Map Internals Failing axe Scans
**What goes wrong:** Leaflet generates its own DOM with missing alt attributes on tile images and interactive elements without ARIA roles.
**Why it happens:** Leaflet was designed before modern WCAG standards; its internal DOM is not controllable.
**How to avoid:** Use `AxeBuilder.exclude('.leaflet-container')` to exclude the map container from automated scans. Map accessibility is handled separately via skip-nav and GeoJSON fallback (A11Y-04).
**Warning signs:** axe reports dozens of violations all inside `.leaflet-container` or `.leaflet-tile-pane`.

### Pitfall 2: Dynamic Content Not Scanned
**What goes wrong:** axe scans the DOM at the moment `.analyze()` is called. Content behind loading states, tabs, or collapsed accordions is not scanned.
**Why it happens:** axe scans the current DOM, not the virtual DOM or future states.
**How to avoid:** Wait for loading states to resolve before scanning. For tabbed content, scan each tab state separately. For the voter import wizard (D-07), scan at each step.
**Warning signs:** Routes pass axe scan but have violations in loaded/expanded states.

### Pitfall 3: Color Contrast with OKLCH
**What goes wrong:** The project uses OKLCH color space in CSS custom properties. axe-core may not correctly compute contrast ratios for OKLCH values in older versions.
**Why it happens:** OKLCH is a newer CSS color space. axe-core added OKLCH support around v4.8+.
**How to avoid:** The project uses axe-core 4.11.1 which should handle OKLCH. Verify by checking if contrast violations are reported. If false negatives occur, test contrast manually with a tool like the WebAIM contrast checker using the computed RGB values.
**Warning signs:** No contrast violations reported despite visually questionable combinations (e.g., `muted-foreground` at oklch(0.556 0 0) on white background).

### Pitfall 4: SPA Route Transitions Not Resetting Focus
**What goes wrong:** After navigating between routes in a SPA, focus stays on the last focused element (which may no longer be in the DOM) or jumps to the body.
**Why it happens:** TanStack Router renders new content without a full page load, so browser focus management does not reset.
**How to avoid:** Use the SkipNav component with an id on the main content area. Optionally, move focus to the main heading after route transitions. Do NOT auto-focus the body -- it creates a poor screen reader experience.
**Warning signs:** Screen reader users hear nothing after navigating, or focus is "lost" in the DOM.

### Pitfall 5: Mock Data in E2E Tests Hiding Real Issues
**What goes wrong:** axe scans run against mocked API responses that may not reflect real data patterns (long names, special characters, empty states, error states).
**Why it happens:** Mocks return simplified data. Real data may cause layout shifts, overflow, or truncation that affects accessibility.
**How to avoid:** Include edge case mock data (long names, empty lists, error states) in the route scan array. Test both populated and empty states.
**Warning signs:** Scans pass in CI but real app has violations with production data.

## Code Examples

### Existing ARIA Patterns (Reference from Field Mode)

#### OfflineBanner -- aria-live region pattern
```tsx
// Source: web/src/components/field/OfflineBanner.tsx
<div
  role="status"
  aria-live="polite"
  aria-label={`Syncing ${count} outcomes to server.`}
  className="flex h-8 items-center justify-center gap-2 ..."
>
  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
  <span>Syncing {count} outcomes...</span>
</div>
```

#### FieldHeader -- nav landmark with aria-label
```tsx
// Source: web/src/components/field/FieldHeader.tsx
<nav aria-label="Field navigation">
  <header className="sticky top-0 z-10 ...">
    <Button aria-label="Back to hub">...</Button>
    <h1 className="flex-1 text-center text-sm font-semibold truncate">{title}</h1>
    <Button aria-label="Help">...</Button>
    <Button aria-label="User menu">...</Button>
  </header>
</nav>
```

### Root Layout Remediation Targets

The current `__root.tsx` RootLayout needs these additions:
1. SkipNav component at the top of the layout (before SidebarProvider)
2. `id="main-content"` on the `<main>` element
3. `role="banner"` or semantic `<header>` with aria-label on the top bar
4. `aria-label="Main navigation"` on the Sidebar's nav element (shadcn Sidebar may already provide this)
5. Landmarks: the sidebar is `<nav>`, the top bar is `<header>`, the content is `<main>`

### Admin Route Enumeration (from routeTree.gen.ts)

Full route list for parameterized scanning:
```typescript
const ADMIN_ROUTES = [
  // Org-level
  { path: '/', name: 'org-dashboard' },
  { path: '/org/members', name: 'org-members' },
  { path: '/org/settings', name: 'org-settings' },
  // Campaign-level
  { path: '/campaigns/$id/dashboard', name: 'campaign-dashboard' },
  { path: '/campaigns/$id/voters', name: 'voters-list' },
  { path: '/campaigns/$id/voters/$voterId', name: 'voter-detail' },
  { path: '/campaigns/$id/voters/imports', name: 'voter-imports' },
  { path: '/campaigns/$id/voters/imports/new', name: 'voter-import-new' },
  { path: '/campaigns/$id/voters/lists', name: 'voter-lists' },
  { path: '/campaigns/$id/voters/lists/$listId', name: 'voter-list-detail' },
  { path: '/campaigns/$id/voters/tags', name: 'voter-tags' },
  { path: '/campaigns/$id/canvassing', name: 'canvassing-overview' },
  { path: '/campaigns/$id/canvassing/turfs/new', name: 'turf-new' },
  { path: '/campaigns/$id/canvassing/turfs/$turfId', name: 'turf-edit' },
  { path: '/campaigns/$id/canvassing/walk-lists/$walkListId', name: 'walk-list-detail' },
  { path: '/campaigns/$id/phone-banking', name: 'phone-banking-overview' },
  { path: '/campaigns/$id/phone-banking/sessions', name: 'phone-sessions' },
  { path: '/campaigns/$id/phone-banking/sessions/$sessionId', name: 'phone-session-detail' },
  { path: '/campaigns/$id/phone-banking/call-lists', name: 'call-lists' },
  { path: '/campaigns/$id/phone-banking/call-lists/$callListId', name: 'call-list-detail' },
  { path: '/campaigns/$id/phone-banking/dnc', name: 'dnc-list' },
  { path: '/campaigns/$id/phone-banking/my-sessions', name: 'my-sessions' },
  { path: '/campaigns/$id/volunteers', name: 'volunteers-overview' },
  { path: '/campaigns/$id/volunteers/roster', name: 'volunteer-roster' },
  { path: '/campaigns/$id/volunteers/$volunteerId', name: 'volunteer-detail' },
  { path: '/campaigns/$id/volunteers/shifts', name: 'volunteer-shifts' },
  { path: '/campaigns/$id/volunteers/shifts/$shiftId', name: 'shift-detail' },
  { path: '/campaigns/$id/volunteers/tags', name: 'volunteer-tags' },
  { path: '/campaigns/$id/volunteers/register', name: 'volunteer-register' },
  { path: '/campaigns/$id/surveys', name: 'surveys' },
  { path: '/campaigns/$id/surveys/$scriptId', name: 'survey-detail' },
  { path: '/campaigns/$id/settings', name: 'settings-overview' },
  { path: '/campaigns/$id/settings/general', name: 'settings-general' },
  { path: '/campaigns/$id/settings/members', name: 'settings-members' },
  { path: '/campaigns/$id/settings/danger', name: 'settings-danger' },
];

const FIELD_ROUTES = [
  { path: '/field/$id', name: 'field-hub' },
  { path: '/field/$id/canvassing', name: 'field-canvassing' },
  { path: '/field/$id/phone-banking', name: 'field-phone-banking' },
];
```

### GeoJSON Fallback Panel Pattern (A11Y-04)

The turf form (`TurfForm.tsx`) already has an "Advanced" toggle (`showAdvanced` state) that reveals a raw JSON textarea. D-13/D-14 requires this to be a full accessibility-friendly collapsible panel:

```tsx
// Conceptual pattern for GeoJSON fallback panel
<div>
  <Button
    variant="outline"
    onClick={() => setShowGeoJSON(!showGeoJSON)}
    aria-expanded={showGeoJSON}
    aria-controls="geojson-panel"
  >
    Edit as GeoJSON
  </Button>
  {showGeoJSON && (
    <div id="geojson-panel" role="region" aria-label="GeoJSON editor">
      <Label htmlFor="geojson-textarea">GeoJSON Polygon</Label>
      <Textarea
        id="geojson-textarea"
        value={boundary}
        onChange={handleChange}
        onBlur={handleValidate}
        aria-invalid={!!validationError}
        aria-describedby={validationError ? 'geojson-error' : undefined}
      />
      {validationError && (
        <p id="geojson-error" role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}
    </div>
  )}
</div>
```

### Theme Contrast Audit Points

Current theme values in `index.css` (light mode) to verify:
- `--muted-foreground: oklch(0.556 0 0)` on `--background: oklch(1 0 0)` -- this is approximately #8b8b8b on white, which is a 3.5:1 ratio. **WCAG AA requires 4.5:1 for normal text.** This likely needs darkening to ~oklch(0.45 0 0).
- `--destructive: oklch(0.577 0.245 27.325)` may need verification for text-on-white usage.
- All `muted-foreground` text across the app inherits from this single custom property, so fixing it once cascades everywhere (D-11).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `page.accessibility.snapshot()` | `locator.ariaSnapshot()` + `toMatchAriaSnapshot()` | Playwright 1.49+ (2024) | Declarative YAML templates, better DX |
| Manual screen reader testing | ARIA snapshot assertions | 2024-2025 | Automated CI-gate for screen reader compatibility |
| CSS class-based contrast fixes | CSS custom property fixes | Always available | One theme-level fix cascades to all components |

## Open Questions

1. **shadcn Sidebar built-in accessibility**
   - What we know: shadcn/ui components are built on Radix and generally have good a11y. The Sidebar component renders as an `<aside>` or `<div>`.
   - What's unclear: Whether the Sidebar already adds `role="navigation"` or `aria-label`. Need to inspect rendered DOM.
   - Recommendation: Check rendered output in browser DevTools during implementation. If missing, add explicitly.

2. **OKLCH contrast computation in axe-core 4.11.1**
   - What we know: axe-core added modern color space support in recent versions.
   - What's unclear: Whether oklch() is fully supported for contrast ratio calculations in 4.11.1.
   - Recommendation: Run the scan first. If no contrast violations are reported for known-bad combinations (muted-foreground on white), investigate manually and file axe-core exclusions if needed.

3. **Sonner toast aria-live behavior**
   - What we know: Sonner is used for toast notifications (imported as `Toaster` in `__root.tsx`).
   - What's unclear: Whether Sonner's default implementation includes proper `aria-live` regions and role="status" or role="alert".
   - Recommendation: Verify during implementation. Sonner v2+ should have this built-in. If not, wrap with a LiveRegion component.

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` for Python tasks, `npm` for frontend
- **Frontend stack:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Tests:** `uv run pytest` for backend, Playwright for frontend E2E
- **Commits:** Conventional Commits format
- **Context7:** Use for documentation lookups
- **No manual browser testing:** All UI/UAT verification must be automated via Playwright (from MEMORY.md)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test ^1.58.2 |
| Config file | web/playwright.config.ts |
| Quick run command | `cd web && npx playwright test --grep "a11y" --reporter=list` |
| Full suite command | `cd web && npx playwright test --reporter=list` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| A11Y-01 | axe scan passes all routes, zero critical/serious | e2e | `cd web && npx playwright test e2e/a11y-scan.spec.ts -x` | Wave 0 |
| A11Y-02 | Screen reader flows pass (voter search) | e2e | `cd web && npx playwright test e2e/a11y-voter-search.spec.ts -x` | Wave 0 |
| A11Y-02 | Screen reader flows pass (voter import) | e2e | `cd web && npx playwright test e2e/a11y-voter-import.spec.ts -x` | Wave 0 |
| A11Y-02 | Screen reader flows pass (walk list creation) | e2e | `cd web && npx playwright test e2e/a11y-walk-list.spec.ts -x` | Wave 0 |
| A11Y-02 | Screen reader flows pass (phone bank session) | e2e | `cd web && npx playwright test e2e/a11y-phone-bank.spec.ts -x` | Wave 0 |
| A11Y-02 | Screen reader flows pass (campaign settings) | e2e | `cd web && npx playwright test e2e/a11y-campaign-settings.spec.ts -x` | Wave 0 |
| A11Y-03 | Keyboard nav works, visible focus, no traps | e2e | Covered by A11Y-02 flow tests (D-06: combined) | Wave 0 |
| A11Y-04 | Map skip-nav, GeoJSON fallback CRUD | e2e | `cd web && npx playwright test e2e/a11y-walk-list.spec.ts -x` (turf assertions) | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx playwright test --grep "a11y" -x --reporter=list`
- **Per wave merge:** `cd web && npx playwright test --reporter=list`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/e2e/axe-test.ts` -- shared AxeBuilder fixture with WCAG 2.1 AA tags
- [ ] `web/e2e/a11y-scan.spec.ts` -- parameterized route scan
- [ ] `web/e2e/a11y-voter-search.spec.ts` -- voter search flow
- [ ] `web/e2e/a11y-voter-import.spec.ts` -- voter import flow
- [ ] `web/e2e/a11y-walk-list.spec.ts` -- walk list creation flow
- [ ] `web/e2e/a11y-phone-bank.spec.ts` -- phone bank session flow
- [ ] `web/e2e/a11y-campaign-settings.spec.ts` -- campaign settings flow
- [ ] `@axe-core/playwright` package install: `cd web && npm install -D @axe-core/playwright`

## Sources

### Primary (HIGH confidence)
- [Playwright accessibility testing docs](https://playwright.dev/docs/accessibility-testing) -- AxeBuilder API, fixtures, artifact saving
- [Playwright ARIA snapshots docs](https://playwright.dev/docs/aria-snapshots) -- toMatchAriaSnapshot(), ariaSnapshot(), YAML syntax
- Project source code: `web/src/routes/__root.tsx`, `web/src/components/field/OfflineBanner.tsx`, `web/src/components/field/FieldHeader.tsx`, `web/src/index.css`, `web/src/components/canvassing/map/TurfMapEditor.tsx`, `web/src/components/canvassing/TurfForm.tsx`
- npm registry: @axe-core/playwright 4.11.1, axe-core 4.11.1

### Secondary (MEDIUM confidence)
- [DEV.to: Accessibility audits with Playwright, Axe, and GitHub Actions](https://dev.to/jacobandrewsky/accessibility-audits-with-playwright-axe-and-github-actions-2504) -- parameterized route patterns
- [ARIA Snapshot in Playwright (blog)](https://testersdigest.blogspot.com/2025/03/aria-snapshot-in-playwright.html) -- ARIA snapshot usage examples

### Tertiary (LOW confidence)
- OKLCH contrast ratio computation in axe-core 4.11.1 -- needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- @axe-core/playwright is the official integration, already verified version
- Architecture: HIGH -- patterns from official Playwright docs, project structure follows existing conventions
- Pitfalls: HIGH -- well-documented in axe-core and Playwright communities
- Color contrast: MEDIUM -- OKLCH support in axe-core needs runtime verification

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, 30 days)
