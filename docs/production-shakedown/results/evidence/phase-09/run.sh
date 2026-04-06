#!/bin/bash
# Phase 09: Volunteers & Shifts — executor
set -u
cd /home/kwhatcher/projects/civicpulse/run-api
export TOKEN_OWNER_A=$(cat .secrets/token-org-a-owner.txt)
export TOKEN_MGR_A=$(cat .secrets/token-org-a-manager.txt)
export TOKEN_VOL_A=$(cat .secrets/token-org-a-volunteer.txt)
export TOKEN_VIEWER_A=$(cat .secrets/token-org-a-viewer.txt)
export TOKEN_B=$(cat .secrets/token-org-b-owner.txt)
export CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248
export CAMPAIGN_B=1729cac1-e802-4bd2-8b8d-20fbc07bbfb4
export BASE="https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A"
EVID=/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-09
OUT=$EVID/results.tsv
> $OUT

rec() { echo -e "$1\t$2\t$3" | tee -a $OUT; }
hget() { curl -s -o /tmp/body.json -w "%{http_code}" "$@"; }

# ===== S1: Volunteer CRUD =====
code=$(hget -X POST "$BASE/volunteers" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Alice","last_name":"Canvasser","email":"alice.c@civpulse.test","phone":"478-555-0101","street":"101 Cherry St","city":"Macon","state":"GA","zip_code":"31201","skills":["canvassing","phone-bank"]}')
VOL_ALICE=$(jq -r '.id' /tmp/body.json)
rec "VOL-CRUD-01" "$code" "alice=$VOL_ALICE"

code=$(hget -X POST "$BASE/volunteers" -H "Authorization: Bearer $TOKEN_OWNER_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Bob","last_name":"Walker","email":"bob.c@civpulse.test","phone":"478-555-0102","city":"Macon","state":"GA","zip_code":"31201","skills":["canvassing"]}')
VOL_BOB=$(jq -r '.id' /tmp/body.json)
rec "VOL-CRUD-02" "$code" "bob=$VOL_BOB"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/volunteers" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" -d '{"first_name":"Blocked","last_name":"User"}')
rec "VOL-CRUD-03" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/volunteers" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"last_name":"NoFirst"}')
rec "VOL-CRUD-04" "$code" "expect 422"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/volunteers")
N=$(jq -r '.items | length' /tmp/body.json)
rec "VOL-CRUD-05" "$code" "items=$N"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers?status=active")
UNI=$(jq -c '[.items[] | .status] | unique' /tmp/body.json)
rec "VOL-CRUD-06" "$code" "unique=$UNI"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers?skills=canvassing")
FOUND=$(jq -r --arg id "$VOL_ALICE" '[.items[] | select(.id==$id)] | length' /tmp/body.json)
rec "VOL-CRUD-07" "$code" "alice_found=$FOUND"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers?name=Alice")
NAMES=$(jq -c '[.items[] | .first_name] | unique' /tmp/body.json)
rec "VOL-CRUD-08" "$code" "names=$NAMES"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_VIEWER_A" "$BASE/volunteers")
rec "VOL-CRUD-09" "$code" "expect 403"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers/$VOL_ALICE")
rec "VOL-CRUD-10" "$code" "tags=$(jq -r '.tags' /tmp/body.json) avail=$(jq -r '.availability' /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers/00000000-0000-0000-0000-000000000000")
rec "VOL-CRUD-11" "$code" "expect 404"

code=$(hget -X PATCH "$BASE/volunteers/$VOL_ALICE" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"phone":"478-555-0999","notes":"Prefers evenings"}')
rec "VOL-CRUD-12" "$code" "phone=$(jq -r .phone /tmp/body.json) notes=$(jq -r .notes /tmp/body.json | head -c 30)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/volunteers/$VOL_ALICE" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"notes":"hacked"}')
rec "VOL-CRUD-13" "$code" "expect 403"

code=$(hget -X PATCH "$BASE/volunteers/$VOL_BOB/status" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"inactive"}')
rec "VOL-CRUD-14" "$code" "status=$(jq -r .status /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/volunteers/$VOL_BOB/status" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"retired_maybe"}')
rec "VOL-CRUD-15" "$code" "expect 422"
curl -s -X PATCH "$BASE/volunteers/$VOL_BOB/status" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}' > /dev/null

