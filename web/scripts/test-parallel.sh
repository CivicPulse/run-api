#!/usr/bin/env bash
# Run Playwright E2E tests with each project as a separate parallel process.
#
# Usage:
#   ./scripts/test-parallel.sh              # all projects
#   ./scripts/test-parallel.sh chromium     # single project
#   ./scripts/test-parallel.sh chromium admin volunteer  # subset
#
# The preview server starts once; all projects reuse it.
# Exit code is non-zero if ANY project has failures.

set -uo pipefail  # no -e: we handle exit codes manually
cd "$(dirname "$0")/.."

ALL_PROJECTS=(chromium admin manager volunteer viewer)
if [ $# -gt 0 ]; then
  PROJECTS=("$@")
else
  PROJECTS=("${ALL_PROJECTS[@]}")
fi

RESULTS_DIR="test-results/parallel"
PASS=0
FAIL=0
SKIP=0
DID_NOT_RUN=0
TOTAL=0
FAILED_PROJECTS=()

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Build ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}▸ Building app...${NC}"
npm run build --silent 2>&1 | tail -1

# ── Start preview server ────────────────────────────────────────────────────
# Check if already running (e.g. from a previous run or docker-compose web service)
if curl -sk https://localhost:4173/ &>/dev/null; then
  echo -e "${GREEN}▸ Preview server already running${NC}"
  PREVIEW_PID=""
else
  echo -e "${CYAN}▸ Starting preview server...${NC}"
  npx vite preview --port 4173 &>/dev/null &
  PREVIEW_PID=$!

  for i in $(seq 1 30); do
    if curl -sk https://localhost:4173/ &>/dev/null; then
      echo -e "${GREEN}▸ Preview server ready${NC}"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo -e "${RED}✗ Preview server failed to start${NC}"
      exit 1
    fi
    sleep 1
  done
fi

cleanup() {
  if [ -n "${PREVIEW_PID:-}" ]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Run projects in parallel ────────────────────────────────────────────────
mkdir -p "$RESULTS_DIR"
START_TIME=$(date +%s)

echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD} Running ${#PROJECTS[@]} project(s) in parallel${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

PIDS=()
for project in "${PROJECTS[@]}"; do
  echo -e "${CYAN}▸ Spawning: ${project}${NC}"

  # Each project runs as its own playwright process.
  # The preview server is already running — reuseExistingServer in config detects it.
  # --output=per-project dir prevents the test-results/ cleanup race condition
  # where 5 concurrent processes compete to wipe the same directory.
  npx playwright test \
    --project="setup-${project}" --project="${project}" \
    --reporter=line \
    --output="test-results/${project}" \
    > "$RESULTS_DIR/${project}.txt" 2>&1 || true &

  PIDS+=("$!:${project}")
done

# ── Collect results ──────────────────────────────────────────────────────────
echo -e "\n${CYAN}▸ Waiting for all projects...${NC}\n"

for entry in "${PIDS[@]}"; do
  pid="${entry%%:*}"
  project="${entry##*:}"

  wait "$pid" 2>/dev/null
  EXIT_CODE=$?

  if [ "$EXIT_CODE" -eq 0 ]; then
    STATUS="${GREEN}✓ PASS${NC}"
  else
    STATUS="${RED}✗ FAIL${NC}"
    FAILED_PROJECTS+=("$project")
  fi

  # Parse summary line from output
  SUMMARY=$(grep -E "passed|failed|skipped|did not run" "$RESULTS_DIR/${project}.txt" 2>/dev/null | tail -1) || SUMMARY="no results"

  # Extract counts (default 0 if not found)
  P=$(echo "$SUMMARY" | grep -oP '\d+(?= passed)' 2>/dev/null) || P=0
  F=$(echo "$SUMMARY" | grep -oP '\d+(?= failed)' 2>/dev/null) || F=0
  S=$(echo "$SUMMARY" | grep -oP '\d+(?= skipped)' 2>/dev/null) || S=0
  D=$(echo "$SUMMARY" | grep -oP '\d+(?= did not run)' 2>/dev/null) || D=0
  PASS=$((PASS + P))
  FAIL=$((FAIL + F))
  SKIP=$((SKIP + S))
  DID_NOT_RUN=$((DID_NOT_RUN + D))
  TOTAL=$((TOTAL + P + F + S))

  printf "  %-12s %b  %s\n" "$project" "$STATUS" "$SUMMARY"
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD} Results  (${MINUTES}m ${SECONDS}s)${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}Passed:${NC}      $PASS"
echo -e "  ${RED}Failed:${NC}      $FAIL"
echo -e "  ${YELLOW}Skipped:${NC}     $SKIP"
if [ "$DID_NOT_RUN" -gt 0 ]; then
  echo -e "  Did not run: $DID_NOT_RUN"
fi
echo -e "  Total:       $TOTAL"
echo -e "  Wall clock:  ${MINUTES}m ${SECONDS}s"

if [ ${#FAILED_PROJECTS[@]} -gt 0 ]; then
  echo -e "\n  ${RED}Failed projects: ${FAILED_PROJECTS[*]}${NC}"
  echo -e "  Logs: $RESULTS_DIR/<project>.txt"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
else
  echo -e "\n  ${GREEN}All projects passed!${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
fi
