# Phase 43: Organization UI - Research

**Researched:** 2026-03-24
**Domain:** React frontend (TanStack Router/Query, shadcn/ui) + FastAPI backend CRUD
**Confidence:** HIGH

## Summary

Phase 43 builds the organization management UI layer on top of Phase 41's backend foundation. The existing backend provides 3 read-only org endpoints (GET org, GET campaigns, GET members) that need extending with 4 new endpoints: list user orgs, PATCH org name, POST add member to campaign, PATCH campaign status (archive). The frontend replaces the current home page campaign grid with an org-scoped dashboard, converts the single-page campaign creation form into a 3-step wizard, and adds org member directory, org settings, and multi-org switching.

The project's established frontend patterns -- TanStack Router file-based routing, TanStack Query for data fetching, react-hook-form + zod for form validation, shadcn/ui components, ky HTTP client -- are well-suited for all requirements. No new libraries are needed. The campaign PATCH endpoint already accepts a `status` field, so campaign archival requires only frontend wiring. The ZITADEL org switch uses `signinRedirect` with the scope `urn:zitadel:iam:org:id:{orgId}` to enforce the target organization context.

**Primary recommendation:** Build backend endpoints first (4 new endpoints), then implement frontend features in order: org dashboard (replaces home), org switcher, campaign wizard, member directory, org settings. Each feature maps to a clear route/component boundary.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Org dashboard replaces the current home page at `/`. No separate `/org` route for the dashboard
- D-02: Campaign cards show status badge (active/archived), election date, and member count
- D-03: Archived campaigns in separate collapsed section below active campaigns
- D-04: Quick stats summary bar above campaign grid: "N active campaigns . M members"
- D-05: Org switcher in header bar, top-right near user avatar. Dropdown with current org name + chevron
- D-06: Switching orgs navigates to `/` showing new org's campaigns
- D-07: Org switch triggers ZITADEL re-auth with org hint param (silent signinRedirect)
- D-08: Multi-org requires new backend endpoint to list user's orgs
- D-09: 3-step wizard: Step 1 (name, type, jurisdiction, election date, candidate), Step 2 (confirm org + review), Step 3 (optional team invite)
- D-10: Team invite step shows checkbox list of org members with per-member role assignment dropdown
- D-11: 'New Campaign' button hidden for non-org-admin users (RequireRole hides pattern)
- D-12: Member directory as table with campaign columns, rows = members, cells = role or dash
- D-13: 'Add to campaign' action from member row opens dialog with campaign + role picker
- D-14: Org settings: editable org name (org_owner only), read-only ZITADEL org ID, danger zone placeholder
- D-15: Campaign archival via three-dot menu on campaign card, confirmation dialog, moves to archived section

### Claude's Discretion
- Wizard step indicator design (progress dots, stepper, etc.)
- Role matrix table layout and responsive behavior for many campaigns
- Org switcher dropdown styling and animation
- Loading/skeleton states for org dashboard
- Danger zone visual treatment on settings page
- Backend endpoint design for new CRUD operations

