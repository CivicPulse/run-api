---
phase: 34
slug: guided-onboarding-tour
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-16
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (unit) + Playwright 1.58.2 (e2e) |
| **Config file** | `web/vitest.config.ts` + `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run && npx playwright test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-00-01 | 00 | 1 | TOUR-02, TOUR-03, TOUR-06 | unit stubs | `cd web && npx vitest run src/stores/tourStore.test.ts src/hooks/useTour.test.ts` | W0 creates | ⬜ pending |
| 34-00-02 | 00 | 1 | TOUR-01, TOUR-04, TOUR-05 | e2e stubs | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | W0 creates | ⬜ pending |
| 34-01-01 | 01 | 2 | TOUR-03 | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | ✅ W0 | ⬜ pending |
| 34-01-02 | 01 | 2 | TOUR-02 | unit | `cd web && npx vitest run src/hooks/useTour.test.ts` | ✅ W0 | ⬜ pending |
| 34-02-01 | 02 | 2 | TOUR-05, TOUR-06 | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | ✅ W0 | ⬜ pending |
| 34-02-02 | 02 | 2 | TOUR-05 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ✅ W0 | ⬜ pending |
| 34-03-01 | 03 | 3 | TOUR-01, TOUR-04 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ✅ W0 | ⬜ pending |
| 34-03-02 | 03 | 3 | TOUR-05 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `cd web && npm install driver.js` — install driver.js library (Plan 34-00 Task 1)
- [x] `web/src/stores/tourStore.test.ts` — stubs for TOUR-03, TOUR-06 (Plan 34-00 Task 1)
- [x] `web/src/hooks/useTour.test.ts` — stubs for TOUR-02 (Plan 34-00 Task 1)
- [x] `web/e2e/tour-onboarding.spec.ts` — stubs for TOUR-01, TOUR-04, TOUR-05 (Plan 34-00 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tour visual appearance matches design system | TOUR-01 | CSS styling subjective | Verify popover uses app colors, fonts, border-radius |
| Tour animation smoothness | TOUR-01 | Performance/visual quality | Step through tour on mobile viewport, check transitions |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
