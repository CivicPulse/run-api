---
phase: 60
slug: e2e-field-mode-cross-cutting-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 |
| **Config file** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx playwright test --grep "@field\|@cross-cutting" --reporter=list` |
| **Full suite command** | `cd web && npx playwright test --reporter=html` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep "@field\|@cross-cutting" --reporter=list`
- **After every plan wave:** Run `cd web && npx playwright test --reporter=html`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | E2E-20 | e2e | `cd web && npx playwright test tests/e2e/field-mode.spec.ts` | ❌ W0 | ⬜ pending |
| 60-02-01 | 02 | 1 | E2E-21 | e2e | `cd web && npx playwright test tests/e2e/cross-cutting.spec.ts` | ❌ W0 | ⬜ pending |
| 60-03-01 | 03 | 2 | VAL-01 | e2e | `cd web && npx playwright test --reporter=html` | ✅ | ⬜ pending |
| 60-04-01 | 04 | 2 | VAL-02 | e2e | `cd web && npx playwright test --reporter=html` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/tests/e2e/field-mode.spec.ts` — field mode E2E spec (volunteer hub, canvassing wizard, phone banking, offline queue, onboarding tour)
- [ ] `web/tests/e2e/cross-cutting.spec.ts` — cross-cutting E2E spec (navigation, empty states, loading skeletons, error boundaries, form guards, toasts)

*Existing Playwright infrastructure covers framework needs. Wave 0 creates the new spec files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual rendering of loading skeletons | E2E-21 | Timing-dependent, may need route-delayed responses | Manually inspect skeleton rendering by throttling network in DevTools |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
