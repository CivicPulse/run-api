---
phase: 24-import-pipeline-enhancement
plan: 03
subsystem: api
tags: [python, import, upsert, voter-phone, voting-history, propensity, sqlalchemy]

# Dependency graph
requires:
  - phase: 24-import-pipeline-enhancement
    provides: "Plan 01 parsing utilities (parse_propensity, normalize_phone, parse_voting_history) and Plan 02 phones_created column on ImportJob"
provides:
  - "Fixed voter upsert SET clause using Voter.__table__.columns introspection"
  - "RETURNING clause on voter upsert for voter-to-phone linking"
  - "VoterPhone bulk creation from __cell_phone data during import"
  - "Voting history parsing wired into apply_field_mapping"
  - "Propensity string parsing wired into apply_field_mapping"
  - "phones_created tracking in process_import_file"
affects: [25-voter-filtering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model-driven SET clause via Voter.__table__.columns introspection with _UPSERT_EXCLUDE frozenset"
    - "__cell_phone double-underscore prefix routing from apply_field_mapping to process_csv_batch phone creation"
    - "INSERT RETURNING for cross-table linking (voter ID to VoterPhone)"
    - "VoterPhone ON CONFLICT DO UPDATE excluding is_primary to preserve manual edits"

key-files:
  created: []
  modified:
    - app/services/import_service.py
    - tests/unit/test_import_service.py

key-decisions:
  - "SET clause derived from Voter.__table__.columns with _UPSERT_EXCLUDE frozenset, not from first batch row keys"
  - "VoterPhone upsert deliberately excludes is_primary from SET to preserve user-made edits"
  - "Failed phone normalization skips phone creation but does not block voter import"
  - "voting_history only set when voting history columns detected (avoids wiping data on re-imports without voting columns)"
  - "phone_value extracted from result dict before voter upsert to keep voter dicts clean"

patterns-established:
  - "Voter upsert pattern: insert().values().on_conflict_do_update().returning(Voter.id)"
  - "Phone upsert pattern: insert(VoterPhone).on_conflict_do_update(constraint=..., set_={excluding is_primary})"
  - "Propensity fields parsed inline during apply_field_mapping, not deferred to batch"
  - "Voting history parsed from original CSV row (not mapped voter dict) to capture unmapped General_/Primary_ columns"

requirements-completed: [IMPT-01, IMPT-02, IMPT-06]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 24 Plan 03: Core Pipeline Enhancement Summary

**Fixed voter upsert SET clause bug, added RETURNING for voter-to-phone linking, wired VoterPhone bulk creation from cell phone data, and integrated voting history and propensity parsing into the import pipeline**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T22:57:00Z
- **Completed:** 2026-03-13T23:01:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed critical SET clause bug (IMPT-06): upsert now derives update columns from Voter.__table__.columns instead of first batch row keys, ensuring all model columns are always included
- Added .returning(Voter.id) to voter upsert for linking newly created/updated voters to VoterPhone records
- Wired VoterPhone bulk creation into process_csv_batch with ON CONFLICT DO UPDATE (excluding is_primary)
- Integrated propensity string parsing (77% -> 77), voting history column detection, and __cell_phone routing into apply_field_mapping
- phones_created tracking added to process_import_file and logged in completion message
- 11 new unit tests covering SET clause fix, RETURNING, phone creation, propensity parsing, voting history, and is_primary exclusion
- All 333 unit tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix SET clause and add RETURNING to process_csv_batch** - `a75bc0f` (feat)
2. **Task 2: Wire phone creation, voting history, and propensity parsing into pipeline** - `5320479` (feat)

## Files Created/Modified
- `app/services/import_service.py` - Fixed SET clause, added RETURNING, VoterPhone creation, propensity/voting history parsing in apply_field_mapping, phones_created tracking in process_import_file
- `tests/unit/test_import_service.py` - 11 new tests across TestUpsertSetClause, TestApplyFieldMappingEnhancements, TestPhoneCreationInBatch

## Decisions Made
- SET clause uses _UPSERT_EXCLUDE frozenset to exclude identity/auto-managed columns (id, campaign_id, source_type, source_id, created_at, updated_at, geom)
- VoterPhone ON CONFLICT SET deliberately excludes is_primary to preserve manual user edits during re-import
- Failed phone normalization is silently skipped (voter still imports) per user decision that bad phone data should not block import
- voting_history only set on voter dict when voting columns are actually detected, preventing data wipe on re-imports of CSVs without voting columns
- phone_value extracted at the result dict level (not voter dict) to keep voter dicts clean for database insertion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full import pipeline now handles phone data, voting history, and propensity scores end-to-end
- L2 CSV imports will produce correct VoterPhone records, parsed voting_history arrays, and integer propensity scores
- Ready for Phase 25 voter filtering to query against propensity_general/primary/combined integers and voting_history arrays

## Self-Check: PASSED

All files and commits verified:
- app/services/import_service.py: FOUND
- tests/unit/test_import_service.py: FOUND
- Commit a75bc0f: FOUND
- Commit 5320479: FOUND

---
*Phase: 24-import-pipeline-enhancement*
*Completed: 2026-03-13*
