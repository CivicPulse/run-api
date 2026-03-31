---
phase: 64
slug: field-flow-test-isolation
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-31
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright E2E |
| **Config file** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-07"` |
| **Full suite command** | `cd web && ./scripts/run-e2e.sh --strict-phase64-field07-order` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-07"`
- **After every plan wave:** Run `cd web && ./scripts/run-e2e.sh --strict-phase64-field07-order`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | E2E-20 | e2e-targeted | `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-07"` | ✅ | ⬜ pending |
| 64-01-02 | 01 | 1 | E2E-20 | e2e-targeted | `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-07"` | ✅ | ⬜ pending |
| 64-02-01 | 02 | 2 | E2E-20 | e2e-matrix | `cd web && ./scripts/run-e2e.sh --strict-phase64-field07-order` | ✅ | ⬜ pending |
| 64-02-02 | 02 | 2 | E2E-20 | e2e-targeted | `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-03|FIELD-04|FIELD-05|FIELD-06|FIELD-07|FIELD-08|FIELD-09|FIELD-10"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
