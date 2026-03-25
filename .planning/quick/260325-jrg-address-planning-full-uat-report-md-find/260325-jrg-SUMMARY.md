---
phase: quick-260325-jrg
plan: 01
subsystem: tests
tags: [unit-tests, bug-fix, zitadel, mock-setup]
dependency_graph:
  requires: []
  provides: [passing-unit-tests]
  affects: [test_org_api.py, test_api_members.py, test_api_invites.py]
tech_stack:
  added: []
  patterns: [monkeypatch-settings-fixture, side-effect-mock-sequences]
key_files:
  created: []
  modified:
    - tests/unit/test_org_api.py
    - tests/unit/test_api_members.py
    - tests/unit/test_api_invites.py
decisions:
  - Used autouse monkeypatch fixture for zitadel_project_id instead of per-test patching
  - Used MagicMock with .id/.name attributes for campaign Row-like objects instead of namedtuples
metrics:
  duration: 4m 23s
  completed: 2026-03-25
---

# Quick Task 260325-jrg: Fix 5 Failing Unit Tests from UAT Report

Monkeypatched zitadel_project_id via autouse fixture and replaced single-return mock with side_effect sequence for multi-execute service calls.

## Changes Made

### Task 1: Fix org member test campaign list mock (199b561)

**Problem:** `TestListOrgMembers::test_returns_members` failed with `AttributeError: 'tuple' object has no attribute 'id'` because `mock_db.execute` returned the same mock for all 3 calls to `list_members_with_campaign_roles`.

**Fix:** Replaced `return_value=mock_result` with `side_effect=[members_result, campaigns_result, cm_result]` where:
- `members_result` returns `[(mock_member, mock_user_record)]`
- `campaigns_result` returns `[mock_campaign]` with `.id` and `.name` attributes
- `cm_result` returns `[]` (no campaign roles)

**Files modified:** `tests/unit/test_org_api.py`

### Task 2: Fix ZITADEL project_id assertions (9391ca6)

**Problem:** 4 tests across `test_api_members.py` and `test_api_invites.py` asserted `zitadel_project_id=""` (the config default) but `.env` sets `ZITADEL_PROJECT_ID=363436702133387300`, making tests environment-dependent.

**Fix:** Added autouse fixtures in both files that monkeypatch `settings.zitadel_project_id` to `TEST_PROJECT_ID`. Updated all assertions from `""` to `TEST_PROJECT_ID`.

**Tests fixed:**
1. `TestUpdateMemberRole::test_owner_can_update_role`
2. `TestTransferOwnership::test_owner_can_transfer`
3. `TestTransferOwnership::test_commit_failure_triggers_zitadel_rollback`
4. `TestAcceptInviteEndpoint::test_accept_invite_success`

**Files modified:** `tests/unit/test_api_members.py`, `tests/unit/test_api_invites.py`

## Verification Results

- All 20 tests across 3 affected files: PASSED
- Full unit test suite: 542 passed, 0 failures
- No production code changes (test-only fixes)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.
