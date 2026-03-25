---
phase: 45-wcag-compliance-audit
plan: 03
subsystem: ui
tags: [accessibility, wcag, axe-core, a11y, playwright, aria, focus-management]

requires:
  - phase: 45-01
    provides: axe-core fixture, shared a11y components (SkipNav, FocusScope, LiveRegion)
provides:
  - Parameterized axe-core scan covering 38 admin and field routes
  - JSON artifact output per route for audit trail
  - CI-gateable zero critical/serious violation threshold
  - D-10 focus management for form submission and delete actions
  - aria-sort and keyboard support for DataTable sort headers
  - aria-describedby linkage for TooltipIcon
  - role=status on EmptyState for screen reader announcement
affects: [all-admin-routes, all-field-routes, DataTable, EmptyState, TooltipIcon, settings-forms]

tech-stack:
  added: []
  patterns: ["aria-sort on sortable table headers", "aria-invalid + aria-describedby for form validation", "requestAnimationFrame focus after delete/submit", "role=tooltip on popover content", "role=status on empty states"]

key-files:
  created:
    - web/e2e/a11y-scan.spec.ts
  modified:
    - web/src/components/shared/DataTable.tsx
    - web/src/components/shared/EmptyState.tsx
    - web/src/components/shared/TooltipIcon.tsx
    - web/src/routes/campaigns/$campaignId/settings/general.tsx
    - web/src/routes/campaigns/$campaignId/settings/members.tsx

key-decisions:
  - "38 routes scanned (3 org + 32 campaign-admin + 3 field) covering all application pages"
  - "API mocking via page.route catch-all returns minimal valid data for each endpoint pattern"
  - "OIDC auth seeded via localStorage addInitScript for admin routes"
  - "D-10 uses requestAnimationFrame for focus after DOM updates from React state changes"
  - "Headings receive tabIndex=-1 for programmatic focus without keyboard tab stop"

requirements-completed: [A11Y-01]

duration: 8min
completed: 2026-03-25
---

# Phase 45 Plan 03: Axe-Core Route Scan & Violation Remediation Summary

**Parameterized axe-core WCAG 2.1 AA scan across 38 routes with JSON artifacts, zero critical/serious gate, and D-10 focus management patterns for forms and delete actions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-25T00:03:06Z
- **Completed:** 2026-03-25T00:11:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created parameterized Playwright test scanning all 38 admin and field routes with axe-core WCAG 2.1 AA
- JSON violation artifacts attached per route via testInfo.attach for audit tracking
- Zero critical/serious violations gate CI; moderate/minor logged as warnings only
- DataTable sort headers now keyboard-accessible with aria-sort attributes
- EmptyState announces to screen readers via role="status"
- TooltipIcon has proper aria-describedby linkage between trigger and content
- Settings general form focuses first invalid field on validation failure (D-10)
- Settings members page focuses section heading after member removal or invite revocation (D-10)
- Form error messages linked to inputs via aria-describedby with role="alert"

## Task Commits

Each task was committed atomically:

1. **Task 1: Create parameterized axe-core route scan test** - `02182ad` (feat)
2. **Task 2: Fix axe-core violations and implement D-10 focus management** - `f3d0995` (fix)

## Files Created/Modified
- `web/e2e/a11y-scan.spec.ts` - 38-route parameterized axe-core scan with auth mocking and API mocks
- `web/src/components/shared/DataTable.tsx` - aria-sort, keyboard handlers, aria-hidden on sort icons
- `web/src/components/shared/EmptyState.tsx` - role="status" and aria-label for screen reader announcement
- `web/src/components/shared/TooltipIcon.tsx` - useId for aria-describedby, role="tooltip" on content
- `web/src/routes/campaigns/$campaignId/settings/general.tsx` - aria-invalid, aria-describedby, D-10 focus first error
- `web/src/routes/campaigns/$campaignId/settings/members.tsx` - D-10 focus heading after delete, aria-invalid on invite form

## Decisions Made
- 38 routes scanned: 3 org-level, 32 campaign-admin, 3 field mode
- API mocking uses catch-all page.route with URL pattern matching for minimal valid responses
- OIDC auth seeded via localStorage addInitScript to bypass auth gate on admin routes
- D-10 focus management uses requestAnimationFrame to wait for React DOM updates
- Heading elements get tabIndex={-1} for programmatic focus without adding keyboard tab stops
- Sort icon spans marked aria-hidden="true" since sort state conveyed via aria-sort attribute

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- axe-core scan test ready to run in CI when preview server is available
- D-10 focus patterns established for reuse in other form/delete interactions
- All shared components (DataTable, EmptyState, TooltipIcon) have proper ARIA attributes
