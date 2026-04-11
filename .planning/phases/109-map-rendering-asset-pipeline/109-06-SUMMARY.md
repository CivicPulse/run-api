---
phase: 109-map-rendering-asset-pipeline
plan: 06
subsystem: exit-gate
tags: [exit-gate, verification, 4-suite, map-01, map-02, map-03]
requirements: [MAP-01, MAP-02, MAP-03, TEST-01, TEST-02, TEST-03]
dependency_graph:
  requires: [109-01, 109-02, 109-03, 109-04, 109-05]
  provides:
    - "Phase 109 exit gate evidence (ruff + pytest + vitest + tsc + 2x Playwright)"
    - "MAP-01/02/03 closed in REQUIREMENTS.md"
    - "Radix portal z-1200 fix (repairs Select/Popover/DropdownMenu/Tooltip inside Sheets)"
  affects:
    - .planning/phases/109-map-rendering-asset-pipeline/109-VERIFICATION-RESULTS.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - web/src/index.css
    - web/e2e/canvassing-map-rendering.spec.ts
tech-stack:
  added: []
  patterns:
    - "Phase 108 exit gate format mirrored (YAML frontmatter + Gate 1-4 sections)"
    - "Radix portal popper z-1200 companion rule to the Sheet z-1100 bump"
    - "Playwright waitForFunction requires img.complete && naturalWidth > 0 for data-URI asset races"
key-files:
  created:
    - .planning/phases/109-map-rendering-asset-pipeline/109-VERIFICATION-RESULTS.md
    - .planning/phases/109-map-rendering-asset-pipeline/109-06-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - web/src/index.css
    - web/e2e/canvassing-map-rendering.spec.ts
decisions:
  - "Phase 109 exit gate PASSED — ruff clean / pytest 1118 no delta / tsc clean / vitest 738 (+17) / Playwright 308 two consecutive greens"
  - "Radix Select/Popover/DropdownMenu/Tooltip content bumped to z-index 1200 to repair stacking inside Sheets — required companion to the 109-03 Sheet z-1100 bump that broke VCRUD-02"
  - "MAP-01 Playwright test extended its waitForFunction to require img.complete && naturalWidth > 0 instead of just length > 0 — eliminates the 8-worker parallel-load decode race"
metrics:
  duration: "~40 min"
  completed: 2026-04-11
  tasks_total: 2
  tasks_completed: 2
---

# Phase 109 Plan 06: Exit Gate — 4-Suite Verification Summary

**One-liner:** Ran the full phase 109 exit gate (ruff + pytest + vitest + tsc + 2×Playwright via run-e2e.sh), authored `109-VERIFICATION-RESULTS.md`, marked MAP-01/02/03 complete in `REQUIREMENTS.md`, and shipped two Rule 1 auto-fixes surfaced by the gate itself — a Radix portal z-index repair so Select dropdowns keep working inside Sheets after 109-03's overlay bump, and a MAP-01 test decode-race fix so the new Playwright spec is stable under 8-worker parallel load. All 4 gates green, zero regressions vs phase 108.

## What Shipped

### Gate results

| Suite      | Exit | Result                         | Delta vs Phase 108 |
|------------|------|--------------------------------|--------------------|
| Ruff check | 0    | All checks passed              | — (clean)          |
| Ruff fmt   | 0    | 353 files already formatted    | — (clean)          |
| Pytest     | 0    | 1118 pass, 0 fail, 0 skip      | **0** (no Python changes) |
| tsc        | 0    | clean                          | — (clean)          |
| Vitest     | 0    | 738 pass, 0 fail, 21 todo      | **+17 pass / −3 todo** |
| Playwright run 1 | 0 | 308 pass, 0 fail, 66 skip    | **+4** net         |
| Playwright run 2 | 0 | 308 pass, 0 fail, 66 skip    | **+4** net         |

### Vitest delta

721 → 738 = **+17 pass** (24 → 21 todo on the `.todo` side). Matches the Plan 109-02/03/04 additions:

