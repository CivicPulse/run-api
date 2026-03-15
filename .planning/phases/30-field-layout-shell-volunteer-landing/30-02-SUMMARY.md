---
phase: 30-field-layout-shell-volunteer-landing
plan: 02
subsystem: ui
tags: [tanstack-router, react, field-mode, mobile, layout]

requires:
  - phase: none
    provides: standalone field route tree
provides:
  - Field route detection in __root.tsx (isFieldRoute bypass)
  - FieldLayout route at /field/$campaignId with header and outlet
  - FieldHeader component with back, title, help, avatar
  - Placeholder canvassing and phone-banking sub-routes
affects: [30-03-volunteer-hub, 31-canvassing, 32-phone-banking, 34-help-overlay]

tech-stack:
  added: []
  patterns: [field-route-layout-shell, mobile-touch-targets-44px, conditional-back-navigation]

key-files:
  created:
    - web/src/routes/field/$campaignId.tsx
    - web/src/routes/field/$campaignId/index.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/routes/field/$campaignId/phone-banking.tsx
    - web/src/components/field/FieldHeader.tsx
  modified:
    - web/src/routes/__root.tsx

key-decisions:
  - "Field routes bypass admin sidebar via isFieldRoute check in __root.tsx"
  - "FieldHeader derives sub-route title from pathname via titleMap lookup"

patterns-established:
  - "Field layout pattern: sticky FieldHeader + flex-1 main content area"
  - "44px min touch targets on all interactive field elements (WCAG 2.5.5)"
  - "Conditional back arrow: shown on sub-screens, spacer div on hub"

requirements-completed: [NAV-01, NAV-03, NAV-04]

duration: 3min
completed: 2026-03-15
---

# Phase 30 Plan 02: Field Layout Shell Summary

**Mobile-optimized /field/{campaignId} route tree with FieldHeader (back arrow, title, disabled help, avatar menu) and placeholder sub-routes for canvassing and phone banking**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T19:52:06Z
- **Completed:** 2026-03-15T19:55:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Field route detection in __root.tsx renders minimal shell with zero admin chrome (no sidebar, no admin header)
- FieldHeader component with conditional back arrow, centered title, disabled help button, and avatar dropdown menu
- Placeholder canvassing and phone-banking sub-routes ready for Phase 31/32 implementation
- All interactive elements use 44px minimum touch targets per WCAG 2.5.5

## Task Commits

Each task was committed atomically:

1. **Task 1: Field layout shell in __root.tsx and field/$campaignId.tsx layout route** - `ae7dc43` (feat)
2. **Task 2: FieldHeader component with back arrow, title, help button, and avatar menu** - `5f7c884` (feat)

## Files Created/Modified
- `web/src/routes/__root.tsx` - Added isFieldRoute check to bypass admin sidebar for /field/* paths
- `web/src/routes/field/$campaignId.tsx` - Layout route with FieldHeader and Outlet, derives title from sub-path
- `web/src/routes/field/$campaignId/index.tsx` - Hub index placeholder (Plan 03 fills in)
- `web/src/routes/field/$campaignId/canvassing.tsx` - Canvassing placeholder for Phase 31
- `web/src/routes/field/$campaignId/phone-banking.tsx` - Phone banking placeholder for Phase 32
- `web/src/components/field/FieldHeader.tsx` - Sticky header with back/title/help/avatar, 44px touch targets

## Decisions Made
- Field routes bypass admin sidebar via isFieldRoute pathname check in __root.tsx (keeps __root.tsx minimal, no field-specific imports)
- FieldHeader derives sub-route title from pathname via titleMap lookup rather than passing title from each child route
- Hub detection uses pathname comparison (ends with campaignId, no sub-path) rather than route meta

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Field layout shell complete, ready for Plan 03 (volunteer hub with campaign cards)
- FieldHeader ready for Phase 34 help overlay wiring (help button exists, disabled)
- Canvassing and phone-banking placeholders ready for Phase 31/32 implementation

---
*Phase: 30-field-layout-shell-volunteer-landing*
*Completed: 2026-03-15*
