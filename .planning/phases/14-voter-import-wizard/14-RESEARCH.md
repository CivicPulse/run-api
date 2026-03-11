# Phase 14: Voter Import Wizard - Research

**Researched:** 2026-03-11
**Domain:** Multi-step wizard UI, XHR file upload (presigned URL), TanStack Router search params, TanStack Query polling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Column mapping**: Dropdown selector per row (no drag-and-drop, no new DnD library). Each source column row has column name on left, `<Select>` dropdown on right pre-populated with backend's `suggested_mapping`. Options are all canonical voter fields plus `(skip)`. Color-coded confidence badge: green checkmark for high-confidence, yellow warning for low-confidence, no badge for unmapped/skipped.
- **Template save**: Text input at bottom of mapping step labeled "Save as template (optional)". If filled, name sent as `save_as_template` in confirm_mapping request.
- **File upload**: XHR (not fetch) for MinIO PUT so `upload.onprogress` events are available. Full-width dashed-border drop zone with cloud-upload icon.
- **On file selection**: POST /imports → XHR PUT to `upload_url` → on success call /detect → 1s flash → auto-advance to mapping step.
- **On upload failure**: Show error in-place with "Try again" button (re-initiates from scratch).
- **Resume via URL params**: `?jobId=uuid&step=N`. On load, fetch job, determine step from status: `pending` → step 1, `uploaded` → step 2, `queued`/`processing` → step 3 (progress monitor), `completed` → completion summary, `failed` → error state.
- **Auto-restore**: Wizard initializes at correct step with no extra click. Old jobs coexist; no warning or auto-cancel.
- **Progress monitoring**: Poll `/imports/{job_id}` every 3 seconds using TanStack Query `refetchInterval: 3000`. Stop when terminal (`completed`, `failed`). Auto-advance to completion on `completed`.
- **Preview step (2.5)**: After mapping finalized, show first ~5 rows mapped to voter fields (exclude unmapped). "Back" → mapping; "Confirm Import →" → /confirm → progress step.
- **Import history location**: Sidebar sub-link under Voters: "Imports" at `/campaigns/$campaignId/voters/imports/`.
- **History DataTable columns**: Filename | Status badge | Imported rows | Error rows | Started date | Kebab menu (View details, Download error report if `error_report_key` exists).
- **History polling**: `refetchInterval: 3000` when any job is `processing` or `queued`; stops when all terminal.
- **Admin-only**: All import actions wrapped with `RequireRole minimum="admin"`.

### Claude's Discretion
- Exact wizard step indicator design (numbered steps, progress dots, or breadcrumb)
- Loading skeleton for mapping table while /detect runs
- Empty state for import history (first import CTA)
- Exact voter field labels in the mapping dropdown (display name vs field key)
- Error report download UX (direct anchor click vs programmatic download)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMPT-01 | User can upload a CSV file via drag-and-drop | Drop zone UI + XHR PUT to presigned MinIO URL; backend POST /imports returns upload_url |
| IMPT-02 | User can view auto-detected column mappings with suggestions | Backend /detect returns `detected_columns` + `suggested_mapping` dict; UI renders mapping table with Select dropdowns |
| IMPT-03 | User can manually adjust column mappings via dropdown (locked: no drag-and-drop) | Select dropdowns pre-populated with suggestion; user changes canonical field or picks (skip) |
| IMPT-04 | User can preview mapped data before confirming import | Step 2.5: render first ~5 rows from job's detected_columns/suggested_mapping as a table |
| IMPT-05 | User can track import progress with row count and percentage | Poll GET /imports/{id} every 3s; display imported_rows/total_rows, skipped_rows, error count |
| IMPT-06 | User can view import history with status and error counts | GET /imports (cursor-paginated); DataTable with status badges, counts, kebab menu |
| IMPT-07 | User can resume an in-progress import wizard after navigating away | `?jobId=&step=` search params; on load fetch job and map status to wizard step |
</phase_requirements>

## Summary

