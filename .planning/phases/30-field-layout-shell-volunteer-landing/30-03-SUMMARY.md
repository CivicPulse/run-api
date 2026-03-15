---
phase: 30-field-layout-shell-volunteer-landing
plan: 03
subsystem: ui
tags: [react, tanstack-router, react-query, mobile, field-mode, pull-to-refresh]

requires:
  - phase: 30-01
    provides: useFieldMe hook, FieldMeResponse types, /field/me endpoint
  - phase: 30-02
    provides: FieldHeader, field layout shell, route tree
provides:
  - Volunteer landing hub with personalized greeting and assignment cards
  - AssignmentCard component with progress bar and tappable navigation
  - Pull-to-refresh on volunteer hub
  - Volunteer-only auto-redirect after OIDC login
affects: [31-canvassing, 32-phone-banking, 33-onboarding]

tech-stack:
  added: []
  patterns: [pull-to-refresh-touch-events, volunteer-role-auto-redirect]

key-files:
  created:
    - web/src/components/field/AssignmentCard.tsx
    - web/src/components/field/AssignmentCardSkeleton.tsx
    - web/src/components/field/FieldEmptyState.tsx
  modified:
    - web/src/routes/field/$campaignId/index.tsx
    - web/src/routes/field/$campaignId.tsx
    - web/src/routes/callback.tsx

key-decisions:
  - "Pull-to-refresh via native touch events (no library dependency)"
  - "Volunteer auto-redirect uses JWT role claim with API campaign fetch fallback"

patterns-established:
  - "Pull-to-refresh pattern: touchstart/move/end with 60px threshold and state machine"
  - "Role-based redirect: extract highest role from JWT claims in callback flow"

requirements-completed: [NAV-02]

duration: 2min
completed: 2026-03-15
---

# Phase 30 Plan 03: Volunteer Landing Hub Summary

**Volunteer hub page with personalized greeting, tappable assignment cards with progress bars, pull-to-refresh, and volunteer-only auto-redirect after login**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T19:57:54Z
- **Completed:** 2026-03-15T19:59:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Volunteer hub shows "Hey {firstName}!" greeting with stacked assignment cards for canvassing and phone banking
- AssignmentCard renders as tappable Link with type-specific icon, progress count, progress bar, and "Tap to start" CTA
- Pull-to-refresh implemented with native touch events (idle -> pulling -> refreshing state machine)
- Layout route uses shared useFieldMe cache to show campaign_name in FieldHeader
- Volunteer-only users auto-redirect to /field/{campaignId} after OIDC callback

## Task Commits

Each task was committed atomically:

1. **Task 1: AssignmentCard, skeleton, and empty state components** - `5f4ee41` (feat)
2. **Task 2: Hub landing page with data fetching, pull-to-refresh, and auto-redirect** - `8e2f730` (feat)

## Files Created/Modified
- `web/src/components/field/AssignmentCard.tsx` - Tappable card with icon, name, progress bar, CTA; links to canvassing or phone-banking sub-route
- `web/src/components/field/AssignmentCardSkeleton.tsx` - Shimmer loading placeholder matching AssignmentCard shape
- `web/src/components/field/FieldEmptyState.tsx` - Friendly "No assignment yet" message with ClipboardList icon
- `web/src/routes/field/$campaignId/index.tsx` - Full hub page with greeting, cards, loading/error/empty states, pull-to-refresh
- `web/src/routes/field/$campaignId.tsx` - Updated to use useFieldMe for campaign_name in header title
- `web/src/routes/callback.tsx` - Added volunteer-only auto-redirect to /field/{campaignId}

## Decisions Made
- Pull-to-refresh uses native touch events with 60px threshold rather than a library (keeps bundle lean)
- Volunteer auto-redirect extracts role from JWT claims directly in callback (avoids extra hook/component lifecycle)
- Layout and hub share same React Query cache key for useFieldMe (no double fetch)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Volunteer landing hub complete with all states (loading, error, empty, populated)
- AssignmentCard links to /field/{campaignId}/canvassing and /field/{campaignId}/phone-banking (Phase 31/32)
- Pull-to-refresh pattern established for reuse in sub-routes
- Auto-redirect ensures volunteers land directly in field mode

---
*Phase: 30-field-layout-shell-volunteer-landing*
*Completed: 2026-03-15*
