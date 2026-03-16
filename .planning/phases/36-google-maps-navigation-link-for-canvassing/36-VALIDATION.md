---
phase: 36
slug: google-maps-navigation-link-for-canvassing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright |
| **Config file** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` |
| **Full suite command** | `cd web && npx playwright test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x`
- **After every plan wave:** Run `cd web && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | P36-01 | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | P36-02 | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | P36-03 | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | ❌ W0 | ⬜ pending |
| 36-02-02 | 02 | 1 | P36-04 | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 2 | P36-05 | e2e | `cd web && npx playwright test e2e/phase36-navigate.spec.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phase36-navigate.spec.ts` — stubs for P36-01 through P36-05
- [ ] Uses `page.route()` API mocking (established pattern from phases 32, 33, 35)

*Existing Playwright infrastructure covers framework and config needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google Maps opens in native app on mobile | P36-02 | Requires physical device with Google Maps installed | Tap Navigate button on mobile device, verify Google Maps app opens with walking directions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
