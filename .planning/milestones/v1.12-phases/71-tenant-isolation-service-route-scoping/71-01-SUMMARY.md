---
phase: 71
plan: 01
subsystem: testing/security
tags: [tests, tenant-isolation, idor, wave-0, fixtures]
requires:
  - tests/integration/conftest.py::two_campaigns
  - tests/integration/test_rls_api_smoke.py::_make_app_for_campaign
provides:
  - tests/integration/conftest.py::two_campaigns_with_resources
  - tests/integration/test_tenant_isolation.py
affects:
  - Plans 71-02 (service scoping) and 71-03 (route/tag guards) will
    turn the currently-failing tests green
tech-stack:
  added: []
  patterns:
    - "SQL-via-superuser_session for RLS-bypass fixture seeding"
    - "_make_app_for_campaign auth-override harness reused verbatim"
key-files:
  created:
    - tests/integration/test_tenant_isolation.py
  modified:
    - tests/integration/conftest.py
decisions:
  - "Insert SQLAlchemy Enum column values using member names (STATIC, UPLOADED) not StrEnum string values, because the app's Enum(native_enum=False) columns store member names by default"
  - "Keep RLS-incidentally-protected tests in the suite: they serve as regression guards once service-layer scoping lands in 71-02"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  tests_added: 18
  tests_failing_red_state: 10
---

# Phase 71 Plan 01: Wave 0 Failing Tenant-Isolation Tests Summary

Added the `two_campaigns_with_resources` pytest fixture and 18 integration
tests proving 10 IDOR vulnerabilities (SEC-01, SEC-03, SEC-04, SEC-13)
still exist against the unfixed codebase.

## Overview

Per the Nyquist rule, Phase 71's implementation plans (02 and 03) must
have executable red tests before they start. This plan created both:

1. A shared fixture seeding Campaign A and Campaign B each with their
   own VoterList, ImportJob, VoterTag, Voter, SurveyScript,
   SurveyQuestion, and Invite — all inserted via raw SQL through
   `superuser_session` to bypass RLS during setup.
2. Six test classes that run as Campaign A's admin user and attempt
   cross-campaign access against Campaign B's resources; every attack
   must return `404`.

## Fixture Resource Shape

`two_campaigns_with_resources` yields a dict with the following ids:

| Key | Description |
|---|---|
| `campaign_a_id`, `campaign_b_id` | Two ACTIVE campaigns |
| `user_a_id`, `user_b_id` | Admins, one per campaign |
| `org_a_id`, `org_b_id` | ZITADEL org ids (for `_make_app_for_campaign`) |
| `voter_list_a_id`, `voter_list_b_id` | VoterList (list_type=STATIC) per campaign |
| `import_job_a_id`, `import_job_b_id` | ImportJob (status=UPLOADED) per campaign |
| `voter_tag_a_id`, `voter_tag_b_id` | VoterTag per campaign |
| `voter_a_id`, `voter_b_id` | Voter per campaign |
| `survey_script_a_id`, `survey_script_b_id` | SurveyScript (status=draft) per campaign |
| `survey_question_a_id`, `survey_question_b_id` | SurveyQuestion per script |
| `invite_a_id`, `invite_b_id` | Invite per campaign |

Teardown deletes in reverse FK order (survey_questions → scripts →
tag_members → tags → list_members → lists → import_chunks → import_jobs
→ voters → invites → campaign_members → campaigns → users).

## Test Classes → SEC Requirement Mapping

| Test Class | Requirement | Plan Test ID | Endpoints Covered |
|---|---|---|---|
| `TestListCampaignsScoping` | SEC-01 | 71-01-01 | `GET /api/v1/campaigns` |
| `TestVoterListScoping` | SEC-02 | 71-01-02 | GET/PATCH/DELETE /lists/{id}, POST/DELETE /lists/{id}/members, positive GET |
| `TestImportJobScoping` | SEC-03 | 71-01-03 | POST /detect, POST /confirm, POST /cancel, GET /{id} |
| `TestRevokeInviteScoping` | SEC-04 | 71-01-04 | DELETE /invites/{id} + positive |
| `TestVoterTagScoping` | SEC-13 | 71-01-05 | POST /voters/{id}/tags with cross-campaign tag_id |
| `TestSurveyScoping` | SEC-13 | 71-01-06 | GET/PATCH /surveys/{id}, POST /questions, PATCH /questions/{id} |

