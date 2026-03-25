# Phase 43: Organization UI - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Org admins can manage campaigns, members, and settings from an organization-level dashboard. Includes org dashboard with campaign card grid, multi-org switching, multi-step campaign creation wizard with team invite, org member directory with cross-campaign role matrix, org settings page, and campaign archival. All org management UI gated by org_admin+ role.

</domain>

<decisions>
## Implementation Decisions

### Org Dashboard Layout
- **D-01:** Org dashboard replaces the current home page at `/`. Authenticated users land on the org dashboard showing org-scoped campaign cards. No separate `/org` route needed
- **D-02:** Campaign cards show: status badge (active/archived), election date, and member count. Matches ORG-05 requirements exactly
- **D-03:** Archived campaigns appear in a separate collapsed section below active campaigns. Clear visual separation, archived don't clutter the primary view
- **D-04:** Quick stats summary bar above the campaign grid: "N active campaigns · M members". Data available from existing org endpoints without new aggregation queries

### Multi-Org Switching
- **D-05:** Org switcher lives in the header bar, top-right near user avatar. Dropdown showing current org name + chevron. Always visible regardless of page. Similar to GitHub org switcher pattern
- **D-06:** Switching orgs navigates to `/` (the org dashboard) showing the new org's campaigns. Clean reset — no stale campaign context
- **D-07:** Org switch triggers a ZITADEL re-auth with org hint param (silent signinRedirect). Brief loading spinner on dashboard during redirect/callback. User sees: click org → brief spinner → new org dashboard
- **D-08:** Multi-org requires a new backend endpoint to list user's orgs (not yet built in Phase 41). Needed for the switcher dropdown

### Campaign Creation Wizard
- **D-09:** 3-step wizard replacing current single-page form. Step 1: name, type, jurisdiction, election date, candidate. Step 2: confirm org association + review. Step 3: optional team invite (pick existing org members to add). Matches ORG-08 spec
- **D-10:** Team invite step shows checkbox list of all org members. Selected members get added to the campaign immediately with per-member role assignment via dropdown (ORG-10 — no invite email for existing org members)
- **D-11:** 'New Campaign' button hidden entirely for non-org-admin users. Matches existing RequireRole pattern (hides vs disables, per project Key Decisions)

### Member Management & Settings
- **D-12:** Org member directory displays as a table with campaign columns. Rows = members, columns = campaigns. Each cell shows the role or '—' if not a member. Compact and scannable (ORG-06)
- **D-13:** 'Add to campaign' action available from each member row in the directory. Opens a dialog: pick campaign(s), assign role, confirm. Direct from the member directory (ORG-10)
- **D-14:** Org settings page includes editable org name field (org_owner only), read-only ZITADEL org ID, plus a 'Danger Zone' section for future destructive actions (delete org placeholder, transfer ownership). Sets up the pattern even if not all actions are functional yet (ORG-09)
- **D-15:** Campaign archival via three-dot menu on each campaign card with 'Archive campaign' option. Confirmation dialog with campaign name. Archived campaigns move to the collapsed 'Archived' section (ORG-11)

### Claude's Discretion
- Wizard step indicator design (progress dots, stepper, etc.)
- Exact role matrix table layout and responsive behavior for many campaigns
- Org switcher dropdown styling and animation
- Loading/skeleton states for org dashboard
- Danger zone visual treatment on settings page
- Backend endpoint design for new CRUD operations (member add-to-campaign, campaign archival, org name update, list user orgs)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Organization Backend (Phase 41)
- `app/api/v1/org.py` — Existing 3 read-only org endpoints (GET org, campaigns, members)
- `app/services/org.py` — OrgService with list_campaigns, list_members
- `app/schemas/org.py` — OrgResponse, OrgCampaignResponse, OrgMemberResponse schemas
- `app/models/organization.py` — Organization model (zitadel_org_id, name, created_by)
- `app/models/organization_member.py` — OrganizationMember model (user_id, org_id, role, invited_by, joined_at)
- `app/core/security.py` — OrgRole enum, require_org_role(), resolve_campaign_role() with org role integration

