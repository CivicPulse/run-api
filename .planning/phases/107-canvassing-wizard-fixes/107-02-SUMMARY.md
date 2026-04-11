---
phase: 107
plan: 02
subsystem: canvassing-types
tags: [canvassing, types, outcomes, tdd]
requires:
  - web/src/types/canvassing.ts (existing DoorKnockResultCode enum, AUTO_ADVANCE_OUTCOMES, SURVEY_TRIGGER_OUTCOMES)
provides:
  - HOUSE_LEVEL_OUTCOMES Set<DoorKnockResultCode> exported from web/src/types/canvassing.ts
affects:
  - Plan 107-04 (CANV-01 advance helper refactor) — consumer of HOUSE_LEVEL_OUTCOMES
tech-stack:
  added: []
  patterns:
    - "Co-locate outcome categorization sets in types/canvassing.ts"
    - "Vitest unit tests assert set algebra (subset, disjoint, partition)"
key-files:
  created:
    - .planning/phases/107-canvassing-wizard-fixes/107-02-SUMMARY.md
  modified:
    - web/src/types/canvassing.ts
    - web/src/types/canvassing.test.ts
decisions:
  - "D-18 hybrid mapping locked: house-level = not_home, come_back_later, inaccessible (the actual enum members nearest to D-18's vacant/wrong_address intent)"
  - "moved and deceased remain voter-level only (auto-advance after per-voter gate, not whole-house)"
  - "AUTO_ADVANCE_OUTCOMES and SURVEY_TRIGGER_OUTCOMES kept unchanged per RESEARCH §1"
metrics:
  duration: "~3 min"
  completed: 2026-04-11T03:21:20Z
  tasks: 1
  files_modified: 2
requirements: [CANV-01]
---

# Phase 107 Plan 02: HOUSE_LEVEL_OUTCOMES Set Summary

One-liner: Added `HOUSE_LEVEL_OUTCOMES = {not_home, come_back_later, inaccessible}` to `web/src/types/canvassing.ts` with 5 categorization tests, locking the D-18 hybrid contract that Plan 04 will consume.

## What Was Built

- New `HOUSE_LEVEL_OUTCOMES` `Set<DoorKnockResultCode>` exported from `web/src/types/canvassing.ts` immediately after `AUTO_ADVANCE_OUTCOMES`. The block carries a doc comment explaining D-18 intent and why `vacant`/`wrong_address` (named in D-18) were mapped to the closest real enum members (`come_back_later`, `inaccessible`).
- 5 new categorization tests appended to `web/src/types/canvassing.test.ts` under a new `describe("canvassing outcome sets")` block:
  1. `HOUSE_LEVEL_OUTCOMES` equals `{not_home, come_back_later, inaccessible}`.
  2. `HOUSE_LEVEL_OUTCOMES` is disjoint from `SURVEY_TRIGGER_OUTCOMES`.
  3. `HOUSE_LEVEL_OUTCOMES` is a strict subset of `AUTO_ADVANCE_OUTCOMES`.
  4. `moved` and `deceased` are auto-advance but NOT house-level.
  5. `SURVEY_TRIGGER_OUTCOMES` and `AUTO_ADVANCE_OUTCOMES` partition the full 9-code enum (union covers all, intersection is empty).
- TDD flow: failing test commit first (RED), then implementation commit (GREEN). 13/13 tests pass; `tsc --noEmit` clean.

## Decisions Made

- **D-18 hybrid mapping locked** — The house-level set uses the real enum members (`not_home`, `come_back_later`, `inaccessible`) rather than the conceptual names from CONTEXT (`vacant`, `wrong_address`) since the latter do not exist in `DoorKnockResultCode`. RESEARCH.md §1 confirmed the enum surface.
- **`AUTO_ADVANCE_OUTCOMES` left untouched** — RESEARCH.md §1 found it already complete; CANV-01 stall is a household-gate bug, not a missing outcome. Plan 04 will fix the helper.
- **Voter-level outcomes are implicit** — `moved`, `deceased`, `refused`, etc. are simply "in `AUTO_ADVANCE_OUTCOMES` minus `HOUSE_LEVEL_OUTCOMES`". No separate `VOTER_LEVEL_OUTCOMES` set; tests assert the difference instead.
- **`contacted` is not in the enum** — Reviewed `DoorKnockResultCode`; the survey-path code is the union of `SURVEY_TRIGGER_OUTCOMES` (`supporter`, `undecided`, `opposed`, `refused`). The plan's user-facing language about "`contacted` keeps the survey path" maps to `SURVEY_TRIGGER_OUTCOMES`. No special-case needed.

## Deviations from Plan

None. The plan's exact test cases were used (the prompt's reframing was semantically equivalent). Tests extend the existing `canvassing.test.ts` rather than creating a new file, consistent with house-coordinate tests already living there.

## Verification

- `cd web && npx vitest run src/types/canvassing.test.ts` → 13 passed (8 pre-existing + 5 new).
- `cd web && npx tsc --noEmit` → clean exit.
- `grep -n "export const HOUSE_LEVEL_OUTCOMES" web/src/types/canvassing.ts` → match present.

## Commits

- `6508031` — test(107-02): add failing tests for HOUSE_LEVEL_OUTCOMES set (RED)
- `8f5b83f` — feat(107-02): add HOUSE_LEVEL_OUTCOMES set per D-18 hybrid (GREEN)

## Self-Check: PASSED

- FOUND: web/src/types/canvassing.ts (HOUSE_LEVEL_OUTCOMES export verified)
- FOUND: web/src/types/canvassing.test.ts (5 new `it(...)` blocks)
- FOUND: 6508031 (RED commit)
- FOUND: 8f5b83f (GREEN commit)
