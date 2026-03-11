---
phase: 16-phone-banking
plan: "02"
subsystem: frontend
tags: [typescript, tanstack-query, hooks, types, phone-banking]
dependency_graph:
  requires: []
  provides:
    - web/src/types/phone-bank-session.ts
    - web/src/hooks/usePhoneBankSessions.ts
  affects:
    - web/src/routes/campaigns/$campaignId/phone-banking.tsx
    - Plans 03-06 (consume these types and hooks)
tech_stack:
  added: []
  patterns:
    - TanStack Query query key factory (sessionKeys)
    - useMutation with onSuccess invalidation
    - refetchInterval as function for status-aware polling
key_files:
  created:
    - web/src/types/phone-bank-session.ts
    - web/src/hooks/usePhoneBankSessions.ts
  modified:
    - web/src/routes/campaigns/$campaignId/phone-banking.tsx
decisions:
  - "[Phase 16-phone-banking]: useUpdateSessionStatus (not useUpdateSession) exported — name matches plan must_haves export list exactly"
  - "[Phase 16-phone-banking]: useMyPhoneBankSessions spreads sessionKeys.all() and appends 'mine' — stays invalidatable by session list mutations"
  - "[Phase 16-phone-banking]: Pre-existing useVoterLists.test.ts failure is out-of-scope — caused by uncommitted working tree changes from a prior plan"
metrics:
  duration: 134 sec
  completed_date: "2026-03-11"
  tasks: 2
  files: 3
---

# Phase 16 Plan 02: TypeScript Types and Session Hooks Summary

**One-liner:** Full TypeScript type contracts and 16 TanStack Query hooks for phone banking sessions, callers, progress, and calling screen — plus updated sidebar nav.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create phone-bank-session.ts types and update phone-banking.tsx sidebar nav | 5ead7a1 | web/src/types/phone-bank-session.ts, web/src/routes/campaigns/$campaignId/phone-banking.tsx |
| 2 | Create usePhoneBankSessions.ts hook module | ab6dea0 | web/src/hooks/usePhoneBankSessions.ts |

## What Was Built

### Types (web/src/types/phone-bank-session.ts)

All backend Python schema types mirrored to TypeScript with snake_case fields:
- `SessionStatus` union type
- `PhoneBankSession`, `SessionCaller`, `SessionCreate`, `SessionUpdate`
- `RecordCallPayload`, `CallerProgressItem`, `SessionProgressResponse`
- `STATUS_ACTIONS` const record — valid status transitions per status
- `OUTCOME_GROUPS` const array — calling screen outcome button configuration

### Hooks (web/src/hooks/usePhoneBankSessions.ts)

16 exports mirroring useCallLists.ts pattern exactly:
- `sessionKeys` — query key factory (all, detail, callers, progress)
- Session queries: `usePhoneBankSessions`, `usePhoneBankSession`, `useMyPhoneBankSessions`
- Session mutations: `useCreatePhoneBankSession`, `useUpdateSessionStatus`, `useDeletePhoneBankSession`
- Caller management: `useSessionCallers`, `useAssignCaller`, `useRemoveCaller`, `useCheckIn`, `useCheckOut`
- Calling screen: `useClaimEntry`, `useRecordCall`, `useSelfReleaseEntry`, `useReassignEntry`
- Progress polling: `useSessionProgress` with status-aware `refetchInterval`

### Sidebar Nav (web/src/routes/campaigns/$campaignId/phone-banking.tsx)

Updated navItems to: Sessions | Call Lists | DNC List | My Sessions

## Verification

- `web/src/types/phone-bank-session.ts` — exists with all exported types
- `web/src/hooks/usePhoneBankSessions.ts` — exists with all 16 exported hooks
- Sidebar nav shows Sessions and My Sessions entries
- `npx tsc --noEmit` — exits 0 (no type errors)
- Vitest: 109 passing, 55 todo. 1 pre-existing failure in useVoterLists.test.ts (out of scope — caused by uncommitted working-tree changes from a prior plan, not this plan's files)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- web/src/types/phone-bank-session.ts: FOUND
- web/src/hooks/usePhoneBankSessions.ts: FOUND
- Commit 5ead7a1: FOUND
- Commit ab6dea0: FOUND
