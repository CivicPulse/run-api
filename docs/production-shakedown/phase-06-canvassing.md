# Phase 06: Canvassing (Turfs & Walk Lists)

**Prefix:** `CANV`
**Depends on:** phase-00, phase-04, phase-05
**Estimated duration:** 45 min
**Agents required:** 1

## Purpose

Exhaustively exercise turf management, walk list lifecycle, canvasser assignment, and door-knock recording — the backbone of the canvassing operation. Every endpoint in `app/api/v1/turfs.py` and `app/api/v1/walk_lists.py` is probed with both happy-path and role-based negative cases. Field-mode offline flows are covered in phase-10; this phase validates the online API and desktop-manager UI.

## Prerequisites

- Phase 00 complete (Org A + Org B, both tokens available, test users synced)
- Phase 04 complete (`$CAMPAIGN_A` = `06d710c8-32ce-44ae-bbab-7fcc72aab248` reachable)
- Phase 05 complete (at least 10 voters with coordinates exist in `$CAMPAIGN_A`; one voter list created with ≥5 members — record `$VOTER_LIST_A_ID`)
- Fresh tokens in env vars: `$TOKEN_A` (owner), `$TOKEN_ADMIN_A`, `$TOKEN_MGR_A`, `$TOKEN_VOL_A`, `$TOKEN_VIEWER_A`, `$TOKEN_B` (Org B owner)
- `CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248`

Record created resources in env vars as you go: `$TURF_A_ID`, `$TURF_SMALL_ID`, `$TURF_EMPTY_ID`, `$WALK_LIST_A_ID`, `$WALK_LIST_ENTRY_ID`.

---

## Section 1: Turf CRUD

### CANV-TURF-01 | Create turf with valid GeoJSON polygon (manager+)

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CANV Test Turf — Downtown",
    "description": "Phase 06 turf",
    "boundary": {
      "type": "Polygon",
      "coordinates": [[
        [-83.6324, 32.8407],
        [-83.6324, 32.8507],
        [-83.6224, 32.8507],
        [-83.6224, 32.8407],
        [-83.6324, 32.8407]
      ]]
    }
  }'
cat /tmp/body.json | jq .
```

**Expected:** HTTP 201 with `{id, name, status, boundary, ...}`.

**Pass criteria:** 201. Extract `.id` → `$TURF_A_ID`.

---

### CANV-TURF-02 | List turfs in campaign (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs?limit=20" | jq '.items | length, .pagination'
```

**Expected:** HTTP 200, paginated response with `$TURF_A_ID` in `.items[]`.

**Pass criteria:** Newly created turf appears in list.

---

### CANV-TURF-03 | GET single turf by id (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID" | jq '.id, .name, .boundary.type'
```

**Expected:** HTTP 200. `.boundary.type == "Polygon"`.

**Pass criteria:** Correct turf returned.

---

### CANV-TURF-04 | Update turf name + description (manager+)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name": "CANV Test Turf — Downtown (renamed)", "description": "Updated"}' | jq '.name, .description'
```

**Expected:** HTTP 200 with updated values.

**Pass criteria:** Name + description updated. Verify via GET.

---

### CANV-TURF-05 | Update turf boundary only (manager+)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{
    "boundary": {
      "type": "Polygon",
      "coordinates": [[
        [-83.6350, 32.8400],
        [-83.6350, 32.8550],
        [-83.6200, 32.8550],
        [-83.6200, 32.8400],
        [-83.6350, 32.8400]
      ]]
    }
  }' | jq '.boundary.coordinates[0] | length'
```

**Expected:** HTTP 200. 5 ring points.

**Pass criteria:** Boundary updated.

---

### CANV-TURF-06 | Update turf status (active → paused)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}' | jq .status
```

**Expected:** HTTP 200, `"status": "paused"` (or whichever TurfStatus value is valid).

**Pass criteria:** Status updated. Then restore to `"active"` with another PATCH.

---

