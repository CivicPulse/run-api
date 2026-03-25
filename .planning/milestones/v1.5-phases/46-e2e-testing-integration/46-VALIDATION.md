---
phase: 46
slug: e2e-testing-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (integration) + Playwright 1.58.2 (E2E) |
| **Config file** | `pyproject.toml` (pytest) + `web/playwright.config.ts` (Playwright) |
| **Quick run command** | `uv run pytest tests/integration/ -x --timeout=30` |
| **Full suite command** | `uv run pytest tests/integration/ -m integration && cd web && npx playwright test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/integration/ -x --timeout=30`
- **After every plan wave:** Run `uv run pytest tests/integration/ -m integration && cd web && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | TEST-01 | e2e | `cd web && npx playwright test e2e/login.spec.ts` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | TEST-01 | e2e | `cd web && npx playwright test e2e/voter-search.spec.ts` | ❌ W0 | ⬜ pending |
| 46-01-03 | 01 | 1 | TEST-01 | e2e | `cd web && npx playwright test e2e/voter-import.spec.ts` | ❌ W0 | ⬜ pending |
| 46-01-04 | 01 | 1 | TEST-01 | e2e | `cd web && npx playwright test e2e/turf-creation.spec.ts` | ❌ W0 | ⬜ pending |
| 46-01-05 | 01 | 1 | TEST-01 | e2e | `cd web && npx playwright test e2e/phone-bank.spec.ts` | ❌ W0 | ⬜ pending |
| 46-01-06 | 01 | 1 | TEST-01 | e2e | `cd web && npx playwright test e2e/volunteer-signup.spec.ts` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 1 | TEST-02 | integration | `uv run pytest tests/integration/ -k "pending"` | ❌ W0 | ⬜ pending |
| 46-03-01 | 03 | 1 | TEST-03 | integration | `uv run pytest tests/integration/ -k "rls"` | ✅ | ⬜ pending |
| 46-04-01 | 04 | 2 | TEST-01 | ci | `gh workflow run test.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/auth.setup.ts` — Playwright auth state setup project
- [ ] `web/e2e/login.spec.ts` — Login flow E2E stub
- [ ] `web/e2e/voter-search.spec.ts` — Voter search E2E stub
- [ ] `web/e2e/voter-import.spec.ts` — Voter import E2E stub
- [ ] `web/e2e/turf-creation.spec.ts` — Turf creation E2E stub
- [ ] `web/e2e/phone-bank.spec.ts` — Phone bank E2E stub
- [ ] `web/e2e/volunteer-signup.spec.ts` — Volunteer signup E2E stub

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
