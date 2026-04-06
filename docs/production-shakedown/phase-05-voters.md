# Phase 05: Voters

**Prefix:** `VTR`
**Depends on:** phase-00, phase-04
**Estimated duration:** 60 min
**Agents required:** 1

## Purpose

Exhaustively test the voter management surface: CRUD, search/filter, contacts (phones/emails/addresses), tags, lists (static + dynamic), interactions, DNC entries, and CSV import. Voters are the highest-volume tenant-scoped resource and the richest filter surface in the app — correctness here gates canvassing, phone banking, and nearly every field workflow.

## Prerequisites

- Phase 00 complete: 10 seed voters exist in `$CAMPAIGN_A`, 1 tag, 1 list
- Phase 04 complete: Campaign CRUD + member wiring verified
- JWT tokens for all Org A roles:
  - `$TOKEN_A` (owner), `$TOKEN_ADMIN_A`, `$TOKEN_MGR_A`, `$TOKEN_VOL_A`, `$TOKEN_VIEWER_A`
- `$CAMPAIGN_A` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`

### Known API surface

| Endpoint | Role | Notes |
|---|---|---|
| `GET /campaigns/{id}/voters` | volunteer+ | Cursor paginated, query filters |
| `POST /campaigns/{id}/voters` | manager+ | Manual create |
| `GET /campaigns/{id}/voters/{voter_id}` | volunteer+ | — |
| `PATCH /campaigns/{id}/voters/{voter_id}` | manager+ | Partial update |
| `DELETE /campaigns/{id}/voters/{voter_id}` | manager+ | 409 if FKs exist |
| `POST /campaigns/{id}/voters/search` | volunteer+ | Body-based advanced filter |
| `GET /campaigns/{id}/voters/distinct-values` | volunteer+ | Whitelisted fields only |
| `GET /campaigns/{id}/voters/{voter_id}/contacts` | volunteer+ | Grouped phones/emails/addresses |
| `POST/PATCH/DELETE /campaigns/{id}/voters/{voter_id}/phones[/{phone_id}]` | manager+ | — |
| `POST/PATCH/DELETE /campaigns/{id}/voters/{voter_id}/emails[/{email_id}]` | manager+ | — |
| `POST/PATCH/DELETE /campaigns/{id}/voters/{voter_id}/addresses[/{address_id}]` | manager+ | — |
| `GET/POST /campaigns/{id}/tags` | volunteer+ list, manager+ mutate | voter_tags module |
| `PATCH/DELETE /campaigns/{id}/tags/{tag_id}` | manager+ | — |
| `POST /campaigns/{id}/voters/{voter_id}/tags` | volunteer+ | Assign tag |
| `DELETE /campaigns/{id}/voters/{voter_id}/tags/{tag_id}` | volunteer+ | — |
| `GET /campaigns/{id}/voters/{voter_id}/tags` | volunteer+ | — |
| `GET /campaigns/{id}/lists` | volunteer+ | voter_lists module |
| `POST /campaigns/{id}/lists` | manager+ | list_type: "static" or "dynamic" |
| `GET /campaigns/{id}/lists/{list_id}` | volunteer+ | — |
| `PATCH /campaigns/{id}/lists/{list_id}` | manager+ | — |
| `DELETE /campaigns/{id}/lists/{list_id}` | manager+ | — |
| `GET /campaigns/{id}/lists/{list_id}/voters` | volunteer+ | — |
| `POST /campaigns/{id}/lists/{list_id}/members` | manager+ | Static only |
| `DELETE /campaigns/{id}/lists/{list_id}/members` | manager+ | Static only |
| `GET/POST/PATCH/DELETE /campaigns/{id}/voters/{voter_id}/interactions[/{id}]` | volunteer+ | — |
| `GET/POST /campaigns/{id}/dnc` | manager+ | — |
| `POST /campaigns/{id}/dnc/import` | manager+ | — |
| `POST /campaigns/{id}/dnc/check` | volunteer+ | — |
| `DELETE /campaigns/{id}/dnc/{dnc_id}` | manager+ | — |
| `POST /campaigns/{id}/imports` | admin+ | CSV upload |
| `POST /campaigns/{id}/imports/{id}/detect` | admin+ | Column detection |
| `POST /campaigns/{id}/imports/{id}/confirm` | admin+ | Apply mapping |
| `POST /campaigns/{id}/imports/{id}/cancel` | admin+ | — |
| `GET /campaigns/{id}/imports/{id}` | admin+ | Progress polling |
| `DELETE /campaigns/{id}/imports/{id}` | admin+ | — |
| `GET /campaigns/{id}/imports` | admin+ | List |
| `GET /campaigns/{id}/imports/templates` | admin+ | Saved mapping templates |

---

## Section 1: Voter CRUD

### VTR-CRUD-01 | List voters as volunteer (minimum-read role)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=50" | jq '.items | length, .pagination'
```

**Expected:** HTTP 200. Array with ≥10 seed voters. `pagination` with `next_cursor`/`has_more`.