### CANV-TURF-07 | List voters inside turf boundary (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID/voters" | jq 'length, .[0]'
```

**Expected:** HTTP 200 with list of `VoterLocationResponse` items (possibly empty if no geocoded voters in bbox).

**Pass criteria:** 200. Document count returned.

---

### CANV-TURF-08 | Overlap detection query (manager+)

**Steps:**
```bash
BOUNDARY='{"type":"Polygon","coordinates":[[[-83.6325,32.8400],[-83.6325,32.8500],[-83.6225,32.8500],[-83.6225,32.8400],[-83.6325,32.8400]]]}'
curl -fsS -H "Authorization: Bearer $TOKEN_MGR_A" \
  --data-urlencode "boundary=$BOUNDARY" \
  -G "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/overlaps" | jq '. | length'
```

**Expected:** HTTP 200. Array of overlapping turfs (should include `$TURF_A_ID`).

**Pass criteria:** 200. Overlap detection returns non-empty array when geometries intersect.

---

### CANV-TURF-09 | Create turf with empty/minimal coverage (for delete test)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CANV Disposable Turf",
    "boundary": {"type":"Polygon","coordinates":[[[-90.0,45.0],[-90.0,45.001],[-89.999,45.001],[-89.999,45.0],[-90.0,45.0]]]}
  }' | jq .id
```

**Expected:** HTTP 201.

**Pass criteria:** Record id as `$TURF_EMPTY_ID`.

---

### CANV-TURF-10 | Delete turf (manager+)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_EMPTY_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
# follow-up GET should 404
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MGR_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_EMPTY_ID"
```

**Expected:** First returns 204; second returns 404.

**Pass criteria:** Turf deleted; no longer retrievable.

---

## Section 2: Turf GeoJSON validation (negative)

### CANV-GEO-01 | Invalid GeoJSON — non-polygon type

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bad Point","boundary":{"type":"Point","coordinates":[-83.63,32.84]}}'
cat /tmp/body.json
```

**Expected:** HTTP 422 or 400. Error mentions polygon/boundary invalidity.

**Pass criteria:** Non-2xx. No turf created.

---

### CANV-GEO-02 | Invalid polygon — fewer than 4 ring points

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Triangle fail","boundary":{"type":"Polygon","coordinates":[[[-83.63,32.84],[-83.62,32.84],[-83.63,32.84]]]}}'
```

**Expected:** HTTP 422 or 400 (polygon must close and have ≥4 coordinates).

**Pass criteria:** Non-2xx.

---

### CANV-GEO-03 | Invalid polygon — ring not closed

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Open ring","boundary":{"type":"Polygon","coordinates":[[[-83.63,32.84],[-83.63,32.85],[-83.62,32.85],[-83.62,32.84]]]}}'
```

**Expected:** HTTP 422 or 400.

**Pass criteria:** Non-2xx (or auto-close handled; document either behavior).

---

### CANV-GEO-04 | Self-intersecting polygon (bowtie)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bowtie","boundary":{"type":"Polygon","coordinates":[[[-83.63,32.84],[-83.62,32.85],[-83.62,32.84],[-83.63,32.85],[-83.63,32.84]]]}}'
```

**Expected:** HTTP 422/400 OR 201 (PostGIS may accept invalid polygons — document behavior).

**Pass criteria:** Document. If created, verify `ST_IsValid` is false in DB and file a P2 ticket.

---

### CANV-GEO-05 | Coordinates out of range (lng > 180)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Out of range","boundary":{"type":"Polygon","coordinates":[[[500,32.84],[500,32.85],[501,32.85],[501,32.84],[500,32.84]]]}}'
```

**Expected:** HTTP 422/400.

**Pass criteria:** Non-2xx.

---