### Deferred Ideas (OUT OF SCOPE)
- Org-level aggregate dashboards (cross-campaign metrics)
- Org invite link (shareable URL to join org)
- Org activity feed (timeline of cross-campaign actions)
- Remove member from all campaigns (one-click)
- Billing/subscription placeholder page
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-05 | Org dashboard at `/org` shows campaign card grid with status, election date, and member counts | Existing `GET /api/v1/org/campaigns` returns all needed data. Replace `web/src/routes/index.tsx` with org dashboard. OrgCampaignResponse needs `status` field added |
| ORG-06 | Org member directory shows all users across all campaigns with per-campaign role matrix | Existing `GET /api/v1/org/members` returns org members. Need new endpoint or extend to include per-campaign roles. New route at `/org/members` |
| ORG-07 | Only `org_admin`+ can create campaigns within an org | Use `RequireOrgRole` component (new, mirrors `RequireRole` pattern) to hide "Create Campaign" button |
| ORG-08 | Campaign creation wizard is multi-step | Replace `web/src/routes/campaigns/new.tsx` with 3-step wizard using react-hook-form, existing zod validation, useState for step tracking |
| ORG-09 | Org settings page allows name edit (org_owner only) and displays read-only ZITADEL org ID | New `PATCH /api/v1/org` endpoint. New route at `/org/settings`. Follow `settings/general.tsx` pattern |
| ORG-10 | Org admin can add existing org member to a campaign directly | New `POST /api/v1/org/campaigns/{campaign_id}/members` endpoint. AddToCampaignDialog component |
| ORG-11 | Campaign archival UI button transitions active campaigns to archived status | Existing `PATCH /api/v1/campaigns/{id}` already accepts `status` field. Frontend three-dot menu + confirmation dialog |
| ORG-12 | User can belong to multiple orgs with org switcher in UI header | New `GET /api/v1/me/orgs` endpoint (no org_admin gate). OrgSwitcher component using `signinRedirect` with org scope |
| ORG-13 | All queries/routes scope correctly to the selected org context | JWT org_id is authoritative (from `urn:zitadel:iam:user:resourceowner:id` claim). After org switch re-auth, all API calls automatically scoped via JWT |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Always use `uv` for Python environment/tasks (not pip/poetry)
- Use Context7 MCP for latest documentation lookup
- Use Conventional Commits for commit messages
- Stack: Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL, ZITADEL (OIDC auth)
- Frontend: React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- Linting: `uv run ruff check .` / `uv run ruff format .`
- Tests: `uv run pytest` (backend), `vitest` (frontend)
- Line length: 88 chars

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-router | ^1.159.5 | File-based routing, wizard step navigation | Already used, file-based route convention |
| @tanstack/react-query | ^5.90.21 | Data fetching, cache invalidation | Already used for all API calls |
| react-hook-form | ^7.71.1 | Form state management (wizard) | Already used in campaign creation, settings |
| zod | ^4.3.6 | Schema validation | Already paired with react-hook-form via @hookform/resolvers |
| ky | ^1.14.3 | HTTP client | Already configured with auth interceptor |
| shadcn/ui (radix-ui) | ^1.4.3 | UI components | Already installed, new-york preset |
| oidc-client-ts | ^3.1.0 | OIDC auth, org switch via signinRedirect | Already configured in authStore |
| zustand | ^5.0.11 | Client state (auth store) | Already used for auth state |
| lucide-react | ^0.563.0 | Icons | Already used throughout |
| sonner | ^2.0.7 | Toast notifications | Already used for success/error feedback |
| FastAPI | (Docker) | Backend API | Already running in Docker |
| SQLAlchemy | (Docker) | ORM, async queries | Already used for all models |

### No New Dependencies Needed

This phase requires zero new npm or pip packages. All functionality is achievable with the existing stack.

## Architecture Patterns

### New Routes Structure
```
web/src/routes/
  index.tsx                    # MODIFY: Replace CampaignList with OrgDashboard
  campaigns/
    new.tsx                    # MODIFY: Replace single form with 3-step wizard
  org/
    members.tsx                # NEW: Member directory with role matrix table
    settings.tsx               # NEW: Org settings page (name edit, ZITADEL ID, danger zone)
```

### New Backend Endpoints
```
app/api/v1/
  org.py                       # EXTEND: Add PATCH org, POST add-member-to-campaign
  me.py                        # NEW or extend: GET /api/v1/me/orgs (list user's orgs)
```

### Pattern 1: Multi-Step Wizard with react-hook-form

**What:** 3-step campaign creation wizard managing form state across steps
**When to use:** D-09 campaign creation wizard
**Example:**
```typescript
// Single useForm instance shared across all steps
// useState for step tracking (not route-based steps)
const [step, setStep] = useState(1)
const form = useForm<WizardFormValues>({
  resolver: zodResolver(wizardSchema),
  defaultValues: { name: "", type: "", ... },
})

// Per-step validation before advancing
const handleNext = async () => {
  const valid = await form.trigger(stepFields[step])
  if (valid) setStep((s) => s + 1)
}
```
**Why not route-based steps:** Simpler state management, no URL history pollution, `useFormGuard` works naturally with single form instance.

