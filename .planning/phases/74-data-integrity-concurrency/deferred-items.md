# Phase 74 — Deferred Items

## Pre-existing test failures (out of scope)

### TestListMembers (tests/unit/test_api_members.py)
- `test_returns_members_with_roles`
- `test_returns_member_explicit_role`

**Symptom:** `StopAsyncIteration` on `db.scalar(...)` for RLS context read
at `app/api/deps.py:112` inside `ensure_user_synced`.

**Root cause:** `list_members` route calls `ensure_user_synced` a second
time inside the route body (line 46). The test fixture `_sync_results()`
only mocks `db.execute`, not `db.scalar`. `ensure_user_synced` now does
1 scalar read (RLS context) + 3 execute calls. The test provides
`_sync_results() + _sync_results() + [mock_result]` for execute (6+1),
but mocks only 2 scalar items via `_setup_role_resolution`, which are
consumed by `resolve_campaign_role` — leaving none for the two
`ensure_user_synced` RLS scalar reads.

**Status:** Pre-existing on `gsd/v1.12-hardening-remediation` at HEAD
(confirmed via `git stash && pytest`). Unrelated to 74-03 C11
compensation scope.

**Ownership:** 74-04 (regression sweep) or dedicated test-infra fix.
