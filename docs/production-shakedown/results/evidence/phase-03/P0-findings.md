# Phase 03 — P0 Cross-Tenant Isolation Findings

**Discovered:** 2026-04-05
**Executor:** Claude (Opus 4.6)
**Status:** ⚠️ P0 — LAUNCH BLOCKERS

## Summary

Three cross-tenant isolation breaches confirmed via Org A owner token writing data that references Org B resources.

## Finding 1 — ISO-BODYINJ-B02 (P0)

**Attack:** Org A user adds an Org B voter to an Org A voter list.

**Request:**
```
POST /api/v1/campaigns/{ORG_A_CAMPAIGN_ID}/lists/{ORG_A_LIST_ID}/members
Authorization: Bearer <qa-owner@civpulse.org token>
Body: {"voter_ids":["6499ac69-7cc7-4710-a465-189ad98dc7c8"]}  # TestB1 voter from Org B
```

**Response:** `HTTP 204 No Content` (success)

**DB evidence (pre-cleanup):**
```
voter_list_id                        | voter_id                             | campaign_id (via voter)
4186d781-3a90-420b-a265-ef0420cc5589 | 6499ac69-7cc7-4710-a465-189ad98dc7c8 | 1729cac1-e802-4bd2-8b8d-20fbc07bbfb4 (Org B)
```

Org A's voter list `4186d781...` contained voter `6499ac69...` whose `campaign_id` belongs to Org B.

**Impact:** A voter list in Org A can contain voter FKs pointing to Org B voters. Downstream use (call list, walk list generation) may leak Org B voter personal data to Org A operators.

**Expected behavior:** Endpoint should validate every voter_id belongs to the path campaign. Should return 404/422 when any voter_id is cross-tenant.

**Code path:** `POST /api/v1/campaigns/{campaign_id}/lists/{list_id}/members`

**Cleanup applied:** `DELETE FROM voter_list_members WHERE voter_list_id='4186...' AND voter_id='6499...'`

---

## Finding 2 — ISO-BODYINJ-B04 (P0)

**Attack:** Org A user creates a call list in Org A campaign pointing to Org B's voter list.

**Request:**
```
POST /api/v1/campaigns/{ORG_A_CAMPAIGN_ID}/call-lists
Authorization: Bearer <qa-owner@civpulse.org token>
Body: {"name":"Smuggled Call List","voter_list_id":"67d8fbcd-cf2a-492b-9255-337de0405add"}  # Org B voter list
```

**Response:** `HTTP 201 Created`
```json
{
  "id":"5eee35b7-34e8-4a81-8652-173734982f05",
  "name":"Smuggled Call List",
  "voter_list_id":"67d8fbcd-cf2a-492b-9255-337de0405add",
  ...
}
```

**DB evidence:**
```
id                                   | campaign_id (Org A)                  | voter_list_id (Org B)
5eee35b7-34e8-4a81-8652-173734982f05 | 06d710c8-32ce-44ae-bbab-7fcc72aab248 | 67d8fbcd-cf2a-492b-9255-337de0405add
```

**Impact:** Created call_lists row in Org A's campaign referencing Org B's voter_list. When the call list is populated (append-from-list), it would enumerate Org B's voters into an Org A call queue, exposing Org B PII (name, phone) to Org A operators.

**Expected behavior:** Endpoint should validate voter_list_id belongs to the path campaign. Should return 422.

**Code path:** `POST /api/v1/campaigns/{campaign_id}/call-lists`

**Cleanup applied:** `DELETE FROM call_lists WHERE id='5eee...'`

---

## Finding 3 — ISO-REL-G03 (P0)

**Attack:** Org A user creates a voter_interaction row on an Org B voter from Org A's campaign.

**Request:**
```
POST /api/v1/campaigns/{ORG_A_CAMPAIGN_ID}/voters/{ORG_B_VOTER_ID}/interactions
Authorization: Bearer <qa-owner@civpulse.org token>
Body: {"type":"note","content":"test"}
```

**Response:** `HTTP 201 Created`
```json
{
  "id":"a9999d02-73d8-45a0-a439-feee0c01193e",
  "campaign_id":"06d710c8-32ce-44ae-bbab-7fcc72aab248",
  "voter_id":"6499ac69-7cc7-4710-a465-189ad98dc7c8",
  "type":"note",
  "created_by":"367278364538437701",
  ...
}
```

**DB evidence:**
```
id                                   | campaign_id (Org A)                  | voter_id (Org B)
a9999d02-73d8-45a0-a439-feee0c01193e | 06d710c8-32ce-44ae-bbab-7fcc72aab248 | 6499ac69-7cc7-4710-a465-189ad98dc7c8
```

**Impact:** Cross-tenant write — an interaction record links Org A campaign to an Org B voter. An Org A user can log touches on Org B voters without detection.

**Expected behavior:** Endpoint should 404 when voter_id is not in the path campaign (fails RLS check).

**Code path:** `POST /api/v1/campaigns/{campaign_id}/voters/{voter_id}/interactions`

**Cleanup applied:** `DELETE FROM voter_interactions WHERE id='a9999...'`

---

## Root cause hypothesis

All three breaches share a pattern: the handler trusts a FK/UUID from the request body or path segment **without verifying that row belongs to the path `campaign_id`**. RLS enforces tenant boundaries via `app.current_campaign_id`, but writes accept arbitrary foreign keys when the runtime user is a superuser (BYPASSRLS role) OR when the handler writes without a proper `check_campaign_contains(table, id)` guard.

Recommended fix: add validation in service layer that every FK in the request body resolves under the path campaign_id context. Could be enforced with a PostgreSQL CHECK constraint or a pre-write SELECT with RLS engaged.

## Scope

Tested from Org A owner token (qa-owner@civpulse.org). Reverse direction (Org B → Org A) not tested for these three endpoints but likely exhibits the same behavior since the code paths are symmetric.
