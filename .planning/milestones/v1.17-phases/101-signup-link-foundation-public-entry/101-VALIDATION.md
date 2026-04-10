---
phase: 101
slug: signup-link-foundation-public-entry
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
audited: 2026-04-09
---

# Phase 101 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | pytest + Vitest |
| Quick run | `uv run pytest tests/unit/test_signup_link_service.py tests/unit/test_signup_link_api.py` |
| UI run | `cd web && npm test -- --run src/hooks/useSignupLinks.test.ts` |

## Verification Map

| Requirement | Coverage | Status |
|-------------|----------|--------|
| LINK-01 to LINK-04 | signup-link service/API tests | ✅ |
| LINK-05 | public signup-link route and resolver path | ✅ |
| SAFE-01 | invalid/disabled/regenerated token fail-closed behavior in service/API tests | ✅ |

## Sign-Off

- [x] Core signup-link lifecycle is covered by automated tests.
- [x] Public fail-closed behavior has direct evidence.
- [x] `nyquist_compliant: true`
