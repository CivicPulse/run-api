---
phase: 71-tenant-isolation-service-route-scoping
plan: 03
subsystem: security-tenant-isolation
tags: [security, idor, tenant-isolation, invites, voter-tags, surveys]
requires:
  - 71-01 (Wave 0 failing tests)
provides:
  - invite-revoke-scoped
  - voter-tag-service-scoped
  - survey-script-scoped
  - survey-question-scoped
affects:
  - app/services/invite.py
  - app/services/voter.py
  - app/services/survey.py
  - app/api/v1/invites.py
  - app/api/v1/voter_tags.py
  - app/api/v1/surveys.py
tech-stack:
  added: []
  patterns: [inline-guard, 404-on-cross-campaign, service-layer-enforcement]
key-files:
  modified:
    - app/services/invite.py
    - app/services/voter.py
    - app/services/survey.py
    - app/api/v1/invites.py
    - app/api/v1/voter_tags.py
    - app/api/v1/surveys.py
    - tests/unit/test_invite_service.py
    - tests/unit/test_voter_tags.py
    - tests/unit/test_surveys.py
decisions:
  - "404 (not 403) on cross-campaign access — prevents UUID enumeration"
  - "Inline guards per method — no shared helper abstraction"
  - "Service-layer enforcement with route-layer ValueError → HTTPException mapping"
  - "update_question/delete_question now require script_id path param to anchor ownership JOIN"
metrics:
  duration: "~50 minutes"
  completed: 2026-04-04
  tasks: 3
  commits: 3
---

# Phase 71 Plan 03: IDOR Fixes — revoke_invite, voter tags, survey scripts/questions Summary

One-liner: Closes IDOR vulnerabilities C4/H4/H5 by adding `campaign_id` predicates to 14 service methods across invite, voter-tag, and survey scopes; cross-campaign access now returns 404 at every boundary.

## What Changed

### Task 1: `revoke_invite` scoped (SEC-04 / C4) — commit `8a021dc`

**Service signature change** (`app/services/invite.py:240`):
```python
# Before
async def revoke_invite(self, db, invite_id) -> Invite:
    ...select(Invite).where(Invite.id == invite_id)

# After
async def revoke_invite(self, db, invite_id, campaign_id) -> Invite:
    ...select(Invite).where(
        and_(Invite.id == invite_id, Invite.campaign_id == campaign_id)
    )
```

**Route** (`app/api/v1/invites.py:98`): forwards `campaign_id`, removed stale `# noqa: ARG001`.

### Task 2: Voter tag service scoped (SEC-13 / H4) — commit `9ebb1a6`

5 methods in `app/services/voter.py` gained `campaign_id` parameter:

| Method | Scoping logic |
|--------|---------------|
| `update_tag(db, tag_id, name, campaign_id)` | WHERE `id == tag_id AND campaign_id == campaign_id`; raise ValueError if None |
| `delete_tag(db, tag_id, campaign_id)` | Pre-lookup scoped by campaign_id; cascades to VoterTagMember only after verification |
| `add_tag_to_voter(db, voter_id, tag_id, campaign_id)` | **Dual check**: verifies tag.campaign_id == campaign_id AND voter.campaign_id == campaign_id before INSERT |
| `remove_tag_from_voter(db, voter_id, tag_id, campaign_id)` | Same dual check as add |
| `get_voter_tags(db, voter_id, campaign_id)` | Voter ownership pre-check; JOIN constrained by VoterTag.campaign_id |

**Routes** (`app/api/v1/voter_tags.py`): 5 handlers forward `campaign_id`; `ValueError` → `HTTPException(404)`.

### Task 3: Survey script/question service scoped (SEC-13 / H5) — commit `619ae91`

8 methods in `app/services/survey.py` gained `campaign_id` parameter:

| Method | Scoping logic |
|--------|---------------|
| `get_script(session, script_id, campaign_id)` | WHERE `id == script_id AND campaign_id == campaign_id` |
| `update_script(session, script_id, data, campaign_id)` | Delegates to scoped get_script |
| `delete_script(session, script_id, campaign_id)` | Same |
| `add_question(session, script_id, data, campaign_id)` | Verifies parent script via scoped get_script |
| `update_question(session, script_id, question_id, data, campaign_id)` | **New `script_id` arg**; uses refactored `_get_question` with JOIN |
| `delete_question(session, script_id, question_id, campaign_id)` | Same |
| `reorder_questions(session, script_id, question_ids, campaign_id)` | Pre-flight scoped get_script call |
| `list_questions(session, script_id, campaign_id)` | JOIN SurveyScript constrained by campaign_id |

**`_get_question` refactor** (key pitfall fix):

```python
async def _get_question(self, session, script_id, question_id, campaign_id):
    result = await session.execute(
        select(SurveyQuestion)
        .join(SurveyScript, SurveyScript.id == SurveyQuestion.script_id)
        .where(and_(
            SurveyQuestion.id == question_id,
            SurveyQuestion.script_id == script_id,
            SurveyScript.campaign_id == campaign_id,
        ))
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise ValueError(f"Question {question_id} not found")
    return question
```

This JOINs `SurveyScript` so the parent script's `campaign_id` is enforced — the previous version could fetch any question regardless of the requesting campaign.

**`record_response` patch**: now passes `campaign_id` to `get_script` (was using the old 2-arg signature).

**Routes** (`app/api/v1/surveys.py`): 8 handlers forward `campaign_id`; `ValueError` messages containing "not found" map to `HTTPException(404)`, others stay `400`. This preserves the existing 400 path for state-machine violations (e.g., "Only draft scripts can be deleted") while giving cross-campaign attempts a proper 404.

## Tests Turned GREEN

Wave 0 tests (from plan 71-01) now GREEN:

| Test | Status |
|------|--------|
| `TestRevokeInviteScoping::test_revoke_invite_cross_campaign_404` | PASS |
| `TestRevokeInviteScoping::test_revoke_invite_same_campaign_ok` | PASS (regression) |
| `TestVoterTagScoping::test_add_tag_cross_campaign_404` | PASS |
| `TestSurveyScoping::test_survey_script_get_cross_campaign_404` | PASS |
| `TestSurveyScoping::test_survey_script_patch_cross_campaign_404` | PASS |
| `TestSurveyScoping::test_survey_add_question_cross_campaign_404` | PASS |
| `TestSurveyScoping::test_survey_update_question_cross_campaign_404` | PASS |

**Full `tests/integration/test_tenant_isolation.py`: 18/18 GREEN** (combined with plan 71-02 fixes on `campaigns`, `voter_lists`, and `imports`).

## Unit Test Signature Updates

Discovered and updated (no assertions changed, only signatures to match new service API):
- `tests/unit/test_invite_service.py::TestRevokeInvite::test_sets_revoked_at` — pass `invite.campaign_id`
- `tests/unit/test_voter_tags.py::test_add_tag_to_voter` — pass `campaign_id` + mock tag/voter lookups
- `tests/unit/test_voter_tags.py::test_remove_tag_from_voter` — pass `campaign_id` + mock tag/voter/delete
- `tests/unit/test_voter_tags.py::test_get_voter_tags` — pass `campaign_id` + mock voter lookup
- `tests/unit/test_surveys.py::test_script_lifecycle_transitions` — pass `campaign_id` (4 update_script calls)
- `tests/unit/test_surveys.py::test_question_crud_draft_only` — pass `campaign_id`

All related unit tests (35) pass after updates.

## Deviations from Plan

None — all three tasks executed exactly as written. Routes already had `try/except ValueError` on mutation endpoints; extended to add the 404-mapping for "not found" messages (needed because the plan called for 404 on cross-campaign while keeping 400 for state-machine violations).

## Known Stubs

None.

## Self-Check: PASSED
- All 6 modified app files exist and compile
- All 3 unit test files updated and passing
- All 3 commits present on branch: `8a021dc`, `9ebb1a6`, `619ae91`
- Ruff lint clean on every modified file
- 18/18 tenant-isolation integration tests GREEN
- 35/35 related unit tests GREEN