### CANV-GEO-06 | Missing boundary field entirely

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"No boundary"}'
```

**Expected:** HTTP 422.

**Pass criteria:** Pydantic validation rejects.

---

## Section 3: Turf role-based access (negative)

### CANV-RBAC-T01 | Volunteer cannot create turf

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"vol attempt","boundary":{"type":"Polygon","coordinates":[[[-83.6,32.8],[-83.6,32.81],[-83.59,32.81],[-83.59,32.8],[-83.6,32.8]]]}}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CANV-RBAC-T02 | Viewer cannot create turf

**Steps:** Same with `$TOKEN_VIEWER_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CANV-RBAC-T03 | Volunteer cannot update turf

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" -d '{"name":"hacked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CANV-RBAC-T04 | Volunteer cannot delete turf

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403. Turf still exists.

---

### CANV-RBAC-T05 | Volunteer CAN read turf list & detail

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$TURF_A_ID"
```

**Expected:** Both HTTP 200.

**Pass criteria:** 200/200 — volunteer has read access.

---

## Section 4: Walk List CRUD

### CANV-WL-01 | Create walk list from turf + voter list (manager+)

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"CANV Walk List — Downtown Sweep\",
    \"turf_id\": \"$TURF_A_ID\",
    \"voter_list_id\": \"$VOTER_LIST_A_ID\"
  }"
cat /tmp/body.json | jq '.id, .name, .turf_id'
```

**Expected:** HTTP 201. Entries populated from the intersection of turf boundary and voter list.

**Pass criteria:** 201. Record `.id` → `$WALK_LIST_A_ID`.

---

### CANV-WL-02 | Create walk list from turf only (no voter list)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"CANV Turf-only WL\",\"turf_id\":\"$TURF_A_ID\"}"
```

**Expected:** HTTP 201 (all voters in turf) OR 422 if voter_list_id required. Document.

**Pass criteria:** Document behavior. If 201, entries should include all turf voters.

---

### CANV-WL-03 | List walk lists (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists?limit=20" | jq '.items | length'
```

**Expected:** HTTP 200, paginated list including `$WALK_LIST_A_ID`.

**Pass criteria:** 200.

---

### CANV-WL-04 | GET walk list detail

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID" | jq '.id, .name, .turf_id'
```

**Expected:** HTTP 200 with walk list metadata.

**Pass criteria:** Correct walk list returned.

---

### CANV-WL-05 | Update walk list name (manager+)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" -d '{"name":"CANV Walk List (renamed)"}' | jq .name
```

**Expected:** HTTP 200, name updated.

**Pass criteria:** Name updated.

---

### CANV-WL-06 | Volunteer cannot create walk list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"vol\",\"turf_id\":\"$TURF_A_ID\"}"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CANV-WL-07 | Volunteer cannot delete walk list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403. Walk list still exists.

---

### CANV-WL-08 | Create walk list with nonexistent turf_id

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"bad turf","turf_id":"00000000-0000-0000-0000-000000000000"}'
```

**Expected:** HTTP 404 or 422.

**Pass criteria:** Non-2xx.

---

## Section 5: Walk List Entries

### CANV-ENT-01 | List walk list entries (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries?limit=50" | jq '.items | length, .items[0]'
```

**Expected:** HTTP 200, paginated entries.

**Pass criteria:** 200. Record first entry id as `$WALK_LIST_ENTRY_ID`.

---

### CANV-ENT-02 | List enriched entries (with voter data)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries/enriched" | jq '.[0]'
```

**Expected:** HTTP 200. Each entry carries voter name + address.

**Pass criteria:** 200. Voter data present.

---

### CANV-ENT-03 | Update entry — mark visited (volunteer+)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries/$WALK_LIST_ENTRY_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"visited"}' | jq .status
```

**Expected:** HTTP 200.

**Pass criteria:** Status updated. (Exact field name may be `status` or similar — adjust after first PATCH.)

---

### CANV-ENT-04 | Update entry — mark not-home

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries/$WALK_LIST_ENTRY_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"not_home"}' | jq .status
```

**Expected:** HTTP 200.

**Pass criteria:** Status updated.

---

### CANV-ENT-05 | Viewer cannot update entry

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries/$WALK_LIST_ENTRY_ID" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" -d '{"status":"visited"}'
```