# ===== S2: Self-register =====
code=$(hget -X POST "$BASE/volunteers/register" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Volunteer","last_name":"Self","email":"qa-volunteer@civpulse.org","phone":"478-555-0200"}')
VOL_SELF=$(jq -r '.id // empty' /tmp/body.json)
rec "VOL-REG-01" "$code" "self=$VOL_SELF user_id=$(jq -r '.user_id // empty' /tmp/body.json)"

# if already registered from prior run, 409
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/volunteers/register" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Volunteer","last_name":"Self","email":"qa-volunteer@civpulse.org","phone":"478-555-0200"}')
rec "VOL-REG-02" "$code" "$(jq -r '.detail // .title // empty' /tmp/body.json | head -c 80)"

# If VOL_SELF was empty on first attempt, populate from response of VOL-REG-02
if [ -z "$VOL_SELF" ]; then
  VOL_SELF=$(jq -r '.volunteer_id // empty' /tmp/body.json)
fi

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/volunteers/register" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" -d '{"first_name":"Viewer","last_name":"Denied"}')
rec "VOL-REG-03" "$code" "expect 403"

# ===== S3: Tags =====
code=$(hget -X POST "$BASE/volunteer-tags" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"captain"}')
TAG=$(jq -r '.id' /tmp/body.json)
rec "VOL-TAG-01" "$code" "tag=$TAG name=$(jq -r .name /tmp/body.json)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/volunteer-tags")
N=$(jq -r 'if type=="array" then length else (.items|length) end' /tmp/body.json)
rec "VOL-TAG-02" "$code" "tags=$N"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/volunteer-tags" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"name":"blocked"}')
rec "VOL-TAG-03" "$code" "expect 403"

code=$(hget -X PATCH "$BASE/volunteer-tags/$TAG" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"Team Captain"}')
rec "VOL-TAG-04" "$code" "name=$(jq -r .name /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/volunteers/$VOL_ALICE/tags/$TAG" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-TAG-05" "$code" "attach; expect 201/204"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers/$VOL_ALICE")
TAGS=$(jq -r '.tags | map(.name // .) | @csv' /tmp/body.json)
rec "VOL-TAG-06" "$code" "tags=$TAGS"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/volunteers/$VOL_ALICE/tags/$TAG" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-TAG-07" "$code" "expect 204"

curl -s -o /dev/null -X POST "$BASE/volunteers/$VOL_ALICE/tags/$TAG" -H "Authorization: Bearer $TOKEN_MGR_A"
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/volunteer-tags/$TAG" -H "Authorization: Bearer $TOKEN_MGR_A")
TAGS_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers/$VOL_ALICE" | jq -r '.tags')
rec "VOL-TAG-08" "$code" "delete=$code tags_after=$TAGS_AFTER"

# ===== S4: Availability =====
code=$(hget -X POST "$BASE/volunteers/$VOL_ALICE/availability" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"start_at":"2026-05-01T17:00:00Z","end_at":"2026-05-01T21:00:00Z"}')
AVAIL=$(jq -r '.id' /tmp/body.json)
rec "VOL-AVAIL-01" "$code" "id=$AVAIL"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/volunteers/$VOL_ALICE/availability" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"start_at":"2026-05-01T21:00:00Z","end_at":"2026-05-01T17:00:00Z"}')
rec "VOL-AVAIL-02" "$code" "end<start; $(jq -r '.detail // .id // empty' /tmp/body.json | head -c 60)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/volunteers/$VOL_ALICE/availability")
N=$(jq -r 'if type=="array" then length else 0 end' /tmp/body.json)
rec "VOL-AVAIL-03" "$code" "slots=$N"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/volunteers/$VOL_ALICE/availability/$AVAIL" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-AVAIL-04" "$code" "expect 204"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/volunteers/$VOL_ALICE/availability/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-AVAIL-05" "$code" "expect 404"