### Pattern 2: Org Role Gating Component

**What:** `RequireOrgRole` component mirroring existing `RequireRole`
**When to use:** Hiding org-admin-only UI elements (Create Campaign button, settings)
**Example:**
```typescript
// Mirrors RequireRole pattern exactly
interface RequireOrgRoleProps {
  minimum: "org_admin" | "org_owner"
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireOrgRole({ minimum, children, fallback = null }: RequireOrgRoleProps) {
  const { hasOrgRole } = useOrgPermissions()
  return hasOrgRole(minimum) ? <>{children}</> : <>{fallback}</>
}
```

### Pattern 3: ZITADEL Org Switch via signinRedirect

**What:** Silent re-authentication with org scope to switch organizations
**When to use:** D-07 org switcher
**Example:**
```typescript
// In authStore.ts -- add switchOrg method
switchOrg: async (zitadelOrgId: string) => {
  const mgr = await ensureUserManager()
  // ZITADEL org scoping via reserved scope
  await mgr.signinRedirect({
    scope: `openid profile email urn:zitadel:iam:org:id:${zitadelOrgId} ...existingScopes`,
  })
}
```
**Key insight:** After redirect callback, the JWT `urn:zitadel:iam:user:resourceowner:id` claim will contain the new org ID. All subsequent API calls are automatically scoped to the new org because the backend reads org_id from the JWT.

### Pattern 4: Three-Dot Menu on Cards (stopPropagation)

**What:** DropdownMenu on clickable cards that doesn't trigger card navigation
**When to use:** Campaign card archive action
**Example:**
```typescript
<Link to={`/campaigns/${campaign.id}/dashboard`}>
  <Card className="hover:border-primary/50">
    {/* Card content */}
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" aria-label="Campaign actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => setArchiveTarget(campaign)}>
          Archive Campaign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </Card>
</Link>
```

### Anti-Patterns to Avoid
- **Route-per-wizard-step:** Don't create `/campaigns/new/step1`, `/campaigns/new/step2` routes. Use component state. Route-based steps create browser history pollution and complicate form state management.
- **Custom org context store:** Don't create a separate Zustand store for "current org". The JWT org_id IS the current org context. After re-auth with org scope, the JWT is authoritative.
- **Polling for org switch completion:** Don't poll. The `signinRedirect` is a full page redirect -- the callback handler in `authStore.handleCallback` already sets the new user/JWT.
- **Separate org dashboard route:** Don't create `/org/dashboard`. Per D-01, the org dashboard IS the home page at `/`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state across wizard steps | Custom step state manager | Single `useForm` + `form.trigger(fields)` per step | react-hook-form handles dirty tracking, validation, reset across all steps natively |
| Navigation blocking | Custom beforeunload handler | `useFormGuard` (existing) | Already tested, handles both route changes and browser close |
| Confirmation dialogs | Custom modal state | `ConfirmDialog` component (existing) | Already has destructive variant, loading state, standardized layout |
| Toast notifications | Custom notification system | `sonner` toast (existing) | Already configured via `<Toaster />` in root layout |
| Role gating | Conditional rendering with inline checks | `RequireOrgRole` component (new, mirrors `RequireRole`) | Consistent hide-vs-disable pattern, reusable across all org pages |
| Campaign status PATCH | New archive-specific endpoint | Existing `PATCH /api/v1/campaigns/{id}` with `{ status: "archived" }` | Endpoint already accepts status field, no backend change needed |

## Common Pitfalls

### Pitfall 1: OrgCampaignResponse Missing Status Field
**What goes wrong:** The dashboard needs to show Active/Archived badges and separate campaigns by status, but `OrgCampaignResponse` schema doesn't include `status`.
**Why it happens:** Phase 41 built read-only org endpoints for basic listing, not the full dashboard.
**How to avoid:** Add `status: str` to `OrgCampaignResponse` schema and include it in the `list_org_campaigns` endpoint response mapping.
**Warning signs:** Campaigns all appear in one section with no badge.