**Expected:** HTTP 403 (viewer is read-only).

**Pass criteria:** 403.

---

## Section 6: Canvasser assignment

### CANV-ASSIGN-01 | Assign volunteer as canvasser (manager+)

**Steps:**
```bash
QA_VOL_ID="367278371970744389"
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$QA_VOL_ID\"}" | jq .
```

**Expected:** HTTP 201.

**Pass criteria:** Assignment created.

---

### CANV-ASSIGN-02 | List walk list canvassers

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers" | jq .
```

**Expected:** HTTP 200 with volunteer in list.

**Pass criteria:** `$QA_VOL_ID` present.

---

### CANV-ASSIGN-03 | Remove canvasser (manager+)

**Steps:**
```bash
QA_VOL_ID="367278371970744389"
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers/$QA_VOL_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** Removed. Re-add for subsequent tests:
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$QA_VOL_ID\"}"
```

---

### CANV-ASSIGN-04 | Volunteer cannot assign canvassers

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" -d '{"user_id":"fake"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CANV-ASSIGN-05 | Volunteer CAN read canvasser list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers"
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### CANV-ASSIGN-06 | Assigning nonexistent user_id

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/canvassers" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" -d '{"user_id":"9999999999999999999"}'
```

**Expected:** HTTP 404 or 422.

**Pass criteria:** Non-2xx.

---

## Section 7: Door knock recording (happy path — details in phase-10)

### CANV-KNOCK-01 | Record door knock (volunteer+)

**Steps:**
```bash
# Need: voter_id + walk_list_entry_id from the same entry
ENTRY=$(curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries?limit=1" | jq -r '.items[0]')
VOTER_ID=$(echo "$ENTRY" | jq -r .voter_id)
ENTRY_ID=$(echo "$ENTRY" | jq -r .id)

curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/door-knocks" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"voter_id\": \"$VOTER_ID\",
    \"walk_list_entry_id\": \"$ENTRY_ID\",
    \"result_code\": \"supporter\",
    \"notes\": \"CANV-KNOCK-01 shakedown\",
    \"survey_complete\": false
  }" | jq .
```

**Expected:** HTTP 201 with `DoorKnockResponse`.

**Pass criteria:** 201. interaction_id returned.

---

### CANV-KNOCK-02 | Record knock with each result_code value

**Steps:** Repeat CANV-KNOCK-01 with each `DoorKnockResult` value: `not_home`, `refused`, `undecided`, `opposed`, `moved`, `deceased`, `come_back_later`, `inaccessible`. Pick a different entry for each (or reuse same).

**Expected:** Each returns HTTP 201.

**Pass criteria:** All 9 result codes accepted. Any rejection = P1.

---

### CANV-KNOCK-03 | Invalid result_code rejected

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/door-knocks" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"walk_list_entry_id\":\"$ENTRY_ID\",\"result_code\":\"NOT_A_REAL_CODE\"}"
```

**Expected:** HTTP 422.

**Pass criteria:** 422.

---

### CANV-KNOCK-04 | Viewer cannot record knock

**Steps:** Repeat CANV-KNOCK-01 with `$TOKEN_VIEWER_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 8: Delete walk list (stateful — last)

### CANV-WL-DEL-01 | Delete walk list (manager+)

**Steps:** Create a disposable walk list then delete it.
```bash
DISP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"name\":\"CANV Disposable WL\",\"turf_id\":\"$TURF_A_ID\"}" | jq -r .id)

curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$DISP" \
  -H "Authorization: Bearer $TOKEN_MGR_A"

curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MGR_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$DISP"
```

**Expected:** 204 then 404.

**Pass criteria:** Walk list deleted; no longer retrievable.

---

