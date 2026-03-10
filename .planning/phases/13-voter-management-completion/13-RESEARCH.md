# Phase 13: Voter Management Completion - Research

**Researched:** 2026-03-10
**Domain:** React/TypeScript frontend — voter CRM UI (routes, components, hooks, filter builder)
**Confidence:** HIGH

## Summary

Phase 13 completes the voter CRM experience entirely in the frontend. The backend is fully implemented — all API routes for voters, contacts, tags, voter lists, and interactions are live and working. The frontend has skeleton routes (`voters/index.tsx`, `voters/$voterId.tsx`) and complete hook files (`useVoters.ts`, `useVoterContacts.ts`, `useVoterTags.ts`, `useVoterLists.ts`) but lacks the UI components to expose them.

There is one critical API mismatch to fix before contact management can work: the `useVoterContacts.ts` hook calls per-type set-primary URLs (`.../phones/${id}/set-primary`) but the backend only exposes a unified endpoint (`.../contacts/{contact_type}/{contact_id}/set-primary`). This must be corrected in the hook file as part of the Contacts tab implementation.

The phase also requires two new sub-routes (`voters/lists/` and `voters/tags/`) with a sidebar layout mirroring the settings layout pattern, and the transformation of the voters index from an infinite-scroll table to a DataTable with a collapsible `VoterFilterBuilder` panel. The `VoterFilterBuilder` component is a critical shared piece that feeds both the voters list filter panel and dynamic list creation — it must be designed as a self-contained, importable component from the start.

**Primary recommendation:** Build in five clear streams: (1) voters layout + routing scaffold, (2) voters index upgrade + VoterFilterBuilder, (3) voter detail sub-tabs, (4) voter lists route + detail, (5) tags route. Each stream is largely independent once routing is in place.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Voter detail page structure**
- Sub-tabs layout: Overview | Contacts | Tags | History
- Overview tab: demographics (existing info) + voting record in two-column layout
- Contacts tab: contact management (phones, emails, addresses)
- Tags tab: per-voter tag assignment
- History tab: interaction history + add note
- Page header: voter name + party badge + Edit button (pencil, manager+ gated) + + Add Interaction button (always visible)
- Edit voter form: opens as a right-side Sheet/drawer — no navigation away from detail page

**Contact management UX (Contacts tab)**
- Three sections: Phone Numbers, Email Addresses, Mailing Addresses
- Each contact shown as a row: star icon (filled = primary, outline = not primary) + value + type label + edit pencil + delete trash
- Clicking the star immediately sets that contact as primary (optimistic update, one API call)
- Inline add/edit form: clicking + Add phone/edit pencil expands a compact inline form below the row (no modal)
- Inline form fields: phone = value + type selector; email = value + type selector; address = line1 + line2 + city + state + zip (all inline, multi-field)
- Save/Cancel buttons on each inline form

**Create voter**
- + New Voter button on the voters list page (voters index header)
- Opens a right-side Sheet/drawer with the voter create form
- Consistent with invite dialog pattern from Phase 12

**Voter navigation structure**
Three sub-routes under `/campaigns/$campaignId/voters/`:
- `/voters/` — All Voters (DataTable list with filter panel)
- `/voters/lists/` — Voter Lists index + `/voters/lists/$listId` — List detail
- `/voters/tags/` — Campaign-level tag management

Sidebar shows "Voters" group with: All Voters | Lists | Tags links

**Voter lists**
- Dedicated `/voters/lists` route (not a tab on the voters list page)
- Lists index: DataTable with list name, type badge (static/dynamic), voter count, created date; kebab menu for edit/delete
- Single + New List button → dialog with type selector first (Static: just name; Dynamic: name + filter criteria builder)
- Static list detail: shows member table + + Add Voters button that opens a search dialog to find and add voters by name
- Dynamic list detail: shows current filter criteria summary + Edit Filters button that reopens the filter builder; live voter count updates when filters change; member table below
- Dynamic list filter criteria are editable after creation

**Campaign-level tag management**
- Dedicated `/voters/tags` route (alongside `/voters/lists/`)
- Tags index: DataTable with tag name, voter count, color (if applicable); inline edit/delete via kebab or inline row actions
- + New Tag button in page header

