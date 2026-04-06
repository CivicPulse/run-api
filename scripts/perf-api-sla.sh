#!/bin/bash
# API SLA measurement for phase 15
set -u
TOKEN_A="${TOKEN_A:-$(cat /home/kwhatcher/projects/civicpulse/run-api/.secrets/token-org-a-owner.txt)}"
CAMPAIGN_A="06d710c8-32ce-44ae-bbab-7fcc72aab248"
OUT="/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-15/api"
mkdir -p "$OUT"

N=50
measure() {
  local name="$1"; local url="$2"; local auth="$3"
  local method="${4:-GET}"; local body="${5:-}"
  local file="$OUT/${name}.txt"
  : > "$file"
  for i in $(seq 1 $N); do
    if [ "$method" = "POST" ]; then
      curl -s -o /dev/null -w "%{time_total}\n" \
        -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
        -X POST -d "$body" "$url" >> "$file"
    elif [ -n "$auth" ]; then
      curl -s -o /dev/null -w "%{time_total}\n" \
        -H "Authorization: Bearer $TOKEN_A" "$url" >> "$file"
    else
      curl -s -o /dev/null -w "%{time_total}\n" "$url" >> "$file"
    fi
  done
  # Drop first 5 warmups; compute p50/p95/max on remaining 45
  tail -n 45 "$file" | sort -n | awk -v name="$name" '
    { a[NR]=$1 }
    END {
      n=NR
      p50=a[int(n*0.5)+1]; p95=a[int(n*0.95)+1]; max=a[n]
      printf "%-25s p50=%.3fs p95=%.3fs max=%.3fs n=%d\n", name, p50, p95, max, n
    }
  '
}

echo "Starting API SLA measurements (50 seq requests, drop first 5)..."
measure "01-health-live" "https://run.civpulse.org/health/live" ""
measure "02-health-ready" "https://run.civpulse.org/health/ready" ""
measure "03-campaigns" "https://run.civpulse.org/api/v1/campaigns" "1"
measure "04-voters-25" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=25" "1"
measure "05-voters-100" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=100" "1"
measure "06-voters-search" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters?q=Test" "1"
measure "07-dashboard-overview" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/dashboard/overview" "1"
measure "08-walk-lists" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/walk-lists" "1"
measure "09-call-lists" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/call-lists" "1"
measure "10-create-voter" "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters" "1" "POST" \
  '{"first_name":"PerfTest","last_name":"Voter","address_line_1":"1 Main St","city":"Macon","state":"GA","zip_code":"31201"}'
echo "done"
