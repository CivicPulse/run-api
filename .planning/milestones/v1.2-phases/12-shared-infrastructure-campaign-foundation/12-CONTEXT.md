# Phase 12: Shared Infrastructure & Campaign Foundation - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the shared UI infrastructure that all subsequent phases (13-18) depend on: permission-gated component visibility, reusable data table wrapper, form protection guards, and the campaign settings/member management area. This phase delivers INFR-01 (permission gating), INFR-02 (unsaved form warning), INFR-03 (consistent data tables), and CAMP-01 through CAMP-08 (campaign settings + member management).

</domain>

<decisions>
## Implementation Decisions

### Permission Gating UX
- Hide unauthorized UI elements entirely (do not show disabled/greyed out)
- Parse user role from existing JWT claim (no extra API call) — role already in ZITADEL OIDC token
- Use role-level hierarchy checks: `user.role >= MANAGER` pattern, matching backend `require_role()` exactly
- Build a `<RequireRole minimum="manager">` wrapper component for conditional rendering
- Build a `usePermissions()` hook that extracts role from auth store and exposes `hasRole(minimum)` helper
- Single campaign role per user (from JWT org context) — no global admin concept

### Data Table Patterns
- Prev/Next button pagination matching cursor-based backend (reuse existing PaginationControls component)
- Server-side sorting and filtering — params sent to API, server returns pre-sorted/filtered results
- Comfortable row density (py-3 padding) with hover highlight, no zebra striping — Notion-style
- Row click navigates to detail page; kebab "..." menu on each row for quick actions (edit, delete, etc.)
- Kebab menu actions are permission-gated (hidden for insufficient roles)
- Build a reusable DataTable wrapper component around TanStack Table with these patterns baked in

### Form Protection & UX
- Route blocker via TanStack Router `useBlocker()` + browser `beforeunload` for tab close/refresh
- Minimal confirm dialog on blocked navigation: "You have unsaved changes" with "Discard changes" (destructive) + "Keep editing" (primary) — uses existing ConfirmDialog pattern
- Validate on blur + on submit (react-hook-form with zod resolver, mode: "onBlur")
- Toast notifications via sonner for success/error feedback; submit button shows loading spinner during save
- Build a reusable `useFormGuard()` hook that wires up both route blocking and beforeunload

### Campaign Settings Area
- Settings accessed via gear icon at bottom of sidebar (separate from main nav group) — hidden for users below admin role
- Settings page uses vertical tabs/sidebar sections: "General", "Members", "Danger Zone"
- General section: edit campaign name, description, election date
- Members section: current member list + "Invite member" button that opens inline dialog (email input + role selector); pending invites shown in separate list below; role change and remove actions via kebab menu
- Danger Zone section: delete campaign (requires typing campaign name to confirm) and transfer ownership
- Ownership transfer: select target user (must be admin) from member list, confirm dialog

### Claude's Discretion
- Exact DataTable column definition API/generics design
- Loading skeleton patterns for tables and settings
- Settings sidebar styling and responsive behavior
- Empty state messaging for members list and invites list
- Error boundary patterns for settings area

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EmptyState` component (`web/src/components/shared/EmptyState.tsx`): Icon + title + description + action slot — use for empty tables and empty member lists
- `PaginationControls` component (`web/src/components/shared/PaginationControls.tsx`): Prev/Next buttons — integrate into DataTable wrapper
- `StatusBadge` component (`web/src/components/shared/StatusBadge.tsx`): Colored badges with variants — use for role badges on member list
- `ConfirmDialog` component (`web/src/components/shared/ConfirmDialog.tsx`): Confirmation pattern — extend for destructive confirmations
- 22 shadcn/ui components installed (Table, Dialog, Button, Card, DropdownMenu, Sheet, etc.)
- `useCampaigns.ts` hook: Query/mutation pattern with TanStack Query + ky — template for new hooks

### Established Patterns
- TanStack Router file-based routing: `web/src/routes/campaigns/$campaignId/` — settings routes go here
- TanStack Query for server state: `useQuery`/`useMutation` with `queryClient.invalidateQueries` on mutations
- Zustand for client state: `authStore.ts` — permissions hook can read from here
- ky HTTP client with auth interceptor: `web/src/api/client.ts`
- react-hook-form + zod for form handling (installed, used in existing forms)
- Lucide React for icons (used throughout sidebar and nav)

### Integration Points
- Sidebar nav in `__root.tsx`: Add settings gear icon to bottom of `AppSidebar` component
- Campaign layout in `$campaignId.tsx`: Settings route will be a sibling, not a child of the tab navigation
- Auth store (`authStore.ts`): Role extraction from `user.profile` or token claims
- Backend API routes: `app/api/v1/campaigns.py` (update/delete), `app/api/v1/members.py` (list/role/remove), `app/api/v1/invites.py` (create/list/revoke)

</code_context>

<specifics>
## Specific Ideas

- Settings area should feel like GitHub repository settings — vertical sidebar on left, content on right
- Delete confirmation should require typing campaign name, like GitHub/Vercel destructive actions
- Data tables should feel like Notion databases — comfortable spacing, hover highlights
- Permission gating should be invisible — users simply don't see what they can't do

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-shared-infrastructure-campaign-foundation*
*Context gathered: 2026-03-10*