- +8 `leafletIcons.test.ts` factory contract tests (109-02, new file)
- +2 `leafletIcons.test.ts` cross-factory integration guards (109-04)
- +3 `VoterMarkerLayer.test.tsx` converted from `it.todo` stubs to real tests (109-04) — explains the `-3 todo` delta as well
- +2 `canvassing.test.tsx` MAP-02 inert-wrapper + DOM-identity regression guards (109-03)
- +2 unaccounted-for (likely 109-02 test updates for CanvassingMap consumer contract)

### Playwright two-greens-protocol evidence

```json
{
  "timestamp": "2026-04-11T14:31:13Z",
  "pass": 308, "fail": 0, "skip": 66, "did_not_run": 0, "total": 374,
  "duration_s": "148.8",
  "command": "npx playwright test --reporter=list --workers 8",
  "exit_code": 0,
  "log_file": "e2e-logs/20260411-103113.log",
  "mode": "preview", "workers": "8"
}
{
  "timestamp": "2026-04-11T14:33:47Z",
  "pass": 308, "fail": 0, "skip": 66, "did_not_run": 0, "total": 374,
  "duration_s": "154.3",
  "command": "npx playwright test --reporter=list --workers 8",
  "exit_code": 0,
  "log_file": "e2e-logs/20260411-103347.log",
  "mode": "preview", "workers": "8"
}
```

All 3 new `canvassing-map-rendering.spec.ts` tests green in both runs.

### Documents authored / updated

- **NEW** `.planning/phases/109-map-rendering-asset-pipeline/109-VERIFICATION-RESULTS.md` — YAML frontmatter with per-suite counts, Gate 1-4 sections with commands + timestamps + output excerpts, requirements closed table, test coverage obligations, must-have verification, deviations (2 Rule 1 auto-fixes + 1 db cleanup), regressions section (none), conclusion.
- **UPDATED** `.planning/REQUIREMENTS.md` — MAP-01, MAP-02, MAP-03 flipped from `[ ]` to `[x]`. Traceability table unchanged.
- **UPDATED** `web/src/index.css` — new CSS rule bumping `[data-slot="select-content"]`, `[data-slot="popover-content"]`, `[data-slot="dropdown-menu-content"]`, `[data-slot="tooltip-content"]`, and `[data-radix-popper-content-wrapper]` to `z-index: 1200`.
- **UPDATED** `web/e2e/canvassing-map-rendering.spec.ts` — MAP-01 test `waitForFunction` tightened to require `img.complete && img.naturalWidth > 0` on every `.leaflet-container img`.
- **PENDING** `.planning/STATE.md`, `.planning/ROADMAP.md` — updated via gsd-tools in the final state-update step.

## Files Touched

- `.planning/phases/109-map-rendering-asset-pipeline/109-VERIFICATION-RESULTS.md` (new)
- `.planning/phases/109-map-rendering-asset-pipeline/109-06-SUMMARY.md` (new — this file)
- `.planning/REQUIREMENTS.md` (3 lines flipped)
- `web/src/index.css` (12 lines added — Radix portal z-1200 rule)
- `web/e2e/canvassing-map-rendering.spec.ts` (8 lines changed — MAP-01 waitForFunction body)

## Commits

| Task | Description                                                              | Commit    |
|------|--------------------------------------------------------------------------|-----------|
| 1 (auto-fix) | `fix(109-06): radix popper z-index + MAP-01 test decode race (exit gate)` | `82b5ced` |
| 2    | `docs(109-06): phase 109 verification results (exit gate)`               | `521653b` |

## Verification Results