**Advanced search (voters list)**
- Collapsible filter panel toggled by a Filters button in the voters list page header
- Filter panel slides open above the DataTable (not a sidebar drawer)
- Active filters shown as dismissible chips between the filter panel and the table
- First-class filter dimensions (shown by default): Party, Age range, Voting history, Tags, City/District
- Additional fields (zip, state, gender, etc.) available under a More filters toggle within the panel
- Voting history filter: election year checkboxes (voted/not voted per election year) — matches backend `election_history` filter support

**Shared VoterFilterBuilder component**
- Extract a reusable VoterFilterBuilder component used in both:
  1. The voters list collapsible filter panel
  2. The dynamic list creation/edit dialog
- Single source of truth for filter logic and UI — changes to filters only need to happen once

### Claude's Discretion
- Exact column set for voters DataTable (name, party, city, district, tags count seems right)
- Loading skeleton patterns for sub-tabs
- Empty state messaging per section/tab
- Color picker implementation for tags (if tags support colors)
- Interaction note form design on the History tab (textarea + submit vs inline)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOTR-01 | User can view and manage contacts (phone, email, address) in voter detail | Contacts tab with inline add/edit forms; `useVoterContacts.ts` mutations are complete; set-primary URL mismatch must be fixed |
| VOTR-02 | User can set a primary contact for each contact type | Star-click optimistic update on contact row; backend unified set-primary endpoint at `/contacts/{type}/{id}/set-primary` |
| VOTR-03 | User can create a new voter record manually | `useCreateVoter` mutation exists; Sheet drawer form with zod validation; `+ New Voter` button on voters index |
| VOTR-04 | User can edit an existing voter record | `useUpdateVoter` mutation exists; Sheet drawer on voter detail page; `useFormGuard` for unsaved changes |
| VOTR-05 | User can manage campaign-level voter tags | New `/voters/tags` route; `useCreateTag` mutation exists; `VoterTag` type lacks color field but tag management UI via DataTable |
| VOTR-06 | User can add/remove tags on individual voters | Tags tab on voter detail; `useAddTagToVoter`/`useRemoveTagFromVoter` exist; tag picker from `useCampaignTags` |
| VOTR-07 | User can create and manage static voter lists | New `/voters/lists` route; `useCreateVoterList`, `useUpdateVoterList`, `useDeleteVoterList` mutations exist |
| VOTR-08 | User can create and manage dynamic voter lists with filter criteria | `VoterListCreate.filter_query` is a JSON-serialized `VoterFilter`; `VoterFilterBuilder` shared component feeds this |
| VOTR-09 | User can view voter list detail with member management | `/voters/lists/$listId` route; `useVoterListVoters`, `useAddListMembers`, `useRemoveListMembers` exist |
| VOTR-10 | User can use advanced search with composable filters | Collapsible `VoterFilterBuilder` panel on voters index; calls `POST /voters/search` via `useSearchVoters` |
| VOTR-11 | User can add interaction notes on voter detail page | History tab; `useCreateInteraction` mutation exists; backend only accepts `type: "note"` via API |
</phase_requirements>

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @tanstack/react-router | ^1.159.5 | File-based routing with `createFileRoute` | New routes go in `web/src/routes/campaigns/$campaignId/voters/` |
| @tanstack/react-query | ^5.90.21 | Server state, mutations, cache invalidation | All hooks already written; mutations complete |
| @tanstack/react-table | ^8.21.3 | DataTable (manual server-side mode) | Already wrapped in shared `DataTable` component |
| react-hook-form | ^7.71.1 | Form state management | `mode: "onBlur"` pattern established |
| zod | ^4.3.6 | Schema validation with `zodResolver` | Used for all form schemas |
| sonner | ^2.0.7 | Toast notifications | `toast.success` / `toast.error` pattern established |
| lucide-react | ^0.563.0 | Icons (Star, StarOff, Pencil, Trash2, etc.) | Already in use throughout |

