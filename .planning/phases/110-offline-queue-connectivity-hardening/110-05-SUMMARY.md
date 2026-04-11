---
phase: 110-offline-queue-connectivity-hardening
plan: 05
subsystem: offline-queue
tags: [offline, sync, ui, connectivity, field-mode, accessibility]
requirements: [OFFLINE-02, OFFLINE-03, TEST-01, TEST-02]
dependency_graph:
  requires:
    - 110-04 (deadLetter / isSyncing / isSlow / lastSyncAt state + retryDeadLetter / discardDeadLetter actions)
  provides:
    - "ConnectivityPill — glanceable field-mode header indicator with 6 derived states"
    - "ConnectivitySheet — bottom-side shadcn Sheet exposing queue + dead-letter with Retry/Discard"
    - "FieldHeader onConnectivityClick prop — optional pill slot rendered between title and help button"
    - "formatRelative(ts) — compact 'just now / Ns / Nm ago / Nh ago / Nd ago' helper"
  affects:
    - "110-06 / 110-07 (future field-mode UX work — any new offline-queue surface should read from the pill derivation logic rather than re-rolling its own)"
tech_stack:
  added:
    - "shadcn Sheet side='bottom' mobile-first pattern for field-mode action panels"
    - "lucide RotateCcw + Trash2 icons for dead-letter Retry/Discard affordances"
  patterns:
    - "Pure deriveView() helper co-located with the component — isolates the urgency ladder from the JSX for straightforward unit testing"
    - "Overlay dot rendered conditionally on top of primary state rather than mutating the primary label — dead-letter warning is always visible but never clobbers connectivity context"
    - "OfflineBanner scope narrowed to critical (offline AND count > 0) once the pill handles glanceable surfacing — prevents double-surfacing sync state in the header AND banner"
key_files:
  created:
    - web/src/components/field/ConnectivityPill.tsx
    - web/src/components/field/ConnectivityPill.test.tsx
    - web/src/components/field/ConnectivitySheet.tsx
    - web/src/components/field/ConnectivitySheet.test.tsx
  modified:
    - web/src/components/field/FieldHeader.tsx
    - web/src/components/field/FieldHeader.test.tsx
    - web/src/components/field/OfflineBanner.tsx
    - web/src/components/field/OfflineBanner.test.tsx
    - web/src/routes/field/$campaignId.tsx
decisions:
  - "Sheet side='bottom' (not 'right') chosen for mobile-field parity — volunteers operate with one thumb on mobile, and the Sheet slides up from the bottom edge matching existing field-mode sheets"
  - "Pill is always a <button> (never conditionally readonly) so screen readers always describe it as actionable and keyboard users can always reach the Sheet"
  - "Dead-letter overlay is a second element layered on top of the primary state rather than a label mutation — keeps the primary connectivity context readable while still surfacing the warning"
  - "formatRelative kept inside ConnectivityPill.tsx and re-exported rather than in lib/utils — small enough that extra indirection isn't worth it, and the Sheet already imports from the pill module"
  - "OfflineBanner gate narrowed to (!isOnline && count > 0) — avoids a double-surface of syncing/pending state now that the pill carries those cases"
metrics:
  duration_minutes: 15
  completed_date: 2026-04-11
  tasks_completed: 3
  tests_added: 32
  tests_total_passing: 790
---

# Phase 110 Plan 05: ConnectivityPill + Sheet Summary

Ships a glanceable ConnectivityPill in the field-mode header plus a bottom-side ConnectivitySheet that exposes queue depth, last-sync relative time, and per-item dead-letter cards with Retry / Discard actions — making all of plan 110-04's state (items / deadLetter / isSyncing / isSlow / lastSyncAt) visible and actionable for volunteers.

## What Shipped

### ConnectivityPill (`web/src/components/field/ConnectivityPill.tsx`)

A 44×44 touch-target button rendered in the FieldHeader that shows one of six derived states via a priority ladder:

1. **Offline** — `WifiOff` + warning tone
2. **Syncing N** — `Loader2` with `animate-spin` + info tone
3. **Syncing N (slow)** — dim (`opacity-70`) variant when `isSlow` is true
4. **N pending** — warning tone when queue has items but sync isn't active
5. **Synced Nm ago** — `CheckCircle2` + success tone, driven by the new `formatRelative(ts)` helper
6. **Online** — `Wifi` + success tone (default)

A red `AlertCircle` overlay dot renders on top of the primary state whenever `deadLetter.length > 0`, so dead-letter warnings stay visible regardless of which connectivity state is active. Each state has a distinct `aria-label` for screen-reader users, and all tones resolve to `status-*-foreground` tokens (the AAA-contrast pairs defined in `index.css`).

### ConnectivitySheet (`web/src/components/field/ConnectivitySheet.tsx`)

A shadcn `Sheet` with `side="bottom"` (mobile-field parity) that opens when the pill is tapped. Structure:

- **Header** — Icon + `SheetTitle` + `SheetDescription` reflecting current connectivity state (Offline / Syncing / Waiting to sync / Online)
- **Queue summary** — "N outcomes pending" + "Last sync Xm ago" (or "No successful sync yet")
- **Dead letter** — Either an `EmptyState` with `CheckCircle2` "No failed syncs" or a list of `DeadLetterCard`s. Each card shows the error summary, machine-readable errorCode, "failed Nm ago" timestamp, and two buttons:
  - **Retry** — calls `retryDeadLetter(id)` and fires a success toast
  - **Discard** — opens a destructive `ConfirmDialog` that calls `discardDeadLetter(id)` on confirm

### FieldHeader pill slot

`FieldHeader` now accepts an optional `onConnectivityClick?: () => void` prop. When present, `ConnectivityPill` renders between the title and the help button, wired to invoke the callback. The field route at `/field/$campaignId` owns the sheet-open `useState` and passes both the click handler and the `<ConnectivitySheet>` element into the tree.

### OfflineBanner narrowed

With the pill carrying glanceable surfacing for online-syncing / online-pending / offline-idle, `OfflineBanner` is now scoped strictly to the **critical prolonged-offline case**: `!isOnline && items.length > 0`. It disappears entirely when online or when the queue is empty. Tests rewritten to assert the narrowed gate.

## Test Coverage

| File                             | Tests | Notes                                                      |
| -------------------------------- | ----- | ---------------------------------------------------------- |
| `ConnectivityPill.test.tsx`      | 10    | All 6 derived states + dead-letter overlay + a11y + onClick |
| `ConnectivitySheet.test.tsx`     | 7     | Queue summary, dead-letter rendering, Retry, Discard+confirm, shadcn primitive wiring, offline header |
| `FieldHeader.test.tsx`           | 15    | Existing 12 + 3 new for pill slot wiring                   |
| `OfflineBanner.test.tsx`         | 10    | Rewritten for narrowed scope                               |
| **Total for this plan**          | **42** |                                                          |
| **Full vitest suite after plan** | **790 passed, 21 todo, 6 skipped** | All green |

## Verification

- `cd web && npx tsc --noEmit` → clean (0 errors)
- `cd web && npx vitest run` → 790 passed / 21 todo / 6 skipped (88 files, 82 passing)
- `cd web && npx vitest run src/components/field/ConnectivityPill.test.tsx src/components/field/ConnectivitySheet.test.tsx src/components/field/FieldHeader.test.tsx src/components/field/OfflineBanner.test.tsx` → 42 passed

## Deviations from Plan

None — the plan executed exactly as written for tasks 1 and 2.

## Deferred Items

### Task 3 visual screenshots (Playwright MCP)

The plan's task 3 called for Playwright-MCP screenshots of desktop/mobile/offline/reconnect states against a running dev stack. This worktree does not have `docker compose` available (agent environment lacks container runtime), so the automated-screenshot leg of task 3 was deferred. Task 3's other verification gate (`tsc --noEmit` + full `vitest run`) was completed and is green — see above.

**Follow-up:** When a human or a subsequent agent picks this up on a machine with the full stack running, point Playwright MCP at `/field/{campaignId}/canvassing` on both desktop and mobile viewports, flip `context.setOffline(true)`, record 2 door-knock outcomes, open the pill sheet, screenshot, then toggle back online and observe the pill transition. Save under `screenshots/110-05/`. The component behavior is fully covered by the 42 unit tests above, so screenshots are cosmetic verification rather than a correctness gate.

## Commits

| Hash     | Message                                                         |
| -------- | --------------------------------------------------------------- |
| 0654df23 | feat(110-05): ConnectivityPill component (OFFLINE-02)           |
| 15a2638b | feat(110-05): ConnectivitySheet + FieldHeader pill slot (OFFLINE-02) |

## Success Criteria

- [x] ConnectivityPill renders all 6 derived states
- [x] ConnectivitySheet renders dead-letter with Retry/Discard
- [x] FieldHeader slots pill correctly
- [x] OfflineBanner scope narrowed to critical prolonged-offline
- [ ] Screenshots captured for desktop + mobile + offline state (deferred — see Deferred Items)
- [x] tsc + vitest clean

## Self-Check: PASSED

- FOUND: web/src/components/field/ConnectivityPill.tsx
- FOUND: web/src/components/field/ConnectivityPill.test.tsx
- FOUND: web/src/components/field/ConnectivitySheet.tsx
- FOUND: web/src/components/field/ConnectivitySheet.test.tsx
- FOUND: web/src/components/field/FieldHeader.tsx (modified)
- FOUND: web/src/components/field/FieldHeader.test.tsx (modified)
- FOUND: web/src/components/field/OfflineBanner.tsx (modified)
- FOUND: web/src/components/field/OfflineBanner.test.tsx (modified)
- FOUND: web/src/routes/field/$campaignId.tsx (modified)
- FOUND: commit 0654df23
- FOUND: commit 15a2638b