Phase 14 is a pure frontend build: the backend import pipeline (API endpoints, background task, MinIO storage, field mapping engine) is fully implemented and verified. The frontend wizard does not yet exist — no `useImports.ts` hook, no routes under `voters/imports/`, no wizard components. Everything to build is on the React/TanStack side.

The wizard has four visible steps: (1) upload drop zone with XHR progress, (2) column mapping with confidence badges and optional template save, (2.5) data preview table, (3) background progress monitor with polling. A separate history page at `voters/imports/` lists all past jobs. The wizard URL carries `?jobId=&step=` so the user can navigate away and resume.

Key integration points: XHR (not `ky`) for the presigned MinIO PUT, TanStack Router `validateSearch` for typed search params, TanStack Query `refetchInterval` for polling, and the existing shared components (`DataTable`, `StatusBadge`, `RequireRole`, `EmptyState`).

**Primary recommendation:** Build `useImports.ts` hook first (all API calls), then the wizard route with step state driven by URL search params, then the history page. Keep XHR upload logic isolated in a dedicated helper to avoid coupling it to React state.

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | ^5.90.21 | Data fetching, caching, polling | Project standard for all API calls |
| @tanstack/react-router | ^1.159.5 | File-based routing, URL search params | Project routing standard |
| ky | ^1.14.3 | Auth-bearing API calls to FastAPI | Project HTTP client with auth interceptor |
| XMLHttpRequest (browser built-in) | N/A | MinIO PUT with upload progress events | Fetch API does not support upload progress |
| shadcn/ui Select | installed | Column mapping dropdowns | Already installed via @radix-ui |
| shadcn/ui Skeleton | installed | Loading states during /detect | Already installed |
| react-hook-form + zod | ^7.71.1 / ^4.3.6 | Template name input validation | Project form standard (mode: "onBlur") |
| sonner | ^2.0.7 | Upload success/error toasts | Project toast standard |

### No Progress Component — Must Implement

`shadcn/ui Progress` is NOT installed in `web/src/components/ui/`. The progress bar for upload and import monitoring must be implemented with a simple `div` width-percentage approach (or `npx shadcn add progress` to install it). Decision for planner: install or hand-implement.

**Recommendation:** Install via `npx shadcn@latest add progress` — it is a trivial 1-command add and produces cleaner accessible markup than a raw div.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | installed | Cloud-upload icon, check/warn badge icons, spinner | Drop zone icon, confidence badges |
| @tanstack/react-table | ^8.21.3 | History DataTable (via shared DataTable component) | Import history page — already wired into DataTable |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| XHR upload | fetch | fetch has no upload progress events — XHR is required for presigned URL progress tracking |
| URL search params for step state | Component state only | URL params enable resume (IMPT-07); component state is lost on navigation |
| Polling (refetchInterval) | WebSocket | WebSocket not available on backend (explicitly out of scope in REQUIREMENTS.md) |

**Installation (if adding Progress component):**
```bash
cd web && npx shadcn@latest add progress
```

## Architecture Patterns

### Recommended Project Structure

```
web/src/
├── hooks/
│   └── useImports.ts                    # All import API calls (new)
├── types/
│   └── import-job.ts                    # ImportJob, ImportUploadResponse, etc. (new)
├── routes/campaigns/$campaignId/voters/
│   └── imports/
│       ├── index.tsx                    # Import history page (new)
│       └── new.tsx                      # Import wizard page (new)
└── components/shared/         # Reuse: DataTable, StatusBadge, EmptyState, RequireRole
```

The wizard lives at `voters/imports/new` (or `voters/imports/wizard`) and the history list at `voters/imports/index`. The sidebar "Imports" link points to the history page; from there users can start a new import or view/resume an existing one.

### Pattern 1: TanStack Router validateSearch for Typed URL Params

**What:** Route definition declares typed search params via `validateSearch`; component reads with `Route.useSearch()` and mutates with `useNavigate`.
**When to use:** Any state that must survive navigation (IMPT-07).

```typescript
// Source: callback.tsx in project codebase (verified)
export const Route = createFileRoute("/campaigns/$campaignId/voters/imports/new")({
  component: ImportWizardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    jobId: (search.jobId as string) ?? "",
    step: Number(search.step ?? 1),
  }),
})

// Inside component:
const { jobId, step } = Route.useSearch()
const navigate = useNavigate()

// Advance to step 2:
navigate({ search: { jobId, step: 2 } })
```

