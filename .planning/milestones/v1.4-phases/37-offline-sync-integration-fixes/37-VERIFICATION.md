---
phase: 37-offline-sync-integration-fixes
verified: 2026-03-16T23:16:00Z
status: passed
score: 2/2 must-haves verified
re_verification: false
---

# Phase 37: Offline Sync Integration Fixes — Verification Report

**Phase Goal:** Fix offline sync integration defects so optimistic UI stays consistent and hub progress updates after sync
**Verified:** 2026-03-16T23:16:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                       | Status     | Evidence                                                                                                          |
|----|---------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------|
| 1  | Recording a canvassing outcome while offline does not revert the optimistic UI              | VERIFIED   | Hook-level `onError` removed from `useDoorKnockMutation`; call-site `onError` in `useCanvassingWizard` queues offline instead of reverting |
| 2  | After offline queue drains, hub AssignmentCard progress counters update automatically       | VERIFIED   | `drainQueue` iterates `syncedCampaignIds` and calls `invalidateQueries({ queryKey: ["field-me", campaignId] })` after sync |

**Score:** 2/2 truths verified

---

### Required Artifacts

| Artifact                                       | Expected                                        | Status     | Details                                                                                  |
|------------------------------------------------|-------------------------------------------------|------------|------------------------------------------------------------------------------------------|
| `web/src/hooks/useCanvassing.ts`               | `useDoorKnockMutation` without hook-level onError | VERIFIED   | File exists, substantive (49 lines). `onError` present only as comment (line 30) and in `useSkipEntryMutation` (line 46). `revertOutcome` fully absent. |
| `web/src/hooks/useSyncEngine.ts`               | `drainQueue` with field-me query invalidation   | VERIFIED   | File exists, substantive (197 lines). Contains `queryKey: ["field-me", campaignId]` at lines 121-123 inside `drainQueue` post-sync block. |
| `web/src/hooks/useSyncEngine.test.ts`          | Tests for field-me invalidation and no-revert   | VERIFIED   | File exists, substantive (529 lines). Contains 3 new tests: "after drain with items synced, invalidateQueries is called for field-me" (line 378), "after drain with items from multiple campaigns, invalidates field-me for each" (line 393), "after drain with call_record items, invalidates field-me for campaign" (line 417). All pass (24/24 green). |

---

### Key Link Verification

| From                                          | To                              | Via                                              | Status     | Details                                                                                                       |
|-----------------------------------------------|---------------------------------|--------------------------------------------------|------------|---------------------------------------------------------------------------------------------------------------|
| `web/src/hooks/useCanvassingWizard.ts`        | `web/src/hooks/useCanvassing.ts` | call-site `onError` on `doorKnockMutation.mutate` | WIRED      | Lines 105-122 (`handleOutcome`) and 196-210 (`handleBulkNotHome`) both call `doorKnockMutation.mutate(payload, { onError: ... })` with offline-queue-aware logic |
| `web/src/hooks/useSyncEngine.ts`              | TanStack Query cache            | `invalidateQueries` for field-me after drain      | WIRED      | Lines 117-124: comment + for-loop over `syncedCampaignIds` calling `queryClient.invalidateQueries({ queryKey: ["field-me", campaignId] })` before `await Promise.all(invalidationPromises)` |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                               | Status    | Evidence                                                                                       |
|-------------|-------------|---------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------|
| SYNC-01     | 37-01-PLAN  | Volunteer can record door-knock outcomes while offline; they queue locally | SATISFIED | Hook-level `onError` removed from `useDoorKnockMutation`; `useCanvassingWizard` call-site `onError` queues to `useOfflineQueueStore` on `TypeError` instead of reverting. Optimistic state in `canvassingStore` is preserved. |
| SYNC-04     | 37-01-PLAN  | Volunteer receives updated walk list status when connectivity resumes      | SATISFIED | `drainQueue` now invalidates `["field-me", campaignId]` for every synced campaign after queue drain, triggering hub `AssignmentCard` re-fetch automatically. |

No orphaned requirements found — REQUIREMENTS.md marks both SYNC-01 and SYNC-04 as Complete for Phase 37.

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, empty implementations, or stub returns found in any modified file.

---

### Human Verification Required

#### 1. Offline canvassing optimistic UI persistence

**Test:** Go offline in browser DevTools (Network tab → Offline). Navigate to an active canvass walk list. Record a door-knock outcome. Observe the door card.
**Expected:** The door card shows the recorded outcome (e.g., "Supporter") and does not revert to "Pending" or "Incomplete" after the failed network call.
**Why human:** Visual verification of Zustand store state rendered in the UI. Cannot confirm UI rendering behavior with unit tests alone.

#### 2. Hub progress counters update after reconnect

**Test:** Record several canvassing outcomes while offline. Return to the field hub (`/campaigns/:id`). Reconnect (DevTools Network → Online). Observe `AssignmentCard` progress counters without manually refreshing.
**Expected:** Progress counters (e.g., "5/20 doors") update automatically within ~2 seconds of reconnecting, reflecting the newly synced outcomes.
**Why human:** Verifies TanStack Query cache invalidation triggers a live re-render of the hub. Cannot simulate the full hook lifecycle (`useSyncEngine` online transition + `drainQueue` + `invalidateQueries` + re-render) in unit tests.

---

### Gaps Summary

No gaps. All artifacts verified at all three levels (exists, substantive, wired). Both requirements SYNC-01 and SYNC-04 are satisfied. All 24 unit tests pass. Two items remain for human visual/integration verification as noted above.

---

### Commit Verification

Both task commits exist and are valid:

- `8f7d95d` — `test(37-01): add failing tests for field-me query invalidation` (TDD RED phase)
- `3f62f15` — `fix(37-01): remove hook-level onError and add field-me query invalidation` (TDD GREEN phase)

---

_Verified: 2026-03-16T23:16:00Z_
_Verifier: Claude (gsd-verifier)_