### CANV-WL-DEL-02 | Volunteer cannot delete walk list

Covered by CANV-WL-07.

---

## Section 9: UI — Canvassing hub & map

### CANV-UI-01 | /campaigns/{id}/canvassing renders (desktop)

**Steps:** Browser — log in as qa-manager, navigate to `https://run.civpulse.org/campaigns/$CAMPAIGN_A/canvassing`.

**Expected:** Page shows turf list + walk list grid. No console errors. Leaflet map initializes.

**Pass criteria:** Page loads, turfs visible, walk lists visible.

**Screenshot:** `results/evidence/phase-06/CANV-UI-01-hub.png`.

---

### CANV-UI-02 | Turf list shows all turfs with status badges

**Steps:** On the canvassing hub, verify the turf list card.

**Expected:** Each turf row shows name, status badge (active/paused/completed), voter count or area.

**Pass criteria:** `$TURF_A_ID` visible with correct status.

---

### CANV-UI-03 | Leaflet map renders turf polygons

**Steps:** Inspect map panel — verify `$TURF_A_ID`'s polygon renders on the map with correct boundary.

**Expected:** Polygon drawn at approx (-83.63, 32.84) with 4 visible vertices.

**Pass criteria:** Visible polygon matches boundary.

**Screenshot:** `results/evidence/phase-06/CANV-UI-03-map.png`.

---

### CANV-UI-04 | Click turf polygon shows detail popup

**Steps:** Click the `$TURF_A_ID` polygon on the map.

**Expected:** Popup shows turf name, voter count, "Edit"/"View" buttons.

**Pass criteria:** Popup renders with correct turf name.

---

### CANV-UI-05 | Draw new turf via map polygon tool (manager+)

**Steps:**
1. Click "New Turf" or equivalent draw control
2. Draw a 4-point polygon on the map
3. Enter a name in the dialog
4. Save

**Expected:** Turf created via POST, list refreshes with new turf.

**Pass criteria:** New turf appears in list + map.

**Cleanup:** Delete the UI-created turf via API.

---

### CANV-UI-06 | Turf rename confirmation dialog

**Steps:** Click "Rename" on `$TURF_A_ID` in the list, change name, confirm.

**Expected:** ConfirmDialog shown (for destructive actions only) OR inline edit. Name updates after save.

**Pass criteria:** Name updates; turf list reflects new name.

---

### CANV-UI-07 | Turf delete confirmation dialog

**Steps:** Create a disposable turf via UI, click "Delete", confirm in modal.

**Expected:** ConfirmDialog with "Type turf name to confirm" or similar; confirms → DELETE fires → turf removed from list.

**Pass criteria:** Turf deleted after confirm. Cancel path: turf retained.

---

### CANV-UI-08 | Walk list grid displays all lists

**Steps:** On the canvassing hub, verify the walk list section.

**Expected:** Grid/table shows walk lists with name, turf link, entry count, canvasser count.

**Pass criteria:** `$WALK_LIST_A_ID` visible.

---

### CANV-UI-09 | WalkListGenerateDialog wizard

**Steps:** Click "Generate Walk List" → fill form (select turf, select voter list, name) → Submit.

**Expected:** Dialog with turf dropdown, voter list dropdown, name input. On submit, new walk list created.

**Pass criteria:** Walk list created with entries derived from turf ∩ voter list.

**Screenshot:** `results/evidence/phase-06/CANV-UI-09-wizard.png`.

---

### CANV-UI-10 | Walk list detail page

**Steps:** Click a walk list row → navigate to `/campaigns/$CAMPAIGN_A/canvassing/walk-lists/$WALK_LIST_A_ID`.

**Expected:** Detail view with entries table, canvasser assignments, mini-map showing turf.

**Pass criteria:** Entries visible, canvassers visible.

---

### CANV-UI-11 | Canvasser assignment UI

**Steps:** On walk list detail page, click "Assign Canvasser", select a volunteer, save.