### Pattern 2: TanStack Query refetchInterval for Polling

**What:** `useQuery` with `refetchInterval` set to a number or function that returns false when polling should stop.
**When to use:** Import progress monitoring (step 3) and history page auto-refresh.

```typescript
// Source: TanStack Query v5 docs + project pattern
useQuery({
  queryKey: importKeys.detail(campaignId, jobId),
  queryFn: () => api.get(`api/v1/campaigns/${campaignId}/imports/${jobId}`).json<ImportJob>(),
  refetchInterval: (query) => {
    const status = query.state.data?.status
    if (status === "completed" || status === "failed") return false
    return 3000
  },
  enabled: !!jobId,
})

// For history page: poll when any job is in-progress
refetchInterval: (query) => {
  const items = query.state.data?.items ?? []
  const hasActive = items.some(j => j.status === "queued" || j.status === "processing")
  return hasActive ? 3000 : false
}
```

### Pattern 3: XHR Upload with Progress

**What:** `XMLHttpRequest` PUT to MinIO presigned URL. The `api` client (ky) MUST NOT be used — presigned URL is unauthenticated and ky adds the `Authorization` header.
**When to use:** File upload step (IMPT-01).

```typescript
// XHR PUT with progress tracking — raw browser API
function uploadToMinIO(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("Content-Type", "text/csv")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error("Upload network error"))
    xhr.send(file)
  })
}
```

### Pattern 4: useImports Hook Structure (mirrors useVoterLists)

```typescript
// Source: useVoterLists.ts in project codebase
const importKeys = {
  all: (campaignId: string) => ["campaigns", campaignId, "imports"] as const,
  detail: (campaignId: string, jobId: string) =>
    ["campaigns", campaignId, "imports", jobId] as const,
  templates: (campaignId: string) =>
    ["campaigns", campaignId, "imports", "templates"] as const,
}

export function useImportJob(campaignId: string, jobId: string, polling = false) {
  return useQuery({
    queryKey: importKeys.detail(campaignId, jobId),
    queryFn: () => api.get(`api/v1/campaigns/${campaignId}/imports/${jobId}`).json<ImportJob>(),
    enabled: !!campaignId && !!jobId,
    refetchInterval: polling
      ? (query) => {
          const s = query.state.data?.status
          return s === "completed" || s === "failed" ? false : 3000
        }
      : false,
  })
}
```

### Pattern 5: Wizard Step Management

**What:** Step is stored in URL (`?step=N`). On load, if `jobId` is present, fetch the job and call `navigate({ search: { jobId, step: deriveStep(job.status) } })` to correct the step.

```typescript
// Status → step mapping
function deriveStep(status: string): number {
  switch (status) {
    case "pending": return 1
    case "uploaded": return 2
    case "queued":
    case "processing": return 3
    case "completed": return 4  // completion summary
    case "failed": return 4     // error state (same step, different UI)
    default: return 1
  }
}
```

### Anti-Patterns to Avoid

- **Using `ky` for MinIO PUT**: ky adds `Authorization: Bearer <token>` header — presigned MinIO URLs are unauthenticated, and this extra header causes MinIO to reject the request with a 403 signature mismatch.
- **Step state in React useState only**: If user navigates away and back, state resets to step 1. Must use URL search params for IMPT-07.
- **Polling without terminal condition**: Forgetting to return `false` from `refetchInterval` when job reaches terminal state causes indefinite polling.
- **Referencing "COMPLETE" or "CANCELLED"**: The backend `ImportStatus` enum values are `completed` and there is NO `cancelled` status (see critical pitfall below). CONTEXT.md mentions "COMPLETE" and "CANCELLED" as labels but the API returns lowercase strings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data table with pagination | Custom table | `DataTable` shared component | Already handles sorting, loading skeletons, empty state, pagination controls |
| Status badge styling | Custom badge | `StatusBadge` shared component | Has success/warning/error/info/default variants |
| Role gating | Custom permission check | `RequireRole minimum="admin"` | Project-wide pattern; backend already enforces admin-only |
| Empty state | Custom empty message | `EmptyState` shared component | Used across all list pages |
| Fuzzy field matching | Client-side matching | Backend `/detect` endpoint | Already uses RapidFuzz with 75% threshold and L2/standard aliases |
| Progress bar | Raw CSS animation | `div` with percentage width (or install shadcn Progress) | Simple enough; or one-line shadcn add |
| Upload progress | `fetch` + ReadableStream | `XMLHttpRequest` with `upload.onprogress` | fetch does not expose upload progress |

