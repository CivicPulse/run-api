---
phase: 19
slug: verification-validation-gaps
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + happy-dom + @testing-library/react |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run` |
| **Full suite command** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run`
- **After every plan wave:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | VOTR-01..11 | code inspection | `grep -l` + file checks | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | VOTR-07,08,10,11 | Playwright e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts` | ✅ | ⬜ pending |
| 19-01-03 | 01 | 1 | VOTR-01..11 | doc artifact | VERIFICATION.md creation | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 1 | CALL-01..08 | code inspection | `grep -l` + file checks | ✅ | ⬜ pending |
| 19-02-02 | 02 | 1 | CALL-01..03 | unit (hook) | `npm run test -- --run useCallLists` | ❌ stubs | ⬜ pending |
| 19-02-03 | 02 | 1 | CALL-04..07 | unit (hook) | `npm run test -- --run useDNC` | ❌ stubs | ⬜ pending |
| 19-02-04 | 02 | 1 | CALL-08 | component | `npm run test -- --run DNCListPage` | ❌ stubs | ⬜ pending |
| 19-02-05 | 02 | 1 | CALL-01..08 | Playwright e2e | `npx playwright test e2e/phase-15-verification.spec.ts` | ❌ W0 | ⬜ pending |
| 19-02-06 | 02 | 1 | CALL-01..08 | doc artifact | VERIFICATION.md creation | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 2 | ALL | audit update | manual review of v1.2-MILESTONE-AUDIT.md | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/phase-15-verification.spec.ts` — Playwright spec for CALL-01, CALL-02, CALL-04, CALL-06, CALL-08
- [ ] `web/src/hooks/useCallLists.test.ts` — implement 5 `it.todo` stubs
- [ ] `web/src/hooks/useDNC.test.ts` — implement 4 `it.todo` stubs
- [ ] `web/src/routes/.../dnc/index.test.tsx` — implement 4 `it.todo` stubs

*Existing infrastructure covers Phase 13 requirements (Playwright spec already exists).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VERIFICATION.md content accuracy | ALL | Document review — content correctness can't be fully automated | Review observable truths table entries match actual code |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