| Check                                                                                                | Result |
|------------------------------------------------------------------------------------------------------|--------|
| `test -f 109-VERIFICATION-RESULTS.md`                                                                | PASS   |
| `grep -q "MAP-01" 109-VERIFICATION-RESULTS.md`                                                       | PASS   |
| `grep -q "MAP-02" 109-VERIFICATION-RESULTS.md`                                                       | PASS   |
| `grep -q "MAP-03" 109-VERIFICATION-RESULTS.md`                                                       | PASS   |
| `grep -q "e2e-runs.jsonl" 109-VERIFICATION-RESULTS.md`                                               | PASS   |
| `grep -qE "Exit gate PASSED" 109-VERIFICATION-RESULTS.md`                                            | PASS   |
| `grep -q "\[x\] \*\*MAP-01" REQUIREMENTS.md`                                                         | PASS   |
| `grep -q "\[x\] \*\*MAP-02" REQUIREMENTS.md`                                                         | PASS   |
| `grep -q "\[x\] \*\*MAP-03" REQUIREMENTS.md`                                                         | PASS   |
| `uv run ruff check .`                                                                                | PASS (0) |
| `uv run ruff format --check .`                                                                      | PASS (0) |
| `uv run pytest` (1118/0/0)                                                                           | PASS (0) |
| `cd web && npx tsc --noEmit`                                                                         | PASS (0) |
| `cd web && npx vitest run` (738/0/21 todo)                                                           | PASS (0) |
| `cd web && ./scripts/run-e2e.sh` (run 1 — 308/0/66 — `2026-04-11T14:31:13Z`)                         | PASS (0) |
| `cd web && ./scripts/run-e2e.sh` (run 2 — 308/0/66 — `2026-04-11T14:33:47Z`)                         | PASS (0) |

## Success Criteria

- **Ruff clean** — SATISFIED.
- **Pytest passes (delta vs phase 108 documented)** — SATISFIED (0 delta, phase 109 touched zero Python files).
- **Vitest passes (+new tests for 109)** — SATISFIED (+17 pass, −3 todo).
- **tsc clean** — SATISFIED (`--noEmit` clean; the unrelated `tsc -b` issue in `useCanvassingWizard.test.ts` is a deferred test-hygiene item carried from 109-02).
- **Playwright runs include canvassing-map-rendering.spec.ts green (two consecutive)** — SATISFIED (3/3 in both `14:31:13Z` and `14:33:47Z` runs).
- **109-VERIFICATION-RESULTS.md authored** — SATISFIED.
- **109-06-SUMMARY.md authored and committed** — SATISFIED (this file + `521653b`).
- **REQUIREMENTS.md MAP-01/02/03 marked complete** — SATISFIED.

## Deviations from Plan

Two Rule 1 auto-fixes were applied during Gate 4. Both surfaced because the phase 109 code was green in isolation but the full-suite + parallel load exposed cross-cutting interactions.

### 1. [Rule 1 — Bug] Radix Popover/Select z-index below Sheet overlay

**Symptom:** First full-suite gate run exited 1 with VCRUD-02 ("Edit 5 voters with varied field changes") failing at `web/e2e/voter-crud.spec.ts:395`. Error: "sheet-overlay intercepts pointer events" after 57 retries on the Radix Select dropdown option click inside the voter edit Sheet.

**Root cause:** Plan 109-03 added a global CSS rule:
```css
[data-slot="sheet-overlay"],
[data-slot="sheet-content"] {
  z-index: 1100;
}
```
The rule was required to sit above Leaflet's `z-1000` `.leaflet-control` on field-mode maps. But as a global selector it affected every Sheet in the app, including the voter edit Sheet on `/campaigns/{id}/voters/{id}`. Radix Select content renders via a portal at the default `z-50`, which lost to the new `z-1100` overlay whenever a Sheet contained a Select (or Popover, DropdownMenu, Tooltip).

**Fix:** Added a companion rule in `web/src/index.css` bumping every Radix popper portal content slot to `z-index: 1200`:
```css
[data-slot="select-content"],
[data-slot="popover-content"],
[data-slot="dropdown-menu-content"],
[data-slot="tooltip-content"],
[data-radix-popper-content-wrapper] {
  z-index: 1200;
}
```
Restores the invariant that portal popovers always sit above the Sheet that launched them while keeping the 109-03 Sheet > Leaflet-control guarantee intact.

**Verify:** `voter-crud.spec.ts` 5/5 pass in isolation post-fix; both full-suite gate runs green.

**Files:** `web/src/index.css`
**Commit:** `82b5ced`