### shadcn/ui Components (all pre-installed)
| Component | File | Use in Phase 13 |
|-----------|------|-----------------|
| Sheet | `components/ui/sheet.tsx` | Voter create/edit drawer |
| Tabs | `components/ui/tabs.tsx` | Voter detail sub-tabs (Overview/Contacts/Tags/History) |
| Dialog | `components/ui/dialog.tsx` | New List dialog, Add Voters to list dialog |
| Badge | `components/ui/badge.tsx` | Party badge, list type badge, tag chips |
| Button | `components/ui/button.tsx` | All action buttons |
| Input | `components/ui/input.tsx` | Form fields |
| Select | `components/ui/select.tsx` | Type selectors in contact forms |
| Skeleton | `components/ui/skeleton.tsx` | Loading states |
| Checkbox | `components/ui/checkbox.tsx` | Voting history filter, tag checkboxes |

### Shared Project Components (all pre-built)
| Component | Path | Use in Phase 13 |
|-----------|------|-----------------|
| `DataTable` | `components/shared/DataTable.tsx` | Voters list, lists index, tags index, list member table |
| `EmptyState` | `components/shared/EmptyState.tsx` | All empty states per tab/section |
| `RequireRole` | `components/shared/RequireRole.tsx` | Wrap Edit/Delete/Add actions with `minimum="manager"` |
| `DestructiveConfirmDialog` | `components/shared/DestructiveConfirmDialog.tsx` | List delete, tag delete |
| `ConfirmDialog` | `components/shared/ConfirmDialog.tsx` | Unsaved changes guard prompt |

### Test Infrastructure
| Property | Value |
|----------|-------|
| Framework | Vitest + happy-dom + @testing-library/react |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npm run test -- --run --reporter=verbose 2>&1` |
| Full suite command | `cd web && npm run test -- --run --coverage 2>&1` |

---

## Architecture Patterns

### Voter Sub-Route Layout

The voters section requires a layout wrapper analogous to `settings.tsx`. Create a new `voters.tsx` layout file alongside `voters/index.tsx`:

```
web/src/routes/campaigns/$campaignId/
├── voters.tsx             ← NEW: layout wrapper with sidebar nav (All Voters | Lists | Tags)
├── voters/
│   ├── index.tsx          ← UPGRADE: DataTable + filter panel + New Voter sheet
│   ├── $voterId.tsx       ← REFACTOR: sub-tabs layout
│   ├── lists/
│   │   ├── index.tsx      ← NEW: voter lists DataTable
│   │   └── $listId.tsx    ← NEW: list detail (static or dynamic)
│   └── tags/
│       └── index.tsx      ← NEW: campaign tags DataTable
```

**Important:** In TanStack Router, a `voters.tsx` layout file alongside the `voters/` directory makes `voters.tsx` the layout parent for all child routes. Outlet renders the matched child. This is the exact same pattern used by `settings.tsx` + `settings/` directory.

### Voters Layout Pattern (mirrors settings.tsx exactly)

```typescript
// web/src/routes/campaigns/$campaignId/voters.tsx
import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router"

function VotersLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/voters" })

  const navItems = [
    { to: `/campaigns/${campaignId}/voters`, label: "All Voters" },
    { to: `/campaigns/${campaignId}/voters/lists`, label: "Lists" },
    { to: `/campaigns/${campaignId}/voters/tags`, label: "Tags" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-0">
        <nav className="w-48 shrink-0 border-r pr-4">
          {/* Same nav pattern as settings.tsx */}
        </nav>
        <div className="flex-1 pl-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters")({
  component: VotersLayout,
})
```

**Note:** The voters index is at `/campaigns/$campaignId/voters/` (trailing slash = `index.tsx`), not `/campaigns/$campaignId/voters` (no trailing slash = `voters.tsx`). TanStack Router distinguishes these.

### VoterFilterBuilder Component (shared, critical)

This is the most architecturally significant component in the phase. It is consumed in two places and must be self-contained:

```typescript
// web/src/components/voters/VoterFilterBuilder.tsx

interface VoterFilterBuilderProps {
  value: VoterFilterState
  onChange: (filters: VoterFilterState) => void
  mode?: "panel" | "dialog"  // "panel" = collapsible inline, "dialog" = within a Dialog
}
```

The `VoterFilterState` type must align with the backend `VoterFilter` schema:

```typescript
// Backend VoterFilter fields (from app/schemas/voter_filter.py):
// party, parties (list), precinct, city, state, zip_code, county,
// congressional_district, age_min, age_max, gender,
// voted_in (list of election years), not_voted_in (list),
// tags (all), tags_any (any), registered_after, registered_before,
// search, logic ("AND" | "OR")
```

The frontend `VoterFilter` type (`web/src/types/voter.ts`) is incomplete — it only has `party`, `city`, `state`, `zip_code`, `county`, `age_min`, `age_max`, `gender`, `search`, `tags`. It is missing `parties`, `precinct`, `voted_in`, `not_voted_in`, `tags_any`, `congressional_district`, `registered_after`, `registered_before`, `logic`. **The type must be expanded** to match the backend schema before building `VoterFilterBuilder`.

**Primary filter dimensions (always shown):**
- Party: multi-select checkboxes (DEM, REP, NPA, LIB, GRN, OTH) → maps to `parties` array
- Age range: two number inputs (age_min, age_max)
- Voting history: election year checkboxes in two groups "Voted in" and "Did not vote in" → maps to `voted_in[]` and `not_voted_in[]`
- Tags: multi-select from campaign tags → maps to `tags` (all) or `tags_any`
- City/District: text input for `city`

**More filters (secondary, hidden under toggle):**
- Zip code (`zip_code`)
- State (`state`)
- Gender (`gender`)
- Precinct (`precinct`)
- Congressional District (`congressional_district`)
- Registration date range (`registered_after`, `registered_before`)
- Logic toggle AND/OR (`logic`)

### Dynamic List filter_query Storage Pattern

Dynamic voter lists store filter criteria as a JSON string in `VoterList.filter_query`. The VoterFilterBuilder value must be serialized when saving and deserialized when loading:

```typescript
// On create/update dynamic list:
const filterQuery = JSON.stringify(filterBuilderValue)
await createVoterList.mutateAsync({ name, list_type: "dynamic", filter_query: filterQuery })

// On loading dynamic list for editing:
const filters = list.filter_query ? JSON.parse(list.filter_query) : {}
```

### Contact Row Pattern (inline expand, no modal)

Contacts tab uses a compact list pattern, NOT a DataTable. Each contact type has its own section with inline expand/collapse:

```typescript
// State: which contact row has its inline form open
const [expandedEdit, setExpandedEdit] = useState<string | null>(null)  // contact id
const [showAddForm, setShowAddForm] = useState(false)

// Row renders: contact value + type badge + star button + edit pencil + trash
// When pencil clicked: setExpandedEdit(contact.id)
// Inline form appears below the row, not in a modal
// Save calls useUpdatePhone/useUpdateEmail/useUpdateAddress
// Cancel calls setExpandedEdit(null)
```

### Set-Primary URL Mismatch Fix (REQUIRED)

The `useVoterContacts.ts` hook must be corrected before the Contacts tab will work:

**Current (wrong) — per-type endpoints that don't exist:**
```typescript
// useSetPrimaryPhone calls:
api.post(`.../${voterId}/phones/${phoneId}/set-primary`)
// useSetPrimaryEmail calls:
api.post(`.../${voterId}/emails/${emailId}/set-primary`)
// useSetPrimaryAddress calls:
api.post(`.../${voterId}/addresses/${addressId}/set-primary`)
```

**Correct — unified endpoint that exists:**
```
POST /campaigns/{campaign_id}/voters/{voter_id}/contacts/{contact_type}/{contact_id}/set-primary
```

**Fix:** Replace the three separate set-primary hooks with a single `useSetPrimaryContact` hook:
```typescript
export function useSetPrimaryContact(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contactType, contactId }: { contactType: "phones" | "emails" | "addresses"; contactId: string }) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/${voterId}/contacts/${contactType}/${contactId}/set-primary`)
        .json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}
```

### Voter Tags API Note

The backend `POST /campaigns/{campaign_id}/voters/{voter_id}/tags` accepts a body with `tag_id` (see `VoterTagAssign` schema), but the frontend hook `useAddTagToVoter` calls it with the tagId as the URL path parameter, not as a body. Verify this mismatch:

```typescript
// Current hook (potentially wrong):
mutationFn: (tagId: string) =>
  api.post(`.../${voterId}/tags/${tagId}`).json(),
```

The backend endpoint is `POST /voters/{voter_id}/tags` with body `{ tag_id: ... }`, not `POST /voters/{voter_id}/tags/{tag_id}`. **This needs verification** when building the Tags tab — if the hook is wrong, it needs fixing alongside the UI.

