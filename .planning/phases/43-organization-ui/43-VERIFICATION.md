---
phase: 43-organization-ui
verified: 2026-03-24T21:30:00Z
status: passed
score: 9/9 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 8/9
  gaps_closed:
    - "Org admin can navigate to /org/members and /org/settings from org-level pages"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Org switcher — single org displays as plain text"
    expected: "If user belongs to one org, header shows org name as non-clickable text (not a dropdown)"
    why_human: "OrgSwitcher.tsx renders a <span> for single-org users; requires live session to observe"
  - test: "Archive flow — campaign moves to archived section"
    expected: "After confirming archive in dialog, campaign card moves from active grid to collapsed Archived section, toast 'X archived.' appears"
    why_human: "Requires live session with a running API and a campaign in active status"
  - test: "RequireOrgRole gate — Create Campaign button hidden for non-admin"
    expected: "User with no org role does not see the Create Campaign button on the org dashboard"
    why_human: "Requires OIDC session with a user whose JWT contains no org role claim"
  - test: "PATCH /org org_owner gating — non-owner cannot edit name"
    expected: "User with org_admin role sees the name input as read-only (bg-muted, no Save button)"
    why_human: "Requires live session with org_admin (not org_owner) OIDC token"
---

# Phase 43: Organization UI Verification Report

**Phase Goal:** Org admins can manage campaigns, members, and settings from an organization-level dashboard
**Verified:** 2026-03-24
**Status:** passed -- all 9 must-haves verified
**Re-verification:** Yes -- after gap closure (plan 43-05)

## Gap Closure Summary

**Previous status:** gaps_found (8/9)
**Gap:** AppSidebar returned `null` on non-campaign routes, hiding Organization nav on /, /org/members, /org/settings.
**Fix (plan 43-05):** Removed early `return null` from AppSidebar. Campaign group now conditionally renders only when `campaignId` is present. Organization group always renders on all authenticated routes.
**Evidence:** `web/src/routes/__root.tsx` line 90: `{campaignId && campaignId !== "new" && (` wraps Campaign group only. Organization group at line 109 is unconditional. No `if (!campaignId` pattern exists anywhere in the file.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/v1/org/campaigns returns campaigns with status field | VERIFIED | `OrgCampaignResponse.status` in schemas, `getattr(r["campaign"], "status", None)` in endpoint |
| 2 | GET /api/v1/org/members returns members with per-campaign role arrays | VERIFIED | `OrgMemberResponse.campaign_roles: list[CampaignRoleEntry]`, `list_members_with_campaign_roles` service method |
| 3 | PATCH /api/v1/org updates org name for org_owner | VERIFIED | `update_org` endpoint with `require_org_role("org_owner")` dependency |
| 4 | POST /api/v1/org/campaigns/{id}/members adds org member to campaign | VERIFIED | `add_member_to_campaign` endpoint with 400/404 error handling |
| 5 | GET /api/v1/me/orgs returns all orgs the user belongs to | VERIFIED | `list_my_orgs` in users.py using `get_current_user`, returns `UserOrgResponse` list |
| 6 | Frontend has typed hooks for all org API calls | VERIFIED | `useOrgCampaigns`, `useOrgMembers`, `useMyOrgs`, `useArchiveCampaign`, `useUpdateOrg`, `useAddMemberToCampaign` all in useOrg.ts (92 lines) |
| 7 | RequireOrgRole component hides children when user lacks org role | VERIFIED | `RequireOrgRole.tsx` (22 lines) mirrors `RequireRole` pattern, uses `useOrgPermissions().hasOrgRole` |
| 8 | authStore has switchOrg method using signinRedirect with org scope | VERIFIED | `switchOrg` in authStore.ts uses `urn:zitadel:iam:org:id:${zitadelOrgId}` scope |
| 9 | Org nav links (Members, Settings) accessible from org-level pages | VERIFIED | AppSidebar Organization group renders unconditionally (line 109); `Link to="/org/members"` at line 124, `Link to="/org/settings"` at line 132; early `return null` removed |

