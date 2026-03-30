#!/usr/bin/env bash
# Run Playwright E2E tests and log results to JSONL
#
# Usage:
#   ./scripts/run-e2e.sh                    # full suite (auto-detects dev server)
#   ./scripts/run-e2e.sh voter-crud.spec.ts  # single spec
#   ./scripts/run-e2e.sh --grep "RBAC"       # grep filter
#   ./scripts/run-e2e.sh --workers 8 voter-crud.spec.ts  # override worker count
#   ./scripts/run-e2e.sh --loop                 # continuous: run, sleep 120s, repeat
#   ./scripts/run-e2e.sh --loop --loop-sleep 60 # continuous with 60s between runs
#
# Options (via env vars):
#   E2E_USE_DEV_SERVER=1  ./scripts/run-e2e.sh   # force dev server (:5173)
#   E2E_USE_DEV_SERVER=0  ./scripts/run-e2e.sh   # force build+preview (:4173)
#
# By default, auto-detects: uses the dev server if it's running on :5173,
# otherwise falls back to build+preview.
#
# Output: streams live to terminal AND saves full output to e2e-logs/<timestamp>.log
# Log file: web/e2e-runs.jsonl

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$WEB_DIR/e2e-runs.jsonl"
LOG_DIR="$WEB_DIR/e2e-logs"

cd "$WEB_DIR"
mkdir -p "$LOG_DIR"

# ── Dev server auto-detection ───────────────────────────────────────────────
# If E2E_USE_DEV_SERVER is not explicitly set, check if :5173 is responding
if [ -z "${E2E_USE_DEV_SERVER+x}" ]; then
  if curl -s --max-time 2 http://localhost:5173/ &>/dev/null; then
    export E2E_USE_DEV_SERVER=1
    echo "▸ Auto-detected dev server on :5173 — skipping build+preview"
  else
    export E2E_USE_DEV_SERVER=0
  fi
elif [ "${E2E_USE_DEV_SERVER}" = "1" ]; then
  echo "▸ Dev server mode (forced)"
fi

# ── Parse flags from arguments ────────────────────────────────────────────
DEFAULT_WORKERS=12
WORKERS_FLAG="--workers $DEFAULT_WORKERS"
LOOP_MODE=0
LOOP_SLEEP=120
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workers)
      WORKERS_FLAG="--workers $2"
      shift 2
      ;;
    --loop)
      LOOP_MODE=1
      shift
      ;;
    --loop-sleep)
      LOOP_SLEEP="$2"
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

# ── Build the command ───────────────────────────────────────────────────────
CMD="npx playwright test --reporter=list $WORKERS_FLAG"
if [ ${#ARGS[@]} -gt 0 ]; then
  CMD="npx playwright test --reporter=list $WORKERS_FLAG ${ARGS[*]}"
fi

MODE="preview"
[ "${E2E_USE_DEV_SERVER}" = "1" ] && MODE="dev-server"

# ── Run a single test iteration ────────────────────────────────────────────
run_once() {
  local run_label="$1"

  # Capture start time per iteration
  local START_TS
  START_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local START_EPOCH
  START_EPOCH=$(date +%s%3N)
  local RUN_LOG="$LOG_DIR/$(date +%Y%m%d-%H%M%S).log"

  echo "═══════════════════════════════════════════════════"
  echo "  E2E Run ${run_label}Starting: $START_TS"
  echo "  Command: $CMD"
  echo "  Mode:    $MODE"
  echo "  Log file: $RUN_LOG"
  echo "═══════════════════════════════════════════════════"
  echo ""

  # Run tests — stream to terminal AND capture to log file
  set +e
  eval "$CMD" 2>&1 | tee "$RUN_LOG"
  EXIT_CODE=${PIPESTATUS[0]}
  set -e

  local END_EPOCH
  END_EPOCH=$(date +%s%3N)
  local DURATION_MS=$((END_EPOCH - START_EPOCH))
  local DURATION_S
  DURATION_S=$(awk "BEGIN {printf \"%.1f\", $DURATION_MS / 1000}")

  # Parse the summary from the saved log file
  PASS=$(grep -oP '\d+(?= passed)' "$RUN_LOG" | tail -1 || echo "0")
  FAIL=$(grep -oP '\d+(?= failed)' "$RUN_LOG" | tail -1 || echo "0")
  SKIP=$(grep -oP '\d+(?= skipped)' "$RUN_LOG" | tail -1 || echo "0")
  DNR=$(grep -oP '\d+(?= did not run)' "$RUN_LOG" | tail -1 || echo "0")
  WORKERS=$(grep -oP '\d+(?= workers?)' "$RUN_LOG" | tail -1 || echo "unknown")

  # Default to 0 if empty
  PASS=${PASS:-0}
  FAIL=${FAIL:-0}
  SKIP=${SKIP:-0}
  DNR=${DNR:-0}
  WORKERS=${WORKERS:-unknown}
  TOTAL=$((PASS + FAIL + SKIP + DNR))

  # Write JSONL entry
  jq -n \
    --arg ts "$START_TS" \
    --argjson pass "$PASS" \
    --argjson fail "$FAIL" \
    --argjson skip "$SKIP" \
    --argjson dnr "$DNR" \
    --argjson total "$TOTAL" \
    --arg duration_s "$DURATION_S" \
    --arg command "$CMD" \
    --argjson exit_code "$EXIT_CODE" \
    --arg log_file "e2e-logs/$(basename "$RUN_LOG")" \
    --arg mode "$MODE" \
    --arg workers "$WORKERS" \
    '{timestamp: $ts, pass: $pass, fail: $fail, skip: $skip, did_not_run: $dnr, total: $total, duration_s: $duration_s, command: $command, exit_code: $exit_code, log_file: $log_file, mode: $mode, workers: $workers}' \
    >> "$LOG_FILE"

  # Print summary
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  E2E Run Summary"
  echo "═══════════════════════════════════════════════════"
  echo "  Timestamp:   $START_TS"
  echo "  Duration:    ${DURATION_S}s"
  echo "  Mode:        $MODE"
  echo "  Workers:     $WORKERS"
  echo "  Passed:      $PASS"
  echo "  Failed:      $FAIL"
  echo "  Skipped:     $SKIP"
  echo "  Did not run: $DNR"
  echo "  Total:       $TOTAL"
  echo "  Exit code:   $EXIT_CODE"
  echo "═══════════════════════════════════════════════════"
  echo "  Full log: $RUN_LOG"
  echo "  JSONL:    e2e-runs.jsonl"
  echo "═══════════════════════════════════════════════════"
}

# ── Execute ────────────────────────────────────────────────────────────────
if [ "$LOOP_MODE" -eq 0 ]; then
  # Single run — identical to original behavior
  run_once ""
  exit $EXIT_CODE
fi

# ── Loop mode ──────────────────────────────────────────────────────────────
RUN_NUM=0

cleanup() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  Loop stopped. Completed $RUN_NUM run(s)."
  echo "═══════════════════════════════════════════════════"
  exit 0
}
trap cleanup SIGINT SIGTERM

while true; do
  RUN_NUM=$((RUN_NUM + 1))
  run_once "#${RUN_NUM} "

  echo ""
  echo "───────────────────────────────────────────────────"
  echo "  Sleeping ${LOOP_SLEEP}s before next run... (Ctrl+C to stop)"
  echo "───────────────────────────────────────────────────"
  sleep "$LOOP_SLEEP"
done