### Frontend Patterns
- `web/src/routes/__root.tsx` — Root layout with Sidebar, auth check, campaign nav
- `web/src/routes/index.tsx` — Current home page with campaign card grid (will be replaced)
- `web/src/routes/campaigns/new.tsx` — Current single-page campaign creation form (will become wizard)
- `web/src/hooks/usePermissions.ts` — Campaign-level permission hook (needs org role awareness)
- `web/src/stores/authStore.ts` — OIDC auth store with UserManager (org switch will use signinRedirect)
- `web/src/components/shared/RequireRole.tsx` — Role gating component (hides vs disables pattern)

### UI Components
- `web/src/components/ui/card.tsx` — Card, CardHeader, CardContent, CardTitle, CardDescription
- `web/src/components/ui/badge.tsx` — Status badges
- `web/src/components/ui/dialog.tsx` — Confirmation dialogs
- `web/src/components/ui/dropdown-menu.tsx` — Three-dot menus, org switcher dropdown
- `web/src/components/ui/skeleton.tsx` — Loading skeletons
- `web/src/components/ui/tabs.tsx` — Potential use for settings page sections

### Requirements
- `.planning/REQUIREMENTS.md` — ORG-05 through ORG-13 (Phase 43 requirements)

### Prior Phase Context
- `.planning/phases/41-organization-data-model-auth/41-CONTEXT.md` — Org role hierarchy, role resolution logic, API endpoint design, OrganizationMember schema

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Card` component with hover border transition — reused for campaign cards on org dashboard
- `RequireRole` component — extend or create `RequireOrgRole` for org_admin+ gating
- `Badge` component — campaign status badges (active/archived)
- `DropdownMenu` — campaign card three-dot menu for archive action, org switcher
- `Skeleton` — loading states for dashboard
- `Dialog` — confirmation dialogs (archive campaign, add to campaign)
- `useFormGuard` hook — protect wizard form state across steps
- Combobox pattern (Popover+Command) — potential use in member picker

### Established Patterns
- TanStack Router file-based routing (`web/src/routes/`)
- TanStack Query for data fetching (`useQuery`, `useMutation`, `useQueryClient`)
- Zustand stores for client state (`authStore.ts`)
- shadcn/ui component library throughout
- `api.get()`/`api.post()` via ky HTTP client
- `PaginatedResponse<T>` for list endpoints

### Integration Points
- `web/src/routes/__root.tsx` — Add org switcher to header, add org nav items to sidebar
- `web/src/routes/index.tsx` — Replace campaign list with org dashboard
- `web/src/routes/campaigns/new.tsx` — Replace with multi-step wizard
- New routes needed: `/org/members`, `/org/settings`
- `web/src/stores/authStore.ts` — Add org switch method using signinRedirect with org hint
- New API client calls for: list user orgs, PATCH org, POST add member to campaign, PATCH campaign status (archive)

</code_context>

<specifics>
## Specific Ideas

- Org switcher should feel like GitHub's org switcher — always accessible in the header, not buried in navigation
- Dashboard stats bar keeps it simple: just campaign count + member count, no new aggregation endpoints needed
- Campaign archival is a soft status change (active → archived), not a delete. Archived campaigns remain visible in collapsed section
- Danger zone on org settings follows the pattern of campaign settings (type-to-confirm for destructive actions)
- Team invite in wizard uses checkboxes (not search) because org member lists are small enough — consistent with campaign member lists being client-side searchable

</specifics>

<deferred>
## Deferred Ideas

- Org-level aggregate dashboards (cross-campaign metrics) — listed in REQUIREMENTS.md Future Requirements
- Org invite link (shareable URL to join org) — Future Requirements
- Org activity feed (timeline of cross-campaign actions) — Future Requirements
- Remove member from all campaigns (one-click) — Future Requirements
- Billing/subscription placeholder page — Future Requirements

None — discussion stayed within phase scope

</deferred>

---

*Phase: 43-organization-ui*
*Context gathered: 2026-03-24*
