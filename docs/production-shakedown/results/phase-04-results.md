# Phase 04: Campaign Lifecycle — Results

**Executed:** 2026-04-06
**Deployed SHA:** sha-76920d6
**Executor:** Claude Opus 4.6 (automated)
**Duration:** ~25 min

## Summary

| Category | Pass | Fail | Skip | Blocked | Total |
|---|---|---|---|---|---|
| Campaign CRUD | 11 | 4 | 0 | 10 | 25 |
| RBAC | 8 | 0 | 1 | 1 | 10 |
| Members | 10 | 1 | 0 | 2 | 13 |
| Invites | 7 | 1 | 0 | 2 | 10 |
| Ownership | 3 | 0 | 0 | 0 | 3 |
| UI Wizard | 5 | 0 | 1 | 4 | 10 |
| Concurrency | 1 | 0 | 0 | 1 | 2 |
| **Total** | **45** | **6** | **2** | **20** | **73** |

## P0 Findings

None.

## P1 Findings

1. **CAMP-CRUD-07/08/09/10**: Campaign creation returns HTTP 500 (known ZITADEL service connectivity issue). All four campaign types (federal, state, local, ballot) fail. This blocks 20 downstream tests that depend on test campaign creation (CRUD-17 through CRUD-25, CONC-02, several UI tests). Evidence: `evidence/phase-04/CAMP-CRUD-07-500.json`

2. **CAMP-MEM-10**: Admin was able to DELETE a campaign owner (HTTP 204 instead of expected 400). The `created_by` field was "system-bootstrap" at the time, so the `created_by` guard did not fire. The protection appears to check `created_by == target_user_id` rather than `role == "owner"`. Evidence: `evidence/phase-04/CAMP-MEM-10-owner-deletion.md`

## P2 Findings

1. **CAMP-INV-06**: Invite accept enforces email matching (`"Email does not match the invite"`). The test plan assumed any authenticated user could accept an invite for a different email. This is actually a stricter-than-expected security control and is arguably correct behavior, but differs from the test plan expectation.

---

### Campaign CRUD

| Test ID | Result | Notes |
|---|---|---|
| CAMP-CRUD-01 | PASS | 200, 1 item returned, CAMPAIGN_A present, pagination shape correct |
| CAMP-CRUD-02 | PASS | Keys `["items","pagination"]`, pagination has `next_cursor` and `has_more` |
| CAMP-CRUD-03 | PASS | `items` length = 1 with `limit=1`, `has_more: false` (only 1 campaign for viewer) |
| CAMP-CRUD-04 | PASS | `next_cursor=null`, `has_more=false` -- only 1 campaign visible to this user. Pagination shape correct. |
| CAMP-CRUD-05 | PASS | Full schema returned: id, zitadel_org_id, name, type, jurisdiction_fips, jurisdiction_name, status, candidate_name, party_affiliation, created_by, created_at, updated_at, election_date. status="active" |
| CAMP-CRUD-06 | PASS | HTTP 403 with `"Insufficient permissions"` -- non-existent UUID does not reveal existence |
| CAMP-CRUD-07 | FAIL P1 | HTTP 500 -- ZITADEL service connectivity. `$CAMP_FEDERAL` = null |
| CAMP-CRUD-08 | FAIL P1 | HTTP 500 -- same issue. `$CAMP_STATE` = null |
| CAMP-CRUD-09 | FAIL P1 | HTTP 500 -- same issue. `$CAMP_LOCAL` = null |
| CAMP-CRUD-10 | FAIL P1 | HTTP 500 -- same issue. `$CAMP_BALLOT` = null |
| CAMP-CRUD-11 | PASS | HTTP 422, validation error: `"Input should be 'federal', 'state', 'local' or 'ballot'"` |
| CAMP-CRUD-12 | PASS | HTTP 422, `"Field required"` on `name` |
| CAMP-CRUD-13 | PASS | HTTP 422, `"String should have at least 3 characters"` |
| CAMP-CRUD-14 | PASS | HTTP 422, `"String should have at most 100 characters"` |
| CAMP-CRUD-15 | PASS | HTTP 422, `"Input should be a valid date or datetime"` |
| CAMP-CRUD-16 | PASS | HTTP 403, `"Selected organization is not available"` -- cross-tenant blocked. NOT a P0. |
| CAMP-CRUD-17 | BLOCKED | Requires `$CAMP_LOCAL` (creation failed) |
| CAMP-CRUD-18 | BLOCKED | Requires `$CAMP_LOCAL` (creation failed) |
| CAMP-CRUD-19 | BLOCKED | Requires `$CAMP_BALLOT` (creation failed) |
| CAMP-CRUD-20 | BLOCKED | Requires `$CAMP_BALLOT` (creation failed) |
| CAMP-CRUD-21 | BLOCKED | Requires `$CAMP_BALLOT` (creation failed) |
| CAMP-CRUD-22 | BLOCKED | Requires `$CAMP_STATE` (creation failed) |
| CAMP-CRUD-23 | BLOCKED | Requires `$CAMP_STATE` (creation failed) |
| CAMP-CRUD-24 | BLOCKED | Requires `$CAMP_STATE` (creation failed) |
| CAMP-CRUD-25 | BLOCKED | Requires `$CAMP_STATE` (creation failed) |

