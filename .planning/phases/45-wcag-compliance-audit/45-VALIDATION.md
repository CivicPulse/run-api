---
phase: 45
slug: wcag-compliance-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | @playwright/test ^1.58.2 |
| **Config file** | web/playwright.config.ts |
| **Quick run command** | `cd web && npx playwright test --grep "a11y" --reporter=list` |
| **Full suite command** | `cd web && npx playwright test --reporter=list` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep "a11y" -x --reporter=list`
- **After every plan wave:** Run `cd web && npx playwright test --reporter=list`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | A11Y-01 | e2e | `cd web && npx playwright test e2e/a11y-scan.spec.ts -x` | ❌ W0 | ⬜ pending |
| 45-02-01 | 02 | 1 | A11Y-03 | e2e | `cd web && npx playwright test --grep "a11y" -x` | ❌ W0 | ⬜ pending |
| 45-03-01 | 03 | 2 | A11Y-02 | e2e | `cd web && npx playwright test e2e/a11y-voter-search.spec.ts -x` | ❌ W0 | ⬜ pending |
| 45-03-02 | 03 | 2 | A11Y-02 | e2e | `cd web && npx playwright test e2e/a11y-voter-import.spec.ts -x` | ❌ W0 | ⬜ pending |
| 45-03-03 | 03 | 2 | A11Y-02 | e2e | `cd web && npx playwright test e2e/a11y-walk-list.spec.ts -x` | ❌ W0 | ⬜ pending |
| 45-03-04 | 03 | 2 | A11Y-02 | e2e | `cd web && npx playwright test e2e/a11y-phone-bank.spec.ts -x` | ❌ W0 | ⬜ pending |
| 45-03-05 | 03 | 2 | A11Y-02 | e2e | `cd web && npx playwright test e2e/a11y-campaign-settings.spec.ts -x` | ❌ W0 | ⬜ pending |
| 45-04-01 | 04 | 2 | A11Y-04 | e2e | `cd web && npx playwright test e2e/a11y-walk-list.spec.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `@axe-core/playwright` — `cd web && npm install -D @axe-core/playwright`
- [ ] `web/e2e/axe-test.ts` — shared AxeBuilder fixture with WCAG 2.1 AA tags
- [ ] `web/e2e/a11y-scan.spec.ts` — parameterized route scan stubs for A11Y-01
- [ ] `web/e2e/a11y-voter-search.spec.ts` — voter search flow stubs for A11Y-02
- [ ] `web/e2e/a11y-voter-import.spec.ts` — voter import flow stubs for A11Y-02
- [ ] `web/e2e/a11y-walk-list.spec.ts` — walk list creation flow stubs for A11Y-02, A11Y-04
- [ ] `web/e2e/a11y-phone-bank.spec.ts` — phone bank session flow stubs for A11Y-02
- [ ] `web/e2e/a11y-campaign-settings.spec.ts` — campaign settings flow stubs for A11Y-02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|

*All phase behaviors have automated verification via Playwright accessibility tree snapshots and axe-core scanning.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