### Pitfall 2: Org Switcher Requires Unauthenticated Endpoint
**What goes wrong:** The "list user orgs" endpoint needs to work for any authenticated user, but all existing org endpoints require `org_admin` role.
**Why it happens:** Phase 41 gated everything behind `require_org_role("org_admin")`. The org list for the switcher needs to show ALL orgs the user belongs to, not just orgs where they're admin.
**How to avoid:** Create `GET /api/v1/me/orgs` gated only by `get_current_user` (any authenticated user), not `require_org_role`. Query `OrganizationMember` by `user_id` and join to `Organization`.
**Warning signs:** Non-admin users can't see the org switcher dropdown.

### Pitfall 3: stopPropagation on Card Three-Dot Menu
**What goes wrong:** Clicking the three-dot menu on a campaign card navigates to the campaign dashboard instead of opening the dropdown.
**Why it happens:** The card is wrapped in a `<Link>`, so any click bubbles up to the link.
**How to avoid:** Apply `onClick={(e) => e.stopPropagation()}` on both the `DropdownMenuTrigger` and `DropdownMenuContent`.
**Warning signs:** Clicking the dots navigates away, dropdown never opens.

### Pitfall 4: Wizard Form State Lost on Browser Back
**What goes wrong:** User fills step 1, clicks next, then hits browser back -- form data disappears.
**Why it happens:** If using route-based steps, each step remounts the form.
**How to avoid:** Use single-component wizard with `useState` for step tracking. One `useForm` instance persists across all steps. `useFormGuard` blocks accidental navigation.
**Warning signs:** Form fields empty after going back.

### Pitfall 5: Member Directory Missing Per-Campaign Roles
**What goes wrong:** The member directory shows org members but the role matrix columns are empty.
**Why it happens:** `GET /api/v1/org/members` only returns org-level role, not per-campaign memberships.
**How to avoid:** Extend the endpoint to include campaign memberships for each member, or add a separate endpoint that returns the role matrix. Query `CampaignMember` joined with `Campaign` for each org member.
**Warning signs:** Role matrix cells all show dashes.

### Pitfall 6: ZITADEL Org Scope Format
**What goes wrong:** Org switch fails silently or ZITADEL ignores the org hint.
**Why it happens:** Using wrong scope format. ZITADEL requires `urn:zitadel:iam:org:id:{id}` where `{id}` is the ZITADEL org ID (not the internal UUID).
**How to avoid:** Use `organization.zitadel_org_id` (string like "289366875843649539") in the scope, not `organization.id` (UUID).
**Warning signs:** After org switch, JWT still shows the old org_id.

## Code Examples

### Backend: List User Orgs Endpoint
```python
# app/api/v1/me.py or extend org.py
@router.get("/me/orgs", response_model=list[UserOrgResponse])
async def list_my_orgs(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all organizations the current user belongs to."""
    stmt = (
        select(Organization, OrganizationMember.role)
        .join(OrganizationMember, Organization.id == OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == user.id)
        .order_by(Organization.name)
    )
    results = await db.execute(stmt)
    return [
        UserOrgResponse(
            id=org.id,
            name=org.name,
            zitadel_org_id=org.zitadel_org_id,
            role=role,
        )
        for org, role in results.all()
    ]
```

### Backend: PATCH Org Name
```python
@router.patch("", response_model=OrgResponse)
async def update_org(
    body: OrgUpdate,
    user: AuthenticatedUser = Depends(require_org_role("org_owner")),
    db: AsyncSession = Depends(get_db),
):
    """Update organization details. Requires org_owner."""
    org = await db.scalar(
        select(Organization).where(Organization.zitadel_org_id == user.org_id)
    )
    if body.name is not None:
        org.name = body.name
    await db.commit()
    await db.refresh(org)
    return OrgResponse.model_validate(org)
```