### useVoterLists URL Mismatch

The `useVoterLists.ts` hook calls `api/v1/campaigns/${campaignId}/voter-lists` but the backend routes are registered at `api/v1/campaigns/{campaign_id}/lists` (not `voter-lists`). Verify the actual registered URL prefix:

- Hook URL: `.../voter-lists`
- Backend router: `/campaigns/{campaign_id}/lists`

**Check the FastAPI router registration** — if the hook URL is wrong, fix it. If the prefix includes `voter-` from the router, the hook is fine. This needs to be verified at plan-time or early in implementation.

### Voter Detail Sub-Tab Routing

The `$voterId.tsx` route does NOT become sub-routes. The voter detail page remains a single route with tab state managed via local state or URL search params. The CONTEXT.md says "sub-tabs layout" but uses shadcn `Tabs` component within the single route file — not TanStack Router sub-routes.

```typescript
// $voterId.tsx restructure:
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function VoterDetailPage() {
  // existing voter + interactions queries stay
  // add: useVoterContacts, useVoterTags, useCampaignTags
  // add: useCreateInteraction, useUpdateVoter

  return (
    <div>
      {/* Header: name + party badge + Edit button (RequireRole manager) + Add Interaction */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{/* existing two-col layout */}</TabsContent>
        <TabsContent value="contacts">{/* ContactsTab component */}</TabsContent>
        <TabsContent value="tags">{/* TagsTab component */}</TabsContent>
        <TabsContent value="history">{/* HistoryTab with add note */}</TabsContent>
      </Tabs>
    </div>
  )
}
```

### Voter Create/Edit Sheet Pattern

Consistent with invite dialog from Phase 12 but using Sheet instead of Dialog:

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

// Voter create form schema (zod):
const voterSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  // ... all VoterCreate fields
})
```

The `useFormGuard` hook works with route blocking — it is appropriate for the Edit sheet since the user stays on the voter detail page. For the Create sheet on the voters index page, a simpler unsaved-changes pattern (reset on close) is sufficient.

### Add Interaction Note Pattern

The backend only accepts `type: "note"` via API. The interaction payload for notes should contain a `text` field:

```typescript
// Create interaction call:
await createInteraction.mutateAsync({
  type: "note",
  payload: { text: noteText }
})
```

The existing interactions display in `$voterId.tsx` renders `interaction.payload` as key-value pairs — this will correctly display `text: "note content"`.

### Static List "Add Voters" Search Dialog

When adding voters to a static list, a search dialog needs to find voters by name. This reuses the existing `useVoters` hook with a `search` filter, displayed in a Dialog with a search input and checkboxes to select voters, then calls `useAddListMembers`:

```typescript
// Add Voters to Static List dialog:
// - Input: search voters by name (debounced useVoters query)
// - Results: checkbox list of voters
// - Confirm: calls useAddListMembers({ voter_ids: selectedIds })
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table with sorting/pagination | Custom table | `DataTable` component | Already handles server-side sorting, pagination, empty states, skeletons |
| Empty states | Custom empty divs | `EmptyState` component | Consistent icon + title + description + action pattern |
| Permission gating | Custom role checks | `RequireRole` component | Already wires to `usePermissions` correctly |
| Destructive confirmation | Custom confirm flow | `DestructiveConfirmDialog` | Type-to-confirm pattern already built |
| Form change guard | Manual beforeunload | `useFormGuard` hook | Handles both route blocking and beforeunload |
| Toast notifications | Custom notification | Sonner `toast.success`/`toast.error` | Project standard |
| Filter state management | Complex global state | Local component state + URL search params | TanStack Router supports search params natively for shareable filter state |

**Key insight:** The backend is 100% implemented. This phase is pure frontend composition of existing hooks, components, and API endpoints. No new backend work is needed.

---

## Common Pitfalls

### Pitfall 1: voters.tsx Layout vs voters/index.tsx Conflict

**What goes wrong:** Creating `voters.tsx` as a layout wrapper incorrectly — if it renders the voter list content itself instead of using `<Outlet />`, the index route won't render.

**Why it happens:** Confusion between the layout file (`voters.tsx`) and the index route (`voters/index.tsx`). The layout file must only render navigation + `<Outlet />`.

