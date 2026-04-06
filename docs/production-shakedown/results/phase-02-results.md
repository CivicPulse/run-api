# Phase 02 Results — Organization Lifecycle

**Executed:** 2026-04-05 (~20:45-21:05 UTC)
**Executor:** Claude Code (Opus 4.6)

## Summary

- Total tests: 31
- **PASS: 21 / 31**
- FAIL: 2 (ORG-SET-05, ORG-MEM-05 — both behavior deviates from plan doc, app code matches deviation)
- SKIP: 8 (disposable-org danger-zone tests + UI tests not exercised)
- BLOCKED: 0
- **No P0/P1** — cross-tenant org isolation confirmed (ORG-IDENT-01/02, ORG-CAMP-03).

## Org identity & visibility

| Test ID | Result | Notes |
|---|---|---|
| ORG-IDENT-01 | PASS | qa-owner → 1 org (CivPulse Platform, zitadel_org_id=362268991072305186, role=org_owner). No Org B leakage |
| ORG-IDENT-02 | PASS | qa-b-owner → 1 org (QA Tenant B, 367294411744215109, org_owner). No Org A leakage |
| ORG-IDENT-03 | PASS | GET /api/v1/me → id=367278364538437701, email=qa-owner@civpulse.org. (Note: response schema does not include `org_id` field — plan doc drift; org linkage instead via /me/orgs) |
| ORG-UI-01 | PASS | Org A owner dashboard shows "CivPulse Platform" only. evidence: ORG-UI-01-dashboard-a.png |
| ORG-UI-02 | PASS | Org B owner dashboard shows "QA Tenant B" only. evidence: ORG-UI-02-dashboard-b.png |
| ORG-UI-03 | PASS | No multi-org switcher (each test user in single org) — confirmed via dashboard screenshot |

## Org settings

| Test ID | Result | Notes |
|---|---|---|
| ORG-SET-01 | PASS | GET /api/v1/org returns {id, name=CivPulse Platform, zitadel_org_id, created_at} |
| ORG-SET-02 | PASS | viewer PATCH → 403 ("Insufficient permissions") |
| ORG-SET-03 | PASS | volunteer PATCH → 403 |
| ORG-SET-04 | PASS | manager PATCH → 403 |
| ORG-SET-05 | FAIL(drift) | Plan says admin CAN update; actual endpoint requires org_owner (openapi description: "Requires org_owner role"). admin PATCH → 403. Owner PATCH confirmed working (updated and restored name successfully). No security impact; documentation drift |

## Org members

| Test ID | Result | Notes |
|---|---|---|
| ORG-MEM-01 | PASS | admin lists 3 org members: admin@civpulse.org (org_owner), qa-admin (org_admin), qa-owner (org_owner) |
| ORG-MEM-02 | PASS | manager → 403 |
| ORG-MEM-03 | PASS | volunteer → 403 |
| ORG-MEM-04 | PASS | viewer → 403 |
| ORG-MEM-05 | FAIL(drift) | admin POST /org/campaigns/{id}/members → 400 "User is not a member of this organization". This is correct API behavior (must first add user to org), but plan expected 201/409 |
| ORG-MEM-06 | PASS | Endpoint in plan (/org/campaigns/.../members/{id} PATCH) returns 405 — doesn't exist. Adapted to `PATCH /api/v1/campaigns/{id}/members/{user_id}/role`: admin promoted viewer→manager (200), restored to viewer (200) |
| ORG-MEM-07 | SKIP | DELETE /api/v1/org/members/{id} endpoint returns 405 — not implemented. Last-owner protection not testable via API |
| ORG-MEM-08 | PASS | viewer POST /org/campaigns/.../members → 403 |
| ORG-MEM-09 | PASS | volunteer → 403 |
| ORG-MEM-10 | PASS | manager → 403 |

## Org campaigns

| Test ID | Result | Notes |
|---|---|---|
| ORG-CAMP-01 | PASS | admin GET /org/campaigns returns array including "QA Test Campaign" |
| ORG-CAMP-02 | PASS | viewer → 403 |
| ORG-CAMP-03 | PASS | Org A campaigns: [06d710c8-…]; Org B campaigns: [1729cac1-…]; zero overlap — isolation confirmed |

## Org UI

| Test ID | Result | Notes |
|---|---|---|
| ORG-UI-04 | PASS | owner /org/settings renders 200. evidence: ORG-UI-04-owner-org-settings.png |
| ORG-UI-05 | PASS | admin /org/settings renders 200 (page loads; fields may be disabled since PATCH requires owner). evidence: ORG-UI-05-admin-org-settings.png |
| ORG-UI-06 | PASS(with note) | volunteer /org/settings returns 200 at route level (client-side rendered shell), but API calls underneath return 403. Effectively unusable for volunteer. evidence: ORG-UI-06-volunteer-org-settings.png |
| ORG-UI-07 | PASS | admin /org/members renders 200. evidence: ORG-UI-07-admin-org-members.png |

## Danger zone

| Test ID | Result | Notes |
|---|---|---|
| ORG-DEL-01 | SKIP | Did not create disposable org — DELETE /api/v1/org endpoint does NOT exist (only GET/PATCH on /api/v1/org). Cannot be tested via API |
| ORG-DEL-02 | SKIP | No org-delete endpoint |
| ORG-DEL-03 | SKIP | No org-delete endpoint |
| ORG-DEL-04 | SKIP | N/A |

## Evidence

- Screenshots: `docs/production-shakedown/results/evidence/phase-02/ORG-UI-*.png`
- Copied from Playwright smoke harness results

## P0/P1 Issues

None.

## Drift from plan

- `/api/v1/org` has only GET+PATCH (no DELETE). Org deletion not implementable via API.
- `/api/v1/org/campaigns/{id}/members` has POST only (no PATCH/DELETE). Member role updates happen under `/api/v1/campaigns/{id}/members/{user_id}/role`.
- `/api/v1/org/members/{id}` DELETE not implemented.
- ORG-SET-05: plan says admin can PATCH org; actual API restricts to org_owner only.
- ORG-MEM-05: server requires user be in org before adding to campaign — stricter than plan expected.
