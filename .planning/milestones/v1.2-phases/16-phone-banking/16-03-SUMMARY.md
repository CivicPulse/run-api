---
phase: 16-phone-banking
plan: "03"
subsystem: ui
tags: [react, tanstack-router, tanstack-query, typescript, phone-banking]

# Dependency graph
requires:
  - phase: 16-02
    provides: "PhoneBankSession types, usePhoneBankSessions hooks"
  - phase: 15-call-lists-dnc-management
    provides: "useCallLists hook, CallListDialog pattern"
provides:
  - "Sessions index page at /campaigns/$campaignId/phone-banking/sessions/"
  - "SessionDialog component (create + edit modes in single component)"
  - "Session DataTable with name, status, call list, scheduled start, callers, actions columns"
affects:
  - 16-04
  - 16-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single dialog component for create+edit with optional editSession prop — same as CallListDialog pattern"
    - "Call list selector disabled in edit mode — call_list_id not editable after creation"

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx
  modified: []

key-decisions:
  - "useUpdateSessionStatus used (not useUpdateSession) — matches plan must_haves export name exactly"
  - "Call list column falls back to ID substring (slice 0,8) when callListsById lookup misses — guards against stale query data"
  - "datetime-local input values converted to ISO strings via new Date().toISOString() before send — avoids timezone offset mismatch"
  - "ConfirmDialog for delete with no type-to-confirm — per CONTEXT.md spec for session delete"

patterns-established:
  - "SessionDialog: optional editSession prop determines create vs edit mode — mirrors CallListDialog pattern exactly"
  - "Call list lookup map built from useCallLists data client-side — avoids extra endpoint for name display"

requirements-completed:
  - PHON-01
  - PHON-02

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 16 Plan 03: Sessions Index Page Summary

**TanStack sessions index page with DataTable, single SessionDialog for create/edit, call list lookup map, and RequireRole-gated manager actions**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T21:15:19Z
- **Completed:** 2026-03-11T21:17:21Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Sessions index page at `/campaigns/$campaignId/phone-banking/sessions/` with full CRUD
- SessionDialog component handles create (all fields) and edit (name + times only, call list disabled) from single component
- DataTable with Name (link to detail), Status badge, Call List name, Scheduled Start, Callers, Actions kebab columns
- RequireRole gates New Session button and Edit/Delete kebab items to manager+
- ConfirmDialog for delete without type-to-confirm per CONTEXT.md spec

## Task Commits

Each task was committed atomically:

1. **Task 1: Sessions index page with DataTable, SessionDialog, and CRUD actions** - `787c486` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx` - Sessions index page with SessionDialog and DataTable

## Decisions Made
- Used `useUpdateSessionStatus` (not `useUpdateSession`) — matches the exact hook name exported from `usePhoneBankSessions.ts` per Phase 16 STATE.md decision
- Built client-side call list lookup map from `useCallLists` data — avoids a separate API call per row and matches stats chips pattern from Phase 15
- `datetime-local` string converted to ISO via `new Date(val).toISOString()` — normalizes timezone before send
- ConfirmDialog uses plain title/description (no type-to-confirm) — consistent with CONTEXT.md spec for session delete

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- First vitest run showed a flaky `useVoterLists.test.ts` failure (timeout on waitFor) — confirmed pre-existing flake by isolating test; test passes in isolation and in subsequent full suite runs. Not related to this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Sessions index page complete; ready for Plan 04 (session detail page) and Plan 05 (calling screen)
- SessionDialog edit mode intentionally limited to name + scheduled times (call list locked after creation)

---
*Phase: 16-phone-banking*
*Completed: 2026-03-11*
