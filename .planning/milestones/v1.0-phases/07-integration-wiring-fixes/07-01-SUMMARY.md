---
phase: 07-integration-wiring-fixes
plan: 01
subsystem: api
tags: [fastapi, zitadel, lifespan, alembic, sqlalchemy]

requires:
  - phase: 01-auth-campaigns
    provides: "ZitadelService class and campaign CRUD endpoints"
  - phase: 04-phone-banking
    provides: "call_list, dnc, phone_bank model files"
provides:
  - "ZitadelService initialized on app.state during lifespan with fail-fast validation"
  - "All 17 model modules imported in app/db/base.py for Alembic discovery"
  - "Regression test preventing future model import drift"
affects: []

tech-stack:
  added: []
  patterns:
    - "Fail-fast lifespan validation: check config + validate credentials before accepting requests"
    - "Model coverage regression test: filesystem glob vs base.py content assertion"

key-files:
  created:
    - tests/unit/test_lifespan.py
    - tests/unit/test_model_coverage.py
  modified:
    - app/main.py
    - app/db/base.py

key-decisions:
  - "[07-01] ZitadelService init placed between JWKSManager and StorageService in lifespan"
  - "[07-01] Fail-fast: empty client_id/secret raises RuntimeError before any requests served"
  - "[07-01] _get_token() called at startup to validate credentials (not deferred)"

patterns-established:
  - "Lifespan fail-fast: validate external service credentials at startup"
  - "Model coverage regression: filesystem-based test prevents import drift"

requirements-completed: [AUTH-02, AUTH-03, AUTH-05, AUTH-07, PHONE-01, PHONE-02, PHONE-03, PHONE-04, PHONE-05]

duration: 4min
completed: 2026-03-10
---

# Phase 7 Plan 01: Lifespan Wiring and Model Imports Summary

**ZitadelService fail-fast lifespan init with credential validation, plus 3 missing Alembic model imports and regression test**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-10T00:50:36Z
- **Completed:** 2026-03-10T00:54:19Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ZitadelService initialized in app lifespan with fail-fast startup validation (missing config, invalid credentials, unreachable)
- All 17 model modules imported in app/db/base.py for complete Alembic autogenerate discovery
- 7 new tests: 5 lifespan wiring tests, 1 model coverage regression test, 1 E2E campaign creation flow test
- Full 263-test suite passes with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: ZitadelService lifespan init and base.py model imports (TDD)**
   - `88aa20c` (test: RED - failing tests for lifespan init and model coverage)
   - `dca02d0` (feat: GREEN - wire ZitadelService and add model imports)
2. **Task 2: Campaign creation E2E flow test** - `2bd337d` (test)

_Note: Task 1 used TDD with separate RED/GREEN commits_

## Files Created/Modified
- `tests/unit/test_lifespan.py` - Lifespan wiring tests + E2E campaign creation flow test
- `tests/unit/test_model_coverage.py` - Filesystem-based model import regression test
- `app/main.py` - Added ZitadelService init with fail-fast validation in lifespan
- `app/db/base.py` - Added 3 missing model imports (call_list, dnc, phone_bank)

## Decisions Made
- ZitadelService init placed between JWKSManager and StorageService in lifespan ordering
- Fail-fast pattern: empty client_id/secret raises RuntimeError before any requests served
- _get_token() called at startup to validate credentials proactively (not deferred to first request)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- INT-01, INT-02, FLOW-01 gaps are closed
- All production code wired and validated at startup
- Ready for remaining phase 07 plans (if any)

---
*Phase: 07-integration-wiring-fixes*
*Completed: 2026-03-10*
