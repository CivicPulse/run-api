---
phase: 73
slug: frontend-auth-guards-oidc-error-surfacing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **E2E framework** | Playwright |
| **Backend tests** | pytest 8.x |
| **Quick run command** | `cd web && ./scripts/run-e2e.sh auth-guard-redirect.spec.ts` |
| **Full E2E command** | `cd web && ./scripts/run-e2e.sh` |
| **Backend check-in test** | `uv run pytest tests/integration/test_phone_banks.py -k check` |
| **Estimated runtime** | ~90 seconds (single spec); ~5 min (full E2E) |

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command |
|---------|-------------|-----------|-------------------|
| 73-NN-01 | SEC-07 (C7 root auth guard) | E2E | `run-e2e.sh auth-guard-redirect.spec.ts` |
| 73-NN-02 | SEC-08 (login ?redirect= param) | E2E | `run-e2e.sh auth-guard-redirect.spec.ts` |
| 73-NN-03 | SEC-09 (C8 OIDC callback error) | E2E | `run-e2e.sh oidc-error.spec.ts` |
| 73-NN-04 | SEC-10 (H23 /campaigns/new gate) | E2E | `run-e2e.sh rbac.volunteer.spec.ts` |
| 73-NN-05 | SEC-10 (H24 settings gates) | E2E | `run-e2e.sh rbac.manager.spec.ts` |
| 73-NN-06 | SEC-11 (H25 DNC gate) | E2E | `run-e2e.sh rbac.viewer.spec.ts` |
| 73-NN-07 | SEC-12 (H26 check-in enforcement) | E2E + backend | `run-e2e.sh call-page-checkin.spec.ts` + pytest |

---

## Wave 0 Requirements

- [ ] `web/e2e/auth-guard-redirect.spec.ts` — new spec (unauth redirect + intended URL round-trip)
- [ ] `web/e2e/oidc-error.spec.ts` — new spec (IdP error display)
- [ ] `web/e2e/call-page-checkin.spec.ts` — new spec (server-side check-in enforcement)
- [ ] Backend check-status endpoint in `app/api/v1/phone_banks.py`
- [ ] `GET .../callers/me` endpoint test in `tests/integration/test_phone_banks.py`
- [ ] New RBAC assertions added to existing `rbac.volunteer.spec.ts`, `rbac.manager.spec.ts`, `rbac.viewer.spec.ts`

---

## Manual-Only Verifications

| Behavior | Why Manual |
|----------|-----------|
| Visual polish of OIDC error state | Screenshot review — style consistency with shadcn Alert |
