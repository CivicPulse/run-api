---
phase: 41-organization-data-model-auth
verified: 2026-03-24T14:15:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 41: Organization Data Model & Auth Verification Report

**Phase Goal:** The backend supports org-level roles and multi-campaign membership with correct permission resolution
**Verified:** 2026-03-24T14:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `organization_members` table exists with correct columns and constraints | VERIFIED | Model and migration both define the table with 8 columns, UniqueConstraint `uq_user_organization`, CheckConstraint `ck_organization_members_role_valid` |
| 2  | `OrgRole` StrEnum defines `org_owner` and `org_admin` values | VERIFIED | `class OrgRole(StrEnum)` with `ORG_OWNER = "org_owner"` and `ORG_ADMIN = "org_admin"` at security.py:34–39 |
| 3  | Existing org creators have `org_owner` records after migration | VERIFIED | Migration 015 INSERT...SELECT seeds from `organizations.created_by` with ON CONFLICT DO NOTHING |
| 4  | `ORG_ROLE_CAMPAIGN_EQUIVALENT` maps org roles to campaign role equivalents | VERIFIED | Dict at security.py:41–44; ORG_ADMIN→ADMIN, ORG_OWNER→OWNER |
| 5  | Org admin with no CampaignMember record can access any campaign in their org with ADMIN-equivalent permissions | VERIFIED | `resolve_campaign_role()` step 2 looks up OrganizationMember; `test_org_admin_no_campaign_member_returns_admin` passes |
| 6  | Org roles are additive — max(campaign VIEWER, org ADMIN) resolves to ADMIN | VERIFIED | `max(roles)` at security.py:276; `test_additive_campaign_viewer_org_admin_returns_admin` passes |
| 7  | Org owner resolves to OWNER-equivalent on any campaign in their org | VERIFIED | `test_org_owner_no_campaign_member_returns_owner` passes |
| 8  | JWT role fallback is removed — users with no CampaignMember and no OrgMember are denied | VERIFIED | Function returns `None` at step 4 (security.py:278–280); `test_no_campaign_member_no_org_member_deny` passes |
| 9  | NULL CampaignMember.role is treated as VIEWER for backward compatibility | VERIFIED | `explicit_campaign_role = CampaignRole.VIEWER` at security.py:235; `test_null_campaign_member_role_treated_as_viewer` passes |
| 10 | `org_owner` can call `GET /api/v1/org` and receives org details | VERIFIED | Endpoint at org.py:27–38; `test_returns_org_details` passes (200, correct JSON shape) |
| 11 | `org_admin` can call `GET /api/v1/org/campaigns` and sees all campaigns in the org | VERIFIED | Endpoint at org.py:41–70; `test_returns_campaigns` passes |
| 12 | `org_admin` can call `GET /api/v1/org/members` and sees all org-level members | VERIFIED | Endpoint at org.py:73–97; `test_returns_members` passes |
| 13 | Non-org-member user receives 403 on all three org endpoints | VERIFIED | `require_org_role("org_admin")` dependency raises 403; `test_returns_403_for_non_member` passes |
| 14 | `require_org_role("org_admin")` allows both `org_admin` and `org_owner`; `require_org_role("org_owner")` denies `org_admin` | VERIFIED | `ORG_ROLE_LEVELS` comparison at security.py:511; 5 unit tests in `test_org_auth.py` all pass |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/models/organization_member.py` | OrganizationMember SQLAlchemy model | VERIFIED | 45 lines; class OrganizationMember(Base) with all 8 D-14 columns, both constraints |
| `app/core/security.py` | OrgRole enum, mappings, resolve_campaign_role, require_org_role | VERIFIED | 520 lines; all required symbols present and substantive |
| `alembic/versions/015_organization_members.py` | Migration creating table and seeding org_owner records | VERIFIED | 82 lines; upgrade/downgrade, seed INSERT, ON CONFLICT DO NOTHING |
| `app/schemas/org.py` | OrgResponse, OrgMemberResponse, OrgCampaignResponse | VERIFIED | 3 Pydantic schemas from BaseSchema |
| `app/services/org.py` | OrgService with get_org, list_campaigns, list_members | VERIFIED | 78 lines; all 3 methods with real DB queries filtered by org_id |
| `app/api/v1/org.py` | 3 GET endpoints under /api/v1/org | VERIFIED | 98 lines; 3 routes with require_org_role("org_admin") on each |
| `tests/unit/test_org_model.py` | 11 unit tests for model structure and enums | VERIFIED | 82 lines; 11 tests, all pass |
| `tests/unit/test_resolve_campaign_role.py` | 14 tests including org role resolution scenarios | VERIFIED | 378 lines; 14 tests covering all org role paths, all pass |
| `tests/unit/test_org_auth.py` | 5 unit tests for require_org_role | VERIFIED | 125 lines; 5 tests covering allow/deny paths, all pass |
| `tests/unit/test_org_api.py` | 4 unit tests for org endpoints | VERIFIED | 233 lines; 4 tests covering success and 403 paths, all pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/models/organization_member.py` | `app/db/base.py` | `import app.models.organization_member` | WIRED | Line 23 of base.py |
| `app/models/organization_member.py` | `app/models/__init__.py` | `OrganizationMember` in `__all__` | WIRED | Line 7 (import) and line 30 (`__all__`) |
| `app/core/security.py resolve_campaign_role()` | `app/models/organization_member.py` | deferred import inside function body | WIRED | security.py:212 `from app.models.organization_member import OrganizationMember` |
| `app/core/security.py resolve_campaign_role()` | `ORG_ROLE_CAMPAIGN_EQUIVALENT` | dict lookup for org role to campaign role mapping | WIRED | security.py:265 `org_derived_role = ORG_ROLE_CAMPAIGN_EQUIVALENT[org_role]` |
| `app/api/v1/org.py` | `app/core/security.py require_org_role()` | `Depends(require_org_role("org_admin"))` | WIRED | All three endpoint signatures use `Depends(require_org_role("org_admin"))` |
| `app/api/v1/org.py` | `app/services/org.py` | OrgService method calls | WIRED | `_service.list_campaigns(db, org.id)` and `_service.list_members(db, org.id)` |
| `app/api/v1/router.py` | `app/api/v1/org.py` | `router.include_router` | WIRED | `router.include_router(org.router, prefix="/org", tags=["org"])` at line 40 |
| `app/api/v1/org.py` | `app/db/session.py get_db()` | `Depends(get_db)` — bypasses campaign RLS per D-13 | WIRED | All three endpoints use `db: AsyncSession = Depends(get_db)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app/api/v1/org.py get_org` | `org` | `db.scalar(select(Organization).where(...))` | Yes — real DB query filtered by zitadel_org_id | FLOWING |
| `app/api/v1/org.py list_org_campaigns` | `results` | `OrgService.list_campaigns()` → `db.execute(stmt)` with Campaign outer join CampaignMember subquery | Yes — real query filtered by `Campaign.organization_id == org_id` | FLOWING |
| `app/api/v1/org.py list_org_members` | `results` | `OrgService.list_members()` → `db.execute(stmt)` joining OrganizationMember and User | Yes — real query filtered by `OrganizationMember.organization_id == org_id` | FLOWING |
| `app/core/security.py resolve_campaign_role` | `explicit_campaign_role`, `org_derived_role` | Sequential `db.scalar()` calls against CampaignMember, Campaign, Organization, OrganizationMember | Yes — all four DB queries against real tables | FLOWING |
| `app/core/security.py require_org_role._check_org_role` | `org`, `org_member_role` | `db.scalar()` on Organization then OrganizationMember | Yes — two real DB queries | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| OrgRole enum importable with correct values | `uv run python -c "from app.core.security import OrgRole; assert OrgRole.ORG_OWNER == 'org_owner'"` | Exit 0 | PASS |
| OrganizationMember importable | `uv run python -c "from app.models.organization_member import OrganizationMember; print(OrganizationMember.__tablename__)"` | organization_members | PASS |
| Org router has exactly 3 routes | `uv run python -c "from app.api.v1.org import router; print(len(router.routes))"` | 3 | PASS |
| All 34 phase-41 unit tests pass | `uv run pytest tests/unit/test_org_model.py tests/unit/test_resolve_campaign_role.py tests/unit/test_org_auth.py tests/unit/test_org_api.py -q` | 34 passed | PASS |
| Full unit suite regression check | `uv run pytest tests/unit/ -q` | 508 passed, 4 failed | NOTE (see below) |

