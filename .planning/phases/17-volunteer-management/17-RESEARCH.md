# Phase 17: Volunteer Management - Research

**Researched:** 2026-03-12
**Domain:** React frontend -- volunteer CRUD, availability, tags, hours UI; minor backend gap-filling
**Confidence:** HIGH

## Summary

Phase 17 builds the frontend volunteer management feature set: a sidebar-nav layout, filterable roster with DataTable, volunteer detail with tabs (Profile, Availability, Hours), tag management page, and a dual-mode registration form. The backend API is almost fully implemented (endpoints for volunteer CRUD, availability, per-volunteer tags, hours), but has a critical gap: no PATCH/DELETE endpoints for campaign-level volunteer tags, and no way to retrieve the existing volunteer ID on a 409 self-registration conflict.

The frontend implementation follows well-established patterns from Phases 12-16. The sidebar layout pattern (phone-banking.tsx, voters.tsx) is directly replicable. The tag management page mirrors the voter tags page exactly. The edit sheet pattern follows VoterEditSheet. The volunteer detail page follows the voter detail page's tab structure. All shared components (DataTable, EmptyState, StatusBadge, ConfirmDialog, RequireRole, useFormGuard) are battle-tested and ready.

**Primary recommendation:** Build the frontend in the established project patterns, but add two backend micro-endpoints first (PATCH/DELETE for volunteer-tags), and extend the 409 self-register response to include the existing volunteer ID for redirect.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Sidebar layout** matching `phone-banking.tsx` pattern: convert `volunteers.tsx` from flat page to sidebar nav + Outlet
- **Three sidebar nav items**: Roster, Tags, Register
- **Route structure**: `/campaigns/$campaignId/volunteers/` with sub-routes: `roster/`, `tags/`, `register/`, `$volunteerId/`
- Hours and shift history live on the volunteer detail page (accessed by clicking a roster row), not as top-level nav items
- **DataTable with columns**: Name | Email | Phone | Status (badge) | Skills (badge pills, max 2 + "+N more") | Actions (kebab)
- **Filter controls above table**: Name search input + Status dropdown (All/Pending/Active/Inactive) + Skills dropdown (multi-select from 10 predefined skills)
- **Kebab menu actions** (manager+ gated): Edit volunteer | Change Status (sub-menu: Pending/Active/Inactive) | Deactivate (with ConfirmDialog)
- **Row click** navigates to volunteer detail page
- **No DELETE endpoint** -- "Deactivate" sets status to inactive with ConfirmDialog explaining hours/shift history are preserved
- **Volunteer Detail Page header**: Full name + status badge + Edit button (manager+) + skills as "Skill1 . Skill2" text
- **Tags in header**: Tag pills with x to remove (manager+) + "Add Tag" button opening dropdown of available campaign tags
- **Three tabs**: Profile | Availability | Hours
- **Profile Tab**: Read-only display of all volunteer fields; Edit via Sheet (slide-out panel) matching VoterEditSheet pattern
- **Dual-mode form** on Register route: Volunteers see essential fields + skills checkbox grid; Managers see all fields + status dropdown
- **Skills selection**: Checkbox grid (2 columns of 5), all 10 predefined skills
- **After registration**: sonner toast "You're registered!" + redirect to volunteer detail page
- **409 conflict handling**: toast "You're already registered" + redirect to existing volunteer detail page
- **Pre-fill from auth**: name and email from auth store
- **Tags Management Page**: Mirror voter tags pattern from Phase 13 exactly
- **Availability Tab**: Slot list with add dialog (date + start/end time), past slots greyed out
- **Hours Tab**: Summary stat cards (Total Hours | Shifts Completed | Last Active) + shift history table
- **Empty States**: Use EmptyState component throughout

