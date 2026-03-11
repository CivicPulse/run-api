---
phase: 16-phone-banking
plan: "04"
subsystem: frontend
tags: [phone-banking, session-detail, ui, tanstack-router]
dependency_graph:
  requires:
    - 16-01  # hooks and types
    - 16-02  # session mutations and callers hooks
    - 16-03  # sessions index page
  provides:
    - session detail page with Overview and Progress tabs
  affects:
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx
tech_stack:
  added: []
  patterns:
    - RequireRole gate (hides entirely, no disabled state)
    - STATUS_ACTIONS map for status transitions
    - Local checkedIn state initialized false, set true on successful check-in
    - IIFE used for completionPct inside JSX to avoid hoisting
    - Reassign info dialog (v1 limitation: entry IDs not in progress endpoint)
key_files:
  created:
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx
  modified: []
decisions:
  - "useReassignEntry imported and called at ProgressTab level even though v1 shows info dialog — keeps hook active for future full implementation"
  - "checkedIn local state (useState false) tracks check-in within session; not derived from callers list to avoid dependency on current user ID"
  - "IIFE pattern for completionPct computation inline in JSX avoids extra variable declarations outside return"
  - "AddCallerDialog uses plain text Input for user ID (not member picker) — avoids campaign members endpoint complexity per plan note"
  - "ReassignInfoDialog shown instead of mutation invocation — progress endpoint lacks per-entry IDs needed for useReassignEntry"
metrics:
  duration: 104 sec
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 16 Plan 04: Session Detail Page Summary

Session detail page (two-tab layout) for phone banking: Overview handles session metadata, status transitions, caller management, and check-in/check-out; Progress handles the polling dashboard with stat chips, per-caller table, and manager-only reassign actions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Session detail page — Overview tab (metadata, status transitions, caller management, check-in) | 6c52df7 | web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx |
| 2 | Progress tab — polling dashboard with stat chips, progress bar, per-caller table, reassign kebab | 6c52df7 | (same file — both tasks in single file) |

## What Was Built

A single-file session detail page at `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx` containing:

**OverviewTab:**
- Session metadata grid (name, status badge, call list ID, caller count, scheduled start/end)
- Status transition buttons from `STATUS_ACTIONS` map, gated behind `RequireRole minimum="manager"`
- Caller management table with Add Caller dialog (user ID text input) and Remove Caller kebab, gated behind `RequireRole minimum="manager"`
- Check In / Start Calling / Check Out actions gated behind `RequireRole minimum="volunteer"`, visible only when session is active

**ProgressTab:**
- Progress bar with completion percentage
- 4 stat chips: Total, Completed, In Progress, Available
- Per-caller table with Checked In/Out times and status
- Reassign kebab that opens info dialog (v1 limitation: entry IDs not available from progress endpoint)
- All content gated behind `RequireRole minimum="manager"` with fallback message

**Supporting components (inline):**
- `StatChip` — labeled number chip
- `AddCallerDialog` — text input dialog for ZITADEL user ID
- `ReassignInfoDialog` — instructional dialog explaining v1 reassign limitation

## Deviations from Plan

None — plan executed exactly as written. The v1 Reassign limitation was pre-documented in the plan (noted in Task 2 action block).

## Verification

- `ls sessions/$sessionId/index.tsx` — file exists (650 lines)
- All required symbols present: `Tabs`, `OverviewTab`, `ProgressTab`, `useSessionProgress`, `useCheckIn`, `STATUS_ACTIONS`
- `tsc --noEmit` — exits 0 (clean)
- `vitest run` — 110 passed, 55 todo stubs, 0 failures

## Self-Check: PASSED

- [x] File exists: `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx`
- [x] Commit exists: `6c52df7` (feat(16-04): add session detail page with Overview and Progress tabs)
- [x] TypeScript clean
- [x] Vitest passing