**Note on full suite failures:** 4 tests fail in `test_api_invites.py` and `test_api_members.py`. These failures are **pre-existing** — verified by checking out the pre-phase-41 versions of those files (`git checkout 9728950`) and confirming the same 4 tests fail. They are unrelated to phase 41 scope (they involve mock assertions on ZITADEL project ID values that were broken before this phase began). Phase 41 correctly updated `_setup_role_resolution()` in both files to accommodate the JWT fallback removal, but did not cause the 4 failing assertions.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORG-01 | 41-01 | `organization_members` table stores org-level roles (`org_owner`, `org_admin`) per user per org | SATISFIED | OrganizationMember model + migration 015 with CheckConstraint enforcing valid roles |
| ORG-02 | 41-01 | Seed migration promotes existing org `created_by` users to `org_owner` | SATISFIED | Migration 015 INSERT...SELECT from organizations.created_by with `role = 'org_owner'` |
| ORG-03 | 41-02 | `resolve_campaign_role()` returns max(campaign role, org role equivalent) — org roles are additive | SATISFIED | 4-step resolution with `max(roles)` at security.py:276; 9 dedicated unit tests verify all paths |
| ORG-04 | 41-03 | `require_org_role()` auth dependency gates org-level endpoints | SATISFIED | Factory at security.py:453–519; all three org endpoints use it; 9 unit tests confirm gating behavior |

No orphaned requirements — all 4 phase-41 IDs (ORG-01 through ORG-04) are claimed by plans and verified in the codebase. ORG-05 through ORG-13 are scoped to Phase 43 and are not part of this phase.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scan performed on all 7 phase-41 files. No TODOs, FIXMEs, placeholder returns, hardcoded empty data structures flowing to render output, or stub patterns detected. All `return null`/`return {}` candidates in service and schema code are legitimate type defaults or unreachable-in-practice branches.

---

### Human Verification Required

None — all truths are verifiable programmatically through unit tests and static analysis. The phase produces backend API endpoints with no UI component.

---

### Gaps Summary

No gaps. All 14 must-have truths are verified, all 10 required artifacts exist at full implementation depth (not stubs), all 8 key links are wired, all data flows reach real database queries, and all 4 requirements are satisfied with direct code evidence.

The 4 pre-existing test failures in unrelated test files (`test_api_members`, `test_api_invites`) do not block this phase's goal and were present before phase 41 execution.

---

_Verified: 2026-03-24T14:15:00Z_
_Verifier: Claude (gsd-verifier)_
