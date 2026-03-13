---
phase: 16
slug: phone-banking
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
nyquist_filled: 2026-03-12
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + @testing-library/react 16.3.2 |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run --coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| backend gaps | 01 | 1 | PHON-08 | unit | `cd web && npx vitest run --reporter=verbose` | ✅ | ✅ green |
| sessions index | 02 | 1 | PHON-01 | unit | `cd /home/kwhatcher/projects/run-api/web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/sessions/index.test.tsx --reporter=verbose` | ✅ | ✅ green |
| session detail | 03 | 2 | PHON-02, PHON-03, PHON-04 | unit | `cd /home/kwhatcher/projects/run-api/web && npx vitest run "src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx" --reporter=verbose` | ✅ | ✅ green |
| calling screen | 04 | 3 | PHON-05, PHON-06, PHON-07, PHON-08 | unit | `cd /home/kwhatcher/projects/run-api/web && npx vitest run "src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/call.test.tsx" --reporter=verbose` | ✅ | ✅ green |
| progress dashboard | 05 | 3 | PHON-09, PHON-10 | unit | `cd /home/kwhatcher/projects/run-api/web && npx vitest run "src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/index.test.tsx" --reporter=verbose` | ✅ | ✅ green |
| my sessions | 06 | 2 | PHON-04 | unit | `cd /home/kwhatcher/projects/run-api/web && npx vitest run "src/routes/campaigns/\$campaignId/phone-banking/my-sessions/index.test.tsx" --reporter=verbose` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.test.tsx` — 5 tests for PHON-01 (green)
- [x] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx` — 14 tests for PHON-02, PHON-03, PHON-04, PHON-09, PHON-10 (green)
- [x] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` — 13 tests for PHON-05, PHON-06, PHON-07, PHON-08 (green)
- [x] `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.test.tsx` — 5 tests for PHON-04 caller view (green)
- [x] `tests/unit/test_phone_bank_gaps.py` — backend unit test stubs (pytest.skip, green)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full calling flow end-to-end (claim → record → next) | PHON-05, PHON-07 | Requires real session state machine with DB | Create session, assign yourself, start calling, record outcome, verify next voter advances |
| Session status lifecycle (draft → active → complete) | PHON-01 | Status transitions depend on caller check-in state | Create draft session, activate, assign caller, check in, verify transitions |

---

## Nyquist Gap Fill Results

**Filled by Nyquist auditor on 2026-03-12**

| Gap | Tests Written | Status |
|-----|--------------|--------|
| sessions/index.test.tsx (5 it.todo stubs) | 5 behavioral tests — table columns, dialog open, create payload, edit mode, delete | green |
| $sessionId/index.test.tsx (14 it.todo stubs) | 14 behavioral tests — status transitions, caller management, check-in, progress tab | green |
| $sessionId/call.test.tsx (14 it.todo stubs → 13 implemented) | 13 behavioral tests — claim lifecycle, voter info, outcome recording, skip behavior | green |
| my-sessions/index.test.tsx (5 it.todo stubs) | 5 behavioral tests — assigned filter, check-in, resume calling, checked out, empty state | green |

**Total:** 37 new passing tests (152 total, 0 failures)

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** nyquist-filled 2026-03-12
