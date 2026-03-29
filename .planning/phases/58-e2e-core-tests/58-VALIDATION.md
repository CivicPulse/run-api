---
phase: 58
slug: e2e-core-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 (E2E) |
| **Config file** | `web/playwright.config.ts` |
| **Quick run command** | `cd web && npx playwright test --grep @smoke` |
| **Full suite command** | `cd web && npx playwright test tests/e2e/` |
| **Estimated runtime** | ~120 seconds (parallelized across 4 shards) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep @smoke`
- **After every plan wave:** Run `cd web && npx playwright test tests/e2e/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac-owner.spec.ts` | ❌ W0 | ⬜ pending |
| 58-01-02 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac-admin.spec.ts` | ❌ W0 | ⬜ pending |
| 58-01-03 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac-manager.spec.ts` | ❌ W0 | ⬜ pending |
| 58-01-04 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac-coordinator.spec.ts` | ❌ W0 | ⬜ pending |
| 58-01-05 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac-volunteer.spec.ts` | ❌ W0 | ⬜ pending |
| 58-02-01 | 02 | 1 | E2E-02, E2E-03 | e2e | `npx playwright test org-management.spec.ts` | ❌ W0 | ⬜ pending |
| 58-02-02 | 02 | 1 | E2E-03 | e2e | `npx playwright test campaign-settings.spec.ts` | ❌ W0 | ⬜ pending |
| 58-03-01 | 03 | 2 | E2E-07, E2E-08 | e2e | `npx playwright test voter-crud.spec.ts` | ❌ W0 | ⬜ pending |
| 58-03-02 | 03 | 2 | E2E-09 | e2e | `npx playwright test voter-contacts.spec.ts` | ❌ W0 | ⬜ pending |
| 58-03-03 | 03 | 2 | E2E-10 | e2e | `npx playwright test voter-tags.spec.ts` | ❌ W0 | ⬜ pending |
| 58-03-04 | 03 | 2 | E2E-11 | e2e | `npx playwright test voter-notes.spec.ts` | ❌ W0 | ⬜ pending |
| 58-03-05 | 03 | 2 | E2E-08 | e2e | `npx playwright test voter-lists.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] All 12 spec files created as stubs with `test.describe` blocks and `test.skip` placeholders
- [ ] `web/tests/e2e/fixtures/` — shared page object fixtures if needed
- [ ] Verify all 15 ZITADEL test users authenticate successfully

*Existing Playwright infrastructure covers framework and config requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual layout during canvassing | N/A | Phase 58 is pure E2E functional testing | N/A |

*All phase behaviors have automated verification via Playwright specs.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
