# Architecture Research: v1.2 Full UI Integration

**Domain:** Frontend architecture for ~95 new endpoint UIs in existing React SPA
**Researched:** 2026-03-10
**Confidence:** HIGH (based on direct codebase analysis + established patterns)

## Current Architecture Snapshot

### What Exists Today

```
web/src/
  api/client.ts              -- ky-based HTTP client with auth interceptor
  stores/authStore.ts         -- Zustand OIDC auth state
  types/                      -- 11 type files (campaign, voter, field-ops, etc.)
  hooks/                      -- 12 hook files wrapping TanStack Query
  routes/                     -- 18 file-based routes (TanStack Router)
  components/
    ui/                       -- 22 shadcn/ui primitives
    shared/                   -- 4 shared components (EmptyState, ConfirmDialog, StatusBadge, PaginationControls)
    canvassing/               -- 4 domain components (TurfForm, WalkListGenerateDialog, etc.)
    surveys/                  -- 1 domain component (SurveyWidget)
```

### Coverage Status (from gap analysis)

| Status | Endpoint Count | Description |
|--------|:-:|---|
| Fully implemented | ~55 | Surveys, turfs, walk lists, dashboard, users, campaign list/create |
| Hooks/types exist, no UI pages | ~28 | Voter contacts, voter tags, voter lists, voter create/edit, search |
| Nothing exists | ~67 | Imports, invites, members, call lists, DNC, phone bank CRUD, volunteer CRUD, shift CRUD, campaign edit/delete |

**Total new routes needed:** ~25 new route files
**Total new hook files needed:** ~8 new hook files
**Total new component files needed:** ~40-50 new components

---

## Recommended Architecture

### Route Structure

Use the established pattern: TanStack Router file-based routing under `campaigns/$campaignId/`. Domains that need sub-pages get layout routes (like canvassing and surveys already do). Leaf pages stay flat.

```
web/src/routes/
  campaigns/
    $campaignId/
      settings.tsx                         -- Campaign edit + delete (leaf page)
      members.tsx                          -- Campaign layout for members section
      members/
        index.tsx                          -- Member list + invite dialog
      imports.tsx                          -- Import layout
      imports/
        index.tsx                          -- Import history list + "New Import" button
        new.tsx                            -- Multi-step import wizard
        $importId.tsx                      -- Import detail/status page
      voters/
        index.tsx                          -- (EXISTS) Add create button, enhance filters
        $voterId.tsx                       -- (EXISTS) Add contacts/tags/lists tabs, edit, add note
        new.tsx                            -- Create voter form
        lists.tsx                          -- Voter lists layout
        lists/
          index.tsx                        -- Voter lists management
          $listId.tsx                      -- List detail with members
      phone-banking.tsx                    -- (EXISTS) Convert to layout route
      phone-banking/
        index.tsx                          -- Sessions list + call lists (enhanced from current)
        sessions/
          new.tsx                          -- Create session form
          $sessionId.tsx                   -- Session detail + caller management + progress
          $sessionId/
            call.tsx                       -- Active calling experience
        call-lists/
          index.tsx                        -- Call list management
          new.tsx                          -- Create call list
          $callListId.tsx                  -- Call list detail
        dnc.tsx                            -- DNC management page
      volunteers.tsx                       -- (EXISTS) Convert to layout route
      volunteers/
        index.tsx                          -- Volunteer roster (enhanced from current)
        new.tsx                            -- Create volunteer form
        $volunteerId.tsx                   -- Volunteer detail (availability, tags, hours)
      shifts.tsx                           -- Shift layout
      shifts/
        index.tsx                          -- Shift calendar/list
        new.tsx                            -- Create shift form
        $shiftId.tsx                       -- Shift detail + roster + check-in/out
```

**Key decisions:**

1. **phone-banking.tsx and volunteers.tsx become layout routes.** Currently they are leaf pages rendering content directly. Convert them to `<Outlet />` wrappers (like canvassing.tsx already is) and move their current content into `index.tsx` children. This is non-breaking -- TanStack Router handles the transition cleanly.

2. **Voter lists nest under voters/, not top-level.** Lists are a voter sub-domain. Users navigate from voters to "manage lists." Nesting under `voters/lists/` keeps the sidebar navigation clean and reflects the actual workflow.