# ===== S5: Shifts =====
code=$(hget -X POST "$BASE/shifts" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"VOL Canvass Sat AM","description":"East side walk","type":"canvassing","start_at":"2026-05-02T14:00:00Z","end_at":"2026-05-02T18:00:00Z","max_volunteers":2,"location_name":"HQ","city":"Macon","state":"GA","zip_code":"31201"}')
SHIFT_A=$(jq -r '.id' /tmp/body.json)
rec "VOL-SHIFT-01" "$code" "shift_a=$SHIFT_A status=$(jq -r .status /tmp/body.json)"

code=$(hget -X POST "$BASE/shifts" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"VOL Phone Bank Eve","type":"phone_banking","start_at":"2026-05-03T23:00:00Z","end_at":"2026-05-04T02:00:00Z","max_volunteers":3}')
SHIFT_B=$(jq -r '.id' /tmp/body.json)
rec "VOL-SHIFT-02" "$code" "shift_b=$SHIFT_B"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/shifts" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" \
  -d '{"name":"x","type":"canvassing","start_at":"2026-05-02T14:00:00Z","end_at":"2026-05-02T18:00:00Z","max_volunteers":1}')
rec "VOL-SHIFT-03" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/shifts" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"x","type":"pizza_party","start_at":"2026-05-02T14:00:00Z","end_at":"2026-05-02T18:00:00Z","max_volunteers":1}')
rec "VOL-SHIFT-04" "$code" "expect 422"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/shifts")
N=$(jq -r '.items | length' /tmp/body.json)
rec "VOL-SHIFT-05" "$code" "shifts=$N"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/shifts?type=phone_banking")
UNI=$(jq -c '[.items[] | .type] | unique' /tmp/body.json)
rec "VOL-SHIFT-06" "$code" "unique_types=$UNI"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/shifts/$SHIFT_A")
rec "VOL-SHIFT-07" "$code" "signed_up=$(jq -r .signed_up_count /tmp/body.json) max=$(jq -r .max_volunteers /tmp/body.json)"

code=$(hget -X PATCH "$BASE/shifts/$SHIFT_A" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"location_name":"West HQ","description":"Updated"}')
rec "VOL-SHIFT-08" "$code" "loc=$(jq -r .location_name /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/shifts/$SHIFT_A" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"name":"hacked"}')
rec "VOL-SHIFT-09" "$code" "expect 403"

