# Phase 15: Call Lists & DNC Management - Research

**Researched:** 2026-03-11
**Domain:** TanStack Router layout conversion, call list CRUD UI, DNC list management, file upload via FormData
**Confidence:** HIGH

## Summary

The backend for this phase is already fully implemented. All call list (CRUD, entries) and DNC (list, add, remove, bulk import, check) service logic and API routes exist in Python. The frontend work is primarily UI: converting `phone-banking.tsx` from a page to a sidebar layout (mirroring `voters.tsx`), building two sub-pages (Call Lists index + detail, DNC List), adding hooks, and handling one critical backend gap.

The critical backend gap is that the call list PATCH endpoint (`/campaigns/{id}/call-lists/{id}`) only accepts `new_status` as a query parameter — it does not accept a request body to update `name` or `voter_list_id`. The CONTEXT.md specifies that the edit dialog allows editing name and voter list. A `CallListUpdate` Pydantic schema and updated PATCH handler are required before the edit dialog can function.

A second backend gap: no endpoint exists to list call list entries for the detail view (CALL-02). The `CallListEntryResponse` schema and `CallListEntry` model exist, but there is no `GET /call-lists/{id}/entries` route. This endpoint must be added as part of the phase.

**Primary recommendation:** Tackle backend gaps in Wave 0 of planning, then build the frontend in subsequent waves. The sidebar layout conversion is a prerequisite for all route work.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Navigation Structure**
- "Phone Banking" becomes a top-level sidebar section with sub-navigation — matches the Voters sidebar pattern exactly
- Sub-nav items for Phase 15: Call Lists | DNC List
- Phase 16 will add Sessions (and any caller-specific sub-pages) to the same sidebar without restructuring
- `phone-banking.tsx` converted to a layout file with sidebar nav + `<Outlet />` — same architecture as `voters.tsx`
- Index route auto-redirects to `/phone-banking/call-lists` (no standalone overview page)
- Position in campaign nav: after Voters, before Volunteers