**Key insight:** The backend pipeline is complete — the frontend only needs to orchestrate the existing API. There is no custom data processing to build client-side.

## Common Pitfalls

### Pitfall 1: ImportStatus Mismatch Between CONTEXT.md and Backend

**What goes wrong:** CONTEXT.md uses capitalized short forms ("COMPLETE", "CANCELLED") as human-readable labels, but the backend API returns lowercase strings: `"completed"`, `"failed"`, `"queued"`, `"processing"`, `"uploaded"`, `"pending"`.
**Why it happens:** Context notes were written for human readability; the `ImportStatus` StrEnum values are lowercase.
**Critical finding:** There is NO `cancelled` status in the backend model. The `ImportStatus` enum has exactly: `pending`, `uploaded`, `queued`, `processing`, `completed`, `failed`. The history DataTable should not show a "Cancelled" badge unless the backend adds this value.
**How to avoid:** The TypeScript `import-job.ts` types file should use exact lowercase string literals from the backend enum. Use `status === "completed"` not `status === "COMPLETE"`.

### Pitfall 2: XHR Authorization Header on MinIO

**What goes wrong:** If `ky` or the project's `api` client is used for the presigned URL PUT, the auth interceptor adds `Authorization: Bearer <token>`, causing MinIO to return 403 (signature mismatch — the presigned URL was signed without this header).
**Why it happens:** The ky `api` instance adds `Authorization` via `beforeRequest` hook unconditionally.
**How to avoid:** Use raw `XMLHttpRequest` for MinIO PUT only. Never pass the presigned URL to the `api` client.

### Pitfall 3: Routing Conflict — `imports` Before `imports/{id}`

**What goes wrong:** TanStack Router resolves file routes alphabetically. If `voters/imports/index.tsx` and `voters/imports/new.tsx` are siblings, this is fine. But if the wizard is placed at `voters/imports/$jobId.tsx`, route precedence must be verified.
**Why it happens:** Dynamic segments (`$jobId`) match before static segments in some configurations.
**How to avoid:** Use a static path like `voters/imports/new` for the wizard (not `voters/imports/$jobId`). The jobId travels as a search param, not a path segment — no conflict.

### Pitfall 4: refetchInterval Causing Memory Leaks on Unmount

**What goes wrong:** If the wizard component unmounts while a query with `refetchInterval` is active, TanStack Query continues polling in the background.
**Why it happens:** TanStack Query's polling is window-level; `gcTime` controls when inactive queries are garbage collected. By default `gcTime` is 5 minutes — polling continues for 5 minutes after unmount unless the query becomes stale.
**How to avoid:** TanStack Query v5 stops refetching when the query has no observers (no mounted components using it). This is correct default behavior — no special handling needed. Verify with existing polling tests in project if needed.

### Pitfall 5: Preview Step Data Source

**What goes wrong:** Building the preview table by trying to download the actual CSV from the client.
**Why it happens:** Confusion about where preview row data comes from.
**How to avoid:** After `/detect`, the `ImportJobResponse` has `detected_columns` (list of source column names) and `suggested_mapping` (dict of source col → canonical field). The preview step must re-use the mapping the user has configured in step 2 (held in local state or derived from `field_mapping`). There is NO preview-specific backend endpoint — the preview is rendered purely from:
1. The column names from `job.detected_columns`
2. The user's current mapping selections (local state)
3. A hardcoded 5-row placeholder dataset, OR the wizard fetches a small sample from the file (not supported by backend — use placeholder rows with column headers only showing mapping direction)

