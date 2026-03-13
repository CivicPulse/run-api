# Phase 13: Voter Management Completion - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the voter CRM experience in the UI: contacts management (phones, emails, addresses with primary setting), per-voter tags, voter lists (static and dynamic), create/edit voter forms, campaign-level tag management, advanced composable search, and interaction notes. The existing `voters/index.tsx` (basic list) and `voters/$voterId.tsx` (basic detail) are skeletons — this phase makes them production-complete.

</domain>

<decisions>
## Implementation Decisions

### Voter detail page structure
- Sub-tabs layout: **Overview | Contacts | Tags | History**
- Overview tab: demographics (existing info) + voting record in two-column layout
- Contacts tab: contact management (phones, emails, addresses)
- Tags tab: per-voter tag assignment
- History tab: interaction history + add note
- Page header: voter name + party badge + **Edit button** (pencil, manager+ gated) + **+ Add Interaction** button (always visible)
- Edit voter form: opens as a **right-side Sheet/drawer** — no navigation away from detail page

### Contact management UX (Contacts tab)
- Three sections: **Phone Numbers**, **Email Addresses**, **Mailing Addresses**
- Each contact shown as a row: star icon (⭐ filled = primary, ☆ outline = not primary) + value + type label + edit pencil + delete trash
- **Clicking the star immediately sets that contact as primary** (optimistic update, one API call)
- **Inline add/edit form**: clicking `+ Add phone`/edit pencil expands a compact inline form below the row (no modal)
- Inline form fields: phone = value + type selector; email = value + type selector; address = line1 + line2 + city + state + zip (all inline, multi-field)
- Save/Cancel buttons on each inline form

### Create voter
- **`+ New Voter` button on the voters list page** (voters index header)
- Opens a right-side Sheet/drawer with the voter create form
- Consistent with invite dialog pattern from Phase 12

### Voter navigation structure
Three sub-routes under `/campaigns/$campaignId/voters/`:
- `/voters/` — All Voters (DataTable list with filter panel)
- `/voters/lists/` — Voter Lists index + `/voters/lists/$listId` — List detail
- `/voters/tags/` — Campaign-level tag management

Sidebar shows "Voters" group with: All Voters | Lists | Tags links

### Voter lists
- **Dedicated `/voters/lists` route** (not a tab on the voters list page)
- Lists index: DataTable with list name, type badge (static/dynamic), voter count, created date; kebab menu for edit/delete
- **Single `+ New List` button** → dialog with type selector first (Static: just name; Dynamic: name + filter criteria builder)
- **Static list detail**: shows member table + `+ Add Voters` button that opens a search dialog to find and add voters by name
- **Dynamic list detail**: shows current filter criteria summary + `Edit Filters` button that reopens the filter builder; live voter count updates when filters change; member table below
- Dynamic list filter criteria **are editable** after creation

### Campaign-level tag management
- **Dedicated `/voters/tags` route** (alongside `/voters/lists/`)
- Tags index: DataTable with tag name, voter count, color (if applicable); inline edit/delete via kebab or inline row actions
- `+ New Tag` button in page header

### Advanced search (voters list)
- **Collapsible filter panel** toggled by a `Filters ▼` button in the voters list page header
- Filter panel slides open above the DataTable (not a sidebar drawer)
- Active filters shown as **dismissible chips** between the filter panel and the table
- First-class filter dimensions (shown by default): **Party, Age range, Voting history, Tags, City/District**
- Additional fields (zip, state, gender, etc.) available under a `More filters` toggle within the panel
- Voting history filter: **election year checkboxes** (voted/not voted per election year) — matches backend `election_history` filter support

### Shared VoterFilterBuilder component
- Extract a **reusable `VoterFilterBuilder` component** used in both:
  1. The voters list collapsible filter panel
  2. The dynamic list creation/edit dialog
- Single source of truth for filter logic and UI — changes to filters only need to happen once

### Claude's Discretion
- Exact column set for voters DataTable (name, party, city, district, tags count seems right)
- Loading skeleton patterns for sub-tabs
- Empty state messaging per section/tab
- Color picker implementation for tags (if tags support colors)
- Interaction note form design on the History tab (textarea + submit vs inline)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataTable` component (`web/src/components/shared/DataTable.tsx`): Server-side sorting/filtering/pagination — use for voters list, lists index, tags index, list detail member table
- `EmptyState` component (`web/src/components/shared/EmptyState.tsx`): Use for empty states on all sub-tabs and lists
- `RequireRole` component (`web/src/components/shared/RequireRole.tsx`): Wrap Edit/Delete/Add actions with `minimum="manager"`
- `DestructiveConfirmDialog` (`web/src/components/shared/DestructiveConfirmDialog.tsx`): Use for voter delete (if added), list delete, tag delete
- `ConfirmDialog` (`web/src/components/shared/ConfirmDialog.tsx`): Use for unsaved changes guard
- `Sheet` from shadcn/ui: Right-side drawer for voter create/edit forms — already installed
- `Tabs` from shadcn/ui: Voter detail sub-tabs (Overview / Contacts / Tags / History)
- `useFormGuard` (`web/src/hooks/useFormGuard.ts`): Wire up to voter create/edit sheet for unsaved changes protection
- `useVoters.ts`, `useVoterContacts.ts`, `useVoterTags.ts`, `useVoterLists.ts`: Hooks exist — need mutation methods added for create/update/delete operations

### Established Patterns
- TanStack Router file-based routing: new routes go in `web/src/routes/campaigns/$campaignId/voters/`
- TanStack Query: `useQuery`/`useMutation` with `queryClient.invalidateQueries` on mutations
- react-hook-form + zod, `mode: "onBlur"` — validate on blur + submit
- Sonner toasts for success/error feedback

### Integration Points
- Sidebar nav in `__root.tsx`: Add "Lists" and "Tags" links under the Voters group
- Existing `voters/index.tsx`: Needs upgrade from raw Table to DataTable; add Filters panel and `+ New Voter` button
- Existing `voters/$voterId.tsx`: Refactor into sub-tab layout; existing content becomes Overview tab
- Backend API routes: `app/api/v1/voters.py`, `app/api/v1/voter_contacts.py`, `app/api/v1/voter_tags.py`, `app/api/v1/voter_lists.py`, `app/api/v1/voter_interactions.py`

</code_context>

<specifics>
## Specific Ideas

- Voter list sidebar structure mirrors how campaign settings was structured in Phase 12 — sub-routes with sidebar nav
- The VoterFilterBuilder component will be reused in Phase 15 (call list creation uses voter universe filtering) — design it to be self-contained and importable
- Contact rows should feel like a compact editable list, not a table — no heavy table chrome for 2-3 contacts

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-voter-management-completion*
*Context gathered: 2026-03-10*
