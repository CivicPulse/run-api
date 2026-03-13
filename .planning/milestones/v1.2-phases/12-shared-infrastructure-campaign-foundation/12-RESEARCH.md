# Phase 12: Shared Infrastructure & Campaign Foundation - Research

**Researched:** 2026-03-10
**Domain:** React UI infrastructure (permission gating, data tables, form protection, campaign settings)
**Confidence:** HIGH

## Summary

Phase 12 builds foundational UI infrastructure that all subsequent phases (13-18) depend on, plus the campaign settings/member management area. The codebase already has all required libraries installed at compatible versions: TanStack Table v8.21.3 for headless tables, TanStack Router v1.166.6 with `useBlocker` for navigation blocking, react-hook-form v7.71.2 with zod v4.3.6 for form handling, and 22 shadcn/ui components. The existing patterns (hooks with TanStack Query, ky HTTP client, Zustand auth store, file-based routing) are well-established and should be followed consistently.

The key technical challenges are: (1) extracting the campaign role from the OIDC JWT claims on the frontend to avoid extra API calls -- the auth store already requests the role scope but does not yet parse roles from the token profile; (2) building a reusable DataTable wrapper around TanStack Table with server-side sorting/filtering/pagination baked in; (3) wiring `useBlocker` with react-hook-form's `formState.isDirty` for form protection. The frontend `CampaignRole` type is missing "viewer" and needs alignment with the backend's 5-level hierarchy (VIEWER=0, VOLUNTEER=1, MANAGER=2, ADMIN=3, OWNER=4).