**Pass criteria:** Shape matches `PaginatedResponse[VoterResponse]`. Seed voters `TestA1..TestA10` visible.

---

### VTR-CRUD-02 | List voters — viewer gets 403 (volunteer+ required)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-CRUD-03 | List voters — default page_size applies

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" | jq '.items | length'
```

**Expected:** ≤50 items (default limit=50 per source).

**Pass criteria:** Length ≤ 50.

---

### VTR-CRUD-04 | List voters with limit=200 (upper bound)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=200"
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### VTR-CRUD-05 | List voters with limit=201 rejected

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=201"
```

**Expected:** HTTP 422 (le=200 validator).

**Pass criteria:** 422.

---

### VTR-CRUD-06 | List voters with limit=0 rejected

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=0"
```

**Expected:** HTTP 422 (ge=1 validator).

**Pass criteria:** 422.

---

### VTR-CRUD-07 | Cursor pagination traverses all voters

**Steps:**
```bash
PAGE1=$(curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=5")
NEXT=$(echo "$PAGE1" | jq -r '.pagination.next_cursor')
echo "Page 1 count: $(echo "$PAGE1" | jq '.items | length')"
echo "Next cursor: $NEXT"
if [ "$NEXT" != "null" ]; then
  curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
    "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=5&cursor=$NEXT" | jq '.items | length, .pagination.has_more'
fi
```

**Expected:** Page 1 has 5 items. If more voters exist, page 2 fetchable via cursor.

**Pass criteria:** Distinct voter IDs between pages.

---

### VTR-CRUD-08 | Beyond-last-page returns empty items, has_more=false

**Steps:**
```bash
# Keep advancing the cursor until has_more=false
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=200" | jq '.pagination'
```

**Expected:** `has_more: false` when all voters returned in one page. Further requests with a cursor beyond the end return empty array.

**Pass criteria:** Pagination terminates cleanly.

---

### VTR-CRUD-09 | GET single voter returns full schema

**Steps:**
```bash
VID=$(curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=1" | jq -r '.items[0].id')
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$VID" | jq 'keys | length'
```

**Expected:** HTTP 200. Response includes core + registration + mailing + political + demographic fields (40+ keys).

**Pass criteria:** ≥30 keys in response. `id == $VID`.

---

### VTR-CRUD-10 | GET non-existent voter returns 404

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/00000000-0000-0000-0000-000000000000"
cat /tmp/body.json
```

**Expected:** HTTP 404.

**Pass criteria:** 404 with voter-not-found detail.

---

### VTR-CRUD-11 | Create voter as manager

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{
    "first_name": "Phase05",
    "last_name": "Manual",
    "date_of_birth": "1985-07-15",
    "party": "Democrat",
    "registration_line1": "100 Test St",
    "registration_city": "Macon",
    "registration_state": "GA",
    "registration_zip": "31201"
  }' | tee /tmp/voter.json | jq '.id, .first_name, .source_type'
NEW_VOTER=$(jq -r .id /tmp/voter.json)
echo "NEW_VOTER=$NEW_VOTER"
```

**Expected:** HTTP 201 with `first_name: "Phase05"`, `source_type: "manual"`.

**Pass criteria:** 201 + UUID returned.

**Record:** `$NEW_VOTER` for downstream tests.

---

### VTR-CRUD-12 | Create voter — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Nope","last_name":"Volunteer"}'
```

**Expected:** HTTP 403 (manager+ required).

**Pass criteria:** 403.

---

### VTR-CRUD-13 | Create voter — viewer gets 403

**Steps:** Same with `$TOKEN_VIEWER_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-CRUD-14 | Create voter — all fields optional (empty body)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{}'
cat /tmp/body.json | jq .id
```

**Expected:** HTTP 201 with a voter id (all VoterCreateRequest fields are optional).

**Pass criteria:** 201 — or if the service enforces a required first_name/last_name, document as 422.

**Record:** If created, add to cleanup list.

---

### VTR-CRUD-15 | Create voter rejects malformed date_of_birth

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Bad","date_of_birth":"15/07/1985"}'
```

**Expected:** HTTP 422.

**Pass criteria:** 422.

---

### VTR-CRUD-16 | Update voter (PATCH) as manager

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"party":"Independent","precinct":"P-05"}' | jq '.party, .precinct'
```

**Expected:** HTTP 200 with echoed values.

**Pass criteria:** Fields updated.

---

### VTR-CRUD-17 | PATCH voter — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"party":"Libertarian"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-CRUD-18 | DELETE voter — manager

**Steps:**
```bash
TMP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"first_name":"Delete","last_name":"Me"}' | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$TMP" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
# Verify gone
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$TMP"
```

**Expected:** DELETE → 204. Subsequent GET → 404.

**Pass criteria:** 204 then 404.

---

### VTR-CRUD-19 | DELETE voter — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-CRUD-20 | DELETE voter with related records returns 409

**Purpose:** If a voter has interactions/contacts tying to it, delete should either cascade or 409.

**Steps:** Create voter, add a phone contact, try to delete voter.
```bash
TMP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"first_name":"HasPhone","last_name":"Voter"}' | jq -r .id)
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$TMP/phones" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"value":"+14785551234","type":"mobile"}'
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$TMP" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
cat /tmp/body.json
```

**Expected:** Either HTTP 204 (cascade delete via FK ON DELETE) or HTTP 409 with "related records" detail. Document actual behaviour.

**Pass criteria:** No 500. Clean success or clean 409.

**Cleanup:** If 409, delete phone first, then voter.

---

## Section 2: Voter search & filters

### VTR-SEARCH-01 | Search voters by name (partial match)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?search=TestA&limit=50" | jq '.items | length'
```

**Expected:** ≥10 matches (seed voters TestA1..TestA10).

**Pass criteria:** Count ≥10.

---

### VTR-SEARCH-02 | Filter by party

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?party=Democrat" | jq '[.items[] | select(.party != "Democrat")] | length'
```

**Expected:** Zero voters with a party OTHER than Democrat (filter works).

**Pass criteria:** Count = 0.

---

### VTR-SEARCH-03 | Filter by state

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?state=GA" | jq '.items | length'
```

**Expected:** ≥10 (all seed voters are GA).

**Pass criteria:** Count ≥ seed voter count.

---

### VTR-SEARCH-04 | Filter by has_phone=true

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?has_phone=true" | jq '.items | length'
```

**Expected:** Voters with at least one phone row. If VTR-CRUD-20's phone still exists, ≥1. Otherwise 0.

**Pass criteria:** Responds 200 with `items` array.

---

### VTR-SEARCH-05 | Search + party combo filter (AND semantics)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?search=TestA&party=Republican" | jq '.items | length'
```

**Expected:** Subset of TestA voters whose party is Republican (roughly 1/3 of seed set).

**Pass criteria:** Filters combine via AND.

---

### VTR-SEARCH-06 | POST /voters/search with body filter

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/search" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"filters":{"party":"Democrat","registration_state":"GA"},"limit":50,"sort_by":"last_name","sort_dir":"asc"}' | jq '.items | length, .items[0].last_name'
```

**Expected:** HTTP 200. Results filtered + sorted.

**Pass criteria:** Items array sorted by last_name asc.

---

### VTR-SEARCH-07 | POST /voters/search with age range

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/search" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"filters":{"age_min":18,"age_max":120},"limit":200}' | jq '[.items[] | select(.age != null and (.age < 18 or .age > 120))] | length'
```

**Expected:** 0 voters outside the range.

**Pass criteria:** Count = 0.

---

### VTR-SEARCH-08 | POST /voters/search with OR logic

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/search" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"filters":{"parties":["Democrat","Republican"],"logic":"OR"},"limit":50}' | jq '.items | length'
```

**Expected:** HTTP 200 with voters matching Democrat OR Republican.

**Pass criteria:** Response shape valid; all returned voters in {Democrat, Republican}.

---

### VTR-SEARCH-09 | POST /voters/search with propensity filter

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/search" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"filters":{"propensity_general_min":50,"propensity_general_max":100},"limit":50}' | jq '[.items[] | select(.propensity_general != null and .propensity_general < 50)] | length'
```

**Expected:** 0 results with propensity_general < 50.

**Pass criteria:** Count = 0.

---

### VTR-SEARCH-10 | POST /voters/search rejects propensity > 100

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/search" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"filters":{"propensity_general_max":200}}'
```

**Expected:** HTTP 422 (ge=0, le=100 on the field).

**Pass criteria:** 422.

---

### VTR-SEARCH-11 | POST /voters/search with bogus logic value

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/search" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"filters":{"logic":"XOR"}}'
```

**Expected:** HTTP 422 (pattern ^(AND|OR)$).

**Pass criteria:** 422.

---

### VTR-SEARCH-12 | GET /voters/distinct-values with whitelisted field

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/distinct-values?fields=ethnicity,spoken_language" | jq .
```

**Expected:** HTTP 200 with distinct values + counts per field.

**Pass criteria:** 200.

---

### VTR-SEARCH-13 | distinct-values rejects non-whitelisted field

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/distinct-values?fields=ssn,password"
cat /tmp/body.json
```

**Expected:** HTTP 400 with "Fields not allowed" detail.

**Pass criteria:** 400. Whitelist enforced.

**Failure meaning:** If 200 returned, P1 data exposure via arbitrary column.

---

## Section 3: Voter contacts (phones, emails, addresses)

### VTR-CTC-01 | GET voter contacts returns grouped structure

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/contacts" | jq 'keys'
```

**Expected:** Keys `["addresses","emails","phones"]` (each an array).

**Pass criteria:** Three-key shape.

---

### VTR-CTC-02 | Add phone to voter

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/phones" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"value":"+14785551001","type":"mobile","is_primary":true}' | tee /tmp/phone.json | jq '.id, .value'
PHONE_ID=$(jq -r .id /tmp/phone.json)
```

**Expected:** HTTP 201 with phone id.

**Pass criteria:** 201 + UUID.

---

### VTR-CTC-03 | Add phone — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/phones" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"value":"+14785551002"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-CTC-04 | Duplicate phone (same value + voter + campaign) rejected

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/phones" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"value":"+14785551001","type":"home"}'
cat /tmp/body.json
```

**Expected:** HTTP 409 (unique constraint on phone+voter+campaign).

**Pass criteria:** 409. Document actual error if different.

---

### VTR-CTC-05 | PATCH phone contact

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/phones/$PHONE_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"type":"work","is_primary":false}' | jq '.type, .is_primary'
```

**Expected:** HTTP 200 with updated fields.

**Pass criteria:** 200.

---

### VTR-CTC-06 | DELETE phone contact

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/phones/$PHONE_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VTR-CTC-07 | Add email to voter

**Steps:**
```bash
EMAIL_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/emails" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"value":"voter@example.com","is_primary":true}' | jq -r .id)
echo "EMAIL_ID=$EMAIL_ID"
```

**Expected:** HTTP 201.

**Pass criteria:** 201.

---

### VTR-CTC-08 | PATCH email contact

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/emails/$EMAIL_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"type":"work"}' | jq .type
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### VTR-CTC-09 | DELETE email contact

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/emails/$EMAIL_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VTR-CTC-10 | Add address to voter

**Steps:**
```bash
ADDR_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/addresses" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"address_line1":"200 Main St","city":"Macon","state":"GA","zip_code":"31201","is_primary":true}' | jq -r .id)
echo "ADDR_ID=$ADDR_ID"
```

**Expected:** HTTP 201 with address id.

**Pass criteria:** 201.

---

### VTR-CTC-11 | PATCH address contact

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/addresses/$ADDR_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"address_line2":"Apt 2B"}' | jq .address_line2
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### VTR-CTC-12 | Address requires city/state/zip

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/addresses" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"address_line1":"Incomplete"}'
```

**Expected:** HTTP 422 (city, state, zip_code required).

**Pass criteria:** 422.

---

### VTR-CTC-13 | DELETE address contact

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/addresses/$ADDR_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

## Section 4: Voter tags

### VTR-TAG-01 | List tags as volunteer

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags" | jq '. | length, .[].name'
```

**Expected:** HTTP 200. Includes "HighPropensity" tag from phase-00 seed.

**Pass criteria:** Seed tag present.

---

### VTR-TAG-02 | Create tag as volunteer (per source, volunteer+ can create)

**Steps:**
```bash
TAG_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"name":"Phase05-Tag"}' | jq -r .id)
echo "TAG_ID=$TAG_ID"
```

**Expected:** HTTP 201 with UUID.

**Pass criteria:** 201.

---

### VTR-TAG-03 | Update tag — requires manager+

**Steps:**
```bash
# Volunteer should get 403
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags/$TAG_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"name":"Renamed"}'