**How to avoid:** Follow the exact `settings.tsx` + `settings/index.tsx` pattern. The layout file uses `createFileRoute("/campaigns/$campaignId/voters")` and renders only nav + Outlet.

### Pitfall 2: Set-Primary URL Mismatch (Known Bug)

**What goes wrong:** The three existing `useSetPrimaryPhone`, `useSetPrimaryEmail`, `useSetPrimaryAddress` hooks call URLs that don't exist on the backend. Clicking the star icon silently fails or returns 404.

**Why it happens:** The hooks were written against assumed per-type endpoints; the backend implemented a unified endpoint.

**How to avoid:** Replace the three hooks with a single `useSetPrimaryContact(campaignId, voterId)` that accepts `{ contactType, contactId }` and calls the correct unified URL.

### Pitfall 3: VoterFilter Type Incomplete

**What goes wrong:** Building `VoterFilterBuilder` against the existing `VoterFilter` TypeScript type, which is missing most backend-supported filter fields (`parties`, `voted_in`, `not_voted_in`, `tags_any`, `congressional_district`, `logic`, etc.).

**Why it happens:** The type was written for the basic GET filter params, not the full POST search body.

**How to avoid:** Expand `web/src/types/voter.ts` to add all missing fields from `app/schemas/voter_filter.py` before building VoterFilterBuilder. The expanded type is used by both the `VoterFilter` interface and `VoterFilterBuilder` props.

### Pitfall 4: DataTable Pagination with Infinite Query

**What goes wrong:** The existing voters index uses `useInfiniteQuery` (cursor-based infinite scroll with "Load More"), but `DataTable` uses `onNextPage`/`onPreviousPage` props for page-by-page navigation. These are incompatible.

**Why it happens:** The voters index was built before `DataTable` existed.

**How to avoid:** When upgrading the voters index, switch from `useInfiniteQuery` to `useQuery` with cursor state managed in component state. Pass `cursor` in/out to paginate forward/backward. Alternatively, keep infinite query and use the "Load More" button pattern but render into DataTable. **Recommendation:** Switch to standard `useQuery` with local cursor state for DataTable compatibility.

### Pitfall 5: Dynamic List filter_query JSON Serialization

**What goes wrong:** Storing `VoterFilterState` object directly in `filter_query` field instead of JSON-stringifying it. The backend field is a `string | null`.

**Why it happens:** The TypeScript type `VoterListCreate.filter_query?: string` isn't obvious about the intended JSON payload.

**How to avoid:** Always `JSON.stringify(filterValue)` before sending and `JSON.parse(list.filter_query ?? "{}")` when reading back. Add a safe wrapper function.

### Pitfall 6: useVoterLists Hook vs Backend Route URL

**What goes wrong:** The `useVoterLists.ts` hook calls `voter-lists` but backend route is `lists`. If there's a mismatch, all voter list operations will 404.

**How to avoid:** Verify the FastAPI router prefix in `app/api/router.py` or equivalent. Fix the hook URLs if they don't match before implementing the Lists UI.

### Pitfall 7: Tag Add API — Body vs URL Path

**What goes wrong:** `useAddTagToVoter` may call the wrong URL. The backend `POST /voters/{voter_id}/tags` expects a body `{ tag_id: ... }` (via `VoterTagAssign`), not a path param.

**How to avoid:** Check `voter_tags.py` endpoint signature against hook implementation before building Tags tab. Correct the hook if needed.

---

## Code Examples

### Voters Layout with Sidebar Nav
```typescript
// Source: mirrors web/src/routes/campaigns/$campaignId/settings.tsx
export const Route = createFileRoute("/campaigns/$campaignId/voters")({
  component: VotersLayout,
})

function VotersLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/voters" })
  const navItems = [
    { to: `/campaigns/${campaignId}/voters`, label: "All Voters" },
    { to: `/campaigns/${campaignId}/voters/lists`, label: "Lists" },
    { to: `/campaigns/${campaignId}/voters/tags`, label: "Tags" },
  ]
  return (
    <div className="flex gap-0">
      <nav className="w-48 shrink-0 border-r pr-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>
                {({ isActive }) => (
                  <span className={isActive ? "bg-muted..." : "text-muted-foreground..."}>
                    {item.label}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 pl-8"><Outlet /></div>
    </div>
  )
}
```

