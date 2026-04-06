# Phase 00 Results — Environment Setup & Org B Provisioning

**Executed:** 2026-04-06 ~03:05 UTC (re-run; original 2026-04-05)
**Executor:** Claude Code (Opus 4.6)
**Duration:** ~15 min
**Deployed SHA:** `34bdaa9` (ghcr.io/civicpulse/run-api:sha-34bdaa9)

## Summary

- Total tests: 21
- **PASS: 20 / 21**
- FAIL: 0
- SKIP: 1 (ENV-HEALTH-05: OpenAPI schema intentionally disabled in production)
- BLOCKED: 0

All environment health checks passed, Org B provisioning confirmed (pre-existing from prior run; passwords reset for this run), baseline seed data created/verified, and cross-tenant isolation confirmed.

## Health checks

| Test ID | Result | Notes |
|---|---|---|
| ENV-HEALTH-01 | PASS | HTTP 200, status=ok. git_sha/build_timestamp=unknown (build metadata not injected). Image: sha-34bdaa9 |
| ENV-HEALTH-02 | PASS | database=connected |
| ENV-HEALTH-03 | PASS | issuer/authorization_endpoint/token_endpoint/jwks_uri all present and correct |
| ENV-HEALTH-04 | PASS | HTTP 200, `<div id="root">` present, bundle `/assets/index-CWdYDjuU.js` |
| ENV-HEALTH-05 | SKIP | OpenAPI schema disabled in production by design (`app/main.py:93`: `docs_enabled = settings.environment != "production"`) |
| ENV-HEALTH-06 | PASS | All 4 endpoints return 401 unauthenticated |

## Baseline verification (Org A)

| Test ID | Result | Notes |
|---|---|---|
| ENV-BASE-01 | PASS | ZITADEL org 362268991072305186 "CivPulse Platform" ORG_STATE_ACTIVE |
| ENV-BASE-02 | PASS | DB org 227ef98c-... + campaign 06d710c8-... present as expected |
| ENV-BASE-03 | PASS | All 5 Org A users USER_STATE_ACTIVE with correct emails |
| ENV-BASE-04 | PASS | qa-viewer browser login succeeded, landed on https://run.civpulse.org/ |

## Org B provisioning

| Test ID | Result | Notes |
|---|---|---|
| ENV-PROV-01 | PASS | `ORG_B_ZITADEL_ID` = **367294411744215109** (already existed) |
| ENV-PROV-02 | PASS | Grant ID = **367294460280700997**, all 5 role keys |
| ENV-PROV-03 | PASS | 5 users pre-existed; passwords reset for this run (all HTTP 200). Credentials below. |
| ENV-PROV-04 | PASS | `ORG_B_DB_ID` = **bf420f64-73de-4f73-96ea-efe56bbb1cd7**; `ORG_B_CAMPAIGN_ID` = **1729cac1-e802-4bd2-8b8d-20fbc07bbfb4** |
| ENV-PROV-05 | PASS | All 5 Org B users logged in successfully via Playwright |
| ENV-PROV-06 | PASS | 2 org_members (org_owner, org_admin) + 5 campaign_members match expected roles |

## Baseline seed

NOTE on schema drift: plan doc references obsolete endpoint paths and schema fields. Adapted to actual API:
- `/voter-tags` -> `/tags` (schema: `{name}` only, no `color`)
- `/voter-lists` -> `/lists` (schema: `{name, list_type: "static"|"dynamic"}`, not `is_dynamic`)
- Turf uses `boundary` not `geometry`
- Survey uses `title` not `name` (no `is_active` field)
- Call list accepts null `voter_list_id`

| Test ID | Result | Notes |
|---|---|---|
| ENV-SEED-01 | PASS | 10 TestA1..TestA10 voters in Org A campaign (HTTP 201) |
| ENV-SEED-02 | PASS | 10 TestB1..TestB10 voters in Org B campaign (HTTP 201) |
| ENV-SEED-03 | PASS | 1 tag "HighPropensity" per campaign (pre-existing, 409 on re-create) |
| ENV-SEED-04 | PASS | 1 static list per campaign with 5 voters each. List A: `fc46161c-4a2b-4f0b-9cd2-4c9d794b7879`, List B: `640397da-995e-4163-8cc9-8ed8ed3c0f2f` |
| ENV-SEED-05 | PASS | Turfs pre-exist: Org A has 4, Org B has 1 (>= 1 minimum) |
| ENV-SEED-06 | PASS | Walk lists (A:3, B:1), call lists (A:4, B:1), surveys (A:8, B:1) -- all >= 1 minimum |
| ENV-SEED-07 | PASS | Volunteers: Org A has 9, Org B has 4 -- both >= 3 minimum |

