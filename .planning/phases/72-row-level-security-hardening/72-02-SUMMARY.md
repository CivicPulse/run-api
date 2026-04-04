---
phase: 72-row-level-security-hardening
plan: 02
subsystem: database-security
tags: [rls, security, alembic, force-rls, multi-tenant]
dependency-graph:
  requires: [72-01 (red test stubs + two_orgs_with_campaigns fixture)]
  provides: [migration 026_rls_hardening, FORCE RLS on core tables, RLS on organizations + organization_members]
  affects: [alembic/versions/, tests/integration/test_rls_hardening.py]
tech-stack:
  added: []
  patterns: [PostgreSQL FORCE ROW LEVEL SECURITY, campaign-scoped subquery policies]
key-files:
  created:
    - alembic/versions/026_rls_hardening.py
    - .planning/phases/72-row-level-security-hardening/deferred-items.md
  modified:
    - tests/integration/test_rls_hardening.py
decisions:
  - "Downgrade uses NO FORCE for C5 tables (preserves 001 policies) and DISABLE for C6 tables (restores pre-migration no-RLS state)"
  - "Migration reversibility test asserts pg_class/pg_policies state in-process; upgrade/downgrade cycle itself verified out-of-band via wave gate (subprocess alembic in async test is brittle)"
  - "Added test_force_blocks_table_owner_cross_campaign (SET ROLE app_user from superuser connection) to directly exercise FORCE semantics for SEC-05 per Wave 0 deviation note"
requirements: [SEC-05, SEC-06]
metrics:
  duration_minutes: 12
  completed: "2026-04-04"
---

# Phase 72 Plan 02: RLS Hardening Migration Summary

Shipped migration `026_rls_hardening.py` adding FORCE ROW LEVEL SECURITY to campaigns/campaign_members/users and ENABLE+FORCE+policy to organizations/organization_members; filled in 7 red test stubs and added an 8th FORCE-semantics test. All 8 tests green, reversibility verified.

## What Was Built

### Migration 026_rls_hardening.py
- **C5 (SEC-05):** `ALTER TABLE campaigns|campaign_members|users FORCE ROW LEVEL SECURITY` — closes the owner-bypass gap on the three initial-schema tables.
- **C6 (SEC-06):** `ENABLE + FORCE ROW LEVEL SECURITY` on `organizations` and `organization_members`, with isolation policies:
  - `organizations_isolation`: `id IN (SELECT organization_id FROM campaigns WHERE id = current_setting('app.current_campaign_id', true)::uuid)`
  - `organization_members_isolation`: same subquery against `organization_id`
- `GRANT SELECT, INSERT, UPDATE, DELETE` to `app_user` on both C6 tables.
- **Downgrade:** `NO FORCE` on C5 tables (preserves 001 policies), `DISABLE + DROP POLICY` on C6 tables (restores pre-migration no-RLS state).

### Test bodies (tests/integration/test_rls_hardening.py)
- Filled `test_migration_reversible`: asserts `pg_class.relforcerowsecurity=true` on all 5 target tables + both new policies present in `pg_policies` (via superuser_engine).
- Added `test_force_blocks_table_owner_cross_campaign` (8th test): uses `SET ROLE app_user` from superuser connection to directly exercise FORCE RLS, asserting cross-campaign org/campaign reads return zero.
- Other 6 test bodies were already implemented in Plan 01.

## Verification Results

| Check | Result |
|-------|--------|
| `python -m alembic upgrade head` | 026_rls_hardening applied cleanly |
| `pg_class.relforcerowsecurity` on 5 tables | all `t` post-upgrade |
| `pg_policies` shows 2 new policies | `organizations_isolation`, `organization_members_isolation` present |
| `python -m alembic downgrade -1` | Reverts cleanly; 5 tables show `relforcerowsecurity=f` |
| Pre-existing `campaign_isolation` policy on campaigns | Still present after downgrade (NO FORCE preserved it) |
| C6 tables post-downgrade | `relrowsecurity=f` + policies dropped (DISABLE worked) |
| `python -m alembic upgrade head` (re-upgrade) | Restores FORCE + policies |
| `pytest test_rls_hardening.py` | **8 passed** |
| `pytest test_rls_api_smoke.py test_tenant_isolation.py` | **27 passed** (no regressions) |
| `pytest -m integration` (full suite) | **93 passed, 1 failed** (failure is pre-existing, unrelated) |
| Ruff | Clean on migration + test file |

### Migration upgrade/downgrade/upgrade cycle log
```
025 -> 026 (upgrade)  → FORCE=t on 5 tables, policies present ✓
026 -> 025 (downgrade) → FORCE=f on 5 tables; campaign_isolation retained on campaigns ✓
025 -> 026 (upgrade)  → FORCE=t on 5 tables, policies present ✓
```

## Deviations from Plan

**1. [Rule 2 - Missing coverage] Added SET-ROLE FORCE test per Wave 0 note**
- **Found during:** Plan review (scope_note flagged gap)
- **Issue:** Existing tests verify app_user isolation via connection-level role, but don't exercise the FORCE flag's table-owner semantics directly. Without FORCE, an app_user with table grants could bypass RLS if it were also the table owner.
- **Fix:** Added `test_force_blocks_table_owner_cross_campaign` which uses `SET ROLE app_user` from a superuser connection — this exercises FORCE directly.
- **Files modified:** tests/integration/test_rls_hardening.py
- **Commit:** a704c7e

**2. [Rule 3 - Out of scope finding] Pre-existing canvassing test failure**
- **Found during:** Full integration suite regression check
- **Issue:** `test_canvassing_rls.py::test_door_knock_persists_survey_responses_for_authoritative_readback` fails with "Survey responses require a walk list with an attached survey script"
- **Verified pre-existing:** Same failure occurs before Plan 02 changes applied
- **Action:** Logged to `deferred-items.md`, not fixed (outside phase scope)

## Known Stubs

None.

## Commits

| Hash | Message |
|------|---------|
| a928774 | feat(72-02): add migration 026_rls_hardening (FORCE on core + RLS on org tables) |
| a704c7e | test(72-02): implement RLS hardening test bodies + owner cross-campaign FORCE test |

## Self-Check: PASSED

- FOUND: alembic/versions/026_rls_hardening.py
- FOUND: tests/integration/test_rls_hardening.py (8 tests)
- FOUND: .planning/phases/72-row-level-security-hardening/deferred-items.md
- FOUND commit: a928774
- FOUND commit: a704c7e
- VERIFIED: all 5 target tables show relforcerowsecurity=true at head
- VERIFIED: migration reversible (downgrade → upgrade cycle)
- VERIFIED: 8 hardening tests + 27 regression tests green
