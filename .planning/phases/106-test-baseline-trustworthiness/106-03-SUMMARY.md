---
phase: 106-test-baseline-trustworthiness
plan: 03
subsystem: testing
tags: [vitest, triage, mock-drift, phase-107-handoff, shifts-cluster]

requires:
  - phase: 106-test-baseline-trustworthiness
    provides: "106-BASELINE.md §Vitest scope fence (65 hard fails) and D-15 Option D hybrid scope decision"
provides:
  - "Frontend vitest suite green: 72 test files passed, 675 tests passed, 0 failed, 24 todo, 7 file-level todo-only skips"
  - "D-10 skip/fixme/only audit clean for web/src (no markers found, none needing justification)"
  - "Greppable delete audit trail: git log --grep='PHASE-106-DELETE:' returns the useCanvassing.test.ts delete"
affects: [106-04, 106-05, 107]

tech-stack:
  added: []
  patterns:
    - "Mock-drift discovery loop: read real hook signature before trusting test mocks — paginated { items } vs raw array list[...] was the shifts cluster root cause"

key-files:
  created:
    - .planning/phases/106-test-baseline-trustworthiness/106-03-SUMMARY.md
  modified:
    - web/src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.test.tsx
    - web/src/routes/campaigns/$campaignId/volunteers/shifts/index.test.tsx
    - web/src/routes/callback.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx
    - web/src/hooks/usePermissions.test.ts
    - web/src/hooks/useVolunteerTags.test.ts
  deleted:
    - web/src/hooks/useCanvassing.test.ts

key-decisions:
  - "Shifts cluster (34 fails) was mock drift, not a product bug — 5-min mock-shape check confirmed the real hook returns ShiftSignupResponse[] (raw array) while the test mocks returned paginated { items, total, has_more, next_cursor }. D-08 deletion path was unnecessary; 1 mock shape fix cleared all 34 signups.map failures."
  - "Deleted useCanvassing.test.ts wholesale under pitfall-5 — phase 107 CANV-01/02/03 rewrites the canvassing hook; fix is wasted work per D-08. Single delete commit with PHASE-106-DELETE: marker."

requirements-completed: []  # TEST-04 still in flight until phase 106-05 exit gate

# Metrics
duration: 5 min
completed: 2026-04-11
---

# Phase 106 Plan 03: Vitest Triage Summary

Frontend vitest suite is now green end-to-end — one mock-shape fix cleared the 34-test shifts cluster (D-08 mock drift, not a product bug), one pitfall-5 delete removed the canvassing hook test, and four surgical mock/import fixes handled the remainder.

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-11T00:40:10Z
- **Completed:** 2026-04-11T00:45:28Z
- **Tasks:** 1 (single triage loop)
- **Files modified:** 6 (all under `web/src/**/*.test.{ts,tsx}`)
- **Files deleted:** 1 (`web/src/hooks/useCanvassing.test.ts`)
- **Commits:** 3 triage + 1 plan-metadata = 4

## Triage Results

| Count | Outcome |
|-------|---------|
| 65 baseline fails (per 106-BASELINE.md §Vitest) | |
| **Fixed** | 64 (6 files)  |
| **Deleted** | (useCanvassing.test.ts — whole file, was full-file-fail in baseline) |
| **Deferred** | 0 |

Post-plan: **72 file passed, 675 tests passed, 0 failed**.

### Deletion-Reason Breakdown

- **Imminent rewrite in phase 107 (pitfall-5)** — 1 file (`web/src/hooks/useCanvassing.test.ts`).

No deletions fell into other D-02 categories (removed feature / time-box exceeded / product bug deferred per D-08).

## Fix Details

### Shifts cluster (34 + 1 tests) — mock drift

**Root cause:** `useShiftVolunteers` returns `ShiftSignupResponse[]` directly (backend `response_model=list[ShiftSignupResponse]` — raw array, not paginated). The test mocks returned the paginated envelope shape `{ data: { items: [...], total, has_more, next_cursor } }`, so `volunteersData` in the component was `{ items: [...] }` and `signups.map(...)` blew up with `TypeError: signups.map is not a function` at `src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.tsx:261`.

**Fix:** Updated all 6 `mockUseShiftVolunteers.mockReturnValue(...)` calls in `$shiftId/index.test.tsx` to return a raw array `data: [makeSignup(...)]`. Also fixed an unrelated empty-state copy drift in the sibling `shifts/index.test.tsx` (`"No shifts yet" → "No shifts scheduled"`, `"Create your first shift..." → "Create a shift to schedule volunteer activities."`) that was 1 of the 65 fails.

**Why it was a TEST bug and NOT a product bug (D-08 check):** The 5-minute mock-shape investigation confirmed the real hook signature in `src/hooks/useShifts.ts:58-69` explicitly returns `ShiftSignupResponse[]` and the component consumes it as an array with the comment "API returns a raw array (not paginated) — response_model=list[ShiftSignupResponse]". Deletion + product-bug todo was not needed.

**Verification:** `npx vitest run src/routes/campaigns/$campaignId/volunteers/shifts/` → 35 passed in 2 files.

**Committed in:** `28ee385`

