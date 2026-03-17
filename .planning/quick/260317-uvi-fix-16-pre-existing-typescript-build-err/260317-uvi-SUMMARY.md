---
phase: quick
plan: 260317-uvi
subsystem: ui
tags: [typescript, tanstack-router, type-checking]

requires: []
provides:
  - "Clean TypeScript build baseline with zero tsc errors"
affects: [all-frontend]

tech-stack:
  added: []
  patterns: ["TanStack Router typed route params pattern with to/params props"]

key-files:
  created: []
  modified:
    - web/src/components/field/AssignmentCard.tsx
    - web/src/components/field/CompletionSummary.tsx
    - web/src/components/field/FieldHeader.tsx
    - web/src/routes/field/$campaignId/canvassing.tsx
    - web/src/routes/field/$campaignId/phone-banking.tsx
    - web/src/hooks/useCallingSession.ts
    - web/src/hooks/useCanvassingWizard.ts
    - web/src/hooks/useConnectivityStatus.test.ts
    - web/src/hooks/useSyncEngine.ts
    - web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx

key-decisions:
  - "TanStack Router typed routes: use static to='/field/$campaignId' with params={{ campaignId }} instead of template literals"
  - "useRef initial value: provide explicit undefined to satisfy React 19 type signature"

requirements-completed: []

duration: 3min
completed: 2026-03-17
---

# Quick Task 260317-uvi: Fix 16 Pre-existing TypeScript Build Errors Summary

**Resolved all 16 TypeScript build errors across 4 categories: router type mismatches, unused variables, wrong argument count, and test type incompatibilities**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-17T22:16:52Z
- **Completed:** 2026-03-17T22:20:42Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Fixed 6 TanStack Router `to` prop type errors by switching from template literals to typed route patterns with params objects
- Removed 7 unused variables/imports across 5 files (id, useClaimEntry, skippedEntries, isAllHandled, voterId, originalOnLine, response)
- Fixed useRef argument count error in useSyncEngine by providing explicit initial value
- Fixed phone_attempts type mismatch in 2 test files by adding explicit null defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix TanStack Router to prop type errors and unused variables** - `e2496e0` (fix)
2. **Task 2: Fix useSyncEngine argument error and test type mismatches** - `075eb75` (fix)
3. **Task 3: Final verification** - No commit (verification-only task)

## Files Created/Modified
- `web/src/components/field/AssignmentCard.tsx` - Fixed router to prop, removed unused id
- `web/src/components/field/CompletionSummary.tsx` - Fixed router to prop
- `web/src/components/field/FieldHeader.tsx` - Fixed router to prop
- `web/src/routes/field/$campaignId/canvassing.tsx` - Fixed router to prop, removed unused response variable
- `web/src/routes/field/$campaignId/phone-banking.tsx` - Fixed router to prop (3 occurrences) and navigate call
- `web/src/hooks/useCallingSession.ts` - Removed unused useClaimEntry import and skippedEntries
- `web/src/hooks/useCanvassingWizard.ts` - Removed unused isAllHandled callback, voterId param, and Household type
- `web/src/hooks/useConnectivityStatus.test.ts` - Removed unused originalOnLine variable
- `web/src/hooks/useSyncEngine.ts` - Fixed useRef call with explicit undefined initial value
- `web/src/routes/campaigns/$campaignId/phone-banking/call-lists/$callListId.test.tsx` - Added phone_attempts: null
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` - Added phone_attempts: null

## Decisions Made
- Used TanStack Router's typed route pattern (to="/field/$campaignId" with params={{ campaignId }}) instead of `as string` casting for type-safe routing
- Provided explicit `undefined` initial value to `useRef<(() => void) | undefined>` to satisfy React 19 types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed orphaned Household type import**
- **Found during:** Task 1
- **Issue:** Removing isAllHandled callback left unused Household type import (TS6196)
- **Fix:** Removed Household from type imports in useCanvassingWizard.ts
- **Files modified:** web/src/hooks/useCanvassingWizard.ts
- **Committed in:** e2496e0

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cascading cleanup from planned removal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TypeScript build is now clean with zero errors
- Future development should maintain this baseline

---
*Quick task: 260317-uvi*
*Completed: 2026-03-17*