### Claude's Discretion
- Exact styling of skill badge pills (color, size)
- Loading skeleton patterns for roster table and detail page
- Responsive behavior of detail page tabs and header
- Error handling for failed mutations
- Date/time picker component choice for availability
- Skills label formatting (underscores to spaces, title case)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VLTR-01 | User can view volunteer roster with filters | DataTable + filter controls above table; backend list_volunteers supports status, skills, name query params |
| VLTR-02 | User can create a new volunteer record | Dual-mode Register page (manager form with all fields); POST /volunteers endpoint exists |
| VLTR-03 | User can edit a volunteer's profile and status | VolunteerEditSheet (VoterEditSheet pattern); PATCH /volunteers/{id} and PATCH /volunteers/{id}/status endpoints exist |
| VLTR-04 | User can view volunteer detail page | $volunteerId.tsx route with tabs (Profile, Availability, Hours); GET /volunteers/{id} returns VolunteerDetailResponse with tags + availability |
| VLTR-05 | Volunteer can self-register through registration flow | Register page dual-mode form; POST /volunteers/register with 409 handling; auth store pre-fill |
| VLTR-06 | User can manage volunteer availability | Availability tab with slot list + Add Availability dialog; POST/DELETE/GET availability endpoints exist |
| VLTR-07 | User can manage campaign-level volunteer tags | Tags management page mirroring voter tags; **backend gap**: need PATCH/DELETE endpoints for volunteer-tags |
| VLTR-08 | User can add/remove tags on individual volunteers | Tag pills in volunteer detail header; POST/DELETE /volunteers/{id}/tags/{tagId} endpoints exist |
| VLTR-09 | User can view volunteer hours and shift history | Hours tab with stat cards + shift history table; GET /volunteers/{id}/hours returns total_hours, shifts_worked, shifts array |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Project standard |
| TanStack Router | 1.x | File-based routing, sidebar layouts | All campaign routes use this |
| TanStack React Query | 5.x | Server state, mutations, cache | All data fetching uses this |
| TanStack React Table | 8.x | DataTable column defs, sorting | All tables use this via shared DataTable |
| ky | latest | HTTP client | Project api/client.ts uses ky |
| react-hook-form | 7.x | Form state management | All forms use this |
| zod | 3.x | Schema validation | All form schemas use zodResolver |
| sonner | latest | Toast notifications | All success/error feedback |
| lucide-react | latest | Icons | Project standard icon set |
| shadcn/ui | latest | Component primitives | All UI components from this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | latest | Date formatting for availability slots | If installed; otherwise use native Intl/Date |
| @radix-ui/react-checkbox | latest | Checkbox primitive (via shadcn) | Skills checkbox grid on register form |
| @radix-ui/react-tabs | latest | Tabs primitive (via shadcn) | Detail page Profile/Availability/Hours tabs |
| @radix-ui/react-dialog | latest | Dialog primitive (via shadcn) | Add Availability dialog, TagFormDialog |
| @radix-ui/react-dropdown-menu | latest | Dropdown primitive (via shadcn) | Kebab menus, "Add Tag" dropdown |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native date/time inputs | React date picker library | Native inputs are simpler, match project pattern of minimal dependencies |
| Multi-select dropdown for skills filter | Combobox/Command component | Skills list is fixed at 10 items; dropdown multi-select with checkboxes is sufficient |

**Installation:**
No new packages needed. All required shadcn components (checkbox, tabs, sheet, dialog, dropdown-menu, select) are already installed.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  routes/campaigns/$campaignId/
    volunteers.tsx                  # Sidebar layout (convert from flat page)
    volunteers/
      roster/
        index.tsx                  # Roster page with DataTable
      tags/
        index.tsx                  # Tags management CRUD page
      register/
        index.tsx                  # Dual-mode register/create form
      $volunteerId/
        index.tsx                  # Volunteer detail page (tabs)
  hooks/
    useVolunteers.ts               # NEW: volunteer CRUD hooks (query + mutations)
    useVolunteerTags.ts            # NEW: campaign volunteer tag CRUD hooks
    useVolunteerAvailability.ts    # NEW: availability add/delete hooks
    useVolunteerHours.ts           # NEW: hours query hook
  components/volunteers/
    VolunteerEditSheet.tsx         # Edit sheet (mirrors VoterEditSheet)
    VolunteerTagFormDialog.tsx     # Tag create/edit dialog (mirrors voter tags)
    AddAvailabilityDialog.tsx      # Date/time slot add dialog
  types/
    volunteer.ts                   # NEW: extended volunteer types (detail, availability, tag, hours)