**Score:** 9/9 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/schemas/org.py` | OrgUpdate, UserOrgResponse, AddMemberToCampaignRequest, CampaignRoleEntry | VERIFIED | All 4 classes present, `OrgCampaignResponse.status` field, `OrgMemberResponse.campaign_roles` field |
| `web/src/types/org.ts` | OrgCampaign, OrgMember, UserOrg, AddMemberRequest interfaces | VERIFIED | All interfaces present with correct shapes |
| `web/src/hooks/useOrg.ts` | 6 TanStack Query hooks | VERIFIED | All 6 hooks exported (92 lines) |
| `web/src/components/shared/RequireOrgRole.tsx` | Org-level role gate | VERIFIED | `export function RequireOrgRole`, uses `hasOrgRole` (22 lines) |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/routes/index.tsx` | Org dashboard replacing campaign list | VERIFIED | `OrgDashboard` function, uses `useOrgCampaigns`, `RequireOrgRole`, archive dialog (202 lines) |
| `web/src/components/org/OrgSwitcher.tsx` | Header org switcher dropdown | VERIFIED | Uses `switchOrg`, `zitadel_org_id`, multi/single org logic |
| `web/src/components/org/CampaignCard.tsx` | Campaign card with three-dot menu | VERIFIED | `aria-label="Campaign actions"`, `stopPropagation` on dropdown |
| `web/src/components/org/StatsBar.tsx` | Stats summary bar | VERIFIED | "active campaigns" text, accepts `activeCampaignCount` and `memberCount` props |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/routes/campaigns/new.tsx` | 3-step campaign creation wizard | VERIFIED | 543 lines, `WizardStepIndicator`, `useState` for step, all 3 step labels |

### Plan 04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/routes/org/members.tsx` | Member directory page | VERIFIED | `createFileRoute("/org/members")`, `useOrgMembers`, loading skeleton (102 lines) |
| `web/src/routes/org/settings.tsx` | Org settings page | VERIFIED | `createFileRoute("/org/settings")`, "Organization Name", "Save Changes", `useUpdateOrg`, `DangerZone` (132 lines) |
| `web/src/components/org/AddToCampaignDialog.tsx` | Add member to campaign dialog | VERIFIED | `useAddMemberToCampaign`, checkbox+role select pattern |
| `web/src/components/org/RoleMatrixTable.tsx` | Per-campaign role matrix | VERIFIED | `overflow-x-auto`, "Add to Campaign" button, em-dash for no membership |
| `web/src/components/org/DangerZone.tsx` | Danger zone component | VERIFIED | `border-l-destructive`, "Transfer Ownership", "Delete Organization" |

