---
phase: 37
slug: offline-sync-integration-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts src/hooks/useCanvassing.test.ts --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/hooks/useSyncEngine.test.ts src/hooks/useCanvassing.test.ts --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | SYNC-01 | unit | `cd web && npx vitest run src/hooks/useCanvassing.test.ts -x` | ❌ W0 | ⬜ pending |
| 37-01-02 | 01 | 1 | SYNC-01 | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts -t "does not revert" -x` | ❌ W0 | ⬜ pending |
| 37-01-03 | 01 | 1 | SYNC-04 | unit | `cd web && npx vitest run src/hooks/useSyncEngine.test.ts -t "field-me" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/useSyncEngine.test.ts` — add test for field-me invalidation after drain (SYNC-04)
- [ ] `web/src/hooks/useSyncEngine.test.ts` — add test verifying optimistic UI not reverted when hook-level onError absent (SYNC-01)
- [ ] `web/src/hooks/useCanvassing.test.ts` — create if needed for standalone useDoorKnockMutation hook tests (SYNC-01)

*Existing infrastructure in `useSyncEngine.test.ts` covers most needs; only 2-3 new test cases required*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline door-knock UX stays consistent | SYNC-01 | Visual verification of optimistic UI persistence | 1. Go offline, 2. Record canvassing outcome, 3. Verify door stays marked complete |
| Hub progress counter updates after sync | SYNC-04 | Visual verification of AssignmentCard counter refresh | 1. Complete canvass offline, 2. Reconnect, 3. Verify hub counters update without pull-to-refresh |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
