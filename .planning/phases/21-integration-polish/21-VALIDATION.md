---
phase: 21
slug: integration-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (e2e) |
| **Config file** | `web/vitest.config.ts` / `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx vitest run src/hooks/useDNC.test.ts --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/hooks/useDNC.test.ts --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | CALL-06 | unit | `cd web && npx vitest run src/hooks/useDNC.test.ts -x` | ✅ (needs update) | ⬜ pending |
| 21-01-02 | 01 | 1 | CALL-06 | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | PHON-05 | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts` | ❌ W0 | ⬜ pending |
| 21-01-04 | 01 | 1 | PHON-07 | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/useDNC.test.ts` — update existing import test for new `{ file, reason }` signature
- [ ] `web/e2e/phase21-integration-polish.spec.ts` — e2e stubs for CALL-06, PHON-05, PHON-07

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DNC reason column visual alignment | CALL-06 | Column layout/styling | Open DNC page, verify Reason column between Phone Number and Date Added |
| Call list name link navigation | PHON-05, PHON-07 | Link routing behavior | Click call list name in sessions, verify navigation to call list detail page |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
