---
phase: 38
slug: tech-debt-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (unit) + Playwright 1.58.2 (e2e) |
| **Config file** | `web/vitest.config.ts`, `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx vitest run src/stores/tourStore.test.ts src/hooks/useTour.test.ts` |
| **Full suite command** | `cd web && npx vitest run && npx playwright test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/stores/tourStore.test.ts src/hooks/useTour.test.ts`
- **After every plan wave:** Run `cd web && npx vitest run && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | Selector fix | e2e (existing) | `cd web && npx playwright test e2e/phase31-canvassing.spec.ts e2e/phase32-verify.spec.ts` | ✅ | ⬜ pending |
| 38-01-02 | 01 | 1 | useCallback deps | lint | `cd web && npx tsc --noEmit` | ✅ | ⬜ pending |
| 38-01-03 | 01 | 1 | Unused variable | lint | `cd web && npx tsc --noEmit` | ✅ | ⬜ pending |
| 38-02-01 | 02 | 1 | tourStore tests | unit | `cd web && npx vitest run src/stores/tourStore.test.ts` | ✅ (stubs) | ⬜ pending |
| 38-02-02 | 02 | 1 | useTour tests | unit | `cd web && npx vitest run src/hooks/useTour.test.ts` | ✅ (stubs) | ⬜ pending |
| 38-02-03 | 02 | 1 | tour e2e tests | e2e | `cd web && npx playwright test e2e/tour-onboarding.spec.ts` | ✅ (stubs) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. All test files exist with stubs. Vitest and Playwright are fully configured.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
