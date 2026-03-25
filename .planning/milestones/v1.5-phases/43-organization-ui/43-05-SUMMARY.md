---
phase: 43-organization-ui
plan: 05
subsystem: ui
tags: [react, tanstack-router, sidebar, navigation, shadcn-ui]

requires:
  - phase: 43-02-organization-ui
    provides: "OrgSwitcher, org dashboard at /, RequireOrgRole component"
  - phase: 43-04-organization-ui
    provides: "Member directory at /org/members, org settings at /org/settings"
provides:
  - "Sidebar Organization nav group visible on all authenticated routes (/, /org/members, /org/settings)"
  - "Campaign nav group conditionally rendered only when inside a campaign route"
affects: [organization-ui, field-mode]

tech-stack:
  added: []
  patterns:
    - "Conditional sidebar sections via JSX expression guards instead of early return null"

key-files:
  created: []
  modified:
    - "web/src/routes/__root.tsx"

key-decisions:
  - "Removed early return null in favor of conditional JSX rendering for Campaign group"

patterns-established:
  - "Sidebar always renders on authenticated routes; individual groups conditionally shown"

requirements-completed: [ORG-05, ORG-06, ORG-07, ORG-08, ORG-09, ORG-10, ORG-11, ORG-12, ORG-13]

duration: 1min
completed: 2026-03-24
---

# Phase 43 Plan 05: Sidebar Nav Gap Closure Summary

**Refactored AppSidebar to always render Organization nav (All Campaigns, Members, Settings) on authenticated routes instead of returning null on non-campaign pages**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-24T19:53:56Z
- **Completed:** 2026-03-24T19:54:50Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed early `return null` that hid the entire sidebar on non-campaign routes
- Wrapped Campaign nav group in `campaignId && campaignId !== "new"` conditional
- Organization nav group (All Campaigns, Members, Settings) now always visible on authenticated routes
- TypeScript compilation passes clean with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor AppSidebar to always render Organization nav** - `02ff88d` (feat)

## Files Created/Modified
- `web/src/routes/__root.tsx` - Removed early return null, wrapped Campaign group in conditional

## Decisions Made
- Removed early return null in favor of conditional JSX rendering -- preserves all existing campaign nav behavior while enabling org-level sidebar navigation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 43 (organization-ui) is now complete with all 5 plans shipped
- Sidebar navigation works on all authenticated routes including org-level pages
- Ready for WCAG/UX audit and E2E testing phases

---
*Phase: 43-organization-ui*
*Completed: 2026-03-24*
