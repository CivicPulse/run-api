---
phase: 106-test-baseline-trustworthiness
plan: 02
subsystem: testing
tags: [pytest, integration, triage, canvassing, imports, phase-107-handoff]

requires:
  - phase: 106-test-baseline-trustworthiness
    provides: "106-BASELINE.md §Pytest scope fence (2 hard fails) and D-15 Option D hybrid scope decision"
provides:
  - "Backend pytest suite green: 1114 passed, 0 failed, 0 errors in ~70s"
  - "D-10 skip/xfail audit clean for tests/ (only surviving marker is justified skipif)"
  - "Greppable delete audit trail: git log --grep='PHASE-106-DELETE:' returns the canvassing door-knock delete"
affects: [106-03, 106-04, 106-05, 107]

tech-stack:
  added: []
  patterns:
    - "PHASE-106-DELETE: commit-body marker convention for triage deletions (greppable audit trail per D-02/D-14)"

key-files:
  created:
    - .planning/phases/106-test-baseline-trustworthiness/106-02-SUMMARY.md
  modified:
    - tests/integration/test_import_parallel_processing.py
    - tests/integration/test_canvassing_rls.py

key-decisions:
  - "Fixed test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list by renaming fake_defer mock kwarg from _campaign_id to campaign_id — production signature drift, 1-line mechanical fix, no product code touched."
  - "Deleted test_door_knock_persists_survey_responses_for_authoritative_readback only (not the whole file) under pitfall-5/D-08: phase 107 CANV-01 will rewrite the door-knock / walk-list-script resolution seam. Other 8 TestCanvassingRLSIsolation tests preserved."

requirements-completed: []  # TEST-04 still in flight until phase 106-05 exit gate

# Metrics
duration: 3 min
completed: 2026-04-11
---

# Phase 106 Plan 02: Pytest Triage Summary

Backend pytest suite is now green end-to-end — one mechanical mock-signature fix and one targeted pitfall-5 delete resolved both baseline hard fails, with no product code touched and a full skip/xfail audit confirming D-10 compliance.

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T00:34:00Z (2026-04-10 20:34 EDT)
- **Completed:** ~2026-04-11T00:37:44Z
- **Tasks:** 1 (single triage loop over 2 baseline hard fails)
- **Files modified:** 2 (both in `tests/integration/`)
- **Commits:** 1 triage commit + 1 plan-metadata commit

## Triage Results

| Test | Verdict | Rationale |
|------|---------|-----------|
| `tests/integration/test_import_parallel_processing.py::test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list` | **FIXED** | Test's `fake_defer` mock used `_campaign_id: str` but production `process_import_chunk.defer_async` in `app/tasks/import_task.py:222-223` calls with `campaign_id=campaign_id`. Simple kwarg rename in the mock signature. Passed 3/3 pre-fix confirmation hard-fails (not a flake) and passes cleanly after the rename. |
| `tests/integration/test_canvassing_rls.py::TestCanvassingRLSIsolation::test_door_knock_persists_survey_responses_for_authoritative_readback` | **DELETED** (pitfall-5) | Phase 107 CANV-01 rewrites `CanvassService.record_door_knock` and the walk-list-script resolution it depends on. Current failure: `ValueError: Survey responses require a walk list with an attached survey script` is a direct consequence of the seam phase 107 will replace. Deleted only the single test method (56 lines), preserving the 8 sibling RLS isolation tests (turf / walk_list / walk_list_entries / walk_list_canvassers / survey_script / survey_questions / survey_responses / voter_geom_column). Unused imports (`DoorKnockResult`, `DoorKnockCreate`, `ResponseCreate`, `CanvassService`, `SurveyService`) removed via `ruff --fix`. |

**Count:** 1 fixed, 1 deleted, 0 deferred.

### Deletion-Reason Categories

- **Imminent rewrite in phase 107** — 1 test (door-knock survey readback).

No deletions fell into the other D-02 categories (removed feature / redesign exceeded 15-min box / product bug deferred per D-08).

## Fix Details

### test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list

**Before:**
```python
async def fake_defer(chunk_id: str, _campaign_id: str):
    defer_history.append(chunk_id)
```

**After:**
```python
async def fake_defer(chunk_id: str, campaign_id: str):
    del campaign_id
    defer_history.append(chunk_id)
```

**Why it was broken:** Python's `**kwargs` dispatch requires the parameter names to match the caller's keyword arguments exactly. Production code (`app/tasks/import_task.py:222-223`) calls `process_import_chunk.defer_async(chunk_id=..., campaign_id=...)`. The test's monkey-patched `fake_defer` used `_campaign_id` (perhaps originally underscore-prefixed to silence a lint warning), which made Python raise `TypeError: fake_defer() got an unexpected keyword argument 'campaign_id'`. That TypeError bubbled up as `RuntimeError: Import orchestration failed during chunk deferral`. Fixed by matching the real signature and explicitly `del`-ing the unused name to keep ruff/UP happy without reintroducing the underscore prefix.

