---
phase: 49-procrastinate-integration-worker-infrastructure
plan: 02
subsystem: api
tags: [procrastinate, fastapi, lifespan, background-tasks, queueing-lock]

# Dependency graph
requires:
  - phase: 49-01
    provides: Procrastinate App singleton and import_task rewrite
provides:
  - FastAPI lifespan with Procrastinate open_async context manager
  - confirm_mapping returning 202 with queueing lock duplicate prevention
  - Complete removal of TaskIQ references from app/
affects: [49-03-worker-process, imports-api, background-tasks]

# Tech tracking
tech-stack:
  added: []
  patterns: [procrastinate open_async in lifespan, AlreadyEnqueued 409 handling, queueing_lock per campaign]

key-files:
  created:
    - tests/unit/test_import_confirm.py
    - tests/unit/test_no_taskiq.py
  modified:
    - app/main.py
    - app/api/v1/imports.py
    - tests/unit/test_lifespan.py

key-decisions:
  - "Used AlreadyEnqueued (not UniqueViolation) for queueing_lock conflicts -- AlreadyEnqueued is the specific exception for queue lock duplicates"
  - "Lazy import of AlreadyEnqueued inside endpoint function to avoid module-level procrastinate dependency"

patterns-established:
  - "Procrastinate App lifecycle: open_async wraps yield in lifespan, auto-closes on shutdown"
  - "Queueing lock pattern: configure(queueing_lock=str(campaign_id)) prevents duplicate imports per campaign"

requirements-completed: [BGND-01, BGND-02]

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 49 Plan 02: API-Side Procrastinate Integration Summary

**Wired Procrastinate into FastAPI lifespan and confirm_mapping endpoint with 202 response, per-campaign queueing lock, and complete TaskIQ removal**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T21:16:22Z
- **Completed:** 2026-03-28T21:22:12Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments
- Replaced TaskIQ broker lifecycle (startup/shutdown) with Procrastinate open_async context manager in FastAPI lifespan
- Changed confirm_mapping response from implicit 200 to explicit 202 Accepted with status_code decorator
- Added per-campaign queueing lock (queueing_lock=str(campaign_id)) with AlreadyEnqueued -> 409 Conflict handling
- Removed all TaskIQ/broker references from app/ (verified by AST-scanning test)
- Created 3 endpoint tests and 1 codebase-scanning test, updated 1 lifespan test

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests** - `1f74b0d` (test)
2. **Task 1 (GREEN): Implementation + passing tests** - `0360da3` (feat)

**Plan metadata:** (pending final commit)

_TDD task with RED-GREEN commits._

## Files Created/Modified
- `app/main.py` - Replaced broker import/lifecycle with procrastinate_app.open_async()
- `app/api/v1/imports.py` - confirm_mapping now returns 202, defers via Procrastinate with queueing lock, catches AlreadyEnqueued as 409
- `tests/unit/test_import_confirm.py` - 3 tests: 202 response, defer_async args, 409 duplicate
- `tests/unit/test_lifespan.py` - Updated _mock_infra to mock procrastinate_app instead of broker, added test_procrastinate_app_initialized
- `tests/unit/test_no_taskiq.py` - AST-scanning test verifying no taskiq/broker imports in app/

## Decisions Made
- Used `AlreadyEnqueued` exception (not `UniqueViolation`) for queueing_lock conflicts. Both exist in procrastinate.exceptions but `AlreadyEnqueued` is specifically for "already a job waiting with the same queueing lock" while `UniqueViolation` is for general unique constraint violations.
- Lazy-imported `AlreadyEnqueued` inside the endpoint function rather than at module level to keep the import clean and avoid circular import risk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mock ImportJob missing timestamps**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Mock ImportJob lacked created_at/updated_at, causing Pydantic validation error on ImportJobResponse.model_validate
- **Fix:** Added utcnow() timestamps to _make_import_job factory
- **Files modified:** tests/unit/test_import_confirm.py
- **Verification:** All 3 confirm tests pass
- **Committed in:** 0360da3 (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Added get_campaign_db and resolve_campaign_role overrides**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Tests got 403 because require_role uses get_db internally for campaign role resolution, and get_campaign_db creates its own session factory. Both hit real DB.
- **Fix:** Overrode both get_db and get_campaign_db in app.dependency_overrides, patched resolve_campaign_role to return CampaignRole.ADMIN
- **Files modified:** tests/unit/test_import_confirm.py
- **Verification:** Tests authenticate and reach endpoint logic correctly
- **Committed in:** 0360da3 (Task 1 GREEN commit)

**3. [Rule 3 - Blocking] Removed stale broker.cpython-313.pyc**
- **Found during:** Task 1 verification
- **Issue:** Cached bytecode from deleted broker.py caused grep -r "taskiq" app/ to find a match
- **Fix:** Deleted app/tasks/__pycache__/broker.cpython-313.pyc
- **Files modified:** (cache file deleted, not tracked by git)
- **Verification:** grep -r "taskiq" app/ and grep -r "broker" app/tasks/ both return no matches
- **Committed in:** Not committed (cache file is gitignored)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## Known Stubs
None - all code paths are fully wired.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Procrastinate App is fully integrated into the API process (lifespan + endpoint)
- Plan 03 (worker process and CLI entry point) can proceed -- it will use the same procrastinate_app singleton for run_worker_async
- The import_task.py (from plan 01) is fully compatible with the defer_async call signature

---
*Phase: 49-procrastinate-integration-worker-infrastructure*
*Completed: 2026-03-28*