## Isolation sanity

| Test ID | Result | Notes |
|---|---|---|
| ENV-ISOL-01 | PASS | qa-owner sees campaigns 06d710c8-... (+ 3 Kerry legacy campaigns) but NOT 1729cac1-... |
| ENV-ISOL-02 | PASS | qa-b-owner sees only 1729cac1-... and NOT 06d710c8-... |

---

## Org B Credentials (ACTIVE -- passwords reset 2026-04-06)

| Role | Email | Password | ZITADEL User ID |
|---|---|---|---|
| owner | qa-b-owner@civpulse.org | `oTDgkJYs8$b9XUvuWcPH` | 367294460482027589 |
| admin | qa-b-admin@civpulse.org | `@rhs2cWpP8TgpwYClAdU` | 367294462780506181 |
| manager | qa-b-manager@civpulse.org | `y3Xnn#ufFXU7$T6Un*8A` | 367294465062207557 |
| volunteer | qa-b-volunteer@civpulse.org | `pivd&2GtOFt5XqCSbiRW` | 367294467343908933 |
| viewer | qa-b-viewer@civpulse.org | `wfFi!xYs^^nuv7hl%e2O` | 367294469625610309 |

## Org A Credentials (unchanged)

| Role | Email | Password | ZITADEL User ID |
|---|---|---|---|
| owner | qa-owner@civpulse.org | `k%A&ZrlYH4tgztoVK&Ms` | 367278364538437701 |
| admin | qa-admin@civpulse.org | `gWRQi#uI9&8^1K4B28Dz` | 367278367172460613 |
| manager | qa-manager@civpulse.org | `%3%XQm*K0fT!9qx89e@$` | 367278369538048069 |
| volunteer | qa-volunteer@civpulse.org | `S27hYyk#b6ntLK8jHZLv` | 367278371970744389 |
| viewer | qa-viewer@civpulse.org | `QzkzepNgk6It$!7$!MYF` | 367278374319554629 |

## IDs & Resources

### Org A
- ZITADEL Org ID: `362268991072305186`
- ZITADEL Project ID: `364255076543365156`
- ZITADEL SPA Client ID: `364255312682745892`
- DB Organization ID: `227ef98c-bf29-47d2-b6ea-b904507f50de`
- DB Campaign ID: `06d710c8-32ce-44ae-bbab-7fcc72aab248` ("QA Test Campaign")

### Org B (ZITADEL)
- Org ID: `367294411744215109` ("QA Tenant B")
- Project Grant ID: `367294460280700997`

### Org B (DB)
- Organization ID: `bf420f64-73de-4f73-96ea-efe56bbb1cd7`
- Campaign ID: `1729cac1-e802-4bd2-8b8d-20fbc07bbfb4` ("Tenant B Test Campaign")

### Seeded resources (per campaign)
Org A -- campaign `06d710c8-32ce-44ae-bbab-7fcc72aab248`:
- tag: `49bfc012-a43a-42b9-90b5-40a588b12db3` (HighPropensity)
- list: `fc46161c-4a2b-4f0b-9cd2-4c9d794b7879` (QA Seed List, 5 members)

Org B -- campaign `1729cac1-e802-4bd2-8b8d-20fbc07bbfb4`:
- tag: `4bcdbdf1-62a5-453a-bed5-68c1a734eda8` (HighPropensity)
- list: `640397da-995e-4163-8cc9-8ed8ed3c0f2f` (QA Seed List, 5 members)

## Notes for downstream phases

1. **Schema drift**: plan docs reference older endpoint paths/schemas. Adapt to actual routes (see drift notes in seed section).
2. **Tokens** expire in ~12h -- downstream agents should refresh via the Playwright login flow.
3. **OpenAPI docs** disabled in prod -- skip any tests that depend on `/openapi.json`.
4. **git_sha/build_timestamp** in health endpoints return "unknown" -- build metadata not baked into image (cosmetic).