# Manager should get 200
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags/$TAG_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"Phase05-Renamed"}' | jq .name
```

**Expected:** Volunteer 403, manager 200.

**Pass criteria:** Both outcomes match.

---

### VTR-TAG-04 | Assign tag to voter (volunteer+)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/tags" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"tag_id\":\"$TAG_ID\"}" | jq .
```

**Expected:** HTTP 201 or 200.

**Pass criteria:** 2xx.

---

### VTR-TAG-05 | List tags on a voter

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/tags" | jq '[.[].id] | index("'$TAG_ID'")'
```

**Expected:** Non-null (tag is present in response).

**Pass criteria:** Tag listed.

---

### VTR-TAG-06 | Remove tag from voter

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/tags/$TAG_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VTR-TAG-07 | DELETE tag — manager+

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags/$TAG_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204. Tag no longer in list:
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags" | jq '[.[].id] | index("'$TAG_ID'")'
# expect null
```

---

### VTR-TAG-08 | DELETE tag — volunteer gets 403

**Steps:**
```bash
# Re-create for test
TAG2=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"name":"VolDelTest"}' | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/tags/$TAG2" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

**Cleanup:** Delete with manager token.

---

## Section 5: Voter lists

### VTR-LIST-01 | List voter lists (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists" | jq '. | length'
```

