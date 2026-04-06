#!/bin/bash
# Phase 07: Phone Banking — executor v2
set -u
cd /home/kwhatcher/projects/civicpulse/run-api

export TOKEN_OWNER_A=$(cat .secrets/token-org-a-owner.txt)
export TOKEN_ADMIN_A=$(cat .secrets/token-org-a-admin.txt)
export TOKEN_MGR_A=$(cat .secrets/token-org-a-manager.txt)
export TOKEN_VOL_A=$(cat .secrets/token-org-a-volunteer.txt)
export TOKEN_VIEWER_A=$(cat .secrets/token-org-a-viewer.txt)
export TOKEN_B=$(cat .secrets/token-org-b-owner.txt)
export CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248
export VOTER_LIST_A_ID=4186d781-3a90-420b-a265-ef0420cc5589
export QA_VOL_ID="367278371970744389"
export QA_ADMIN_ID="367278367172460613"
export BASE="https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A"
EVID=/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-07
OUT=$EVID/results.tsv
> $OUT

rec() { echo -e "$1\t$2\t$3" | tee -a $OUT; }
hget() { curl -s -o /tmp/body.json -w "%{http_code}" "$@"; }
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
ts_offset() { date -u -d "$1" +"%Y-%m-%dT%H:%M:%SZ"; }

# ===== S1: Call List CRUD =====
code=$(hget -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"name\":\"PB Test Call List — Shakedown\",\"voter_list_id\":\"$VOTER_LIST_A_ID\",\"max_attempts\":3,\"claim_timeout_minutes\":30,\"cooldown_minutes\":60}")
CALL_LIST_A_ID=$(jq -r '.id // empty' /tmp/body.json)
TOTAL=$(jq -r '.total_entries // 0' /tmp/body.json)
rec "PB-CL-01" "$code" "call_list_id=$CALL_LIST_A_ID total_entries=$TOTAL"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/call-lists?limit=20")
rec "PB-CL-02" "$code" "items=$(jq -r '.items | length' /tmp/body.json)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/call-lists/$CALL_LIST_A_ID")
rec "PB-CL-03" "$code" "name=$(jq -r '.name' /tmp/body.json)"

code=$(hget -X PATCH "$BASE/call-lists/$CALL_LIST_A_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"PB Test Call List (renamed)","max_attempts":5}')
rec "PB-CL-04" "$code" "name=$(jq -r '.name' /tmp/body.json) max=$(jq -r '.max_attempts' /tmp/body.json)"

code=$(hget -X PATCH "$BASE/call-lists/$CALL_LIST_A_ID?new_status=active" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}')
rec "PB-CL-05" "$code" "status=$(jq -r '.status' /tmp/body.json)"

# PB-CL-06: Use a disposable call list so we don't break the main one
DISP_CL=$(curl -s -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"PB disp transitions","max_attempts":1}' | jq -r .id)
curl -s -X PATCH "$BASE/call-lists/$DISP_CL?new_status=active" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}' >/dev/null
c1=$(hget -X PATCH "$BASE/call-lists/$DISP_CL?new_status=completed" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}')
S1=$(jq -r '.status // .detail // empty' /tmp/body.json)
c2=$(hget -X PATCH "$BASE/call-lists/$DISP_CL?new_status=active" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}')
S2=$(jq -r '.status // .detail // empty' /tmp/body.json)
curl -s -o /dev/null -X DELETE "$BASE/call-lists/$DISP_CL" -H "Authorization: Bearer $TOKEN_MGR_A"
rec "PB-CL-06" "$c1/$c2" "active->completed=$S1 completed->active=$S2"

# PB-CL-07: ensure main call list is active
curl -s -X PATCH "$BASE/call-lists/$CALL_LIST_A_ID?new_status=active" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}' >/dev/null
code=$(hget -X PATCH "$BASE/call-lists/$CALL_LIST_A_ID?new_status=INVALID_STATE" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}')
rec "PB-CL-07" "$code" "$(jq -r '.detail // .title // empty' /tmp/body.json | head -c 80)"

