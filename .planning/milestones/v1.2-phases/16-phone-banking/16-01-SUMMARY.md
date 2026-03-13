---
phase: 16-phone-banking
plan: "01"
subsystem: api
tags: [phone-banking, fastapi, sqlalchemy, pydantic, vitest, pytest]

requires:
  - phase: 15-call-lists-dnc-management
    provides: CallListEntry, SessionCaller models and call list service

provides:
  - POST .../entries/{entry_id}/self-release endpoint (volunteer+, validates ownership)
  - GET .../callers endpoint returning SessionCallerResponse list (volunteer+)
  - GET /phone-bank-sessions?assigned_to_me=true filter via SessionCaller join
  - PhoneBankSessionResponse.caller_count: int = 0 field with batch COUNT query
  - 4 frontend Wave 0 test stub files (PHON-01 through PHON-10 stubs, all it.todo)
  - 1 backend Wave 0 test stub file (TestSelfRelease, TestCallersList, TestAssignedToMe)

affects:
  - 16-02 through 16-10 (all depend on these endpoints and test scaffolds)
  - Any plan testing the sessions index (caller_count column)
  - Calling screen plan (self-release skip button)
  - My Sessions plan (assigned_to_me filter)

tech-stack:
  added: []
  patterns:
    - Batch COUNT query with .in_() to avoid N+1 for caller_count on list endpoint
    - Self-ownership validation pattern: load entry, check claimed_by == user_id, raise ValueError if mismatch
    - Wave 0 test scaffolds use it.todo (no imports, no implementation) — suite stays green

key-files:
  created:
    - tests/unit/test_phone_bank_gaps.py
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.test.tsx
  modified:
    - app/schemas/phone_bank.py
    - app/services/phone_bank.py
    - app/api/v1/phone_banks.py
    - app/core/config.py

key-decisions:
  - "caller_count populated at endpoint layer via batch COUNT query (not ORM relationship) to avoid N+1"
  - "self_release_entry validates claimed_by == user_id and raises ValueError before releasing"
  - "assigned_to_me filter uses JOIN on SessionCaller with .distinct() to avoid duplicate sessions"
  - "Wave 0 stubs use it.todo (Vitest) and pytest.skip (Python) so suite stays green immediately"
  - "Settings.model_config adds extra=ignore to allow VITE_* and test vars in .env without pydantic errors"

patterns-established:
  - "Endpoint-layer caller_count: batch SELECT session_id, COUNT(id) ... GROUP BY session_id, build dict, attach to response"
  - "it.todo stubs for Wave 0: import only describe/it from vitest, no setup, no implementation"

requirements-completed:
  - PHON-03
  - PHON-04
  - PHON-08

duration: 6min
completed: 2026-03-11
---

# Phase 16 Plan 01: Backend Gap Fixes and Wave 0 Test Scaffolds Summary

**Self-release endpoint (PHON-08 Skip button), callers list (PHON-03 management table), assigned_to_me filter (PHON-04 My Sessions), caller_count field, and 5 Wave 0 test stub files**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-11T21:03:19Z
- **Completed:** 2026-03-11T21:09:07Z
- **Tasks:** 2 (TDD task + scaffolds task)
- **Files modified:** 9

## Accomplishments

- Closed 4 backend gaps blocking Phase 16 frontend: self-release, callers list, assigned_to_me filter, caller_count field
- Added `POST .../entries/{entry_id}/self-release` endpoint with volunteer+ auth and ownership validation
- Added `GET .../callers` endpoint returning all SessionCallerResponse for a session
- Extended `list_sessions` with `assigned_to_me` query param (JOIN SessionCaller) and batch caller_count population
- Created 5 Wave 0 test stub files (38 it.todo stubs total) so all subsequent plans have verify targets

## Task Commits

1. **Task 1: Backend gap fixes (TDD)** - `65011ac` (feat)
2. **Task 2: Wave 0 test scaffolds** - `f3a85ab` (feat)

## Files Created/Modified

- `app/schemas/phone_bank.py` - Added `caller_count: int = 0` to PhoneBankSessionResponse
- `app/services/phone_bank.py` - Added `self_release_entry`, `list_callers`; updated `list_sessions` with `assigned_to_me_user_id` param
- `app/api/v1/phone_banks.py` - Added `GET .../callers`, `POST .../self-release` endpoints; updated `list_sessions` with `assigned_to_me` param and caller_count batch fetch
- `app/core/config.py` - Added `extra="ignore"` to Settings.model_config
- `tests/unit/test_phone_bank_gaps.py` - 9 unit tests covering all 4 gap behaviors (GREEN phase)
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.test.tsx` - PHON-01 stubs (5 it.todo)
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.test.tsx` - PHON-02/03/04/09/10 stubs (14 it.todo)
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` - PHON-05/06/07/08 stubs (14 it.todo)
- `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.test.tsx` - PHON-04 caller view stubs (5 it.todo)

## Decisions Made

- `caller_count` populated at endpoint layer via a single batch `SELECT session_id, COUNT(id) ... WHERE session_id IN (...) GROUP BY session_id` query — avoids N+1, keeps service returning plain models
- `self_release_entry` validates `entry.claimed_by == user_id` and raises `ValueError("Entry {id} not claimed by {user_id}")` before clearing — consistent with `record_call` pattern
- `assigned_to_me` filter uses inner JOIN on SessionCaller with `.distinct()` to prevent duplicate session rows
- Wave 0 stubs use `it.todo` (Vitest) with no imports — matches Phase 14 precedent documented in STATE.md

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Settings.model_config missing extra="ignore"**
- **Found during:** Task 1 (TDD RED — attempting to run tests)
- **Issue:** `web/.env.local` and `.env` contain `VITE_*`, `PASSWORD`, `USERNAME` variables that pydantic Settings rejects with `extra_forbidden`, causing all unit tests to fail at import time
- **Fix:** Added `extra="ignore"` to `Settings.model_config` in `app/core/config.py`
- **Files modified:** `app/core/config.py`
- **Verification:** All 9 unit tests run and pass after fix
- **Committed in:** `65011ac` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Essential fix — without it no unit tests could run. No scope creep.

## Issues Encountered

- Pre-existing test failure in `web/src/hooks/useVoterLists.test.ts` (1 test fails due to Phase 15 uncommitted `useVoterLists.ts` changes changing return type from `VoterList[]` to paginated `.items`). Documented in `deferred-items.md`. Not caused by this plan.

## Next Phase Readiness

- All 4 backend gaps closed — frontend plans can now build against correct API shape
- Wave 0 stubs in place for plans 16-02 through 16-10 to implement against
- Pre-existing `useVoterLists.test.ts` failure should be resolved before 16-02 implements voter list interactions

---
*Phase: 16-phone-banking*
*Completed: 2026-03-11*

## Self-Check: PASSED

- app/schemas/phone_bank.py: FOUND
- app/services/phone_bank.py: FOUND
- app/api/v1/phone_banks.py: FOUND
- tests/unit/test_phone_bank_gaps.py: FOUND
- web/.../sessions/index.test.tsx: FOUND
- web/.../sessions/$sessionId/index.test.tsx: FOUND
- web/.../sessions/$sessionId/call.test.tsx: FOUND
- web/.../my-sessions/index.test.tsx: FOUND
- Commit 65011ac: FOUND
- Commit f3a85ab: FOUND