**Expected:** HTTP 200. Includes "QA Seed List" from phase-00.

**Pass criteria:** ≥1 list returned.

---

### VTR-LIST-02 | Create static list as manager

**Steps:**
```bash
LIST_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"Phase05 Static","description":"test","list_type":"static"}' | jq -r .id)
echo "LIST_ID=$LIST_ID"
```

**Expected:** HTTP 201 with list id.

**Pass criteria:** 201.

---

### VTR-LIST-03 | Create list — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"name":"NoVol","list_type":"static"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-LIST-04 | Create dynamic list with filter_query

**Steps:**
```bash
DYN_LIST=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"Phase05 Dynamic","list_type":"dynamic","filter_query":{"party":"Democrat","logic":"AND"}}' | jq -r .id)
echo "DYN_LIST=$DYN_LIST"
```

**Expected:** HTTP 201.

**Pass criteria:** 201.

---

### VTR-LIST-05 | GET single list returns filter_query as JSON string

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$DYN_LIST" | jq '.list_type, .filter_query'
```

**Expected:** `list_type: "dynamic"`, `filter_query` is a JSON-encoded string (per field_serializer).

**Pass criteria:** filter_query is a string containing `"party":"Democrat"`.

---

### VTR-LIST-06 | Add voters to static list

**Steps:**
```bash
# Grab 3 voter IDs
IDS=$(curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?limit=3" | jq '[.items[].id]')
echo "{\"voter_ids\":$IDS}" > /tmp/add.json
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$LIST_ID/members" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d @/tmp/add.json
```

**Expected:** HTTP 2xx (201 or 204).

**Pass criteria:** 2xx.

---

### VTR-LIST-07 | GET list members

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$LIST_ID/voters" | jq '.items | length'
```

**Expected:** HTTP 200 with 3 voters.

**Pass criteria:** Count matches added voters.

---

### VTR-LIST-08 | Remove voters from static list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$LIST_ID/members" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d @/tmp/add.json
```

**Expected:** HTTP 2xx.

**Pass criteria:** List now has 0 members.

---

### VTR-LIST-09 | PATCH list metadata

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$LIST_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"description":"Updated desc"}' | jq .description
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### VTR-LIST-10 | DELETE list as manager

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$LIST_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/lists/$DYN_LIST" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204 both.

**Pass criteria:** 204.

---

## Section 6: Voter interactions

### VTR-INT-01 | Create an interaction as volunteer

**Steps:**
```bash
INT_ID=$(curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/interactions" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"interaction_type":"canvass","outcome":"spoke","notes":"Friendly conversation"}' | jq -r .id)
echo "INT_ID=$INT_ID"
```

**Expected:** HTTP 201 (or 200) with interaction id.

**Pass criteria:** 2xx + UUID.

---

### VTR-INT-02 | List interactions for a voter (timeline)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/interactions" | jq '.items | length, .items[0].notes'
```

**Expected:** HTTP 200. ≥1 item.

**Pass criteria:** Just-created interaction present.

---

### VTR-INT-03 | PATCH interaction

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/interactions/$INT_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"notes":"Updated note"}' | jq .notes
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### VTR-INT-04 | DELETE interaction

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/interactions/$INT_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VTR-INT-05 | Interactions — viewer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER/interactions"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 7: DNC entries

### VTR-DNC-01 | Create DNC entry as manager

**Steps:**
```bash
DNC_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"phone":"+14785559999","reason":"opted out"}' | jq -r .id)
echo "DNC_ID=$DNC_ID"
```

**Expected:** HTTP 201.

**Pass criteria:** 201.

---

### VTR-DNC-02 | List DNC entries — manager+

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MGR_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" | jq '. | length'
```

**Expected:** HTTP 200 with ≥1 entry.

**Pass criteria:** 200.

---

### VTR-DNC-03 | List DNC — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VTR-DNC-04 | Check DNC by phone (volunteer+)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/check" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"phone":"+14785559999"}' | jq .
```

**Expected:** HTTP 200 with `is_dnc: true` (or equivalent field).

**Pass criteria:** Phone flagged as DNC.

---

### VTR-DNC-05 | Check DNC for non-DNC phone

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/check" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"phone":"+14785550000"}' | jq .
```

**Expected:** HTTP 200 with is_dnc (or equivalent) false.

**Pass criteria:** Phone NOT flagged.

---

### VTR-DNC-06 | DELETE DNC entry (manager+)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/$DNC_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VTR-DNC-07 | DELETE DNC — volunteer gets 403

**Steps:** Create fresh DNC as manager, attempt delete as volunteer.
```bash
TMP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"phone":"+14785558888","reason":"test"}' | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/$TMP" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403. Cleanup: delete as manager.

