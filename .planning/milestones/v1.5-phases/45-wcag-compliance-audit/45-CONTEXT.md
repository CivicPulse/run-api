# Phase 45: WCAG Compliance Audit - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase audits and remediates all admin and field mode pages for WCAG AA compliance. Deliverables: automated axe-core scanning on every route, screen reader flow verification for 5 critical flows, keyboard navigation compliance for all interactive components, and map accessibility with skip-nav and GeoJSON fallback for turf CRUD. No new features — this is accessibility hardening of existing functionality.

</domain>

<decisions>
## Implementation Decisions

### Scanning Strategy (A11Y-01)
- **D-01:** Use `@axe-core/playwright` with a single parameterized test that iterates all admin and field mode routes. One test file with a route array — add new routes by appending to the array.
- **D-02:** Violation threshold: zero critical and serious violations gate CI. Moderate and minor violations logged as warnings but do not block.
- **D-03:** Scan covers both admin routes (`/campaigns/*`, `/org/*`) AND field mode routes (`/field/*`). Field mode should already pass from v1.4 ARIA work — this confirms it.
- **D-04:** Save axe violation results as JSON artifacts per route alongside test results for tracking remediation progress and auditing.

### Screen Reader Verification (A11Y-02)
- **D-05:** Verify 5 critical flows (voter search, voter import, walk list creation, phone bank session, campaign settings) via Playwright accessibility tree snapshots. Assert correct heading hierarchy, labeled form inputs, ARIA landmarks (nav, main, complementary), and live region announcements after actions.
- **D-06:** Each flow test combines keyboard-only navigation AND accessibility tree assertions in a single test. Proves the flow is both keyboard-operable and screen-reader-friendly in one pass.
- **D-07:** Voter import wizard test verifies accessibility at every step (file upload, column mapping, preview, import progress) — not just start and end.

### Remediation Approach (A11Y-03)
- **D-08:** Create shared accessibility utility components in `components/shared/`: SkipNav, VisuallyHidden, LiveRegion, and FocusScope. Reusable across admin and field mode for consistency.
- **D-09:** Heading hierarchy: audit and fix manually per route. No HeadingLevel context provider — heading structure is page-specific.
- **D-10:** Explicit focus management after key interactions: modal/dialog close (return to trigger), form submission (focus success/error message), delete actions (focus next item). Browser defaults for everything else.
- **D-11:** Color contrast fixes applied at the theme level — audit and adjust CSS custom properties in globals.css so all components inherit compliant contrast ratios. One fix cascades everywhere.

### Map Accessibility (A11Y-04)
- **D-12:** Add a skip-nav link on map pages that jumps past the Leaflet map to the turf details/form section. User lands on actionable content (turf name, description, GeoJSON editing).
- **D-13:** GeoJSON textarea fallback: a collapsible "Edit as GeoJSON" panel below the map. Users paste/edit raw GeoJSON polygon coordinates. Validates on blur. Create, edit, and delete turf boundaries all work through this panel.
- **D-14:** GeoJSON panel is hidden/collapsed by default with an "Edit as GeoJSON" button. Screen readers announce it; keyboard users can tab to it. Keeps visual UI clean for mouse users.

### Claude's Discretion
- Exact route list for the parameterized axe scan (enumerate from the route tree)
- Specific ARIA landmark placement decisions per page
- Focus trap implementation details for modal components
- Which shadcn components need ARIA additions beyond their built-in accessibility
- Skeleton/loading state accessibility announcements

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — A11Y-01 through A11Y-04

### Existing A11Y Patterns (Field Mode)
- `web/src/components/field/OfflineBanner.tsx` — aria-live region pattern for connectivity status
- `web/src/components/field/FieldHeader.tsx` — ARIA landmark and labeling pattern
- `web/src/components/field/OutcomeGrid.tsx` — Accessible grid with aria attributes
- `web/src/components/field/InlineSurvey.tsx` — Form accessibility pattern
- `web/src/components/field/HouseholdCard.tsx` — Card with aria attributes

### Map Components (A11Y-04 targets)
- `web/src/components/canvassing/map/TurfMapEditor.tsx` — Main map editor to add skip-nav and GeoJSON fallback
- `web/src/components/canvassing/map/GeomanControl.tsx` — Drawing controls (map-dependent)
- `web/src/components/canvassing/map/OverlapHighlight.tsx` — Overlap visualization
- `web/src/routes/campaigns/$campaignId/canvassing/turfs/new.tsx` — Turf creation page
- `web/src/routes/campaigns/$campaignId/canvassing/turfs/$turfId.tsx` — Turf edit page

### Layout & Navigation
- `web/src/routes/__root.tsx` — Root layout, SidebarProvider, where SkipNav and app-level landmarks go

### Phase 44 Context (Preceding)
- `.planning/phases/44-ui-ux-polish-frontend-hardening/44-CONTEXT.md` — Error boundaries, empty states, loading states, tooltips (all need a11y audit)

### Theme
- `web/src/index.css` or `web/src/globals.css` — CSS custom properties for color contrast fixes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@playwright/test` already installed — axe-core integration builds on existing E2E infrastructure
- Field mode components have established ARIA patterns (aria-live, aria-label, role attributes) — can be referenced as examples for admin pages
- shadcn/ui components (Dialog, Accordion, Tabs, Sidebar) have built-in a11y — audit focuses on custom components and route pages
- `EmptyState`, `DataTable`, `Skeleton` components from Phase 44 — need a11y verification
- `TooltipIcon` (Popover-based) — needs aria-describedby linkage

### Established Patterns
- Field mode: ARIA landmarks, live regions, 44px touch targets, color contrast (v1.4)
- Admin mode: No ARIA patterns established yet — `__root.tsx` has zero aria attributes
- Forms: react-hook-form + zod — need aria-invalid, aria-describedby for error messages
- Toast notifications: Sonner — needs aria-live region verification

### Integration Points
- `__root.tsx` RootLayout: where SkipNav component and app-level landmarks would be added
- Route files: where per-page heading hierarchy and landmark fixes go
- `globals.css` / `index.css`: where theme-level contrast fixes apply
- Turf pages: where map skip-nav and GeoJSON fallback panel integrate

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following WCAG 2.1 AA guidelines and existing field mode ARIA patterns as reference.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 45-wcag-compliance-audit*
*Context gathered: 2026-03-24*
