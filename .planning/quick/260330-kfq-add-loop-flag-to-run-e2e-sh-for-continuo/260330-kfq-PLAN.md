---
phase: quick
plan: 260330-kfq
type: execute
wave: 1
depends_on: []
files_modified:
  - web/scripts/run-e2e.sh
autonomous: true
requirements: [QUICK-260330-kfq]
must_haves:
  truths:
    - "run-e2e.sh --loop runs the test suite, sleeps 120s, then runs again indefinitely"
    - "run-e2e.sh without --loop behaves exactly as before (single run, exits with test exit code)"
    - "Loop mode can be interrupted with Ctrl+C cleanly"
    - "Each iteration in loop mode logs to JSONL independently"
    - "Loop sleep duration can be overridden with --loop-sleep N"
  artifacts:
    - path: "web/scripts/run-e2e.sh"
      provides: "--loop and --loop-sleep flags for continuous test runs"
  key_links: []
---

<objective>
Add a --loop flag to run-e2e.sh that continuously re-runs the E2E test suite with a configurable sleep interval (default 120s) between runs.

Purpose: Enable hands-off continuous test monitoring -- start the script and walk away while it repeatedly validates the suite, logging each run independently.
Output: Updated run-e2e.sh with --loop and --loop-sleep support.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/scripts/run-e2e.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add --loop and --loop-sleep flags to run-e2e.sh</name>
  <files>web/scripts/run-e2e.sh</files>
  <action>
Modify the argument parsing block (lines 43-57) to also capture:
- `--loop` — sets LOOP_MODE=1 (default 0)
- `--loop-sleep N` — sets LOOP_SLEEP to N seconds (default 120)

Update the usage comment block at the top to document the new flags:
```
#   ./scripts/run-e2e.sh --loop                 # continuous: run, sleep 120s, repeat
#   ./scripts/run-e2e.sh --loop --loop-sleep 60 # continuous with 60s between runs
```

Wrap the test execution and logging section (lines 66-143) in a loop:
- If LOOP_MODE=0, run once and exit with EXIT_CODE (current behavior, unchanged).
- If LOOP_MODE=1, wrap in `while true; do ... done`:
  - Run the test suite exactly as today (tee to log, parse results, write JSONL, print summary).
  - After the summary, print a separator line showing "Sleeping ${LOOP_SLEEP}s before next run... (Ctrl+C to stop)"
  - Use `sleep $LOOP_SLEEP`
  - Each iteration gets its own START_TS, RUN_LOG, and JSONL entry (move those inside the loop).
  - Track iteration count (RUN_NUM) and print it in the banner: "E2E Run #N Starting: ..."
  - Do NOT exit on test failure in loop mode -- continue to next iteration regardless of EXIT_CODE.
  - On Ctrl+C (SIGINT/SIGTERM), print a clean exit message with total runs completed, then exit 0. Use a trap at the top of the loop section.

Important: Keep the non-loop code path identical to current behavior. The only difference when --loop is not passed should be the argument parsing additions (which set defaults and are inert).
  </action>
  <verify>
    <automated>cd /home/kwhatcher/projects/civicpulse/run-api/web && bash -n scripts/run-e2e.sh && echo "Syntax OK"</automated>
  </verify>
  <done>
    - `bash -n run-e2e.sh` passes (no syntax errors)
    - --loop flag is parsed and sets LOOP_MODE=1
    - --loop-sleep flag is parsed and overrides default 120s
    - Without --loop, script behavior is identical to before
    - Usage comments updated
  </done>
</task>

</tasks>

<verification>
1. `bash -n web/scripts/run-e2e.sh` — no syntax errors
2. `grep -c 'loop' web/scripts/run-e2e.sh` — confirms loop logic present
3. Manual: `./scripts/run-e2e.sh --help` style check of usage block
</verification>

<success_criteria>
- run-e2e.sh accepts --loop and --loop-sleep flags
- Without --loop, behavior is byte-for-byte identical to current (single run, exit code passthrough)
- With --loop, runs indefinitely with sleep between iterations, each iteration independently logged
- Clean Ctrl+C handling in loop mode
</success_criteria>

<output>
After completion, create `.planning/quick/260330-kfq-add-loop-flag-to-run-e2e-sh-for-continuo/260330-kfq-SUMMARY.md`
</output>