---

## Section 8: Voter CSV import

The import pipeline is 4-phase: initiate → detect → confirm → background process. Polling GET for progress, and POST /cancel to abort.

### VTR-IMP-01 | Initiate CSV import (admin+)

**Steps:**
```bash
cat > /tmp/voters-import.csv <<CSV
first_name,last_name,party,city,state,zip_code
Alice,Imported,Democrat,Macon,GA,31201
Bob,Imported,Republican,Macon,GA,31201
Carol,Imported,Independent,Atlanta,GA,30301
CSV

IMP_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -F "file=@/tmp/voters-import.csv" | jq -r .id)
echo "IMP_ID=$IMP_ID"
```

**Expected:** HTTP 200/201 with import job id.

**Pass criteria:** UUID returned.

---

### VTR-IMP-02 | Initiate import — manager gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -F "file=@/tmp/voters-import.csv"
```

**Expected:** HTTP 403 (admin+ required).

**Pass criteria:** 403.

---

### VTR-IMP-03 | Detect columns

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$IMP_ID/detect" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{}' | jq .
```

**Expected:** HTTP 200 with `detected_columns` (list of source headers) + suggested mappings.

**Pass criteria:** Response contains column info.

---

### VTR-IMP-04 | Confirm mapping and start processing

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$IMP_ID/confirm" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"mapping":{"first_name":"first_name","last_name":"last_name","party":"party","city":"registration_city","state":"registration_state","zip_code":"registration_zip"}}' | jq .
```

**Expected:** HTTP 200/202 with status queued/processing.

**Pass criteria:** Import transitions to processing.

---

### VTR-IMP-05 | Poll import progress

**Steps:**
```bash
for i in 1 2 3 4 5; do
  RESP=$(curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
    "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$IMP_ID")
  STATE=$(echo "$RESP" | jq -r .status)
  PROG=$(echo "$RESP" | jq -r '.processed_rows // .progress // 0')
  echo "poll $i: status=$STATE progress=$PROG"
  [ "$STATE" = "completed" ] && break
  [ "$STATE" = "failed" ] && break
  sleep 2
