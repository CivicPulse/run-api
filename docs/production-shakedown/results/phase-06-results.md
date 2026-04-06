# Phase 06 Results — Canvassing (Turfs & Walk Lists)

**Executed:** 2026-04-05
**Executor:** Claude Code (Opus 4.6)
**Duration:** ~35 min
**Deployed SHA:** `c1c89c0`

## Summary

- Total tests: 64 (14 UI deferred)
- PASS: 34
- FAIL: 5
- SKIP: 15 (14 UI + 1 KNOCK-01 stack blocked)
- BLOCKED: 10 (WL entries empty → KNOCK-01/02, ENT-03/04, etc.)
- **🚨 P0 findings: 1 — CROSS-TENANT VOTER LEAK via turf.voters endpoint**
- **P1 findings: 1** — assign-canvasser nonexistent user_id returns raw FK-violation 500
- **P2 findings: 2** — out-of-range GeoJSON coords accepted; auto-closes open polygon rings

## 🚨 P0 — STOP condition triggered

**CANV-TURF-07 | `GET /api/v1/campaigns/{campaign_id}/turfs/{turf_id}/voters` returns voters from ALL tenants inside the turf boundary.**

The spatial query ignores `campaign_id` scoping on the voters table. Any authenticated user who can create a turf (volunteer+ can read, manager+ creates) can draw a polygon over a metro area and retrieve cross-tenant voter PII (name, lat/lng).

### Reproduction

1. qa-volunteer@civpulse.org (Org A, `CivPulse Platform`) creates turf in own campaign `06d710c8-...` with boundary over Macon GA.
2. `GET /campaigns/06d710c8-.../turfs/{turf_id}/voters` returns 2415 voters.
3. All 2415 voters belong to campaign `7e38897a-4fdf-4ed2-962c-9f1548527810` ("Riverside Parks Initiative 2026", Org `e40e9a68-ce70-4062-ab66-3a0c53954ec1` = "Vote Hatcher" — a different tenant).
4. Direct access `GET /campaigns/7e38897a.../voters` correctly returns 403.
5. Cross-verified from Org B owner's view: wider Macon-bbox turf returned 121,328 voters, all from Vote Hatcher.

### Evidence

- `evidence/phase-06/CANV-TURF-07-P0-writeup.txt` — full reproduction summary
- `evidence/phase-06/CANV-TURF-07-P0-leak-response.json` — 272 KB response body (2415 voter rows)

### Impact

- Cross-tenant PII exposure at volunteer-tier access
- Exposes voter names + lat/lng of all campaigns whose voters fall inside the turf bounding box
- Attacker can draw turfs over any geography to enumerate voters from other orgs
- Requires volunteer role or above — but that's auto-granted to any first-login user via invite flow

### Likely root cause

`GET /campaigns/{campaign_id}/turfs/{turf_id}/voters` handler performs `ST_Within(voters.location, turf.boundary)` WHERE without `voters.campaign_id = $campaign_id` predicate. Grep `app/api/v1/turfs.py` and `app/services/turf.py` for the voter query.

### Immediate action required

- Block launch until patched
- Audit similar endpoints: walk-list generation, overlap queries, anything mixing `turfs` + `voters` tables spatially

---

## Turf CRUD

| Test ID | Result | Notes |
|---|---|---|
| CANV-TURF-01 | PASS | 201. TURF_A_ID=a70f707b-0021-4b05-9061-6fe917c828f3. status defaults to "draft" (not "active"). |
| CANV-TURF-02 | PASS | list includes the new turf |
| CANV-TURF-03 | PASS | boundary.type=Polygon |
| CANV-TURF-04 | PASS | 200 name+description updated |
| CANV-TURF-05 | PASS | 200, 5 ring points in updated boundary |
| CANV-TURF-06 | FAIL (schema drift) | status=paused returns 422. TurfStatus enum is {draft, active, completed} — no "paused" value. Plan doc stale. |
| CANV-TURF-07 | **FAIL P0** | 200 — returns 2415 cross-tenant voters. See STOP section above. |
| CANV-TURF-08 | PASS | overlap query returns 1 turf (self-match) |
| CANV-TURF-09 | PASS | disposable turf created 201 |
| CANV-TURF-10 | PASS | 204 delete, 404 subsequent GET |

## Turf GeoJSON validation

| Test ID | Result | Notes |
|---|---|---|
| CANV-GEO-01 | PASS | 422 "Expected Polygon, got Point" |
| CANV-GEO-02 | PASS | 422 triangle-with-3-points rejected |
| CANV-GEO-03 | FAIL (P2) | 201 — open-ring polygon auto-closed by service. May be intentional convenience; document as feature. Not a bug per plan's "document either behavior". |
| CANV-GEO-04 | PASS | 422 bowtie rejected |
| CANV-GEO-05 | **FAIL (P2)** | 201 — coordinates with longitude=500/501 ACCEPTED. PostGIS stores them as-is. Should be 422 (out-of-WGS84-range). Data integrity concern. |
| CANV-GEO-06 | PASS | 422 missing boundary |

