# Phase 71: Tenant Isolation — Service & Route Scoping - Research

**Researched:** 2026-04-04
**Domain:** Multi-tenant FastAPI service/route authorization (IDOR closure)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Enforcement Pattern & Error Handling**
- Enforce campaign scoping at the **service layer**: add `campaign_id` predicate to every query in `VoterListService`, `InviteService.revoke_invite`, `ImportJob` lookups, `voter_tags.add_tag`, and surveys script/question services.
- Cross-campaign access returns **404 Not Found** (prevents UUID enumeration attacks), not 403.
- `list_campaigns` filters to **campaigns where the requesting user has a CampaignMember row** — strict membership-based visibility, no org-wide fallback.
- Use **inline guards** (`if obj is None or obj.campaign_id != campaign_id: raise HTTPException(404)`) per service method. No shared `_assert_campaign_scope` helper — matches review fixes exactly, zero new abstraction.

**Test Strategy**
- **Integration tests** (not unit tests) using FastAPI TestClient to prove full route+service enforcement.
- **Two-campaign fixture** in shared conftest: Campaign A (with admin user), Campaign B (with volunteer user). Cross-campaign attacks executed as Campaign A's admin attempting to reach Campaign B resources.
- **One test per affected endpoint** (~15 tests total). Both positive (same-campaign 2xx) and negative (cross-campaign 404) assertions.

### Claude's Discretion
- Exact test file organization (single `test_tenant_isolation.py` vs. per-service test files).
- Whether to add defensive `campaign_id` filter at route layer as well (defer to service-layer-only unless route shape makes route-layer checks simpler).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. RLS enforcement at the DB layer is Phase 72's responsibility.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | `list_campaigns` returns only campaigns the requesting user has membership in or shared org with (C1) | `list_campaigns` signature must accept `user`, join `CampaignMember` on `user_id == user.id`. Existing service method at `app/services/campaign.py:230`. |
| SEC-02 | All `VoterListService` methods scope queries by both `list_id` and `campaign_id`, blocking cross-campaign read/update/delete (C2) | 5 methods need `campaign_id` predicate: `get_list`, `update_list`, `delete_list`, `add_members`, `remove_members`. Plus `list_lists` and `get_list_voters`. |
| SEC-03 | All `ImportJob` routes validate the job belongs to the path's `campaign_id` before any action (C3) | 4 routes: `detect_columns:184`, `confirm_mapping:277`, `cancel_import:351`, `get_import_status:401`. Pattern already correct in `delete_import:448`. |
| SEC-04 | `revoke_invite` service validates invite belongs to the path's `campaign_id` before revoking (C4) | Service at `app/services/invite.py:240`, route at `app/api/v1/invites.py:98`. Service currently does not accept `campaign_id`. |
| SEC-13 | `voter_tags.add_tag` and `surveys` script/question routes validate sub-resources belong to the path `campaign_id` (H4, H5) | `add_tag_to_voter` at `app/services/voter.py:623` (no campaign check), survey `get_script/update_script/delete_script/add_question/update_question/delete_question/reorder_questions/list_questions` all missing campaign check. |
</phase_requirements>

## Summary

Every IDOR vulnerability listed (C1–C4, H4–H5) shares the same pattern: a service method fetches an object by primary key alone (`db.get(Model, id)` or `select(Model).where(Model.id == id)`) with no `campaign_id` predicate. Routes accept `campaign_id` in the URL path but never pass it to the service. The fix is mechanical and repetitive — every affected service method must accept `campaign_id` and either embed it in the `WHERE` clause or verify it post-fetch, and every caller must pass it through.

The codebase has exemplary reference implementations: `delete_import` at `app/api/v1/imports.py:448` ("if job is None or job.campaign_id != campaign_id: raise 404") and `survey.list_scripts`/`list_tags`/`list_invites` which already filter by `campaign_id`. A `two_campaigns` fixture (at `tests/integration/conftest.py:82`) and a full FastAPI-with-auth-bypass test harness (`_make_app_for_campaign` in `tests/integration/test_rls_api_smoke.py:191`) already exist. No new infrastructure is needed.

The only non-mechanical decision is `list_campaigns`: its current signature `(db, limit, cursor)` does not accept a user. The route must start passing `user` (already available via `require_role("viewer")`) and the service must `JOIN campaign_members ON campaign_id = campaigns.id AND user_id = :user_id`.

