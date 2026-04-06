#!/bin/bash
# Phase 08: Surveys — executor
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
EVID=/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-08
OUT=$EVID/results.tsv
> $OUT

rec() { echo -e "$1\t$2\t$3" | tee -a $OUT; }
hget() { curl -s -o /tmp/body.json -w "%{http_code}" "$@"; }

# Get voter id
VOTER_ID=$(curl -s -H "Authorization: Bearer $TOKEN_OWNER_A" "$BASE/voters?limit=1" | jq -r '.items[0].id')
echo "VOTER_ID=$VOTER_ID"

# ===== S1: Script CRUD =====
code=$(hget -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"title":"SRV Test Script 1","description":"Phase 08 CRUD fixture"}')
SCRIPT_ID=$(jq -r '.id' /tmp/body.json)
STATUS=$(jq -r '.status' /tmp/body.json)
rec "SRV-SCRIPT-01" "$code" "script=$SCRIPT_ID status=$STATUS"

code=$(hget -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_OWNER_A" -H "Content-Type: application/json" -d '{"title":"SRV Owner Script","description":"owner test"}')
SCRIPT_OWNER=$(jq -r '.id' /tmp/body.json)
rec "SRV-SCRIPT-02" "$code" "id=$SCRIPT_OWNER"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"title":"No","description":"blocked"}')
rec "SRV-SCRIPT-03" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" -d '{"title":"No","description":"blocked"}')
rec "SRV-SCRIPT-04" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"description":"no title"}')
rec "SRV-SCRIPT-05" "$code" "expect 422"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/surveys?limit=20")
N=$(jq -r '.items | length' /tmp/body.json)
rec "SRV-SCRIPT-06" "$code" "items=$N"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_VIEWER_A" "$BASE/surveys")
rec "SRV-SCRIPT-07" "$code" "expect 403"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/surveys?status_filter=draft")
STATS=$(jq -c '[.items[] | .status] | unique' /tmp/body.json)
rec "SRV-SCRIPT-08" "$code" "unique_statuses=$STATS"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/surveys?status_filter=bogus")
rec "SRV-SCRIPT-09" "$code" "expect 400"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/surveys/$SCRIPT_ID")
QN=$(jq -r '.questions | length' /tmp/body.json)
rec "SRV-SCRIPT-10" "$code" "questions=$QN status=$(jq -r .status /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/surveys/00000000-0000-0000-0000-000000000000")
rec "SRV-SCRIPT-11" "$code" "expect 404"

code=$(hget -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"title":"SRV Test Script 1 (renamed)","description":"updated"}')
rec "SRV-SCRIPT-12" "$code" "title=$(jq -r .title /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"title":"hacked"}')
rec "SRV-SCRIPT-13" "$code" "expect 403"

# ===== S2: Questions =====
code=$(hget -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"question_text":"Which issue matters most to you?","question_type":"multiple_choice","options":{"choices":["Economy","Education","Healthcare","Environment"]},"position":1}')
Q_MC=$(jq -r '.id' /tmp/body.json)
rec "SRV-QUES-01" "$code" "id=$Q_MC"

code=$(hget -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"question_text":"Rate your support 1-5","question_type":"scale","options":{"min":1,"max":5},"position":2}')
Q_SC=$(jq -r '.id' /tmp/body.json)
rec "SRV-QUES-02" "$code" "id=$Q_SC"

code=$(hget -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"question_text":"Any additional comments?","question_type":"free_text","position":3}')
Q_FT=$(jq -r '.id' /tmp/body.json)
rec "SRV-QUES-03" "$code" "id=$Q_FT"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"question_text":"bad","question_type":"radio_button","position":4}')
rec "SRV-QUES-04" "$code" "expect 422"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"question_text":"","question_type":"free_text"}')
rec "SRV-QUES-05" "$code" "empty text; resp=$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 60)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"question_text":"blocked","question_type":"free_text"}')
rec "SRV-QUES-06" "$code" "expect 403"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/surveys/$SCRIPT_ID")
ORDER=$(jq -c '.questions | map({position, question_type})' /tmp/body.json | head -c 200)
rec "SRV-QUES-07" "$code" "$ORDER"

code=$(hget -X PATCH "$BASE/surveys/$SCRIPT_ID/questions/$Q_MC" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"question_text":"Which issue matters MOST to you?"}')
rec "SRV-QUES-08" "$code" "text=$(jq -r .question_text /tmp/body.json | head -c 60)"

code=$(hget -X PATCH "$BASE/surveys/$SCRIPT_ID/questions/$Q_MC" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"options":{"choices":["Economy","Education","Healthcare","Environment","Other"]}}')
NC=$(jq -r '.options.choices | length' /tmp/body.json)
rec "SRV-QUES-09" "$code" "choices=$NC"

code=$(hget -X PUT "$BASE/surveys/$SCRIPT_ID/questions/order" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "[\"$Q_FT\",\"$Q_SC\",\"$Q_MC\"]")
POS=$(jq -c 'if type=="array" then map({id,position}) else . end' /tmp/body.json | head -c 200)
rec "SRV-QUES-10" "$code" "$POS"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/surveys/$SCRIPT_ID/questions/order" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "[\"$Q_FT\",\"$Q_SC\"]")
rec "SRV-QUES-11" "$code" "expect 400"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/surveys/$SCRIPT_ID/questions/$Q_FT" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "SRV-QUES-12" "$code" "expect 204"
# Re-add FT
Q_FT=$(curl -s -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"question_text":"Any additional comments?","question_type":"free_text","position":3}' | jq -r .id)

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/surveys/$SCRIPT_ID/questions/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $TOKEN_MGR_A")
rec "SRV-QUES-13" "$code" "expect 404"