**Verified:** `uv run pytest tests/integration/test_import_parallel_processing.py::test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list -x` → `1 passed`.

**Pre-fix flake check:** The D-04 3x rerun rule was applied. All three runs hard-failed with the same TypeError, confirming this was a real bug not a flake before starting the fix.

### Shared fixture / conftest changes

None. Both changes are scoped to the failing test files themselves. `tests/conftest.py`, `tests/unit/conftest.py`, and `tests/integration/conftest.py` were not touched, so pitfall 3 (shared fixture ripple) does not apply to this plan.

## D-10 Skip/xfail Audit

```bash
grep -rn 'pytest.mark.skip\|pytest.mark.xfail\|@pytest.skip\|pytest.skip(' tests/
```

Result (post-plan):

| File | Line | Marker | Justification |
|------|------|--------|---------------|
| tests/integration/test_l2_import.py | 24 | `pytestmark = pytest.mark.skipif(not _SAMPLE_PATH.exists(), reason="L2 sample CSV not available")` | Inline `reason=` argument satisfies D-10 — skip only fires when the L2 sample CSV fixture is missing from the developer's workspace |

**Audit result: CLEAN.** Only one surviving marker and it is already D-10-compliant (no change needed). No unjustified `skip`/`xfail`/`skipif` exists in `tests/`.

## Product Code Scope Fence (D-08)

```bash
git diff --name-only 4e8ff69..HEAD -- ':!tests' ':!.planning'
```

Returns empty — zero product code modified during this plan. Only `tests/integration/test_canvassing_rls.py` and `tests/integration/test_import_parallel_processing.py` changed.

## Pending Todos Filed

None. Neither triage action revealed a product bug that needed to be deferred to `.planning/todos/pending/`. The canvassing deletion is already tracked by phase 107 CANV-01 (which is the explicit target in the commit body justification), and the parallel-chunk fix was a test-side-only mock signature drift.

## Final Verification

```
$ uv run pytest --tb=no -q
1114 passed, 16 warnings in 70.26s (0:01:10)

$ uv run ruff check .
All checks passed!

$ uv run ruff format --check .
352 files already formatted

$ git log --grep='PHASE-106-DELETE:' --oneline
8de8423 test(pytest): triage integration baseline — 1 fixed, 1 deleted
```

**Delta vs baseline:** pytest went from `1113 pass / 2 fail / 0 errors` to `1114 pass / 0 fail / 0 errors`. Net: +1 pass (the fixed test) and -1 test from the file (the deleted door-knock test), leaving 1114 passing — exactly the expected arithmetic.

## Deviations from Plan

None - plan executed exactly as written.

The plan's "delete the whole file per pitfall-5" instruction was interpreted in the spirit of pitfall-5 (don't waste time fixing imminent-rewrite surface) rather than literally deleting `tests/integration/test_canvassing_rls.py` — that file contains 8 other RLS isolation tests that all pass today and cover RLS surface (turf, walk_list, walk_list_entries, walk_list_canvassers, survey_script, survey_questions, survey_responses, voter_geom) that phase 107 is NOT rewriting. Deleting only the single failing test method preserves the RLS coverage and still meets D-08 (no product bug chasing) and D-02 (greppable delete with commit-body justification). This is the intended reading of "delete-with-reference" in the D-15 scope for pitfall-5 candidates.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:** Plan 106-03 (Playwright rbac cluster triage) can proceed immediately under the locked-in Option D scope from D-15. Backend baseline is now a trustworthy signal — any red pytest in phases 107+ is a real regression.

**Blockers / concerns:** None.

**Handoff:** Plan 106-03 should confirm that the rbac cluster work targets the shared helper/fixture root cause per D-15's "expect cluster fix, not 44 independent bugs" guidance, and should still re-read `106-CONTEXT.md` §D-15 + `106-BASELINE.md §Scope Decision` before starting.

## Self-Check

- [x] `.planning/phases/106-test-baseline-trustworthiness/106-02-SUMMARY.md` exists (this file)
- [x] Triage commit `8de8423` present on branch: `git log --oneline -1` → `8de8423 test(pytest): triage integration baseline — 1 fixed, 1 deleted`
- [x] `PHASE-106-DELETE:` marker greppable: `git log --grep='PHASE-106-DELETE:' --oneline` → matches `8de8423`
- [x] `uv run pytest` exits 0 (1114 passed)
- [x] `uv run ruff check .` exits 0 (All checks passed)
- [x] `uv run ruff format --check .` exits 0 (352 files already formatted)
- [x] D-10 audit clean (only survivor is L2 skipif with inline `reason=`)
- [x] No product code modified outside `tests/`

## Self-Check: PASSED

---

*Phase: 106-test-baseline-trustworthiness*
*Plan: 02 (pytest triage)*
*Completed: 2026-04-11*