**Primary recommendation:** Use **Option A**: service methods accept `campaign_id: uuid.UUID` as an additional argument and add it to the `WHERE` clause directly (`.where(VoterList.id == list_id, VoterList.campaign_id == campaign_id)`) returning None/raising on miss. This is a single atomic SQL check, is faster than fetch-then-compare, and is already the pattern used in survey list methods and `list_tags`. The code review (C3) fix snippet shows Option B (post-fetch compare) — that's acceptable for `ImportJob` routes where the existing code is already `db.get(ImportJob, id)` (the review's chosen pattern), but new service method signature changes should prefer the WHERE-clause form.

## Standard Stack

No new libraries required. All dependencies already in the project.

### Core (already present)
| Library | Version | Purpose |
|---------|---------|---------|
| FastAPI | (existing) | `HTTPException(status_code=404)` — standard not-found response |
| SQLAlchemy | (existing async) | `select().where(and_(...))` — query building |
| pytest-asyncio | (existing, `asyncio_mode=auto`) | Integration test runner |
| httpx | (existing) | `AsyncClient` + `ASGITransport` for in-process FastAPI testing |

### Alternatives Considered
| Instead of | Could Use | Why we're NOT using it |
|------------|-----------|------------------------|
| Inline guards per method | Shared `_assert_campaign_scope(obj, campaign_id)` helper | User decision: zero new abstraction. Matches review fix snippets exactly. |
| 404 on cross-campaign | 403 Forbidden | User decision: 404 prevents UUID enumeration attacks. |
| Composite WHERE clause | Fetch + post-compare | For C3 (ImportJob routes), keep existing `db.get` + compare; for new service signatures (C2/C4/H4/H5), prefer composite WHERE. |

## Architecture Patterns

### Reference Pattern 1 — ALREADY-CORRECT Composite WHERE (use for VoterList/Invite/tags/surveys)

```python
# From app/services/invite.py:282 (list_invites — already scoped)
result = await db.execute(
    select(Invite).where(
        and_(
            Invite.campaign_id == campaign_id,
            Invite.accepted_at.is_(None),
            ...
        )
    )
)
```

```python
# From app/services/voter.py:564 (list_tags — already scoped)
result = await db.execute(
    select(VoterTag).where(VoterTag.campaign_id == campaign_id)
)
```

### Reference Pattern 2 — Fetch + post-compare (use for ImportJob routes)

```python
# From app/api/v1/imports.py:447 (delete_import — already correct)
job = await db.get(ImportJob, import_id)
if job is None or job.campaign_id != campaign_id:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Import job not found",
    )
```

### Reference Pattern 3 — JOIN CampaignMember for list_campaigns

```python
# New pattern for app/services/campaign.py:230 list_campaigns
from app.models.campaign_member import CampaignMember

query = (
    select(Campaign)
    .join(CampaignMember, CampaignMember.campaign_id == Campaign.id)
    .where(
        Campaign.status != CampaignStatus.DELETED,
        CampaignMember.user_id == user.id,
    )
    .order_by(Campaign.created_at.desc(), Campaign.id.desc())
)
```

### Anti-Patterns to Avoid
- **Post-fetch 200 return with filtering**: don't fetch by id, then silently return empty body — always raise 404.
- **Hiding 404 as generic `{detail: "Not found"}`**: fine for enumeration safety, but don't log-leak campaign mismatches at WARNING level (keep at DEBUG/INFO).
- **Forgetting the route-layer pass-through**: the route must forward `campaign_id` from the path — service changes alone won't help if the caller passes `None`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Scoped fetch helper | Custom `get_scoped(session, Model, id, campaign_id)` generic | Inline the composite WHERE per review fix (user decision) |
| Test setup | Custom per-test campaign-seed logic | Existing `two_campaigns` fixture at `tests/integration/conftest.py:82` |
| Auth bypass for tests | Custom JWT mock | Existing `_make_app_for_campaign` helper at `tests/integration/test_rls_api_smoke.py:191` — overrides `get_current_user`, `get_db`, `get_campaign_db` |

## File-Specific Inventory — Every Change Required

### C1 — `list_campaigns` scoping (SEC-01)

