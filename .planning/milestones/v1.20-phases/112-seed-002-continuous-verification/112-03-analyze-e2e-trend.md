---
plan_id: 112-03
phase: 112-seed-002-continuous-verification
plan: 03
type: infra
wave: 1
depends_on: []
requirements: [TEST-03]
files_modified:
  - web/scripts/analyze-e2e-trend.sh
  - web/scripts/test/analyze-e2e-trend.bats
  - web/scripts/test/fixtures/e2e-runs.trend-stable.jsonl
  - web/scripts/test/fixtures/e2e-runs.trend-regression.jsonl
  - web/scripts/test/fixtures/e2e-runs.insufficient.jsonl
estimated_lines: 170
autonomous: true
must_haves:
  truths:
    - "Given a `web/e2e-runs.jsonl` where tail-20 pass-rate is >=5pp below tail-100, the script exits non-zero and prints both rates + the delta."
    - "Given a JSONL where tail-20 is within 5pp of tail-100, the script exits 0 with a summary line."
    - "Given fewer than 20 entries in the JSONL, the script exits 0 with a 'seasoning' notice (per D3 — tail-100 must accumulate before signal is authoritative)."
    - "The regression threshold is a single constant `REGRESSION_THRESHOLD_PP=5` at the top of the script."
  artifacts:
    - path: "web/scripts/analyze-e2e-trend.sh"
      provides: "tail-20 vs tail-100 pass-rate regression detector"
      min_lines: 60
    - path: "web/scripts/test/analyze-e2e-trend.bats"
      provides: "bats-core test suite exercising stable, regression, insufficient-data cases"
  key_links:
    - from: "web/scripts/analyze-e2e-trend.sh"
      to: "web/e2e-runs.jsonl"
      via: "reads tail entries via `tail -n 100`/`jq`"
      pattern: "e2e-runs.jsonl"
    - from: ".github/workflows/nightly.yml"
      to: "web/scripts/analyze-e2e-trend.sh"
      via: "invoked as post-run step (Plan 02)"
      pattern: "analyze-e2e-trend.sh"
---

<objective>
Author `web/scripts/analyze-e2e-trend.sh`, the layer-3 regression-signal detector that reads `web/e2e-runs.jsonl` (the existing JSONL log produced by `run-e2e.sh`), computes tail-20 and tail-100 pass-rates, and exits non-zero if tail-20 is ≥5pp below tail-100 (D3). Ships with bats-core unit tests that exercise stable, regression, and insufficient-data cases against fixture JSONL files.

Purpose: Converts the ambient JSONL health log into an actionable nightly signal per TEST-03 and ROADMAP success criterion 3.
Output: Bash script with a single tunable constant + bats-core test suite + three fixture JSONL files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/112-seed-002-continuous-verification/112-CONTEXT.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@web/scripts/run-e2e.sh

<interfaces>
<!-- JSONL entry schema produced by run-e2e.sh (verified from source). -->
<!-- Executor: do NOT change these field names; the script reads existing logs. -->

```
{
  "timestamp": "2026-04-23T02:00:00Z",
  "pass": 248,
  "fail": 0,
  "skip": 3,
  "did_not_run": 0,
  "total": 251,
  "duration_s": "1823.4",
  "command": "npx playwright test ...",
  "exit_code": 0,
  "log_file": "e2e-logs/....log",
  "mode": "preview",
  "workers": "8"
}
```

