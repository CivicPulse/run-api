---
phase: 74-data-integrity-concurrency
plan: 03
subsystem: auth/invite + members API
tags: [compensating-transaction, zitadel, c11, data-03]
requires:
  - app/services/zitadel.ZitadelService.remove_project_role
  - app/services/zitadel.ZitadelService.assign_project_role
provides:
  - app/services/invite.py:accept_invite (commit-failure ZITADEL rollback)
  - app/api/v1/members.py:transfer_ownership (4 inverse ops on commit failure)
affects:
  - tests/unit/test_invite_service.py
  - tests/unit/test_api_members.py
tech-stack:
  added: []
  patterns: [compensating-transaction, try-except-rollback-raise]
key-files:
  created: []
  modified:
    - app/services/invite.py
    - app/api/v1/members.py
    - tests/unit/test_invite_service.py
    - tests/unit/test_api_members.py
decisions:
  - "Role-swap edge case (old_role → new_role) compensates only new role grant per RESEARCH Open Question 2"
  - "Each compensation step in transfer_ownership wrapped in its own try/except so partial failure does not abort subsequent reversal steps"
  - "Original commit exception always propagates; cleanup errors logged but never mask the commit error"
  - "Added RLS context scalar mock to _setup_role_resolution fixture (pre-existing gap exposed by 74-01 RLS hardening)"
metrics:
  duration: "~25min"
  completed: 2026-04-04
requirements: [DATA-03]
---

# Phase 74 Plan 03: C11 Compensating Transaction Summary

Add compensating-transaction handling to the two ZITADEL-touching code paths
that can leave orphaned role grants on DB commit failure: `accept_invite`
(invite service) and `transfer_ownership` (members route). Both now mirror
the existing compensating pattern in `app/services/join.py:199-225`.

## Tasks Completed

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 | accept_invite compensating tx | 22eeca8 (RED), db3f0e7 (GREEN) | app/services/invite.py, tests/unit/test_invite_service.py |
| 2 | transfer_ownership compensation block | 628a198 (RED), 9103cb2 (GREEN) | app/api/v1/members.py, tests/unit/test_api_members.py |

## What Changed

### `app/services/invite.py:accept_invite`
Wrapped `db.commit()` + `db.refresh()` in try/except. On commit failure:
1. Log error with invite_id
2. `await db.rollback()`
3. Call `zitadel.remove_project_role(project_id, user.id, invite.role, org_id=zitadel_org_id)` to roll back the freshly-granted role
4. If cleanup itself fails, log secondary error
5. Re-raise original commit exception

### `app/api/v1/members.py:transfer_ownership`
Replaced empty `pass` (H3) at the existing try/except compensation block
with 4 inverse ZITADEL calls in reverse order:

| Order | Forward op (:302-328) | Inverse (compensation) |
|-------|-----------------------|------------------------|
| 1 | remove `owner` from current user | re-grant `owner` to current user (step 4) |
| 2 | assign `admin` to current user | remove `admin` from current user (step 3) |
| 3 | remove `target_old_role` from target | re-grant `target_old_role` to target (step 2) |
| 4 | assign `owner` to target | remove `owner` from target (step 1) |

Each inverse op is wrapped in its own `try/except` so one compensation
failure doesn't prevent subsequent reversals. Original commit exception
always re-raised at the end.

## Tests Added

### `tests/unit/test_invite_service.py`
- `test_accept_commit_failure_removes_role` — verifies rollback + single
  `remove_project_role` call with correct args, original exception propagates
- `test_accept_commit_failure_cleanup_also_fails` — verifies commit error
  surfaces even when cleanup itself raises

### `tests/unit/test_api_members.py`
- `test_commit_failure_triggers_zitadel_rollback` (updated) — asserts 4 forward
  + 4 inverse ZITADEL calls (8 total) on commit failure
- `test_transfer_ownership_partial_compensation_failure` (new) — simulates
  3rd ZITADEL call failing mid-compensation; verifies remaining 3 still fire

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added RLS context scalar to `_setup_role_resolution`**
- **Found during:** Task 2 RED (running new test)
- **Issue:** All 4 `TestTransferOwnership` tests were failing on HEAD with
  `StopAsyncIteration` at `security.py:241`. Root cause: `ensure_user_synced`
  now reads `app.current_campaign_id` via `db.scalar(...)` before the known
  2 scalars consumed by `resolve_campaign_role`, but the test fixture only
  mocked 2 scalar items.
- **Fix:** Prepended an empty-string scalar result to `_setup_role_resolution`
  for the RLS context read. This fixes `test_owner_can_transfer`,
  `test_non_owner_cannot_transfer`, `test_commit_failure_triggers_zitadel_rollback`,
  and the new `test_transfer_ownership_partial_compensation_failure`.
- **Files modified:** tests/unit/test_api_members.py
- **Commit:** 628a198

### Deferred Issues

Two pre-existing test failures in `TestListMembers` (test_returns_members_with_roles,
test_returns_member_explicit_role) were left unfixed — they fail because the
`list_members` route calls `ensure_user_synced` a second time inside the route
body, requiring additional mock scalar results. This is out of 74-03 scope and
logged in `.planning/phases/74-data-integrity-concurrency/deferred-items.md`.

## Verification

```
$ uv run pytest tests/unit/test_invite_service.py tests/unit/test_api_members.py::TestTransferOwnership -v
16 passed

$ uv run ruff check app/services/invite.py app/api/v1/members.py \
    tests/unit/test_invite_service.py tests/unit/test_api_members.py
All checks passed!
```

## Self-Check: PASSED

- app/services/invite.py — modified (compensating tx in accept_invite)
- app/api/v1/members.py — modified (4 inverse ZITADEL calls)
- tests/unit/test_invite_service.py — modified (2 new tests)
- tests/unit/test_api_members.py — modified (1 updated + 1 new test)
- Commits 22eeca8, db3f0e7, 628a198, 9103cb2 all present in git log