**Service:** `app/services/campaign.py:230`
- **Current signature:** `async def list_campaigns(self, db, limit=20, cursor=None) -> tuple[list[Campaign], PaginationResponse]`
- **New signature:** `async def list_campaigns(self, db, user: AuthenticatedUser, limit=20, cursor=None)`
- **Change:** Add `.join(CampaignMember, CampaignMember.campaign_id == Campaign.id)` and `.where(CampaignMember.user_id == user.id)` to the query at line 248.
- **Import:** Add `from app.models.campaign_member import CampaignMember` (already imported at line 24).

**Route:** `app/api/v1/campaigns.py:81` (list_campaigns)
- **Change line 93:** `items, pagination = await _service.list_campaigns(db=db, user=user, limit=limit, cursor=cursor)`
- User is already bound via `Depends(require_role("viewer"))` at line 85.

**Callers to verify:** `tests/unit/test_campaign_list.py:53,69,81` and `tests/unit/test_campaign_service.py:367` — will need updated mock calls.

### C2 — VoterListService scoping (SEC-02)

**Service:** `app/services/voter_list.py` — seven methods need `campaign_id: uuid.UUID` parameter:

| Line | Method | Current Signature | Fix |
|------|--------|-------------------|-----|
| 53 | `get_list` | `(db, list_id)` | Add `campaign_id`; change WHERE to `VoterList.id == list_id, VoterList.campaign_id == campaign_id` |
| 77 | `update_list` | `(db, list_id, data)` | Add `campaign_id`; pass to `get_list` (refactor to accept scope) |
| 105 | `delete_list` | `(db, list_id)` | Add `campaign_id`; pass to `get_list` |
| 127 | `list_lists` | `(db, cursor, limit)` | Add `campaign_id` param + WHERE predicate (currently tenant-scan!) |
| 176 | `add_members` | `(db, list_id, voter_ids)` | Add `campaign_id`; pass to `get_list` |
| 202 | `remove_members` | `(db, list_id, voter_ids)` | Add `campaign_id`; pass to `get_list` |
| 233 | `get_list_voters` | `(db, list_id, cursor, limit)` | Add `campaign_id`; pass to `get_list` |

**Route:** `app/api/v1/voter_lists.py` — seven call sites need `campaign_id` forwarded:
- Line 43 (`create_list` — already correct)
- Line 65 (`list_lists`): change to `_service.list_lists(db, campaign_id, cursor=cursor, limit=limit)`
- Line 90 (`get_list`): change to `_service.get_list(db, list_id, campaign_id)`
- Line 115 (`update_list`): add `campaign_id` kwarg
- Line 139 (`delete_list`): add `campaign_id` kwarg
- Line 167 (`get_list_voters`): add `campaign_id` kwarg
- Line 191 (`add_members`): add `campaign_id` kwarg
- Line 216 (`remove_members`): add `campaign_id` kwarg

**Error handling:** All service methods raise `ValueError("Voter list ... not found")` when scalar is None. Routes catch ValueError and re-raise as `VoterListNotFoundError(list_id)` (which maps to 404). Keep this path — cross-campaign mismatch simply returns None → ValueError → 404.

### C3 — ImportJob route scoping (SEC-03)

**Route file:** `app/api/v1/imports.py` — four routes use `db.get(ImportJob, import_id)` without campaign check:

| Line | Route | Fix |
|------|-------|-----|
| 184 | `detect_columns` | After `db.get`, add `or job.campaign_id != campaign_id` to the None-check |
| 272 | `confirm_mapping` | Same |
| 351 | `cancel_import` | Same |
| 400 | `get_import_status` | Same |

**Reference fix (already applied at line 447):**
```python
if job is None or job.campaign_id != campaign_id:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Import job not found",
    )
```

**Also check:** `detect_columns` at line 213 fetches `FieldMappingTemplate` via `db.get` — templates can be system-wide (`campaign_id IS NULL`) or campaign-scoped. Reject templates belonging to a different campaign: `if template is None or (template.campaign_id is not None and template.campaign_id != campaign_id): raise 404`.

### C4 — Invite.revoke_invite scoping (SEC-04)

**Service:** `app/services/invite.py:240`
- **Current signature:** `async def revoke_invite(self, db, invite_id)`
- **New signature:** `async def revoke_invite(self, db, invite_id, campaign_id)`
- **Change query at line 257:** `select(Invite).where(Invite.id == invite_id, Invite.campaign_id == campaign_id)`

