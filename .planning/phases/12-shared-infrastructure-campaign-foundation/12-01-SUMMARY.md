---
phase: 12-shared-infrastructure-campaign-foundation
plan: 01
subsystem: ui
tags: [react, typescript, tanstack-table, tanstack-router, react-hook-form, zitadel, jwt, permissions, rbac]

# Dependency graph
requires: []
provides:
  - "CampaignRole 5-level type (viewer/volunteer/manager/admin/owner) matching backend IntEnum"
  - "usePermissions hook: JWT claim extraction from ZITADEL OIDC profile with useMyCampaignRole API fallback"
  - "ROLE_HIERARCHY const mapping roles to numeric levels for comparison"
  - "RequireRole component: hides children entirely when role below minimum (no greyed-out UI)"
  - "useFormGuard hook: useBlocker integration with react-hook-form isDirty for route + beforeunload protection"
  - "DataTable<TData> generic component: server-side sorting/pagination/empty state/skeleton loading"
affects:
  - phase-13
  - phase-14
  - phase-15
  - phase-16
  - phase-17
  - phase-18

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role comparison via ROLE_HIERARCHY numeric map (viewer=0...owner=4)"
    - "JWT role extraction: urn:zitadel:iam:org:project:{projectId}:roles claim key"
    - "useBlocker with withResolver:true for navigation protection dialogs"
    - "Server-side TanStack Table: manualSorting + manualFiltering + manualPagination"
    - "TDD with vitest/testing-library: RED (failing tests) -> GREEN (minimal impl) pattern"

key-files:
  created:
    - web/src/types/auth.ts (modified - viewer added)
    - web/src/hooks/usePermissions.ts
    - web/src/components/shared/RequireRole.tsx
    - web/src/hooks/useFormGuard.ts
    - web/src/components/shared/DataTable.tsx
    - web/src/hooks/usePermissions.test.ts
    - web/src/components/shared/RequireRole.test.tsx
    - web/src/hooks/useFormGuard.test.ts
    - web/src/components/shared/DataTable.test.tsx
  modified:
    - web/src/types/auth.ts

key-decisions:
  - "RequireRole hides unauthorized content entirely — no disabled/greyed-out state"
  - "usePermissions selects highest role when multiple roles present in JWT claim object"
  - "useFormGuard wires both route blocking AND beforeunload in one hook — consuming component renders ConfirmDialog when isBlocked"
  - "DataTable uses manualSorting/manualFiltering/manualPagination — all data operations are server-side"
  - "DataTable row density: py-3 comfortable (Notion-style), no zebra striping, hover highlight only"
  - "Kebab menu column handled by column ColumnDef cell renderer in consuming components, not baked into DataTable"

patterns-established:
  - "Permission gate: wrap JSX with <RequireRole minimum='admin'>...</RequireRole>"
  - "Form guard: const { isBlocked, proceed, reset } = useFormGuard({ form }) — render ConfirmDialog when isBlocked"
  - "DataTable columns: ColumnDef<TRow, unknown>[] with enableSorting:true on sortable columns"

requirements-completed: [INFR-01, INFR-02, INFR-03]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 12 Plan 01: Shared Infrastructure Summary

**Role-based permission gating (usePermissions + RequireRole), form navigation protection (useFormGuard), and reusable server-side DataTable with ZITADEL JWT claim extraction and 51 passing unit tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T21:33:09Z
- **Completed:** 2026-03-10T21:38:30Z
- **Tasks:** 3 completed
- **Files modified:** 9

## Accomplishments
- Built usePermissions hook extracting CampaignRole from ZITADEL OIDC JWT claims (urn:zitadel:iam:org:project:{projectId}:roles) with useMyCampaignRole API fallback and highest-role selection when multiple roles present
- Built RequireRole component that hides unauthorized children entirely with optional fallback, consuming usePermissions().hasRole(minimum)
- Fixed CampaignRole type in auth.ts to include "viewer" — aligning frontend 5-level hierarchy with backend IntEnum (VIEWER=0...OWNER=4)
- Built useFormGuard hook wiring TanStack Router useBlocker to react-hook-form isDirty for route blocking and beforeunload protection
- Built generic DataTable<TData> wrapping TanStack Table with server-side sorting (sort indicators), cursor-based PaginationControls, EmptyState, skeleton loading rows, and comfortable row density

## Task Commits

Each task was committed atomically:

1. **Task 1: Permission system** - `b548392` (feat)
2. **Task 2: useFormGuard hook** - `806aa3f` (feat)
3. **Task 3: DataTable wrapper** - `595027d` (feat)

## Files Created/Modified
- `web/src/types/auth.ts` - Added "viewer" to CampaignRole union (was 4-level, now 5-level)
- `web/src/hooks/usePermissions.ts` - JWT claim extraction, ROLE_HIERARCHY, hasRole helper
- `web/src/components/shared/RequireRole.tsx` - Permission gate wrapper component
- `web/src/hooks/useFormGuard.ts` - Form navigation protection with useBlocker
- `web/src/components/shared/DataTable.tsx` - Reusable server-side table wrapper
- `web/src/hooks/usePermissions.test.ts` - 28 tests (role extraction, hierarchy, fallback)
- `web/src/components/shared/RequireRole.test.tsx` - 8 tests (show/hide based on minimum)
- `web/src/hooks/useFormGuard.test.ts` - 11 tests (blocking, proceed/reset, beforeunload)
- `web/src/components/shared/DataTable.test.tsx` - 12 tests (rendering, sorting, pagination, empty state)

## Decisions Made
- RequireRole hides unauthorized content entirely — per user decision from RESEARCH.md (no disabled/greyed-out state)
- useFormGuard wires both route blocking AND beforeunload in one call — consuming component renders ConfirmDialog when isBlocked
- usePermissions selects highest role when multiple roles present in JWT claim object (covers multi-role assignment scenarios)
- DataTable: no zebra striping, hover highlight only, py-3 row density — Notion-style per user preference
- Kebab menu column is a standard ColumnDef cell renderer in consuming components, not baked into DataTable

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Node.js v18 on system incompatible with vitest v4 (requires Node >=20). Auto-fixed by installing Node 20 via nvm and running `npm install` to populate node_modules (first-time setup, not a code issue).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All three shared infrastructure pieces are ready for consumption by phases 13-18
- usePermissions and RequireRole ready for campaign route permission gating
- useFormGuard ready for any form with unsaved-changes protection
- DataTable ready for any list view (contacts, volunteers, voters, etc.)
- No blockers

---
*Phase: 12-shared-infrastructure-campaign-foundation*
*Completed: 2026-03-10*

## Self-Check: PASSED
- All 5 implementation files exist on disk
- All 3 task commits verified in git history (b548392, 806aa3f, 595027d)
- 51 unit tests passing across 4 test suites
- TypeScript compilation clean (npx tsc --noEmit, no errors)