**Expected:** Volunteer appears in canvasser list; DELETE button present.

**Pass criteria:** Assignment reflected after save.

---

### CANV-UI-12 | Walk list rename / delete confirmations

**Steps:** Rename walk list via UI; create disposable and delete via UI.

**Expected:** Rename updates name; delete prompts confirmation and removes from list.

**Pass criteria:** Both flows complete cleanly.

---

### CANV-UI-13 | Household click on entries map (if present)

**Steps:** If entries have a map view, click one household marker.

**Expected:** Popup shows voter name + address + last knock result.

**Pass criteria:** Popup renders; data matches API.

---

## Section 10: Edge cases & scale

### CANV-EDGE-01 | Turf with 0 voters

**Steps:** Create a turf in an empty geographic area (e.g., coordinates in ocean). Create a walk list from it + a voter list.

**Expected:** Walk list created with 0 entries OR 422 "no voters in turf".

**Pass criteria:** Document. No 500 error.

---

### CANV-EDGE-02 | Very large turf (covers all of Macon-Bibb)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"CANV Whole County","boundary":{"type":"Polygon","coordinates":[[[-83.9,32.6],[-83.9,33.0],[-83.3,33.0],[-83.3,32.6],[-83.9,32.6]]]}}'
```

**Expected:** HTTP 201. Turf voters endpoint returns all geocoded voters.

**Pass criteria:** 201; subsequent `/voters` endpoint does not time out (< 5s).

---

### CANV-EDGE-03 | Walk list with large entry count (perf hint)

**Steps:** Create a walk list tied to `CANV-EDGE-02` turf + the largest voter list.

**Expected:** HTTP 201 in < 10s.

**Pass criteria:** Creation completes. Entries endpoint paginates correctly at limit=200.

**Log:** Record entry count + creation latency.

---

### CANV-EDGE-04 | Entries pagination traversal

**Steps:**
```bash
NEXT=""
PAGE=0
while :; do
  PAGE=$((PAGE+1))
  Q="limit=50"
  [ -n "$NEXT" ] && Q="$Q&cursor=$NEXT"
  RES=$(curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
    "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries?$Q")
  echo "page $PAGE -> $(echo "$RES" | jq '.items | length')"
  NEXT=$(echo "$RES" | jq -r '.pagination.next_cursor // empty')
  [ -z "$NEXT" ] && break
  [ $PAGE -ge 20 ] && break
done
```

**Expected:** Each page returns ≤50 items; terminates when `next_cursor` is null.

**Pass criteria:** Full traversal returns expected total count, no infinite loop.

---

### CANV-EDGE-05 | Concurrent entry status update (race probe)

**Steps:** Fire 5 concurrent PATCH requests to the same entry from the volunteer token.
```bash
for i in 1 2 3 4 5; do
  curl -sS -o /dev/null -w "%{http_code} " -X PATCH \
    "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/walk-lists/$WALK_LIST_A_ID/entries/$WALK_LIST_ENTRY_ID" \
    -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d "{\"status\":\"visited\"}" &