**Route:** `app/api/v1/invites.py:98` (revoke_invite)
- **Change line 107:** `await invite_service.revoke_invite(db, invite_id, campaign_id)`
- Remove the `# noqa: ARG001` on `campaign_id` at line 100 (it's now used).

### H4/H5 / SEC-13 — voter_tags.add_tag and surveys script/question routes

**voter_tags.add_tag (H4):**

**Service:** `app/services/voter.py:623` (`add_tag_to_voter`)
- **Current signature:** `(db, voter_id, tag_id)` — no campaign check; inserts blindly.
- **New signature:** `(db, voter_id, tag_id, campaign_id)`
- **Required logic:** Before inserting `VoterTagMember`, verify BOTH the voter AND the tag belong to `campaign_id`:
  ```python
  tag = await db.scalar(
      select(VoterTag).where(VoterTag.id == tag_id, VoterTag.campaign_id == campaign_id)
  )
  if tag is None:
      raise ValueError(f"Tag {tag_id} not found")
  voter = await db.scalar(
      select(Voter.id).where(Voter.id == voter_id, Voter.campaign_id == campaign_id)
  )
  if voter is None:
      raise ValueError(f"Voter {voter_id} not found")
  ```
- **Route:** `app/api/v1/voter_tags.py:129` (`add_tag_to_voter`) — add `campaign_id` to service call.

**Also scope these sibling methods in `VoterService`:**
- `update_tag` (line 583) — add `campaign_id`, add WHERE `VoterTag.campaign_id == campaign_id`. Route at `voter_tags.py:86`.
- `delete_tag` (line 608) — add `campaign_id`, scope DELETE. Route at `voter_tags.py:107`.
- `remove_tag_from_voter` (line 640) — add `campaign_id`, verify voter+tag both belong to campaign. Route at `voter_tags.py:151`.
- `get_voter_tags` (line 663) — add `campaign_id`, constrain JOIN. Route at `voter_tags.py:172`.

**surveys script/question routes (H5):**

**Service:** `app/services/survey.py`
- `get_script` (line 87) — add `campaign_id`, change WHERE to `SurveyScript.id == script_id, SurveyScript.campaign_id == campaign_id`.
- `update_script` (line 163) — add `campaign_id`, pass to `get_script`.
- `delete_script` (line 210) — add `campaign_id`, pass to `get_script`.
- `add_question` (line 239) — add `campaign_id`, pass to `get_script` for script ownership check.
- `update_question` (line 290) — add `campaign_id`, verify the question's parent script belongs to the campaign.
- `delete_question` (line 329) — same as update_question.
- `reorder_questions` (line 352) — add `campaign_id`, pass to `get_script`.
- `list_questions` (line 397) — add `campaign_id`, add a subquery or join against `SurveyScript.campaign_id`.

**Route:** `app/api/v1/surveys.py` — every call site passes `campaign_id` already in path:
- Line 125 (`get_script`)
- Line 157 (`update_script`)
- Line 186 (`delete_script`)
- Line 220 (`add_question`)
- Line 251 (`update_question`)
- Line 281 (`delete_question`)
- Line 309 (`reorder_questions`)
- Line 132 (`list_questions` — called from `get_script`)

Also verify `SurveyService._get_question` (used by update_question/delete_question) — the question's parent `script_id` → `SurveyScript.campaign_id` join must be enforced. Check `app/services/survey.py` for the private helper.

## Test Strategy — Concrete Fixture and File Plan

### Existing Test Infrastructure (REUSE, do not rebuild)

| Asset | Location | Provides |
|-------|----------|----------|
| `two_campaigns` fixture | `tests/integration/conftest.py:82` | Campaign A+B, User A+B, CampaignMember rows, one Invite per campaign |
| `superuser_session`, `app_user_engine`, `superuser_engine` | `tests/integration/conftest.py` | DB connections for RLS + superuser setup |
| `_make_app_for_campaign` helper | `tests/integration/test_rls_api_smoke.py:191` | FastAPI app with `get_current_user` override, configurable role, RLS-enforced session |
| `make_jwt` helper | `tests/conftest.py:77` | (not needed — use auth bypass pattern from test_rls_api_smoke) |

### Fixture Extension Needed

The existing `two_campaigns` fixture only creates campaigns+members+invites. For Phase 71 we need to extend it (or create a sibling fixture `two_campaigns_with_resources`) to also insert:
- One `VoterList` per campaign (static type, no members required)
- One `ImportJob` per campaign (status=UPLOADED, minimal fields)
- One `VoterTag` per campaign
- One `Voter` per campaign (for tag assignment tests)
- One `SurveyScript` per campaign (status=DRAFT)
- One `SurveyQuestion` per campaign's script

Follow the exact SQL-INSERT pattern of `two_campaigns_with_api_data` at `tests/integration/test_rls_api_smoke.py:32`. Insertion and cleanup use raw SQL via `superuser_session` to bypass RLS during setup.

### Test File Organization (Claude's discretion — recommendation)

**Recommendation: single file `tests/integration/test_tenant_isolation.py`** with test classes grouped by C-finding:

```
tests/integration/test_tenant_isolation.py
├── class TestListCampaignsScoping (C1/SEC-01)
├── class TestVoterListScoping (C2/SEC-02)
├── class TestImportJobScoping (C3/SEC-03)
├── class TestRevokeInviteScoping (C4/SEC-04)
├── class TestVoterTagScoping (H4/SEC-13)
└── class TestSurveyScoping (H5/SEC-13)
```

**Rationale:** The fixture `two_campaigns_with_resources` is shared across all classes, test count (~15) is small enough for a single file, and grouping by C-finding matches review traceability.

### Required Test Cases (one positive + one negative per endpoint)

| # | Test | Endpoint | Setup | Positive assertion | Negative assertion |
|---|------|----------|-------|--------------------|--------------------|
| 1 | `test_list_campaigns_returns_only_user_memberships` | `GET /api/v1/campaigns` | User A | Campaign A in response | Campaign B NOT in response |
| 2 | `test_get_voter_list_same_campaign_ok` | `GET /campaigns/{A}/lists/{list_A}` | User A | 200, list returned | — |
| 3 | `test_get_voter_list_cross_campaign_404` | `GET /campaigns/{A}/lists/{list_B}` | User A | — | 404 |
| 4 | `test_update_voter_list_cross_campaign_404` | `PATCH /campaigns/{A}/lists/{list_B}` | User A | — | 404 |
| 5 | `test_delete_voter_list_cross_campaign_404` | `DELETE /campaigns/{A}/lists/{list_B}` | User A | — | 404 |
| 6 | `test_add_members_cross_campaign_404` | `POST /campaigns/{A}/lists/{list_B}/members` | User A | — | 404 |
| 7 | `test_remove_members_cross_campaign_404` | `DELETE /campaigns/{A}/lists/{list_B}/members` | User A | — | 404 |
| 8 | `test_import_detect_cross_campaign_404` | `POST /campaigns/{A}/imports/{job_B}/detect` | User A | — | 404 |
| 9 | `test_import_confirm_cross_campaign_404` | `POST /campaigns/{A}/imports/{job_B}/confirm` | User A | — | 404 |
| 10 | `test_import_cancel_cross_campaign_404` | `POST /campaigns/{A}/imports/{job_B}/cancel` | User A | — | 404 |
| 11 | `test_import_status_cross_campaign_404` | `GET /campaigns/{A}/imports/{job_B}` | User A | — | 404 |
| 12 | `test_revoke_invite_cross_campaign_404` | `DELETE /campaigns/{A}/invites/{invite_B}` | User A | — | 404 |
| 13 | `test_add_tag_to_voter_cross_campaign_404` | `POST /campaigns/{A}/voters/{voter_A}/tags` with `tag_B.id` | User A | — | 404 (tag belongs to B) |
| 14 | `test_get_script_cross_campaign_404` | `GET /campaigns/{A}/surveys/{script_B}` | User A | — | 404 |
| 15 | `test_update_script_cross_campaign_404` | `PATCH /campaigns/{A}/surveys/{script_B}` | User A | — | 404 |
| 16 | `test_add_question_cross_campaign_404` | `POST /campaigns/{A}/surveys/{script_B}/questions` | User A | — | 404 |
| 17 | `test_update_question_cross_campaign_404` | `PATCH /campaigns/{A}/surveys/{script_A}/questions/{q_B}` | User A | — | 404 |

**Positive-path tests:** For each service method that gains a `campaign_id` parameter, keep one "same-campaign" happy-path test (already covered by `test_voter_list_scoped_to_campaign` pattern). The existing unit tests at `tests/unit/test_campaign_list.py` and `tests/unit/test_campaign_service.py` will need mock updates for the new `user` argument.

### Test Execution Command

```bash
docker compose exec api bash -c "uv run pytest tests/integration/test_tenant_isolation.py -x -v"
```

Or the equivalent full integration run:
```bash
uv run pytest tests/integration/ -m integration -x -v
```

## Common Pitfalls

### Pitfall 1: Unit Tests Break When `list_campaigns` Gains `user` Argument
**What goes wrong:** `tests/unit/test_campaign_list.py:53,69,81` and `tests/unit/test_campaign_service.py:367` call `service.list_campaigns(db=db, limit=20)` without a user. After the signature change these fail.
**How to avoid:** Update mock calls in Wave 0 at the same time as the service-signature change. Add a `mock_user` fixture (AuthenticatedUser with fixed id).

### Pitfall 2: `SurveyService._get_question` Bypasses Campaign Check
**What goes wrong:** `update_question`/`delete_question` use a private `_get_question` helper that fetches by `question_id` alone. Adding `campaign_id` to the public methods but not plumbing it through `_get_question` leaves a gap.
**How to avoid:** Refactor `_get_question` to accept `campaign_id` and JOIN on `SurveyScript.campaign_id == campaign_id`. Or replace private helper usage with an inline scoped query.

### Pitfall 3: `reorder_questions` Already Scopes by `script_id` — But Script Itself Isn't Scoped
**What goes wrong:** `reorder_questions` at line 384 filters by `SurveyQuestion.script_id == script_id`, but if the user passes another campaign's script_id, the query still "works" because the scoping only applies to questions-within-script, not script-to-campaign.
**How to avoid:** Make sure `get_script(session, script_id, campaign_id)` is called at the top of `reorder_questions` to verify ownership.

### Pitfall 4: `list_lists` is a Full Tenant Scan Today
**What goes wrong:** `VoterListService.list_lists` at line 127 has NO WHERE clause — it returns every voter list across every tenant. The route passes `campaign_id` from URL but the service ignores it.
**How to avoid:** This is the most severe bug in C2. Must add `.where(VoterList.campaign_id == campaign_id)` — do not just fix `get_list` and assume `list_lists` is OK.

### Pitfall 5: `detect_columns` Fetches FieldMappingTemplate Cross-Tenant
**What goes wrong:** Template fetch at `app/api/v1/imports.py:213` uses `db.get(FieldMappingTemplate, template_id)` with no campaign check. A user could apply Campaign B's custom template to Campaign A's import (data leak of mapping, though not voter data).
**How to avoid:** After fetching, check `template.campaign_id is None or template.campaign_id == campaign_id` — system templates (campaign_id=NULL) are allowed.

### Pitfall 6: Route Layer Still Passes Unused `campaign_id`
**What goes wrong:** The existing `revoke_invite` route at `app/api/v1/invites.py:100` has `# noqa: ARG001` on `campaign_id` because it wasn't used. After the fix it WILL be used — forgetting to remove the noqa leaves a stale annotation.
**How to avoid:** Strip `# noqa: ARG001` from every parameter we now forward to the service.

### Pitfall 7: 404 vs. "Not found" Details Leak Information
**What goes wrong:** Returning `{detail: "Import job abc123 belongs to campaign B, not A"}` reveals that the UUID exists. User decision says 404 to prevent enumeration — match that by keeping detail generic ("Import job not found") as `delete_import` already does.
**How to avoid:** Copy the exact `detail="Import job not found"` string; don't add context.

## Runtime State Inventory

**Category: Stored data** — None. Code-only change; no data migration.

**Category: Live service config** — None. No external service config references these endpoints by name.

**Category: OS-registered state** — None.

**Category: Secrets/env vars** — None.

**Category: Build artifacts** — None. Pure Python source changes; pytest runs in-process via `uv run`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL + PostGIS | Integration tests, DB fixtures | ✓ (docker compose) | 16+ (existing compose file) | — |
| `uv` | Run Python / pytest | ✓ | per CLAUDE.md | — |
| Ruff | Lint before commit | ✓ | per CLAUDE.md | — |
| Docker Compose | Run integration test DB at :5433 | ✓ | — | — |

**All dependencies available.** No blockers.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (`asyncio_mode=auto`) |
| Config file | `pyproject.toml` `[tool.pytest.ini_options]` (line 57) |
| Markers | `integration` (DB-required), `e2e` |
| Quick run (per-test) | `docker compose exec api bash -c "uv run pytest tests/integration/test_tenant_isolation.py::TestVoterListScoping -x"` |
| Full suite | `docker compose exec api bash -c "uv run pytest tests/integration/ -m integration -x"` |
| Lint check | `uv run ruff check app/ tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | list_campaigns membership filter | integration | `pytest tests/integration/test_tenant_isolation.py::TestListCampaignsScoping -x` | ❌ Wave 0 |
| SEC-02 | VoterList 7 methods scoped | integration | `pytest tests/integration/test_tenant_isolation.py::TestVoterListScoping -x` | ❌ Wave 0 |
| SEC-03 | 4 ImportJob routes scoped | integration | `pytest tests/integration/test_tenant_isolation.py::TestImportJobScoping -x` | ❌ Wave 0 |
| SEC-04 | revoke_invite scoped | integration | `pytest tests/integration/test_tenant_isolation.py::TestRevokeInviteScoping -x` | ❌ Wave 0 |
| SEC-13 | voter_tags + surveys scoped | integration | `pytest tests/integration/test_tenant_isolation.py::TestVoterTagScoping tests/integration/test_tenant_isolation.py::TestSurveyScoping -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/integration/test_tenant_isolation.py::<affected class> -x`
- **Per wave merge:** `uv run pytest tests/integration/test_tenant_isolation.py -x && uv run ruff check app/ tests/`
- **Phase gate:** full `uv run pytest tests/integration/ -m integration` + full `uv run ruff check .` green

### Wave 0 Gaps
- [ ] `tests/integration/test_tenant_isolation.py` — new file, all tests
- [ ] `tests/integration/conftest.py` — extend with `two_campaigns_with_resources` fixture (VoterList + ImportJob + VoterTag + Voter + SurveyScript + SurveyQuestion per campaign)
- [ ] Update `tests/unit/test_campaign_list.py` and `tests/unit/test_campaign_service.py` to pass the new `user` argument to `list_campaigns`

## Project Constraints (from CLAUDE.md)

- **Use `uv`** for all Python operations (never system python, never `python3`/`pip`/`poetry`).
- **Use `ruff`** to lint before committing: `uv run ruff check .` + `uv run ruff format .`.
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC; **line length 88 chars**; B008 ignored (FastAPI `Depends`).
- **Tests:** `uv run pytest`, `asyncio_mode=auto`, markers `integration`/`e2e`.
- **Commit per task/story/phase** — don't accumulate large changesets.
- **Conventional Commits** for all commit messages.
- **Commit on a branch**, not main (current branch `gsd/v1.12-hardening-remediation` is correct).
- **Never push to GitHub** unless explicitly requested.
- **Consult `ref` on errors and packages.**

## Code Examples

### Example 1 — Scoped `get_list` (VoterListService)

```python
# app/services/voter_list.py (line 53 rewrite)
async def get_list(
    self,
    db: AsyncSession,
    list_id: uuid.UUID,
    campaign_id: uuid.UUID,
) -> VoterList:
    """Get a voter list by ID, scoped to campaign."""
    result = await db.execute(
        select(VoterList).where(
            VoterList.id == list_id,
            VoterList.campaign_id == campaign_id,
        )
    )
    voter_list = result.scalar_one_or_none()
    if voter_list is None:
        msg = f"Voter list {list_id} not found"
        raise ValueError(msg)
    return voter_list
```

### Example 2 — Scoped `list_campaigns` (CampaignService)

```python
# app/services/campaign.py (line 230 rewrite)
async def list_campaigns(
    self,
    db: AsyncSession,
    user: AuthenticatedUser,
    limit: int = 20,
    cursor: str | None = None,
) -> tuple[list[Campaign], PaginationResponse]:
    """List campaigns the user has membership in."""
    query = (
        select(Campaign)
        .join(CampaignMember, CampaignMember.campaign_id == Campaign.id)
        .where(
            Campaign.status != CampaignStatus.DELETED,
            CampaignMember.user_id == user.id,
        )
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())
    )
    # ... rest identical to current implementation
