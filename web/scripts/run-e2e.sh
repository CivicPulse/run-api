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
#
# Troubleshooting:
#   Mass 401 "Invalid or expired token" failures after docker compose restart:
#     ZITADEL rotates signing keys on each container recreation, invalidating
#     cached OIDC tokens in playwright/.auth/*.json. The auth freshness check
#     uses file mtime, not token validity, so stale tokens may slip through.
#     Fix: rm web/playwright/.auth/*.json && ./scripts/run-e2e.sh
#     This forces auth-setup to re-authenticate against the current ZITADEL instance.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$WEB_DIR/e2e-runs.jsonl"
LOG_DIR="$WEB_DIR/e2e-logs"

cd "$WEB_DIR"
mkdir -p "$LOG_DIR"

# ── Ensure E2E users exist in ZITADEL ──────────────────────────────────────
# After `docker compose up` recreates containers, the E2E human users
# (owner1@localhost, admin1@localhost, etc.) may not exist yet because
# zitadel-bootstrap only creates the machine user, project, and SPA app.
# This check queries ZITADEL for owner1 and runs create-e2e-users.py if missing.
ensure_e2e_users() {
  local pat
  pat=$(docker compose -f "$WEB_DIR/../docker-compose.yml" exec -T api \
    cat /home/app/zitadel-data/pat.txt 2>/dev/null | tr -d '[:space:]') || return 0
  [ -z "$pat" ] && return 0

  local resp
  resp=$(curl -s --max-time 5 \
    -H "Authorization: Bearer $pat" \
    -H "Content-Type: application/json" \
    -d '{"queries":[{"loginNameQuery":{"loginName":"owner1@localhost"}}]}' \
    "http://localhost:8080/v2/users" 2>/dev/null) || return 0

  if echo "$resp" | grep -qE '"totalResult"\s*:\s*"[1-9]'; then
    :
  else
    echo "▸ E2E users not found in ZITADEL — running create-e2e-users.py..."
    docker compose -f "$WEB_DIR/../docker-compose.yml" exec -T api \
      bash -c "PYTHONPATH=/home/app PAT_PATH=/home/app/zitadel-data/pat.txt python scripts/create-e2e-users.py" || {
      echo "⚠ Failed to create E2E users. Run manually:"
      echo "  docker compose exec api bash -c 'PYTHONPATH=/home/app PAT_PATH=/home/app/zitadel-data/pat.txt python scripts/create-e2e-users.py'"
    }
  fi

  echo "▸ Verifying no-MFA org policy (strict mode)..."
  docker compose -f "$WEB_DIR/../docker-compose.yml" exec -T api \
    bash -c "PYTHONPATH=/home/app PAT_PATH=/home/app/zitadel-data/pat.txt python scripts/create-e2e-users.py --verify-policy-only --strict-policy" || {
    echo "✖ Strict policy verification failed: org login policy drift detected."
    echo "  Fix by re-running:"
    echo "  docker compose exec api bash -c 'PYTHONPATH=/home/app PAT_PATH=/home/app/zitadel-data/pat.txt python scripts/create-e2e-users.py --verify-policy-only --strict-policy'"
    exit 1
  }
}
ensure_e2e_users

# ── Dev server auto-detection ───────────────────────────────────────────────
# If E2E_USE_DEV_SERVER is not explicitly set, check if the HTTPS Vite dev
# server is responding on :5173. Fall back to plain HTTP for older setups.
if [ -z "${E2E_USE_DEV_SERVER+x}" ]; then
  if curl -sk --max-time 2 https://localhost:5173/ &>/dev/null || \
     curl -s --max-time 2 http://localhost:5173/ &>/dev/null; then
    export E2E_USE_DEV_SERVER=1
    echo "▸ Auto-detected dev server on :5173 — skipping build+preview"
  else
    export E2E_USE_DEV_SERVER=0
  fi
elif [ "${E2E_USE_DEV_SERVER}" = "1" ]; then
  echo "▸ Dev server mode (forced)"
fi