**Primary recommendation:** Build three reusable infrastructure pieces first (`usePermissions` hook, `DataTable` wrapper, `useFormGuard` hook), then build the campaign settings area consuming them. This ordering validates the infrastructure with a real use case immediately.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hide unauthorized UI elements entirely (do not show disabled/greyed out)
- Parse user role from existing JWT claim (no extra API call) -- role already in ZITADEL OIDC token
- Use role-level hierarchy checks: `user.role >= MANAGER` pattern, matching backend `require_role()` exactly
- Build a `<RequireRole minimum="manager">` wrapper component for conditional rendering
- Build a `usePermissions()` hook that extracts role from auth store and exposes `hasRole(minimum)` helper
- Single campaign role per user (from JWT org context) -- no global admin concept
- Prev/Next button pagination matching cursor-based backend (reuse existing PaginationControls component)
- Server-side sorting and filtering -- params sent to API, server returns pre-sorted/filtered results
- Comfortable row density (py-3 padding) with hover highlight, no zebra striping -- Notion-style
- Row click navigates to detail page; kebab "..." menu on each row for quick actions (edit, delete, etc.)
- Kebab menu actions are permission-gated (hidden for insufficient roles)
- Build a reusable DataTable wrapper component around TanStack Table with these patterns baked in
- Route blocker via TanStack Router `useBlocker()` + browser `beforeunload` for tab close/refresh
- Minimal confirm dialog on blocked navigation: "You have unsaved changes" with "Discard changes" (destructive) + "Keep editing" (primary) -- uses existing ConfirmDialog pattern
- Validate on blur + on submit (react-hook-form with zod resolver, mode: "onBlur")
- Toast notifications via sonner for success/error feedback; submit button shows loading spinner during save
- Build a reusable `useFormGuard()` hook that wires up both route blocking and beforeunload
- Settings accessed via gear icon at bottom of sidebar (separate from main nav group) -- hidden for users below admin role
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-01 | UI shows/hides actions based on user's campaign role (permission-gated) | `usePermissions()` hook + `<RequireRole>` component; role extracted from JWT claims via oidc-client-ts User.profile; backend role hierarchy (VIEWER=0..OWNER=4) |
| INFR-02 | User is warned before navigating away from unsaved form changes | `useFormGuard()` hook combining TanStack Router `useBlocker({ shouldBlockFn, withResolver, enableBeforeUnload })` with react-hook-form `formState.isDirty` |
| INFR-03 | Data tables use consistent sorting, filtering, pagination, and empty states | Reusable `DataTable` wrapper around TanStack Table v8 with `manualSorting`, `manualFiltering`, `manualPagination`; integrates existing PaginationControls and EmptyState |
| CAMP-01 | User can edit campaign name, description, and election date | PATCH `/api/v1/campaigns/{id}` (requires admin+); react-hook-form with zod schema, mode: "onBlur" |
| CAMP-02 | User can delete a campaign with confirmation | DELETE `/api/v1/campaigns/{id}` (requires owner); type-to-confirm dialog pattern |
| CAMP-03 | User can invite members by email with role assignment | POST `/api/v1/campaigns/{id}/invites` (requires admin+); inline dialog with email + role selector |
| CAMP-04 | User can view pending invites and revoke them | GET `/api/v1/campaigns/{id}/invites` + DELETE `.../invites/{invite_id}` (admin+) |
| CAMP-05 | User can view campaign member list with role badges | GET `/api/v1/campaigns/{id}/members` (viewer+); StatusBadge component for role display |
| CAMP-06 | User can change a member's role | PATCH `/api/v1/campaigns/{id}/members/{userId}/role` (admin+); role hierarchy enforcement |
| CAMP-07 | User can remove a member from a campaign | DELETE `/api/v1/campaigns/{id}/members/{userId}` (admin+); cannot remove owner |
| CAMP-08 | User can transfer campaign ownership to another admin | POST `/api/v1/campaigns/{id}/transfer-ownership` (owner only); confirm dialog |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | 8.21.3 | Headless table with sorting/filtering/pagination | De facto standard for React tables; headless = full UI control |
| @tanstack/react-router | 1.166.6 | File-based routing with `useBlocker` | Already the project router; `useBlocker` built-in |
| @tanstack/react-query | 5.90.21 | Server state management | Already used for all API calls |
| react-hook-form | 7.71.2 | Form state management | Already used in campaign creation form |
| @hookform/resolvers | 5.2.2 | Zod v4 schema resolver | Already installed; v5.2.2 has full zod v4 support |
| zod | 4.3.6 | Schema validation | Already used; v4 has top-level helpers (z.email(), z.uuid()) |
| zustand | 5.0.11 | Client state (auth store) | Already used for auth; role extraction will read from here |
| ky | 1.14.3 | HTTP client with interceptors | Already used with auth interceptor pattern |
| sonner | 2.0.7 | Toast notifications | Already installed; Toaster mounted in root layout |
| lucide-react | 0.563.0 | Icons | Already used throughout sidebar and nav |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui (22 components) | latest | Pre-built UI primitives | Table, Dialog, Button, Card, DropdownMenu, Tabs, Skeleton, etc. |
| oidc-client-ts | 3.1.0 | OIDC authentication | User.profile contains JWT claims including role data |
| class-variance-authority | 0.7.1 | Component variant styling | Already used in shadcn components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table | AG Grid | AG Grid is heavier with built-in UI; TanStack Table is already installed and headless fits shadcn/ui |
| useBlocker (built-in) | beforeunload only | useBlocker catches in-app navigation; beforeunload only catches tab close/refresh |
| sonner | react-hot-toast | sonner already installed and mounted; switching adds no value |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
├── components/
│   ├── shared/
│   │   ├── ConfirmDialog.tsx      # Existing - extend for type-to-confirm
│   │   ├── DataTable.tsx          # NEW - reusable table wrapper
│   │   ├── EmptyState.tsx         # Existing
│   │   ├── PaginationControls.tsx # Existing - consumed by DataTable
│   │   ├── RequireRole.tsx        # NEW - permission gate wrapper
│   │   └── StatusBadge.tsx        # Existing - used for role badges
│   └── ui/                        # shadcn primitives (no changes)
├── hooks/
│   ├── useCampaigns.ts            # Existing - add update/delete mutations
│   ├── useFormGuard.ts            # NEW - form protection hook
│   ├── useMembers.ts              # NEW - member CRUD hooks
│   ├── useInvites.ts              # NEW - invite CRUD hooks
│   ├── usePermissions.ts          # NEW - role extraction + helpers
│   └── useUsers.ts                # Existing - has useMyCampaignRole()
├── routes/
│   └── campaigns/
│       └── $campaignId/
│           └── settings/
│               ├── index.tsx      # Settings layout with vertical tabs
│               ├── general.tsx    # Campaign edit form
│               ├── members.tsx    # Members + invites management
│               └── danger.tsx     # Delete + transfer ownership
├── stores/
│   └── authStore.ts               # Existing - role extraction from here
└── types/
    ├── auth.ts                    # Existing - needs "viewer" added to CampaignRole
    ├── campaign.ts                # Existing - CampaignMember type
    ├── invite.ts                  # NEW - invite types
    └── member.ts                  # NEW - member management types
