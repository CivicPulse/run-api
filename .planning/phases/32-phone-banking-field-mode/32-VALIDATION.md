---
phase: 32
slug: phone-banking-field-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (e2e) + Vitest (unit, if needed) |
| **Config file** | `web/playwright.config.ts` / `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx playwright test --grep "phone-banking"` |
| **Full suite command** | `cd web && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep "phone-banking"`
- **After every plan wave:** Run `cd web && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | PHONE-01 | e2e | `npx playwright test --grep "session start"` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | PHONE-02 | e2e | `npx playwright test --grep "phone dial"` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | PHONE-03 | e2e | `npx playwright test --grep "call outcome"` | ❌ W0 | ⬜ pending |
| 32-01-04 | 01 | 1 | PHONE-04 | e2e | `npx playwright test --grep "session progress"` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 1 | PHONE-05, PHONE-06, PHONE-07 | e2e | `npx playwright test --grep "phone format"` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 1 | A11Y-05 | e2e | `npx playwright test --grep "phone a11y"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phone-banking-field-mode.spec.ts` — e2e test stubs for PHONE-01 through PHONE-07, A11Y-05
- [ ] Reuse existing `web/e2e/helpers/` fixtures and auth utilities

*Existing Playwright infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native dialer opens on tap | PHONE-02 | `tel:` links require real mobile device | Tap phone number on mobile, verify dialer opens |
| Screen reader announces caller info | A11Y-05 | Requires assistive technology | Enable VoiceOver/TalkBack, navigate phone banking view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