# ── Help ───────────────────────────────────────────────────────────────────
show_help() {
  cat <<'HELP'
run-e2e.sh — Run Playwright E2E tests with logging

Usage:
  ./scripts/run-e2e.sh [options] [spec-file|playwright-args...]

Options:
  -h, --help            Show this help message and exit
  --workers N           Number of parallel workers (default: 4)
  --grep PATTERN        Playwright grep filter (passed through)
  --loop                Run tests in a continuous loop with sleep between runs
  --loop-sleep N        Seconds to sleep between loop iterations (default: 120)
  --strict-phase64-field07-order
                        Run FIELD-07 order-isolation permutation matrix
                        (4 runs: solo, sequential, after later tests, before later tests)

Environment variables:
  E2E_USE_DEV_SERVER=1  Force dev server mode (localhost:5173)
  E2E_USE_DEV_SERVER=0  Force build+preview mode (localhost:4173)
                        (Auto-detects by default)

Examples:
  ./scripts/run-e2e.sh                              # full suite
  ./scripts/run-e2e.sh voter-crud.spec.ts            # single spec
  ./scripts/run-e2e.sh --grep "RBAC"                 # grep filter
  ./scripts/run-e2e.sh --workers 8 voter-crud.spec.ts
  ./scripts/run-e2e.sh --loop                        # continuous: run, sleep 120s, repeat
  ./scripts/run-e2e.sh --loop --loop-sleep 60        # continuous with 60s interval
  ./scripts/run-e2e.sh --strict-phase64-field07-order # FIELD-07 order matrix

Output:
  Streams live to terminal and saves to e2e-logs/<timestamp>.log
  Appends structured JSON to e2e-runs.jsonl after each run
HELP
  exit 0
}

# ── Parse flags from arguments ────────────────────────────────────────────
# Default worker count. The phase 106 D-12 exit gate (plan 106-05) discovered
# that 16 workers caused state-contention flakes in rbac.* specs (3/3 PASS in
# isolation, fail under load). Reduced default to 8 as a minimal infra fix
# (D-09). The E2E_WORKERS env var overrides without touching the script,
# and --workers N on the command line still wins over both.
DEFAULT_WORKERS="${E2E_WORKERS:-8}"
WORKERS_FLAG="--workers $DEFAULT_WORKERS"
LOOP_MODE=0
LOOP_SLEEP=120
STRICT_FIELD07_ORDER=0
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      show_help
      ;;
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
    --strict-phase64-field07-order)
      STRICT_FIELD07_ORDER=1
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

