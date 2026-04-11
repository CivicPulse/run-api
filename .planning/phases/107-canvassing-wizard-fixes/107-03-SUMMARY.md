---
phase: 107-canvassing-wizard-fixes
plan: 03
subsystem: testing
tags: [pytest, integration, httpx, fastapi, canvassing, door-knocks, contract-test]

requires:
  - phase: 107
    provides: D-10/D-16 contract-lock obligation for empty-notes door knocks
provides:
  - 4 pytest integration tests round-tripping door knocks with real, empty, null, and omitted notes
  - Future-proof contract lock against re-introducing a NOT NULL or min-length constraint on door_knock notes
affects: [107-01, 107-02, future canvassing schema changes]

tech-stack:
  added: []
  patterns:
    - "Integration test pattern: superuser_session fixture seeds campaign+turf+walk_list+entry+voter, then httpx ASGITransport AsyncClient via _make_app_for_campaign drives the FastAPI app under app_user RLS"

key-files:
  created:
    - tests/integration/test_door_knocks.py
  modified: []

key-decisions:
  - "Reused existing test_rls_api_smoke._make_app_for_campaign helper to build the ASGI client with auth bypass and RLS-enforced data access — same pattern phone-bank tests use"
  - "Test seeds its own campaign + turf + walk list + entry + voter via superuser_session rather than depending on shared seed data, keeping the test hermetic"
  - "Empty-string notes assertion accepts both '' and None as the observed contract — locks 'no validation error' rather than a specific normalization"
  - "Teardown wipes voter_interactions before voters/campaigns since the door-knock POST creates interaction rows referencing the seeded campaign"

patterns-established:
  - "Contract-lock integration test: posts via real ASGI client, asserts only the public API contract (status code + response shape), no DB introspection — keeps the test resilient to internal schema refactors"

requirements-completed: [CANV-03]

duration: 12 min
completed: 2026-04-10
---

# Phase 107 Plan 03: Door-Knock Empty-Notes Contract Lock Summary

**4 pytest integration tests round-tripping door knocks with real, empty, null, and omitted notes through the live FastAPI app — locks the CANV-03 backend contract against future regression**

## Performance

- **Duration:** ~12 min
- **Tasks:** 1
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- Created `tests/integration/test_door_knocks.py` with a `TestDoorKnockEmptyNotesContract` class containing 4 tests
- All 4 tests pass against the running PostgreSQL via `uv run pytest tests/integration/test_door_knocks.py -x` (1.45s)
- Ruff clean (`uv run ruff check` + `uv run ruff format` both passed)
- Confirmed via the test that the door-knock POST endpoint already accepts `notes=None`, `notes=""`, an omitted `notes` field, and a real notes string — proving the CANV-03 fix is purely frontend (no backend change, no migration)

## Task Commits

1. **Task 1: Add integration test round-tripping empty-notes door knocks (D-10/D-16)** — `a9fdbae` (test)

## Files Created/Modified

- `tests/integration/test_door_knocks.py` — 4 contract-lock tests for the door-knock POST optional-notes contract. Seeds a campaign/turf/walk list/entry/voter via the `superuser_session` fixture, builds an httpx ASGI client via `test_rls_api_smoke._make_app_for_campaign`, and asserts every notes shape returns 201.

## Tests Added

| # | Test | What it locks |
|---|------|---------------|
| 1 | `test_post_door_knock_with_real_notes_echoes_back` | Happy-path baseline — real notes string round-trips intact |
| 2 | `test_post_door_knock_with_empty_string_notes_returns_201` | `notes=""` is accepted (no min-length constraint) |
| 3 | `test_post_door_knock_with_null_notes_returns_201` | `notes=None` is accepted (no NOT NULL constraint) |
| 4 | `test_post_door_knock_omitting_notes_field_returns_201` | Field is truly optional (no `required` on the Pydantic model) |

## Decisions Made

- Built a hermetic `door_knock_fixture` instead of depending on seeded demo data — keeps the test self-contained and parallel-safe.
- Used `CampaignRole.VOLUNTEER` for the test user since the door-knock POST endpoint requires `volunteer+`.
- Asserted `body["notes"] in ("", None)` for the empty-string case to lock the no-validation-error contract without over-specifying normalization behavior. Both shapes are equally acceptable per D-10.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` block called out the right URL shape (`/api/v1/campaigns/{campaign_id}/walk-lists/{walk_list_id}/door-knocks`) and the executor confirmed it via reading `app/api/v1/walk_lists.py:332`.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- The CANV-03 backend contract is now locked against future regression.
- Plan 107-04+ (and any frontend-only fix in 107-01/02) can rely on the API accepting all four notes shapes without re-verification.
- Wave 1 of phase 107 is unblocked for the remaining parallel plans.

## Self-Check: PASSED

- `tests/integration/test_door_knocks.py` exists on disk
- `grep -c "async def test_"` returns 4
- Commit `a9fdbae` present in git history
- `uv run pytest tests/integration/test_door_knocks.py -x` exits 0 (4 passed in 1.45s)
- `uv run ruff check tests/integration/test_door_knocks.py` exits 0

---
*Phase: 107-canvassing-wizard-fixes*
*Completed: 2026-04-10*