3. **DNC lives under phone-banking/, not top-level.** DNC is operationally linked to phone banking. Putting it at `phone-banking/dnc` avoids cluttering the top-level nav while keeping it discoverable from the phone banking section.

4. **Import wizard gets its own route (`imports/new.tsx`).** The multi-step wizard needs its own URL so users can bookmark or share progress, and browser back/forward works predictably.

5. **Calling experience gets a dedicated deep route.** `phone-banking/sessions/$sessionId/call.tsx` is the core "I'm making calls" view. It needs focus -- no sidebar distractions, full-screen layout. Use a pathless layout route or conditional rendering in the root layout to hide the sidebar.

### Sidebar Navigation Changes

The current sidebar has 5 items under "Campaign": Dashboard, Voters, Canvassing, Phone Banking, Volunteers. Add 3 more:

```typescript
const navItems = [
  { to: `.../dashboard`, label: "Dashboard", icon: LayoutDashboard },
  { to: `.../voters`, label: "Voters", icon: Users },
  { to: `.../canvassing`, label: "Canvassing", icon: Map },
  { to: `.../phone-banking`, label: "Phone Banking", icon: Phone },
  { to: `.../volunteers`, label: "Volunteers", icon: ClipboardList },
  { to: `.../shifts`, label: "Shifts", icon: Calendar },       // NEW
  { to: `.../members`, label: "Team", icon: UserPlus },         // NEW
  { to: `.../settings`, label: "Settings", icon: Settings },    // NEW
]
```

The campaign layout tab bar (`$campaignId.tsx`) should also reflect these additions. Surveys stays in the tab bar but not the sidebar -- it's a sub-tool of canvassing/phone-banking, not a top-level nav item.

---

## Component Architecture

### Component Boundaries

| Component Layer | Responsibility | Lives In |
|---|---|---|
| **Route pages** | Data loading orchestration, page-level layout, URL params | `routes/campaigns/$campaignId/**` |
| **Domain components** | Feature-specific forms, dialogs, detail views | `components/{domain}/` |
| **Shared components** | Reusable patterns across domains | `components/shared/` |
| **UI primitives** | shadcn/ui base components | `components/ui/` |

### New Shared Components Needed

These components are needed across multiple domains and should be built first:

```
components/shared/
  DataTable.tsx               -- Reusable TanStack Table wrapper with sorting, filtering
  FormDialog.tsx              -- Dialog wrapper for create/edit forms (standardizes open/close/loading)
  DetailPage.tsx              -- Standard detail page layout (header + tabs + content)
  StepWizard.tsx              -- Multi-step form container with progress indicator
  FilterBar.tsx               -- Reusable filter controls (search, select, date range)
  LoadingPage.tsx             -- Full-page loading skeleton
  ErrorBoundary.tsx           -- Error display with retry action
  RoleBadge.tsx               -- Campaign role badge with consistent colors
  DateRangeDisplay.tsx        -- Formatted date range for shifts/sessions
```

### New Domain Components Needed

```
components/
  members/
    InviteDialog.tsx          -- Create invite with role selection
    MemberRoleDialog.tsx      -- Change member role
    TransferOwnershipDialog.tsx
  imports/
    FileUploadStep.tsx        -- Drag-and-drop file upload
    ColumnMappingStep.tsx     -- Map CSV columns to voter fields
    ConfirmImportStep.tsx     -- Preview + confirm
    ImportProgressCard.tsx    -- Polling status display
  voters/
    VoterForm.tsx             -- Create/edit voter (react-hook-form + zod)
    ContactsPanel.tsx         -- Phone/email/address CRUD tabs
    TagsPanel.tsx             -- Tag management for voter detail
    ListsPanel.tsx            -- List membership for voter detail
    AddInteractionDialog.tsx  -- Record a note/interaction
    AdvancedSearchDialog.tsx  -- Complex filter builder
    VoterListForm.tsx         -- Create/edit voter list
    VoterListMemberManager.tsx
  phone-banking/
    SessionForm.tsx           -- Create/edit phone bank session
    CallerManagement.tsx      -- Add/remove callers from session
    CallingExperience.tsx     -- The core calling screen (claim entry, show script, record outcome)
    CallProgressBar.tsx       -- Session progress display
    SessionStatusControls.tsx -- Start/pause/end session
    CallListForm.tsx          -- Create/edit call list
    CallListDetail.tsx        -- Call list entries + progress
    DNCManagement.tsx         -- DNC list with add/import/delete/check
  volunteers/
    VolunteerForm.tsx         -- Create/edit volunteer
    AvailabilityCalendar.tsx  -- Manage availability windows
    VolunteerTagsPanel.tsx    -- Tag management for volunteer
    HoursTracker.tsx          -- Hours summary and history
  shifts/
    ShiftForm.tsx             -- Create/edit shift
    ShiftRoster.tsx           -- Volunteer list for a shift
    CheckInOutControls.tsx    -- Check in/out buttons per volunteer
    HoursAdjustmentDialog.tsx -- Manual hours correction
    ShiftSignupDialog.tsx     -- Volunteer self-signup
  campaign/
    CampaignSettingsForm.tsx  -- Edit campaign details
    DeleteCampaignDialog.tsx  -- Confirm campaign deletion
```

