---
phase: 41-organization-data-model-auth
plan: 01
subsystem: database
tags: [sqlalchemy, alembic, postgresql, organization, rbac]

requires:
  - phase: 01-authentication
    provides: "Users table, CampaignRole IntEnum, security.py"
  - phase: 09-organizations
    provides: "Organization model with created_by FK"
provides:
  - "OrganizationMember SQLAlchemy model with 8 columns"
  - "OrgRole StrEnum (org_owner, org_admin)"
  - "ORG_ROLE_CAMPAIGN_EQUIVALENT mapping dict"
  - "ORG_ROLE_LEVELS ordering dict"
  - "Alembic migration 015 with table and seed data"
affects: [41-02-org-role-resolution, 41-03-org-auth-dependencies]

tech-stack:
  added: []
  patterns: ["OrgRole StrEnum with ORG_ROLE_LEVELS for hierarchy ordering"]

key-files:
  created:
    - app/models/organization_member.py
    - alembic/versions/015_organization_members.py
    - tests/unit/test_org_model.py
  modified:
    - app/core/security.py
    - app/models/__init__.py
    - app/db/base.py

key-decisions:
  - "Used StrEnum for OrgRole (not IntEnum like CampaignRole) per plan spec"
  - "Added ORG_ROLE_LEVELS dict for hierarchy comparison since StrEnum has no natural ordering"
  - "Adjusted migration down_revision to 013_campaign_slug (plan referenced non-existent 014)"

patterns-established:
  - "OrgRole StrEnum pattern: use ORG_ROLE_LEVELS dict for hierarchy comparison"
  - "Organization membership: NOT NULL role unlike CampaignMember nullable role"

requirements-completed: [ORG-01, ORG-02]

duration: 3min
completed: 2026-03-24
---

# Phase 41 Plan 01: Organization Data Model Summary

**OrganizationMember model with OrgRole StrEnum, campaign-equivalent mappings, and Alembic migration seeding org_owner records from existing organizations**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T13:46:43Z
- **Completed:** 2026-03-24T13:49:41Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- OrganizationMember model with 8 columns (id, user_id, organization_id, role, invited_by, joined_at, created_at, updated_at)
- OrgRole StrEnum and ORG_ROLE_CAMPAIGN_EQUIVALENT/ORG_ROLE_LEVELS mappings in security.py
- Alembic migration 015 creating table with constraints and seeding org_owner from organizations.created_by
- 11 unit tests covering model structure, enum values, and mapping correctness

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests** - `8910422` (test)
2. **Task 1 (GREEN): OrganizationMember model, OrgRole enum, mappings** - `9f474ae` (feat)
3. **Task 2: Alembic migration with seed data** - `d766201` (feat)

_Note: Task 1 used TDD with separate RED/GREEN commits_

## Files Created/Modified
- `app/models/organization_member.py` - OrganizationMember SQLAlchemy model
- `app/core/security.py` - Added OrgRole StrEnum, ORG_ROLE_CAMPAIGN_EQUIVALENT, ORG_ROLE_LEVELS
- `app/models/__init__.py` - Added OrganizationMember export
- `app/db/base.py` - Added organization_member import for Alembic detection
- `alembic/versions/015_organization_members.py` - Migration creating table and seeding data
- `tests/unit/test_org_model.py` - 11 unit tests

## Decisions Made
- Used StrEnum for OrgRole per plan specification (CampaignRole uses IntEnum for comparison)
- Added ORG_ROLE_LEVELS dict since StrEnum lacks natural numeric ordering
- Adjusted migration down_revision from non-existent 014_backfill_members to 013_campaign_slug

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected migration down_revision**
- **Found during:** Task 2 (Alembic migration)
- **Issue:** Plan referenced `014_backfill_members` as down_revision, but latest migration is `013_campaign_slug`
- **Fix:** Set `down_revision = "013_campaign_slug"` to match actual revision chain
- **Files modified:** alembic/versions/015_organization_members.py
- **Verification:** Ruff check passes, migration file syntactically correct
- **Committed in:** d766201 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential correction for migration chain integrity. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OrganizationMember model ready for Plan 02 (org role resolution) and Plan 03 (auth dependencies)
- OrgRole enum and mappings available for require_org_role() implementation
- Migration 015 ready to run against database

## Self-Check: PASSED

All 4 created files verified on disk. All 3 commit hashes verified in git log.

---
*Phase: 41-organization-data-model-auth*
*Completed: 2026-03-24*