### Corrected Set-Primary Hook
```typescript
// Source: fix for web/src/hooks/useVoterContacts.ts
export function useSetPrimaryContact(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      contactType,
      contactId,
    }: {
      contactType: "phones" | "emails" | "addresses"
      contactId: string
    }) =>
      api
        .post(
          `api/v1/campaigns/${campaignId}/voters/${voterId}/contacts/${contactType}/${contactId}/set-primary`,
        )
        .json(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}
```

### Expanded VoterFilter Type
```typescript
// Source: align with app/schemas/voter_filter.py
export interface VoterFilter {
  // Basic
  search?: string
  party?: string
  parties?: string[]
  // Location
  city?: string
  state?: string
  zip_code?: string
  county?: string
  precinct?: string
  congressional_district?: string
  // Demographics
  age_min?: number
  age_max?: number
  gender?: string
  // Voting history
  voted_in?: string[]
  not_voted_in?: string[]
  // Tags
  tags?: string[]
  tags_any?: string[]
  // Registration
  registered_after?: string
  registered_before?: string
  // Logic
  logic?: "AND" | "OR"
}
```

### VoterFilterBuilder Component Interface
```typescript
// Source: architecture decision from CONTEXT.md
interface VoterFilterBuilderProps {
  value: VoterFilter
  onChange: (filters: VoterFilter) => void
  className?: string
}

export function VoterFilterBuilder({ value, onChange, className }: VoterFilterBuilderProps) {
  const [showMore, setShowMore] = useState(false)
  // Renders primary filters always, secondary under "More filters" toggle
  // onChange called with complete merged filter object on any change
}
```

### DataTable Column with Kebab Menu
```typescript
// Source: web/src/routes/campaigns/$campaignId/settings/members.tsx pattern
const listColumns: ColumnDef<VoterList, unknown>[] = [
  { accessorKey: "name", header: "Name", enableSorting: true },
  {
    accessorKey: "list_type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant={row.original.list_type === "dynamic" ? "default" : "secondary"}>
        {row.original.list_type}
      </Badge>
    ),
  },
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
            <DropdownMenuItem onClick={() => handleEdit(row.original)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleDelete(row.original)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </RequireRole>
    ),
  },
]
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Infinite scroll "Load More" (voters/index.tsx) | DataTable with cursor-based next/prev pagination | Consistent with rest of app; matches DataTable props |
| Basic raw `<Table>` (voters index) | Shared `DataTable` component | Sorting, empty states, skeletons all included |
| Per-type set-primary URLs (broken hooks) | Unified `/contacts/{type}/{id}/set-primary` | Bug fix required before contacts work |

**Deprecated in this phase:**
- The `useInfiniteQuery` + "Load More" pattern in the voters index is replaced by standard `useQuery` with cursor state.
- The three separate `useSetPrimary*` hooks are replaced by a single `useSetPrimaryContact`.

---

## Open Questions

1. **useVoterLists hook URL: `voter-lists` vs `lists`**
   - What we know: Hook calls `voter-lists`; backend router registers `lists`
   - What's unclear: Whether the API router prefix adds `voter-` somewhere
   - Recommendation: Check `app/api/router.py` registration at start of Wave implementing lists

2. **useAddTagToVoter: body vs path param**
   - What we know: Backend expects `POST /voters/{voter_id}/tags` with `{ tag_id }` body; hook passes tagId in URL path
   - What's unclear: Whether the backend also has a path-param version registered
   - Recommendation: Verify `voter_tags.py` route signatures; fix hook before Tags tab

3. **VoterTag color support**
   - What we know: `VoterTag` type has only `id`, `campaign_id`, `name` — no `color` field; backend `VoterTagCreate` only has `name`
   - What's unclear: Whether tags support colors at all
   - Recommendation: Per CONTEXT.md ("color picker implementation for tags — if tags support colors"), omit color picker unless backend adds color field; use a simple colored dot from a pre-defined palette as Claude's discretion

4. **Voters list pagination: infinite vs cursor**
   - What we know: Current voters index uses `useInfiniteQuery`; `DataTable` uses next/prev page props
   - Recommendation: Switch to `useQuery` with local cursor state for DataTable compatibility. Pattern used by settings pages.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + happy-dom + @testing-library/react |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --reporter=verbose` |
