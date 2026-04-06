# Phase 00 Results — Environment Setup & Org B Provisioning

**Executed:** 2026-04-05
**Executor:** Claude Code (Opus 4.6)
**Duration:** ~35 min
**Deployed SHA:** `c1c89c0` (ghcr.io/civicpulse/run-api:sha-c1c89c0)

## Summary

- Total tests: 21
- **PASS: 21 / 21**
- FAIL: 0
- SKIP: 0
- BLOCKED: 0

All environment health checks passed, Org B was successfully provisioned (ZITADEL org + 5 users + DB rows + memberships), baseline seed data created, and cross-tenant isolation confirmed at the campaigns-list level.

## Health checks

| Test ID | Result | Notes |
|---|---|---|
| ENV-HEALTH-01 | PASS | HTTP 200, status=ok, git_sha=c1c89c0 matches deployed image |
| ENV-HEALTH-02 | PASS | database=connected, same git_sha |
| ENV-HEALTH-03 | PASS | issuer/authorization_endpoint/token_endpoint/jwks_uri all present |
| ENV-HEALTH-04 | PASS | HTTP 200, id="root" anchor present, bundle /assets/index-DvWHxoRd.js |
| ENV-HEALTH-05 | PASS | info.version="0.1.0", 129 paths (≥100 threshold) |
| ENV-HEALTH-06 | PASS | All 4 sensitive endpoints return 401 unauthenticated |

## Baseline verification (Org A)

| Test ID | Result | Notes |
|---|---|---|
| ENV-BASE-01 | PASS | ZITADEL org 362268991072305186 "CivPulse Platform" ORG_STATE_ACTIVE |
| ENV-BASE-02 | PASS | DB org 227ef98c-… + campaign 06d710c8-… present as expected |
| ENV-BASE-03 | PASS | All 5 Org A users USER_STATE_ACTIVE with correct emails |
| ENV-BASE-04 | PASS | qa-viewer browser login succeeded, landed on https://run.civpulse.org/ |

## Org B provisioning

| Test ID | Result | Notes |
|---|---|---|
| ENV-PROV-01 | PASS | `${ORG_B_ZITADEL_ID}` = **367294411744215109** — NOTE: plan doc said use `/admin/v1/orgs` (404); correct endpoint is `/v2beta/organizations`. Updated plan should be revised. |
| ENV-PROV-02 | PASS | Grant ID = **367294460280700997**, all 5 role keys |
| ENV-PROV-03 | PASS | 5 users created, all with project-role grant status=200 (see `.secrets/prod-test-users-org-b.md`) |
| ENV-PROV-04 | PASS | `${ORG_B_DB_ID}` = **bf420f64-73de-4f73-96ea-efe56bbb1cd7**; `${ORG_B_CAMPAIGN_ID}` = **1729cac1-e802-4bd2-8b8d-20fbc07bbfb4** |
| ENV-PROV-05 | PASS | All 5 Org B users logged in successfully via Playwright, landed on / |
| ENV-PROV-06 | PASS | 2 org_members (org_owner, org_admin) + 5 campaign_members (owner, admin, manager, volunteer, viewer) matching plan |

## Baseline seed

NOTE on schema drift: plan doc references obsolete endpoint paths and schema fields. Adapted to actual v0.1.0 API:
- `/voter-tags` → `/tags` (schema: `{name}` only, no `color`)
- `/voter-lists` → `/lists` (schema: `{name, list_type: "static"|"dynamic"}`, not `is_dynamic`)
- Turf uses `boundary` not `geometry`
- Survey uses `title` not `name` (no `is_active` field)
- Call list accepts null `voter_list_id`

