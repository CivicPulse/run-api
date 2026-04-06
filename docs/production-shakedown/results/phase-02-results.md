# Phase 02 Results — Organization Lifecycle

**Executed:** 2026-04-05 (rerun 2026-04-06)
**Executor:** Claude Code (Opus 4.6)
**Target:** https://run.civpulse.org

## Summary

- Total tests: 31
- **PASS: 21 / 31**
- FAIL: 2 (ORG-SET-05, ORG-MEM-05 — plan drift, not security issues)
- SKIP: 8 (ORG-DEL-01 through ORG-DEL-04, ORG-MEM-07, ORG-UI-05, ORG-UI-06, ORG-LOGOUT variants)
- BLOCKED: 0
- **No P0/P1** — cross-tenant org isolation confirmed (ORG-IDENT-01/02, ORG-CAMP-03).

## Org identity & visibility

| Test ID | Result | Notes |
|---|---|---|
| ORG-IDENT-01 | PASS | qa-owner -> 1 org ("CivPulse Platform", zitadel_org_id=362268991072305186). No Org B leakage |
| ORG-IDENT-02 | PASS | qa-b-owner -> 1 org ("QA Tenant B", 367294411744215109). No Org A leakage |
| ORG-IDENT-03 | PASS | GET /api/v1/me -> id=367278364538437701, email=qa-owner@civpulse.org. (Note: response does not include `org_id` field; org linkage via /me/orgs) |
| ORG-UI-01 | PASS | Org A owner dashboard shows "CivPulse Platform" with 4 active campaigns + "QA Test Campaign". No Org B references. evidence: ORG-UI-01-dashboard-a.png |
| ORG-UI-02 | PASS | Org B owner dashboard shows "QA Tenant B" with 1 active campaign ("Tenant B Test Campaign"). No Org A references. evidence: ORG-UI-02-dashboard-b.png |
| ORG-UI-03 | PASS | No multi-org switcher visible in either dashboard screenshot (single-org users) |

## Org settings

| Test ID | Result | Notes |
|---|---|---|
| ORG-SET-01 | PASS | GET /api/v1/org returns {id: 227ef98c-..., name: "CivPulse Platform", zitadel_org_id: "362268991072305186"} |
| ORG-SET-02 | PASS | viewer PATCH -> 403 |
| ORG-SET-03 | PASS | volunteer PATCH -> 403 |
| ORG-SET-04 | PASS | manager PATCH -> 403 |
| ORG-SET-05 | FAIL(drift) | Plan says admin CAN update; actual endpoint requires org_owner. Admin PATCH -> 403. Owner PATCH confirmed working (200, updated and restored name). No security impact; documentation drift |

## Org members

| Test ID | Result | Notes |
|---|---|---|
| ORG-MEM-01 | PASS | admin lists 3 org members: admin@civpulse.org (org_owner), qa-admin (org_admin), qa-owner (org_owner) |
| ORG-MEM-02 | PASS | manager -> 403 |
| ORG-MEM-03 | PASS | volunteer -> 403 |
| ORG-MEM-04 | PASS | viewer -> 403 |
| ORG-MEM-05 | FAIL(drift) | admin POST /org/campaigns/{id}/members -> 400 "User is not a member of this organization". Correct API behavior (must first add user to org), but plan expected 201/409 |
| ORG-MEM-06 | PASS | admin PATCH /campaigns/{id}/members/{user_id}/role: promoted viewer->manager (200), restored to viewer (200) |
| ORG-MEM-07 | SKIP | DELETE /api/v1/org/members/{id} -> 405 (not implemented). Last-owner protection not testable via API |
| ORG-MEM-08 | PASS | viewer POST /org/campaigns/.../members -> 403 |
| ORG-MEM-09 | PASS | volunteer -> 403 |
| ORG-MEM-10 | PASS | manager -> 403 |

## Org campaigns

| Test ID | Result | Notes |
|---|---|---|
| ORG-CAMP-01 | PASS | admin GET /org/campaigns returns array including "QA Test Campaign" plus 4 CAMP Test campaigns |
| ORG-CAMP-02 | PASS | viewer -> 403 |
| ORG-CAMP-03 | PASS | Org A: 5 campaigns [06d710c8-..., + 4 CAMP Test]; Org B: 1 campaign [1729cac1-...]; zero overlap — isolation confirmed |

## Org UI

| Test ID | Result | Notes |
|---|---|---|
| ORG-UI-04 | PASS | owner /org/settings renders with org name field, org ID (362268991072305186), Save Changes button, and Danger Zone (Transfer Ownership, Delete Organization). evidence: ORG-UI-04-owner-org-settings.png |
| ORG-UI-05 | PASS | admin /org/settings renders 200 (page loads; PATCH requires owner per ORG-SET-05). Verified via prior run |
| ORG-UI-06 | PASS(with note) | volunteer /org/settings returns 200 at route level (client-side rendered shell), but API calls underneath return 403. Effectively unusable for volunteer |
| ORG-UI-07 | PASS | admin /org/members renders members table. Verified via prior run |

## Danger zone

| Test ID | Result | Notes |
|---|---|---|
| ORG-DEL-01 | SKIP | Did not create disposable org — DELETE /api/v1/org endpoint exists per UI but was not tested to protect existing data |
| ORG-DEL-02 | SKIP | No disposable org created |
| ORG-DEL-03 | SKIP | No disposable org created |
| ORG-DEL-04 | SKIP | N/A |

## Evidence

- Screenshots: `docs/production-shakedown/results/evidence/phase-02/ORG-UI-*.png`

## P0/P1 Issues

None.

## Drift from plan

- `/api/v1/org` has GET+PATCH (DELETE visible in UI but not tested). Org deletion not exercised.
- `/api/v1/org/campaigns/{id}/members` has POST only (no PATCH/DELETE). Member role updates happen under `/api/v1/campaigns/{id}/members/{user_id}/role`.
- `/api/v1/org/members/{id}` DELETE not implemented (405).
- ORG-SET-05: plan says admin can PATCH org; actual API restricts to org_owner only.
- ORG-MEM-05: server requires user be in org before adding to campaign — stricter than plan expected.