done
```

**Expected:** Status reaches "completed" (or "succeeded") within 10 seconds for this tiny file.

**Pass criteria:** Terminal state reached without error.

---

### VTR-IMP-06 | Verify voters imported

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?search=Imported&limit=10" | jq '.items | length'
```

**Expected:** 3 new voters (Alice, Bob, Carol).

**Pass criteria:** Count = 3 (or more if prior runs left residue).

---

### VTR-IMP-07 | Initiate + cancel mid-import

**Steps:** Start a new import, cancel before confirm.
```bash
TMP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -F "file=@/tmp/voters-import.csv" | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$TMP/cancel" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
# verify status
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$TMP" | jq .status
```

**Expected:** Cancel returns 200/204. Status becomes "cancelled".

**Pass criteria:** Terminal cancelled state.

---

### VTR-IMP-08 | Initiate with malformed CSV (missing required columns)

**Steps:**
```bash
cat > /tmp/bad.csv <<CSV
unknown_col,another
foo,bar
CSV

BAD=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -F "file=@/tmp/bad.csv" | jq -r .id)

curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$BAD/detect" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" -d '{}' | jq .
```

**Expected:** Detect succeeds but reports no mappable columns, OR confirm-step rejects absent required mapping.

**Pass criteria:** Job does not silently succeed creating junk voters. Document behaviour.

**Cleanup:** Delete import.

---

### VTR-IMP-09 | Upload CSV with invalid date format

**Steps:**
```bash
cat > /tmp/baddate.csv <<CSV
first_name,last_name,date_of_birth
Bad,Date,31/12/1990
CSV

BAD2=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -F "file=@/tmp/baddate.csv" | jq -r .id)
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$BAD2/detect" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" -d '{}'
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$BAD2/confirm" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"mapping":{"first_name":"first_name","last_name":"last_name","date_of_birth":"date_of_birth"}}'
sleep 3
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$BAD2" | jq '.status, .errors, .failed_rows'
```

**Expected:** Status "completed_with_errors" OR individual row error recorded. Malformed row does not succeed.

**Pass criteria:** Error reported for bad row; valid rows (if any) may still import.

**Cleanup:** Delete import.

---

### VTR-IMP-10 | Upload oversized file (if a size limit exists)

**Steps:**
```bash
# Generate ~10MB CSV (tune if limit known)
python3 -c "
print('first_name,last_name,party')
for i in range(200000):
    print(f'Voter{i},Big,Democrat')
" > /tmp/big.csv
ls -lh /tmp/big.csv

curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -F "file=@/tmp/big.csv"
cat /tmp/body.json | head -5
```

**Expected:** Either accepted (upload limit > file size) or HTTP 413/422 with size error.

**Pass criteria:** No 500. Clean accept or clean reject.

**Cleanup:** If accepted, cancel the import to avoid polluting voter data.

---

### VTR-IMP-11 | List imports

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports" | jq '. | length'
```

**Expected:** HTTP 200 with ≥1 import job.

**Pass criteria:** 200.

---

### VTR-IMP-12 | GET mapping templates

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/templates" | jq .
```

**Expected:** HTTP 200 with list of saved templates (may be empty).

**Pass criteria:** 200 with array.

---

### VTR-IMP-13 | DELETE import job

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports/$IMP_ID" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VTR-IMP-14 | Import endpoints — volunteer/manager/viewer all get 403

**Steps:**
```bash
for tok in "$TOKEN_VIEWER_A" "$TOKEN_VOL_A" "$TOKEN_MGR_A"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $tok" \
    "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/imports")
  echo "GET imports -> $code"
done
```

**Expected:** All 3 return 403.

**Pass criteria:** 403/403/403.

---

## Section 9: UI tests

### VTR-UI-01 | Voter list DataTable renders for volunteer