### Plan 05 Artifacts (Gap Closure)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/routes/__root.tsx` | Refactored AppSidebar that always renders on authenticated routes | VERIFIED | Early `return null` removed; Campaign group conditional (line 90); Organization group unconditional (line 109); 282 lines |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `web/src/hooks/useOrg.ts` | `/api/v1/org/campaigns` | `api.get("api/v1/org/campaigns")` | WIRED | Direct ky call |
| `web/src/hooks/useOrg.ts` | `/api/v1/org/members` | `api.get("api/v1/org/members")` | WIRED | Direct ky call |
| `web/src/hooks/useOrg.ts` | `/api/v1/me/orgs` | `api.get("api/v1/me/orgs")` | WIRED | Direct ky call |
| `web/src/hooks/useOrg.ts` | `/api/v1/org/campaigns/{id}/members` | `api.post(...)` | WIRED | Parameterized URL |
| `web/src/hooks/useOrg.ts` | `PATCH /api/v1/org` | `api.patch("api/v1/org", ...)` | WIRED | Direct ky call |
| `web/src/components/org/OrgSwitcher.tsx` | `authStore.switchOrg` | `useAuthStore((s) => s.switchOrg)` | WIRED | Store selector |
| `web/src/routes/__root.tsx` | `OrgSwitcher` | `import { OrgSwitcher }` | WIRED | Line 49 import, line 269 usage in header |
| `web/src/routes/__root.tsx` | `/org/members` nav | `Link to="/org/members"` in Organization group | WIRED | Line 124, unconditional Organization group |
| `web/src/routes/__root.tsx` | `/org/settings` nav | `Link to="/org/settings"` in Organization group | WIRED | Line 132, unconditional Organization group |
| `web/src/routes/index.tsx` | `useOrgCampaigns` | `import from @/hooks/useOrg` | WIRED | Import + usage |
| `web/src/routes/org/members.tsx` | `useOrgMembers` | `import from @/hooks/useOrg` | WIRED | Import + usage |
| `web/src/routes/org/settings.tsx` | `useUpdateOrg` | `import from @/hooks/useOrg` | WIRED | Import + usage |
| `web/src/components/org/AddToCampaignDialog.tsx` | `useAddMemberToCampaign` | `import from @/hooks/useOrg` | WIRED | Import + usage |
| `web/src/routes/campaigns/new.tsx` | `POST /api/v1/campaigns` | `api.post("api/v1/campaigns", ...)` | WIRED | Direct ky call |
| `web/src/routes/campaigns/new.tsx` | `useAddMemberToCampaign` | `import from @/hooks/useOrg` | WIRED | Import + usage |

**Previously PARTIAL links now WIRED:** `/org/members` and `/org/settings` nav links are now inside an unconditionally-rendered Organization group (no `return null` gating).

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `web/src/routes/index.tsx` OrgDashboard | `campaigns` from `useOrgCampaigns()` | `GET /api/v1/org/campaigns` -> `OrgService.list_campaigns()` -> DB `select(Campaign)` | Yes -- live SQLAlchemy query | FLOWING |
| `web/src/routes/org/members.tsx` | `members` from `useOrgMembers()` | `GET /api/v1/org/members` -> `list_members_with_campaign_roles()` -> `select(OrganizationMember, User)` | Yes -- real DB queries | FLOWING |
| `web/src/routes/org/settings.tsx` | `org` from `useQuery(["org"])` | `GET /api/v1/org` -> `select(Organization).where(...)` | Yes -- live DB query | FLOWING |
| `web/src/components/org/OrgSwitcher.tsx` | `orgs` from `useOrgPermissions()` -> `useMyOrgs()` | `GET /api/v1/me/orgs` -> `select(Organization, OrganizationMember.role)` | Yes -- live DB query | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED (requires running dev server with OIDC auth; no runnable entry points without live services)

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORG-05 | 43-01, 43-02 | Org dashboard at `/org` shows campaign card grid with status, election date, and member counts | SATISFIED | `OrgDashboard` at `/` with `CampaignCard` showing badge, election date, member count |
| ORG-06 | 43-04 | Org member directory shows all users across all campaigns with per-campaign role matrix | SATISFIED | `RoleMatrixTable` at `/org/members`, dynamic campaign columns |
| ORG-07 | 43-02 | Only `org_admin`+ can create campaigns within an org | SATISFIED | `RequireOrgRole minimum="org_admin"` wraps Create Campaign button |
| ORG-08 | 43-03 | Campaign creation wizard is multi-step | SATISFIED | 3-step wizard with `WizardStepIndicator`, per-step validation |
| ORG-09 | 43-01, 43-04 | Org settings page allows name edit (org_owner only) and displays read-only ZITADEL org ID | SATISFIED | `/org/settings` with conditional `readOnly={!isOwner}`, `zitadel_org_id` field |
| ORG-10 | 43-01, 43-03, 43-04 | Org admin can add existing org member to a campaign directly | SATISFIED | `POST /api/v1/org/campaigns/{id}/members` + `AddToCampaignDialog` |
| ORG-11 | 43-02 | Campaign archival UI button transitions active campaigns to archived status | SATISFIED | Three-dot menu -> confirmation dialog -> `useArchiveCampaign()` PATCH |
| ORG-12 | 43-01, 43-02 | User can belong to multiple orgs with an org switcher in the UI header | SATISFIED | `OrgSwitcher` in header, multi-org dropdown, single-org plain text |
| ORG-13 | 43-01, 43-02 | All queries/routes scope correctly to the selected org context | SATISFIED | All backend org endpoints filter by `org_id` from JWT claim; `switchOrg` re-auths |