### Backend: Add Member to Campaign
```python
@router.post("/campaigns/{campaign_id}/members")
async def add_member_to_campaign(
    campaign_id: uuid.UUID,
    body: AddMemberRequest,
    user: AuthenticatedUser = Depends(require_org_role("org_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Add existing org member to a campaign with specified role."""
    # Verify campaign belongs to user's org
    # Verify target user is org member
    # Create CampaignMember record
    ...
```

### Frontend: Org Dashboard Query Hook
```typescript
// web/src/hooks/useOrg.ts
export function useOrgCampaigns() {
  return useQuery({
    queryKey: ["org", "campaigns"],
    queryFn: () => api.get("api/v1/org/campaigns").json<OrgCampaign[]>(),
  })
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ["org", "members"],
    queryFn: () => api.get("api/v1/org/members").json<OrgMember[]>(),
  })
}

export function useMyOrgs() {
  return useQuery({
    queryKey: ["me", "orgs"],
    queryFn: () => api.get("api/v1/me/orgs").json<UserOrg[]>(),
  })
}

export function useArchiveCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) =>
      api.patch(`api/v1/campaigns/${campaignId}`, {
        json: { status: "archived" },
      }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "campaigns"] })
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    },
  })
}
```

### Frontend: Auth Store Org Switch
```typescript
// Add to authStore.ts
switchOrg: async (zitadelOrgId: string) => {
  const mgr = await ensureUserManager()
  const config = await loadConfig()
  await mgr.signinRedirect({
    scope: [
      "openid", "profile", "email",
      `urn:zitadel:iam:org:id:${zitadelOrgId}`,
      `urn:zitadel:iam:user:resourceowner`,
      `urn:zitadel:iam:org:project:id:${config.zitadel_project_id}:aud`,
      `urn:zitadel:iam:org:project:id:${config.zitadel_project_id}:roles`,
      `urn:zitadel:iam:org:projects:roles`,
    ].join(" "),
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-page campaign form | Multi-step wizard with react-hook-form | This phase | Better UX, org context confirmation, team invite |
| Campaign list at `/` | Org-scoped dashboard at `/` | This phase | Multi-org awareness, stats bar, archived separation |
| JWT org_id implicit | Explicit org switching via OIDC scope | This phase | Multi-org support enabled |
| Campaign-only role checks | Org-level + campaign-level role checks | Phase 41 (backend) + this phase (frontend) | `RequireOrgRole` component mirrors `RequireRole` |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (frontend) | vitest 4.0.18 + @testing-library/react 16.3.2 |
| Framework (backend) | pytest (asyncio_mode=auto) |
| Config file (frontend) | `web/vitest.config.ts` |
| Quick run command (frontend) | `cd web && npx vitest run --reporter=verbose` |
| Quick run command (backend) | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `cd web && npx vitest run && cd .. && uv run pytest tests/unit/ -x` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-05 | Org dashboard renders campaign cards with status/date/members | unit (component) | `cd web && npx vitest run src/routes/index.test.tsx` | Wave 0 |
| ORG-06 | Member directory renders role matrix table | unit (component) | `cd web && npx vitest run src/routes/org/members.test.tsx` | Wave 0 |
| ORG-07 | Create Campaign button hidden for non-org-admin | unit (component) | `cd web && npx vitest run src/routes/index.test.tsx` | Wave 0 |
| ORG-08 | Wizard validates per-step, advances correctly | unit (component) | `cd web && npx vitest run src/routes/campaigns/new.test.tsx` | Wave 0 |
| ORG-09 | Org settings PATCH endpoint updates name | unit (backend) | `uv run pytest tests/unit/test_org_settings.py -x` | Wave 0 |
| ORG-10 | Add member to campaign creates CampaignMember | unit (backend) | `uv run pytest tests/unit/test_org_api.py -x` | Extends existing |
| ORG-11 | Archive campaign sets status via existing PATCH | unit (component) | `cd web && npx vitest run src/routes/index.test.tsx` | Wave 0 |
| ORG-12 | Org switcher renders user orgs, triggers redirect | unit (component) | `cd web && npx vitest run src/components/org/OrgSwitcher.test.tsx` | Wave 0 |
| ORG-13 | API calls scoped to JWT org_id after switch | manual | Manual verification after org switch | manual-only |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose` + `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** Full suite (frontend + backend unit)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/routes/index.test.tsx` -- covers ORG-05, ORG-07, ORG-11
- [ ] `web/src/routes/org/members.test.tsx` -- covers ORG-06
- [ ] `web/src/routes/campaigns/new.test.tsx` -- covers ORG-08
- [ ] `web/src/components/org/OrgSwitcher.test.tsx` -- covers ORG-12
- [ ] `tests/unit/test_org_settings.py` -- covers ORG-09 (PATCH org name)
- [ ] Extend `tests/unit/test_org_api.py` -- covers ORG-10 (add member to campaign)

