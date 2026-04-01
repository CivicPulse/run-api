---
phase: 57
slug: test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 (E2E), pytest (backend unit/integration) |
| **Config file** | `web/playwright.config.ts`, `pyproject.toml` |
| **Quick run command** | `cd web && npx playwright test --grep @smoke` |
| **Full suite command** | `cd web && npx playwright test` |
| **Estimated runtime** | ~120 seconds (auth setup + smoke tests) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx playwright test --grep @smoke`
- **After every plan wave:** Run `cd web && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | INFRA-01 | script | `docker compose exec api bash -c "PYTHONPATH=/home/app python scripts/create-e2e-users.py"` | ✅ | ⬜ pending |
| 57-02-01 | 02 | 1 | INFRA-02 | e2e | `cd web && npx playwright test --project=setup-owner --project=setup-admin --project=setup-manager --project=setup-volunteer --project=setup-viewer` | ❌ W0 | ⬜ pending |
| 57-03-01 | 03 | 2 | INFRA-03 | ci | Manual: verify CI workflow syntax with `act` or push to PR | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/e2e/auth-owner.setup.ts` — owner role auth setup
- [ ] `web/e2e/auth-admin.setup.ts` — admin role auth setup
- [ ] `web/e2e/auth-manager.setup.ts` — manager role auth setup
- [ ] Auth setup files for volunteer and viewer (may update existing)

*Existing infrastructure covers provisioning script and CI workflow base.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI sharding runs without infrastructure failures | INFRA-03 | Requires GitHub Actions runner | Push to PR branch, verify 4-shard matrix completes |
| ZITADEL users can log in without password change | INFRA-01 | Requires running ZITADEL instance | Run provisioning script, attempt OIDC login for each user |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
