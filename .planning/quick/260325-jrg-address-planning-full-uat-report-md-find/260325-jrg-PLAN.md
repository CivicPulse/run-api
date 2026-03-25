---
phase: quick-260325-jrg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/unit/test_org_api.py
  - tests/unit/test_api_members.py
  - tests/unit/test_api_invites.py
autonomous: true
requirements: [UAT-1, UAT-2, UAT-3]
must_haves:
  truths:
    - "All 5 previously-failing unit tests pass"
    - "No regressions in existing passing tests across all 3 files"
    - "TS build and axe-core dependency confirmed already resolved"
  artifacts:
    - path: "tests/unit/test_org_api.py"
      provides: "Fixed campaign list mock with Row-like objects"
    - path: "tests/unit/test_api_members.py"
      provides: "Fixed ZITADEL project_id assertions"
    - path: "tests/unit/test_api_invites.py"
      provides: "Fixed ZITADEL project_id assertion"
  key_links:
    - from: "tests/unit/test_org_api.py"
      to: "app/services/org.py"
      via: "mock_db.execute side_effect returning Row-like objects"
      pattern: "execute.*side_effect"
    - from: "tests/unit/test_api_members.py"
      to: "app/core/config.py"
      via: "monkeypatched settings.zitadel_project_id"
      pattern: "monkeypatch.*zitadel_project_id"
---

<objective>
Fix 5 failing unit tests identified in FULL-UAT-REPORT.md (Issues 1 and partial Issue 2).

Two root causes:
1. `test_org_api.py::TestListOrgMembers::test_returns_members` — The `list_members_with_campaign_roles` service calls `db.execute()` multiple times but the mock returns a single result. The campaign query result needs Row-like objects with `.id` and `.name` attributes, but the mock returns raw tuples.
2. `test_api_members.py` (3 tests) + `test_api_invites.py` (1 test) — Tests assert `zitadel_project_id=""` (the default) but `.env` sets `ZITADEL_PROJECT_ID=363436702133387300`, so the actual call uses the real value.

Issues 2 (TS errors) and 3 (axe-core dep) from the report are already resolved — TS build is clean, `@axe-core/playwright` is in `web/package.json`.

Purpose: Bring unit test suite to 559/559 pass (from 554/559).
Output: 3 updated test files with all 5 tests passing.
</objective>

<execution_context>
@.planning/FULL-UAT-REPORT.md
</execution_context>

<context>
@app/services/org.py (lines 79-122 — list_members_with_campaign_roles accesses c.id and c.name on campaign_list items)
@app/core/config.py (line 29 — zitadel_project_id: str = "" default)
@tests/unit/test_org_api.py
@tests/unit/test_api_members.py
@tests/unit/test_api_invites.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix org member test campaign list mock</name>
  <files>tests/unit/test_org_api.py</files>
  <action>
Fix `TestListOrgMembers::test_returns_members` (around line 209).

The problem: `mock_db.execute = AsyncMock(return_value=mock_result)` returns the SAME mock for every `execute()` call. But `list_members_with_campaign_roles` calls `execute` 3+ times:
1. `list_members()` — returns `[(member, user)]`
2. Campaign list — returns rows with `.id` and `.name` attributes
3. Per-member CampaignMember lookup — returns rows with `.campaign_id` and `.role`

Fix by using `side_effect` to return different mocks for each call:

```python
# 1. Members result (existing)
members_result = MagicMock()
members_result.all.return_value = [(mock_member, mock_user_record)]

# 2. Campaign list result — use MagicMock with .id and .name (not tuples)
mock_campaign = MagicMock()
mock_campaign.id = uuid.uuid4()  # use a real UUID
mock_campaign.name = "Test Campaign"
campaigns_result = MagicMock()
campaigns_result.all.return_value = [mock_campaign]

# 3. Campaign member result (empty — no campaign roles for this member)
cm_result = MagicMock()
cm_result.all.return_value = []

mock_db.execute = AsyncMock(side_effect=[members_result, campaigns_result, cm_result])
```

This matches the actual call sequence in `org.py:73` (members), `org.py:86` (campaigns), `org.py:103` (campaign members per user).
  </action>
  <verify>
    <automated>uv run pytest tests/unit/test_org_api.py::TestListOrgMembers::test_returns_members -xvs</automated>
  </verify>
  <done>test_returns_members passes without AttributeError</done>
</task>

<task type="auto">
  <name>Task 2: Fix ZITADEL project_id assertions in members and invites tests</name>
  <files>tests/unit/test_api_members.py, tests/unit/test_api_invites.py</files>
  <action>
Four tests assert `zitadel_project_id=""` but `.env` sets it to `363436702133387300`. The tests need to be environment-independent.

**In `test_api_members.py`**, add a module-level or class-level fixture that monkeypatches `settings.zitadel_project_id` to a known test value. Use `monkeypatch` or direct attribute set on the settings singleton:

Add an autouse fixture at the top of the file (after imports):

```python
from app.core.config import settings

TEST_PROJECT_ID = "test-project-id"

@pytest.fixture(autouse=True)
def _patch_project_id(monkeypatch):
    monkeypatch.setattr(settings, "zitadel_project_id", TEST_PROJECT_ID)
```

Then update the 3 failing assertions:

1. `TestUpdateMemberRole::test_owner_can_update_role` (line 215-224): Change `""` to `TEST_PROJECT_ID` in both `remove_all_project_roles` and `assign_project_role` assertions.

2. `TestTransferOwnership::test_owner_can_transfer` (line 341-352): Change all 4 occurrences of `""` to `TEST_PROJECT_ID` in `remove_project_role` and `assign_project_role` assertions.

3. `TestTransferOwnership::test_commit_failure_triggers_zitadel_rollback`: Find the assertion with `""` and change to `TEST_PROJECT_ID`.

**In `test_api_invites.py`**, apply the same pattern:

```python
from app.core.config import settings

TEST_PROJECT_ID = "test-project-id"

@pytest.fixture(autouse=True)
def _patch_project_id(monkeypatch):
    monkeypatch.setattr(settings, "zitadel_project_id", TEST_PROJECT_ID)
```

Update `TestAcceptInviteEndpoint::test_accept_invite_success` (line 195-200): Change `""` to `TEST_PROJECT_ID`.

This makes tests environment-independent regardless of what `.env` contains.
  </action>
  <verify>
    <automated>uv run pytest tests/unit/test_api_members.py tests/unit/test_api_invites.py -xvs</automated>
  </verify>
  <done>All 4 previously-failing tests pass; all other tests in both files still pass</done>
</task>

</tasks>

<verification>
Run all 3 affected test files together to confirm no regressions:

```bash
uv run pytest tests/unit/test_org_api.py tests/unit/test_api_members.py tests/unit/test_api_invites.py -v
```

Then run the full unit test suite to confirm 559/559:

```bash
uv run pytest tests/unit/ --tb=short
```
</verification>

<success_criteria>
- 5 previously-failing tests now pass
- Full unit test suite: 559/559 pass (0 failures)
- No changes to production code (test-only fixes)
</success_criteria>

<output>
After completion, create `.planning/quick/260325-jrg-address-planning-full-uat-report-md-find/260325-jrg-SUMMARY.md`
</output>