All 9 requirements (ORG-05 through ORG-13) are SATISFIED. No orphaned requirements found -- REQUIREMENTS.md maps exactly ORG-05 through ORG-13 to Phase 43, matching the plan frontmatter.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/src/components/org/DangerZone.tsx` | Multiple | "Coming soon" tooltips on Transfer Ownership and Delete Organization | Info | Expected -- these are planned future features, not stubs; buttons are disabled with tooltip explanation |
| `web/src/routes/campaigns/new.tsx` | Multiple | `placeholder=` attributes in Input fields | Info | Proper HTML placeholder attributes, not stub code |

No blocker or warning anti-patterns found.

---

## Human Verification Required

### 1. Org Switcher -- Single Org Display

**Test:** Log in with a user belonging to exactly one org. Check the header between the SidebarTrigger separator and the UserMenu.
**Expected:** Org name appears as plain text (no dropdown chevron). No interaction possible.
**Why human:** Requires live OIDC session; single-org rendering path in OrgSwitcher depends on `useMyOrgs()` returning exactly 1 item.

### 2. Archive Flow -- End-to-End

**Test:** On the org dashboard, open the three-dot menu on an active campaign card, click "Archive Campaign", confirm in the dialog.
**Expected:** Campaign card moves from the active grid to the "Archived (N)" collapsed section; toast "X archived." appears; the active campaign grid updates without page refresh.
**Why human:** Requires live session with a running API and campaign data in active status.

### 3. RequireOrgRole Gate -- Non-Admin User

**Test:** Log in with a user who has no org role (only a campaign role). Check the org dashboard.
**Expected:** "Create Campaign" button is not rendered; the empty state's "Create Campaign" CTA is also absent.
**Why human:** Requires JWT with no org role claim; `useOrgPermissions().hasOrgRole("org_admin")` must return false.

### 4. Settings Save -- Org Owner vs Non-Owner

**Test 4a:** Log in as org_owner, navigate to /org/settings. Verify name field is editable and "Save Changes" button appears.
**Test 4b:** Log in as org_admin (not owner), navigate to /org/settings. Verify name field is read-only (muted styling) and no Save button appears.
**Expected:** Different form behavior based on `isOwner` flag from `hasOrgRole("org_owner")`.
**Why human:** Requires two OIDC sessions with distinct role levels.

### 5. Sidebar Navigation on Org-Level Pages (Gap Closure Confirmation)

**Test:** Navigate to /, /org/members, and /org/settings. Verify the sidebar is visible and contains the Organization group with All Campaigns, Members, and Settings links.
**Expected:** Sidebar renders on all three routes. Campaign group is absent (no campaignId in URL). Organization group with all three links is visible.
**Why human:** Requires live browser session to confirm visual rendering; grep confirms code structure but not runtime behavior.

---

## Gaps Summary

No gaps remain. The single gap from the initial verification (sidebar nav absent on org-level pages) has been closed by plan 43-05. All 9 observable truths are verified, all 14 artifacts pass existence/substantive/wired checks, all 15 key links are WIRED, all 4 data flows are FLOWING, and all 9 requirements (ORG-05 through ORG-13) are SATISFIED.

---

_Verified: 2026-03-24_
_Verifier: Claude (gsd-verifier)_
