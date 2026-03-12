---
phase: 21-integration-polish
plan: 01
subsystem: ui, api
tags: [react, fastapi, sqlalchemy, phone-banking, dnc, datatable]

# Dependency graph
requires:
  - phase: 16-phone-banking
    provides: Phone bank session endpoints, session views, DNC management
  - phase: 15-call-lists-dnc-management
    provides: Call list models, DNC hooks and page
provides:
  - DNC table with reason column, reason search, and import reason selector
  - PhoneBankSessionResponse call_list_name enrichment from backend
  - Session views (index, my-sessions, detail) showing call list names as links
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batch-fetch lookup pattern extended to call_list_names alongside caller_counts"
    - "REASON_LABELS Record maps backend enum values to display strings"
    - "searchParams on ky POST for query parameter passing alongside FormData body"

key-files:
  created:
    - web/e2e/phase21-integration-polish.spec.ts
  modified:
    - app/schemas/phone_bank.py
    - app/api/v1/phone_banks.py
    - app/api/v1/dnc.py
    - app/services/dnc.py
    - web/src/types/phone-bank-session.ts
    - web/src/hooks/useDNC.ts
    - web/src/hooks/useDNC.test.ts
    - web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx

key-decisions:
  - "DNC import reason sent as searchParams query parameter alongside FormData body"
  - "Sessions index removes useCallLists lookup in favor of backend call_list_name"
  - "SessionDialog retains its own useCallLists call for call list selector dropdown"

patterns-established:
  - "REASON_LABELS Record for DNC reason enum-to-display mapping"
  - "Batch call_list_names lookup follows same dict pattern as batch caller_counts"

requirements-completed: [CALL-06, PHON-05, PHON-07]

# Metrics
duration: 291s
completed: 2026-03-12
---

# Phase 21 Plan 01: Integration Polish Summary

**DNC reason column with search and import selector, plus call list name links in all three session views replacing truncated UUIDs**

## Performance

- **Duration:** 4 min 51 sec
- **Started:** 2026-03-12T20:54:47Z
- **Completed:** 2026-03-12T20:59:38Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- DNC table displays Reason column with human-readable labels (Refused, Voter Request, Registry Import, Manual)
- DNC search extended to filter by both phone number and reason text
- DNC import dialog includes reason selector (Voter Request, Registry Import, Manual) with "Refused" excluded
- Backend PhoneBankSessionResponse enriched with call_list_name via batch and single-fetch lookups
- All three session views (sessions index, My Sessions, session detail) show call list names as clickable links
- Deleted call lists show muted "Deleted list" fallback text

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 -- Create e2e test stubs** - `ad3dbf1` (test)
2. **Task 1: Backend enrichment -- DNC import reason + session call_list_name** - `739782a` (feat)
3. **Task 2: Frontend polish -- DNC reason column/search/import + session call list names** - `55f89d1` (feat)

## Files Created/Modified
- `web/e2e/phase21-integration-polish.spec.ts` - Wave 0 e2e test stubs (7 test.todo)
- `app/schemas/phone_bank.py` - Added call_list_name field to PhoneBankSessionResponse
- `app/api/v1/phone_banks.py` - Batch-fetch call list names in list_sessions, single-fetch in get_session
- `app/api/v1/dnc.py` - Added reason query parameter to bulk import endpoint
- `app/services/dnc.py` - Added default_reason parameter to bulk_import method
- `web/src/types/phone-bank-session.ts` - Added call_list_name to PhoneBankSession interface
- `web/src/hooks/useDNC.ts` - Updated useImportDNC to accept { file, reason } and pass searchParams
- `web/src/hooks/useDNC.test.ts` - Updated import test to verify new signature with reason
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx` - Reason column, search, import selector
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/index.tsx` - Call list name links from backend
- `web/src/routes/campaigns/$campaignId/phone-banking/my-sessions/index.tsx` - Call list name links
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx` - Call list name link in Overview

## Decisions Made
- DNC import reason sent as searchParams query parameter alongside FormData body (ky supports both body and searchParams simultaneously)
- Sessions index page removed its useCallLists lookup and callListsById construction since backend now provides call_list_name directly
- SessionDialog retains its own useCallLists call for the call list selector dropdown (only the SessionsPage lookup was removed)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three requirements (CALL-06, PHON-05, PHON-07) are now satisfied
- E2e test stubs ready for promotion to full tests if needed
- No blockers or concerns

## Self-Check: PASSED

All 13 files verified present. All 3 task commits verified in git log.

---
*Phase: 21-integration-polish*
*Completed: 2026-03-12*
