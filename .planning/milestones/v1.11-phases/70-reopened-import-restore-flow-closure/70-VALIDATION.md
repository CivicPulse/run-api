---
phase: 70
slug: reopened-import-restore-flow-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + TypeScript compiler |
| **Config file** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx tsc --noEmit` |
| **Full suite command** | `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx tsc --noEmit`
- **After every plan wave:** Run `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts`
- **Before `/gsd:verify-work`:** Full E2E suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Criterion | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | SC-1 | type check | `cd web && npx tsc --noEmit` | ✅ (compiler) | ⬜ pending |
| 70-01-02 | 01 | 1 | SC-2 | E2E | `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts` | Partial | ⬜ pending |
| 70-02-01 | 02 | 2 | SC-3 | E2E | `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts` | ❌ W0 | ⬜ pending |
| 70-02-02 | 02 | 2 | SC-4 | manual | N/A (audit doc update) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New E2E test case in `web/tests/routes/elections/l2-import-wizard.spec.ts` for reopen flow
- [ ] Extend mock setup for confirm + progress + completion in reopen flow

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Audit evidence retirement | SC-4 | Document update | Update v1.11-MILESTONE-AUDIT.md to reflect closed gap |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
