---
phase: 71-tenant-isolation-service-route-scoping
plan: 02
subsystem: security

tags: [idor, multi-tenancy, campaign-scoping, sqlalchemy, fastapi]

requires:
  - phase: 71-tenant-isolation-service-route-scoping (plan 01)
    provides: red-state integration tests in tests/integration/test_tenant_isolation.py
provides:
  - list_campaigns scoped to CampaignMember rows (SEC-01)
  - VoterListService.* scoped by campaign_id on every method (SEC-02)
  - ImportJob routes + FieldMappingTemplate scoped by campaign_id (SEC-03)
affects: [72-row-level-security, 74-data-integrity]

tech-stack:
  added: []
  patterns:
    - "Service-layer inline campaign_id guard (if obj is None or obj.campaign_id != campaign_id: raise 404)"
    - "JOIN CampaignMember for user-scoped listing endpoints"

key-files:
  created: []
  modified:
    - app/services/campaign.py
    - app/api/v1/campaigns.py
    - app/services/voter_list.py
    - app/api/v1/voter_lists.py
    - app/api/v1/imports.py
    - tests/unit/test_campaign_list.py
    - tests/unit/test_campaign_service.py
    - tests/unit/test_voter_lists.py

key-decisions:
  - "Inline per-method guard, no shared _assert_campaign_scope helper (CONTEXT.md D-04)"
  - "Service-layer enforcement (not route-layer) for VoterList and list_campaigns"
  - "404 Not Found on cross-campaign to prevent UUID enumeration"
  - "list_campaigns uses strict membership-based visibility (no org-wide fallback)"
  - "System FieldMappingTemplate rows (campaign_id IS NULL) remain accessible to any campaign"

patterns-established:
  - "Composite WHERE: WHERE obj.id == X AND obj.campaign_id == Y"
  - "Fetch + post-compare: db.get then if obj.campaign_id != campaign_id: 404"

requirements-completed: [SEC-01, SEC-02, SEC-03]

duration: 18min
completed: 2026-04-04
---

# Phase 71 Plan 02: Tenant Isolation Service Scoping Summary

**list_campaigns JOINs CampaignMember, VoterListService enforces campaign_id on all 7 methods, and 4 ImportJob routes guard cross-campaign access — closes IDORs C1, C2, C3.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-04T20:26:39Z
- **Completed:** 2026-04-04T20:45:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- **SEC-01 closed:** `list_campaigns` JOINs CampaignMember on user.id so a caller only sees campaigns where they hold membership — no org fallback.
- **SEC-02 closed:** `VoterListService.{get_list, update_list, delete_list, list_lists, add_members, remove_members, get_list_voters}` now require `campaign_id` and filter every query by it. Fixed pre-existing `list_lists` bug where the method had **no WHERE clause at all** (full-tenant scan).
- **SEC-03 closed:** `detect_columns`, `confirm_mapping`, `cancel_import`, `get_import_status` now guard `job.campaign_id != campaign_id` post-fetch. FieldMappingTemplate lookup rejects cross-campaign templates while preserving access to system templates (campaign_id IS NULL).

## Task Commits

1. **Task 1: Scope list_campaigns by CampaignMember (SEC-01)** — `e4420e9` (fix)
2. **Task 2: Scope VoterListService methods by campaign_id (SEC-02)** — `2c4eb3a` (fix)
3. **Task 3: Scope ImportJob routes + templates to campaign_id (SEC-03)** — `14f9f04` (fix)

## Exact Guard Locations

**app/services/campaign.py:230-260** — `list_campaigns(db, user, limit, cursor)` now builds:
```python
select(Campaign)
  .join(CampaignMember, CampaignMember.campaign_id == Campaign.id)
  .where(Campaign.status != CampaignStatus.DELETED,
         CampaignMember.user_id == user.id)
```

**app/services/voter_list.py** — seven methods mutated:
- `get_list` (line ~53): added `WHERE VoterList.campaign_id == campaign_id`
- `update_list` (line ~78): forwards campaign_id to get_list
- `delete_list` (line ~106): forwards campaign_id to get_list
- `list_lists` (line ~128): **added `.where(VoterList.campaign_id == campaign_id)`** (was missing — full-scan bug)
- `add_members` (line ~179): forwards campaign_id to get_list
- `remove_members` (line ~205): forwards campaign_id to get_list
- `get_list_voters` (line ~238): forwards campaign_id to get_list

**app/api/v1/imports.py** — four guards added matching line 448 pattern:
- detect_columns (line ~185): `if job is None or job.campaign_id != campaign_id`
- confirm_mapping (line ~275): same guard
- cancel_import (line ~354): same guard
- get_import_status (line ~403): same guard
- FieldMappingTemplate (line ~215): `if template is None or (template.campaign_id is not None and template.campaign_id != campaign_id)` — preserves system-template access

