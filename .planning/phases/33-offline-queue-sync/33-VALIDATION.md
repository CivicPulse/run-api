---
phase: 33
slug: offline-queue-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | SYNC-01, SYNC-05 | unit | `cd web && npx vitest run src/stores/offlineQueueStore.test.ts src/hooks/useConnectivityStatus.test.ts` | :x: W0 | :white_large_square: pending |
| 33-01-02 | 01 | 1 | SYNC-03 | unit | `cd web && npx vitest run src/components/field/OfflineBanner.test.tsx` | :x: W0 | :white_large_square: pending |
| 33-02-01 | 02 | 2 | SYNC-01, SYNC-02, SYNC-04 | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts` | :x: W0 | :white_large_square: pending |
| 33-02-02 | 02 | 2 | SYNC-05 | e2e | `cd web && npx playwright test e2e/phase33-offline-sync.spec.ts --reporter=list` | :x: W0 | :white_large_square: pending |

*Status: :white_large_square: pending . :white_check_mark: green . :x: red . :warning: flaky*

---

## Wave 0 Requirements

- [ ] `web/src/stores/offlineQueueStore.test.ts` — stubs for SYNC-01, SYNC-05 (queue push/pop, localStorage persistence)
- [ ] `web/src/hooks/useConnectivityStatus.test.ts` — stubs for SYNC-05 (online/offline events)
- [ ] `web/src/components/field/OfflineBanner.test.tsx` — stubs for SYNC-03 (banner show/hide, pending count)
- [ ] `web/src/hooks/useSyncEngine.test.ts` — stubs for SYNC-02, SYNC-04 (FIFO drain, retry, discard on 409, auto-skip on conflict)

*Existing vitest infrastructure covers framework install — no new framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline indicator appears when browser goes offline | SYNC-03 | Requires actual network state change | DevTools -> Network -> Offline toggle, verify banner appears |
| Queued outcomes sync when network returns | SYNC-02 | Requires actual network state change | Record outcomes while offline, re-enable network, verify sync toast |
| Walk list refreshes with other volunteers' changes | SYNC-04 | Requires multi-user scenario | Have another session complete entries, go offline/online, verify toast and updated counts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