### RBAC

| Test ID | Result | Notes |
|---|---|---|
| CAMP-RBAC-01 | BLOCKED | HTTP 500 -- campaign creation fails for all users (ZITADEL issue), cannot confirm viewer can create |
| CAMP-RBAC-02 | PASS | HTTP 403 -- volunteer cannot update campaign |
| CAMP-RBAC-03 | PASS | HTTP 403 -- manager cannot update campaign |
| CAMP-RBAC-04 | PASS | HTTP 403 -- viewer cannot update campaign |
| CAMP-RBAC-05 | PASS | HTTP 200 -- admin can update campaign (candidate_name set to "QA Candidate") |
| CAMP-RBAC-06 | PASS | HTTP 403 -- admin cannot delete campaign |
| CAMP-RBAC-07 | PASS | HTTP 403 -- manager cannot delete campaign |
| CAMP-RBAC-08 | PASS | HTTP 403 -- viewer cannot delete campaign |
| CAMP-RBAC-09 | SKIP | Covered by CAMP-CRUD-22 (which is BLOCKED) -- cannot test owner delete without test campaign |
| CAMP-RBAC-10 | PASS | Both list (200) and GET (200) succeed for viewer |

### Members

| Test ID | Result | Notes |
|---|---|---|
| CAMP-MEM-01 | PASS | HTTP 200, 6 members returned (includes Kerry Hatcher as additional owner). Roles: owner x2, admin, manager, volunteer, viewer |
| CAMP-MEM-02 | PASS | HTTP 401 -- unauthenticated request rejected |
| CAMP-MEM-03 | PASS | HTTP 200, viewer promoted to manager, then restored to viewer |
| CAMP-MEM-04 | PASS | HTTP 403, `"Admins can only assign manager role and below"` |
| CAMP-MEM-05 | PASS | HTTP 403, `"Admins can only assign manager role and below"` |
| CAMP-MEM-06 | PASS | HTTP 400, `"Cannot grant owner role via role update. Use transfer-ownership instead."` |
| CAMP-MEM-07 | PASS | HTTP 403 -- manager cannot update roles |
| CAMP-MEM-08 | PASS | HTTP 404 -- non-member returns 404 |
| CAMP-MEM-09 | PASS | Member list shows 6 members including created_by user |
| CAMP-MEM-10 | FAIL P1 | HTTP 204 -- admin was able to delete campaign owner (367278364538437701). Expected 400. The `created_by` was "system-bootstrap" so the guard didn't trigger. Restored via SQL. See evidence. |
| CAMP-MEM-11 | PASS | HTTP 204 -- viewer removed, confirmed absent from member list. Restored via SQL. |
| CAMP-MEM-12 | PASS | HTTP 403 -- manager cannot delete members |
| CAMP-MEM-13 | PASS | HTTP 404 -- non-existent member returns 404 |

### Invites

| Test ID | Result | Notes |
|---|---|---|
| CAMP-INV-01 | PASS | HTTP 201. invite_id = e64d9cd9-8296-47e0-9821-23f143c445e0. Note: `.test` TLD rejected by email validation; used `.example.com` instead. |
| CAMP-INV-02 | PASS | HTTP 403 -- viewer cannot create invite |
| CAMP-INV-03 | PASS | HTTP 403 -- manager cannot create invite |
| CAMP-INV-04 | PASS | HTTP 200, invites listed. `token: null` in list responses (hidden as expected). Multiple invites from prior test runs also visible. |
| CAMP-INV-05 | PASS | HTTP 403 -- volunteer cannot list invites |
| CAMP-INV-06 | FAIL P2 | HTTP 400, `"Email does not match the invite"`. The API enforces that the accepting user's email must match the invite email. This is stricter than expected by the test plan but is arguably correct security behavior. |
| CAMP-INV-07 | BLOCKED | Depends on INV-06 succeeding (invite was never accepted, so re-accept test is invalid) |
| CAMP-INV-08 | PASS | HTTP 401 -- unauthenticated accept rejected |
| CAMP-INV-09 | PASS | HTTP 204 -- invite revoked successfully. Created invite ca83486c, then deleted. |
| CAMP-INV-10 | PASS | HTTP 400, `"Invalid or expired invite"` |

