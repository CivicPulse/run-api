# Phase 13: Concurrency & Race Conditions

**Prefix:** `CONC`
**Depends on:** phase-00, phase-07, phase-10
**Estimated duration:** 30 min
**Agents required:** 1

## Purpose

Prove that the API and field-mode client handle concurrent mutations correctly: that list-claiming races converge on a single winner, that role changes mid-request fail closed, that voter updates deal with write-write conflicts, and that the offline queue drains cleanly when it collides with online mutations. Any **data corruption, orphan row, or silent data loss** here is a P0 blocker.

## Threat model

Two or more clients attempt simultaneous state changes. Failure modes:
- **Double-claim** — two volunteers claim the same call list entry → both think they own it.
- **Lost update** — two users PATCH the same voter → one update silently vanishes.
- **Orphan rows** — partial failure in a cross-service transaction leaves half-created records.
- **Stale permission** — a request proceeds after the caller's role was revoked.
- **Offline conflict** — queued offline mutations overwrite newer online data on drain.

## Prerequisites

- Phase 00 complete (Org A seed: 10 voters, 1 call list, 1 walk list)
- Phase 07 complete (call-list claim flow understood; session IDs known)
- Phase 10 complete (field-mode offline queue tested)
- Tokens for `$TOKEN_VOLUNTEER_1` (qa-volunteer@civpulse.org), `$TOKEN_VOLUNTEER_2` (qa-b-volunteer reused, OR a second Org A volunteer; see note), `$TOKEN_ADMIN` (qa-admin@civpulse.org), `$TOKEN_MANAGER` (qa-manager@civpulse.org), `$TOKEN_OWNER` (qa-owner)
- `$CALL_LIST_ID`, `$WALK_LIST_ID`, `$CANVASSER_1`, `$CANVASSER_2` (volunteer IDs), target voter IDs
- GNU `parallel` or `xargs -P` available
- Playwright with `context.setOffline()` capability

**Note on two volunteers:** phase 00 only provisions one volunteer per org. For races that need two concurrent Org A volunteers, either (a) promote qa-viewer temporarily via `POST /campaigns/{id}/members`, or (b) use qa-manager as "volunteer 2" since managers can also claim lists in this codebase. Document choice in results.

---

## Section 1: Call List Claim Races

### CONC-CLAIM-01 | Two volunteers claim the same call list entry simultaneously

**Setup:** Call list `$CALL_LIST_ID` has a fresh entry `$ENTRY_ID` (unclaimed). Two tokens ready.

**Steps:**
```bash
# Fire both claim requests at once via background jobs
curl -sS -o /tmp/claim_v1.json -w "V1:%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_1" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists/$CALL_LIST_ID/entries/$ENTRY_ID/claim" &
curl -sS -o /tmp/claim_v2.json -w "V2:%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_2" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists/$CALL_LIST_ID/entries/$ENTRY_ID/claim" &
wait
cat /tmp/claim_v1.json
cat /tmp/claim_v2.json

# Verify exactly one winner in DB
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, claimed_by, claimed_at FROM call_list_entries WHERE id='$ENTRY_ID';"
```

**Expected:**
- Exactly one request returns 200/201 (winner); the other returns 409 Conflict (or 404/422).
- DB shows `claimed_by` set to exactly ONE of the two volunteers.

**Pass criteria:** Exactly one winner; DB `claimed_by` matches winner.

**Failure meaning:** P0 — double-claim race; two volunteers would call the same voter.

---

### CONC-CLAIM-02 | 20 simultaneous claims — only one wins

**Setup:** Reset entry `$ENTRY_ID` to unclaimed.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
UPDATE call_list_entries SET claimed_by=NULL, claimed_at=NULL WHERE id='$ENTRY_ID';"

seq 1 20 | xargs -P 20 -I{} curl -sS -o /tmp/claim_{}.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_1" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists/$CALL_LIST_ID/entries/$ENTRY_ID/claim" \
  | sort | uniq -c
```

**Expected:** 1× 200/201 + 19× 409/404.

**Pass criteria:** Exactly one success.

---

### CONC-CLAIM-03 | Claim next-available when list is fully claimed by others

**Setup:** All entries in `$CALL_LIST_ID` claimed by other volunteers.

**Steps:**
```bash
# Claim every remaining entry first (as V1)
curl -sS -H "Authorization: Bearer $TOKEN_VOLUNTEER_1" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists/$CALL_LIST_ID/claim-next" \
  -o /tmp/claim_drain.json # repeat until 404/empty