done
wait; echo
```

**Expected:** All 5 return 200 (idempotent update) OR 4 × 200 + 1 × 409 (optimistic lock).

**Pass criteria:** No 500s. Final DB state consistent.

---

## Results Template

Save filled to `results/phase-06-results.md`.

### Turf CRUD

| Test ID | Result | Notes |
|---|---|---|
| CANV-TURF-01 | | turf_id: |
| CANV-TURF-02 | | |
| CANV-TURF-03 | | |
| CANV-TURF-04 | | |
| CANV-TURF-05 | | |
| CANV-TURF-06 | | |
| CANV-TURF-07 | | voter count: |
| CANV-TURF-08 | | overlap count: |
| CANV-TURF-09 | | |
| CANV-TURF-10 | | |

### GeoJSON validation

| Test ID | Result | Notes |
|---|---|---|
| CANV-GEO-01 | | |
| CANV-GEO-02 | | |
| CANV-GEO-03 | | |
| CANV-GEO-04 | | |
| CANV-GEO-05 | | |
| CANV-GEO-06 | | |

### Turf RBAC

| Test ID | Result | Notes |
|---|---|---|
| CANV-RBAC-T01 | | |
| CANV-RBAC-T02 | | |
| CANV-RBAC-T03 | | |
| CANV-RBAC-T04 | | |
| CANV-RBAC-T05 | | |

### Walk list CRUD

| Test ID | Result | Notes |
|---|---|---|
| CANV-WL-01 | | walk_list_id: |
| CANV-WL-02 | | |
| CANV-WL-03 | | |
| CANV-WL-04 | | |
| CANV-WL-05 | | |
| CANV-WL-06 | | |
| CANV-WL-07 | | |
| CANV-WL-08 | | |

### Walk list entries

| Test ID | Result | Notes |
|---|---|---|
| CANV-ENT-01 | | entry_id: |
| CANV-ENT-02 | | |
| CANV-ENT-03 | | |
| CANV-ENT-04 | | |
| CANV-ENT-05 | | |

### Canvasser assignment

| Test ID | Result | Notes |
|---|---|---|
| CANV-ASSIGN-01 | | |
| CANV-ASSIGN-02 | | |
| CANV-ASSIGN-03 | | |
| CANV-ASSIGN-04 | | |
| CANV-ASSIGN-05 | | |
| CANV-ASSIGN-06 | | |

### Door knock

| Test ID | Result | Notes |
|---|---|---|
| CANV-KNOCK-01 | | |
| CANV-KNOCK-02 | | 9 result codes |
| CANV-KNOCK-03 | | |
| CANV-KNOCK-04 | | |

### Delete walk list

| Test ID | Result | Notes |
|---|---|---|
| CANV-WL-DEL-01 | | |
| CANV-WL-DEL-02 | | covered |

### UI

| Test ID | Result | Notes |
|---|---|---|
| CANV-UI-01 | | screenshot: |
| CANV-UI-02 | | |
| CANV-UI-03 | | screenshot: |
| CANV-UI-04 | | |
| CANV-UI-05 | | |
| CANV-UI-06 | | |
| CANV-UI-07 | | |
| CANV-UI-08 | | |
| CANV-UI-09 | | screenshot: |
| CANV-UI-10 | | |
| CANV-UI-11 | | |
| CANV-UI-12 | | |
| CANV-UI-13 | | |

### Edge cases

| Test ID | Result | Notes |
|---|---|---|
| CANV-EDGE-01 | | |
| CANV-EDGE-02 | | latency: |
| CANV-EDGE-03 | | entries: , latency: |
| CANV-EDGE-04 | | total pages: |
| CANV-EDGE-05 | | |

### Summary

- Total tests: 54
- PASS: ___ / 54
- **P0 candidates:** any unauthorized write from volunteer/viewer, any 500 in RBAC negative tests.
- **P1 candidates:** door knock result code rejection, walk list entry pagination failure.

## Cleanup

- Delete all turfs created in this phase EXCEPT shared fixtures:
  ```bash
  # Delete disposable/test turfs
  for t in $TURF_A_ID $CANV_EDGE_02_TURF_ID; do
    curl -sS -o /dev/null -X DELETE \
      -H "Authorization: Bearer $TOKEN_MGR_A" \
      "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/turfs/$t"
  done
  ```
- Delete all walk lists created in this phase.
- Remove canvasser assignments on any retained walk lists.
- Verify via DB:
  ```bash
  psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c \
    "SELECT count(*) FROM turfs WHERE name LIKE 'CANV %' AND deleted_at IS NULL;"
  # expect: 0
  psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c \
    "SELECT count(*) FROM walk_lists WHERE name LIKE 'CANV %' AND deleted_at IS NULL;"
  # expect: 0
  ```
- Door knock interactions are retained (audit trail — do not purge).
