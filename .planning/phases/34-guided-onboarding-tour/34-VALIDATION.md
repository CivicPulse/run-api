---
phase: 34
slug: guided-onboarding-tour
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 34-01-01 | 01 | 0 | TOUR-03 | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 0 | TOUR-02 | unit | `cd web && npx vitest run src/hooks/useTour.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-03 | 01 | 0 | TOUR-01, TOUR-04, TOUR-05 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 1 | TOUR-01 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ❌ W0 | ⬜ pending |
| 34-02-02 | 02 | 1 | TOUR-02 | unit | `cd web && npx vitest run src/hooks/useTour.test.ts` | ❌ W0 | ⬜ pending |
| 34-02-03 | 02 | 1 | TOUR-03 | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | ❌ W0 | ⬜ pending |
| 34-02-04 | 02 | 2 | TOUR-04 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ❌ W0 | ⬜ pending |
| 34-02-05 | 02 | 2 | TOUR-05 | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ❌ W0 | ⬜ pending |
| 34-02-06 | 02 | 2 | TOUR-06 | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `cd web && npm install driver.js` — install driver.js library
- [ ] `web/src/stores/tourStore.test.ts` — stubs for TOUR-03, TOUR-06 (store logic)
- [ ] `web/src/hooks/useTour.test.ts` — stubs for TOUR-02 (segment selection)
- [ ] `web/e2e/tour-onboarding.spec.ts` — stubs for TOUR-01, TOUR-04, TOUR-05 (integration)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tour visual appearance matches design system | TOUR-01 | CSS styling subjective | Verify popover uses app colors, fonts, border-radius |
| Tour animation smoothness | TOUR-01 | Performance/visual quality | Step through tour on mobile viewport, check transitions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