**Practical approach for preview**: Show the mapping as a table: "Source Column → Voter Field". Do not attempt to show actual CSV data rows (backend does not provide them). The preview demonstrates the mapping, not the data.

### Pitfall 6: Sidebar Nav Requires voters.tsx Edit

**What goes wrong:** The "Imports" link doesn't appear in the sidebar because `voters.tsx` (the voters layout with the sidebar nav) is not updated.
**Why it happens:** The sidebar nav is hardcoded in `voters.tsx` with a `navItems` array.
**How to avoid:** Edit `web/src/routes/campaigns/$campaignId/voters.tsx` and add `{ to: '/campaigns/${campaignId}/voters/imports', label: 'Imports' }` to the `navItems` array.

## Code Examples

Verified patterns from project codebase:

### Import Hook Query Keys (mirrors useVoterLists.ts)
```typescript
// Source: useVoterLists.ts
const importKeys = {
  all: (campaignId: string) => ["campaigns", campaignId, "imports"] as const,
  detail: (campaignId: string, jobId: string) =>
    ["campaigns", campaignId, "imports", jobId] as const,
  templates: (campaignId: string) =>
    ["campaigns", campaignId, "imports", "templates"] as const,
}
```

### Route with Typed Search Params (mirrors callback.tsx pattern)
```typescript
// Source: callback.tsx
export const Route = createFileRoute("/campaigns/$campaignId/voters/imports/new")({
  component: ImportWizardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    jobId: (search.jobId as string) ?? "",
    step: Number(search.step ?? 1),
  }),
})
```

### StatusBadge Usage for Import Status
```typescript
// Source: StatusBadge.tsx — maps import status strings to badge variants
function importStatusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "completed": return "success"
    case "failed": return "error"
    case "processing": return "info"
    case "queued": return "info"
    case "pending": return "default"
    default: return "default"
  }
}
// Usage: <StatusBadge status={job.status} variant={importStatusVariant(job.status)} />
```

### Confidence Badge Logic
```typescript
// The backend suggest_field_mapping uses RapidFuzz with score_cutoff=75
// For the badge: a mapping value of null means NO match (skip/unmatched)
// A non-null value means matched — but we don't get the score back from the API
// Treat: suggested_mapping[col] !== null && !== undefined → high confidence (green)
//        suggested_mapping[col] === null → low confidence or unmapped (yellow or none)
// The user's manual selection overrides the suggested value
```

### Cursor-Paginated History (mirrors useVoterListVoters pattern)
```typescript
// Source: useVoterLists.ts + imports.py (GET /imports uses cursor pagination)
export function useImports(campaignId: string) {
  return useQuery({
    queryKey: importKeys.all(campaignId),
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/imports`).json<PaginatedResponse<ImportJob>>(),
    enabled: !!campaignId,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      const hasActive = items.some(j => j.status === "queued" || j.status === "processing")
      return hasActive ? 3000 : false
    },
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fetch() for file upload progress | XMLHttpRequest | Always | fetch ReadableStream only exposes download progress; upload progress requires XHR |
| WebSocket for real-time updates | TanStack Query refetchInterval | Project decision | Backend has no WebSocket support; polling chosen explicitly |
| Component state for multi-step wizard | URL search params | CONTEXT decision | Enables browser back/forward and deep-linking to resume (IMPT-07) |

## Open Questions

1. **Preview Step Data Source**
   - What we know: Backend `/detect` returns `detected_columns` and `suggested_mapping` but does NOT return sample rows
   - What's unclear: How to show "first 5 rows" of actual data without a backend preview endpoint
   - Recommendation: Implement preview as a mapping summary table (source column → canonical field), not a data table. Label the step "Mapping Preview" rather than "Data Preview" to set correct expectations. If actual data preview is desired, it would require a new `/preview` backend endpoint — out of scope for this phase.