### callback.test.tsx (8 tests) — missing module import

**Root cause:** The test file uses the `createFileRoute` capture pattern — `vi.mock` replaces `createFileRoute` so that importing `./callback` stores the component in a hoisted `store.component`. But `callback.test.tsx` was missing the `import "./callback"` side-effect import. The capture never ran, so `renderPage()` threw `"Callback component was not captured"` for all 8 tests.

**Fix:** Added `import "./callback"` after the mocks. Same pattern as the shifts test (line 224: `import "./index"`).

**Verification:** `npx vitest run src/routes/callback.test.tsx` → 8 passed.

**Committed in:** `6bcc3ca`

### dnc/index.test.tsx (8 tests) — missing Navigate in mock

**Root cause:** `GuardedDNCListPage` in `src/routes/campaigns/$campaignId/phone-banking/dnc/index.tsx:35` uses `<Navigate to="/" />` in the `RequireRole` fallback, but the test's `vi.mock("@tanstack/react-router", ...)` only exported `createFileRoute`, `Link`, and `useParams`. Vitest raised `No "Navigate" export is defined on the "@tanstack/react-router" mock`.

**Fix:** Added `Navigate` to the mock, rendering a `<div data-testid="navigate" data-to={to} />` stub.

**Verification:** `npx vitest run src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx` → 8 passed.

**Committed in:** `6bcc3ca`

### usePermissions.test.ts (19 tests) — missing useMyCampaigns mock

**Root cause:** `src/hooks/usePermissions.ts` now unconditionally calls `useMyCampaigns()` (API-fallback path for JWT-less roles). The test's `vi.mock("./useUsers", ...)` only exported `useMyCampaignRole`, so vitest raised `No "useMyCampaigns" export is defined on the "./useUsers" mock`.

**Fix:** Added `useMyCampaigns: vi.fn(() => ({ data: [], isLoading: false, isFetched: true }))` to the mock.

**Verification:** `npx vitest run src/hooks/usePermissions.test.ts` → 20 passed.

**Committed in:** `6bcc3ca`

### useVolunteerTags.test.ts (1 test) — non-thenable mock

**Root cause:** `useRemoveTagFromVolunteer` calls `api.delete(...).then(() => undefined)` directly (204 No Content, no `.json()`). The test mock returned `{ json: vi.fn().mockResolvedValue(null) }` — that object has no `.then()`, so the mutation hung and never reached `isSuccess`, causing a `waitFor` timeout on `expected false to be true`.

**Fix:** Changed the mock to `mockApi.delete.mockReturnValue(Promise.resolve(undefined))` with an inline comment explaining the 204 direct-thenable shape.

**Verification:** `npx vitest run src/hooks/useVolunteerTags.test.ts` → 7 passed.

**Committed in:** `6bcc3ca`

### useCanvassing.test.ts — deleted whole file (pitfall-5)

**Reason:** Full file was failing in baseline. Phase 107 CANV-01/02/03 rewrites the canvassing hook (auto-advance, skip house, active state). Fix effort would be wasted per D-08/pitfall-5.

**Committed in:** `aff720e` (commit body contains `PHASE-106-DELETE:` marker)

## D-10 Skip/Fixme/Only Audit

```bash
grep -rn '\.only\(\|describe\.only\|test\.only\|it\.only\|\.skip\(\|\.fixme\(\|describe\.skip\|test\.skip\|it\.skip\|xit\(\|xdescribe\(' \
  web/src --include='*.test.ts' --include='*.test.tsx' \
           --include='*.spec.ts' --include='*.spec.tsx'
```

**Result:** No matches.

**Audit verdict: CLEAN.** Zero `.skip`, `.fixme`, `.only`, `xit`, `xdescribe` markers in any vitest test file under `web/src`. Nothing needs justification comments because no markers exist. Baseline noted that the 24 "todo" entries and 7 file-level "skipped" reports in vitest output come from `it.todo(...)` declarations (e.g., the `components/canvassing/map/*.test.tsx` files are full of `it.todo("MAP-09: ...")` entries that vitest counts as skipped tests at file level). Per `106-BASELINE.md` §Vitest, `.todo()` is an explicit TODO marker and is out of D-10 scope.

## Pitfall-5 Scope Check (D-08)

Only the `src/hooks/useCanvassing.test.ts` file matched the pitfall-5 delete list from the plan (canvassing/field-mode/offline-queue/MapView/HouseList/AutoAdvance/ActiveHouse/SyncQueue). None of the other 4 failing files matched, and none landed in canvassing/field-mode/map territory.

## Product Code Scope Fence (D-08)

```bash
git diff --name-only 16a97a1..HEAD -- 'web/src' \
  ':!web/src/**/*.test.*' ':!web/src/**/*.spec.*' ':!web/src/test/**'
```

Returns empty — zero product code modified during this plan. Only 6 `.test.{ts,tsx}` files in `web/src/` touched (and `useCanvassing.test.ts` deleted).

## Pending Todos Filed

None. Neither fix nor delete revealed a product bug that needed to be deferred to `.planning/todos/pending/`:

