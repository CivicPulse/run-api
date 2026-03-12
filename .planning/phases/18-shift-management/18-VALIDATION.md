---
phase: 18
slug: shift-management
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
updated: 2026-03-12
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 + happy-dom |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | SHFT-01 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-02 | 01 | 1 | SHFT-02 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-03 | 01 | 1 | SHFT-03 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-04 | 01 | 1 | SHFT-05 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-05 | 01 | 1 | SHFT-06 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-06 | 01 | 1 | SHFT-07 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-07 | 01 | 1 | SHFT-09 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-01-08 | 01 | 1 | SHFT-10 | unit | `cd web && npx vitest run src/hooks/useShifts.test.ts -x` | ✅ | ✅ green |
| 18-02-01 | 02 | 2 | SHFT-04 | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/shifts/index.test.tsx -x` | ✅ | ✅ green |
| 18-03-01 | 03 | 2 | SHFT-08 | unit | `cd web && npx vitest run src/routes/campaigns/\\$campaignId/volunteers/shifts/\\$shiftId/index.test.tsx -x` | ✅ | ✅ green |
| 18-E2E | E2E | 3 | ALL | e2e | `cd web && npx playwright test e2e/shift-verify.spec.ts` | ✅ | ✅ green (verified in plan 18-04) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/src/hooks/useShifts.test.ts` — 15 real tests covering SHFT-01,02,03,05,06,07,09,10 hook behavior
- [x] `web/src/routes/campaigns/$campaignId/volunteers/shifts/index.test.tsx` — 10 tests covering SHFT-04 list rendering, date grouping, filters, empty state
- [x] `web/src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.test.tsx` — 25 tests covering SHFT-08 roster rendering, name resolution, check-in/out, status transitions
- [x] `web/e2e/shift-verify.spec.ts` — end-to-end visual verification (created in plan 18-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual date grouping layout | SHFT-04 | Verifying visual layout of date-grouped cards | Open shifts list, verify "Today"/"This Week"/"Upcoming"/"Past" group headers appear correctly |
| Responsive card layout | SHFT-04 | CSS responsive behavior | Resize browser window, verify cards reflow properly |

---

## Test Summary

| File | Tests | Status |
|------|-------|--------|
| `web/src/hooks/useShifts.test.ts` | 15 | ✅ all pass |
| `web/src/routes/campaigns/$campaignId/volunteers/shifts/index.test.tsx` | 10 | ✅ all pass |
| `web/src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.test.tsx` | 25 | ✅ all pass |
| Full suite | 228 passing, 0 failing | ✅ no regressions |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete — 2026-03-12
