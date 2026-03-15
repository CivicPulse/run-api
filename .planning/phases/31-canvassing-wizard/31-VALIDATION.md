---
phase: 31
slug: canvassing-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58 (e2e) + Vitest 4.0 (unit) |
| **Config file** | `web/playwright.config.ts` + `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx playwright test e2e/phase31-canvassing.spec.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | CANV-01 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "voter context"` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | CANV-06 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "household"` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 2 | CANV-02 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "outcome"` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 2 | CANV-03 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "advance"` | ❌ W0 | ⬜ pending |
| 31-02-03 | 02 | 2 | CANV-04 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "progress"` | ❌ W0 | ⬜ pending |
| 31-03-01 | 03 | 3 | CANV-05 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "survey"` | ❌ W0 | ⬜ pending |
| 31-03-02 | 03 | 3 | CANV-07 | unit | `cd web && npx vitest run src/stores/canvassingStore.test.ts` | ❌ W0 | ⬜ pending |
| 31-03-03 | 03 | 3 | CANV-08 | e2e | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts --grep "resume"` | ❌ W0 | ⬜ pending |
| 31-03-04 | 03 | 3 | A11Y-04 | unit | `cd web && npx vitest run --grep "aria live"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phase31-canvassing.spec.ts` — e2e test stubs for CANV-01 through CANV-08, A11Y-04
- [ ] `web/src/stores/canvassingStore.test.ts` — unit tests for persist store logic (CANV-07)
- [ ] Household grouping unit test — covers null key edge case, single voter, multi-voter

*Existing infrastructure (Playwright + Vitest) is already installed and configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mobile touch target sizing feels correct outdoors | A11Y-04 | Physical ergonomics require real device | Open on phone, tap outcome buttons with gloves/wet hands |
| Bottom sheet animation feels smooth on low-end device | CANV-05 | Performance varies by device | Open survey panel on budget Android phone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
