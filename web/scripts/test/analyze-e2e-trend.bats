#!/usr/bin/env bats

# Tests for web/scripts/analyze-e2e-trend.sh (Phase 112, Plan 03).
# Fixtures live in ./fixtures/*.jsonl and model the JSONL schema produced
# by web/scripts/run-e2e.sh (pass/fail/skip/did_not_run + metadata).
#
# Pass-rate formula under test: pass / (pass + fail), skips excluded.
# Regression gate: tail-20 pass-rate < tail-100 pass-rate - REGRESSION_THRESHOLD_PP.

setup() {
  cd "$BATS_TEST_DIRNAME"
}

@test "exit 0 when tail-20 pass-rate within threshold of tail-100" {
  run ../analyze-e2e-trend.sh --jsonl fixtures/e2e-runs.trend-stable.jsonl
  [ "$status" -eq 0 ]
}

@test "exit non-zero when tail-20 regresses >=5pp below tail-100" {
  run ../analyze-e2e-trend.sh --jsonl fixtures/e2e-runs.trend-regression.jsonl
  [ "$status" -ne 0 ]
  [[ "$output" == *"tail-20"* ]]
  [[ "$output" == *"5pp"* ]]
}

@test "exit 0 with seasoning notice when fewer than 20 entries" {
  run ../analyze-e2e-trend.sh --jsonl fixtures/e2e-runs.insufficient.jsonl
  [ "$status" -eq 0 ]
  [[ "$output" == *"seasoning"* ]]
}

@test "REGRESSION_THRESHOLD_PP=5 is the only magic number" {
  run grep -c 'REGRESSION_THRESHOLD_PP=5' ../analyze-e2e-trend.sh
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
