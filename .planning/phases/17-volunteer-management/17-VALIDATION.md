---
phase: 17
slug: volunteer-management
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 0 | VLTR-01,02,03,05 | unit | `cd web && npx vitest run src/hooks/useVolunteers.test.ts -x` | ✅ | ✅ green |
| 17-01-02 | 01 | 0 | VLTR-07 | unit | `cd web && npx vitest run src/hooks/useVolunteerTags.test.ts -x` | ✅ | ✅ green |
| 17-01-03 | 01 | 0 | VLTR-06 | unit | `cd web && npx vitest run src/hooks/useVolunteerAvailability.test.ts -x` | ✅ | ✅ green |
| 17-01-04 | 01 | 0 | VLTR-09 | unit | `cd web && npx vitest run src/hooks/useVolunteerHours.test.ts -x` | ✅ | ✅ green |
| 17-02-01 | 02 | 1 | VLTR-01 | e2e | `cd web && npx playwright test --config playwright.debug.config.ts e2e/volunteer-management.spec.ts --grep "roster"` | ✅ | ✅ green |
| 17-03-01 | 03 | 1 | VLTR-02 | e2e | `cd web && npx playwright test --config playwright.debug.config.ts e2e/volunteer-management.spec.ts --grep "register"` | ✅ | ✅ green |
| 17-04-01 | 04 | 1 | VLTR-03 | e2e | `cd web && npx playwright test --config playwright.debug.config.ts e2e/volunteer-management.spec.ts --grep "detail page renders"` | ✅ | ✅ green |
| 17-05-01 | 05 | 2 | VLTR-04,08 | e2e | `cd web && npx playwright test --config playwright.debug.config.ts e2e/volunteer-management.spec.ts --grep "tabs\|tag management"` | ✅ | ✅ green |
| 17-06-01 | 06 | 2 | VLTR-05 | unit | `cd web && npx vitest run src/hooks/useVolunteers.test.ts -x` | ✅ | ✅ green |
| 17-07-01 | 07 | 2 | VLTR-06,09 | unit | `cd web && npx vitest run src/hooks/useVolunteerAvailability.test.ts -x && cd web && npx vitest run src/hooks/useVolunteerHours.test.ts -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/src/hooks/useVolunteers.test.ts` — 13 tests covering VLTR-01, VLTR-02, VLTR-03, VLTR-04, VLTR-05 (all green)
- [x] `web/src/hooks/useVolunteerTags.test.ts` — 7 tests covering VLTR-07, VLTR-08 (all green)
- [x] `web/src/hooks/useVolunteerAvailability.test.ts` — 4 tests covering VLTR-06 (all green)
- [x] `web/src/hooks/useVolunteerHours.test.ts` — 2 tests covering VLTR-09 (all green)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar nav visual layout | VLTR-01 | Visual layout match to phone-banking pattern | Compare sidebar nav against phone-banking.tsx in browser |
| Skills badge pill truncation ("2 + N more") | VLTR-01 | Visual truncation behavior | Assign >2 skills, verify "... +N more" rendering |
| Timezone-correct availability display | VLTR-06 | Timezone interaction with native inputs | Add availability in non-UTC timezone, verify correct display |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** COMPLIANT — 26/26 unit tests green; 14/14 e2e tests green (2026-03-12)

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 10 |
| Resolved | 10 |
| Escalated | 0 |