**Steps:** Log in as qa-volunteer via Playwright, navigate to `/campaigns/$CAMPAIGN_A/voters`.

**Expected:** DataTable renders with columns (name, party, city, etc.), filter chip bar above, pagination controls below.

**Pass criteria:** No console errors, table populated.

**Screenshot:** `results/evidence/phase-05/VTR-UI-01-voter-list.png`.

---

### VTR-UI-02 | Voter list filter chips apply

**Steps:** Click a "Party: Democrat" filter chip (or equivalent UI).

**Expected:** Table filters to Democrat voters. URL/query updates.

**Pass criteria:** Only Democrat voters shown.

**Screenshot:** `VTR-UI-02-filtered.png`.

---

### VTR-UI-03 | Voter search input triggers search

**Steps:** Type "TestA" in the search box.

**Expected:** Table filters (debounced) to matching voters.

**Pass criteria:** Seed voters visible after filtering.

---

### VTR-UI-04 | Voter detail page tabs render

**Steps:** Click any voter row → voter detail page. Verify tabs: Overview, Contacts, Tags, History (or equivalent names).

**Expected:** All 4 tabs visible; Overview active by default.

**Pass criteria:** Tabs render. Each clickable without error.

**Screenshot:** `VTR-UI-04-voter-detail.png`.

---

### VTR-UI-05 | Voter detail — Contacts tab shows phones/emails/addresses

**Steps:** Click Contacts tab on voter detail page.

**Expected:** Sections for Phones, Emails, Addresses. Each with add/edit controls visible per role.

**Pass criteria:** All 3 sections rendered.

---

### VTR-UI-06 | Voter detail — Tags tab lists and allows assignment

**Steps:** Click Tags tab. Verify existing tags listed, "Add Tag" control present.

**Expected:** Tag chips, combobox/dropdown to add tag.

**Pass criteria:** Controls present. Volunteer+ can assign.

---

### VTR-UI-07 | Voter detail — History (interactions timeline) renders

**Steps:** Click History tab.

**Expected:** Timeline of interactions, newest-first, with type + outcome + notes + timestamp + user.

**Pass criteria:** Empty state shown if none, else items render.

---

### VTR-UI-08 | Voter create form — volunteer CTA hidden

**Steps:** Log in as qa-volunteer, inspect voter list page.

**Expected:** No "Add Voter" CTA (or CTA disabled) per manager+ write restriction.

**Pass criteria:** UI guard matches API role.

---

### VTR-UI-09 | Voter create form opens as manager

**Steps:** Log in as qa-manager, click "Add Voter" on voter list page.

**Expected:** Inline form or modal with fields (first_name, last_name, party, address fields, etc.).

**Pass criteria:** Form opens.

**Screenshot:** `VTR-UI-09-create-form.png`.

---

### VTR-UI-10 | Voter create form submits and new row appears

**Steps:** Fill first_name="UI", last_name="Created", submit.

**Expected:** POST fires, 201, new voter appears at top of list (or after refresh).

**Pass criteria:** Voter created, visible in list.

**Cleanup:** Delete via API.

---

## Section 10: Cross-role enforcement matrix (compact)

### VTR-ROLE-01 | Viewer blocked from EVERY voter endpoint except... none

**Purpose:** Confirm viewer is locked out of voters (volunteer+ required for reads).

**Steps:**
```bash
for path in \
  "/campaigns/$CAMPAIGN_A/voters" \
  "/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER" \
  "/campaigns/$CAMPAIGN_A/tags" \
  "/campaigns/$CAMPAIGN_A/lists"
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_VIEWER_A" \
    "https://run.civpulse.org/api/v1$path")
  echo "GET $path -> $code"
done
```

**Expected:** All 403.

**Pass criteria:** 403/403/403/403.

---

### VTR-ROLE-02 | Cross-campaign voter access blocked

**Purpose:** Verify requesting voter from another campaign returns 403/404.

**Steps:**
```bash
# Get an Org B voter UUID from phase-00 records
ORG_B_VOTER_ID="<paste from phase-00 seed>"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$ORG_B_VOTER_ID"
```

**Expected:** HTTP 404 (voter not in this campaign).

**Pass criteria:** 404.

**Failure meaning:** Leak — P0. (Deeper coverage in phase-03.)

---

## Results Template

Save to `results/phase-05-results.md`.

### CRUD

| Test ID | Result | Notes |
|---|---|---|
| VTR-CRUD-01 | | |
| VTR-CRUD-02 | | |
| VTR-CRUD-03 | | |
| VTR-CRUD-04 | | |
| VTR-CRUD-05 | | |
| VTR-CRUD-06 | | |
| VTR-CRUD-07 | | |
| VTR-CRUD-08 | | |
| VTR-CRUD-09 | | |
| VTR-CRUD-10 | | |
| VTR-CRUD-11 | | `$NEW_VOTER` = ___ |
| VTR-CRUD-12 | | |
| VTR-CRUD-13 | | |
| VTR-CRUD-14 | | |
| VTR-CRUD-15 | | |
| VTR-CRUD-16 | | |
| VTR-CRUD-17 | | |
| VTR-CRUD-18 | | |
| VTR-CRUD-19 | | |
| VTR-CRUD-20 | | |