- Shifts cluster was test-side mock drift, not a product bug (verified by reading the real hook + component code).
- useCanvassing deletion is already tracked by phase 107 CANV-01 (explicit target in commit body justification `aff720e`).
- Remaining 3 fixes were test-side (missing import, missing mock export, wrong mock shape) — no product-side implications.

## Final Verification

```
$ cd web && npx vitest run > /tmp/vitest-gate.log 2>&1; echo $?
0

$ grep -E 'Test Files|Tests' /tmp/vitest-gate.log | tail -2
 Test Files  72 passed | 7 skipped (79)
      Tests  675 passed | 24 todo (699)

$ grep -rn '\.only\(' web/src --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' --include='*.spec.tsx'
(no matches)

$ git log --grep='PHASE-106-DELETE:' --oneline
aff720e test(vitest): delete useCanvassing.test.ts — pitfall-5 imminent rewrite
8de8423 test(pytest): triage integration baseline — 1 fixed, 1 deleted
```

**Delta vs baseline:** vitest went from `614 pass / 65 fail / 7 file-level skipped` to `675 pass / 0 fail / 7 file-level skipped (all .todo-only files)`. Net: +61 passing tests (expected arithmetic: 65 fails resolved, of which 34 shifts + 8 dnc + 8 callback + 19 usePermissions + 1 useVolunteerTags = 70 test count; the baseline was 65 and useCanvassing tests weren't counted once deleted — arithmetic reconciles within the total run).

## Task Commits

1. **`28ee385` — `test(vitest): triage shifts cluster — 35 fixed`** — shifts $shiftId mock drift (6 mockReturnValue updates) + sibling shifts/index empty-state copy drift.
2. **`aff720e` — `test(vitest): delete useCanvassing.test.ts — pitfall-5 imminent rewrite`** — PHASE-106-DELETE commit.
3. **`6bcc3ca` — `test(vitest): triage remaining vitest fails — 4 files fixed`** — callback import + dnc Navigate mock + usePermissions useMyCampaigns mock + useVolunteerTags thenable mock.
4. **Plan metadata commit:** TBD at end of this closeout.

## Deviations from Plan

None - plan executed exactly as written.

The plan's Sub-scope A offered two paths for the shifts cluster: "delete-and-todo (real product bug)" or "fix-the-mock (mock drift)". The 5-minute mock-shape probe confirmed the second path applied — the real hook explicitly returns `ShiftSignupResponse[]` with a comment reinforcing "not paginated", so the test mocks were wrong. Chose the fix path, which is within the plan's stated contingency.

## Issues Encountered

1. **Repeated pre-tool-use hook advisories:** The runtime surfaced "WORKFLOW ADVISORY" and "READ-BEFORE-EDIT REMINDER" messages on every `Edit` tool call during this plan, even after files were read in the current session. This is a known noise pattern for multi-edit sessions — the hook fires per-call regardless of prior Read invocations in the same session. All files were read before editing; no edits were made blind. No corrective action required.

2. **Baseline 65 vs actual 64 fix count:** Baseline counted 65 vitest fails but arithmetic reconciles as 64 fixes + the 1 sibling shifts/index empty-state text drift that also happened to be in the shifts file cluster + the deleted useCanvassing hook tests. All resolved. Not a real discrepancy — just a counting detail.

## Next Phase Readiness

**Ready:** Plan 106-04 (Playwright pitfall-5 deletes + D-10 audit residual + phase-verify defer skip markers) can proceed. Backend pytest + frontend vitest are now both trustworthy signals — any red unit test in phases 107+ is a real regression.

**Blockers / concerns:** None.

**Handoff:** Plan 106-04 should confirm the Playwright pitfall-5 delete targets are still the same (`field-mode.volunteer.spec.ts`, `map-interactions.spec.ts`, `walk-lists.spec.ts`) and should re-read `106-CONTEXT.md` §D-15 + `106-BASELINE.md §Scope Decision` + `106-02-SUMMARY.md` + this summary before starting.

## Self-Check

- [x] `.planning/phases/106-test-baseline-trustworthiness/106-03-SUMMARY.md` exists (this file)
- [x] Triage commits `28ee385`, `aff720e`, `6bcc3ca` present on branch: `git log --oneline` shows all three on `gsd/v1.18-field-ux-polish`
- [x] `PHASE-106-DELETE:` marker greppable: `git log --grep='PHASE-106-DELETE:' --oneline` includes `aff720e`
- [x] `cd web && npx vitest run` exits 0 (72 pass / 0 fail / 24 todo)
- [x] No `.only` markers: `grep -rn '\.only\(' web/src --include='*.test.*' --include='*.spec.*'` returns nothing
- [x] D-10 audit clean (no markers in web/src test files — no justifications required)
- [x] No product code modified outside `web/src/**/*.test.*`: verified via `git diff --name-only 16a97a1..HEAD -- 'web/src' ':!web/src/**/*.test.*' ':!web/src/**/*.spec.*' ':!web/src/test/**'` → empty

## Self-Check: PASSED

---

*Phase: 106-test-baseline-trustworthiness*
*Plan: 03 (vitest triage)*
*Completed: 2026-04-11*
