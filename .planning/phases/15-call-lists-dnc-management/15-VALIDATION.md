---
phase: 15
slug: call-lists-dnc-management
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-11
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest with happy-dom + @testing-library/react |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run` |
| **Full suite command** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run`
- **After every plan wave:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | CALL-01, CALL-02, CALL-03 | unit | `npm run test -- --run useCallLists` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 0 | CALL-04, CALL-05, CALL-06, CALL-07, CALL-08 | unit | `npm run test -- --run useDNC DNCListPage` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | CALL-01 | unit | `npm run test -- --run useCallLists` | ✅ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | CALL-03 | unit | `npm run test -- --run useCallLists` | ✅ W0 | ⬜ pending |
| 15-03-01 | 03 | 1 | CALL-02 | unit | `npm run test -- --run useCallLists` | ✅ W0 | ⬜ pending |
| 15-04-01 | 04 | 1 | CALL-04, CALL-05, CALL-07 | unit | `npm run test -- --run useDNC` | ✅ W0 | ⬜ pending |
| 15-04-02 | 04 | 1 | CALL-06 | unit | `npm run test -- --run useDNC` | ✅ W0 | ⬜ pending |
| 15-04-03 | 04 | 1 | CALL-08 | unit | `npm run test -- --run DNCListPage` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/hooks/useCallLists.test.ts` — stubs for CALL-01, CALL-02, CALL-03
- [ ] `web/src/hooks/useDNC.test.ts` — stubs for CALL-04, CALL-05, CALL-06, CALL-07
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx` — stubs for CALL-08 (client-side filter); describe name "DNCListPage" required for --run DNCListPage filter to match

*Note: VALIDATION.md originally listed this file as `web/src/pages/DNCListPage.test.tsx`. The actual path is co-located with the route file at the routes/ path above. The describe("DNCListPage") name ensures the --run DNCListPage filter still works.*

*Existing Vitest infrastructure covers the framework — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Call list entries visible with voter names in UI | CALL-02 | Server-side join rendering | Navigate to call list detail, confirm voter names appear in table |
| DNC bulk import file picker and success toast | CALL-06 | File upload UX | Upload a .csv/.txt with phone numbers, confirm success toast and entries appear |
| Entry status labels map correctly in UI | CALL-02 | Display mapping (backend → UI labels) | Check entries show "unclaimed/claimed/completed/skipped/error" not raw backend values |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