### Pattern: Domain Component Structure

Follow the established pattern from canvassing (TurfForm, WalkListGenerateDialog). Each domain folder contains:

1. **Form components** -- react-hook-form + zodResolver for validation
2. **Dialog components** -- Wrap forms in shadcn Dialog for create/edit-in-context
3. **Panel components** -- Tabbed content sections for detail pages
4. **List/table components** -- DataTable instances with domain-specific columns

```typescript
// Example: components/volunteers/VolunteerForm.tsx
// Follows TurfForm.tsx pattern exactly

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const volunteerSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  skills: z.array(z.string()).default([]),
  // ...
})

type VolunteerFormValues = z.infer<typeof volunteerSchema>

interface VolunteerFormProps {
  defaultValues?: Volunteer  // For edit mode
  onSubmit: (data: VolunteerFormValues) => void
  isPending: boolean
  submitLabel: string
}
```

---

## Hook Organization

### Current State: 12 hook files, flat structure

The existing hooks follow a clean pattern: one file per domain, exporting individual named functions. This works well and should continue. No hook is over 220 lines (useSurveys.ts is the largest).

### Scaling Strategy: Keep flat, add domain hook files

Do NOT restructure into subdirectories yet. With ~20 hook files, flat is still navigable. The key organizational tool is consistent naming:

```
hooks/
  useCampaigns.ts             -- (EXISTS)
  useDashboard.ts             -- (EXISTS)
  useFieldOps.ts              -- (EXISTS) read-only list queries
  useSurveys.ts               -- (EXISTS)
  useTurfs.ts                 -- (EXISTS)
  useUsers.ts                 -- (EXISTS)
  useVoterContacts.ts         -- (EXISTS)
  useVoterLists.ts            -- (EXISTS)
  useVoters.ts                -- (EXISTS)
  useVoterTags.ts             -- (EXISTS)
  useWalkLists.ts             -- (EXISTS)
  useDashboard.ts             -- (EXISTS)
  use-mobile.ts               -- (EXISTS)

  useMembers.ts               -- NEW: campaign members + invites
  useImports.ts               -- NEW: voter import workflow
  useCallLists.ts             -- NEW: call list CRUD + claim
  useDNC.ts                   -- NEW: DNC list management
  usePhoneBanking.ts          -- NEW: sessions, callers, calls, progress
  useVolunteers.ts            -- NEW: volunteer CRUD, availability, tags, hours
  useShifts.ts                -- NEW: shift CRUD, signup, check-in/out, roster, hours
```

**Total: ~20 hook files.** Still manageable without subdirectories.

### Query Key Convention

Adopt a consistent query key factory pattern. The existing code uses ad-hoc keys which are mostly consistent but not standardized. Introduce key factories for new hooks:

```typescript
// hooks/usePhoneBanking.ts

const pbKeys = {
  sessions: {
    all: (campaignId: string) => ["phone-bank-sessions", campaignId] as const,
    detail: (campaignId: string, sessionId: string) =>
      ["phone-bank-sessions", campaignId, sessionId] as const,
    progress: (campaignId: string, sessionId: string) =>
      ["phone-bank-sessions", campaignId, sessionId, "progress"] as const,
    callers: (campaignId: string, sessionId: string) =>
      ["phone-bank-sessions", campaignId, sessionId, "callers"] as const,
  },
}
```