### 2. [Rule 1 — Bug] MAP-01 Playwright test raced image decode under 8-worker load

**Symptom:** Second full-suite gate run (after fix #1) failed at `web/e2e/canvassing-map-rendering.spec.ts:329` with "Expected: > 0, Received: 0" on `expect(w).toBeGreaterThan(0)` for a marker `<img>` `naturalWidth`. The test had passed in its previous isolated run.

**Root cause:** Plan 109-05 shipped the spec with a `waitForFunction` that polled only `document.querySelectorAll(".leaflet-container img").length > 0`. The subsequent `page.evaluate` measured `naturalWidth` on every matched `<img>`. Under 8 parallel workers, the browser sometimes inserted the element before the data-URI decode microtask had flushed, so the measurement grabbed `naturalWidth === 0`. Data URIs do decode synchronously but the measurement can still race the insertion if both fire in the same tick.

**Fix:** Tightened the `waitForFunction` body to require every image to be `img.complete && img.naturalWidth > 0`, not just `length > 0`:
```ts
await page.waitForFunction(
  () => {
    const imgs = Array.from(
      document.querySelectorAll(".leaflet-container img"),
    ) as HTMLImageElement[]
    if (imgs.length === 0) return false
    return imgs.every((img) => img.complete && img.naturalWidth > 0)
  },
  undefined,
  { timeout: 15_000 },
)
```

**Verify:** Two consecutive full-suite greens post-fix (308/0/66 × 2). MAP-01 marker test green in both.

**Files:** `web/e2e/canvassing-map-rendering.spec.ts`
**Commit:** `82b5ced` (bundled with fix #1)

### 3. Database cleanup (not a code fix)

The first failed gate run left 20 `first_name='Test'` voters and a renamed Macon-Bibb campaign in the dev DB. Cleaned up via a cascade `DELETE` across `survey_responses`, `walk_list_entries`, `call_list_entries`, `voters` and a single `UPDATE campaigns`. Not a phase 109 bug — standard fallout when a serial spec aborts partway. With Rule 1 fix #1 in place, VCRUD-04 now runs on every successful suite run and restores this state automatically.

## Known Stubs / Deferred

Carried forward from earlier plans; no new deferrals introduced by Plan 109-06.

1. **`tsc -b` incremental-build errors in `useCanvassingWizard.test.ts`** — 3 errors on `delete` operator usage. `tsc --noEmit` is clean. Scoped for a test-hygiene plan.
2. **`web/public/leaflet/` hand-managed marker PNG copies** — production no longer reads from here; safe to delete.
3. **Reconciliation state machine** — deferred to phase 110 per D-10.
4. **E2E Sheet-portal + map `::before` pointer-event overlap** — deferred per Plan 108-06 §1.
5. **Enter-key activation at the E2E layer** — deferred per Plan 108-06 §2.

## Self-Check: PASSED

- `.planning/phases/109-map-rendering-asset-pipeline/109-VERIFICATION-RESULTS.md` — FOUND
- `.planning/phases/109-map-rendering-asset-pipeline/109-06-SUMMARY.md` — FOUND (this file)
- `.planning/REQUIREMENTS.md` MAP-01/02/03 `[x]` — FOUND
- `web/src/index.css` Radix portal z-1200 rule — FOUND (lines ~222-235)
- `web/e2e/canvassing-map-rendering.spec.ts` tightened `waitForFunction` — FOUND
- Commit `82b5ced` — FOUND in git log (`fix(109-06): radix popper z-index + MAP-01 test decode race (exit gate)`)
- Commit `521653b` — FOUND in git log (`docs(109-06): phase 109 verification results (exit gate)`)
- Playwright jsonl `2026-04-11T14:31:13Z` and `2026-04-11T14:33:47Z` with `exit_code: 0` — FOUND

## Threat Flags

None. This plan touches documentation, state files, one CSS file, and one Playwright spec. The CSS rule is purely a z-index layering fix with no new network surface, no schema changes, and no auth-relevant paths. The Playwright spec fix tightens a test-side assertion without changing production code. The gate runs exercise existing test suites without modifying any backend or schema.