## Files Created/Modified
- `app/services/campaign.py` — list_campaigns signature adds `user: AuthenticatedUser`, JOINs CampaignMember
- `app/api/v1/campaigns.py` — route passes `user` kwarg to service
- `app/services/voter_list.py` — 7 methods accept campaign_id, inline guards
- `app/api/v1/voter_lists.py` — 7 route handlers forward campaign_id
- `app/api/v1/imports.py` — 5 guards added (4 ImportJob routes + 1 FieldMappingTemplate)
- `tests/unit/test_campaign_list.py` — mock user fixture, pass user kwarg
- `tests/unit/test_campaign_service.py` — `test_list_campaigns_paginated` updated to supply user
- `tests/unit/test_voter_lists.py` — all 6 call sites updated with campaign_id arg (deviation: not listed in plan)

## Tests Turned GREEN

| Wave 0 test | Status |
|-------------|--------|
| test_list_campaigns_scoped (71-01-01) | GREEN |
| test_voter_list_get_cross_campaign_404 (71-01-02) | GREEN |
| test_voter_list_patch_cross_campaign_404 | GREEN |
| test_voter_list_delete_cross_campaign_404 | GREEN |
| test_voter_list_add_members_cross_campaign_404 | GREEN |
| test_voter_list_remove_members_cross_campaign_404 | GREEN |
| test_voter_list_same_campaign_ok | GREEN |
| test_import_detect_cross_campaign_404 (71-01-03) | GREEN |
| test_import_confirm_cross_campaign_404 | GREEN |
| test_import_cancel_cross_campaign_404 | GREEN |
| test_import_get_cross_campaign_404 | GREEN |

Total: 11 integration tests GREEN, 21 unit tests still passing. 32/32 combined suite passes.

## Decisions Made
All decisions followed CONTEXT.md locked decisions:
- Inline guards per method (not shared helper)
- 404 (not 403) to prevent enumeration
- Service-layer enforcement
- Ruff/88-char line length

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated tests/unit/test_voter_lists.py (not listed in plan files_modified)**
- **Found during:** Task 2
- **Issue:** The plan only listed test_campaign_list.py + test_campaign_service.py as test files to update, but changing VoterListService signatures broke 6 existing test call sites in tests/unit/test_voter_lists.py.
- **Fix:** Added `campaign_id` argument to every affected call (all 6: get_list × 2, delete_list, add_members × 2, remove_members).
- **Files modified:** tests/unit/test_voter_lists.py
- **Verification:** `uv run pytest tests/unit/test_voter_lists.py` — 8/8 passing.
- **Committed in:** 2c4eb3a (Task 2 commit)

**2. [Rule 3 - Blocking] Widened alembic_version column + ran migrations**
- **Found during:** Task 3 integration test verification
- **Issue:** DB stuck at revision 022_import_chunks because migration 023's revision name (`023_phase61_chunk_aggregation_contracts`, 39 chars) exceeded the 32-char `alembic_version.version_num` column. Tests failed with `UndefinedColumnError: column import_jobs.processing_started_at does not exist`.
- **Fix:** `ALTER TABLE alembic_version ALTER COLUMN version_num TYPE varchar(255)` then `alembic upgrade head` (applied 023, 024, 025).
- **Files modified:** None (schema-only change applied via docker compose exec postgres).
- **Verification:** `alembic current` → `025_import_cleanup_and_processing_start`; integration tests pass.
- **Committed in:** N/A (DB state change only, no code change).

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to verify work. No scope creep — staying within the three IDOR fixes mandated by the plan.

## Issues Encountered
- Pre-existing E501 at app/api/v1/imports.py:75 (out of scope, pre-existing, logged for later).
- A parallel executor (71-03) is modifying disjoint files (`invites.py`, `voter_tags.py`, `surveys.py`) and committing on the same branch. No conflicts observed — used `--no-verify` per parallel execution directive.

## Next Phase Readiness
- Phase 72 (RLS) can now rely on application-level campaign_id enforcement as a first line of defense.
- Phase 74 (Data Integrity) touches the same service files and will have clean ground to add further constraints.

## Self-Check: PASSED

**Commits verified:**
- e4420e9 FOUND (Task 1)
- 2c4eb3a FOUND (Task 2)
- 14f9f04 FOUND (Task 3)

**Files verified:** All 8 modified files exist on disk and contain expected changes.

---
*Phase: 71-tenant-isolation-service-route-scoping*
*Completed: 2026-04-04*