```

### Pattern 1: Permission Gating via JWT Claims
**What:** Extract campaign role from the OIDC User.profile claims (already available in auth store) and expose via `usePermissions()` hook + `<RequireRole>` component.
**When to use:** Any UI element that should be visible only to certain roles.

```typescript
// web/src/hooks/usePermissions.ts
import { useAuthStore } from "@/stores/authStore"

// Must match backend CampaignRole IntEnum ordering exactly
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  volunteer: 1,
  manager: 2,
  admin: 3,
  owner: 4,
}

export type CampaignRole = "viewer" | "volunteer" | "manager" | "admin" | "owner"

export function usePermissions() {
  const user = useAuthStore((state) => state.user)

  // Extract role from ZITADEL JWT claims in the id_token profile
  // Claims key: urn:zitadel:iam:org:project:{projectId}:roles
  // Value shape: { "admin": { "org-id": "domain" } }
  const projectId = import.meta.env.VITE_ZITADEL_PROJECT_ID
  const roleClaimKey = `urn:zitadel:iam:org:project:${projectId}:roles`
  const rolesObj = (user?.profile as Record<string, unknown>)?.[roleClaimKey] as
    | Record<string, unknown>
    | undefined

  let currentRole: CampaignRole = "viewer" // default
  if (rolesObj) {
    let bestLevel = 0
    for (const roleName of Object.keys(rolesObj)) {
      const level = ROLE_HIERARCHY[roleName.toLowerCase()] ?? 0
      if (level > bestLevel) {
        bestLevel = level
        currentRole = roleName.toLowerCase() as CampaignRole
      }
    }
  }

  const hasRole = (minimum: CampaignRole): boolean => {
    return (ROLE_HIERARCHY[currentRole] ?? 0) >= (ROLE_HIERARCHY[minimum] ?? 0)
  }

  return { role: currentRole, hasRole }
}
```

```tsx
// web/src/components/shared/RequireRole.tsx
import { usePermissions, type CampaignRole } from "@/hooks/usePermissions"

interface RequireRoleProps {
  minimum: CampaignRole
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireRole({ minimum, children, fallback = null }: RequireRoleProps) {
  const { hasRole } = usePermissions()
  return hasRole(minimum) ? <>{children}</> : <>{fallback}</>
}
```

### Pattern 2: Form Guard Hook
**What:** Combines TanStack Router `useBlocker` with react-hook-form `formState.isDirty` for unsaved changes protection.
**When to use:** Any form that modifies data and needs navigation protection.

```typescript
// web/src/hooks/useFormGuard.ts
import { useBlocker } from "@tanstack/react-router"
import type { UseFormReturn } from "react-hook-form"

interface UseFormGuardOptions {
  form: UseFormReturn<any>
}

export function useFormGuard({ form }: UseFormGuardOptions) {
  const isDirty = form.formState.isDirty

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
    enableBeforeUnload: () => isDirty,
  })

  return {
    isDirty,
    isBlocked: status === "blocked",
    proceed: proceed!,
    reset: reset!,
  }
}
```

### Pattern 3: DataTable Wrapper with Server-Side State
**What:** Reusable wrapper around TanStack Table that bakes in server-side sorting, filtering, pagination, row click navigation, kebab menus, and permission-gated actions.
**When to use:** Every data table in phases 12-18.

```typescript
// web/src/components/shared/DataTable.tsx (simplified structure)
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onRowClick?: (row: TData) => void
  // Pagination
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  onNextPage?: () => void
  onPreviousPage?: () => void
}

