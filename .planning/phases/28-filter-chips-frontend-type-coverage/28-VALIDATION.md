---
phase: 28
slug: filter-chips-frontend-type-coverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + happy-dom 20.8.3 (unit), Playwright (e2e) |
| **Config file** | `web/vitest.config.ts`, `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx vitest run src/lib/filterChipUtils.test.ts` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds (unit), ~60 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/lib/filterChipUtils.test.ts`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + E2E green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | FRNT-02-a | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "propensity"` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | FRNT-02-b | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "truncat"` | ❌ W0 | ⬜ pending |
| 28-01-03 | 01 | 1 | FRNT-02-c | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "mailing"` | ❌ W0 | ⬜ pending |
| 28-01-04 | 01 | 1 | FRNT-02-d | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "category"` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 2 | FRNT-02-e | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "propensity"` | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 2 | FRNT-02-f | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "multi-select"` | ❌ W0 | ⬜ pending |
| 28-02-03 | 02 | 2 | FRNT-02-g | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "mailing"` | ❌ W0 | ⬜ pending |
| 28-02-04 | 02 | 2 | FRNT-02-h | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "clear"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/lib/filterChipUtils.ts` — shared utility (new file)
- [ ] `web/src/lib/filterChipUtils.test.ts` — unit tests covering propensity, truncation, mailing, categories (~8-10 test cases)
- [ ] `web/e2e/filter-chips.spec.ts` — E2E tests (4 scenarios: propensity dismiss, multi-select dismiss, mailing dismiss, clear all)

*Existing infrastructure (Vitest, Playwright) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Category color rendering | FRNT-02 | Visual color verification | Inspect chip row with 5+ active filters; verify color grouping matches category spec |
| Tooltip hover display | FRNT-02 | Hover interaction visual check | Apply 5-value ethnicity filter; hover truncated chip; verify tooltip shows full list |
| Dark mode color variants | FRNT-02 | No dark mode toggle currently | Verify dark: classes exist in markup (code review) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
