# Phase 14: Voter Import Wizard - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A multi-step guided wizard for uploading voter CSV files into a campaign. The flow is: file selection/upload → column mapping → data preview → background processing with progress tracking → completion summary. Plus an import history page listing all past and in-progress jobs. Requirements: IMPT-01 through IMPT-07.

Excluded from this phase: bulk DNC import (Phase 15), any non-CSV source types beyond what the backend already supports.

</domain>

<decisions>
## Implementation Decisions

### Column Mapping Interaction
- **Dropdown selector per row** — no drag-and-drop, no new DnD library needed
- Each source CSV column gets a row: column name on the left, a `<Select>` dropdown on the right pre-populated with the backend's `suggested_mapping` value
- Dropdown options are all canonical voter fields plus a `(skip)` option for columns the user doesn't want to import
- **Color-coded confidence badge** per row: green checkmark for high-confidence auto-matches, yellow warning icon for low-confidence, no badge for unmapped/skipped columns
- **Optional template save**: a text input at the bottom of the mapping step: "Save as template (optional)". If filled, name is sent as `save_as_template` in the confirm_mapping request. Backend already supports this.
- No drag-and-drop column reordering; dropdowns are the sole mapping mechanism

### File Upload (Presigned URL to MinIO)
- **XHR for upload** — use `XMLHttpRequest` (not fetch) for the PUT to MinIO so `upload.onprogress` events are available
- **Progress bar** fills 0–100% as bytes are sent to MinIO
- **Drop zone**: full-width dashed-border rectangle with cloud-upload icon, "Drag & drop your CSV here" text, and "or click to browse" link
- On file selection (drop or browse), initiate the import job (POST /imports), then immediately begin the XHR PUT to the returned `upload_url`
- **On upload success**: call `/detect` immediately, then auto-advance to the column mapping step with a ~1 second "Upload complete ✔" flash state before advancing
- **On upload failure**: show error message in-place on the upload step with a "Try again" button. "Try again" re-initiates from scratch (new presigned URL, new job_id)

### Wizard Step Resume (IMPT-07)
- **URL search params** store `jobId` and `step` (e.g., `?jobId=uuid&step=2`)
- On loading the import wizard route with a valid `jobId`, fetch the job from the backend and determine the correct step from its status:
  - `PENDING` → Step 1 (upload not yet done)
  - `UPLOADED` → Step 2 (column mapping)
  - `QUEUED` / `PROCESSING` → Step 3 (progress monitor)
  - `COMPLETE` → Completion summary
  - `FAILED` → Show error state
- **Auto-restore**: wizard initializes directly at the correct step — no extra click or resume dialog
- If user starts a new import without resuming an old one: old job stays in history, both jobs coexist; no warning or auto-cancel
- **Completed job URL**: show the completion summary (rows imported, error count). "Import another file" button clears `jobId`/`step` from URL and resets the wizard

### Progress Monitoring (Step 3)
- After confirm_mapping, wizard advances to a progress step
- **Poll `/imports/{job_id}` every 3 seconds** using TanStack Query `refetchInterval: 3000`
- Display: progress bar (imported_rows / total_rows), row counts (imported, skipped, errors), percentage
- Poll stops when job reaches terminal status (`COMPLETE`, `FAILED`, `CANCELLED`)
- On `COMPLETE`: auto-advance to completion summary
- On `FAILED`: show error message inline with "View details" and optionally "Try again" (new import)

### Data Preview (Step 2.5 — between mapping and confirm)
- After user finalizes mappings, a preview step shows a sample table (first ~5 rows) with source data mapped to voter field columns
- Unmapped/skipped columns are excluded from the preview
- "Back" returns to column mapping; "Confirm Import →" calls `/confirm` and advances to progress monitoring

### Import History Location
- **Sidebar link under Voters section**: "Imports" added as a sub-link in the Voters sidebar group alongside All Voters, Lists, Tags
- Route: `/campaigns/$campaignId/voters/imports/`
- **History DataTable columns**: Filename | Status badge | Imported rows | Error rows | Started date | Kebab menu
- Status badges: Pending (grey), Processing (blue+spinner), Complete (green), Failed (red), Cancelled (grey)
- Kebab menu: "View details" (navigates to wizard URL with that jobId) | "Download error report" (pre-signed URL download, only shown if `error_report_key` exists)
- **Auto-poll every 3s** when any job has status `PROCESSING` or `QUEUED` — same TanStack Query `refetchInterval` pattern; stops when all jobs are terminal

### Claude's Discretion
- Exact wizard step indicator design (numbered steps, progress dots, or breadcrumb)
- Loading skeleton for mapping table while `/detect` runs
- Empty state for import history (first import CTA)
- Exact voter field labels in the mapping dropdown (display name vs field key)
- Error report download UX (direct anchor click vs programmatic download)

</decisions>

<specifics>
## Specific Ideas

- Column mapping table mockup: `First Name → [ first_name ▼ ] ✔` / `Phone → [ (skip) ▼ ] ⚠ low confidence` — this exact visual pattern was confirmed
- Upload drop zone should feel standard and familiar — the confirmed mockup: dashed border + cloud icon + "Drag & drop your CSV here" + "or click to browse"
- Auto-advance with brief success flash (not immediate, not gated behind a button) — fluid experience

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataTable` (`web/src/components/shared/DataTable.tsx`): Use for import history list with cursor-based pagination
- `EmptyState` (`web/src/components/shared/EmptyState.tsx`): Empty state for history page (first import CTA)
- `RequireRole` (`web/src/components/shared/RequireRole.tsx`): Wrap all import actions with `minimum="admin"` (backend enforces admin-only)
- `StatusBadge` (`web/src/components/shared/StatusBadge.tsx`): Use for import status badges (Pending/Processing/Complete/Failed)
- `useVoters.ts`, `useVoterLists.ts` hooks: Reference patterns for query/mutation hook structure when building `useImports.ts`
- shadcn/ui `Select`: Use for column mapping dropdowns (already installed via radix-ui)
- shadcn/ui `Progress`: Check if installed; if not, implement with a simple div/width percentage

### Established Patterns
- TanStack Router file-based routing: new routes go in `web/src/routes/campaigns/$campaignId/voters/`
- TanStack Query `useQuery` with `refetchInterval` for polling — established pattern (see dashboard usage)
- TanStack Router `useSearch` / `useNavigate` for URL search params (`?jobId=&step=`)
- `ky` HTTP client with auth interceptor for API calls; XHR used directly for MinIO PUT (bypasses ky since it's external)
- Sonner toasts for async success/error feedback
- react-hook-form + zod (`mode: "onBlur"`) — use for the template save name input if needed

### Integration Points
- Voters sidebar nav (`web/src/routes/campaigns/$campaignId/voters.tsx`): Add "Imports" link to the sidebar group
- Backend API: POST /imports (initiate), POST /imports/{id}/detect, POST /imports/{id}/confirm, GET /imports/{id} (status), GET /imports (history), GET /imports/templates
- `web/src/api/client.ts`: Auth interceptor — do NOT use for MinIO PUT (presigned URL is unauthenticated external call)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-voter-import-wizard*
*Context gathered: 2026-03-11*
