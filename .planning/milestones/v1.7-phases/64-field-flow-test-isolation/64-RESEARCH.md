# Phase 64 Research: Field Flow Test Isolation

**Date:** 2026-03-31  
**Phase:** 64 — Field Flow Test Isolation  
**Requirement IDs:** E2E-20

## Research Objective

Determine the safest, lowest-change way to remove FIELD-07 order-dependent failures by enforcing deterministic test-owned setup and reset boundaries without regressing the broader field-mode suite.

## Inputs Reviewed

- `.planning/phases/64-field-flow-test-isolation/64-CONTEXT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-CONTEXT.md`
- `.planning/phases/63-phone-banking-api-data-resilience/63-CONTEXT.md`
- `web/e2e/field-mode.volunteer.spec.ts`
- `web/e2e/helpers.ts`
- `web/scripts/run-e2e.sh`
- `web/playwright.config.ts`

## Key Findings

1. **FIELD-07 currently permits survey-absent fallback and skip behavior.**
   - The current test allows paths that do not guarantee inline survey interaction, directly conflicting with locked decisions D-03 and D-04.

2. **Canvassing state reset is partial and inconsistent by test location.**
   - `localStorage.removeItem("canvassing-store")` exists in setup, but there is no dedicated FIELD-07 reset utility that consistently clears both canvassing and tour-local persistence for the specific test path (D-05, D-06).

3. **Existing helper patterns already support disposable fixture design.**
   - `createDisposablePhoneBankFixture` in `web/e2e/helpers.ts` is a proven template for API-built, spec-owned data fixtures; FIELD-07 can mirror this pattern for canvassing + survey entities (D-01, D-02, D-09).

4. **Order verification infrastructure exists but is not FIELD-07 specific.**
   - `run-e2e.sh` already has strict gate mode for phase 63 tests; Phase 64 can add a targeted FIELD-07 order matrix mode without introducing new infrastructure.

## Recommended Implementation Strategy

### A. Add disposable FIELD-07 fixture builder (high confidence)

Create helper(s) in `web/e2e/helpers.ts` to provision:

- a disposable survey script with deterministic question/options,
- a disposable walk list path with assignable entries,
- deterministic volunteer assignment for that path,
- return IDs/names needed by FIELD-07 assertions.

This directly enforces D-01, D-02, D-03, D-09.

### B. Refactor FIELD-07 to survey-present-only assertion path

In `web/e2e/field-mode.volunteer.spec.ts`, rewrite FIELD-07 to:

- consume only disposable fixture data,
- remove survey-absent fallback behavior,
- fail (not skip) if survey UI is missing on contact outcome,
- verify at least one inline survey response action and submission outcome.

This enforces D-03 and D-04.

### C. Add explicit client reset boundary for FIELD-07 entry

Before FIELD-07 execution, reset:

- `canvassing-store`,
- tour-local persistence keys used by field flow,
- any FIELD-07 scoped local markers introduced by the fixture helper.

This enforces D-05 and D-06.

### D. Add permutation verification mode in wrapper script

Extend `web/scripts/run-e2e.sh` with a `--strict-phase64-field07-order` mode that runs a small matrix of reordered targeted runs, including FIELD-07 before and after other field tests.

Minimum matrix recommendation:

1. FIELD-07 only,
2. FIELD-03..07 in canonical order,
3. FIELD-08..10 then FIELD-07,
4. FIELD-07 then FIELD-08..10.

This enforces D-07 and D-08 while preserving D-10 execution model.

## Risks and Mitigations

### Risk 1: Fixture setup uses role with insufficient permissions

**Mitigation:** follow existing owner-context creation pattern used in field mode setup for privileged operations.

### Risk 2: Flaky waits after strict survey-present enforcement

**Mitigation:** rely on deterministic API fixture creation + explicit UI ready checks before outcome click; avoid adding hard `waitForTimeout` in new logic.

### Risk 3: Overly large permutation set increases cycle time

**Mitigation:** keep strict mode targeted to FIELD-07 + nearby field tests only; preserve full-suite runs separately.

## Concrete File Targets

- `web/e2e/helpers.ts`
  - add disposable FIELD-07 fixture builder(s)
- `web/e2e/field-mode.volunteer.spec.ts`
  - refactor FIELD-07 to deterministic survey-present path
  - add dedicated reset helper usage for FIELD-07 entry
- `web/scripts/run-e2e.sh`
  - add strict FIELD-07 order-matrix mode

## Validation Architecture

### Required automated checks

1. Targeted FIELD-07 run:
   - `cd web && ./scripts/run-e2e.sh field-mode.volunteer.spec.ts --project=volunteer --grep "FIELD-07"`
2. Strict order matrix:
   - `cd web && ./scripts/run-e2e.sh --strict-phase64-field07-order`

### Pass bar

- FIELD-07 executes survey-present assertions with no skip path.
- Strict order mode reports zero failures and zero FIELD-07 skips across matrix runs.

## Recommendation

Proceed with planning using a 2-plan split:

1. **Plan 01:** fixture + FIELD-07 refactor + reset boundary,
2. **Plan 02:** strict order matrix command wiring + targeted verification/documentation updates.