This pattern already exists in `useVoterContacts.ts` (the `contactKeys` object) and `useVoterLists.ts` (the `listKeys` object). Extend it to all new hook files.

**Invalidation rule:** Mutations invalidate the narrowest key that captures all affected queries. For example, creating a caller invalidates `pbKeys.sessions.callers(campaignId, sessionId)`, not all session data.

### Optimistic Updates Strategy

Use optimistic updates selectively -- only where the latency matters for UX:

| Action | Optimistic? | Rationale |
|---|:-:|---|
| Toggle tag on voter | YES | Instant feedback expected; tag toggles are frequent |
| Set primary contact | YES | Visual toggle; user expects immediate change |
| Check-in volunteer | YES | Field operation; may have poor connectivity |
| Record door knock outcome | YES | Canvasser is moving fast; can't wait for round-trip |
| Record call outcome | YES | Caller is on the phone; needs instant feedback |
| Create campaign member | NO | Rare action; server validation matters |
| Import voter file | NO | Long-running; progress polling instead |
| Create/delete entities | NO | Server-generated IDs; confirmation is fine |

For optimistic updates, use the TanStack Query v5 pattern via `variables` on `useMutation`:

```typescript
export function useToggleTag(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      api.post(`.../${voterId}/tags/${tagId}`).json(),
    onMutate: async (tagId) => {
      // Cancel refetches
      await qc.cancelQueries({ queryKey: ["voters", campaignId, voterId, "tags"] })
      // Snapshot
      const previous = qc.getQueryData(["voters", campaignId, voterId, "tags"])
      // Optimistic update
      qc.setQueryData(["voters", campaignId, voterId, "tags"], (old: VoterTag[]) =>
        [...old, { id: tagId, name: "...", /* partial */ }]
      )
      return { previous }
    },
    onError: (_err, _tagId, context) => {
      qc.setQueryData(["voters", campaignId, voterId, "tags"], context?.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["voters", campaignId, voterId, "tags"] })
    },
  })
}
```

---

## Data Flow Patterns

### Pattern 1: Standard CRUD Page

Used for: Members, volunteers, shifts, call lists, DNC

```
Route Page
  --> useXxxList(campaignId)               fetch list
  --> useCreateXxx(campaignId)             create mutation
  --> useDeleteXxx(campaignId)             delete mutation
  --> renders DataTable + EmptyState
  --> opens FormDialog for create
  --> opens ConfirmDialog for delete
```

### Pattern 2: Detail Page with Tabs

Used for: Voter detail (enhanced), volunteer detail, session detail, shift detail, call list detail

```
Route Page ($entityId param)
  --> useXxx(campaignId, entityId)         fetch detail
  --> renders DetailPage header
  --> renders Tabs
       Tab 1: Primary info (read + edit toggle)
       Tab 2: Related entities (contacts, tags, roster, etc.)
       Tab 3: Activity/history
```

### Pattern 3: Multi-Step Wizard

Used for: Voter import (the main wizard in v1.2)

```
Route Page (imports/new.tsx)
  --> Zustand store for wizard state (file, mappings, status)
  --> StepWizard container
       Step 1: FileUploadStep
         --> POST /imports                  initiate import
         --> File upload to pre-signed URL
       Step 2: ColumnMappingStep
         --> POST /imports/{id}/detect      get suggested mappings
         --> User adjusts mappings
       Step 3: ConfirmImportStep
         --> POST /imports/{id}/confirm     start processing
       Step 4: ImportProgressCard
         --> GET /imports/{id}              poll status (useQuery with refetchInterval)
```

**Why Zustand for wizard state:** The import wizard spans multiple API calls with intermediate state (uploaded file metadata, detected columns, user-adjusted mappings) that doesn't fit the TanStack Query cache model. Zustand provides:
- Persistence across step transitions within the same route
- Easy reset on wizard completion or abandonment
- No prop drilling through 4 wizard steps

