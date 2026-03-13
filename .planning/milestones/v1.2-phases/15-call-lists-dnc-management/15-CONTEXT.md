# Phase 15: Call Lists & DNC Management - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and manage call lists from voter universes with DNC filtering, and maintain a campaign DNC list through individual additions, bulk CSV imports, and lookups. Requirements: CALL-01 through CALL-08.

Excluded from this phase: phone banking sessions, caller assignment, active calling screen, and session progress dashboards (all Phase 16).

</domain>

<decisions>
## Implementation Decisions

### Navigation Structure
- **"Phone Banking" becomes a top-level sidebar section** with sub-navigation — matches the Voters sidebar pattern exactly
- **Sub-nav items for Phase 15**: Call Lists | DNC List
- Phase 16 will add Sessions (and any caller-specific sub-pages) to the same sidebar without restructuring
- **phone-banking.tsx converted to a layout file** with sidebar nav + `<Outlet />` — same architecture as `voters.tsx`
- **Index route auto-redirects** to `/phone-banking/call-lists` (no standalone overview page)
- **Position in campaign nav**: after Voters, before Volunteers

### Call List Creation Form
- **Default form fields**: Name (text input) + Voter list (dropdown selector of campaign's voter lists) only
- **Advanced settings** (max_attempts, claim_timeout_minutes, cooldown_minutes) hidden behind a collapsible "▸ Advanced settings" toggle — pre-filled with sensible defaults
- **No script/survey selector** in this form — scripts attach at the phone bank session level (Phase 16)
- DNC filtering is automatic when the list is created — no explicit checkbox needed
- **Edit reuses the same dialog** pre-populated with current values (name and voter list editable; status is read-only)
- **Delete**: standard ConfirmDialog with a warning that entries will be removed — no type-to-confirm (reserved for campaign deletion only)

### Call List Detail View
- **Stats header + full entries DataTable** — full page route at `/phone-banking/call-lists/$callListId`
- Stats row shows: total entries + counts for unclaimed / claimed / completed / skipped / error
- **Entries DataTable columns**: Voter Name (link to voter detail) | Phone | Status (StatusBadge) | Assigned Caller
- Voter name is a clickable link to `/voters/$voterId` — managers can jump to voter records
- **Status filter** on the entries table: filter tabs or dropdown (All | Unclaimed | Claimed | Completed | Skipped)
- Navigation to detail: clicking the list name in the Call Lists index table → full page navigation (not a sheet)

### DNC List Page
- **Two primary actions** on the DNC List page:
  - "Add Number" — opens a small dialog with a single phone number input
  - "Import from file" — opens an upload dialog for bulk import
- **DNC list table columns**: Phone number | Date added | Remove action
- **CALL-08 (DNC check)** implemented via search/filter on the DNC list table — no separate "check" endpoint UI needed; typing a number in the search input filters the list

### DNC Bulk Import
- **Location**: "Import from file" button on the DNC List page opens an upload dialog (not a separate route)
- **File format**: CSV with one phone number column; header row optional; backend normalizes formats (+1, dashes, parentheses)
- **UX flow**: drop zone in dialog → file selected → import runs → dialog closes → toast: "Imported 142 numbers. 3 duplicates skipped." → DNC list auto-refreshes
- Import is treated as synchronous/fast enough to await — no background job polling required (unlike voter import)

### Claude's Discretion
- Exact advanced settings default values (max_attempts, timeouts) — use backend defaults
- Loading skeletons for call list and DNC tables
- Empty states for: no call lists yet, no DNC entries, no entries matching current status filter
- Phone number formatting/display normalization in the DNC list table
- Exact visual design of the stat cards on call list detail (count chips vs stat cards)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useCallLists(campaignId)` hook in `web/src/hooks/useFieldOps.ts`: already exists, queries `/api/v1/campaigns/${campaignId}/call-lists`
- `CallList` type in `web/src/types/field-ops.ts`: already defined with all fields (id, name, status, total_entries, completed_entries, max_attempts, claim_timeout_minutes, cooldown_minutes, voter_list_id, etc.)
- `DataTable` component: use for call lists index and DNC list — server-side sort/filter/pagination already wired
- `EmptyState` component (`web/src/components/shared/EmptyState.tsx`): use for empty call list index, empty DNC list, empty entry results
- `StatusBadge` component (`web/src/components/shared/StatusBadge.tsx`): use for call list status and entry status
- `ConfirmDialog` component: use for call list delete confirmation
- `PaginationControls` component: use in entries DataTable

### Established Patterns
- **Sidebar layout pattern**: `voters.tsx` is the reference implementation — replicate exactly for `phone-banking.tsx`
- **DataTable**: `manualSorting`, `manualFiltering`, `manualPagination` — all data operations server-side; py-3 density, hover highlight only, no zebra striping
- **Kebab menu**: column `ColumnDef` cell renderer in consuming components (not baked into DataTable)
- **Dialog reuse for create/edit**: `SharedTagFormDialog` pattern from Phase 13 — same component renders create and edit
- **Toast notifications**: sonner for success/error feedback on mutations
- **useFormGuard**: wire on any form with editable fields
- **Route structure**: `web/src/routes/campaigns/$campaignId/phone-banking/` will mirror `voters/` directory layout

### Integration Points
- Call list creation requires a voter list selector — query `/api/v1/campaigns/${campaignId}/voter-lists` for options
- Voter name links in entries table connect to existing voter detail route
- `phone-banking.tsx` currently exists as a single-page component — needs to be converted to a layout file with sidebar nav + Outlet; existing sessions/call list display moved or replaced

</code_context>

<specifics>
## Specific Ideas

- Call list creation dialog mockup confirmed: `Name: [________________] / Voter list: [Select list ▼] / ▸ Advanced settings / [Cancel] [Create]`
- DNC List page mockup confirmed: `[Add Number] [Import from file]` action buttons above the DNC table
- Stats display on call list detail: status count chips row above the entries DataTable, similar to the import history status badges pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-call-lists-dnc-management*
*Context gathered: 2026-03-11*
