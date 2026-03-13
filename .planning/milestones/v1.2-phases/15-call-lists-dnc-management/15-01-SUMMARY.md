---
phase: 15-call-lists-dnc-management
plan: "01"
subsystem: backend-api, frontend-tests
tags: [call-lists, dnc, schemas, tdd, wave-0]
dependency_graph:
  requires: []
  provides:
    - CallListUpdate schema with name/voter_list_id optional fields
    - PATCH /call-lists/{id} accepts optional JSON body
    - GET /call-lists/{id}/entries returns paginated entries with voter_name
    - useCallLists.test.ts it.todo stubs
    - useDNC.test.ts it.todo stubs
    - DNCListPage index.test.tsx it.todo stubs
  affects:
    - app/schemas/call_list.py
    - app/api/v1/call_lists.py
    - app/services/call_list.py
tech_stack:
  added: []
  patterns:
    - Service layer returns model objects; voter name join handled at endpoint layer
    - it.todo stubs for Wave 0 test scaffolding before feature implementation
key_files:
  created:
    - web/src/hooks/useCallLists.test.ts
    - web/src/hooks/useDNC.test.ts
    - web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx
  modified:
    - app/schemas/call_list.py
    - app/api/v1/call_lists.py
    - app/services/call_list.py
decisions:
  - PATCH handler keeps new_status as optional query param for backward compatibility while adding optional JSON body
  - Voter name join handled at endpoint layer (not service) to keep service returning plain model objects
  - entry_status query param (not status) to avoid shadowing FastAPI's status import
metrics:
  duration: "163 seconds"
  completed_date: "2026-03-11"
  tasks: 2
  files_modified: 3
  files_created: 3
---

# Phase 15 Plan 01: Backend API Gaps + Wave 0 Test Scaffolds Summary

**One-liner:** Added CallListUpdate JSON body to PATCH handler and new GET /entries endpoint with voter name join, plus three it.todo test stubs to unblock Phase 15 frontend work.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add CallListUpdate schema and update PATCH endpoint | a5394de | app/schemas/call_list.py, app/api/v1/call_lists.py, app/services/call_list.py |
| 2 | Add GET /entries endpoint, list_entries service, test scaffolds | 6028380 | + 3 web test files |

## What Was Built

### Task 1: CallListUpdate Schema + Updated PATCH Handler

- Added `CallListUpdate` Pydantic schema with `name: str | None` and `voter_list_id: uuid.UUID | None`
- Added `update_call_list` service method to `CallListService` that handles both field updates and status transitions in one call
- Updated `PATCH /campaigns/{id}/call-lists/{id}` to accept optional JSON body alongside optional `new_status` query param

### Task 2: GET /entries Endpoint + Test Scaffolds

- Added `voter_name: str | None = None` field to `CallListEntryResponse`
- Added `list_entries` service method with optional status filter, orders by priority_score desc
- Added `GET /campaigns/{id}/call-lists/{id}/entries` endpoint that:
  - Calls `list_entries` service method
  - Batch-resolves voter names from the Voter table
  - Returns `PaginatedResponse[CallListEntryResponse]` with voter_name populated
- Created three Wave 0 test stub files (all `it.todo`, run green immediately):
  - `web/src/hooks/useCallLists.test.ts` — 5 stubs for CALL-01/02/03
  - `web/src/hooks/useDNC.test.ts` — 4 stubs for DNC hooks
  - `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx` — 4 stubs for CALL-08 client-side filter behavior

## Decisions Made

1. **PATCH query param kept optional for backward compat** — `new_status` changed from required to optional so both old (status-only) and new (body-only or combined) callers work.
2. **Voter name join at endpoint, not service** — Keeps service methods returning plain SQLAlchemy model objects; the endpoint orchestrates the join. Consistent with project patterns.
3. **`entry_status` query param name** — FastAPI endpoint uses `entry_status` parameter (not `status`) to avoid shadowing the imported `status` module. The query string key is still `?entry_status=`.

## Verification Results

- `uv run python -c "from app.schemas.call_list import CallListUpdate, CallListEntryResponse; print('schemas OK')"` — passed
- `list_call_list_entries` function present in router source — confirmed
- `cd web && npm run test -- --run` — 110 passed, 18 todo, 0 failures

## Deviations from Plan

None — plan executed exactly as written, with one minor naming adjustment (`entry_status` instead of `status` as query param name to avoid shadowing the FastAPI status import).

## Self-Check: PASSED

- `app/schemas/call_list.py` — exists, contains `class CallListUpdate` and `voter_name` field
- `app/api/v1/call_lists.py` — exists, contains `list_call_list_entries`
- `app/services/call_list.py` — exists, contains `list_entries` and `update_call_list`
- `web/src/hooks/useCallLists.test.ts` — created
- `web/src/hooks/useDNC.test.ts` — created
- `web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx` — created
- Commits a5394de and 6028380 — verified present
