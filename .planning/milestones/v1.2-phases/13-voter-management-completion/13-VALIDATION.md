---
phase: 13
slug: voter-management-completion
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-10
updated: 2026-03-12
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unit/Integration Framework** | Vitest 3.x + happy-dom + @testing-library/react |
| **E2E Framework** | Playwright (Chromium, headless) |
| **Unit config file** | `web/vitest.config.ts` |
| **E2E config file** | `web/playwright.debug.config.ts` |
| **Unit quick run** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --reporter=verbose` |
| **Unit full suite** | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage` |
| **E2E run command** | `cd /home/kwhatcher/projects/run-api/web && npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts` |
| **Estimated runtime** | ~30s (unit quick), ~60s (unit coverage), ~2.5m (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --reporter=verbose`
- **After every plan wave:** Run `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green (95% coverage thresholds)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

### Unit Tests (Hook Layer)

| Task ID | Plan | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | VOTR-01, VOTR-02 | unit | `npm run test -- --run src/hooks/useVoterContacts.test.ts` | ✅ | ✅ green |
| 13-01-02 | 01 | VOTR-03, VOTR-04, VOTR-11 | unit | `npm run test -- --run src/hooks/useVoters.test.ts` | ✅ | ✅ green |
| 13-01-03 | 01 | VOTR-05, VOTR-06 | unit | `npm run test -- --run src/hooks/useVoterTags.test.ts` | ✅ | ✅ green |
| 13-01-04 | 01 | VOTR-07, VOTR-08, VOTR-09 | unit | `npm run test -- --run src/hooks/useVoterLists.test.ts` | ✅ | ✅ green |
| 13-01-05 | 01 | VOTR-10 | unit | `npm run test -- --run src/components/voters/VoterFilterBuilder.test.tsx` | ✅ | ✅ green |

### E2E Tests (UI Layer — Playwright)

| Task ID | Requirement | Test Type | Automated Command | File | Status |
|---------|-------------|-----------|-------------------|------|--------|
| e2e-VOTR-01 | Voter contacts tab sections render | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-01"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-02 | Star icon visible on contact rows | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-02"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-03 | New Voter sheet opens with form fields | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-03"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-04 | Edit button visible (manager-gated) | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-04"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green (partial — see escalation) |
| e2e-VOTR-05 | Campaign tags DataTable + New Tag button | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-05"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-06 | Tags tab chips with remove and add selector | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-06"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-07 | Voter lists DataTable + New List button | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-07"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-08 | Dynamic list dialog renders VoterFilterBuilder | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-08"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-09 | List detail page renders member DataTable | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-09"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-10 | Filters panel opens with Party/Age/City sections | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-10"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |
| e2e-VOTR-11 | History tab textarea + Add Note button | e2e | `npx playwright test e2e/phase13-voter-verify.spec.ts --config=playwright.debug.config.ts --grep "VOTR-11"` | `web/e2e/phase13-voter-verify.spec.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Known Implementation Bug (ESCALATED)

**VOTR-04 partial:** `VoterEditSheet.tsx` uses `<SelectItem value="">Unknown</SelectItem>` for the Party and Gender selects. Radix UI prohibits empty string `value` on `SelectItem` — it throws: "A `<Select.Item />` must have a value prop that is not an empty string." This crashes the sheet render when the Edit button is clicked. The Edit button presence and RequireRole gating is verified (test passes). The sheet content rendering fails due to this bug.

**File:** `web/src/components/voters/VoterEditSheet.tsx` lines ~178 and ~200
**Fix needed:** Replace `value=""` with a sentinel like `value="__unknown__"` and handle it in the submit payload filter.

---

## Wave 0 Requirements

- [x] `web/src/hooks/useVoterContacts.test.ts` — VOTR-01, VOTR-02 (set-primary URL fix)
- [x] `web/src/hooks/useVoters.test.ts` — VOTR-03, VOTR-04, VOTR-11
- [x] `web/src/hooks/useVoterTags.test.ts` — VOTR-05, VOTR-06
- [x] `web/src/hooks/useVoterLists.test.ts` — VOTR-07, VOTR-08, VOTR-09
- [x] `web/src/components/voters/VoterFilterBuilder.test.tsx` — VOTR-10
- [x] `web/e2e/phase13-voter-verify.spec.ts` — all 11 VOTR requirements (Playwright e2e)

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: all requirements covered
- [x] Wave 0 covers all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 60s (unit), ~2.5m (e2e)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-03-12 — Nyquist Auditor (11/11 e2e tests passing; 1 implementation bug escalated for VOTR-04 sheet render)