```

### Pattern 1: Sidebar Layout (from phone-banking.tsx / voters.tsx)
**What:** Layout component with sidebar nav on left, Outlet on right.
**When to use:** Converting volunteers.tsx from flat page to sidebar layout.
**Example:**
```typescript
// Source: web/src/routes/campaigns/$campaignId/phone-banking.tsx (verified)
function VolunteerLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/volunteers" })
  const navItems = [
    { to: `/campaigns/${campaignId}/volunteers/roster`, label: "Roster" },
    { to: `/campaigns/${campaignId}/volunteers/tags`, label: "Tags" },
    { to: `/campaigns/${campaignId}/volunteers/register`, label: "Register" },
  ]
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Volunteers</h1></div>
      <div className="flex gap-0">
        <nav className="w-48 shrink-0 border-r pr-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link to={item.to} params={{ campaignId }}
                  activeProps={{ className: "bg-muted text-foreground font-medium" }}
                  inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                  className="block rounded-md px-3 py-2 text-sm transition-colors"
                >{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1 pl-8"><Outlet /></div>
      </div>
    </div>
  )
}
```

### Pattern 2: DataTable with Filters (from existing roster/list pages)
**What:** Filter controls rendered above DataTable, state managed in page component, query params passed to hook.
**When to use:** Roster page with name search, status filter, skills multi-select.
**Example:**
```typescript
// Source: DataTable component verified at web/src/components/shared/DataTable.tsx
// Filters are local state in page component, passed as query params to the API hook
const [nameSearch, setNameSearch] = useState("")
const [statusFilter, setStatusFilter] = useState<string | undefined>()
const [skillsFilter, setSkillsFilter] = useState<string[]>([])