2. **Progress Badge Confidence Threshold**
   - What we know: `suggest_field_mapping` uses 75% score_cutoff but the score is NOT returned to the frontend — only the matched canonical field or null
   - What's unclear: How to show "high confidence" vs "low confidence" when we only know matched vs unmatched
   - Recommendation: Treat any non-null `suggested_mapping` value as high-confidence (green checkmark). Treat null as "no suggestion" — show yellow warning icon. This matches the visual pattern described in CONTEXT.md without requiring API changes.

3. **CANCELLED Status**
   - What we know: `ImportStatus` enum does NOT include `cancelled` — only `pending, uploaded, queued, processing, completed, failed`
   - What's unclear: CONTEXT.md mentions "Cancelled (grey)" as a history badge status
   - Recommendation: Implement the grey badge for `cancelled` defensively (it's in the UI spec), but the backend currently never produces this status. Map it in the status badge helper but document that it is unused until backend adds the status.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts) + React Testing Library |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose src/hooks/useImports.test.ts` |
| Full suite command | `cd web && npx vitest run` |
| Python tests | `uv run pytest tests/unit/test_import_service.py tests/unit/test_field_mapping.py -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMPT-01 | XHR upload initiates import job and calls MinIO | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ Wave 0 |
| IMPT-02 | /detect returns suggested_mapping; UI renders mapping rows | unit (hook + component) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ Wave 0 |
| IMPT-03 | Dropdown change updates local mapping state | unit (component) | `cd web && npx vitest run src/components/voters/ColumnMappingTable.test.tsx` | ❌ Wave 0 |
| IMPT-04 | Preview table renders correct column → field pairs | unit (component) | `cd web && npx vitest run src/components/voters/MappingPreview.test.tsx` | ❌ Wave 0 |
| IMPT-05 | Polling stops when status is completed/failed | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ Wave 0 |
| IMPT-06 | History query returns paginated items; polling active when jobs in progress | unit (hook) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ Wave 0 |
| IMPT-07 | deriveStep maps status strings to correct step numbers | unit (pure function) | `cd web && npx vitest run src/hooks/useImports.test.ts` | ❌ Wave 0 |
| Backend | Import service, field mapping (already covered) | unit (Python) | `uv run pytest tests/unit/test_import_service.py tests/unit/test_field_mapping.py -v` | ✅ exists |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run src/hooks/useImports.test.ts`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full Vitest suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/hooks/useImports.test.ts` — covers IMPT-01, IMPT-02, IMPT-05, IMPT-06, IMPT-07
- [ ] `web/src/components/voters/ColumnMappingTable.test.tsx` — covers IMPT-03
- [ ] `web/src/components/voters/MappingPreview.test.tsx` — covers IMPT-04
- [ ] (Optional) Install `progress` shadcn component: `cd web && npx shadcn@latest add progress`

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/api/v1/imports.py` — complete backend API verified
- Project codebase: `app/models/import_job.py` — exact `ImportStatus` enum values
- Project codebase: `app/schemas/import_job.py` — exact response field shapes
- Project codebase: `app/services/import_service.py` — CANONICAL_FIELDS list (24 voter fields)
- Project codebase: `web/src/routes/callback.tsx` — `validateSearch` pattern verified
- Project codebase: `web/src/hooks/useVoterLists.ts` — hook structure pattern verified
- Project codebase: `web/src/components/shared/StatusBadge.tsx` — variant system verified
- Project codebase: `web/src/components/shared/DataTable.tsx` — props interface verified
- Project codebase: `web/vitest.config.ts` — test configuration verified
- Project codebase: `web/src/api/client.ts` — XHR requirement verified (auth interceptor adds Bearer header)

### Secondary (MEDIUM confidence)
- TanStack Query v5 `refetchInterval` function signature — consistent with installed version 5.90.21
- MDN Web Docs: `XMLHttpRequest.upload.onprogress` — browser built-in, not library-dependent

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified installed in package.json, all API endpoints verified in backend code
- Architecture: HIGH — patterns extrapolated directly from existing project codebase files
- Pitfalls: HIGH — CANCELLED/COMPLETED discrepancy verified by reading the backend enum; XHR requirement verified by reading the ky client interceptor
- Test map: HIGH — test infrastructure verified in vitest.config.ts and existing test files

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable stack; backend API complete and stable)
