---
phase: 16-phone-banking
plan: "05"
subsystem: web-ui
tags: [phone-banking, caller-dashboard, check-in, tanstack-router]
dependency_graph:
  requires: ["16-02"]
  provides: [my-sessions-caller-dashboard]
  affects: [phone-banking-nav]
tech_stack:
  added: []
  patterns: [local-set-state-for-checked-in-tracking, per-row-mutation-components]
key_files:
  created:
    - web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx
  modified: []
decisions:
  - "RowAction component instantiates useCheckIn per row — mutations are cheap and per-row isolation needed"
  - "checkedInSessionIds uses useState<Set<string>>: resets on page refresh, acceptable for v1 (option 3 from CONTEXT.md)"
  - "Empty state rendered inline (not via DataTable emptyTitle) when sessions.length === 0 and not loading — gives cleaner messaging"
metrics:
  duration: "73 sec"
  completed_date: "2026-03-11"
  tasks: 1
  files: 1
---

# Phase 16 Plan 05: My Sessions Caller Dashboard Summary

**One-liner:** Per-caller session dashboard with local check-in state tracking and inline Check In / Resume Calling actions per row.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | My Sessions caller dashboard page | 1a490c1 | web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx |

## What Was Built

Created `my-sessions/index.tsx` — the primary caller-facing surface for phone banking. Callers see only sessions where they are assigned (via `useMyPhoneBankSessions` which fetches `?assigned_to_me=true`).

**Per-row action logic:**
- `session.status !== "active"` → "—" (no action)
- Active + not in `checkedInSessionIds` Set → Check In button (calls `useCheckIn.mutate`)
- Active + in `checkedInSessionIds` Set → Resume Calling link to `/sessions/$sessionId/call`
- (Checked Out state: handled server-side; v1 shows Check In for any active session not locally checked in)

**Check-in state:** `useState<Set<string>>` accumulates session IDs on successful check-in mutation. Resets on page refresh — acceptable for v1.

**RowAction** is a separate component so each row can call `useCheckIn` with its own `sessionId`. Per-row mutation isolation is the correct pattern.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx` exists
- [x] `useMyPhoneBankSessions` present in file
- [x] `useCheckIn` present in file
- [x] "Resume Calling" present in file
- [x] "Check In" present in file
- [x] `tsc --noEmit` exits 0
- [x] `vitest run` — 14 passed, 55 todo (all green)
- [x] Commit 1a490c1 exists
