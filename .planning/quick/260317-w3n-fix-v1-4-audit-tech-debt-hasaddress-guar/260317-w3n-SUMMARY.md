---
phase: quick
plan: 260317-w3n
subsystem: ui
tags: [react, typescript, field-mode, canvassing, phone-banking, accessibility]

requires:
  - phase: 36-google-maps-navigation
    provides: hasAddress guard function and getGoogleMapsUrl in canvassing types
provides:
  - hasAddress-guarded MapPin in DoorListView (no broken nav links for addressless voters)
  - Single FieldHeader in canvassing and phone-banking routes (from parent layout only)
  - Complete Phase 38 VALIDATION.md with nyquist_compliant true
affects: [field-mode, canvassing, phone-banking]

tech-stack:
  added: []
  patterns:
    - "hasAddress guard pattern for conditional navigation links"
    - "Parent layout provides FieldHeader; child routes do not duplicate it"

key-files:
  created: []
  modified:
    - web/src/components/field/DoorListView.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/routes/field/$campaignId/phone-banking.tsx
    - .planning/phases/38-tech-debt-cleanup/38-VALIDATION.md

key-decisions:
  - "Faded MapPin (text-muted-foreground/30) with aria-hidden for addressless voters matches HouseholdCard disabled pattern"

patterns-established:
  - "Conditional navigation: guard map links with hasAddress before rendering clickable anchor"

requirements-completed: []

duration: 2min
completed: 2026-03-17
---

# Quick Task 260317-w3n: Fix v1.4 Audit Tech Debt Summary

**hasAddress guard on DoorListView MapPin, duplicate FieldHeader removal from canvassing/phone-banking routes, Phase 38 VALIDATION.md completion**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T23:09:25Z
- **Completed:** 2026-03-17T23:11:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- DoorListView MapPin link now conditionally renders: clickable link for voters with addresses, faded non-interactive icon for voters without
- Removed all FieldHeader instances from canvassing.tsx (5 occurrences) and phone-banking.tsx early-return branches (5 occurrences) -- parent layout provides the single header
- Phase 38 VALIDATION.md updated to complete/approved status with all 6 tasks green

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hasAddress guard to DoorListView MapPin and remove double FieldHeader** - `07f0f2f` (fix)
2. **Task 2: Update Phase 38 VALIDATION.md to reflect actual execution status** - `267232b` (docs)

## Files Created/Modified
- `web/src/components/field/DoorListView.tsx` - Added hasAddress import and conditional MapPin rendering
- `web/src/routes/field/$campaignId/canvassing.tsx` - Removed FieldHeader import and all 5 usages
- `web/src/routes/field/$campaignId/phone-banking.tsx` - Removed FieldHeader import and 5 early-return usages
- `.planning/phases/38-tech-debt-cleanup/38-VALIDATION.md` - Updated to complete status with all tasks green

## Decisions Made
- Faded MapPin uses text-muted-foreground/30 opacity with aria-hidden="true", matching the disabled pattern from HouseholdCard.tsx

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v1.4 milestone audit tech debt items resolved
- Milestone can be marked clean

---
*Quick task: 260317-w3n*
*Completed: 2026-03-17*
