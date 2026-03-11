---
phase: 16
slug: phone-banking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
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
| backend gaps | 01 | 1 | PHON-08 | unit | `cd web && npx vitest run --reporter=verbose` | ❌ Wave 0 | ⬜ pending |
| sessions index | 02 | 1 | PHON-01 | unit | `cd web && npx vitest run src/routes/campaigns/$campaignId/phone-banking/sessions/index.test.tsx` | ❌ Wave 0 | ⬜ pending |
| session detail | 03 | 2 | PHON-02, PHON-03, PHON-04 | unit | `cd web && npx vitest run src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx` | ❌ Wave 0 | ⬜ pending |
| calling screen | 04 | 3 | PHON-05, PHON-06, PHON-07, PHON-08 | unit | `cd web && npx vitest run src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` | ❌ Wave 0 | ⬜ pending |
| progress dashboard | 05 | 3 | PHON-09, PHON-10 | unit | `cd web && npx vitest run src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx` | ❌ Wave 0 | ⬜ pending |
| my sessions | 06 | 2 | PHON-04 | unit | `cd web && npx vitest run src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.test.tsx` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.test.tsx` — stubs for PHON-01
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx` — stubs for PHON-02, PHON-03, PHON-04, PHON-09, PHON-10
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` — stubs for PHON-05, PHON-06, PHON-07, PHON-08
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.test.tsx` — stubs for PHON-04 caller view
- [ ] `tests/unit/test_phone_bank_gaps.py` — backend unit tests for self-release endpoint, callers list, my-sessions filter

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full calling flow end-to-end (claim → record → next) | PHON-05, PHON-07 | Requires real session state machine with DB | Create session, assign yourself, start calling, record outcome, verify next voter advances |
| Session status lifecycle (draft → active → complete) | PHON-01 | Status transitions depend on caller check-in state | Create draft session, activate, assign caller, check in, verify transitions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