## Open Questions

1. **Member directory per-campaign role data**
   - What we know: `GET /api/v1/org/members` returns org members with org-level role only
   - What's unclear: Best approach to include per-campaign roles -- extend existing endpoint with nested data, or separate endpoint?
   - Recommendation: Extend `OrgMemberResponse` to include `campaign_roles: list[{campaign_id, campaign_name, role}]` and query `CampaignMember` in `list_members`. Keeps it to one API call for the directory page.

2. **Org switcher scope interaction with existing scopes**
   - What we know: Current auth store uses `urn:zitadel:iam:user:resourceowner` and project-specific scopes
   - What's unclear: Whether adding `urn:zitadel:iam:org:id:{id}` scope replaces or coexists with `urn:zitadel:iam:user:resourceowner`
   - Recommendation: Include both in the scope string. The org ID scope enforces org context while resourceowner scope ensures the claim is present in the JWT. Test with a manual org switch first.

3. **Campaign archival read-only enforcement**
   - What we know: UI-SPEC says "archived campaigns become read-only"
   - What's unclear: Whether backend already enforces read-only for archived campaigns or if this is UI-only
   - Recommendation: For this phase, enforce read-only at the UI level only (hide edit buttons, show read-only badges). Backend enforcement of archived-campaign write-blocking can be a follow-up.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `app/api/v1/org.py`, `app/services/org.py`, `app/schemas/org.py` -- existing org endpoints
- Codebase inspection: `app/core/security.py` -- OrgRole enum, require_org_role, resolve_campaign_role
- Codebase inspection: `app/api/v1/campaigns.py` line 115 -- PATCH already accepts status field
- Codebase inspection: `web/src/routes/index.tsx` -- current home page to replace
- Codebase inspection: `web/src/routes/campaigns/new.tsx` -- current form to convert to wizard
- Codebase inspection: `web/src/stores/authStore.ts` -- OIDC auth with signinRedirect
- Codebase inspection: `web/src/hooks/usePermissions.ts` -- role hierarchy pattern
- Codebase inspection: `web/src/components/shared/RequireRole.tsx` -- hide-vs-disable gating pattern
- Codebase inspection: `web/src/routes/campaigns/$campaignId/settings/danger.tsx` -- danger zone pattern

### Secondary (MEDIUM confidence)
- [ZITADEL OIDC Auth Request docs](https://zitadel.com/docs/apis/openidoauth/authrequest) -- org scope format `urn:zitadel:iam:org:id:{id}`
- [oidc-client-ts docs](https://authts.github.io/oidc-client-ts/) -- signinRedirect accepts scope override

### Tertiary (LOW confidence)
- ZITADEL org switch behavior with multiple scopes (needs live testing)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns established in codebase
- Architecture: HIGH -- file-based routing, query hooks, form patterns all well-established
- Backend endpoints: HIGH -- extending existing patterns (require_org_role, OrgService, etc.)
- ZITADEL org switch: MEDIUM -- scope format verified in docs, but exact interaction with existing scopes needs testing
- Pitfalls: HIGH -- identified from codebase inspection (missing status field, auth gating, stopPropagation)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no fast-moving dependencies)
