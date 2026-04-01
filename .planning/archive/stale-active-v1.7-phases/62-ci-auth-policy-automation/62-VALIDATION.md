---
phase: 62
slug: ci-auth-policy-automation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + Playwright + GitHub Actions workflow checks |
| **Config file** | `pyproject.toml`, `web/playwright.config.ts`, `.github/workflows/pr.yml` |
| **Quick run command** | `uv run pytest tests/unit/test_create_e2e_users_policy.py -x -q` |
| **Full suite command** | `uv run pytest tests/unit/test_create_e2e_users_policy.py tests/unit/test_lifespan.py -q` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/test_create_e2e_users_policy.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/unit/test_create_e2e_users_policy.py tests/unit/test_lifespan.py -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | INFRA-01 | unit | `uv run pytest tests/unit/test_create_e2e_users_policy.py -x -q` | ✅ | ⬜ pending |
| 62-01-02 | 01 | 1 | VAL-01 | lint | `uv run ruff check scripts/create-e2e-users.py tests/unit/test_create_e2e_users_policy.py` | ✅ | ⬜ pending |
| 62-02-01 | 02 | 2 | INFRA-03 | workflow-static | `rg -n "strict.*policy|verify.*policy|playwright test --project" .github/workflows/pr.yml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_create_e2e_users_policy.py` — stubs for policy ensure/verify behavior

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
