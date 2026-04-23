#!/usr/bin/env bash
# analyze-e2e-trend.sh — nightly E2E regression-signal detector (Phase 112, Plan 03).
#
# Reads the JSONL log emitted by web/scripts/run-e2e.sh, computes pass-rates
# over the last 100 runs (tail-100) and last 20 runs (tail-20), and exits
# non-zero when tail-20 drops REGRESSION_THRESHOLD_PP percentage points or
# more below tail-100 (locked decision D3 in 112-CONTEXT.md).
#
# Pass-rate formula: pass / (pass + fail). Skips and did_not_run are
# EXCLUDED from the denominator so intentional skips and flake-skips do
# not dilute the signal.
#
# Usage:
#   ./analyze-e2e-trend.sh                       # default: ../e2e-runs.jsonl
#   ./analyze-e2e-trend.sh --jsonl PATH          # override input (tests)
#
# Exit codes:
#   0 — trend OK, or fewer than 20 entries (seasoning period)
#   1 — regression detected (tail-20 >= REGRESSION_THRESHOLD_PP pp below tail-100)
#   2 — usage / missing dependency error

set -euo pipefail

# ── Tunable: only magic number in this script ──────────────────────────────
REGRESSION_THRESHOLD_PP=5

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JSONL_PATH="$SCRIPT_DIR/../e2e-runs.jsonl"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --jsonl)
      JSONL_PATH="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "✖ unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "✖ jq is required (already a run-e2e.sh dependency)" >&2
  exit 2
fi

if [ ! -f "$JSONL_PATH" ]; then
  echo "✖ JSONL not found: $JSONL_PATH" >&2
  exit 2
fi

# ── Count total entries ────────────────────────────────────────────────────
# Use jq -s so we handle both one-line-per-object JSONL (as produced by
# run-e2e.sh via `jq -n ... >> $LOG_FILE` which emits pretty-printed JSON)
# and true single-line JSONL (as used by the bats fixtures). jq's slurp
# mode consumes a stream of concatenated JSON values regardless of line
# framing, which is the reliable primitive here.
total_entries=$(jq -s 'length' "$JSONL_PATH")

if [ "$total_entries" -lt 20 ]; then
  echo "seasoning — need >=20 runs to trend-analyze (have $total_entries; per D3 tail-100 must accumulate before signal is authoritative)"
  exit 0
fi

# ── Aggregate pass/fail over a tail window ─────────────────────────────────
# Args: $1 = window size (100 or 20)
# Prints: "pass_total fail_total rate_pct" where rate is to 2 decimals
compute_window() {
  local n="$1"
  jq -s --argjson n "$n" '
    (if length > $n then .[-$n:] else . end) as $win
    | {
        pass: ($win | map(.pass) | add),
        fail: ($win | map(.fail) | add)
      }
    | .denom = (.pass + .fail)
    | "\(.pass) \(.fail) \(if .denom == 0 then 0 else (.pass * 10000 / .denom) / 100 end)"
  ' "$JSONL_PATH" | tr -d '"'
}

read -r pass100 fail100 rate100 <<<"$(compute_window 100)"
read -r pass20  fail20  rate20  <<<"$(compute_window 20)"

# Normalize rate formatting to 2 decimal places (jq arithmetic can produce
# long-tail floats; downstream output is human-facing).
rate100=$(awk -v r="$rate100" 'BEGIN { printf "%.2f", r }')
rate20=$(awk -v r="$rate20" 'BEGIN { printf "%.2f", r }')

# ── Compare using awk (float arithmetic) ───────────────────────────────────
delta=$(awk -v a="$rate100" -v b="$rate20" 'BEGIN { printf "%.2f", a - b }')
is_regression=$(awk -v d="$delta" -v t="$REGRESSION_THRESHOLD_PP" 'BEGIN { print (d >= t) ? 1 : 0 }')

if [ "$is_regression" -eq 1 ]; then
  cat <<EOF
✖ E2E trend regression detected
  tail-100 pass-rate: ${rate100}%  (pass=${pass100}, fail=${fail100})
  tail-20  pass-rate: ${rate20}%   (pass=${pass20},  fail=${fail20})
  delta:              ${delta}pp   (threshold: ${REGRESSION_THRESHOLD_PP}pp)
  hint: inspect the last 20 entries of $JSONL_PATH, triage new failing specs,
        and attribute to the introducing commit (ROADMAP success criterion #3).
EOF
  exit 1
fi

cat <<EOF
✓ E2E trend stable
  tail-100 pass-rate: ${rate100}%  (pass=${pass100}, fail=${fail100})
  tail-20  pass-rate: ${rate20}%   (pass=${pass20},  fail=${fail20})
  delta:              ${delta}pp   (threshold: ${REGRESSION_THRESHOLD_PP}pp)
EOF
exit 0
