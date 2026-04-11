---
phase: 110-offline-queue-connectivity-hardening
plan: 01
subsystem: offline-queue
tags: [offline, audit, idempotency, sync, connectivity]
requirements: [OFFLINE-01, OFFLINE-02, OFFLINE-03]
dependency_graph:
  requires: []
  provides:
    - ".planning/phases/110-offline-queue-connectivity-hardening/110-OFFLINE-AUDIT.md"
  affects:
    - "110-02 scope (client_uuid end-to-end)"
    - "110-03 scope (persist versioning, quota)"
    - "110-04 scope (backoff, dead-letter, lastSyncAt ownership)"
    - "110-05 scope (ConnectivityPill + Sheet, OfflineBanner demotion)"
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/phases/110-offline-queue-connectivity-hardening/110-OFFLINE-AUDIT.md
  modified: []
decisions:
  - "Call-record offline enqueue deferred out of phase 110 unless 110-02 adopts as stretch — replay machinery is already wired; only useCallingSession.submitCall needs a TypeError catch branch"
  - "110-04 should own lastSyncAt store field (write-site), not 110-05 — avoids cross-plan race"
  - "OfflineBanner should be demoted (kept only for prolonged-offline / dead-letter alert), not retired — 110-05 decides final disposition"
  - "Persist schema version: 1 must seed in 110-03 even before a migration is needed, to unblock future evolution"
metrics:
  duration: "~25 min"
  completed_date: 2026-04-11
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 110 Plan 01: Offline Infrastructure Audit Summary

**One-liner:** Catalogued the existing offline queue / connectivity / OfflineBanner stack with file:line evidence and mapped every gap to OFFLINE-01/02/03 and downstream plans 110-02..110-05.

## What shipped

- `.planning/phases/110-offline-queue-connectivity-hardening/110-OFFLINE-AUDIT.md` (261 lines, 8 sections + appendix)
  - §1 Queue Persistence Inventory (9 concerns)
  - §2 Idempotency Inventory (10 layers, with inlined grep evidence)
  - §3 Retry & Backoff Inventory (10 concerns)
  - §4 Connectivity Indicator Inventory (9 elements)
  - §5 Enqueue Integration Points (exhaustive grep of production call sites)
  - §6 Gaps per Requirement (OFFLINE-01: 11 items, OFFLINE-02: 7 items, OFFLINE-03: 7 items)
  - §7 Findings Summary (5 critical findings + 1 deferred)
  - §8 Downstream Plan Scoping (per-plan ownership table + wave DAG + scope revision suggestions)
  - Appendix: raw grep outputs for reproducibility

## Critical findings (from §7)

1. **The queue is well-plumbed but completely un-idempotent.** `crypto.randomUUID()` is generated at enqueue but only used as the in-memory queue key. Server never sees it. This is the critical-path gap for OFFLINE-01 and the entire substance of plan 110-02.

2. **Error classification is a single catch branch.** Only HTTP 409 is recognized in `drainQueue`. Everything else — network drops, 5xx, 4xx validation, auth — burns retries until `MAX_RETRY` and then silently evaporates via sonner toast. `isNetworkError` helper exists but is never called from `drainQueue`. 110-04 needs to split this into four lanes.

3. **No dead-letter surface exists.** After three failures items are `remove()`d permanently. A volunteer in the field literally cannot recover a lost outcome. Plans 110-03 + 110-04 + 110-05 together must introduce a dead-letter store, UI surface, and Retry/Discard actions.

4. **Persistence is unversioned.** zustand `persist` with no `version`/`migrate` config means any future `QueueItem` shape change will crash rehydration on installed PWAs. 110-03 must seed `version: 1` even before a migration is needed.

5. **The connectivity indicator is a non-interactive full-width strip.** Cannot be glanced at (pushes content down) and cannot be tapped (no affordance). 110-05 is essentially greenfield for `ConnectivityPill` + `Sheet`.

**Bonus (deferred):** `useCallingSession.submitCall` has no offline fallback. The `call_record` type exists in the queue union and in `replayMutation` — only the enqueue hook is missing. Recommend deferring to a future phase unless 110-02 owner takes it as stretch scope.

## Scope revisions suggested for downstream plans

- **110-02** — Confirmed correct scope. Plan already calls out stamping `client_uuid` on the online path (Task 2 step 4) which the audit independently validated as required. No change.
- **110-03** — Must seed `persist({ version: 1, migrate })` config even with an empty migration, otherwise 110-04's additions will crash rehydration on installed clients. Also should own QuotaExceededError handling (moved from OFFLINE-03 bucket into 110-03 persistence scope).
- **110-04** — Should own `lastSyncAt` write-site in the store, not 110-05. 110-05 only reads it. Prevents cross-plan race where 110-05 renders "Last sync" but 110-04 hasn't added the write-site yet.
- **110-05** — Decide whether to retire `OfflineBanner` fully or keep as a thin prolonged-offline alert. Audit recommends **keeping as demoted alert** (>60 s offline OR dead-letter count > 0) per 110-CONTEXT.md §specifics.
- **Call-record offline fallback** — Deferred. Log as deferred item in phase; pick up in a future milestone.

## Deviations from plan

None. Plan executed exactly as written: both tasks (author audit doc + commit) completed atomically.

## Dependency graph impact on waves

```
110-02 (client_uuid end-to-end) ──┐
                                   ├──> 110-04 (needs stable client_uuid across retries)
110-03 (persist versioning)    ───┘
                                               │
                                               └──> 110-05 (reads store state)
```

110-02 and 110-03 are independent and can run in parallel. 110-04 depends on both. 110-05 depends on 110-04 (reads `lastSyncAt`, `deadLetter`, `nextAttemptAt` from store).

## Commits

- `5720c73a` docs(110-01): offline infrastructure audit — gap analysis for OFFLINE-01/02/03

## Self-Check: PASSED

- FOUND: .planning/phases/110-offline-queue-connectivity-hardening/110-OFFLINE-AUDIT.md
- FOUND commit: 5720c73a
- Audit file contains required §6 Gaps per Requirement section with OFFLINE-01/02/03 tags — verified via grep at task close