# Now V2 attempts to claim-next
curl -sS -o /tmp/v2_next.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_2" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists/$CALL_LIST_ID/claim-next"
cat /tmp/v2_next.json
```

**Expected:** 404 or 200 with `{"entry": null}` or equivalent "no entries available".

**Pass criteria:** Clear exhaustion signal; no 500; no previously-claimed row reassigned.

---

### CONC-CLAIM-04 | Simultaneous phone-bank session creation for same list

**Steps:**
```bash
curl -sS -o /tmp/s1.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_1" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/phone-banks" \
  -d "{\"call_list_id\":\"$CALL_LIST_ID\",\"name\":\"Session V1\"}" &
curl -sS -o /tmp/s2.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_2" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/phone-banks" \
  -d "{\"call_list_id\":\"$CALL_LIST_ID\",\"name\":\"Session V2\"}" &
wait
cat /tmp/s1.json /tmp/s2.json

# Confirm both sessions distinct in DB
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, name, volunteer_id FROM phone_bank_sessions
WHERE call_list_id='$CALL_LIST_ID' AND created_at > now() - interval '1 minute';"
```

**Expected:** Both sessions created successfully (multiple concurrent sessions per list is expected behaviour). Each row has a distinct `volunteer_id`.

**Pass criteria:** 2 distinct session rows, no duplicate-key errors.

---

## Section 2: Walk List Canvasser Assignment Races

### CONC-ASSIGN-01 | Two managers assign different canvassers to same walk list

**Steps:**
```bash
curl -sS -o /tmp/a1.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers" \
  -d "{\"volunteer_id\":\"$CANVASSER_1\"}" &
curl -sS -o /tmp/a2.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers" \
  -d "{\"volunteer_id\":\"$CANVASSER_2\"}" &
wait

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT volunteer_id FROM walk_list_canvassers WHERE walk_list_id='$WALK_LIST_ID' ORDER BY assigned_at DESC LIMIT 5;"
```

**Expected:** Both assignments succeed; 2 distinct rows in `walk_list_canvassers`.

**Pass criteria:** 2 rows, both canvassers present, no duplicate-key errors.

---

### CONC-ASSIGN-02 | Duplicate assignment of same canvasser is idempotent

**Steps:**
```bash
seq 1 5 | xargs -P 5 -I{} curl -sS -o /tmp/dup_{}.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers" \
  -d "{\"volunteer_id\":\"$CANVASSER_1\"}" | sort | uniq -c

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT count(*) FROM walk_list_canvassers
WHERE walk_list_id='$WALK_LIST_ID' AND volunteer_id='$CANVASSER_1';"
```

**Expected:** Mix of 200/201 and 409 responses; DB shows exactly 1 row for `($WALK_LIST_ID, $CANVASSER_1)`.

**Pass criteria:** Single row; no duplicate-key 500s.

---

### CONC-ASSIGN-03 | Assign + unassign race

**Steps:**
```bash
# Start assigned, then concurrently assign & delete
curl -sS -o /dev/null -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers/$CANVASSER_1" &
curl -sS -o /dev/null \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_ID/canvassers" \
  -d "{\"volunteer_id\":\"$CANVASSER_1\"}" &
wait

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT count(*) FROM walk_list_canvassers
WHERE walk_list_id='$WALK_LIST_ID' AND volunteer_id='$CANVASSER_1';"
```

**Expected:** Final DB state is consistent (either 0 or 1 row). No 500 errors.

**Pass criteria:** No duplicate rows, no orphaned state.

---

## Section 3: Voter Modification Races

### CONC-VOTER-01 | Two users PATCH same voter (last-write-wins)

**Setup:** Voter `$VOTER_ID` exists in Org A campaign.

**Steps:**
```bash
curl -sS -o /tmp/u1.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" \
  -d '{"first_name":"UpdatedByManager"}' &
curl -sS -o /tmp/u2.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" \
  -d '{"last_name":"UpdatedByAdmin"}' &
wait

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT first_name, last_name, updated_at FROM voters WHERE id='$VOTER_ID';"
```

**Expected:** Both return 200. Final row reflects both field updates (they touch disjoint columns). No 500.

**Pass criteria:** `first_name='UpdatedByManager'` AND `last_name='UpdatedByAdmin'` both present.

---

### CONC-VOTER-02 | Two users update same field → last-write-wins

**Steps:**
```bash
curl -sS -o /tmp/u1.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" \
  -d '{"first_name":"Winner-Manager"}' &
curl -sS -o /tmp/u2.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" \
  -d '{"first_name":"Winner-Admin"}' &
wait

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT first_name FROM voters WHERE id='$VOTER_ID';"
```

**Expected:** Both 200; final value is one of the two. Document which (expected: last commit wins).

**Pass criteria:** Field equals exactly one submitted value (Winner-Manager OR Winner-Admin), no corruption.

---

### CONC-VOTER-03 | Delete + update race

**Steps:**
```bash
curl -sS -o /tmp/d1.json -w "DEL:%{http_code}\n" \
  -X DELETE -H "Authorization: Bearer $TOKEN_ADMIN" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" &
curl -sS -o /tmp/u1.json -w "UPD:%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" \
  -d '{"first_name":"LateUpdate"}' &
wait
cat /tmp/d1.json /tmp/u1.json
```

**Expected:** One returns 200/204 (delete), the other returns 404 (or 200 if update beat delete). Never 500.

**Pass criteria:** Both requests return defined status (200/204/404). No 500.

---

### CONC-VOTER-04 | Update voter while concurrently deleting its tag

**Steps:**
```bash
# Start: voter tagged with $TAG_ID
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN_MANAGER" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-tags/$TAG_ID" &
curl -sS -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID/tags" \
  -d "{\"tag_id\":\"$TAG_ID\"}" &
wait

# Verify: either no tag (tag deleted first), or voter-tag relationship cascaded cleanly
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT count(*) FROM voter_tag_assignments vta
JOIN voter_tags vt ON vt.id = vta.tag_id
WHERE vta.voter_id='$VOTER_ID';"
```

**Expected:** No orphan `voter_tag_assignments` row pointing at a deleted tag.

**Pass criteria:** FK constraint upheld; no dangling reference.

---

## Section 4: Campaign Member Changes Mid-Request

### CONC-ROLE-01 | Role revoked during long-running request

**Setup:** qa-manager is currently `manager` in Org A campaign.

**Steps:**
```bash
# Start a voter import (long-running) as manager
curl -sS -o /tmp/import.json -w "IMPORT:%{http_code}\n" --max-time 120 \
  -H "Authorization: Bearer $TOKEN_MANAGER" \
  -F "file=@/tmp/big_voters.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters" &
IMPORT_PID=$!
sleep 1
# Owner revokes manager's role mid-stream
curl -sS -o /dev/null -X DELETE \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members/qa-manager@civpulse.org"
wait $IMPORT_PID
cat /tmp/import.json
```

**Expected:** Import either completes (auth decided at request start) OR aborts with 403. Either is acceptable as long as behaviour is deterministic and documented.

**Pass criteria:** No 500; no half-imported state. If import continues, verify it commits fully (not partially).

---

### CONC-ROLE-02 | Manager demoted to viewer → in-flight PATCH

**Steps:**
```bash
curl -sS -o /tmp/patch.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$VOTER_ID" \
  -d '{"first_name":"DuringDemotion"}' &
curl -sS -o /dev/null \
  -H "Authorization: Bearer $TOKEN_OWNER" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members/qa-manager@civpulse.org" \
  -d '{"role":"viewer"}' &
wait

# Re-promote for later tests
curl -sS -o /dev/null -H "Authorization: Bearer $TOKEN_OWNER" -H "Content-Type: application/json" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members/qa-manager@civpulse.org" \
  -d '{"role":"manager"}'
```

**Expected:** PATCH either 200 or 403. No 500.

**Pass criteria:** Defined outcome; role restoration succeeds.

---

### CONC-ROLE-03 | User removed while holding active JWT

**Steps:**
```bash
# Add qa-viewer as temp campaign_manager
curl -sS -H "Authorization: Bearer $TOKEN_OWNER" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members" \
  -d '{"email":"qa-viewer@civpulse.org","role":"manager"}'
# Viewer logs in, captures $TOKEN_VIEWER_TEMP

# Owner removes viewer's membership
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members/qa-viewer@civpulse.org"

# Viewer attempts mutation using still-valid JWT
curl -sS -o /tmp/orphan.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VIEWER_TEMP" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-tags" \
  -d '{"name":"ShouldFail","color":"red"}'
```

**Expected:** 403 Forbidden — membership re-checked on each request, JWT alone is insufficient.

**Pass criteria:** 403.

**Failure meaning:** P0 — stale permissions persisted after removal.

---

## Section 5: Offline Queue Conflict Resolution

Performed with Playwright using `context.setOffline(true/false)` against the field-mode UI.

### CONC-OFFLINE-01 | Offline + online door-knock for same voter

**Steps:**
```javascript
// Playwright script
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });

  // Volunteer A: goes offline, records door knock at 10:00
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto('https://run.civpulse.org/field/walk-lists/$WALK_LIST_ID');
  // ... log in as qa-volunteer
  await ctxA.setOffline(true);
  // Record door knock for $VOTER_ID with outcome="NOT_HOME" at client_timestamp=10:00 AM
  await pageA.click('[data-testid="voter-$VOTER_ID"] button:has-text("Not Home")');

  // Volunteer B: online, records door knock at 10:05 for same voter
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto('https://run.civpulse.org/field/walk-lists/$WALK_LIST_ID');
  // ... log in as qa-volunteer-2 (or via API as $TOKEN_VOLUNTEER_2)
  await pageB.click('[data-testid="voter-$VOTER_ID"] button:has-text("Talked")');
  // Returns 201

  // Volunteer A: back online at 10:10, queue drains
  await ctxA.setOffline(false);
  await pageA.waitForSelector('[data-testid="sync-status"]:has-text("Synced")', { timeout: 30000 });

  await browser.close();
})();
```

Then verify in DB:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, voter_id, volunteer_id, outcome, client_timestamp, created_at
FROM voter_interactions
WHERE voter_id='$VOTER_ID' AND created_at > now() - interval '10 minutes'
ORDER BY client_timestamp;"
```

**Expected:** Both door-knock interactions preserved as separate rows (multi-record pattern), ordered by `client_timestamp`. NOT a single row with last-write-wins.

**Pass criteria:** 2 rows in `voter_interactions` with distinct volunteer_ids and distinct timestamps.

**Failure meaning:** P0 if offline record overwrites online record (data loss).

---

### CONC-OFFLINE-02 | 10 offline door knocks, network restored

**Steps:** Go offline via Playwright, record 10 door knocks rapid-fire, then restore network.

**Expected:** All 10 interactions persist to DB within 30 s of reconnect.

**Pass criteria:** 10 rows in `voter_interactions` with correct client_timestamp ordering.

---

### CONC-OFFLINE-03 | Offline record for deleted voter

**Steps:**
1. Volunteer goes offline, records door-knock for `$VOTER_ID`.
2. Manager deletes `$VOTER_ID` online.
3. Volunteer reconnects; queue drains.

**Expected:** Offline record either (a) rejected with 404 on drain + surfaced as a sync error in UI, OR (b) stored with null voter_id ref. Document behaviour.

**Pass criteria:** No 500; user sees clear sync-conflict UI OR interaction persists with graceful degradation.

---

### CONC-OFFLINE-04 | Offline queue survives browser restart

**Steps:**
1. Go offline, record 3 door knocks.
2. Close browser context without draining.
3. Reopen context (same user), go online.
4. Verify queue drains.

**Expected:** All 3 interactions reach DB.

**Pass criteria:** 3 rows persisted.

---

### CONC-OFFLINE-05 | Offline interaction with client_timestamp older than last online interaction

**Steps:**
1. Online: record interaction A at 10:00 (server time).
2. Offline: record interaction B with client_timestamp 09:45 (backdated).
3. Online: record interaction C at 10:10.
4. Reconnect.

**Expected:** All 3 rows stored with their respective timestamps; queries sorted by client_timestamp return B, A, C in that order.

**Pass criteria:** Chronology preserved; no clock-skew-triggered rejection.

---

## Section 6: Transaction Boundaries

### CONC-TXN-01 | Create campaign + ZITADEL org atomic rollback

**Setup:** Temporarily set an invalid ZITADEL service-account scope (or simulate ZITADEL failure). Then attempt to create a new campaign that also provisions ZITADEL artefacts.

**Alternative approach (safer):** Use a known-invalid input that triggers a mid-transaction failure.

**Steps:**
```bash
# Attempt to create campaign with a name that violates a DB CHECK or length constraint mid-flow
LONG_NAME=$(python -c "print('A'*300)")
curl -sS -o /tmp/fail.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_OWNER" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -d "{\"name\":\"$LONG_NAME\",\"type\":\"LOCAL\",\"jurisdiction_name\":\"T\"}"
cat /tmp/fail.json

# Verify no orphan rows
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT count(*) FROM campaigns WHERE name LIKE 'AAAAAAAAAA%';
SELECT count(*) FROM campaign_members
WHERE campaign_id NOT IN (SELECT id FROM campaigns);"
```

**Expected:** 422 rejection. No orphan `campaign_members` rows referring to non-existent campaigns.

**Pass criteria:** Zero orphan rows.

---

### CONC-TXN-02 | Bulk voter create: one invalid row aborts batch

**Steps:**
```bash
# Submit a batch where row 3 has an invalid zip_code
cat > /tmp/mixed.csv <<'CSV'
first_name,last_name,address_line_1,city,state,zip_code
Valid,One,1 T,Macon,GA,31201
Valid,Two,2 T,Macon,GA,31201
Bad,Three,3 T,Macon,GA,INVALID_ZIP_WITH_SPACES_AND_SYMBOLS!!!!
Valid,Four,4 T,Macon,GA,31201
CSV
curl -sS -o /tmp/imp.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -F "file=@/tmp/mixed.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
cat /tmp/imp.json

# Count the imported 'Valid'-named voters
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT count(*) FROM voters
WHERE campaign_id='$ORG_A_CAMPAIGN_ID' AND first_name='Valid' AND created_at > now() - interval '1 minute';"
```

**Expected:** Either all 3 valid rows imported + 1 row reported as error (per-row semantics) OR entire batch rolled back (all-or-nothing). Document which.

**Pass criteria:** Behaviour is consistent with documented import semantics; no partial row corruption.

---

### CONC-TXN-03 | Campaign delete cascades cleanly

**Setup:** Create a throw-away campaign with 2 voters + 1 tag + 1 list.

**Steps:**
```bash
# Create temp campaign, seed, then delete
TEMP_CAMPAIGN=$(curl -sS -H "Authorization: Bearer $TOKEN_OWNER" -H "Content-Type: application/json" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -d '{"name":"TXN03 Throwaway","type":"LOCAL","jurisdiction_name":"T"}' | jq -r .id)
# ... seed 2 voters + 1 tag + 1 list ...

curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://run.civpulse.org/api/v1/campaigns/$TEMP_CAMPAIGN"

psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT 'campaigns', count(*) FROM campaigns WHERE id='$TEMP_CAMPAIGN'
UNION ALL SELECT 'voters', count(*) FROM voters WHERE campaign_id='$TEMP_CAMPAIGN'
UNION ALL SELECT 'voter_tags', count(*) FROM voter_tags WHERE campaign_id='$TEMP_CAMPAIGN'
UNION ALL SELECT 'voter_lists', count(*) FROM voter_lists WHERE campaign_id='$TEMP_CAMPAIGN';"
```

**Expected:** All counts 0 (hard delete) OR all non-zero but `deleted_at` set (soft delete). No mixed state.

**Pass criteria:** Consistent cascade or consistent soft-delete; no orphans.

---

## Section 7: Token Expiry Mid-Request

### CONC-EXPIRY-01 | Token expires during long upload

**Setup:** Token with < 60 s until expiry (capture near end of its TTL).

**Steps:**
```bash
# Large CSV import that takes > token remaining TTL
python -c "
print('first_name,last_name,address_line_1,city,state,zip_code')
for i in range(200_000):
    print(f'Exp{i},Test,1 T,Macon,GA,31201')
" > /tmp/expiry.csv

curl -sS -o /tmp/exp.json -w "%{http_code}\n" --max-time 300 \
  -H "Authorization: Bearer $SHORT_LIVED_TOKEN" \
  -F "file=@/tmp/expiry.csv" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/imports/voters"
cat /tmp/exp.json
```

**Expected:** Either (a) upload completes because auth is validated only at request start, or (b) 401 surfaced to client mid-stream. Never 500 or silent data loss.

**Pass criteria:** Status is 200, 401, or 4xx with explicit error. If 200, verify all 200 000 rows imported; if 401, verify zero rows imported (transaction rolled back).

---

### CONC-EXPIRY-02 | Token refresh race (dual refresh attempts)

**Steps:** From a browser, force two parallel token-refresh calls (e.g., by clearing access-token but not refresh-token, then firing two simultaneous API calls).

**Expected:** Both calls succeed; only one refresh token burned (or refresh is idempotent).

**Pass criteria:** Both API calls return 200; no refresh loop.

---

### CONC-EXPIRY-03 | Expired token on WebSocket / SSE (if any)

**Steps:** If the app uses SSE or WS, hold a connection open past token expiry and observe behaviour.

**Expected:** Server closes connection with clean error, client reconnects with fresh token.

**Pass criteria:** No 500; reconnect succeeds.

**Note:** Skip if no WS/SSE in prod.

---

## Results Template

Save a filled-in copy to `results/phase-13-results.md`.

### Call list claim races

| Test ID | Result | Notes |
|---|---|---|
| CONC-CLAIM-01 | | |
| CONC-CLAIM-02 | | |
| CONC-CLAIM-03 | | |
| CONC-CLAIM-04 | | |

### Canvasser assignment races

| Test ID | Result | Notes |
|---|---|---|
| CONC-ASSIGN-01 | | |
| CONC-ASSIGN-02 | | |
| CONC-ASSIGN-03 | | |

### Voter modification races

| Test ID | Result | Notes |
|---|---|---|
| CONC-VOTER-01 | | |
| CONC-VOTER-02 | | |
| CONC-VOTER-03 | | |
| CONC-VOTER-04 | | |

### Role changes mid-request

| Test ID | Result | Notes |
|---|---|---|
| CONC-ROLE-01 | | |
| CONC-ROLE-02 | | |
| CONC-ROLE-03 | | |

### Offline queue conflict

| Test ID | Result | Notes |
|---|---|---|
| CONC-OFFLINE-01 | | |
| CONC-OFFLINE-02 | | |
| CONC-OFFLINE-03 | | |
| CONC-OFFLINE-04 | | |
| CONC-OFFLINE-05 | | |

### Transaction boundaries

| Test ID | Result | Notes |
|---|---|---|
| CONC-TXN-01 | | |
| CONC-TXN-02 | | |
| CONC-TXN-03 | | |

### Token expiry mid-request

| Test ID | Result | Notes |
|---|---|---|
| CONC-EXPIRY-01 | | |
| CONC-EXPIRY-02 | | |
| CONC-EXPIRY-03 | | |

### Summary

- Total tests: 25
- PASS: ___ / 25
- FAIL: ___ / 25
- SKIP: ___ / 25
- BLOCKED: ___ / 25

**Launch-blocking:** CONC-CLAIM-01/02, CONC-OFFLINE-01, CONC-ROLE-03, and any orphan-row failure are P0 blockers.

## Cleanup

```bash
# Remove throwaway voters/sessions created during concurrency tests
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
DELETE FROM voters WHERE campaign_id='$ORG_A_CAMPAIGN_ID'
  AND (first_name LIKE 'Exp%' OR first_name LIKE 'Valid' OR first_name='UpdatedByManager'
    OR first_name LIKE 'Winner-%' OR first_name='DuringDemotion' OR first_name='LateUpdate');
DELETE FROM voter_tags WHERE campaign_id='$ORG_A_CAMPAIGN_ID' AND name='ShouldFail';
DELETE FROM phone_bank_sessions WHERE name IN ('Session V1','Session V2')
  AND created_at > now() - interval '1 hour';
-- Reset any test call-list entries to unclaimed if needed
UPDATE call_list_entries SET claimed_by=NULL, claimed_at=NULL WHERE id='$ENTRY_ID';
"
```

Record cleanup row counts in `results/phase-13-results.md`.