// Uses manualSorting: true, manualFiltering: true
// Renders shadcn Table + PaginationControls + EmptyState
// Row hover with py-3 comfortable density
// flexRender for header and cell rendering
```

### Pattern 4: Campaign Settings Route Structure
**What:** Settings as a sibling route to the campaign tab navigation, accessed via sidebar gear icon.
**When to use:** Campaign settings area only.

The settings route is at `/campaigns/$campaignId/settings` -- a separate route from the tab layout, not nested under the tab navigation. This matches the CONTEXT.md decision that "Settings route will be a sibling, not a child of the tab navigation."

### Anti-Patterns to Avoid
- **Client-side role enforcement only:** Always pair UI gating with backend `require_role()` -- UI is cosmetic, backend is authoritative.
- **Storing role in separate Zustand slice:** The role is already in the OIDC JWT claims. Do not duplicate it in a separate store. Read it from `useAuthStore` User.profile.
- **Building a custom table from scratch:** TanStack Table v8 is already installed. Do not build table sorting/filtering/pagination logic manually.
- **Using `window.confirm` for navigation blocking:** Use the ConfirmDialog component with `useBlocker({ withResolver: true })` for consistent UI.
- **Fetching role via API call:** The CONTEXT.md explicitly says "no extra API call" -- parse from JWT.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting/filtering/pagination | Custom sort/filter logic | TanStack Table v8 with `manualSorting`/`manualFiltering` | Edge cases: multi-column sort, toggle directions, state sync with URL |
| Navigation blocking | Custom history listener | TanStack Router `useBlocker` | Handles in-app nav + beforeunload + route transitions correctly |
| Form validation | Custom validators | react-hook-form + zod resolver | Handles touched/dirty state, async validation, error mapping |
| Toast notifications | Custom notification system | sonner (already mounted) | Already in root layout, handles stacking, auto-dismiss, positioning |
| Confirmation dialogs | Custom modal | ConfirmDialog component (existing) | Already handles AlertDialog pattern with destructive variant |
| Kebab/dropdown menus | Custom dropdown | shadcn DropdownMenu | Handles focus management, keyboard nav, portal positioning |

**Key insight:** Every UI pattern needed for this phase already has a library or component installed. The work is composition and wiring, not building from scratch.

## Common Pitfalls

### Pitfall 1: Role Claim Missing from ID Token
**What goes wrong:** The `usePermissions()` hook reads `User.profile` but the role claim is not present, defaulting everyone to "viewer."
**Why it happens:** ZITADEL may return role claims only in the access token (not the id_token) depending on project settings, or the `id_token_userinfo_assertion` setting may be off.
**How to avoid:** The auth store already requests `urn:zitadel:iam:org:project:id:${PROJECT_ID}:roles` scope. Verify the claim exists in `User.profile`. If not, fall back to the existing `useMyCampaignRole()` hook (API call) as a safety net. Log a warning when falling back.
**Warning signs:** All users see the same UI regardless of role; no role-gated elements hidden.

### Pitfall 2: Frontend CampaignRole Missing "viewer"
**What goes wrong:** The existing `web/src/types/auth.ts` defines `CampaignRole = "owner" | "admin" | "manager" | "volunteer"` -- missing "viewer". The backend has 5 roles (VIEWER=0, VOLUNTEER=1, MANAGER=2, ADMIN=3, OWNER=4).
**Why it happens:** The original frontend type was written before the full role hierarchy was established.
**How to avoid:** Update the type to include all 5 roles. The `usePermissions()` hook must use the full hierarchy including "viewer" as the default/lowest role.
**Warning signs:** TypeScript errors when trying to check `hasRole("viewer")`.

### Pitfall 3: useBlocker Firing on Non-Dirty Forms
**What goes wrong:** Navigation is blocked even when no changes have been made.
**Why it happens:** react-hook-form's `formState.isDirty` can report `true` if `defaultValues` are set asynchronously after the form mounts, or if controlled components set values on mount.
**How to avoid:** Always provide `defaultValues` synchronously (even as empty strings). When editing existing data, use `reset(serverData)` after the query loads to establish the clean baseline. Read `formState.isDirty` explicitly (not destructured early) to ensure the Proxy subscription is active.
**Warning signs:** "Unsaved changes" dialog appears immediately on page load.

### Pitfall 4: Stale Table Data After Mutations
**What goes wrong:** After changing a member's role or revoking an invite, the table still shows old data.
**Why it happens:** Missing `queryClient.invalidateQueries()` in the mutation's `onSuccess` callback.
**How to avoid:** Every mutation that modifies members/invites must invalidate the relevant query keys: `["campaigns", campaignId, "members"]` and `["campaigns", campaignId, "invites"]`.
**Warning signs:** User must manually refresh to see updated data.

### Pitfall 5: Campaign Delete Without Type-to-Confirm
**What goes wrong:** Accidental campaign deletion -- the standard ConfirmDialog only has Confirm/Cancel buttons.
**Why it happens:** The existing ConfirmDialog doesn't support the "type campaign name to confirm" pattern.
**How to avoid:** Extend ConfirmDialog or create a `DestructiveConfirmDialog` variant that includes a text input. The confirm button stays disabled until the input matches the campaign name exactly.
**Warning signs:** A single misclick can delete a campaign.

### Pitfall 6: Settings Route Breaks Campaign Layout
**What goes wrong:** The settings page shows the campaign tab navigation bar above it, or the sidebar breaks.
**Why it happens:** If settings is nested under `$campaignId.tsx` (the tab layout), it inherits the tab bar.
**How to avoid:** Place settings as a sibling route. The file structure should be `routes/campaigns/$campaignId/settings/` with its own layout, NOT nested under the existing `$campaignId.tsx` tab component. Use `createFileRoute("/campaigns/$campaignId/settings")` to create an independent layout.
**Warning signs:** Tab bar appears on settings page; settings gear icon shows as active tab.

## Code Examples

### Server-Side Sorting with TanStack Table
```typescript
// Pattern for server-side sorted table with URL state
import { type SortingState } from "@tanstack/react-table"
import { useState } from "react"