code=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/append-from-list" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"voter_list_id\":\"$VOTER_LIST_A_ID\"}")
rec "PB-CL-08" "$code" "$(jq -c '{added,skipped}' /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d "{\"name\":\"vol\",\"voter_list_id\":\"$VOTER_LIST_A_ID\"}")
rec "PB-CL-09" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/call-lists/$CALL_LIST_A_ID" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"name":"hacked"}')
rec "PB-CL-10" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/call-lists/$CALL_LIST_A_ID" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "PB-CL-11" "$code" "expect 403"

# ===== S2: Entries =====
code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/call-lists/$CALL_LIST_A_ID/entries?limit=50")
rec "PB-ENT-01" "$code" "entries=$(jq -r '.items | length' /tmp/body.json)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/call-lists/$CALL_LIST_A_ID/entries?entry_status=pending")
N=$(jq -r '.items | length' /tmp/body.json)
ERR=$(jq -r '.detail // empty' /tmp/body.json | head -c 80)
rec "PB-ENT-02" "$code" "pending=$N err=$ERR"

EMPTY_CL=$(curl -s -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"PB Empty CL","max_attempts":1}' | jq -r .id)
code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/call-lists/$EMPTY_CL/entries")
curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/call-lists/$EMPTY_CL"
rec "PB-ENT-03" "$code" "empty entries=$(jq -r '.items | length' /tmp/body.json)"

# ===== S3: Claim =====
code=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":2}')
N=$(jq -r 'if type=="array" then length else 0 end' /tmp/body.json)
CLAIMED_ENTRY_ID=$(jq -r 'if type=="array" and length>0 then .[0].id else "" end' /tmp/body.json)
CLAIMED_BY=$(jq -r 'if type=="array" and length>0 then .[0].claimed_by else "" end' /tmp/body.json)
ERR=$(jq -r '.detail // empty' /tmp/body.json | head -c 80)
rec "PB-CLAIM-01" "$code" "claimed=$N first=$CLAIMED_ENTRY_ID by=$CLAIMED_BY err=$ERR"

code=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":2}')
IDS=$(jq -r 'if type=="array" then [.[].id] | @csv else "" end' /tmp/body.json | head -c 120)
rec "PB-CLAIM-02" "$code" "ids=$IDS"

c1=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":0}')
D1=$(jq -r 'if type=="array" then length|tostring else .detail // "?" end' /tmp/body.json)
c2=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":10000}')
D2=$(jq -r 'if type=="array" then length|tostring else .detail // "?" end' /tmp/body.json)
rec "PB-CLAIM-03" "$c1/$c2" "0=>$D1 10000=>$D2"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" -d '{"batch_size":1}')
rec "PB-CLAIM-04" "$code" "expect 403"

# ===== S4: Sessions =====
code=$(hget -X POST "$BASE/phone-bank-sessions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"name\":\"PB Shakedown Session\",\"call_list_id\":\"$CALL_LIST_A_ID\"}")
SESSION_A_ID=$(jq -r '.id' /tmp/body.json)
rec "PB-SESS-01" "$code" "session=$SESSION_A_ID status=$(jq -r '.status' /tmp/body.json)"

# Activate the session so check-in works
curl -s -X PATCH "$BASE/phone-bank-sessions/$SESSION_A_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"status":"active"}' > /dev/null

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/phone-bank-sessions?limit=20")
rec "PB-SESS-02" "$code" "items=$(jq -r '.items | length' /tmp/body.json)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/phone-bank-sessions?assigned_to_me=true")
rec "PB-SESS-03" "$code" "pre-assign=$(jq -r '.items | length' /tmp/body.json)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/phone-bank-sessions/$SESSION_A_ID")
rec "PB-SESS-04" "$code" "name=$(jq -r '.name' /tmp/body.json)"

code=$(hget -X PATCH "$BASE/phone-bank-sessions/$SESSION_A_ID" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"PB Shakedown Session (renamed)"}')
rec "PB-SESS-05" "$code" "name=$(jq -r '.name' /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/phone-bank-sessions" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d "{\"name\":\"vol\",\"call_list_id\":\"$CALL_LIST_A_ID\"}")
rec "PB-SESS-06" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/phone-bank-sessions/$SESSION_A_ID" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"name":"hacked"}')
rec "PB-SESS-07" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/phone-bank-sessions/$SESSION_A_ID" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "PB-SESS-08" "$code" "expect 403"