```

### Example 3 — ImportJob guard (pattern from delete_import:447)

```python
# app/api/v1/imports.py (apply at lines 184, 272, 351, 400)
job = await db.get(ImportJob, import_id)
if job is None or job.campaign_id != campaign_id:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Import job not found",
    )
```

### Example 4 — Integration test (template)

```python
# tests/integration/test_tenant_isolation.py
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from tests.integration.test_rls_api_smoke import _make_app_for_campaign

@pytest.mark.integration
class TestVoterListScoping:
    async def test_get_voter_list_cross_campaign_404(
        self, two_campaigns_with_resources, app_user_engine, superuser_engine
    ):
        """GET voter list from campaign B via campaign A URL returns 404."""
        data = two_campaigns_with_resources
        cid_a = data["campaign_a_id"]
        list_b = data["voter_list_b_id"]

        app, _ = _make_app_for_campaign(
            data["user_a_id"], data["org_a_id"], cid_a,
            app_user_engine, superuser_engine=superuser_engine,
        )
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/campaigns/{cid_a}/lists/{list_b}")
        assert resp.status_code == 404
```

## State of the Art

No deprecations relevant to this phase — all APIs in use are current (SQLAlchemy 2.x async, FastAPI `Depends`, pytest-asyncio `asyncio_mode=auto`). The fix pattern is idiomatic for SQLAlchemy async and matches reference implementations already in the codebase.

## Open Questions

1. **Should `list_campaigns` also include campaigns where the user shares an org (but lacks a CampaignMember row)?**
   - User decision: No. Strict membership-only. Document this explicitly in the service docstring so future contributors don't "loosen" it.
   - Recommendation: add a comment `# SEC-01: strict CampaignMember scope; no org-wide fallback (Phase 71 decision)`.

