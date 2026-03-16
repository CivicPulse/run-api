---
phase: 35
slug: accessibility-audit-polish
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-16
nyquist_filled: 2026-03-16
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
| 35-01-01 | 01 | 1 | A11Y-01 | e2e | `cd web && npx playwright test e2e/phase35-a11y-audit.spec.ts` | ✅ | ✅ green |
| 35-01-02 | 01 | 1 | A11Y-02 | e2e | `cd web && npx playwright test e2e/phase35-touch-targets.spec.ts` | ✅ | ✅ green |
| 35-01-03 | 01 | 1 | A11Y-03 | e2e | `cd web && npx playwright test e2e/phase35-a11y-audit.spec.ts` | ✅ | ✅ green |
| 35-02-01 | 02 | 1 | POLISH-01 | e2e | `cd web && npx playwright test e2e/phase35-milestone-toasts.spec.ts` | ✅ | ✅ green |
| 35-02-02 | 02 | 1 | POLISH-02 | e2e | `cd web && npx playwright test e2e/phase35-voter-context.spec.ts` | ✅ | ✅ green |
| 35-02-03 | 02 | 1 | POLISH-03 | e2e | `cd web && npx playwright test e2e/phase35-voter-context.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/e2e/phase35-a11y-audit.spec.ts` — A11Y-01 (ARIA landmarks, voter name labels), A11Y-03 (contrast classes)
- [x] `web/e2e/phase35-milestone-toasts.spec.ts` — POLISH-01 (milestone toasts, sessionStorage dedup, auto-dismiss)
- [x] `web/e2e/phase35-voter-context.spec.ts` — POLISH-02 (VoterCard/CallingVoterCard fields), POLISH-03 (CanvassingCompletionSummary)

*Existing Playwright infrastructure covers framework needs — only test files needed.*

---

## Nyquist Notes

**POLISH-01 toast behavior clarification:** `checkMilestone` fires thresholds sequentially (one per call, lowest-first). At 100% completion with no prior milestones, the first call fires the 25% toast. Subsequent `checkMilestone` calls fire 50%, 75%, 100% in order. Tests verify this correct implementation behavior. The `sessionStorage` key is populated immediately on first threshold fire.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen reader navigation flow | A11Y-01 | Automated tests verify ARIA attributes exist but not screen reader UX | Navigate field mode with VoiceOver/NVDA, verify logical reading order |
| Color contrast visual check | A11Y-03 | Automated contrast ratio checks cover computed styles but not visual edge cases | Inspect propensity badges, outcome buttons with browser DevTools contrast checker |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** green — all gaps filled by Nyquist audit 2026-03-16

---

## Validation Audit 2026-03-16

| Metric | Count |
|--------|-------|
| Gaps found | 5 |
| Resolved | 5 |
| Escalated | 0 |