# ===== S6: Signup =====
code=$(hget -X POST "$BASE/shifts/$SHIFT_A/signup" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "VOL-SIGNUP-01" "$code" "$(jq -c '.' /tmp/body.json | head -c 140)"

code=$(hget -X POST "$BASE/shifts/$SHIFT_A/assign/$VOL_ALICE" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-SIGNUP-02" "$code" "$(jq -c '.' /tmp/body.json | head -c 140)"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/shifts/$SHIFT_A")
rec "VOL-SIGNUP-03" "$code" "signed_up=$(jq -r .signed_up_count /tmp/body.json)/$(jq -r .max_volunteers /tmp/body.json)"

code=$(hget -X POST "$BASE/shifts/$SHIFT_A/assign/$VOL_BOB" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-SIGNUP-04" "$code" "$(jq -c '.' /tmp/body.json | head -c 140)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/shifts/$SHIFT_A/volunteers")
N=$(jq -r 'if type=="array" then length else (.items|length) end' /tmp/body.json)
rec "VOL-SIGNUP-05" "$code" "volunteers=$N"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/shifts/$SHIFT_A/signup" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "VOL-SIGNUP-06" "$code" "duplicate; expect 422"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/shifts/$SHIFT_A/signup" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "VOL-SIGNUP-07" "$code" "expect 204"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/shifts/$SHIFT_A/volunteers/$VOL_BOB" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-SIGNUP-08" "$code" "expect 204"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/shifts/$SHIFT_A/signup" -H "Authorization: Bearer $TOKEN_OWNER_A")
rec "VOL-SIGNUP-09" "$code" "owner-no-vol-rec; $(jq -r '.type // .detail // empty' /tmp/body.json | head -c 80)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/shifts/$SHIFT_A/signup" -H "Authorization: Bearer $TOKEN_VIEWER_A")
rec "VOL-SIGNUP-10" "$code" "expect 403"

# ===== S7: Check-in / hours =====
code=$(hget -X POST "$BASE/shifts/$SHIFT_A/check-in/$VOL_ALICE" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-CHECK-01" "$code" "check_in=$(jq -r '.check_in_at // empty' /tmp/body.json | head -c 40)"

code=$(hget -X POST "$BASE/shifts/$SHIFT_A/check-out/$VOL_ALICE" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-CHECK-02" "$code" "check_out=$(jq -r '.check_out_at // empty' /tmp/body.json | head -c 40) hours=$(jq -r '.hours // empty' /tmp/body.json)"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/shifts/$SHIFT_A/check-out/$VOL_BOB" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-CHECK-03" "$code" "$(jq -r '.detail // .title' /tmp/body.json | head -c 80)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/shifts/$SHIFT_A/check-in/$VOL_ALICE" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "VOL-CHECK-04" "$code" "expect 403"

code=$(hget -X PATCH "$BASE/shifts/$SHIFT_A/volunteers/$VOL_ALICE/hours" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"adjusted_hours":3.5,"adjustment_reason":"Arrived 30m late"}')
rec "VOL-CHECK-05" "$code" "adj=$(jq -r '.adjusted_hours // .detail' /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/shifts/$SHIFT_A/volunteers/$VOL_ALICE/hours" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"adjusted_hours":8.0,"adjustment_reason":"lies"}')
rec "VOL-CHECK-06" "$code" "expect 403"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/volunteers/$VOL_ALICE/hours")
rec "VOL-CHECK-07" "$code" "$(jq -c '{total_hours,shifts_worked}' /tmp/body.json | head -c 100)"

# ===== S8: Status & Deletion =====
code=$(hget -X PATCH "$BASE/shifts/$SHIFT_A/status" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"in_progress"}')
rec "VOL-LIFE-01" "$code" "status=$(jq -r '.status // .detail' /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/shifts/$SHIFT_A" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"Renamed during shift"}')
rec "VOL-LIFE-02" "$code" "update in_progress"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X DELETE "$BASE/shifts/$SHIFT_A" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-LIFE-03" "$code" "$(jq -r '.detail // .title // empty' /tmp/body.json | head -c 80)"

curl -s -X PATCH "$BASE/shifts/$SHIFT_A/status" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"completed"}' > /dev/null
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X DELETE "$BASE/shifts/$SHIFT_A" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-LIFE-04" "$code" "$(jq -r '.detail // .title // empty' /tmp/body.json | head -c 80)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/shifts/$SHIFT_B" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-LIFE-05" "$code" "expect 204"

# ===== S10: Cross-tenant =====
VOL_B=$(curl -s -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_B/volunteers" -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" -d '{"first_name":"TenantB","last_name":"Volunteer","email":"tb.vol@civpulse.test"}' | jq -r .id)
echo "VOL_B=$VOL_B"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN_OWNER_A" "$BASE/volunteers/$VOL_B")
rec "VOL-ISO-01" "$code" "cross-read $(jq -r '.detail // .title // empty' /tmp/body.json | head -c 60)"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_OWNER_A" "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_B/shifts")
rec "VOL-ISO-02" "$code" "expect 403"

NEW_SHIFT=$(curl -s -X POST "$BASE/shifts" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"VOL iso-test","type":"canvassing","start_at":"2026-06-01T14:00:00Z","end_at":"2026-06-01T18:00:00Z","max_volunteers":1}' | jq -r .id)
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/shifts/$NEW_SHIFT/assign/$VOL_B" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "VOL-ISO-03" "$code" "cross-assign $(jq -r '.detail // .title // empty' /tmp/body.json | head -c 60)"
curl -s -o /dev/null -X DELETE "$BASE/shifts/$NEW_SHIFT" -H "Authorization: Bearer $TOKEN_MGR_A"

echo "VOL_ALICE=$VOL_ALICE" > $EVID/ids.env
echo "VOL_BOB=$VOL_BOB" >> $EVID/ids.env
echo "VOL_SELF=$VOL_SELF" >> $EVID/ids.env
echo "TAG=$TAG" >> $EVID/ids.env
echo "SHIFT_A=$SHIFT_A" >> $EVID/ids.env
echo "SHIFT_B=$SHIFT_B" >> $EVID/ids.env
echo "VOL_B=$VOL_B" >> $EVID/ids.env
cat $EVID/ids.env
echo "=== phase 09 done ==="
