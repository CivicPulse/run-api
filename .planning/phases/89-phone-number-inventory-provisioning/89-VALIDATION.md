---
phase: 89
slug: phone-number-inventory-provisioning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (asyncio_mode=auto) |
| **Config file** | `pyproject.toml` |
| **Quick run command** | `uv run pytest tests/unit/test_org_numbers*.py -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_org_numbers*.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | ORG-02 | T-89-01 | Migration creates table without data leakage | unit | `uv run pytest tests/unit/test_org_numbers_model.py -x -q` | ❌ W0 | ⬜ pending |
| 89-01-02 | 01 | 1 | ORG-02 | T-89-02 | Circular FK uses use_alter=True safely | unit | `uv run pytest tests/unit/test_org_numbers_model.py -x -q` | ❌ W0 | ⬜ pending |
| 89-02-01 | 02 | 2 | ORG-02 | T-89-03 | Register endpoint validates Twilio API before persisting | unit | `uv run pytest tests/unit/test_org_numbers_api.py -x -q` | ❌ W0 | ⬜ pending |
| 89-02-02 | 02 | 2 | ORG-02 | T-89-04 | Org isolation: numbers from other orgs not returned | unit | `uv run pytest tests/unit/test_org_numbers_api.py -x -q` | ❌ W0 | ⬜ pending |
| 89-02-03 | 02 | 2 | ORG-02 | — | List, sync, set-default, delete operations work | unit | `uv run pytest tests/unit/test_org_numbers_api.py -x -q` | ❌ W0 | ⬜ pending |
| 89-03-01 | 03 | 3 | ORG-02 | — | Phone Numbers card renders in settings | manual | Browser screenshot of /org/settings | — | ⬜ pending |
| 89-03-02 | 03 | 3 | ORG-02 | — | useOrgNumbers hook invalidates on mutation | unit | `uv run npx vitest run web/src/hooks/useOrgNumbers.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_org_numbers_model.py` — stubs for model/migration tests
- [ ] `tests/unit/test_org_numbers_api.py` — stubs for API endpoint tests
- [ ] `web/src/hooks/useOrgNumbers.test.ts` — stubs for frontend hook tests

*Existing pytest and vitest infrastructure covers this phase — no new framework installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phone Numbers card renders correctly in /org/settings | ORG-02 | Visual UI verification | Navigate to /org/settings, take Playwright screenshot, verify card appears below Twilio credentials |
| Set-default clears previous default inline | ORG-02 | UI state verification | Set a number as default voice, then set another; verify first number loses Default Voice tag |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
