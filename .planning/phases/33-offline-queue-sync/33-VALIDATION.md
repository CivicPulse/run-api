---
phase: 33
slug: offline-queue-sync
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-16
audited: 2026-03-16
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + playwright |
| **Config file** | web/vitest.config.ts, web/playwright.config.ts |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --reporter=verbose && npx playwright test e2e/phase33-offline-sync.spec.ts --reporter=list` |
| **Estimated runtime** | ~15 seconds (unit) + ~30 seconds (e2e) |

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
| 33-01-01 | 01 | 1 | SYNC-01, SYNC-05 | unit | `cd web && npx vitest run src/stores/offlineQueueStore.test.ts src/hooks/useConnectivityStatus.test.ts` | :white_check_mark: | :white_check_mark: green |
| 33-01-02 | 01 | 1 | SYNC-03 | unit | `cd web && npx vitest run src/components/field/OfflineBanner.test.tsx` | :white_check_mark: | :white_check_mark: green |
| 33-02-01 | 02 | 2 | SYNC-01, SYNC-02, SYNC-04 | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts` | :white_check_mark: | :white_check_mark: green |
| 33-02-02 | 02 | 2 | SYNC-05 | e2e | `cd web && npx playwright test e2e/phase33-offline-sync.spec.ts --reporter=list` | :white_check_mark: | :white_check_mark: green |

*Status: :white_large_square: pending . :white_check_mark: green . :x: red . :warning: flaky*

---

## Wave 0 Requirements

- [x] `web/src/stores/offlineQueueStore.test.ts` — 10 tests for SYNC-01, SYNC-05 (queue push/pop, localStorage persistence)
- [x] `web/src/hooks/useConnectivityStatus.test.ts` — 4 tests for SYNC-05 (online/offline events)
- [x] `web/src/components/field/OfflineBanner.test.tsx` — 15 tests for SYNC-03 (banner show/hide, pending count, all 5 states)
- [x] `web/src/hooks/useSyncEngine.test.ts` — 21 tests for SYNC-02, SYNC-04 (FIFO drain, retry, discard on 409, auto-skip on conflict)

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-16

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 5 requirements (SYNC-01 through SYNC-05) have automated test coverage across 50 unit tests and 3 e2e tests. No auditor agent needed.