2. **Does `SurveyService._get_question` exist, or is question fetching inlined?**
   - Seen at `update_question` line 309 calling `self._get_question`. Not shown in grep; confirm signature during implementation. Fix should thread `campaign_id` through it.

3. **Are there existing tests that rely on cross-tenant `list_lists` behavior?**
   - Recommendation: grep `test_voter_list` and verify no test was asserting "list from campaign B visible via campaign A" (unlikely but worth checking in Wave 0).

## Sources

### Primary (HIGH confidence)
- `app/services/campaign.py:230-284` (list_campaigns current implementation)
- `app/services/voter_list.py:1-302` (all 7 unscoped methods)
- `app/services/invite.py:240-266` (revoke_invite)
- `app/api/v1/imports.py:184,272,351,400,447` (4 unscoped + 1 reference fix)
- `app/api/v1/voter_tags.py:116-130` (add_tag_to_voter route)
- `app/api/v1/surveys.py:115-319` (all script/question routes)
- `app/services/voter.py:538-682` (tag service methods)
- `app/services/survey.py:87-416` (script/question services)
- `app/models/voter.py:143-169`, `app/models/voter_list.py:23-56`, `app/models/invite.py`, `app/models/survey.py` (model definitions confirm `campaign_id` columns exist)
- `tests/integration/conftest.py:82-246` (`two_campaigns` fixture — extension target)
- `tests/integration/test_rls_api_smoke.py:32-188` (`two_campaigns_with_api_data` fixture + `_make_app_for_campaign` helper — reference pattern)
- `.planning/CODEBASE-REVIEW-2026-04-04.md` sections C1-C4, H4, H5 (authoritative vulnerability descriptions)
- `./CLAUDE.md` (project-level tool and style constraints)

### Secondary (MEDIUM confidence)
- `tests/unit/test_campaign_list.py:53,69,81` (tests that will break from signature change — needs verification in Wave 0)
- `tests/unit/test_campaign_service.py:367` (same)

### Tertiary (LOW confidence)
- None — all findings verified against live source.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all infrastructure already in the codebase, verified via direct file reads.
- Architecture: HIGH — reference-fix snippets from the review match existing correct patterns (`delete_import`, `list_tags`, `list_invites`, `list_scripts`).
- Pitfalls: HIGH — pitfalls enumerated via direct inspection of affected source lines.
- Test Strategy: HIGH — both the fixture and the test-app helper already exist.

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (30 days; stable domain, low churn)