| Test ID | Result | Notes |
|---|---|---|
| ENV-SEED-01 | PASS | 10 TestA1..TestA10 voters in Org A campaign (HTTP 201) |
| ENV-SEED-02 | PASS | 10 TestB1..TestB10 voters in Org B campaign (HTTP 201) |
| ENV-SEED-03 | PASS | 1 tag "HighPropensity" per campaign (adapted to /tags endpoint) |
| ENV-SEED-04 | PASS | 1 static list per campaign with 5 voters each (list_type=static, 204 on members add) |
| ENV-SEED-05 | PASS | 1 turf per campaign with triangular Macon polygon (boundary field) |
| ENV-SEED-06 | PASS | 1 walk list, 1 call list, 1 survey per campaign (6 creations total) |
| ENV-SEED-07 | PASS | 3 volunteers (Vol1..Vol3) per campaign |

## Isolation sanity

| Test ID | Result | Notes |
|---|---|---|
| ENV-ISOL-01 | PASS | qa-owner sees only 06d710c8-… (QA Test Campaign); no Org B leakage |
| ENV-ISOL-02 | PASS | qa-b-owner sees only 1729cac1-… (Tenant B Test Campaign); no Org A leakage |

## Org B Credentials (also in `.secrets/prod-test-users-org-b.md`)

| Role | Email | Password | ZITADEL User ID |
|---|---|---|---|
| owner | qa-b-owner@civpulse.org | `9Grt^r1Kj7E3am0Q^@d&` | 367294460482027589 |
| admin | qa-b-admin@civpulse.org | `vQ3zi&wyr4kzkpZ5krZH` | 367294462780506181 |
| manager | qa-b-manager@civpulse.org | `ndhq&dNjq5wEYc$GqU9*` | 367294465062207557 |
| volunteer | qa-b-volunteer@civpulse.org | `tHZRHkVCqsPhM%#Pui8^` | 367294467343908933 |
| viewer | qa-b-viewer@civpulse.org | `5%G2HVkl$g#XEm9gxBYJ` | 367294469625610309 |

## IDs & Resources Created

### Org B (ZITADEL)
- Org ID: `367294411744215109` ("QA Tenant B")
- Project grant ID: `367294460280700997`

### Org B (DB)
- Organization: `bf420f64-73de-4f73-96ea-efe56bbb1cd7`
- Campaign: `1729cac1-e802-4bd2-8b8d-20fbc07bbfb4` ("Tenant B Test Campaign")

### Seeded resources (per campaign)
Org A — campaign `06d710c8-32ce-44ae-bbab-7fcc72aab248`:
- tag: `49bfc012-a43a-42b9-90b5-40a588b12db3`
- list: `4186d781-3a90-420b-a265-ef0420cc5589`
- turf: `062eaaf7-3ac3-4190-9528-94a96f252065`
- walk-list: `b425354d-5d9b-4819-9e2d-2b72d4e3b34f`
- call-list: `caf5ca1a-5c4a-40d9-966e-e452de25185a`
- survey: `8a278958-275e-4444-8054-b4b68aee881d`

Org B — campaign `1729cac1-e802-4bd2-8b8d-20fbc07bbfb4`:
- tag: `4bcdbdf1-62a5-453a-bed5-68c1a734eda8`
- list: `67d8fbcd-cf2a-492b-9255-337de0405add`
- turf: `920c6538-79be-4d86-b1de-f57bb8269336`
- walk-list: `88a93cab-9d7a-46ac-80c4-90ef82c104f7`
- call-list: `492a8ee5-b3cb-4dc7-b93d-4f9f615c8d14`
- survey: `6e748a84-1db9-4809-a7c2-372aee714871`

### Owner tokens (saved for downstream phases)
- Org A owner token: `.secrets/token-org-a-owner.txt` (expires ~12h)
- Org B owner token: `.secrets/token-org-b-owner.txt` (expires ~12h)

## Notes for future phases

1. **Schema drift**: the plan docs reference older endpoint paths/schemas. Downstream phases should adapt to actual v0.1.0 schemas; see drift notes above.
2. **Tokens** expire in ~12h — downstream agents should refresh if needed via `web/isolation-check.mjs` or `web/seed-org.mjs` pattern.
3. **Probe org cleanup**: during endpoint discovery an accidental `probe-only` ZITADEL org was created and immediately deleted. No lingering state.
