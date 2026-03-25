---
phase: 43
slug: organization-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (frontend)** | vitest 4.0.18 + @testing-library/react 16.3.2 |
| **Framework (backend)** | pytest (asyncio_mode=auto) |
| **Config file (frontend)** | `web/vitest.config.ts` |
| **Quick run command (frontend)** | `cd web && npx vitest run --reporter=verbose` |
| **Quick run command (backend)** | `uv run pytest tests/unit/ -x -q` |
| **Full suite command** | `cd web && npx vitest run && cd .. && uv run pytest tests/unit/ -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** `cd web && npx vitest run --reporter=verbose` + `uv run pytest tests/unit/ -x -q`
- **After every plan wave:** `cd web && npx vitest run && cd .. && uv run pytest tests/unit/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | ORG-05 | unit (component) | `cd web && npx vitest run src/routes/index.test.tsx` | Wave 0 | ⬜ pending |
| 43-01-02 | 01 | 1 | ORG-07 | unit (component) | `cd web && npx vitest run src/routes/index.test.tsx` | Wave 0 | ⬜ pending |
| 43-01-03 | 01 | 1 | ORG-11 | unit (component) | `cd web && npx vitest run src/routes/index.test.tsx` | Wave 0 | ⬜ pending |
| 43-02-01 | 02 | 1 | ORG-06 | unit (component) | `cd web && npx vitest run src/routes/org/members.test.tsx` | Wave 0 | ⬜ pending |
| 43-03-01 | 03 | 2 | ORG-08 | unit (component) | `cd web && npx vitest run src/routes/campaigns/new.test.tsx` | Wave 0 | ⬜ pending |
| 43-03-02 | 03 | 2 | ORG-09 | unit (backend) | `uv run pytest tests/unit/test_org_settings.py -x` | Wave 0 | ⬜ pending |
| 43-04-01 | 04 | 2 | ORG-10 | unit (backend) | `uv run pytest tests/unit/test_org_api.py -x` | Extends existing | ⬜ pending |
| 43-04-02 | 04 | 2 | ORG-12 | unit (component) | `cd web && npx vitest run src/components/org/OrgSwitcher.test.tsx` | Wave 0 | ⬜ pending |
| 43-04-03 | 04 | 2 | ORG-13 | manual | Manual verification after org switch | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/routes/index.test.tsx` — stubs for ORG-05, ORG-07, ORG-11
- [ ] `web/src/routes/org/members.test.tsx` — stubs for ORG-06
- [ ] `web/src/routes/campaigns/new.test.tsx` — stubs for ORG-08
- [ ] `web/src/components/org/OrgSwitcher.test.tsx` — stubs for ORG-12
- [ ] `tests/unit/test_org_settings.py` — stubs for ORG-09 (PATCH org name)
- [ ] Extend `tests/unit/test_org_api.py` — stubs for ORG-10 (add member to campaign)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| API calls scoped to JWT org_id after org switch | ORG-13 | ZITADEL re-auth with org scope requires live OIDC flow | 1. Log in with user in 2+ orgs. 2. Switch orgs via header dropdown. 3. Verify network tab shows new JWT with org_id claim. 4. Verify API calls return data for switched org only. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
