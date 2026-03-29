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
| **Full suite command** | `cd web && npx playwright test web/e2e/` |
| **Estimated runtime** | ~120 seconds (parallelized across 4 shards) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep @smoke`
- **After every plan wave:** Run `cd web && npx playwright test web/e2e/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac.viewer.spec.ts` | self-creating | ⬜ pending |
| 58-01-02 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac.volunteer.spec.ts` | self-creating | ⬜ pending |
| 58-01-03 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac.manager.spec.ts` | self-creating | ⬜ pending |
| 58-01-04 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac.admin.spec.ts` | self-creating | ⬜ pending |
| 58-01-05 | 01 | 1 | E2E-01 | e2e | `npx playwright test rbac.spec.ts` | self-creating | ⬜ pending |
| 58-02-01 | 02 | 1 | E2E-02 | e2e | `npx playwright test org-management.spec.ts` | self-creating | ⬜ pending |
| 58-02-02 | 02 | 1 | E2E-03 | e2e | `npx playwright test campaign-settings.spec.ts` | self-creating | ⬜ pending |
| 58-03-01 | 03 | 1 | E2E-07 | e2e | `npx playwright test voter-crud.spec.ts` | self-creating | ⬜ pending |
| 58-03-02 | 03 | 1 | E2E-08 | e2e | `npx playwright test voter-contacts.spec.ts` | self-creating | ⬜ pending |
| 58-04-01 | 04 | 1 | E2E-09 | e2e | `npx playwright test voter-tags.spec.ts` | self-creating | ⬜ pending |
| 58-04-02 | 04 | 1 | E2E-10 | e2e | `npx playwright test voter-notes.spec.ts` | self-creating | ⬜ pending |
| 58-04-03 | 04 | 1 | E2E-11 | e2e | `npx playwright test voter-lists.spec.ts` | self-creating | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No Wave 0 needed — each task creates its own spec file from scratch. Existing Playwright infrastructure covers framework and config requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification via Playwright specs.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