```typescript
// stores/importWizardStore.ts
interface ImportWizardState {
  step: 1 | 2 | 3 | 4
  importId: string | null
  fileName: string | null
  detectedColumns: ColumnMapping[] | null
  confirmedMappings: ColumnMapping[] | null
  setStep: (step: number) => void
  setImportId: (id: string) => void
  setDetectedColumns: (cols: ColumnMapping[]) => void
  setConfirmedMappings: (mappings: ColumnMapping[]) => void
  reset: () => void
}
```

### Pattern 4: Active Calling Experience

The calling experience is the most complex UI flow in v1.2:

```
CallingExperience (phone-banking/sessions/$sessionId/call.tsx)
  --> useClaimEntry(campaignId, callListId)     claim next entry
  --> useSurveyScript(campaignId, scriptId)     load survey questions
  --> useRecordCall(campaignId, sessionId)       record outcome
  --> useRecordResponses(campaignId, scriptId)   save survey answers

  Flow:
  1. Claim entry --> get voter info + phone number
  2. Display voter card + survey script
  3. User makes call, records outcome
  4. Survey responses submitted
  5. Auto-claim next entry (or manual "Next")
  6. Repeat until done or session ends
```

This page should:
- Hide the sidebar (full-screen calling mode)
- Show voter info prominently (name, address, contact history)
- Display survey questions in sequence
- Provide quick outcome buttons (answered, no answer, busy, etc.)
- Auto-advance to next call after recording
- Show session progress (X of Y calls completed)

### Pattern 5: Real-Time Progress Polling

Used for: Import status, session progress

```typescript
// Poll every 2 seconds while import is processing
export function useImportStatus(campaignId: string, importId: string) {
  return useQuery({
    queryKey: ["imports", campaignId, importId],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/imports/${importId}`).json<ImportStatus>(),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Stop polling when terminal
      if (status === "completed" || status === "failed") return false
      return 2000
    },
    enabled: !!campaignId && !!importId,
  })
}
```

---

## Type System Additions

### New Type Files Needed

```
types/
  member.ts                   -- CampaignMember (EXISTS in campaign.ts), invite types
  import.ts                   -- ImportJob, ImportStatus, ColumnMapping, FieldTemplate
  call-list.ts                -- CallList (move from field-ops.ts), CallListCreate, CallListEntry
  dnc.ts                      -- DNCEntry, DNCImport, DNCCheckResult
  phone-bank.ts               -- PhoneBankSession (move from field-ops.ts), Caller, CallRecord, CallOutcome
  volunteer.ts                -- Volunteer (move from field-ops.ts), VolunteerCreate, Availability, VolunteerTag
  shift.ts                    -- Shift (move from field-ops.ts), ShiftCreate, ShiftVolunteer, HoursAdjustment
```

**Migration note:** `field-ops.ts` currently bundles types for 6 different domains (Turf, WalkList, CallList, PhoneBankSession, Volunteer, Shift). As each domain gets full CRUD, move its types to a dedicated file. The old `field-ops.ts` types can be re-exported for backward compatibility during migration:

```typescript
// types/field-ops.ts (transitional)
export type { Turf } from "./turf"
export type { WalkList } from "./walk-list"
export type { CallList } from "./call-list"
// ... etc
```

### Type Complexity Notes

The import wizard needs the most complex types:

```typescript
// types/import.ts
interface ImportJob {
  id: string
  campaign_id: string
  status: "pending_upload" | "uploaded" | "detecting" | "mapped" | "processing" | "completed" | "failed"
  file_name: string
  upload_url: string | null
  total_rows: number | null
  processed_rows: number | null
  created_rows: number | null
  updated_rows: number | null
  error_rows: number | null
  error_details: string | null
  created_at: string
  updated_at: string
}

interface ColumnMapping {
  source_column: string
  target_field: string | null
  confidence: number
  sample_values: string[]
}