Pass-rate formula: `pass / (pass + fail)` — exclude skipped/did_not_run from denominator (flakes and intentional skips should not dilute the signal).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write bats fixtures + failing bats tests (RED)</name>
  <files>web/scripts/test/analyze-e2e-trend.bats, web/scripts/test/fixtures/e2e-runs.trend-stable.jsonl, web/scripts/test/fixtures/e2e-runs.trend-regression.jsonl, web/scripts/test/fixtures/e2e-runs.insufficient.jsonl</files>
  <behavior>
    - stable fixture: 100 entries all pass=250/fail=0 → tail-20 and tail-100 both 100% → exit 0.
    - regression fixture: 80 entries at pass=250/fail=0, then 20 entries at pass=230/fail=20 → tail-20 pass-rate 92%, tail-100 pass-rate ~98.4% → delta ~6.4pp ≥ 5pp → exit non-zero.
    - insufficient fixture: 10 entries → exit 0 with "seasoning" notice on stdout.
  </behavior>
  <action>
    Generate three fixture JSONL files matching the schema in `<interfaces>`. Use `uv run python -c "..."` or a small bash loop to produce deterministic lines. Write `web/scripts/test/analyze-e2e-trend.bats` (bats-core) with cases:
      - `@test "exit 0 when tail-20 within threshold" { run ../analyze-e2e-trend.sh --jsonl fixtures/e2e-runs.trend-stable.jsonl; [ "$status" -eq 0 ]; }`
      - `@test "exit non-zero on regression" { run ../analyze-e2e-trend.sh --jsonl fixtures/e2e-runs.trend-regression.jsonl; [ "$status" -ne 0 ]; [[ "$output" == *"tail-20"* ]]; [[ "$output" == *"5pp"* ]]; }`
      - `@test "exit 0 with seasoning notice when <20 entries" { run ../analyze-e2e-trend.sh --jsonl fixtures/e2e-runs.insufficient.jsonl; [ "$status" -eq 0 ]; [[ "$output" == *"seasoning"* ]]; }`
      - `@test "REGRESSION_THRESHOLD_PP=5 is the only magic number" { run grep -c 'REGRESSION_THRESHOLD_PP=5' ../analyze-e2e-trend.sh; [ "$output" -ge 1 ]; }`
    Run tests; they MUST fail (script doesn't exist yet). Commit as RED.
  </action>
  <verify>
    <automated>cd web/scripts/test && bats analyze-e2e-trend.bats; test $? -ne 0</automated>
  </verify>
  <done>
    Three fixture JSONL files exist with documented pass-rate profiles; bats suite fails because `analyze-e2e-trend.sh` is absent.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement analyze-e2e-trend.sh (GREEN)</name>
  <files>web/scripts/analyze-e2e-trend.sh</files>
  <behavior>
    - Accepts `--jsonl PATH` override for testing; defaults to `web/e2e-runs.jsonl` relative to script dir.
    - Uses `jq` (already required by run-e2e.sh) to parse and compute pass rates.
    - Excludes skipped + did_not_run from the denominator.
    - Constant `REGRESSION_THRESHOLD_PP=5` at top, referenced once in the comparison.
    - On regression: prints tail-20 rate, tail-100 rate, delta, and a one-line remediation hint; exits 1.
    - On insufficient data (<20 entries): prints "seasoning — need ≥20 runs to trend-analyze" and exits 0 per D3.
  </behavior>
  <action>
    Author `web/scripts/analyze-e2e-trend.sh`. Layout:
      - `set -euo pipefail`
      - Parse `--jsonl` optional arg; default `$SCRIPT_DIR/../e2e-runs.jsonl`.
      - `REGRESSION_THRESHOLD_PP=5` constant.
      - Compute:
          `tail100=$(tail -n 100 "$JSONL")`
          `tail20=$(tail -n 20 "$JSONL")`
          `count100=$(echo "$tail100" | wc -l)`
          `count20=$(echo "$tail20" | wc -l)`
      - If `count20 < 20`: print seasoning notice, exit 0.
      - For each tail, compute `pass_rate = (sum(pass) / sum(pass + fail)) * 100` via `jq -s 'map(.pass) | add' etc.` — use awk for the division to 2 decimal places.
      - If `tail20_rate < (tail100_rate - REGRESSION_THRESHOLD_PP)`: print report and exit 1. Otherwise print OK summary and exit 0.
      - Make executable: `chmod +x`.
    Re-run bats suite — all four tests must pass. Commit as GREEN.
  </action>
  <verify>
    <automated>cd web/scripts/test && bats analyze-e2e-trend.bats</automated>
  </verify>
  <done>
    Script exists, executable, all four bats tests green. Manual run on real `web/e2e-runs.jsonl` produces sensible output (seasoning or trend summary).
  </done>
</task>

</tasks>

<verification>
  - `chmod +x web/scripts/analyze-e2e-trend.sh`.
  - `cd web/scripts/test && bats analyze-e2e-trend.bats` → all pass.
  - Manual sanity run: `web/scripts/analyze-e2e-trend.sh` against live JSONL exits cleanly.
  - Plan 02 (nightly.yml) invokes this script post-E2E — verified when both plans land.
</verification>

<success_criteria>
  ROADMAP success criterion 3: nightly summary with pass/fail counts + delta appended to `web/e2e-runs.jsonl`. TEST-03 acceptance: drift signal produced, threshold configurable at top of script.
</success_criteria>

<output>
  After completion, create `.planning/phases/112-seed-002-continuous-verification/112-03-SUMMARY.md`.
</output>
