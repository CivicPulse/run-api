---
phase: 12-shared-infrastructure-campaign-foundation
plan: "03"
subsystem: web-ui
tags: [members, invites, campaign-settings, hooks, react-query, zod, react-hook-form]
dependency_graph:
  requires:
    - 12-01 (usePermissions, RequireRole, DataTable)
    - 12-02 (settings layout with Members tab route)
  provides:
    - useMembers, useUpdateMemberRole, useRemoveMember hooks
    - useInvites, useCreateInvite, useRevokeInvite hooks
    - Invite and InviteCreate type definitions
    - MemberRoleUpdate type definition
    - Members settings tab with full member management UI
  affects:
    - danger.tsx (shares members query key ["campaigns", id, "members"])
tech_stack:
  added:
    - happy-dom (switched from jsdom — ESM compatibility fix)
  patterns:
    - useQuery + useMutation with invalidateQueries for cache synchronization
    - react-hook-form + zod v4 (z.email()) for invite form validation
    - DropdownMenu for kebab actions column (per DataTable design decision)
    - ColumnDef cell renderers for per-row action menus
key_files:
  created:
    - web/src/types/invite.ts
    - web/src/types/member.ts
    - web/src/hooks/useMembers.ts
    - web/src/hooks/useInvites.ts
    - web/src/hooks/useMembers.test.ts
    - web/src/hooks/useInvites.test.ts
    - web/src/routes/campaigns/$campaignId/settings/members.tsx
  modified:
    - web/vitest.config.ts (environment: jsdom -> happy-dom)
    - web/package.json (added happy-dom devDependency)
decisions:
  - "Owner row shows no kebab menu — cannot change owner role or remove owner from members tab"
  - "Current user cannot change their own role (self-role-change prevention)"
  - "Invite member button placed above the pending invites section (admin+ gated via RequireRole)"
  - "StatusVariant inlined in members.tsx rather than exporting from StatusBadge.tsx (avoids modifying shared component)"
metrics:
  duration: "5 min"
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_created: 7
  files_modified: 2
  tests_added: 12
  total_tests_passing: 63
---

# Phase 12 Plan 03: Members Settings Tab Summary

**One-liner:** Member management UI with useMembers/useInvites hooks, role change and invite dialogs, permission-gated kebab menus, and zod v4 form validation.

## Objective

Build the Members settings tab completing the campaign settings area. Campaign admins can view members with role badges, invite new members via email+role dialog, change member roles, remove members, view pending invites, and revoke invites — all permission-gated by RequireRole.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (TDD) | Types and API hooks — useMembers and useInvites | 6335437 | invite.ts, member.ts, useMembers.ts, useInvites.ts, useMembers.test.ts, useInvites.test.ts |
| 2 | Members settings tab — member list, invite dialog, role changes, removals | 263bd77 | settings/members.tsx |

## Verification Results

- TypeScript: clean compile (0 errors)
- Tests: 63 passing (12 new hook tests + 51 pre-existing)
- TDD: RED (tests failed with missing module) → GREEN (all 12 pass)
- members.tsx: 507 lines (exceeds 100 line minimum)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched test environment from jsdom to happy-dom**
- **Found during:** Task 1 TDD RED phase
- **Issue:** jsdom v28.1.0 has an ESM incompatibility with `@exodus/bytes` (a transitive dependency), causing `ERR_REQUIRE_ESM` when any test tries to initialize the jsdom environment. This is a pre-existing infrastructure breakage that blocked all `renderHook` tests.
- **Fix:** Installed `happy-dom` devDependency and changed `environment: 'jsdom'` to `environment: 'happy-dom'` in `vitest.config.ts`. Verified all 51 pre-existing tests continue to pass.
- **Files modified:** web/vitest.config.ts, web/package.json
- **Commit:** 818769f (included with RED test commit)

## Key Decisions

1. **Owner row: no actions** — Cannot change owner role (ownership transfer is in Danger Zone) or remove owner. Kebab menu hidden for `role === "owner"` rows.
2. **Self-role-change prevention** — "Change role" menu item hidden when `member.user_id === currentUserId` (from OIDC `sub` claim via authStore).
3. **StatusVariant inlined** — Rather than exporting the private `StatusVariant` type from StatusBadge.tsx, the type is redeclared locally in members.tsx to avoid modifying the shared component.
4. **Invite button placement** — "Invite member" button placed in the Pending Invites section header (admin+ RequireRole gated), consistent with the plan's "above the invites section" directive.

## Self-Check: PASSED

All created files found on disk. All task commits verified in git log (818769f, 6335437, 263bd77).
