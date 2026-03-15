---
phase: 29
slug: integration-polish-tech-debt-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E), Vitest (unit) |
| **Config file** | `web/playwright.config.ts`, `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx tsc --noEmit` |
| **Full suite command** | `cd web && npm run test:e2e` |
| **Estimated runtime** | ~30 seconds (tsc), ~120 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx tsc --noEmit`
- **After every plan wave:** Run `cd web && npm run test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | SC-01 (ImportJob type fix) | TypeScript build | `cd web && npx tsc --noEmit` | ✅ | ⬜ pending |
| 29-01-02 | 01 | 1 | SC-01 (Import table columns) | TypeScript build + E2E | `cd web && npx tsc --noEmit` | ✅ | ⬜ pending |
| 29-01-03 | 01 | 1 | SC-02 (tags_any chip) | E2E visual | `cd web && npx playwright test e2e/filter-chips.spec.ts` | ✅ partial | ⬜ pending |
| 29-01-04 | 01 | 1 | SC-03 (Registration county UI + chip) | E2E visual | `cd web && npx playwright test e2e/phase27-filter-wiring.spec.ts` | ✅ partial | ⬜ pending |
| 29-01-05 | 01 | 1 | SC-04 (sort_by type safety) | TypeScript build | `cd web && npx tsc --noEmit` | ✅ | ⬜ pending |
| 29-01-06 | 01 | 1 | SC-05 (REQUIREMENTS.md) | Manual grep | `grep "Satisfied: 27" .planning/REQUIREMENTS.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:
- TypeScript compilation (`tsc --noEmit`) validates type alignment changes
- E2E specs for filter chips and imports exist from phases 14, 27, and 28

*No new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| REQUIREMENTS.md content accuracy | SC-05 | Documentation file, not runtime behavior | `grep "Satisfied: 27" .planning/REQUIREMENTS.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