interface FieldTemplate {
  name: string
  description: string
  mappings: Record<string, string>
}
```

---

## Integration Points with Existing Code

### Files That Need Modification (Not Just New Files)

| Existing File | Change Needed | Impact |
|---|---|---|
| `routes/__root.tsx` | Add Settings, Shifts, Team nav items to sidebar | LOW -- additive |
| `routes/campaigns/$campaignId.tsx` | Add Members, Imports, Settings, Shifts tabs; conditionally hide tabs by role | MEDIUM -- modifying layout |
| `routes/campaigns/$campaignId/phone-banking.tsx` | Convert from leaf page to layout (`<Outlet />`) | LOW -- replace JSX with Outlet |
| `routes/campaigns/$campaignId/volunteers.tsx` | Convert from leaf page to layout (`<Outlet />`) | LOW -- replace JSX with Outlet |
| `routes/campaigns/$campaignId/voters/$voterId.tsx` | Add contacts/tags/lists tabs, edit button, add-note button | HIGH -- significant enhancement |
| `routes/campaigns/$campaignId/voters/index.tsx` | Add create voter button, enhance filter bar | LOW -- additive |
| `hooks/useFieldOps.ts` | Deprecate gradually as domains get their own hook files | LOW -- backward compatible |
| `types/field-ops.ts` | Split into per-domain type files | LOW -- re-export for compat |
| `types/campaign.ts` | Add CampaignUpdate, invite types | LOW -- additive |

### Files That Stay Unchanged

All existing route files for canvassing, surveys, turfs, walk lists, and dashboard remain unchanged. The architecture additions are purely additive for those areas.

---

## Build Order (Dependency-Aware)

The order matters because some UI areas depend on others existing first:

### Phase 1: Foundation + Campaign Settings (build shared components)

1. **Shared components** -- DataTable, FormDialog, DetailPage, StepWizard, FilterBar
2. **Campaign settings** -- Edit campaign, delete campaign (simple CRUD, validates patterns)
3. **Campaign members + invites** -- Member list, invite dialog, role change, ownership transfer

**Rationale:** Shared components are needed by everything else. Campaign settings is the simplest CRUD and validates the FormDialog pattern. Members/invites are needed early because they control who can access other features.

### Phase 2: Voter Management Completion

4. **Voter detail enhancement** -- Contacts panel, tags panel, lists panel, add-note dialog
5. **Voter create/edit** -- VoterForm component, new voter route
6. **Voter lists** -- List CRUD pages, member management
7. **Advanced voter search** -- Search dialog with filter builder

**Rationale:** Voters are the core data model. Completing voter management gives all subsequent UI areas (phone banking, canvassing) a fully functional voter substrate to reference.

### Phase 3: Voter Import Wizard

8. **Import wizard** -- File upload, column mapping, confirmation, progress polling, import history

**Rationale:** Depends on voter types being complete (Phase 2). This is the most complex single feature -- a 4-step wizard with file upload, column detection, and async processing. Builds after voter management so imported voters land in a fully functional voter UI.

### Phase 4: Call Lists + DNC (prerequisites for phone banking)

9. **Call list management** -- CRUD, detail view with entries
10. **DNC management** -- List, add, import, delete, check

**Rationale:** Phone bank sessions reference call lists. Call lists depend on DNC filtering. Must exist before phone banking workflow makes sense.

### Phase 5: Phone Banking

11. **Phone bank session management** -- CRUD, caller management, status controls
12. **Active calling experience** -- Claim entry, voter card, survey script, outcome recording, auto-advance
13. **Session progress** -- Progress dashboard for session managers

**Rationale:** Depends on call lists (Phase 4), surveys (already complete), and voter detail (Phase 2). The calling experience is the highest-complexity UI in the project.

### Phase 6: Volunteer Management

14. **Volunteer CRUD** -- Create, detail page, edit, status management
15. **Volunteer sub-features** -- Availability, tags, hours tracking

**Rationale:** Volunteers are referenced by shifts. Build volunteer CRUD first so shift assignment has entities to reference.

### Phase 7: Shift Management

16. **Shift CRUD** -- Create, list, detail, edit, delete
17. **Shift operations** -- Signup/assign, check-in/out, roster, hours adjustment

**Rationale:** Depends on volunteers (Phase 6). Shifts are the final major feature area.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: God Route Files

**What:** Putting all page logic (data fetching, forms, tables, dialogs) in a single route file.
**Why bad:** The existing `dashboard.tsx` is 540 lines. The `canvassing/index.tsx` is 250 lines. These are already at the upper bound. New pages like volunteer detail or session detail will be even more complex.
**Instead:** Route files should orchestrate -- import hooks, import domain components, compose layout. Target <150 lines per route file. Extract domain logic into `components/{domain}/`.

### Anti-Pattern 2: Inconsistent Query Keys

**What:** Different developers using different key structures for the same data.
**Why bad:** Makes cache invalidation unreliable. A mutation that invalidates `["volunteers", campaignId]` won't clear a query using `["campaigns", campaignId, "volunteers"]`.
**Instead:** Use query key factories (the `keys` objects) in every hook file. Establish the convention: entity-first keys (`["volunteers", campaignId, volunteerId]`) not parent-first (`["campaigns", campaignId, "volunteers"]`). The existing code is mostly entity-first -- maintain that.

**Exception noted:** `useVoterTags.ts` uses `["campaigns", campaignId, "tags"]` for campaign-level tags but `["voters", campaignId, voterId, "tags"]` for voter tags. This is correct -- campaign tags are a campaign-scoped resource, voter tags are voter-scoped.

### Anti-Pattern 3: Over-Engineering the Import Wizard

**What:** Building a fully generic wizard framework for a single use case.
**Why bad:** The import wizard is the only multi-step flow in v1.2. Building a generic wizard adds complexity without reuse.
**Instead:** Build `StepWizard.tsx` as a simple step container (progress bar + step rendering). Keep import-specific logic in import-specific components. If a second wizard emerges later, refactor then.

### Anti-Pattern 4: Premature Abstraction of DataTable

**What:** Building one DataTable component that handles every table variation through props.
**Why bad:** shadcn/ui explicitly recommends against this. Each data table has unique sorting, filtering, and action requirements.
**Instead:** Build a `DataTable.tsx` that handles the common scaffolding (header, rows, empty state, loading skeleton) and expose column definitions + toolbar as composition points. Domain tables compose from this base.

### Anti-Pattern 5: File Upload in React State

**What:** Storing the CSV file contents in React/Zustand state.
**Why bad:** Voter files can be 10-50MB. Storing in memory causes browser tab crashes.
**Instead:** The API provides pre-signed upload URLs. Upload directly from browser to storage (MinIO) using `fetch` + `PUT`, then notify the API. File contents never enter React state.

---

## Scalability Considerations

| Concern | At Current Scale | At 10K Voters | At 100K Voters |
|---|---|---|---|
| Voter list pagination | Infinite scroll (cursor-based) works | Works fine | Works fine -- cursor pagination doesn't degrade |
| Voter search | Client-side filter params to API | API handles filtering | API handles filtering; consider debounce increase |
| Walk list entries | Load all entries | Paginate entries | Virtual scroll for entries list |
| Call list display | Simple table | Paginate | Virtual scroll |
| Import wizard | Small file, fast | 5-10s processing | Minutes of processing; progress polling essential |
| Dashboard queries | Fast aggregation | Acceptable | Consider caching/pre-aggregation on backend |

The frontend architecture does not need to change for scale. The cursor-based pagination and server-side filtering patterns handle growth. The only concern is import processing time, which is already handled by async polling.

---

## Sources

- Existing codebase analysis (12 hook files, 18 route files, all components) -- PRIMARY SOURCE
- [UI vs API Gap Analysis Report](/docs/ui-api-gap-analysis.md) -- endpoint coverage inventory
- [TanStack Router File-Based Routing](https://tanstack.com/router/latest/docs/routing/file-based-routing) -- route structure conventions
- [TanStack Query Key Factory](https://github.com/lukemorales/query-key-factory) -- query key organization pattern
- [TanStack Query Optimistic Updates](https://tanstack.com/query/v5/docs/react/guides/optimistic-updates) -- v5 optimistic update patterns
- [TanStack Query Cache Invalidation](https://tanstack.dev/query/latest/docs/framework/react/guides/query-invalidation) -- invalidation strategies
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/radix/data-table) -- table composition philosophy
- [Multi-step Forms with React Hook Form + Zod](https://blog.logrocket.com/building-reusable-multi-step-form-react-hook-form-zod/) -- wizard pattern reference
- [Concurrent Optimistic Updates (TkDodo)](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) -- advanced mutation patterns