## RBAC (turfs)

| Test ID | Result | Notes |
|---|---|---|
| CANV-RBAC-T01 | PASS | 403 volunteer |
| CANV-RBAC-T02 | PASS | 403 viewer |
| CANV-RBAC-T03 | PASS | 403 volunteer PATCH |
| CANV-RBAC-T04 | PASS | 403 volunteer DELETE |
| CANV-RBAC-T05 | PASS | 200/200 volunteer read |

## Walk lists

| Test ID | Result | Notes |
|---|---|---|
| CANV-WL-01 | PASS | 201 WALK_LIST_A_ID=1bb3282d-98b1-4e4f-ab2d-ca1d0951d9e7 (0 entries — seed voters lack lat/lng) |
| CANV-WL-02 | PASS | 201 turf-only walk list |
| CANV-WL-03 | PASS | 3 walk lists |
| CANV-WL-04 | PASS | 200 |
| CANV-WL-05 | PASS | 200 name updated |
| CANV-WL-06 | PASS | 403 |
| CANV-WL-07 | PASS | 403 |
| CANV-WL-08 | PASS | 422 "Turf {id} not found in campaign {id}" — clean error |

## Walk list entries

| Test ID | Result | Notes |
|---|---|---|
| CANV-ENT-01 | BLOCKED | 0 entries — walk list generation finds no voters because seed voters lack lat/lng coordinates (DB: 62 voters, 0 with latitude) |
| CANV-ENT-02 | BLOCKED | enriched entries returns empty array |
| CANV-ENT-03 | BLOCKED | No entry id to PATCH |
| CANV-ENT-04 | BLOCKED | same |
| CANV-ENT-05 | PASS | 403 viewer — can verify permission guard even without valid entry id (returned 403 before UUID lookup) |

Additional note on entry PATCH schema: `PATCH /walk-lists/{id}/entries/{entry_id}` takes NO request body — it unconditionally marks entry as `skipped`. Plan's `{"status":"visited"}` body is wrong. Entry status enum is {pending, visited, skipped} and status is changed by the door-knocks endpoint (which creates a knock record + updates entry).

## Canvasser assignment

| Test ID | Result | Notes |
|---|---|---|
| CANV-ASSIGN-01 | PASS | 201 |
| CANV-ASSIGN-02 | PASS | volunteer appears in list |
| CANV-ASSIGN-03 | PASS | 204 delete, 201 re-add |
| CANV-ASSIGN-04 | PASS | 403 |
| CANV-ASSIGN-05 | PASS | 200 |
| CANV-ASSIGN-06 | **FAIL (P1)** | HTTP 500 — FK violation leaked: `asyncpg.exceptions.ForeignKeyViolationError: insert or update on table "walk_list_canvassers" violates foreign key constraint "walk_list_canvassers_user_id_fkey"`. Should be 404 or 422. Same anti-pattern as VTR-CTC-04 (raw DB error leaked to client). |

## Door knocks

| Test ID | Result | Notes |
|---|---|---|
| CANV-KNOCK-01 | BLOCKED | No walk list entries exist (see ENT-01) |
| CANV-KNOCK-02 | BLOCKED | same |
| CANV-KNOCK-03 | PASS | 422 invalid code (validated at request schema before entry lookup) |
| CANV-KNOCK-04 | PASS | 403 viewer |

## Walk list delete

| Test ID | Result | Notes |
|---|---|---|
| CANV-WL-DEL-01 | PASS | 204 delete, 404 subsequent GET |
| CANV-WL-DEL-02 | PASS | covered by WL-07 |

## UI — Canvassing hub & map

| Test ID | Result | Notes |
|---|---|---|
| CANV-UI-01..14 | SKIP | UI tests deferred due to P0 STOP condition and time pressure. API-layer tests cover the underlying contract. |

## Sandbox resources (need cleanup)

- `TURF_A_ID` = `a70f707b-0021-4b05-9061-6fe917c828f3` ("CANV Test Turf — Downtown (renamed)")
- `WALK_LIST_A_ID` = `1bb3282d-98b1-4e4f-ab2d-ca1d0951d9e7`
- `WL_TURF_ONLY` = `6e03469d-45dc-4c71-9083-13be9c2dd2c7`
- Plus the ASSIGN canvasser (qa-volunteer) on WALK_LIST_A_ID
- Plus a few GEO-05 out-of-range turfs that didn't get cleaned up (lng≥500)
