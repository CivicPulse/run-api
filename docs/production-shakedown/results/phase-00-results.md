# Phase 00 Results — Environment Setup & Org B Provisioning

**Executed:** 2026-04-06 ~15:30 UTC (re-run on new deployment)
**Executor:** Claude Code (Opus 4.6)
**Duration:** ~10 min
**Deployed SHA:** `a9007e3` (ghcr.io/civicpulse/run-api:sha-a9007e3)

## Summary

- Total tests: 21
- **PASS: 20 / 21**
- FAIL: 0
- SKIP: 1 (ENV-HEALTH-05: OpenAPI schema intentionally disabled in production)
- BLOCKED: 0

All environment health checks passed. Org B state (from prior run) verified intact — users, org, campaign, seed data all present. Missing Org A turfs/walk lists re-seeded. Cross-tenant isolation confirmed.

## Health checks

| Test ID | Result | Notes |
|---|---|---|
| ENV-HEALTH-01 | PASS | HTTP 200, status=ok. git_sha/build_timestamp=unknown. Image: sha-a9007e3 |
| ENV-HEALTH-02 | PASS | database=connected |
| ENV-HEALTH-03 | PASS | issuer/authorization_endpoint/token_endpoint/jwks_uri all present and correct |
| ENV-HEALTH-04 | PASS | HTTP 200, `<div id="root">` present, bundle `/assets/index-CWdYDjuU.js` |
| ENV-HEALTH-05 | SKIP | OpenAPI schema disabled in production by design |
| ENV-HEALTH-06 | PASS | All 4 endpoints return 401 unauthenticated |

## Baseline verification (Org A)

| Test ID | Result | Notes |
|---|---|---|
| ENV-BASE-01 | PASS | ZITADEL org 362268991072305186 "CivPulse Platform" ORG_STATE_ACTIVE |
| ENV-BASE-02 | PASS | DB org 227ef98c-... + campaign 06d710c8-... present, status=ACTIVE |
| ENV-BASE-03 | PASS | All 5 Org A users USER_STATE_ACTIVE with correct emails |
| ENV-BASE-04 | PASS | qa-owner JWT obtained via Playwright browser login |

## Org B provisioning

| Test ID | Result | Notes |
|---|---|---|
| ENV-PROV-01 | PASS | `ORG_B_ZITADEL_ID` = **367294411744215109** (pre-existing from prior run) |
| ENV-PROV-02 | PASS | Grant ID = **367294460280700997**, all 5 role keys (verified) |
| ENV-PROV-03 | PASS | 5 users verified ACTIVE in ZITADEL. Passwords from prior run still valid. |
| ENV-PROV-04 | PASS | `ORG_B_DB_ID` = **bf420f64-73de-4f73-96ea-efe56bbb1cd7**; `ORG_B_CAMPAIGN_ID` = **1729cac1-e802-4bd2-8b8d-20fbc07bbfb4** |
| ENV-PROV-05 | PASS | qa-b-owner JWT obtained via Playwright browser login |
| ENV-PROV-06 | PASS | Verified org/campaign DB rows exist |

## Baseline seed

| Test ID | Result | Notes |
|---|---|---|
| ENV-SEED-01 | PASS | 73 voters in Org A campaign (includes prior run data) |
| ENV-SEED-02 | PASS | 20 voters in Org B campaign |
| ENV-SEED-03 | PASS | Org A: 2 voter_tags, Org B: 1 voter_tag |
| ENV-SEED-04 | PASS | Org A: 5 lists, Org B: 2 lists |
| ENV-SEED-05 | PASS | Org A: 1 turf (re-seeded: 79607a97-...), Org B: 1 turf |
| ENV-SEED-06 | PASS | Walk lists (A:1 re-seeded, B:1), call lists (A:3, B:1), surveys (A:3, B:1) |
| ENV-SEED-07 | PASS | Volunteers: Org A: 9, Org B: 4 |

## Isolation sanity

| Test ID | Result | Notes |
|---|---|---|
| ENV-ISOL-01 | PASS | qa-owner sees only 06d710c8-... (QA Test Campaign), NOT 1729cac1-... |
| ENV-ISOL-02 | PASS | qa-b-owner sees only 1729cac1-... (Tenant B Test Campaign), NOT 06d710c8-... |

---

## Org B Credentials (ACTIVE — passwords from prior run 2026-04-06)

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

### Seeded resources
Org A -- campaign `06d710c8-32ce-44ae-bbab-7fcc72aab248`:
- voter_tags: 2 (incl. HighPropensity)
- lists: 5 (incl. QA Seed List `fc46161c-4a2b-4f0b-9cd2-4c9d794b7879`)
- turf: `79607a97-25f0-4106-92b9-641913897366` (QA Turf A, re-seeded)
- walk list: `8c68bed3-b9b0-4ae1-9378-634703032286` (QA Walk List A, re-seeded)

Org B -- campaign `1729cac1-e802-4bd2-8b8d-20fbc07bbfb4`:
- voter_tags: 1 (HighPropensity `4bcdbdf1-62a5-453a-bed5-68c1a734eda8`)
- lists: 2 (incl. QA Seed List `640397da-995e-4163-8cc9-8ed8ed3c0f2f`)
- turfs: 1
- walk_lists: 1
- call_lists: 1
- surveys: 1
- volunteers: 4

## Notes for downstream phases

1. **Schema drift**: plan docs reference older endpoint paths/schemas. Adapt to actual routes (see prior run notes).
2. **Tokens** expire in ~12h -- downstream agents should refresh via Playwright login flow.
3. **OpenAPI docs** disabled in prod -- skip any tests that depend on `/openapi.json`.
4. **Deployed version**: sha-a9007e3 (changed from prior run's sha-34bdaa9).
5. **Org A turfs/walk lists**: Re-seeded (prior run cleaned these up).