code=$(hget -X POST "$BASE/phone-bank-sessions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"bogus","call_list_id":"00000000-0000-0000-0000-000000000000"}')
rec "PB-SESS-09" "$code" "resp=$(jq -r '.detail // .title' /tmp/body.json | head -c 80)"

# ===== S5: Callers =====
code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/callers" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"user_id\":\"$QA_VOL_ID\"}")
rec "PB-CALLER-01" "$code" "user_id=$(jq -r '.user_id // empty' /tmp/body.json)"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/phone-bank-sessions/$SESSION_A_ID/callers")
N=$(jq -r 'if type=="array" then length else (.items|length) end' /tmp/body.json)
rec "PB-CALLER-02" "$code" "callers=$N"

code=$(hget -H "Authorization: Bearer $TOKEN_VOL_A" "$BASE/phone-bank-sessions/$SESSION_A_ID/callers/me")
rec "PB-CALLER-03" "$code" "user_id=$(jq -r '.user_id // empty' /tmp/body.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/callers" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"user_id":"fake"}')
rec "PB-CALLER-04" "$code" "expect 403"

code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/check-in" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "PB-CALLER-05" "$code" "check_in_at=$(jq -r '.check_in_at // .detail // empty' /tmp/body.json | head -c 40)"

code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/check-out" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "PB-CALLER-06" "$code" "check_out_at=$(jq -r '.check_out_at // .detail // empty' /tmp/body.json | head -c 40)"
curl -s -o /dev/null -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/check-in" -H "Authorization: Bearer $TOKEN_VOL_A"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/phone-bank-sessions/$SESSION_A_ID/callers/$QA_VOL_ID" -H "Authorization: Bearer $TOKEN_MGR_A")
curl -s -o /dev/null -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/callers" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"user_id\":\"$QA_VOL_ID\"}"
curl -s -o /dev/null -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/check-in" -H "Authorization: Bearer $TOKEN_VOL_A"
rec "PB-CALLER-07" "$code" "expect 204"

# ===== S6: Call recording =====
if [ -n "$CLAIMED_ENTRY_ID" ]; then
  NOW=$(ts); LATER=$(ts_offset "+2 minutes")
  code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"4785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$LATER\",\"notes\":\"PB-CALL-01\",\"survey_complete\":false}")
  ID=$(jq -r '.id // .detail // empty' /tmp/body.json | head -c 80)
  rec "PB-CALL-01" "$code" "id=$ID"
else
  rec "PB-CALL-01" "SKIP" "no claimed entry"
fi

# PB-CALL-02 — all outcomes
BATCH_RAW=$(curl -s -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":7}')
echo "$BATCH_RAW" | jq -r 'if type=="array" then .[].id else empty end' > /tmp/batch.txt
RESULTS_ARR=(answered no_answer busy wrong_number voicemail refused disconnected)
i=0; OUTCOMES=""
while read eid; do
  [ -z "$eid" ] && continue
  r="${RESULTS_ARR[$i]:-answered}"
  N=$(ts)
  c=$(curl -s -o /tmp/c.json -w "%{http_code}" -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d "{\"call_list_entry_id\":\"$eid\",\"result_code\":\"$r\",\"phone_number_used\":\"4785551212\",\"call_started_at\":\"$N\",\"call_ended_at\":\"$N\",\"survey_complete\":false}")
  OUTCOMES="$OUTCOMES $r:$c"
  i=$((i+1))
done < /tmp/batch.txt
BATCH_N=$(wc -l < /tmp/batch.txt)
rec "PB-CALL-02" "mixed" "batch=$BATCH_N outcomes=$OUTCOMES"

NOW=$(ts)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"BOGUS\",\"phone_number_used\":\"4785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\"}")
rec "PB-CALL-03" "$code" "expect 422"

EID=$(curl -s -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":1}' | jq -r 'if type=="array" and length>0 then .[0].id else empty end')
if [ -n "$EID" ]; then
  NOW=$(ts)
  code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d "{\"call_list_entry_id\":\"$EID\",\"result_code\":\"answered\",\"phone_number_used\":\"4785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\",\"survey_responses\":[],\"survey_complete\":true}")
  rec "PB-CALL-04" "$code" "empty survey_responses; resp=$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 80)"
else
  rec "PB-CALL-04" "SKIP" "no entry to claim"
fi

