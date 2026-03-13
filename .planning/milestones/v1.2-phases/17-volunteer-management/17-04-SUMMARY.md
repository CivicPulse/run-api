---
phase: 17-volunteer-management
plan: "04"
subsystem: ui
tags: [react, tanstack-router, react-hook-form, zod, volunteer, tabs, sheet, dialog]

# Dependency graph
requires:
  - phase: 17-volunteer-management
    provides: "Volunteer types, hooks (CRUD, tags, availability, hours), and sidebar layout from Plans 01-02"
provides:
  - "Dual-mode volunteer registration page with role-adaptive form and 409 conflict handling"
  - "Volunteer detail page with Profile, Availability, and Hours tabs"
  - "VolunteerEditSheet with useFormGuard for inline profile editing"
  - "AddAvailabilityDialog with date/time slot creation"
  - "Inline tag management (add/remove) in volunteer detail header"
affects: [17-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-mode form adapting by role via RequireRole for section gating"
    - "Inline tag pills with add dropdown and x-remove in detail header"
    - "ky HTTPError catch for 409 conflict with response body parsing for redirect"

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx
    - web/src/routes/campaigns/$campaignId/volunteers/$volunteerId/index.tsx
    - web/src/components/volunteers/VolunteerEditSheet.tsx
    - web/src/components/volunteers/AddAvailabilityDialog.tsx
  modified:
    - web/src/routeTree.gen.ts

key-decisions:
  - "409 self-register uses ky HTTPError catch with response.json() to extract volunteer_id for redirect"
  - "Tag name-to-ID resolution via tagsByName Map built from useVolunteerCampaignTags query"
  - "Availability slots sorted ascending by start_at; past slots get muted styling and hidden delete button"

patterns-established:
  - "Dual-mode form: single form component with RequireRole sections for manager-only fields"
  - "Tag pills in header: Badge with X button for remove + DropdownMenu for Add Tag with available tags filter"
  - "Stat cards grid: 3-column Card grid for summary metrics above detail table"

requirements-completed: [VLTR-02, VLTR-03, VLTR-04, VLTR-05, VLTR-06, VLTR-08, VLTR-09]

# Metrics
duration: 238s
completed: 2026-03-12
---

# Phase 17 Plan 04: Register Page & Detail Page Summary

**Dual-mode volunteer registration with auth pre-fill and 409 redirect, volunteer detail page with Profile/Availability/Hours tabs, VolunteerEditSheet with useFormGuard, and AddAvailabilityDialog with date/time slot creation**

## Performance

- **Duration:** 238 sec
- **Started:** 2026-03-12T01:00:43Z
- **Completed:** 2026-03-12T01:04:41Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built dual-mode registration page that adapts by role: volunteers see essential fields + skills; managers see all fields + status
- Created volunteer detail page with three tabs (Profile, Availability, Hours), inline tag management in header, and loading/empty states
- Implemented VolunteerEditSheet following VoterEditSheet pattern with useFormGuard for unsaved changes protection
- Built AddAvailabilityDialog with date/time inputs and end-after-start validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Register page -- dual-mode volunteer creation form** - `60e3a1d` (feat)
2. **Task 2: Volunteer detail page with tabs + VolunteerEditSheet + AddAvailabilityDialog** - `221cfea` (feat)

## Files Created/Modified
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` - Dual-mode registration form with role detection, auth pre-fill, skills checkbox grid, 409 conflict handling with redirect
- `web/src/routes/campaigns/$campaignId/volunteers/$volunteerId/index.tsx` - Detail page with header (name, status badge, skills, tag pills), Profile tab (read-only fields), Availability tab (slot list with add/delete), Hours tab (stat cards + shift history table)
- `web/src/components/volunteers/VolunteerEditSheet.tsx` - Slide-out edit sheet with all editable fields, skills checkbox grid, useFormGuard, unsaved changes blocker UI
- `web/src/components/volunteers/AddAvailabilityDialog.tsx` - Date + start/end time dialog, end-after-start validation, form reset on close
- `web/src/routeTree.gen.ts` - Auto-generated route tree updated with new register and $volunteerId routes

## Decisions Made
- 409 self-register uses ky HTTPError catch with `error.response.json()` to extract `volunteer_id` from the enriched ProblemResponse for redirect to the existing volunteer detail page
- Tag name-to-ID resolution uses a `tagsByName` Map built from `useVolunteerCampaignTags` query, since the detail response returns tag names (strings) but add/remove endpoints need tag IDs
- Availability slots are sorted ascending by `start_at`; past slots (where `end_at < now`) receive muted styling (opacity-50, text-muted-foreground) with the delete button hidden

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Register page ready for volunteer self-registration and manager-initiated volunteer creation
- Detail page ready for volunteer profile viewing, editing, availability management, and hours display
- All hooks from Plan 02 are fully consumed by these pages
- Plan 05 (Roster page + Tags CRUD) can now link to volunteer detail pages via row click navigation
- TypeScript compiles cleanly, all 14 test files pass (110 tests, 81 todo stubs)

## Self-Check: PASSED

All 5 files verified present. Both task commits (60e3a1d, 221cfea) verified in git log. Must_haves artifact constraints met: register page 421 lines with useSelfRegister, detail page 551 lines with Tabs, VolunteerEditSheet 355 lines with useFormGuard, AddAvailabilityDialog with start_at.

---
*Phase: 17-volunteer-management*
*Completed: 2026-03-12*