## Red-State Baseline (18 tests, 10 failing)

Running `pytest tests/integration/test_tenant_isolation.py -v` produces:

### FAILING (vulnerabilities confirmed — Plans 02/03 must fix):

- `TestListCampaignsScoping::test_list_campaigns_scoped`
  (returns 200 with Campaign B visible; should return scoped list)
- `TestImportJobScoping::test_import_detect_cross_campaign_404`
- `TestImportJobScoping::test_import_confirm_cross_campaign_404`
- `TestImportJobScoping::test_import_cancel_cross_campaign_404`
- `TestImportJobScoping::test_import_get_cross_campaign_404`
- `TestRevokeInviteScoping::test_revoke_invite_cross_campaign_404`
- `TestVoterTagScoping::test_add_tag_cross_campaign_404`
- `TestSurveyScoping::test_survey_script_patch_cross_campaign_404`
- `TestSurveyScoping::test_survey_add_question_cross_campaign_404`
- `TestSurveyScoping::test_survey_update_question_cross_campaign_404`

### PASSING (RLS already protecting — Plans 02/03 keep them green):

- All 5 VoterList cross-campaign tests + positive `same_campaign_ok`
  (get_campaign_db session makes Campaign B's list invisible under
  RLS before the service query even runs)
- `TestSurveyScoping::test_survey_script_get_cross_campaign_404`
  (RLS hides the row on SELECT)
- `TestRevokeInviteScoping::test_revoke_invite_same_campaign_ok`
  (legitimate revoke already works)

The 10 failing endpoints are the exact surface where RLS alone is
insufficient, because the route either uses `get_db` (superuser, no
RLS) or the service does a primary-key fetch whose result is cross-
referenced without a campaign predicate.

## Fixture Schema Gotchas

1. **Enum member-name vs value mismatch.** `VoterList.list_type` and
   `ImportJob.status` use `Enum(…, native_enum=False)` which stores
   SQLAlchemy enum **member names** (`STATIC`, `UPLOADED`) in the
   underlying VARCHAR column. Initial attempts used the StrEnum
   string values (`static`, `uploaded`) and produced `LookupError:
   'static' is not among the defined enum values` when the ORM read
   the row back. Fixed by using uppercase names in the raw SQL inserts.
2. **Survey columns use `String(50)`, not `Enum`.** `SurveyScript.status`
   and `SurveyQuestion.question_type` store the StrEnum **values**
   directly (`draft`, `free_text`), so lowercase works there.
3. **`CampaignMember.role` must be set** to avoid the role backfill
   branch on first login, which commits the ambient session and
   clobbers RLS `set_config`. Fixture inserts `role='admin'` explicitly
   (pattern borrowed from `two_campaigns_with_api_data`).

## Verification

- `pytest --collect-only` collects all 18 tests without errors
- `ruff check tests/integration/conftest.py tests/integration/test_tenant_isolation.py` passes
- `ruff format --check` passes for both files
- Red-state pattern matches CODEBASE-REVIEW-2026-04-04 findings C1-C4

## Deviations from Plan

None — plan executed as written, with two minor nuances:

- Expected "≈15 tests"; delivered 18 (extra positive regression tests
  and one extra voter_list parametrized split for clarity).
- ImportJob confirm route is `POST /confirm`, not `POST /confirm-mapping`
  as the plan hinted. Test targets the real route path.

## Self-Check: PASSED

- tests/integration/conftest.py — FOUND
- tests/integration/test_tenant_isolation.py — FOUND
- Commit 1d1746b (fixture) — FOUND
- Commit 8bfd64d (tests) — FOUND
- 18 tests collected, 10 failing (red state), 8 passing (RLS defense-in-depth)
- Ruff check + format: both files pass