// Hook passes to GET /volunteers?status=X&skills=a,b&name=Y
const { data, isLoading } = useVolunteers(campaignId, {
  status: statusFilter,
  skills: skillsFilter.join(",") || undefined,
  name: nameSearch || undefined,
})
```

### Pattern 3: Edit Sheet with useFormGuard (from VoterEditSheet)
**What:** Sheet (slide-out panel) with react-hook-form + zod + useFormGuard for unsaved changes.
**When to use:** Volunteer profile edit from detail page.
**Example:**
```typescript
// Source: web/src/components/voters/VoterEditSheet.tsx (verified)
const form = useForm<EditVolunteerFormValues>({
  resolver: zodResolver(editVolunteerSchema),
  defaultValues: { /* pre-filled from volunteer */ },
  mode: "onBlur",
})
useEffect(() => { if (open) form.reset({ /* from volunteer */ }) }, [open, volunteer])
const { isBlocked, proceed, reset: resetBlock } = useFormGuard({ form })
```

### Pattern 4: Tag Management CRUD Page (from voter tags)
**What:** DataTable with create/edit TagFormDialog and DestructiveConfirmDialog for delete.
**When to use:** Volunteer tags management page.
**Example:**
```typescript
// Source: web/src/routes/campaigns/$campaignId/voters/tags/index.tsx (verified)
// Same TagFormDialog pattern: open/onOpenChange/title/defaultValues/isPending/onSubmit
// Same DestructiveConfirmDialog: type-to-confirm delete
// Same kebab menu with RequireRole wrapper
```

### Pattern 5: Per-Volunteer Tag Pills in Header (NEW pattern)
**What:** Tag pills with x remove button + "Add Tag" dropdown in volunteer detail header.
**When to use:** Volunteer detail page header, below name/status.
**Note:** This is a new UI pattern not seen in voter detail. Voter detail has a Tags tab; volunteers have inline tag management in the header. The "Add Tag" dropdown needs to:
1. Fetch campaign volunteer tags list
2. Filter out already-assigned tags
3. Call POST /volunteers/{id}/tags/{tagId} on selection
4. Call DELETE /volunteers/{id}/tags/{tagId} on x click
5. Tag names are returned as strings in VolunteerDetailResponse.tags, but the add/remove endpoints need tag IDs -- so the component needs the campaign tags list to map names to IDs.

### Anti-Patterns to Avoid
- **Don't paginate roster initially:** Backend list_volunteers returns all results with `has_more: false`. Don't pass pagination props to DataTable (this hides PaginationControls).
- **Don't use useFieldOps.useVolunteers for detail/filtered queries:** The existing `useFieldOps.useVolunteers` hook is a basic list query with no filter params. Create new dedicated hooks in `useVolunteers.ts` with filter support and a separate detail query.
- **Don't build status transition validation on frontend:** Backend validates transitions (pending->active, active->inactive, inactive->active). Let the backend reject invalid transitions and show error toast.
- **Don't use `<SelectItem value="">` for "All" filter option:** Radix Select has issues with empty string values (SKIP_VALUE pattern from Phase 14). Use `undefined` for "show all" filter state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DataTable with sorting/loading/empty | Custom table component | `DataTable` from `@/components/shared/DataTable` | Already handles skeleton rows, empty state, sorting, row click |
| Route blocking on unsaved forms | Custom beforeunload + blocker | `useFormGuard({ form })` | Handles both route blocking and beforeunload in one hook |
| Role-gated UI | Custom permission checks | `RequireRole minimum="manager"` wrapper | Handles JWT claim parsing, role hierarchy comparison |
| Toast notifications | Custom notification system | `sonner` `toast.success()` / `toast.error()` | Already integrated in project |
| Form validation | Manual validation logic | `react-hook-form` + `zod` + `zodResolver` | Consistent across all project forms |
| Confirmation dialogs | Custom modal | `ConfirmDialog` / `DestructiveConfirmDialog` | Already handles loading state, variants |

**Key insight:** Every UI pattern this phase needs (sidebar, DataTable, Sheet, Dialog, tags CRUD, kebab menus) has a working reference implementation in the codebase. The task is replication with volunteer-specific data, not invention.

## Common Pitfalls

### Pitfall 1: Tag Name vs Tag ID Mismatch
**What goes wrong:** VolunteerDetailResponse returns `tags: list[str]` (names only), but add/remove tag endpoints need tag IDs.
**Why it happens:** The detail response was designed for display, not for mutation operations.
**How to avoid:** Always fetch campaign volunteer tags list (`GET /volunteer-tags`) alongside volunteer detail. Build a `tagsByName` lookup map to resolve names to IDs for remove operations. For "Add Tag" dropdown, filter campaign tags by excluding already-assigned names.
**Warning signs:** Tag remove button does nothing or errors because you passed a name instead of an ID.

### Pitfall 2: 409 Self-Registration Without Existing Volunteer ID
**What goes wrong:** When a volunteer who already registered tries to self-register again, the backend returns a 409 ProblemResponse with `type: "volunteer-already-registered"` but does NOT include the existing volunteer's ID.
**Why it happens:** The service raises a ValueError without including the existing record.
**How to avoid:** Two options: (A) extend the backend 409 response to include the volunteer_id in the detail field or an extension field, or (B) on 409, query the volunteer list filtered by user and redirect to the first result. Option A is cleaner and requires a small backend change.
**Warning signs:** After 409 toast, no redirect happens or redirect goes to the roster instead of the specific volunteer.

### Pitfall 3: Missing Backend Endpoints for Volunteer Tag CRUD
**What goes wrong:** The CONTEXT says to "mirror voter tags pattern from Phase 13 exactly" with edit/delete, but the backend only has POST (create) and GET (list) for campaign-level volunteer tags. No PATCH (update/rename) or DELETE endpoints exist.
**Why it happens:** Backend was built for basic tag functionality; full CRUD was deferred.
**How to avoid:** Add two backend endpoints before building the frontend tags page: `PATCH /campaigns/{id}/volunteer-tags/{tagId}` and `DELETE /campaigns/{id}/volunteer-tags/{tagId}`. Also add corresponding service methods (`update_tag`, `delete_tag`) and a `VolunteerTagUpdate` schema.
**Warning signs:** Edit and Delete buttons on tags page produce 404/405 errors.

### Pitfall 4: Skills Filter Multi-Select vs Single Select
**What goes wrong:** Using a single-select dropdown for skills filter when the context specifies multi-select.
**Why it happens:** The shadcn Select component is single-select only.
**How to avoid:** Build a custom multi-select using Popover + Command (both installed) or a simple Popover with checkboxes. The skills list is fixed at 10 items, so a popover with 10 checkboxes is the simplest approach.
**Warning signs:** Users can only filter by one skill at a time.

### Pitfall 5: Availability Timezone Handling
**What goes wrong:** Availability slots display at wrong times because of timezone confusion between UTC backend storage and local display.
**Why it happens:** Backend stores `start_at`/`end_at` as UTC `datetime`; frontend native date/time inputs produce local time strings.
**How to avoid:** Use `new Date(isoString)` for display (auto-converts to local) and construct ISO datetime strings for POST requests. The backend expects `datetime` (ISO 8601 with timezone info).
**Warning signs:** Availability slots show up shifted by hours, or submitting 2pm local creates a slot at 2pm UTC.

### Pitfall 6: Auth Store Pre-Fill Timing
**What goes wrong:** Register form pre-fill from auth store shows empty values because the user object hasn't loaded yet.
**Why it happens:** Auth store initialization is async; form defaultValues are set on mount.
**How to avoid:** Read from `useAuthStore((s) => s.user)` and use `form.reset()` in a useEffect when user becomes available, or use the user's profile fields as defaultValues and update on user change.
**Warning signs:** Name and email fields are empty even though the user is logged in.

## Code Examples

Verified patterns from the existing codebase:

### API Client Hook Pattern (from useVoterTags.ts)
```typescript
// Source: web/src/hooks/useVoterTags.ts (verified)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useVolunteerList(campaignId: string, filters?: {
  status?: string; skills?: string; name?: string
}) {
  return useQuery({
    queryKey: ["volunteers", campaignId, filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set("status", filters.status)
      if (filters?.skills) params.set("skills", filters.skills)
      if (filters?.name) params.set("name", filters.name)
      const qs = params.toString()
      const url = `api/v1/campaigns/${campaignId}/volunteers${qs ? `?${qs}` : ""}`
      return api.get(url).json<PaginatedResponse<VolunteerResponse>>()
    },
    enabled: !!campaignId,
  })
}
```

### Mutation with Cache Invalidation (from useVoterTags.ts)
```typescript
// Source: web/src/hooks/useVoterTags.ts (verified)
export function useUpdateVolunteerStatus(campaignId: string, volunteerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: string) =>
      api.patch(`api/v1/campaigns/${campaignId}/volunteers/${volunteerId}/status`, {
        json: { status },
      }).json<VolunteerResponse>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteers", campaignId] })
      qc.invalidateQueries({ queryKey: ["volunteers", campaignId, volunteerId] })
    },
  })
}
```

### Skills Label Formatting (Claude's Discretion)
```typescript
// Convert "phone_banking" to "Phone Banking"
function formatSkillLabel(skill: string): string {
  return skill
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
```

### Volunteer Hours Response Shape (from backend)
```typescript
// Source: app/services/shift.py get_volunteer_hours (verified)
interface VolunteerHoursResponse {
  volunteer_id: string
  total_hours: number      // Rounded to 2 decimal places
  shifts_worked: number
  shifts: Array<{
    shift_id: string
    shift_name: string
    hours: number           // Rounded to 2 decimal places
    check_in_at: string     // ISO datetime
    check_out_at: string | null  // ISO datetime, null if still checked in
  }>
}
```

### Kebab Menu with RequireRole (from voter tags page)
```typescript
// Source: web/src/routes/campaigns/$campaignId/voters/tags/index.tsx (verified)
{
  id: "actions",
  header: "",
  cell: ({ row }) => (
    <RequireRole minimum="manager">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleEdit(row.original)}>
            Edit
          </DropdownMenuItem>
          {/* ... */}
        </DropdownMenuContent>
      </DropdownMenu>
    </RequireRole>
  ),
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat volunteers.tsx page | Sidebar layout with Outlet | Phase 17 (now) | Must convert existing flat page |
| useFieldOps.useVolunteers (basic) | Dedicated useVolunteers hooks with filters | Phase 17 (now) | Old hook stays for backward compat, new hooks added |
| Voter tags only | Voter tags + Volunteer tags (separate CRUD) | Phase 17 (now) | Backend needs PATCH/DELETE for volunteer-tags |

**Deprecated/outdated:**
- The existing `volunteers.tsx` flat page with inline Table component will be replaced entirely with a sidebar layout + Outlet pattern.
- The existing `useFieldOps.useVolunteers` hook should be preserved but not used for the new filtered roster queries.

## Backend Gaps Requiring Implementation

### Gap 1: Volunteer Tag Update Endpoint
**Missing:** `PATCH /campaigns/{id}/volunteer-tags/{tagId}`
**Needed for:** VLTR-07 (edit tag name in CRUD table)
**Implementation:** Add `VolunteerTagUpdate` schema, `update_tag` service method, and router endpoint. Mirror the voter tag update pattern.

### Gap 2: Volunteer Tag Delete Endpoint
**Missing:** `DELETE /campaigns/{id}/volunteer-tags/{tagId}`
**Needed for:** VLTR-07 (delete tag from CRUD table)
**Implementation:** Add `delete_tag` service method (cascade delete from volunteer_tag_members), and router endpoint.

### Gap 3: 409 Self-Register Response Missing Volunteer ID
**Missing:** Existing volunteer ID in the 409 ProblemResponse
**Needed for:** VLTR-05 (redirect to existing volunteer detail page on conflict)
**Implementation:** In the `self_register` endpoint, catch the ValueError, query for the existing volunteer, and include the volunteer ID in the ProblemResponse detail or as an extension field. Alternative: include volunteer_id in the error message string and parse on the frontend (fragile).

## Open Questions

1. **409 response enrichment approach**
   - What we know: Backend returns ProblemResponse on 409 with string detail, no volunteer ID
   - What's unclear: Whether to add a custom extension field to ProblemResponse or restructure the error handling
   - Recommendation: Simplest approach is to modify the self_register endpoint to query for the existing volunteer and include its ID in a custom response body instead of ProblemResponse. E.g., return `{"status": "already_registered", "volunteer_id": "..."}` with 409 status.

2. **Skills multi-select component**
   - What we know: Need multi-select for 10 skills; shadcn Select is single-select only
   - What's unclear: Whether to use Popover+checkboxes or build a proper multi-select
   - Recommendation: Use Popover with a checkbox list inside -- simple, matches the checkbox grid used on the register form, and the skill count is fixed at 10.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VLTR-01 | Roster page renders DataTable with filters | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/volunteers/roster/index.test.tsx -x` | Wave 0 |
| VLTR-02 | Create volunteer form submits POST /volunteers | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/volunteers/register/index.test.tsx -x` | Wave 0 |
| VLTR-03 | Edit sheet submits PATCH, status update works | unit | `cd web && npx vitest run src/components/volunteers/VolunteerEditSheet.test.tsx -x` | Wave 0 |
| VLTR-04 | Detail page renders tabs, loads volunteer data | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/volunteers/\$volunteerId/index.test.tsx -x` | Wave 0 |
| VLTR-05 | Self-register calls /register, handles 409 | unit | `cd web && npx vitest run src/hooks/useVolunteers.test.ts -x` | Wave 0 |
| VLTR-06 | Add/delete availability hooks and UI | unit | `cd web && npx vitest run src/hooks/useVolunteerAvailability.test.ts -x` | Wave 0 |
| VLTR-07 | Campaign volunteer tags CRUD | unit | `cd web && npx vitest run src/hooks/useVolunteerTags.test.ts -x` | Wave 0 |
| VLTR-08 | Per-volunteer tag add/remove in header | unit | `cd web && npx vitest run src/routes/campaigns/\$campaignId/volunteers/\$volunteerId/index.test.tsx -x` | Wave 0 |
| VLTR-09 | Hours tab displays stats and shift history | unit | `cd web && npx vitest run src/hooks/useVolunteerHours.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useVolunteers.test.ts` -- covers VLTR-01, VLTR-02, VLTR-03, VLTR-05
- [ ] `web/src/hooks/useVolunteerTags.test.ts` -- covers VLTR-07 (note: different from existing useVoterTags.test.ts)
- [ ] `web/src/hooks/useVolunteerAvailability.test.ts` -- covers VLTR-06
- [ ] `web/src/hooks/useVolunteerHours.test.ts` -- covers VLTR-09

## Sources

### Primary (HIGH confidence)
- `web/src/routes/campaigns/$campaignId/phone-banking.tsx` -- sidebar layout pattern (verified)
- `web/src/routes/campaigns/$campaignId/voters.tsx` -- sidebar layout pattern (verified)
- `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` -- detail page with tabs pattern (verified)
- `web/src/routes/campaigns/$campaignId/voters/tags/index.tsx` -- tag CRUD page pattern (verified)
- `web/src/components/voters/VoterEditSheet.tsx` -- edit sheet pattern (verified)
- `web/src/components/shared/DataTable.tsx` -- DataTable props and behavior (verified)
- `web/src/components/shared/EmptyState.tsx` -- EmptyState props (verified)
- `web/src/components/shared/RequireRole.tsx` -- RequireRole usage (verified)
- `web/src/hooks/useFormGuard.ts` -- useFormGuard API (verified)
- `web/src/hooks/useVoterTags.ts` -- tag hook patterns (verified)
- `web/src/hooks/useFieldOps.ts` -- existing useVolunteers hook (verified)
- `web/src/types/field-ops.ts` -- Volunteer type definition (verified)
- `web/src/api/client.ts` -- ky client with auth interceptor (verified)
- `web/src/stores/authStore.ts` -- auth store with user profile access (verified)
- `app/api/v1/volunteers.py` -- all backend endpoints (verified)
- `app/schemas/volunteer.py` -- all request/response schemas (verified)
- `app/models/volunteer.py` -- VolunteerStatus, VolunteerSkill enums (verified)
- `app/services/shift.py` -- get_volunteer_hours response shape (verified)
- `app/services/volunteer.py` -- self_register 409 behavior (verified)

### Secondary (MEDIUM confidence)
- Backend gap analysis (no volunteer tag update/delete) -- verified by exhaustive grep of all router decorators and service methods

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries and patterns verified from existing codebase
- Architecture: HIGH -- all patterns have working reference implementations in the project
- Pitfalls: HIGH -- identified by reading actual backend code and matching against frontend requirements
- Backend gaps: HIGH -- verified by exhaustive search of endpoints, schemas, and service methods

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- project patterns are well-established)