# ===== S3: Status transitions =====
code=$(hget -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}')
rec "SRV-STATUS-01" "$code" "status=$(jq -r .status /tmp/body.json)"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X PATCH "$BASE/surveys/$SCRIPT_ID/questions/$Q_MC" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"question_text":"Should not be editable on active?"}')
rec "SRV-STATUS-02" "$code" "resp=$(jq -r '.detail // .question_text // empty' /tmp/body.json | head -c 80)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/surveys?status_filter=active")
N=$(jq -r --arg id "$SCRIPT_ID" '[.items[] | select(.id==$id)] | length' /tmp/body.json)
rec "SRV-STATUS-03" "$code" "active_match=$N"

code=$(hget -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"archived"}')
rec "SRV-STATUS-04" "$code" "status=$(jq -r .status /tmp/body.json)"

code=$(hget -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}')
rec "SRV-STATUS-05" "$code" "status=$(jq -r '.status // .detail' /tmp/body.json)"

# Delete draft succeeds, delete non-draft may fail
FRESH=$(curl -s -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"title":"SRV delete-me"}' | jq -r .id)
c1=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/surveys/$FRESH" -H "Authorization: Bearer $TOKEN_MGR_A")
c2=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A")
# Ensure main script active again
curl -s -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}' > /dev/null 2>&1
rec "SRV-STATUS-06" "$c1/$c2" "draft=$c1 active=$c2"

# ===== S4: Responses =====
code=$(hget -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"$Q_MC\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Healthcare\"},{\"question_id\":\"$Q_SC\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"4\"},{\"question_id\":\"$Q_FT\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Keep up the good work\"}]}")
N=$(jq -r 'if type=="array" then length else 0 end' /tmp/body.json)
rec "SRV-RESP-01" "$code" "responses=$N"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/surveys/$SCRIPT_ID/voters/$VOTER_ID/responses")
N=$(jq -r 'if type=="array" then length else 0 end' /tmp/body.json)
rec "SRV-RESP-02" "$code" "responses=$N"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[]}")
rec "SRV-RESP-03" "$code" "expect 403"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"00000000-0000-0000-0000-000000000000\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"x\"}]}")
rec "SRV-RESP-04" "$code" "unknown q; $(jq -r '.detail // .title // empty' /tmp/body.json | head -c 60)"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"00000000-0000-0000-0000-000000000000\",\"responses\":[{\"question_id\":\"$Q_MC\",\"voter_id\":\"00000000-0000-0000-0000-000000000000\",\"answer_value\":\"x\"}]}")
rec "SRV-RESP-05" "$code" "unknown voter; $(jq -r '.detail // .title // empty' /tmp/body.json | head -c 60)"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[]}")
N=$(jq -r 'if type=="array" then length else 0 end' /tmp/body.json)
rec "SRV-RESP-06" "$code" "empty batch; count=$N"

# DB verification
DBN=$(psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -t -A -c "SELECT count(*) FROM survey_responses WHERE script_id='$SCRIPT_ID' AND voter_id='$VOTER_ID';" 2>/dev/null)
rec "SRV-RESP-07" "DB" "rows=$DBN"

# ===== S6: Edge cases =====
EMPTY=$(curl -s -X POST "$BASE/surveys" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"title":"SRV zero-questions"}' | jq -r .id)
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X PATCH "$BASE/surveys/$EMPTY" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}')
STATE=$(jq -r '.status // .detail' /tmp/body.json)
# cleanup
curl -s -o /dev/null -X PATCH "$BASE/surveys/$EMPTY" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"archived"}' > /dev/null 2>&1
curl -s -o /dev/null -X DELETE "$BASE/surveys/$EMPTY" -H "Authorization: Bearer $TOKEN_MGR_A"
rec "SRV-EDGE-01" "$code" "empty activate=$STATE"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"question_text":"Pick one","question_type":"multiple_choice","options":{"choices":[]}}')
rec "SRV-EDGE-02" "$code" "$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 80)"

code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/questions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"question_text":"No options?","question_type":"multiple_choice"}')
rec "SRV-EDGE-03" "$code" "$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 80)"

# SRV-EDGE-04 archive mid-session
curl -s -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"archived"}' > /dev/null 2>&1
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"$Q_MC\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Economy\"}]}")
rec "SRV-EDGE-04" "$code" "archived response; $(jq -r '.detail // empty' /tmp/body.json | head -c 60)"

# SRV-EDGE-05 duplicate response
curl -s -X PATCH "$BASE/surveys/$SCRIPT_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}' > /dev/null 2>&1
c1=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"$Q_MC\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Education\"}]}")
c2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/surveys/$SCRIPT_ID/responses" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"$Q_MC\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Education\"}]}")
rec "SRV-EDGE-05" "$c1/$c2" "duplicate same q+voter"

# SRV-EDGE-06 cross-campaign isolation (CRITICAL P0 test)
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN_OWNER_A" "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_B/surveys/$SCRIPT_ID")
rec "SRV-EDGE-06" "$code" "cross-campaign $(jq -r '.detail // .title // .id' /tmp/body.json | head -c 80)"

echo "SCRIPT_ID=$SCRIPT_ID" > $EVID/ids.env
echo "SCRIPT_OWNER=$SCRIPT_OWNER" >> $EVID/ids.env
echo "Q_MC=$Q_MC" >> $EVID/ids.env
echo "Q_SC=$Q_SC" >> $EVID/ids.env
echo "Q_FT=$Q_FT" >> $EVID/ids.env
cat $EVID/ids.env
echo "=== phase 08 done ==="
