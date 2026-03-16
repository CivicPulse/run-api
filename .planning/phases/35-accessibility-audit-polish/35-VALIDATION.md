---
phase: 35
slug: accessibility-audit-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (e2e) + Vitest (unit) |
| **Config file** | `web/playwright.config.ts` / `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx playwright test --grep "a11y\|milestone\|touch-target"` |
| **Full suite command** | `cd web && npx playwright test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep "a11y\|milestone\|touch-target"`
- **After every plan wave:** Run `cd web && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | A11Y-01 | e2e | `npx playwright test --grep "aria-label\|landmark"` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | A11Y-02 | e2e | `npx playwright test --grep "touch-target"` | ❌ W0 | ⬜ pending |
| 35-01-03 | 01 | 1 | A11Y-03 | e2e | `npx playwright test --grep "contrast"` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | POLISH-01 | e2e | `npx playwright test --grep "milestone"` | ❌ W0 | ⬜ pending |
| 35-02-02 | 02 | 1 | POLISH-02 | e2e | `npx playwright test --grep "voter-context"` | ❌ W0 | ⬜ pending |
| 35-02-03 | 02 | 1 | POLISH-03 | e2e | `npx playwright test --grep "completion"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phase35-a11y-audit.spec.ts` — stubs for A11Y-01, A11Y-02, A11Y-03
- [ ] `web/e2e/phase35-milestone-toasts.spec.ts` — stubs for POLISH-01
- [ ] `web/e2e/phase35-voter-context.spec.ts` — stubs for POLISH-02, POLISH-03

*Existing Playwright infrastructure covers framework needs — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen reader navigation flow | A11Y-01 | Automated tests verify ARIA attributes exist but not screen reader UX | Navigate field mode with VoiceOver/NVDA, verify logical reading order |
| Color contrast visual check | A11Y-03 | Automated contrast ratio checks cover computed styles but not visual edge cases | Inspect propensity badges, outcome buttons with browser DevTools contrast checker |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
