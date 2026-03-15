---
phase: 27
slug: wire-advanced-filters-to-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | pytest (existing) |
| **Framework (E2E)** | Playwright ^1.58.2 |
| **Config file (backend)** | pyproject.toml (existing pytest config) |
| **Config file (E2E)** | web/playwright.config.ts |
| **Quick run command** | `cd /home/kwhatcher/projects/run-api && uv run pytest tests/unit/test_voter_search.py -x` |
| **Full suite command** | `cd /home/kwhatcher/projects/run-api && uv run pytest tests/unit/ -x` |
| **E2E command** | `cd /home/kwhatcher/projects/run-api/web && npx playwright test e2e/phase27-filter-wiring.spec.ts` |
| **Estimated runtime** | ~30 seconds (unit), ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_voter_search.py -x`
- **After every plan wave:** Run `uv run pytest tests/unit/ -x`
- **Before `/gsd:verify-work`:** Full unit suite + Playwright E2E suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | FILT-01 | unit | `uv run pytest tests/unit/test_voter_search.py -k "voter_search_body" -x` | Yes | ⬜ pending |
| 27-01-02 | 01 | 1 | FILT-04 | unit | `uv run pytest tests/unit/test_voter_search.py -k "sort" -x` | No - W0 | ⬜ pending |
| 27-01-03 | 01 | 1 | FILT-04 | unit | `uv run pytest tests/unit/test_voter_search.py -k "cursor" -x` | No - W0 | ⬜ pending |
| 27-01-04 | 01 | 1 | FILT-05 | unit | `uv run pytest tests/unit/test_voter_search.py -k "voted_in" -x` | Yes | ⬜ pending |
| 27-02-01 | 02 | 2 | FRNT-02 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "POST"` | No - W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | FRNT-02 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "chips"` | No - W0 | ⬜ pending |
| 27-03-01 | 03 | 3 | FILT-01 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "propensity"` | No - W0 | ⬜ pending |
| 27-03-02 | 03 | 3 | FILT-02 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "demographic"` | No - W0 | ⬜ pending |
| 27-03-03 | 03 | 3 | FILT-03 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "mailing"` | No - W0 | ⬜ pending |
| 27-03-04 | 03 | 3 | FILT-01, FILT-02, FILT-03 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "combined"` | No - W0 | ⬜ pending |
| 27-03-05 | 03 | 3 | FILT-05 | E2E | `npx playwright test e2e/phase27-filter-wiring.spec.ts -g "GET"` | No - W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_voter_search.py` — append stubs for VoterSearchBody validation, dynamic cursor encode/decode, sort support
- [ ] `web/e2e/phase27-filter-wiring.spec.ts` — stubs for all 5 E2E scenarios (propensity, demographic, mailing, combined, GET backward compat)

*Existing infrastructure covers backend unit test framework and Playwright E2E framework.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