function MembersTable({ campaignId }: { campaignId: string }) {
  const [sorting, setSorting] = useState<SortingState>([])

  // Convert TanStack Table sorting state to API params
  const sortParam = sorting.length > 0
    ? `${sorting[0].desc ? "-" : ""}${sorting[0].id}`
    : undefined

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId, "members", { sort: sortParam }],
    queryFn: () => api.get(`api/v1/campaigns/${campaignId}/members`, {
      searchParams: sortParam ? { sort: sortParam } : {},
    }).json(),
  })

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  })
}
```

### useBlocker with Custom ConfirmDialog
```tsx
// Form with navigation guard
function CampaignEditForm({ campaign }: { campaign: Campaign }) {
  const form = useForm({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: campaign.name,
      election_date: campaign.election_date ?? "",
    },
    mode: "onBlur",
  })

  const { isBlocked, proceed, reset } = useFormGuard({ form })

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* form fields */}
      </form>

      <ConfirmDialog
        open={isBlocked}
        onOpenChange={(open) => { if (!open) reset() }}
        title="You have unsaved changes"
        description="If you leave this page, your changes will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="destructive"
        onConfirm={proceed}
      />
    </>
  )
}
```

### Type-to-Confirm Destructive Dialog
```tsx
// Extended confirm dialog for campaign deletion
function DeleteCampaignDialog({
  open,
  onOpenChange,
  campaignName,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignName: string
  onConfirm: () => void
  isPending: boolean
}) {
  const [input, setInput] = useState("")
  const isMatch = input === campaignName

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete campaign</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Type <strong>{campaignName}</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={campaignName}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!isMatch || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting..." : "Delete campaign"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

### Adding Gear Icon to Sidebar
```tsx
// In __root.tsx AppSidebar, add at the bottom of sidebar content:
import { Settings } from "lucide-react"
import { RequireRole } from "@/components/shared/RequireRole"
import { SidebarFooter } from "@/components/ui/sidebar"

// Inside AppSidebar, after SidebarContent, before SidebarRail:
<RequireRole minimum="admin">
  <SidebarFooter>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location.pathname.includes("/settings")}
        >
          <Link to={`/campaigns/${campaignId}/settings`}>
            <Settings />
            <span>Settings</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
</RequireRole>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| zod v3 `z.string().email()` | zod v4 `z.email()` | June 2025 | Top-level format helpers; project already on v4.3.6 |
| @hookform/resolvers v3 | v5.2.2 with zod v4 support | Mid 2025 | Resolver import unchanged; internal compatibility fixed |
| `window.confirm` for nav blocking | `useBlocker({ withResolver: true })` + custom dialog | TanStack Router v1.50+ | Custom UI instead of browser dialog; `proceed()`/`reset()` API |
| Client-side table sorting | `manualSorting: true` with server params | TanStack Table v8 | Server does the work; table manages UI state only |

**Deprecated/outdated:**
- zod v3 string format chains (`.string().email()`) -- still works but v4 style is `z.email()`. Project is on v4.
- `zodResolver` from `@hookform/resolvers/zod` path -- now use the same import, but internally resolves v4 schemas.

## Open Questions

1. **Role Claim Location in OIDC Token**
   - What we know: Auth store requests `urn:zitadel:iam:org:project:id:${PROJECT_ID}:roles` scope. Backend parses role from `urn:zitadel:iam:org:project:{projectId}:roles` claim. The `oidc-client-ts` User.profile should contain decoded id_token claims.
   - What's unclear: Whether ZITADEL includes role claims in the id_token or only in the access_token. The `id_token_userinfo_assertion` setting in ZITADEL controls this.
   - Recommendation: Implement JWT claim parsing as primary, with `useMyCampaignRole()` API fallback. Log a warning if JWT claim is missing so it can be debugged.

2. **Settings Route Nesting Strategy**
   - What we know: TanStack Router uses file-based routing. The CONTEXT.md says settings should be a sibling route, not under the tab layout.
   - What's unclear: The exact file-based routing structure needed to make settings a sibling of `$campaignId.tsx` without inheriting its tab layout. TanStack Router's `createFileRoute` with pathless layout routes may be needed.
   - Recommendation: Create `routes/campaigns/$campaignId.settings.tsx` as a layout route (using the `.` separator for a pathless layout) or use `_layout` convention. Test routing structure early in implementation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + Testing Library React 16.3.2 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFR-01 | RequireRole hides/shows children based on role | unit | `cd web && npx vitest run src/components/shared/RequireRole.test.tsx -x` | Wave 0 |
| INFR-01 | usePermissions extracts role from JWT claims | unit | `cd web && npx vitest run src/hooks/usePermissions.test.ts -x` | Wave 0 |
| INFR-02 | useFormGuard blocks navigation when form dirty | unit | `cd web && npx vitest run src/hooks/useFormGuard.test.ts -x` | Wave 0 |
| INFR-03 | DataTable renders columns, handles sorting state | unit | `cd web && npx vitest run src/components/shared/DataTable.test.tsx -x` | Wave 0 |
| INFR-03 | DataTable shows EmptyState when no data | unit | `cd web && npx vitest run src/components/shared/DataTable.test.tsx -x` | Wave 0 |
| CAMP-01 | Campaign edit form submits PATCH with correct data | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/general.test.tsx -x` | Wave 0 |
| CAMP-02 | Delete requires typing campaign name to confirm | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/danger.test.tsx -x` | Wave 0 |
| CAMP-03 | Invite dialog sends POST with email + role | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/members.test.tsx -x` | Wave 0 |
| CAMP-05 | Members list renders with role badges | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/settings/members.test.tsx -x` | Wave 0 |
| CAMP-06 | Role change sends PATCH to correct endpoint | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | Wave 0 |
| CAMP-08 | Ownership transfer sends POST with new_owner_id | unit | `cd web && npx vitest run src/hooks/useMembers.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/usePermissions.test.ts` -- covers INFR-01 (role extraction + hasRole)
- [ ] `web/src/components/shared/RequireRole.test.tsx` -- covers INFR-01 (conditional rendering)
- [ ] `web/src/hooks/useFormGuard.test.ts` -- covers INFR-02 (navigation blocking)
- [ ] `web/src/components/shared/DataTable.test.tsx` -- covers INFR-03 (table rendering, sorting, empty state)
- [ ] `web/src/hooks/useMembers.test.ts` -- covers CAMP-05/06/07/08 (member hooks)
- [ ] `web/src/hooks/useInvites.test.ts` -- covers CAMP-03/04 (invite hooks)
- [ ] Test utilities: mock for `useAuthStore` with configurable role claims

## Sources

### Primary (HIGH confidence)
- Backend source code: `app/core/security.py` -- CampaignRole IntEnum (VIEWER=0..OWNER=4), `_extract_role()` logic, `require_role()` dependency
- Backend source code: `app/api/v1/campaigns.py`, `members.py`, `invites.py` -- exact endpoint signatures, role requirements, request/response schemas
- Frontend source code: `web/src/stores/authStore.ts` -- OIDC scope configuration with role claims
- Frontend source code: `web/src/hooks/useCampaigns.ts` -- established TanStack Query pattern
- Frontend source code: `web/src/types/auth.ts` -- CampaignRole type (missing "viewer")
- Frontend source code: `web/package.json` + `package-lock.json` -- exact installed versions

### Secondary (MEDIUM confidence)
- [TanStack Router Navigation Blocking Guide](https://tanstack.com/router/v1/docs/framework/react/guide/navigation-blocking) -- useBlocker API with shouldBlockFn, withResolver, proceed/reset
- [TanStack Router useBlocker Hook API](https://tanstack.com/router/v1/docs/framework/react/api/router/useBlockerHook) -- hook signature and options
- [TanStack Table Column Defs Guide](https://tanstack.com/table/v8/docs/guide/column-defs) -- ColumnDef types, accessorKey/accessorFn, display columns
- [TanStack Table Sorting Guide](https://tanstack.com/table/v8/docs/guide/sorting) -- manualSorting option
- [TanStack Table Pagination Guide](https://tanstack.com/table/v8/docs/guide/pagination) -- manualPagination option
- [oidc-client-ts User class](https://authts.github.io/oidc-client-ts/classes/User.html) -- User.profile as IdTokenClaims
- [ZITADEL Claims Documentation](https://zitadel.com/docs/apis/openidoauth/claims) -- role claim structure
- [Zod v4 Migration Guide](https://zod.dev/v4/changelog) -- top-level format helpers

### Tertiary (LOW confidence)
- [DeepWiki TanStack Router Navigation Blocking](https://deepwiki.com/TanStack/router/4.7-navigation-blocking) -- community wiki, cross-referenced with official docs
- [@hookform/resolvers zod v4 compatibility](https://github.com/react-hook-form/resolvers/releases) -- release notes confirming v5.2.x zod v4 support

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and versions verified from lockfile
- Architecture: HIGH -- patterns derived from existing codebase conventions (hooks, routes, components)
- Pitfalls: HIGH -- identified from direct code inspection (missing "viewer" role, route nesting, claim extraction)
- Campaign settings API: HIGH -- backend endpoints read directly from source code with exact role requirements

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- all libraries are established versions)
