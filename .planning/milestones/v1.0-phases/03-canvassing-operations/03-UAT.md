---
status: testing
phase: 03-canvassing-operations
source: 03-00-SUMMARY.md, 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md
started: 2026-03-09T20:30:00Z
updated: 2026-03-09T20:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server/services. Run `docker compose up -d postgres`, wait for healthy, then `uv run alembic upgrade head`. Migration 003 applies cleanly — PostGIS extension created, 7 new tables (turfs, walk_lists, walk_list_entries, walk_list_canvassers, survey_scripts, survey_questions, survey_responses) created, RLS policies applied, voter geom column added with GiST index. No errors.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/services. Run `docker compose up -d postgres`, wait for healthy, then `uv run alembic upgrade head`. Migration 003 applies cleanly — PostGIS extension created, 7 new tables created, RLS policies applied, voter geom column added with GiST index. No errors.
result: [pending]

### 2. Unit Tests Pass
expected: Run `uv run pytest tests/unit/test_turfs.py tests/unit/test_walk_lists.py tests/unit/test_canvassing.py tests/unit/test_surveys.py -v`. All tests pass (turf model/schema validation, walk list generation/clustering/assignment, door-knock recording, survey lifecycle/question validation/response type checking).
result: [pending]

### 3. Turf CRUD via API
expected: Start the API server. Create a turf with a GeoJSON polygon boundary via POST /api/v1/turfs. Response includes turf ID, name, status "draft", and boundary as GeoJSON. GET /api/v1/turfs/{id} returns the created turf. PATCH to update name works. DELETE removes the turf.
result: [pending]

### 4. Walk List Generation from Turf
expected: With a turf containing voters (from Phase 2 import), POST to generate a walk list from the turf. Response includes walk list with entry count matching voters within the turf polygon. Entries are ordered by address (street name, then house number) and include voter details.
result: [pending]

### 5. Household Clustering in Walk Lists
expected: When generating a walk list for a turf with voters sharing the same address, entries for the same household appear consecutively in the list. Household grouping is based on normalized (address_line1, zip5).
result: [pending]

### 6. Door-Knock Recording
expected: POST a door-knock result for a walk list entry. Response records the result (e.g., NOT_HOME, CONTACT, REFUSED). The walk list entry status changes to VISITED, the walk list's visited_entries count increments, and a VoterInteraction of type DOOR_KNOCK is created.
result: [pending]

### 7. Survey Script Lifecycle
expected: Create a survey script (status: DRAFT). Add questions of various types (yes_no, multiple_choice, open_text, rating). Activate the script (status changes to ACTIVE, questions become immutable). Archive the script. Invalid transitions (e.g., active→draft) are rejected with 400/409 error.
result: [pending]

### 8. Survey Response Recording
expected: With an active script, POST batch responses for a voter. Each response is validated against question type (e.g., multiple_choice must match defined options). Responses stored in survey_responses table AND a SURVEY_RESPONSE interaction event is emitted for audit trail.
result: [pending]

### 9. Integration Tests — Spatial Queries
expected: Run `uv run pytest tests/integration/test_spatial.py -v` (requires running PostGIS). Tests verify: PostGIS extension active, voter geom populated from lat/lng, ST_Contains query finds voters within polygon, GiST index exists on voter.geom.
result: [pending]

### 10. Integration Tests — RLS Isolation
expected: Run `uv run pytest tests/integration/test_canvassing_rls.py -v` (requires running PostgreSQL). Tests verify tenant isolation: turfs, walk lists, walk list entries, walk list canvassers, survey scripts, survey questions, and survey responses are all invisible across campaigns.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]
