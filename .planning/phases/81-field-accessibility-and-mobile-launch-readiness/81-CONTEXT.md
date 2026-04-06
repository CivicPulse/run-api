# Phase 81 Context

## Goal

Close the remaining user-facing P1 blockers on field/mobile surfaces and core accessibility paths.

## Why This Phase Exists

Phase 80 restored backend workflow reliability, but the production shakedown still carries launch-blocking frontend issues across accessibility, mobile ergonomics, field entry routing, and cold-load performance. Those remaining user-facing blockers need to be resolved before reverification in later phases is meaningful.

## Inputs

- `.planning/ROADMAP.md` v1.13 Phase 81 requirements and success criteria
- `docs/production-shakedown/phase-14-accessibility.md`
- `docs/production-shakedown/results/phase-14-results.md`
- `docs/production-shakedown/results/SUMMARY.md`
- Relevant field/mobile surfaces in `web/` and associated accessibility harnesses already present in the repo

## Requirements

- UI-01: Remove the known `button-name` and `link-name` accessibility failures on affected voters, volunteers, surveys, canvassing, and campaign wizard surfaces
- UI-02: Bring field-mode touch targets like Start Over, Resume, and Back to Hub up to the intended mobile target-size standard
- UI-03: Ensure volunteers with assignments land on the correct field entry route after login
- PERF-01: Bring field hub mobile cold-load back within the launch budget, or explicitly reset the budget with new evidence and product sign-off

## Constraints

- Preserve the Phase 78 tenant isolation fixes and Phase 79/80 workflow-safety contracts while touching frontend flows
- Prefer regression-backed fixes using the existing accessibility/perf harness scripts already checked into `web/`
- Treat unresolved performance budget changes as an explicit product decision, not an implicit relaxation

## Open Questions To Resolve In Planning

- Which of the recorded axe failures are still reproducible on the current branch versus already fixed by unrelated UI work
- Whether the field-entry routing issue is purely client-side redirect logic or depends on backend assignment shape
- Whether the mobile cold-load regression is bundle weight, network waterfall, or first-render work on the field hub