# ── Strict FIELD-07 order-isolation permutation matrix ─────────────────────
# Phase 64: Proves FIELD-07 passes regardless of execution order relative
# to other field-flow tests. Uses --workers 1 and --project=volunteer for
# deterministic serial ordering. Fails if any run exits non-zero or if
# FIELD-07 is skipped in any run.
run_strict_phase64_field07_order() {
  local SPEC="field-mode.volunteer.spec.ts"
  local BASE_CMD="npx playwright test --reporter=list --workers 1 --project=volunteer"
  local MATRIX_PASS=0
  local MATRIX_FAIL=0
  local RUN_RESULTS=()

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Phase 64: FIELD-07 Order-Isolation Permutation Matrix"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  # Define the 4 permutation runs per D-07/D-08:
  # 1) FIELD-07 only (baseline isolation)
  # 2) FIELD-03..07 sequence (natural forward order)
  # 3) FIELD-08..10 then FIELD-07 (later tests before FIELD-07)
  # 4) FIELD-07 then FIELD-08..10 (FIELD-07 before later tests)
  local -a RUN_NAMES=(
    "FIELD-07 solo"
    "FIELD-03..07 forward sequence"
    "FIELD-08..10 then FIELD-07"
    "FIELD-07 then FIELD-08..10"
  )
  local -a RUN_GREPS=(
    "FIELD-07"
    "FIELD-03|FIELD-04|FIELD-05|FIELD-06|FIELD-07"
    "FIELD-08|FIELD-09|FIELD-10|FIELD-07"
    "FIELD-07|FIELD-08|FIELD-09|FIELD-10"
  )

  for i in "${!RUN_NAMES[@]}"; do
    local name="${RUN_NAMES[$i]}"
    local grep_pat="${RUN_GREPS[$i]}"
    local run_cmd="$BASE_CMD $SPEC --grep \"$grep_pat\""
    local run_log="$LOG_DIR/phase64-field07-order-$(date +%Y%m%d-%H%M%S)-run$((i+1)).log"

    echo "──────────────────────────────────────────────────────────"
    echo "  Run $((i+1))/4: $name"
    echo "  Command: $run_cmd"
    echo "──────────────────────────────────────────────────────────"

    set +e
    eval "$run_cmd" 2>&1 | tee "$run_log"
    local rc=${PIPESTATUS[0]}
    set -e

    # Check for FIELD-07 skip in this run
    local field07_skipped=0
    if grep -qP 'FIELD-07.*skipped' "$run_log" 2>/dev/null; then
      field07_skipped=1
    fi
    # Also check if FIELD-07 never appeared (0 matches for FIELD-07 passed)
    local field07_passed=0
    if grep -qP 'FIELD-07' "$run_log" 2>/dev/null; then
      if grep -qP '✓|passed' "$run_log" 2>/dev/null && ! grep -qP 'FIELD-07.*skipped' "$run_log" 2>/dev/null; then
        field07_passed=1
      fi
    fi

    local status="PASS"
    if [ "$rc" -ne 0 ]; then
      status="FAIL (exit code $rc)"
      MATRIX_FAIL=$((MATRIX_FAIL + 1))
    elif [ "$field07_skipped" -eq 1 ]; then
      status="FAIL (FIELD-07 skipped)"
      MATRIX_FAIL=$((MATRIX_FAIL + 1))
    else
      MATRIX_PASS=$((MATRIX_PASS + 1))
    fi

    RUN_RESULTS+=("  Run $((i+1)): $name — $status")
    echo "  Result: $status"
    echo ""
  done

  # Print matrix summary
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Phase 64: FIELD-07 Order-Isolation Matrix Results"
  echo "═══════════════════════════════════════════════════════════════"
  for result in "${RUN_RESULTS[@]}"; do
    echo "$result"
  done
  echo ""
  echo "  Passed: $MATRIX_PASS / 4"
  echo "  Failed: $MATRIX_FAIL / 4"
  echo "═══════════════════════════════════════════════════════════════"

  if [ "$MATRIX_FAIL" -gt 0 ]; then
    echo ""
    echo "✖ FIELD-07 order-isolation verification FAILED"
    echo "  One or more permutation runs failed or FIELD-07 was skipped."
    exit 1
  fi

  echo ""
  echo "✓ FIELD-07 order-isolation verification PASSED"
  echo "  All 4 permutation runs passed with FIELD-07 exercised."
  exit 0
}

# ── Phase 111 spike env guard ──────────────────────────────────────────────
# The Phase 111 urlTemplate spike (invite-urltemplate-spike.spec.ts) requires
# a ZITADEL runtime service-account to create a throwaway invitee server-side.
# Fail loudly here rather than letting the spec fail with confusing "fetch: undefined"
# errors. Guard ONLY when the spike is in the argument set (or no args = full suite).
RUN_SPIKE=0
if [ ${#ARGS[@]} -eq 0 ]; then
  RUN_SPIKE=1
else
  for a in "${ARGS[@]}"; do
    case "$a" in
      *invite-urltemplate-spike*) RUN_SPIKE=1 ;;
    esac
  done
fi
if [ "$RUN_SPIKE" -eq 1 ]; then
  missing=()
  [ -z "${ZITADEL_URL:-}" ] && missing+=("ZITADEL_URL")
  [ -z "${ZITADEL_SERVICE_CLIENT_ID:-}" ] && missing+=("ZITADEL_SERVICE_CLIENT_ID")
  [ -z "${ZITADEL_SERVICE_CLIENT_SECRET:-}" ] && missing+=("ZITADEL_SERVICE_CLIENT_SECRET")
  if [ ${#missing[@]} -gt 0 ]; then
    echo "✖ Phase 111 spike requires these envs (missing: ${missing[*]})"
    echo "  Set them in .env (see .env.example) and re-run. Export them in the parent shell"
    echo "  or 'set -a; source .env; set +a' before invoking run-e2e.sh."
    exit 2
  fi
fi

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
# Strict FIELD-07 order matrix takes precedence over normal execution
if [ "$STRICT_FIELD07_ORDER" -eq 1 ]; then
  run_strict_phase64_field07_order
fi

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