### Ownership Transfer

| Test ID | Result | Notes |
|---|---|---|
| CAMP-OWN-01 | PASS | HTTP 403 -- admin cannot transfer ownership |
| CAMP-OWN-02 | PASS | HTTP 200 -- owner transferred to qa-admin, then transferred back. Roles correctly swapped (new owner gets "owner", old owner demoted to "admin"). Both directions verified. |
| CAMP-OWN-03 | PASS | HTTP 400, `"Target user is not a campaign member"` |

### UI Wizard

| Test ID | Result | Notes |
|---|---|---|
| CAMP-UI-01 | PASS | `/campaigns/new` renders with 3-step indicator (Campaign Details, Review, Invite Team). Step 1 active. screenshot: CAMP-UI-01-wizard-step-0.png |
| CAMP-UI-02 | PASS | Validation errors shown: "Name must be at least 3 characters" and "Invalid input" for type. screenshot: CAMP-UI-02-validation-errors.png |
| CAMP-UI-03 | PASS | Type dropdown has 4 options: Federal, State, Local, Ballot |
| CAMP-UI-04 | PASS | Step 2 (Review) shows entered values correctly: Name="CAMP UI Test", Type="Local", optional fields show "Not specified". screenshot: CAMP-UI-04-wizard-step-2.png |
| CAMP-UI-05 | PASS | Back button returns to step 1 with name field intact ("CAMP UI Test") |
| CAMP-UI-06 | BLOCKED | Campaign creation fails with 500 (ZITADEL). UI shows red error: "Failed to create campaign. Check your connection and try again." Step 3 (Invite Team) renders correctly with member checkboxes. screenshot: CAMP-UI-06-wizard-step-3.png, CAMP-UI-07-create-result.png |
| CAMP-UI-07 | BLOCKED | Depends on UI-06 succeeding |
| CAMP-UI-08 | BLOCKED | Depends on UI-06 succeeding |
| CAMP-UI-09 | PASS | Volunteer does NOT see "New Campaign" button/link. Sidebar shows only "All Campaigns". No creation CTA visible. screenshot: CAMP-UI-09-volunteer-no-cta.png |
| CAMP-UI-10 | SKIP | Owner settings page loads at `/campaigns/{id}/settings/general` with edit controls (Campaign Name, Description, Election Date, Save Changes button). Did not test all roles due to time. screenshot: CAMP-UI-10-owner-settings.png |

### Concurrency

| Test ID | Result | Notes |
|---|---|---|
| CAMP-CONC-01 | PASS | Both PATCH requests returned 200. Response A: "Alice", Response B: "Bob". No 500 errors. Last-write-wins works correctly. Restored to "QA Candidate". |
| CAMP-CONC-02 | BLOCKED | Requires campaign creation (500) |

---

## Evidence Files

- `evidence/phase-04/CAMP-CRUD-07-500.json` -- Campaign creation 500 response body
- `evidence/phase-04/CAMP-MEM-10-owner-deletion.md` -- Admin deleting owner analysis
- `evidence/phase-04/CAMP-UI-01-wizard-step-0.png` -- Wizard step 1
- `evidence/phase-04/CAMP-UI-02-validation-errors.png` -- Validation errors
- `evidence/phase-04/CAMP-UI-04-wizard-step-2.png` -- Review step
- `evidence/phase-04/CAMP-UI-06-wizard-step-3.png` -- Invite Team step
- `evidence/phase-04/CAMP-UI-07-create-result.png` -- Creation error display
- `evidence/phase-04/CAMP-UI-09-volunteer-no-cta.png` -- Volunteer view (no /campaigns route)
- `evidence/phase-04/CAMP-UI-09-volunteer-all-campaigns.png` -- Volunteer All Campaigns
- `evidence/phase-04/CAMP-UI-09-volunteer-landing.png` -- Volunteer landing page
- `evidence/phase-04/CAMP-UI-10-owner-settings.png` -- Owner settings page

## Cleanup

- No test campaigns were created (all creation attempts returned 500)
- qa-owner membership restored via SQL after MEM-10 deletion
- qa-viewer membership restored via SQL after MEM-11 deletion
- Invite `e64d9cd9-8296-47e0-9821-23f143c445e0` left as pending (never accepted due to email mismatch)
- Invite `ca83486c-e758-4839-99fc-ece917c7c514` was created and revoked during INV-09
- candidate_name on CAMPAIGN_A restored to "QA Candidate"
