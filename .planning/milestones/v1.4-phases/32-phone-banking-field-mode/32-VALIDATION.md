---
phase: 32
slug: phone-banking-field-mode
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (e2e) + Vitest (unit) |
| **Config file** | `web/playwright.config.ts` / `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx playwright test e2e/phase32-verify.spec.ts` |
| **Full suite command** | `cd web && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test e2e/phase32-verify.spec.ts`
- **After every plan wave:** Run `cd web && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-T1 | 01 | 1 | PHONE-07 | unit + tsc | `npx tsc --noEmit && npx vitest run src/types/calling.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-T2 | 01 | 1 | (store infra) | unit | `npx vitest run src/stores/callingStore.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-T1 | 02 | 2 | PHONE-01..07, A11Y-05 | tsc | `npx tsc --noEmit` | N/A | ⬜ pending |
| 32-02-T2 | 02 | 2 | PHONE-01..07, A11Y-05 | tsc | `npx tsc --noEmit` | N/A | ⬜ pending |
| 32-03-T1 | 03 | 3 | PHONE-07 | unit | `npx vitest run src/types/calling.test.ts src/stores/callingStore.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-T2 | 03 | 3 | PHONE-01..06, A11Y-05 | e2e | `npx playwright test e2e/phase32-verify.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phase32-verify.spec.ts` — e2e test stubs for PHONE-01 through PHONE-06, A11Y-05
- [ ] `web/src/types/calling.test.ts` — Vitest unit tests for phone formatting (PHONE-07)
- [ ] `web/src/stores/callingStore.test.ts` — Vitest unit tests for calling store logic
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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