**Call List Creation Form**
- Default form fields: Name (text input) + Voter list (dropdown selector of campaign's voter lists) only
- Advanced settings (max_attempts, claim_timeout_minutes, cooldown_minutes) hidden behind a collapsible "Advanced settings" toggle — pre-filled with sensible defaults
- No script/survey selector in this form — scripts attach at the phone bank session level (Phase 16)
- DNC filtering is automatic when the list is created — no explicit checkbox needed
- Edit reuses the same dialog pre-populated with current values (name and voter list editable; status is read-only)
- Delete: standard ConfirmDialog with a warning that entries will be removed — no type-to-confirm (reserved for campaign deletion only)

**Call List Detail View**
- Stats header + full entries DataTable — full page route at `/phone-banking/call-lists/$callListId`
- Stats row shows: total entries + counts for unclaimed / claimed / completed / skipped / error
- Entries DataTable columns: Voter Name (link to voter detail) | Phone | Status (StatusBadge) | Assigned Caller
- Voter name is a clickable link to `/voters/$voterId`
- Status filter on the entries table: filter tabs or dropdown (All | Unclaimed | Claimed | Completed | Skipped)
- Navigation to detail: clicking the list name in the Call Lists index table → full page navigation (not a sheet)

**DNC List Page**
- Two primary actions: "Add Number" (opens small dialog with single phone number input) and "Import from file" (opens upload dialog for bulk import)
- DNC list table columns: Phone number | Date added | Remove action
- CALL-08 (DNC check) implemented via search/filter on the DNC list table — no separate "check" endpoint UI needed

**DNC Bulk Import**
- "Import from file" button on DNC List page opens an upload dialog (not a separate route)
- File format: CSV with one phone number column; header row optional; backend normalizes formats
- UX flow: drop zone in dialog → file selected → import runs → dialog closes → toast: "Imported 142 numbers. 3 duplicates skipped." → DNC list auto-refreshes
- Import is treated as synchronous/fast enough to await — no background job polling required

### Claude's Discretion
- Exact advanced settings default values (max_attempts, timeouts) — use backend defaults
- Loading skeletons for call list and DNC tables
- Empty states for: no call lists yet, no DNC entries, no entries matching current status filter
- Phone number formatting/display normalization in the DNC list table
- Exact visual design of the stat cards on call list detail (count chips vs stat cards)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CALL-01 | User can create a call list from a voter universe with DNC filtering | Backend `generate_call_list` service is complete; frontend needs `useCreateCallList` mutation hook + creation dialog; voter list selector uses existing `useVoterLists` hook |
| CALL-02 | User can view call list detail with entry statuses | Requires new `GET /call-lists/{id}/entries` backend endpoint (gap); frontend detail route + stats row + DataTable |
| CALL-03 | User can edit and delete call lists | Edit requires new `CallListUpdate` schema + PATCH body handling (gap); delete endpoint exists (`DELETE /call-lists/{id}`) |
| CALL-04 | User can view the DNC list for a campaign | `GET /campaigns/{id}/dnc` endpoint exists; returns `list[DNCEntryResponse]` (not paginated) |
| CALL-05 | User can add an individual phone number to the DNC list | `POST /campaigns/{id}/dnc` exists; needs `useAddDNCEntry` mutation hook + dialog |
| CALL-06 | User can bulk import DNC numbers from a file | `POST /campaigns/{id}/dnc/import` exists (multipart/form-data UploadFile); needs file upload dialog + `useImportDNC` mutation hook |
| CALL-07 | User can remove a number from the DNC list | `DELETE /campaigns/{id}/dnc/{dnc_id}` exists; needs `useDeleteDNCEntry` mutation hook + inline remove action |
| CALL-08 | User can check if a phone number is on the DNC list | Implemented as client-side search/filter on DNC table — no additional backend calls needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-router | ~1.x (project version) | Layout + sub-routes | Already in use throughout — voters sidebar pattern is the exact model |
| @tanstack/react-query | ~5.x (project version) | Server state mutations/queries | Already in use — all hooks follow this pattern |
| react-hook-form | project version | Form state for create/edit dialogs | Already in use via `useFormGuard` integration |
| sonner | project version | Toast notifications for mutations | Already in use — all mutation feedback via sonner |
| ky | project version | HTTP client via `api` wrapper | All existing hooks use `api.get/post/patch/delete` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | project version | Icons for EmptyState and actions | Use Phone, List, Ban icons for call lists/DNC |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline filter tabs for entry status | Separate `<Select>` dropdown | Tabs more visually scannable for 5 statuses; dropdown compresses well if adding more statuses later |

**Installation:**
No new packages required. All dependencies are already in the project.

## Architecture Patterns

### Route Structure
```
web/src/routes/campaigns/$campaignId/
├── phone-banking.tsx                    # CONVERT: layout file with sidebar nav + Outlet
└── phone-banking/
    ├── index.tsx                        # CREATE: redirect to call-lists
    ├── call-lists/
    │   ├── index.tsx                    # CREATE: call lists table + create/edit/delete dialogs
    │   └── $callListId.tsx              # CREATE: stats header + entries DataTable
    └── dnc/
        └── index.tsx                    # CREATE: DNC list table + add/import dialogs
```

### Pattern 1: Sidebar Layout Conversion
**What:** Convert `phone-banking.tsx` from a standalone page component to a layout file with sidebar nav + `<Outlet />`.
**When to use:** Any section with sub-navigation pages.
**Reference:** `voters.tsx` is the exact template.

```typescript
// web/src/routes/campaigns/$campaignId/phone-banking.tsx
// Replace entire file with:
import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router"

function PhoneBankingLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/phone-banking" })

  const navItems = [
    { to: `/campaigns/${campaignId}/phone-banking/call-lists`, label: "Call Lists" },
    { to: `/campaigns/${campaignId}/phone-banking/dnc`, label: "DNC List" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Phone Banking</h1>
      </div>
      <div className="flex gap-0">
        <nav className="w-48 shrink-0 border-r pr-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  params={{ campaignId }}
                  activeProps={{ className: "bg-muted text-foreground font-medium" }}
                  inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                  className="block rounded-md px-3 py-2 text-sm transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1 pl-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking")({
  component: PhoneBankingLayout,
})
```

### Pattern 2: Hook Module for Call Lists (useCallLists.ts)
**What:** Dedicated hook file with query key factory and all mutation hooks for call list operations.
**When to use:** Matches existing `useVoterLists.ts` pattern exactly.

```typescript
// web/src/hooks/useCallLists.ts
const callListKeys = {
  all: (campaignId: string) => ["campaigns", campaignId, "call-lists"] as const,
  detail: (campaignId: string, callListId: string) =>
    ["campaigns", campaignId, "call-lists", callListId] as const,
  entries: (campaignId: string, callListId: string) =>
    ["campaigns", campaignId, "call-lists", callListId, "entries"] as const,
}

// useCallLists — replaces the existing stub in useFieldOps.ts
// useCallList — fetches single call list
// useCallListEntries — fetches entries for detail view (once backend endpoint exists)
// useCreateCallList — POST /call-lists
// useUpdateCallList — PATCH /call-lists/{id} with body (requires backend fix)
// useDeleteCallList — DELETE /call-lists/{id}
```

### Pattern 3: Hook Module for DNC (useDNC.ts)
**What:** New hook file for DNC list operations.
**Reference:** `useVoterTags.ts` pattern (simple CRUD + list).

```typescript
// web/src/hooks/useDNC.ts
const dncKeys = {
  all: (campaignId: string) => ["campaigns", campaignId, "dnc"] as const,
}

// useDNCEntries — GET /dnc (returns list[DNCEntryResponse], not paginated)
// useAddDNCEntry — POST /dnc with { phone_number, reason }
// useDeleteDNCEntry — DELETE /dnc/{dnc_id}
// useImportDNC — POST /dnc/import with FormData (multipart)
```

### Pattern 4: DNC Bulk Import via FormData
**What:** File upload using `FormData` (not JSON body), matching the backend `UploadFile` handler.
**Critical difference from voter import:** Voter import uses MinIO presigned URLs + XMLHttpRequest. DNC import is synchronous multipart POST directly to the API — no presigned URL flow.

```typescript
// useDNC.ts — import mutation
export function useImportDNC(campaignId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      // Use ky directly with body: formData (NOT json:) to avoid Content-Type conflict
      return api.post(`api/v1/campaigns/${campaignId}/dnc/import`, {
        body: formData,
      }).json<DNCImportResponse>()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dncKeys.all(campaignId) }),
  })
}
```

**Why `body: formData` not `json:`:** Using `json:` would set `Content-Type: application/json` and prevent the browser from setting the correct `multipart/form-data` boundary. The `body:` option with a `FormData` instance lets the browser set the content type header automatically.

### Pattern 5: Call List Detail Stats Row
**What:** Status count chips row above the entries DataTable.
**When to use:** Summary display before a filterable table.

Entry status mapping (backend → UI display):
| Backend `EntryStatus` | UI Label |
|-----------------------|----------|
| `available` | Unclaimed |
| `in_progress` | Claimed |
| `completed` | Completed |
| `max_attempts` | Skipped |
| `terminal` | Error |

```typescript
// Compute from entries array
const statusCounts = {
  unclaimed: entries.filter(e => e.status === "available").length,
  claimed: entries.filter(e => e.status === "in_progress").length,
  completed: entries.filter(e => e.status === "completed").length,
  skipped: entries.filter(e => e.status === "max_attempts").length,
  error: entries.filter(e => e.status === "terminal").length,
}
```

### Pattern 6: Index Route Redirect
**What:** Index route at `/phone-banking/index.tsx` that immediately redirects to `/phone-banking/call-lists`.
**Reference:** TanStack Router `redirect` in loader.

```typescript
// web/src/routes/campaigns/$campaignId/phone-banking/index.tsx
import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/campaigns/$campaignId/phone-banking/call-lists",
      params,
    })
  },
})
```

### Anti-Patterns to Avoid
- **Reusing the stub `useCallLists` from `useFieldOps.ts`:** The stub exists but lacks query key factory, mutation hooks, and entries sub-key. Replace it; do not extend the `useFieldOps.ts` stub.
- **Using `json:` option for DNC import:** Will break multipart upload. Use `body: formData`.
- **Polling the DNC import:** The backend processes it synchronously. No refetchInterval needed — await the mutation and show the toast result counts directly.
- **Using `DestructiveConfirmDialog` (type-to-confirm) for call list delete:** CONTEXT.md specifies standard `ConfirmDialog` only. Type-to-confirm is reserved for campaign deletion.
- **Building a separate DNC check page:** CALL-08 is satisfied by the search/filter input on the DNC list table. No additional route or API call needed.
- **Passing status in PATCH query param for name/voter_list_id edits:** The current PATCH endpoint signature uses a query param for `new_status`. The edit dialog needs a body-based PATCH. These are two separate concerns — the backend PATCH handler must be updated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart file upload | Custom XMLHttpRequest for DNC CSV | `FormData` + ky `body:` option | DNC import is synchronous server-side; presigned URL pattern (voter import) is overkill |
| Empty states | Custom empty divs | `EmptyState` component | Already handles icon, title, description, action button consistently |
| Status color coding | Custom badge styles | `StatusBadge` component | Already has success/warning/error/info variants |
| Delete confirmation | Custom modal | `ConfirmDialog` component | Already handles loading state, cancel/confirm pattern |
| Pagination | Manual prev/next buttons | `PaginationControls` component | Already handles hasNextPage/hasPreviousPage props |
| Client-side table | In-memory sort/filter | DataTable with `manualSorting/manualFiltering/manualPagination` | Server-side data ops are the established pattern |

**Key insight:** Every UI primitive needed for this phase already exists as a shared component. The only new UI to build is the page-level layout and dialog forms.

## Common Pitfalls

### Pitfall 1: Backend PATCH Endpoint Mismatch
**What goes wrong:** The existing `PATCH /call-lists/{id}` handler reads `new_status` as a query parameter, not a request body. Calling it with a JSON body `{ name, voter_list_id }` will silently fail or 422.
**Why it happens:** The endpoint was designed for status transitions only; name/voter_list_id edit was not originally scoped.
**How to avoid:** Add `CallListUpdate` Pydantic schema (`name: str | None`, `voter_list_id: UUID | None`) and update the PATCH handler to accept a body. Keep the status transition logic but add an optional body.
**Warning signs:** Edit dialog saves without error but data doesn't change in the UI after cache invalidation.

### Pitfall 2: Missing Entries Endpoint
**What goes wrong:** The call list detail view (CALL-02) needs to list all entries for a call list. No `GET /call-lists/{id}/entries` route exists.
**Why it happens:** The backend only implemented claiming (write path) not listing (read path) for entries.
**How to avoid:** Add the endpoint before building the detail view frontend. The `CallListEntry` model and `CallListEntryResponse` schema exist; only the router + service method need to be added.
**Warning signs:** `useCallListEntries` hook returns 404.

### Pitfall 3: Entry Status Vocabulary Mismatch
**What goes wrong:** Backend uses `available/in_progress/completed/max_attempts/terminal`. CONTEXT.md uses `unclaimed/claimed/completed/skipped/error`. Copying backend values directly into the UI breaks the spec.
**Why it happens:** Backend domain language differs from UX copy.
**How to avoid:** Map in the display layer only. The filter state uses backend values; display labels map backend → UI copy (see Pattern 5 table above).
**Warning signs:** Status filter passes "unclaimed" to the backend query but no entries have that status string.

### Pitfall 4: TanStack Router routeTree.gen.ts Regeneration
**What goes wrong:** Adding new route files under `phone-banking/` requires the routeTree to be regenerated. If not regenerated, new routes don't work.
**Why it happens:** TanStack Router uses file-based routing with auto-generated type definitions.
**How to avoid:** Run `npm run dev` in the web directory after creating new route files — the file watcher auto-regenerates `routeTree.gen.ts`. Verify new imports appear in the file before testing.
**Warning signs:** TypeScript errors on `createFileRoute` calls, or routes return 404.

### Pitfall 5: DNC List Returns Array (Not Paginated)
**What goes wrong:** `GET /campaigns/{id}/dnc` returns `list[DNCEntryResponse]` directly, not `PaginatedResponse[DNCEntryResponse]`. Calling `.json<PaginatedResponse<DNCEntry>>()` and accessing `.items` will fail.
**Why it happens:** The DNC list endpoint was not designed with pagination.
**How to avoid:** Type the hook return as `DNCEntry[]` and pass the array directly to DataTable's `data` prop.
**Warning signs:** `data?.items` is `undefined`; DataTable shows empty even when DNC entries exist.

### Pitfall 6: FormData Upload Requires No Authorization Header on the File Field
**What goes wrong:** ky interceptors add an `Authorization: Bearer ...` header globally. For `multipart/form-data`, this is fine — the auth header is on the HTTP request itself, not interfering with the file boundary. This is different from MinIO presigned URLs (which break with auth headers).
**Why it happens:** Voter import specifically uses `XMLHttpRequest` to avoid ky's auth interceptors for MinIO. DNC import goes directly to the FastAPI backend, which does want the auth header.
**How to avoid:** Use the standard `api.post(...)` call with `body: formData`. Do NOT use raw XMLHttpRequest for DNC import.

## Code Examples

### Call List Types (frontend)
```typescript
// web/src/types/call-list.ts (new file — separate from field-ops.ts)
export interface CallListSummary {
  id: string
  name: string
  status: string  // "draft" | "active" | "completed"
  total_entries: number
  completed_entries: number
  created_at: string
}

export interface CallListDetail extends CallListSummary {
  max_attempts: number
  claim_timeout_minutes: number
  cooldown_minutes: number
  voter_list_id: string | null
  script_id: string | null
  created_by: string
  updated_at: string
}

export interface CallListEntry {
  id: string
  voter_id: string
  voter_name?: string  // joined from voter
  priority_score: number
  phone_numbers: Array<{ phone_id: string; value: string; type: string; is_primary: boolean }>
  status: string  // "available" | "in_progress" | "completed" | "max_attempts" | "terminal"
  attempt_count: number
  claimed_by: string | null
  claimed_at: string | null
  last_attempt_at: string | null
}

export interface CallListCreate {
  name: string
  voter_list_id?: string
  max_attempts?: number
  claim_timeout_minutes?: number
  cooldown_minutes?: number
}

export interface CallListUpdate {
  name?: string
  voter_list_id?: string | null
}
```

### DNC Types (frontend)
```typescript
// web/src/types/dnc.ts (new file)
export interface DNCEntry {
  id: string
  phone_number: string
  reason: string
  added_by: string
  added_at: string
}

export interface DNCImportResult {
  added: number
  skipped: number
  invalid: number
}
```

### Backend: CallListUpdate Schema (new)
```python
# app/schemas/call_list.py — add this class
class CallListUpdate(BaseSchema):
    """Schema for updating call list name and voter list."""
    name: str | None = None
    voter_list_id: uuid.UUID | None = None
```

### Backend: Entries Endpoint (new)
```python
# app/api/v1/call_lists.py — add this route
@router.get(
    "/campaigns/{campaign_id}/call-lists/{call_list_id}/entries",
    response_model=PaginatedResponse[CallListEntryResponse],
)
async def list_call_list_entries(
    campaign_id: uuid.UUID,
    call_list_id: uuid.UUID,
    status: str | None = None,  # optional filter
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    ...
```

### ConfirmDialog for Call List Delete (not DestructiveConfirmDialog)
```typescript
// Pattern: standard ConfirmDialog, variant="destructive"
<ConfirmDialog
  open={!!deleteList}
  onOpenChange={(open) => { if (!open) setDeleteList(null) }}
  title={`Delete "${deleteList?.name}"?`}
  description="This will permanently delete the call list and all its entries."
  confirmLabel="Delete"
  variant="destructive"
  onConfirm={handleDelete}
  isPending={deleteMutation.isPending}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `phone-banking.tsx` as a single page | `phone-banking.tsx` as layout + sub-routes | Phase 15 | Enables Call Lists and DNC sub-pages without restructuring Phase 16 |
| `useCallLists` stub in `useFieldOps.ts` | Dedicated `useCallLists.ts` with full mutation hooks | Phase 15 | Matches pattern of all other feature hooks |

**Deprecated/outdated:**
- `phone-banking.tsx` single-page implementation: the Sessions + Call Lists display in the current file is replaced by the layout + sub-route architecture. The Sessions card grid is removed (Phase 16 will add Sessions properly).
- The `useCallLists` and `usePhoneBankSessions` stubs in `useFieldOps.ts`: the call lists stub moves to `useCallLists.ts`. Phase 16 will handle phone bank sessions.

## Open Questions

1. **Entry voter name join in entries endpoint**
   - What we know: `CallListEntry` has `voter_id` but not voter name. The CONTEXT.md entries DataTable shows "Voter Name" column.
   - What's unclear: Does the new entries endpoint need to join voter `first_name`/`last_name` server-side, or does the frontend make per-entry voter lookups?
   - Recommendation: Add voter name join in the service layer for the entries endpoint. Returning raw `voter_id` and requiring N+1 voter fetches client-side is impractical.

2. **Entry status filter: client-side or server-side?**
   - What we know: DataTable uses `manualFiltering: true`. The entries dataset could be large for a large campaign.
   - What's unclear: Should the entries endpoint accept a `?status=` query param, or filter client-side after loading all entries?
   - Recommendation: Add `status` query param to the entries endpoint for server-side filtering. This aligns with the `manualFiltering` DataTable pattern and avoids loading thousands of entries to filter client-side.

3. **Called caller name display**
   - What we know: `claimed_by` is a user ID string (not a name). The entries DataTable shows "Assigned Caller" column.
   - What's unclear: Is there a users endpoint or member endpoint that can resolve user ID → display name?
   - Recommendation: Display `claimed_by` as-is (user ID) initially, or consider a short hash display. The members list (`useMembers`) is available to resolve names if needed. Investigate during implementation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest with happy-dom + @testing-library/react |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run` |
| Full suite command | `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-01 | `useCreateCallList` posts to correct URL with body | unit | `npm run test -- --run useCallLists` | Wave 0 |
| CALL-02 | `useCallListEntries` fetches entries from correct URL | unit | `npm run test -- --run useCallLists` | Wave 0 |
| CALL-03 | `useUpdateCallList` patches with body (not query param); `useDeleteCallList` deletes | unit | `npm run test -- --run useCallLists` | Wave 0 |
| CALL-04 | `useDNCEntries` fetches array (not paginated) from correct URL | unit | `npm run test -- --run useDNC` | Wave 0 |
| CALL-05 | `useAddDNCEntry` posts with phone_number + reason | unit | `npm run test -- --run useDNC` | Wave 0 |
| CALL-06 | `useImportDNC` sends FormData multipart (not JSON) | unit | `npm run test -- --run useDNC` | Wave 0 |
| CALL-07 | `useDeleteDNCEntry` sends DELETE to correct URL | unit | `npm run test -- --run useDNC` | Wave 0 |
| CALL-08 | Client-side filter on DNC table filters by phone_number substring | unit | `npm run test -- --run DNCListPage` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run`
- **Per wave merge:** `cd /home/kwhatcher/projects/run-api/web && npm run test -- --run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useCallLists.test.ts` — covers CALL-01, CALL-02, CALL-03
- [ ] `web/src/hooks/useDNC.test.ts` — covers CALL-04, CALL-05, CALL-06, CALL-07
- [ ] No framework install needed — Vitest already configured

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/home/kwhatcher/projects/run-api/app/api/v1/call_lists.py` — confirmed endpoints, PATCH signature, no entries GET route
- Direct code inspection: `/home/kwhatcher/projects/run-api/app/api/v1/dnc.py` — confirmed all 5 DNC endpoints exist, bulk import uses `UploadFile`
- Direct code inspection: `/home/kwhatcher/projects/run-api/app/schemas/call_list.py` — confirmed `CallListUpdate` does not exist
- Direct code inspection: `/home/kwhatcher/projects/run-api/app/models/call_list.py` — confirmed `EntryStatus` enum values
- Direct code inspection: `/home/kwhatcher/projects/run-api/web/src/routes/campaigns/$campaignId/voters.tsx` — confirmed sidebar layout pattern
- Direct code inspection: `/home/kwhatcher/projects/run-api/web/src/hooks/useVoterLists.ts` — confirmed query key factory + mutation pattern
- Direct code inspection: `/home/kwhatcher/projects/run-api/web/src/components/shared/*.tsx` — confirmed available shared components

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — user-confirmed UX patterns and entry status labels (unclaimed/claimed/etc.)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by direct code inspection
- Architecture: HIGH — all patterns verified against existing implementations
- Backend gaps: HIGH — confirmed by reading actual endpoint signatures
- Pitfalls: HIGH — all derived from observed code, not speculation

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable codebase, low churn risk)
