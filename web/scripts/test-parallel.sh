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

set -euo pipefail
cd "$(dirname "$0")/.."

ALL_PROJECTS=(chromium admin manager volunteer viewer)
PROJECTS=("${@:-${ALL_PROJECTS[@]}}")
RESULTS_DIR="test-results/parallel"
PASS=0
FAIL=0
SKIP=0
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
echo -e "${CYAN}▸ Starting preview server...${NC}"
npx vite preview --port 4173 &>/dev/null &
PREVIEW_PID=$!

cleanup() {
  kill "$PREVIEW_PID" 2>/dev/null || true
  wait "$PREVIEW_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for preview server to be ready
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

# ── Run projects in parallel ────────────────────────────────────────────────
mkdir -p "$RESULTS_DIR"

echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD} Running ${#PROJECTS[@]} project(s) in parallel${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

PIDS=()
for project in "${PROJECTS[@]}"; do
  echo -e "${CYAN}▸ Spawning: ${project}${NC}"

  # Each project runs as its own playwright process.
  # The preview server is already running — reuseExistingServer in config detects it.
  # Include the setup-* project so auth runs, then the test project.
  npx playwright test \
    --project="setup-${project}" --project="${project}" \
    --reporter=line \
    > "$RESULTS_DIR/${project}.txt" 2>&1 &

  PIDS+=("$!:${project}")
done

# ── Collect results ──────────────────────────────────────────────────────────
echo -e "\n${CYAN}▸ Waiting for all projects...${NC}\n"

for entry in "${PIDS[@]}"; do
  pid="${entry%%:*}"
  project="${entry##*:}"

  if wait "$pid"; then
    STATUS="${GREEN}✓ PASS${NC}"
  else
    STATUS="${RED}✗ FAIL${NC}"
    FAILED_PROJECTS+=("$project")
  fi

  # Parse summary line from output
  SUMMARY=$(grep -E "passed|failed|skipped" "$RESULTS_DIR/${project}.txt" | tail -1 || echo "no results")

  # Extract counts
  P=$(echo "$SUMMARY" | grep -oP '\d+(?= passed)' || echo 0)
  F=$(echo "$SUMMARY" | grep -oP '\d+(?= failed)' || echo 0)
  S=$(echo "$SUMMARY" | grep -oP '\d+(?= skipped)' || echo 0)
  PASS=$((PASS + P))
  FAIL=$((FAIL + F))
  SKIP=$((SKIP + S))
  TOTAL=$((TOTAL + P + F + S))

  printf "  %-12s %b  %s\n" "$project" "$STATUS" "$SUMMARY"
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD} Results${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}Passed:${NC}  $PASS"
echo -e "  ${RED}Failed:${NC}  $FAIL"
echo -e "  ${YELLOW}Skipped:${NC} $SKIP"
echo -e "  Total:   $TOTAL"

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
