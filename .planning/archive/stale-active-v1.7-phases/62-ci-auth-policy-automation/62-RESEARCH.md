# Phase 62 Research — CI Auth Policy Automation

**Date:** 2026-03-31
**Phase:** 62-ci-auth-policy-automation
**Requirements:** INFRA-01, INFRA-03, VAL-01

## Problem Framing

Phase 60 proved Playwright auth setup is sensitive to ZITADEL MFA prompts. Current CI bootstrap runs `scripts/create-e2e-users.py`, but that script does not currently enforce org login policy state. This creates drift: local can pass after one-time manual policy changes while fresh CI instances can regress.

## Existing Artifacts and Signals

- `scripts/create-e2e-users.py` provisions 15 users and memberships idempotently.
- `scripts/bootstrap-zitadel.py` is already the canonical API bootstrap script pattern (PAT/header handling, idempotent create/search).
- `.github/workflows/pr.yml` creates users but does not assert no-MFA policy state before auth setup.
- `.planning/v1.7-MILESTONE-AUDIT.md` records INT-01: no-MFA policy not automated.
- `web/e2e/auth-*.setup.ts` includes MFA skip fallback, but this is a safety net and not a deterministic contract.

## Recommended Technical Direction

1. **Policy automation belongs in bootstrap tooling**
   - Extend `scripts/create-e2e-users.py` with explicit login-policy ensure/verify logic.
   - Keep HTTP patterns aligned with `bootstrap-zitadel.py` (`api_call`, Host header, PAT usage, idempotent search/create/update).

2. **Fail-fast CI gate for policy presence**
   - Add a dedicated CI step before Playwright execution that runs `create-e2e-users.py` in strict policy-verification mode.
   - If policy cannot be verified/applied, stop shard early with actionable error.

3. **Deterministic auth bootstrap smoke in CI**
   - Add a targeted Playwright setup-only run (owner/admin/manager/volunteer/viewer auth projects) as a fast signal that fresh instance bootstrap is good before full test shards.

## Implementation Constraints

- Use existing stack only (Python + httpx; GitHub Actions yaml updates).
- Keep script idempotent and safe for repeated local/CI runs.
- Do not rely on manual ZITADEL console interactions.
- Preserve PAT-first flow; keep optional fallback where already established.

## Risks and Mitigations

- **Risk:** ZITADEL login-policy endpoint shape differs between environments/versions.
  - **Mitigation:** Add explicit endpoint probing + clear exception text that prints attempted endpoint/path and response body.
- **Risk:** Auth setup passes by skip fallback even if policy automation regresses.
  - **Mitigation:** Add strict policy verification step before auth project setup and fail on mismatch.
- **Risk:** CI runtime growth.
  - **Mitigation:** Use setup-only smoke (no spec execution) and keep checks scoped.

## Validation Architecture

- **Unit:** New tests around policy ensure/verify helpers in `tests/unit/test_create_e2e_users_policy.py`.
- **Static checks:** `uv run ruff check` on script + tests.
- **CI contract checks:** workflow contains strict policy verification step and setup-only auth smoke command.

## Deliverable Guidance for Planning

- Plan 1 should produce the script-level policy automation + tests.
- Plan 2 should wire CI strict verification and deterministic auth bootstrap checks.
- Both plans should explicitly map to INFRA-01, INFRA-03, VAL-01.