NOW=$(ts); PAST=$(ts_offset "-5 minutes")
code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"4785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$PAST\"}")
rec "PB-CALL-05" "$code" "end<start; $(jq -r '.detail // .id // empty' /tmp/body.json | head -c 60)"

NOW=$(ts)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"4785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\"}")
rec "PB-CALL-06" "$code" "expect 403"

# ===== S7: Progress & entry mgmt =====
code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/phone-bank-sessions/$SESSION_A_ID/progress")
rec "PB-PROG-01" "$code" "$(jq -c '.' /tmp/body.json | head -c 160)"

EID=$(curl -s -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":1}' | jq -r 'if type=="array" and length>0 then .[0].id else empty end')
if [ -n "$EID" ]; then
  code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/entries/$EID/self-release" -H "Authorization: Bearer $TOKEN_VOL_A")
  rec "PB-PROG-02" "$code" "entry=$EID resp=$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 60)"
else
  rec "PB-PROG-02" "SKIP" "no entry"
fi

EID=$(curl -s -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":1}' | jq -r 'if type=="array" and length>0 then .[0].id else empty end')
if [ -n "$EID" ]; then
  code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/entries/$EID/release" -H "Authorization: Bearer $TOKEN_MGR_A")
  rec "PB-PROG-03" "$code" "entry=$EID resp=$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 60)"
else
  rec "PB-PROG-03" "SKIP" "no entry"
fi

EID=$(curl -s -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":1}' | jq -r 'if type=="array" and length>0 then .[0].id else empty end')
if [ -n "$EID" ]; then
  code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/entries/$EID/reassign" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"user_id\":\"$QA_ADMIN_ID\"}")
  rec "PB-PROG-04" "$code" "entry=$EID resp=$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 80)"
else
  rec "PB-PROG-04" "SKIP" "no entry"
fi

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/entries/$CLAIMED_ENTRY_ID/reassign" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{}')
rec "PB-PROG-05" "$code" "expect 403"

# ===== S8: DNC =====
code=$(hget -X POST "$BASE/dnc" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"phone_number":"4785559999","reason":"PB shakedown test"}')
DNC_ENTRY_ID=$(jq -r '.id // empty' /tmp/body.json)
rec "PB-DNC-01" "$code" "dnc_id=$DNC_ENTRY_ID"

code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/dnc")
N=$(jq -r 'if type=="array" then length else (.items|length) end' /tmp/body.json)
rec "PB-DNC-02" "$code" "entries=$N"

# Check DNC schema first
code=$(hget -X POST "$BASE/dnc/check" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"phone_number":"4785559999"}')
rec "PB-DNC-03" "$code" "$(jq -c '.' /tmp/body.json | head -c 160)"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/dnc" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"phone_number":"4785558888"}')
rec "PB-DNC-04" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/dnc/$DNC_ENTRY_ID" -H "Authorization: Bearer $TOKEN_VOL_A")
rec "PB-DNC-05" "$code" "expect 403"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_VIEWER_A" "$BASE/dnc")
rec "PB-DNC-06" "$code" "expect 403"

VOTER_PHONE=$(psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -t -A -c "SELECT value FROM voter_phones WHERE campaign_id='$CAMPAIGN_A' LIMIT 1;" 2>/dev/null)
if [ -n "$VOTER_PHONE" ]; then
  DNC_VID=$(curl -s -X POST "$BASE/dnc" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"phone_number\":\"$VOTER_PHONE\",\"reason\":\"PB-DNC-07\"}" | jq -r '.id // empty')
  code=$(hget -X POST "$BASE/dnc/check" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d "{\"phone_number\":\"$VOTER_PHONE\"}")
  FLAG=$(jq -c '.' /tmp/body.json | head -c 160)
  curl -s -o /dev/null -X DELETE "$BASE/dnc/$DNC_VID" -H "Authorization: Bearer $TOKEN_MGR_A"
  rec "PB-DNC-07" "$code" "phone=$VOTER_PHONE flag=$FLAG"
else
  rec "PB-DNC-07" "SKIP" "no voter phone"
fi

NOW=$(ts)
if [ -n "$CLAIMED_ENTRY_ID" ]; then
  code=$(hget -X POST "$BASE/phone-bank-sessions/$SESSION_A_ID/calls" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"4785559999\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\"}")
  rec "PB-DNC-08" "$code" "resp=$(jq -r '.detail // .id // empty' /tmp/body.json | head -c 100)"
else
  rec "PB-DNC-08" "SKIP" "no entry"
fi

# ===== S9: Delete =====
DISP=$(curl -s -X POST "$BASE/phone-bank-sessions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"name\":\"PB Disposable\",\"call_list_id\":\"$CALL_LIST_A_ID\"}" | jq -r .id)
c1=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/phone-bank-sessions/$DISP" -H "Authorization: Bearer $TOKEN_MGR_A")
c2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/phone-bank-sessions/$DISP")
rec "PB-DEL-01" "$c1/$c2" "delete then get"

DISP=$(curl -s -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"PB Disposable CL","max_attempts":1}' | jq -r .id)
c1=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/call-lists/$DISP" -H "Authorization: Bearer $TOKEN_MGR_A")
c2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/call-lists/$DISP")
rec "PB-DEL-02" "$c1/$c2" "delete then get"

# ===== S11: Edge =====
EMPTY=$(curl -s -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"PB Empty 2","max_attempts":1}' | jq -r .id)
curl -s -X PATCH "$BASE/call-lists/$EMPTY?new_status=active" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}' >/dev/null
code=$(hget -X POST "$BASE/call-lists/$EMPTY/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":5}')
N=$(jq -r 'if type=="array" then length else 0 end' /tmp/body.json)
curl -s -o /dev/null -X DELETE "$BASE/call-lists/$EMPTY" -H "Authorization: Bearer $TOKEN_MGR_A"
rec "PB-EDGE-01" "$code" "claimed=$N"

EMPTY_CL=$(curl -s -X POST "$BASE/call-lists" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{"name":"PB Empty CL3","max_attempts":1}' | jq -r .id)
SESS=$(curl -s -X POST "$BASE/phone-bank-sessions" -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d "{\"name\":\"PB Empty Session\",\"call_list_id\":\"$EMPTY_CL\"}" | jq -r .id)
code=$(hget -H "Authorization: Bearer $TOKEN_MGR_A" "$BASE/phone-bank-sessions/$SESS/progress")
PROG=$(jq -c '.' /tmp/body.json | head -c 150)
curl -s -o /dev/null -X DELETE "$BASE/phone-bank-sessions/$SESS" -H "Authorization: Bearer $TOKEN_MGR_A"
curl -s -o /dev/null -X DELETE "$BASE/call-lists/$EMPTY_CL" -H "Authorization: Bearer $TOKEN_MGR_A"
rec "PB-EDGE-02" "$code" "$PROG"

c1=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":1}')
IDS_A=$(jq -r 'if type=="array" then [.[].id]|@csv else "" end' /tmp/body.json | head -c 40)
c2=$(hget -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":1}')
IDS_B=$(jq -r 'if type=="array" then [.[].id]|@csv else "" end' /tmp/body.json | head -c 40)
rec "PB-EDGE-03" "$c1/$c2" "A=$IDS_A B=$IDS_B"

rec "PB-EDGE-04" "SKIP" "observational only"

# concurrent claims
for i in 1 2 3 4 5; do
  curl -s -o "/tmp/claim-$i.json" -X POST "$BASE/call-lists/$CALL_LIST_A_ID/claim" -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{"batch_size":3}' &
done
wait
TOTAL=$(jq -s '[.[] | if type=="array" then .[] else empty end] | length' /tmp/claim-*.json 2>/dev/null)
UNIQUE=$(jq -s '[.[] | if type=="array" then .[] else empty end] | map(.id) | unique | length' /tmp/claim-*.json 2>/dev/null)
rec "PB-EDGE-05" "race" "returned=$TOTAL unique=$UNIQUE"
rm -f /tmp/claim-*.json

echo "CALL_LIST_A_ID=$CALL_LIST_A_ID" > $EVID/ids.env
echo "SESSION_A_ID=$SESSION_A_ID" >> $EVID/ids.env
echo "CLAIMED_ENTRY_ID=$CLAIMED_ENTRY_ID" >> $EVID/ids.env
echo "DNC_ENTRY_ID=$DNC_ENTRY_ID" >> $EVID/ids.env
cat $EVID/ids.env
echo "=== phase 07 done ==="
