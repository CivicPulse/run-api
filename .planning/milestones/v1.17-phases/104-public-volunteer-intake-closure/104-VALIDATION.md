---
phase: 104
slug: public-volunteer-intake-closure
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
audited: 2026-04-09
---

# Phase 104 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | pytest + Vitest |
| Quick run | `uv run pytest tests/unit/test_volunteer_application_service.py tests/unit/test_volunteer_application_api.py` |
| UI run | `cd web && npm test -- --run src/routes/campaigns/$campaignId/settings/members.test.tsx` |

## Verification Map

| Requirement | Test Coverage | Status |
|-------------|---------------|--------|
| APPL-01 | backend public API + service tests | ✅ |
| APPL-04 | backend service/API path still carries authenticated applicant identity | ✅ |
| APPL-05 | signup-route authenticated prefill behavior retained in code path and frontend regression coverage | ✅ |

## Sign-Off

- [x] All requirements have automated coverage or direct code-path verification.
- [x] No unresolved Wave 0 gaps remain for this phase.
- [x] `nyquist_compliant: true`