### Search & filters

| Test ID | Result | Notes |
|---|---|---|
| VTR-SEARCH-01 | | |
| VTR-SEARCH-02 | | |
| VTR-SEARCH-03 | | |
| VTR-SEARCH-04 | | |
| VTR-SEARCH-05 | | |
| VTR-SEARCH-06 | | |
| VTR-SEARCH-07 | | |
| VTR-SEARCH-08 | | |
| VTR-SEARCH-09 | | |
| VTR-SEARCH-10 | | |
| VTR-SEARCH-11 | | |
| VTR-SEARCH-12 | | |
| VTR-SEARCH-13 | | P1 candidate |

### Contacts

| Test ID | Result | Notes |
|---|---|---|
| VTR-CTC-01 | | |
| VTR-CTC-02 | | |
| VTR-CTC-03 | | |
| VTR-CTC-04 | | |
| VTR-CTC-05 | | |
| VTR-CTC-06 | | |
| VTR-CTC-07 | | |
| VTR-CTC-08 | | |
| VTR-CTC-09 | | |
| VTR-CTC-10 | | |
| VTR-CTC-11 | | |
| VTR-CTC-12 | | |
| VTR-CTC-13 | | |

### Tags

| Test ID | Result | Notes |
|---|---|---|
| VTR-TAG-01 | | |
| VTR-TAG-02 | | |
| VTR-TAG-03 | | |
| VTR-TAG-04 | | |
| VTR-TAG-05 | | |
| VTR-TAG-06 | | |
| VTR-TAG-07 | | |
| VTR-TAG-08 | | |

### Lists

| Test ID | Result | Notes |
|---|---|---|
| VTR-LIST-01 | | |
| VTR-LIST-02 | | |
| VTR-LIST-03 | | |
| VTR-LIST-04 | | |
| VTR-LIST-05 | | |
| VTR-LIST-06 | | |
| VTR-LIST-07 | | |
| VTR-LIST-08 | | |
| VTR-LIST-09 | | |
| VTR-LIST-10 | | |

### Interactions

| Test ID | Result | Notes |
|---|---|---|
| VTR-INT-01 | | |
| VTR-INT-02 | | |
| VTR-INT-03 | | |
| VTR-INT-04 | | |
| VTR-INT-05 | | |

### DNC

| Test ID | Result | Notes |
|---|---|---|
| VTR-DNC-01 | | |
| VTR-DNC-02 | | |
| VTR-DNC-03 | | |
| VTR-DNC-04 | | |
| VTR-DNC-05 | | |
| VTR-DNC-06 | | |
| VTR-DNC-07 | | |

### Import

| Test ID | Result | Notes |
|---|---|---|
| VTR-IMP-01 | | |
| VTR-IMP-02 | | |
| VTR-IMP-03 | | |
| VTR-IMP-04 | | |
| VTR-IMP-05 | | |
| VTR-IMP-06 | | |
| VTR-IMP-07 | | |
| VTR-IMP-08 | | |
| VTR-IMP-09 | | |
| VTR-IMP-10 | | |
| VTR-IMP-11 | | |
| VTR-IMP-12 | | |
| VTR-IMP-13 | | |
| VTR-IMP-14 | | |

### UI

| Test ID | Result | Notes |
|---|---|---|
| VTR-UI-01 | | screenshot: |
| VTR-UI-02 | | screenshot: |
| VTR-UI-03 | | |
| VTR-UI-04 | | screenshot: |
| VTR-UI-05 | | |
| VTR-UI-06 | | |
| VTR-UI-07 | | |
| VTR-UI-08 | | |
| VTR-UI-09 | | screenshot: |
| VTR-UI-10 | | |

### Role enforcement

| Test ID | Result | Notes |
|---|---|---|
| VTR-ROLE-01 | | |
| VTR-ROLE-02 | | P0 candidate |

### Summary

- Total tests: 74
- PASS: ___ / 74
- **P0 candidates:** VTR-ROLE-02 (cross-campaign leak), VTR-SEARCH-13 (arbitrary column exposure).

## Cleanup

Delete `$NEW_VOTER` and any test voters created:
```bash
# NEW_VOTER
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$NEW_VOTER" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -o /dev/null -w "delete voter -> %{http_code}\n"

# Imported voters (Alice/Bob/Carol Imported)
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters?search=Imported&limit=100" | jq -r '.items[].id' \
  | while read id; do
      curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/voters/$id" \
        -H "Authorization: Bearer $TOKEN_MGR_A" -o /dev/null -w "$id -> %{http_code}\n"
    done
```

Delete any lingering tags, lists, DNC entries, import jobs created during this phase. Leave the phase-00 seed data intact (`TestA1..TestA10`, "HighPropensity" tag, "QA Seed List").
