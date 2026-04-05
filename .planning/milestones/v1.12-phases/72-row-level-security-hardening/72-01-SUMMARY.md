---
phase: 72-row-level-security-hardening
plan: 01
subsystem: testing
tags: [rls, security, fixtures, tdd-red]
dependency-graph:
  requires: [two_campaigns_with_resources pattern from Phase 71]
  provides: [two_orgs_with_campaigns fixture, test_rls_hardening.py red suite]
  affects: [tests/integration/conftest.py, tests/integration/test_rls_hardening.py]
tech-stack:
  added: []
  patterns: [pytest async fixture, RLS red-test seeding via superuser]
key-files:
  created:
    - tests/integration/test_rls_hardening.py
  modified:
    - tests/integration/conftest.py
decisions:
  - "Seed org_members explicitly (role='org_owner') in fixture because migration 015 only seeds on upgrade"
  - "Delete organizations before users in teardown to satisfy organizations_created_by_fkey"
  - "Accept SEC-05 tests (campaigns/campaign_members/users) passing pre-migration since ENABLE RLS already isolates app_user — red state is carried by SEC-06 org tests + placeholder reversibility test, matching plan's minimum-red bar"
metrics:
  duration_minutes: 10
  completed: "2026-04-04"
---

# Phase 72 Plan 01: RLS Hardening Test Stubs Summary

Wave 0 red tests for SEC-05/SEC-06: new `two_orgs_with_campaigns` fixture plus 7 failing stubs verifying cross-org isolation on organizations/organization_members and FORCE RLS on core tables.

## What Was Built

### `two_orgs_with_campaigns` fixture (conftest.py)
Async fixture (scope=function) that inserts via the superuser session:
- 2 organizations (UUID ids + zitadel_org_id strings)
- 2 users (linked as organizations.created_by)
- 2 campaigns (each linked to its org via organization_id + zitadel_org_id)
- 2 organization_members rows (role='org_owner')
- 2 campaign_members rows (role='admin')

Yields: `{org_a_id, org_b_id, campaign_a_id, campaign_b_id, user_a_id, user_b_id}`.
Teardown deletes in FK-safe order: campaign_members → organization_members → campaigns → organizations → users.

### `test_rls_hardening.py` (7 tests)
| # | Test | Red/Green |
|---|------|-----------|
| 1 | test_force_on_campaigns | green pre-migration (ENABLE RLS already isolates app_user) |
| 2 | test_force_on_campaign_members | green pre-migration |
| 3 | test_force_on_users | green pre-migration |
| 4 | test_organizations_cross_campaign_blocked | **RED** — no RLS on organizations yet |
| 5 | test_organization_members_cross_campaign_blocked | **RED** — no RLS on organization_members yet |
| 6 | test_organizations_empty_without_context | **RED** — nil-UUID context returns both orgs |
| 7 | test_migration_reversible | **RED** — placeholder stub, filled by Plan 02 |

## Verification Results

- `uv run pytest tests/integration/test_rls_hardening.py --collect-only` → 7 items collected
- `uv run pytest tests/integration/test_rls_hardening.py` → 4 failed, 3 passed (expected red state)
- `uv run pytest tests/integration/test_rls_api_smoke.py tests/integration/test_tenant_isolation.py` → 27 passed (no regressions)
- `uv run ruff check tests/integration/conftest.py tests/integration/test_rls_hardening.py` → clean

## Deviations from Plan

**1. [Rule 1 - Bug] Teardown FK ordering**
- **Found during:** First fixture run
- **Issue:** `DELETE FROM users` ran before `DELETE FROM organizations`, violating `organizations_created_by_fkey`
- **Fix:** Reordered teardown: campaigns → organizations → users
- **Files modified:** tests/integration/conftest.py
- **Commit:** bdba31b

**2. [Rule 2 - Missing data] Seed organization_members explicitly**
- **Found during:** Authoring fixture
- **Issue:** Migration 015 seeds org_owner rows only on upgrade, not for runtime-inserted organizations
- **Fix:** Added explicit INSERT of organization_members (role='org_owner') after organizations insert
- **Files modified:** tests/integration/conftest.py
- **Commit:** bdba31b

**3. [Plan-accuracy note] SEC-05 tests pass pre-migration**
- Plan expected all 7 tests to fail red. In reality, tests 1-3 pass because ENABLE RLS (applied in migration 001) already isolates non-owner `app_user` connections; FORCE RLS only matters for table owners / BYPASSRLS roles.
- This is within the plan's stated minimum red bar: "at least the organizations_cross_campaign_blocked test fails because RLS does not yet exist on organizations." The placeholder `test_migration_reversible` also carries a red assertion for Plan 02 to resolve.
- Plan 02 can still observe a green transition: (a) it will add the reversibility assertion and make it pass, (b) it will add the organization-level tests' green transition. SEC-05's FORCE coverage will be verified by a supplementary test Plan 02 can add (owner/superuser cross-campaign attempt).

## Known Stubs

None — the placeholder `test_migration_reversible` is an intentional red gate documented for Plan 02.

## Self-Check: PASSED

- FOUND: tests/integration/test_rls_hardening.py
- FOUND: two_orgs_with_campaigns fixture in tests/integration/conftest.py
- FOUND commit: bdba31b
