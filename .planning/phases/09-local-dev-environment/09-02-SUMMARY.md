---
phase: 09-local-dev-environment
plan: 02
subsystem: database
tags: [seed-data, postgis, sqlalchemy, async, macon-bibb]

requires:
  - phase: 09-01
    provides: Docker Compose dev environment with PostgreSQL/PostGIS
provides:
  - Idempotent seed data script populating complete Macon-Bibb County demo dataset
  - 50 voters with PostGIS geometry across 5 neighborhoods
  - Interconnected campaign data (turfs, walk lists, surveys, phone banks, shifts)
  - 35+ voter interactions for dashboard endpoint testing
affects: [testing, api-endpoints, dashboard]

tech-stack:
  added: []
  patterns:
    - "Standalone async engine for scripts (not importing app.db.session)"
    - "Idempotent seed via campaign name check before creation"

key-files:
  created:
    - scripts/seed.py
  modified: []

key-decisions:
  - "Standalone async engine instead of importing app.db.session to avoid side effects"
  - "CampaignMember has no role column (role comes from JWT) -- adapted from plan"
  - "VoterList created as FK target for walk lists and call lists"

patterns-established:
  - "Seed scripts use own engine via create_async_engine(os.environ['DATABASE_URL'])"
  - "Idempotent seeding: query by known name, skip if exists"

requirements-completed: [DEV-04]

duration: 3min
completed: 2026-03-10
---

# Phase 9 Plan 2: Seed Data Summary

**Idempotent seed script creating 50 voters, 3 turfs, walk lists, surveys, phone bank, shifts, and 35+ voter interactions anchored to Macon-Bibb County GA**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T03:19:51Z
- **Completed:** 2026-03-10T03:22:27Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Complete demo dataset with 50 voters spread across 5 Macon-Bibb County neighborhoods with PostGIS geometry
- Interconnected entities: 3 turfs, 2 walk lists (22 entries), 1 survey (4 questions, 20 responses), 5 volunteers, 2 shifts, 1 phone bank session
- 35+ voter interactions (door knocks, phone calls, survey responses) ensuring dashboard endpoints return meaningful aggregated data
- Idempotent script safe to re-run without duplicating data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create idempotent seed data script with Macon-Bibb County data** - `bb8163c` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `scripts/seed.py` - Idempotent async seed data script (822 lines) populating complete demo dataset

## Decisions Made
- Used standalone `create_async_engine` instead of importing `app.db.session` to avoid global engine side effects at import time
- Adapted plan for CampaignMember (no role column -- role comes from JWT claims in ZITADEL)
- Created a VoterList record as FK target required by WalkList and CallList models
- Set explicit timestamps on all records to avoid NULL issues with server_default triggers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted CampaignMember to actual schema (no role column)**
- **Found during:** Task 1
- **Issue:** Plan specified role="owner/manager/volunteer" but CampaignMember model has no role column
- **Fix:** Created CampaignMember records without role, matching actual schema
- **Files modified:** scripts/seed.py
- **Verification:** Script parses as valid Python
- **Committed in:** bb8163c

**2. [Rule 3 - Blocking] Created VoterList for FK dependencies**
- **Found during:** Task 1
- **Issue:** WalkList and CallList have voter_list_id FK to voter_lists table; plan did not include VoterList creation
- **Fix:** Added VoterList creation before walk lists and call lists
- **Files modified:** scripts/seed.py
- **Verification:** All FK references are satisfied
- **Committed in:** bb8163c

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness against actual model schemas. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete dev environment with Docker Compose (09-01) + seed data (09-02) ready
- Developers can run `docker compose up` then `docker compose exec api python scripts/seed.py` to get a fully populated database
- All API endpoints and dashboard queries will return meaningful data after seeding

---
*Phase: 09-local-dev-environment*
*Completed: 2026-03-10*
