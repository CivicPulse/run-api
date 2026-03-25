---
phase: 39-rls-fix-multi-campaign-foundation
plan: 03
subsystem: api
tags: [rls, multi-campaign, membership, alembic, data-migration, fastapi]

requires:
  - phase: 39-rls-fix-multi-campaign-foundation
    plan: 01
    provides: "Transaction-scoped set_config and pool checkout event"
  - phase: 39-rls-fix-multi-campaign-foundation
    plan: 02
    provides: "Centralized get_campaign_db dependency"
provides:
  - "ensure_user_synced creates CampaignMember for ALL org campaigns, not just one"
  - "get_campaign_from_token deprecated with .limit(1) removed"
  - "Alembic 014 data migration backfills missing CampaignMember records idempotently"
  - "7 new unit tests for multi-campaign membership and list visibility"
affects: [39-04, 41-org-context]

tech-stack:
  added: []
  patterns: ["Multi-campaign membership loop with per-campaign existence check", "ON CONFLICT DO NOTHING for idempotent data migration"]

key-files:
  created:
    - alembic/versions/014_backfill_campaign_members.py
    - tests/unit/test_user_sync.py
    - tests/unit/test_campaign_list.py
  modified:
    - app/api/deps.py

key-decisions:
  - "ensure_user_synced loops over all org campaigns with per-campaign member check before insert"
  - "get_campaign_from_token marked DEPRECATED, retained only for campaign list page fallback per D-08"
  - "Backfill migration uses existing campaign_members as bootstrap source via self-join"
  - "Downgrade is no-op since backfilled records are indistinguishable from original"

patterns-established:
  - "Multi-campaign membership: for campaign in campaigns loop with existence check"
  - "Idempotent data migration: INSERT ... ON CONFLICT DO NOTHING"

requirements-completed: [DATA-04, DATA-05]

duration: 6min
completed: 2026-03-24
---

# Phase 39 Plan 03: Multi-Campaign Membership Fix Summary

**Fixed ensure_user_synced to create CampaignMember for all org campaigns, deprecated get_campaign_from_token, and added idempotent backfill migration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T07:21:06Z
- **Completed:** 2026-03-24T07:26:40Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Confirmed root cause: `.limit(1)` in ensure_user_synced only created CampaignMember for 1 campaign per org
- Fixed ensure_user_synced to fetch ALL campaigns via `scalars().all()` and loop creating membership for each
- Deprecated get_campaign_from_token with updated docstring restricting use to campaign list page only (D-08)
- Removed all `.limit(1)` calls from app/api/deps.py
- Created Alembic 014 data migration that backfills missing CampaignMember records using ON CONFLICT DO NOTHING
- Added 4 unit tests for multi-campaign membership creation
- Added 3 unit tests for campaign list visibility
- All 485 unit tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Root cause investigation** -- Auto-approved checkpoint. Confirmed `.limit(1)` at lines 132 and 204 as root cause.
2. **Task 2: Fix ensure_user_synced (TDD)**
   - `0382a71` (test: RED - failing multi-campaign membership tests)
   - `a593355` (feat: GREEN - multi-campaign membership loop)
3. **Task 3: Deprecate get_campaign_from_token** - `14f1ffa` (fix)
4. **Task 4: Backfill migration and list tests** - `0a9048f` (feat)

## Files Created/Modified
- `app/api/deps.py` - Fixed ensure_user_synced multi-campaign loop, deprecated get_campaign_from_token
- `alembic/versions/014_backfill_campaign_members.py` - Data migration backfilling missing CampaignMember records
- `tests/unit/test_user_sync.py` - 4 unit tests for multi-campaign membership creation
- `tests/unit/test_campaign_list.py` - 3 unit tests for campaign list visibility

## Decisions Made
- ensure_user_synced uses a per-campaign existence check before insert to avoid duplicates, with a single commit at the end for efficiency
- get_campaign_from_token changed from `.scalar_one_or_none()` to `.scalars().first()` for semantic clarity (returns most recent campaign without SQL LIMIT)
- Backfill migration bootstraps from existing campaign_members via self-join on organization_id, so only users who already have at least one membership get backfilled
- Downgrade is a no-op because backfilled records cannot be distinguished from originals

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data paths are wired and functional.

## Next Phase Readiness
- Multi-campaign membership fully functional in ensure_user_synced
- Ready for Plan 04 (campaign switcher UI / frontend)
- Migration 014 ready for production deployment
- get_campaign_from_token can be fully removed after Phase 39 is complete

## Self-Check: PASSED