| Full suite command | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOTR-01 | Contacts tab renders phone/email/address sections | unit | `npm run test -- --run --reporter=verbose src/hooks/useVoterContacts.test.ts` | Wave 0 |
| VOTR-02 | Set-primary calls correct unified endpoint | unit | `npm run test -- --run src/hooks/useVoterContacts.test.ts` | Wave 0 |
| VOTR-03 | Create voter mutation fires with correct payload | unit | `npm run test -- --run src/hooks/useVoters.test.ts` | Wave 0 |
| VOTR-04 | Update voter mutation fires with correct payload | unit | `npm run test -- --run src/hooks/useVoters.test.ts` | Wave 0 |
| VOTR-05 | Campaign tags management renders and creates tag | unit | `npm run test -- --run src/hooks/useVoterTags.test.ts` | Wave 0 |
| VOTR-06 | Add/remove tag on voter updates query cache | unit | `npm run test -- --run src/hooks/useVoterTags.test.ts` | Wave 0 |
| VOTR-07 | Static list create/update/delete mutations | unit | `npm run test -- --run src/hooks/useVoterLists.test.ts` | Wave 0 |
| VOTR-08 | Dynamic list stores filter_query as JSON string | unit | `npm run test -- --run src/hooks/useVoterLists.test.ts` | Wave 0 |
| VOTR-09 | List members query uses correct URL | unit | `npm run test -- --run src/hooks/useVoterLists.test.ts` | Wave 0 |
| VOTR-10 | VoterFilterBuilder renders all primary filter dimensions | unit | `npm run test -- --run src/components/voters/VoterFilterBuilder.test.tsx` | Wave 0 |
| VOTR-11 | Create interaction sends type "note" and payload | unit | `npm run test -- --run src/hooks/useVoters.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --reporter=verbose`
- **Per wave merge:** `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage`
- **Phase gate:** Full suite green (95% coverage thresholds) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useVoterContacts.test.ts` — covers VOTR-01, VOTR-02 (set-primary URL fix)
- [ ] `web/src/hooks/useVoters.test.ts` — covers VOTR-03, VOTR-04, VOTR-11
- [ ] `web/src/hooks/useVoterTags.test.ts` — covers VOTR-05, VOTR-06
- [ ] `web/src/hooks/useVoterLists.test.ts` — covers VOTR-07, VOTR-08, VOTR-09
- [ ] `web/src/components/voters/VoterFilterBuilder.test.tsx` — covers VOTR-10

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `web/src/hooks/useVoterContacts.ts` — confirmed set-primary URL mismatch
- Codebase direct read: `app/api/v1/voter_contacts.py` — confirmed unified set-primary endpoint
- Codebase direct read: `app/schemas/voter_filter.py` — full VoterFilter schema with all fields
- Codebase direct read: `web/src/types/voter.ts` — confirmed incomplete VoterFilter type
- Codebase direct read: `web/src/routes/campaigns/$campaignId/settings.tsx` — layout pattern to mirror
- Codebase direct read: `web/src/routes/campaigns/$campaignId/settings/members.tsx` — most recent Phase 12 implementation pattern
- Codebase direct read: `web/src/components/shared/DataTable.tsx` — DataTable API props confirmed
- Codebase direct read: `web/vitest.config.ts` — test framework and coverage thresholds
- Codebase direct read: `app/api/v1/voter_interactions.py` — confirmed `type: "note"` only via API
- Codebase direct read: `app/api/v1/voter_lists.py` — confirmed `lists` URL prefix (not `voter-lists`)
- Codebase direct read: `web/src/hooks/useVoterLists.ts` — confirmed `voter-lists` hook URL (likely mismatch)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — locked UX decisions with specific component choices
- STATE.md — Phase 12 patterns (DataTable server-side, RequireRole hide-not-disable)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries directly verified in codebase
- Architecture: HIGH — patterns directly verified from existing Phase 12 implementations
- Pitfalls: HIGH — two bugs (set-primary mismatch, VoterFilter type incomplete) confirmed by direct code comparison; two other potential bugs flagged for verification
- Open questions: LOW (by definition) — need verification at implementation time

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (stable framework versions, slow-moving project stack)
