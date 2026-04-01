---
phase: quick
plan: 260330-kfq
subsystem: testing-infrastructure
tags: [e2e, playwright, developer-experience]
dependency_graph:
  requires: []
  provides: [continuous-e2e-loop]
  affects: [web/scripts/run-e2e.sh]
tech_stack:
  added: []
  patterns: [bash-trap-cleanup, function-extraction]
key_files:
  modified:
    - web/scripts/run-e2e.sh
decisions: []
metrics:
  duration: 45s
  completed: "2026-03-30T18:45:01Z"
---

# Quick Task 260330-kfq: Add --loop Flag to run-e2e.sh Summary

Continuous loop mode for run-e2e.sh with configurable sleep interval and clean SIGINT handling.

## What Was Done

### Task 1: Add --loop and --loop-sleep flags to run-e2e.sh
**Commit:** 5043743

Refactored `run-e2e.sh` to support continuous test execution:

- **Argument parsing**: Added `--loop` (sets LOOP_MODE=1) and `--loop-sleep N` (default 120s) to the existing flag parser alongside `--workers`.
- **Function extraction**: Extracted the test execution, log parsing, JSONL writing, and summary printing into a `run_once()` function. Each invocation gets its own START_TS, RUN_LOG, and JSONL entry.
- **Single-run path**: When `--loop` is not passed, `run_once` executes exactly once and the script exits with the test EXIT_CODE -- identical to previous behavior.
- **Loop path**: When `--loop` is active, a `while true` loop calls `run_once` with a `#N` run counter in the banner, then sleeps for LOOP_SLEEP seconds. Test failures do NOT exit the loop.
- **Clean shutdown**: A `trap` on SIGINT/SIGTERM prints total runs completed and exits 0.
- **Usage docs**: Updated the header comment block with `--loop` and `--loop-sleep` examples.

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Verification

- `bash -n scripts/run-e2e.sh` passes (no syntax errors)
- `grep -c loop` confirms loop logic present (4 references)
- Without `--loop`, code path is functionally identical to the original (single run, exit code passthrough)

## Self-Check: PASSED
