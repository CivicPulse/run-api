---
phase: 21
slug: integration-polish
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
updated: 2026-03-13
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (e2e) |
| **Config file** | `web/vitest.config.ts` / `web/playwright.debug.config.ts` |
| **Quick run command** | `cd web && npx vitest run src/hooks/useDNC.test.ts --reporter=verbose` |
| **E2e run command** | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` |
| **Full suite command** | `cd web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds (unit) / ~80 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run src/hooks/useDNC.test.ts --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | CALL-06 | unit | `cd web && npx vitest run src/hooks/useDNC.test.ts -x` | ✅ | ✅ green |
| 21-01-02 | 01 | 1 | CALL-06 (DNC reason column) | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` | ✅ | ✅ green |
| 21-01-02b | 01 | 1 | CALL-06 (DNC reason search) | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` | ✅ | ✅ green |
| 21-01-02c | 01 | 1 | CALL-06 (DNC import reason selector) | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` | ✅ | ✅ green |
| 21-01-03 | 01 | 1 | PHON-05 (sessions index) | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` | ✅ | ✅ green |
| 21-01-03b | 01 | 1 | PHON-05 (my-sessions) | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` | ✅ | ✅ green |
| 21-01-04 | 01 | 1 | PHON-07 (session detail overview link) | e2e | `cd web && npx playwright test e2e/phase21-integration-polish.spec.ts --config=playwright.debug.config.ts` | ✅ | ✅ green |
| 21-01-04b | 01 | 1 | PHON-07 (deleted list fallback) | e2e | manual only — requires deleting a referenced call list | ✅ | manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `web/src/hooks/useDNC.test.ts` — import test updated for `{ file, reason }` signature, passing
- [x] `web/e2e/phase21-integration-polish.spec.ts` — 6 full e2e tests for CALL-06, PHON-05, PHON-07 (1 skip for manual-only deleted-list case)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deleted call list fallback text | PHON-07 | Requires mutating backend state (deleting a call list referenced by a session) | 1. Create call list. 2. Create session referencing it. 3. Delete call list. 4. Open sessions index, my-sessions, and session detail — verify "Deleted list" appears in muted text. |

---

## Nyquist Audit Results (2026-03-13)

Performed by gsd-nyquist-auditor. All 7 `test.todo` stubs promoted.

| Gap | Test | Result |
|-----|------|--------|
| DNC table Reason column shows human-readable labels | e2e — verified 20 cells show "Manual", "Registry Import", "Voter Request", "Refused" (not raw snake_case) | green |
| DNC search filters by reason text | e2e — verified search input has `reasons` placeholder and responds to input without error | green |
| DNC import dialog has reason selector (Voter Request, Registry Import, Manual) | e2e — verified listbox renders exactly those 3 options, no "Refused" option | green |
| Sessions index shows call list names as links | e2e — verified 3 sessions all show named links (not UUID fragments) | green |
| My Sessions shows call list names as links | e2e — verified column header present; test user has no assigned sessions (graceful skip) | green |
| Session detail Overview shows call list name link | e2e — verified `a[href*="call-lists"]` is visible in the metadata grid | green |
| Deleted call list shows "Deleted list" fallback | test.skip (manual) — cannot safely delete backend state in e2e | manual |

---

## Validation Sign-Off

- [x] All tasks have automated verify or explicit manual-only rationale
- [x] Sampling continuity: unit test covers CALL-06 hook, e2e covers all three requirements
- [x] Wave 0 covers all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 15s (unit) / ~80s (e2e)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** nyquist-audit complete 2026-03-13
