# Phase 54: Error Report Download & Type Safety Fix - Research

**Researched:** 2026-03-29
**Domain:** Frontend bug fix (broken download link) + TypeScript type alignment
**Confidence:** HIGH

## Summary

This is a small, well-scoped gap closure phase addressing two issues found by the v1.6 milestone audit: INT-01 (broken error report download link) and INT-02 (phantom `expires_in` field in `ImportUploadResponse` TS type). Both issues are fully understood with exact file locations, line numbers, and verified fixes.

The error report download link in the import wizard completion view (step 4) points to a non-existent API route (`/api/v1/campaigns/{id}/imports/{jobId}/error-report`). The backend already does the right thing: the `get_import_status` endpoint replaces the raw S3 key in `error_report_key` with a pre-signed MinIO download URL before returning the response. The frontend just needs to use `jobQuery.data.error_report_key` as the `href` instead of constructing a fake API path.

The type mismatch in `ImportUploadResponse` is cosmetic (no runtime impact) but should be fixed for type safety: the backend returns `{ job_id, upload_url, file_key }` but the frontend type declares `{ job_id, upload_url, expires_in }`. The phantom `expires_in` is never read; the missing `file_key` is never needed by the wizard. Both should be corrected to match reality.

**Primary recommendation:** Fix the download link href to use `jobQuery.data.error_report_key` (the pre-signed URL), and align `ImportUploadResponse` type with the backend schema. Two-file change, no backend modifications needed.

## Project Constraints (from CLAUDE.md)

- **Stack:** Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS
- **Frontend:** React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS
- **Package manager:** `uv` only (not pip/poetry)
- **Linting:** `uv run ruff check .` / `uv run ruff format .` for Python; TypeScript must pass `tsc --noEmit`
- **Tests:** `uv run pytest` (Python), `vitest` (frontend)
- **Git:** Conventional Commits, branch-based, never push unless asked
- **Visual verification:** After UI changes, use Playwright MCP or screenshots

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESL-05 (gap closure) | Error rows written to MinIO per-batch; download link must work | Backend already generates pre-signed URL in `get_import_status` (imports.py:367-370). Frontend link just needs correct href. |
</phase_requirements>

## Architecture Patterns

### Backend: Pre-signed URL Generation (Already Correct)

The backend `get_import_status` endpoint (`app/api/v1/imports.py:364-373`) already handles error report download correctly:

```python
# imports.py lines 367-370
if job.error_report_key:
    storage = request.app.state.storage_service
    response.error_report_key = await storage.generate_download_url(
        job.error_report_key
    )
```

This replaces the raw S3 object key (e.g., `imports/{cid}/{jid}/errors/merged_errors.csv`) with a pre-signed GET URL valid for 1 hour. The `StorageService.generate_download_url` method (`app/services/storage.py:79-97`) uses `s3v4` signature and `ExpiresIn=3600`.

**Key insight:** The `ImportJob.error_report_key` field in the polling response is NOT a raw S3 key -- it is a fully-formed pre-signed URL ready for browser download. The frontend can use it directly as an `href`.

### Frontend: Import Wizard Step Flow

The import wizard uses 4 steps (plus step 2.5 for preview):
1. Upload (step 1)
2. Column Mapping (step 2) + Preview (step 2.5)
3. Progress (step 3) -- polls `useImportJob` every 3s
4. Completion (step 4) -- shows results and error report download link

Step 4 receives data from `jobQuery` (a `useImportJob` call without polling). The `jobQuery.data` object has type `ImportJob` which includes `error_report_key: string | null`.

### Backend Response Shape vs Frontend Types

**`ImportUploadResponse` (initiate import):**

| Field | Backend (`app/schemas/import_job.py:37-43`) | Frontend (`web/src/types/import-job.ts:30-34`) |
|-------|------|----------|
| `job_id` | `uuid.UUID` | `string` |
| `upload_url` | `str` | `string` |
| `file_key` | `str` | **MISSING** |
| `expires_in` | **NOT IN SCHEMA** | `number` (phantom) |

**`ImportJobResponse` (polling endpoint):**

| Field | Backend | Frontend `ImportJob` | Match |
|-------|---------|---------------------|-------|
| `error_report_key` | `str \| None` (pre-signed URL) | `string \| null` | Correct |
| `last_committed_row` | `int \| None` | **Not in type** | OK (unused) |
| `format_detected` | `str \| None` | **Not in type** | OK (unused in ImportJob) |
| All other fields | Present | Present | Correct |

The `ImportJob` frontend type is mostly correct. The only consumer-facing issue is `ImportUploadResponse`.

## Exact Changes Required

### Change 1: Fix error report download link (INT-01)

**File:** `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx`
**Line:** 358

**Current (broken):**
```tsx
<a
  href={`/api/v1/campaigns/${campaignId}/imports/${jobId}/error-report`}
  className="text-sm text-primary underline"
  download
>
```

**Fix:**
```tsx
<a
  href={jobQuery.data.error_report_key}
  className="text-sm text-primary underline"
  target="_blank"
  rel="noopener noreferrer"
>
```

**Notes:**
- Remove `download` attribute: pre-signed MinIO URLs are cross-origin, so `download` attribute is ignored by browsers (HTML spec). The URL will trigger a download naturally because MinIO returns `Content-Disposition: attachment` for CSV files, or the browser will show the CSV content.
- Add `target="_blank" rel="noopener noreferrer"`: opens in new tab so the wizard state is preserved. The pre-signed URL points to MinIO (different origin), not the app server.
- The conditional `{jobQuery.data.error_report_key && (...)}` on line 356 already guards against null.

### Change 2: Fix ImportUploadResponse type (INT-02)

**File:** `web/src/types/import-job.ts`
**Lines:** 30-34

**Current (mismatched):**
```typescript
export interface ImportUploadResponse {
  job_id: string
  upload_url: string
  expires_in: number
}
```

**Fix:**
```typescript
export interface ImportUploadResponse {
  job_id: string
  upload_url: string
  file_key: string
}
```

**Notes:**
- `expires_in` is never read anywhere in the codebase. The only consumer is `useInitiateImport` which destructures `{ job_id, upload_url }` (new.tsx line 130).
- `file_key` is returned by the backend but never used by the wizard. Adding it for type accuracy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error report download route | Custom API proxy route for file download | Pre-signed URL from `generate_download_url` | S3 pre-signed URLs are the standard pattern; adding a proxy route adds latency, memory pressure (file passes through API), and a new endpoint to maintain |

## Common Pitfalls

### Pitfall 1: Using `download` attribute with cross-origin URLs
**What goes wrong:** The HTML `download` attribute is ignored for cross-origin URLs per the HTML spec. The current broken link would also have this issue even if it pointed to a real endpoint.
**Why it happens:** Developers assume `download` always triggers a file download, but browsers enforce same-origin policy for this attribute.
**How to avoid:** For cross-origin downloads (MinIO pre-signed URLs), use `target="_blank"` instead. MinIO/S3 will set appropriate `Content-Disposition` headers.
**Warning signs:** Click "Download error report" and nothing happens, or the browser navigates instead of downloading.

### Pitfall 2: Pre-signed URL expiration
**What goes wrong:** The pre-signed URL in `error_report_key` is generated when the polling endpoint is called and expires in 1 hour. If the user leaves the completion view open for over an hour without the page re-fetching, the link will return 403.
**Why it happens:** Pre-signed URLs have a fixed TTL (3600s in this codebase).
**How to avoid:** This is acceptable for the current UX since `useImportJob` refetches on window focus by default (TanStack Query default behavior). A user returning to the tab will get a fresh pre-signed URL.
**Warning signs:** User leaves tab open for hours, comes back, clicks download, gets 403.

### Pitfall 3: Assuming `error_report_key` is an S3 key
**What goes wrong:** Code treats `error_report_key` as a raw S3 key and tries to construct a download path from it.
**Why it happens:** The field name suggests it's a key, but the `get_import_status` endpoint replaces it with a pre-signed URL before returning.
**How to avoid:** Always use the value from the API response directly -- it's already a downloadable URL.

## Code Examples

### Error report download link (verified fix)

```tsx
// Source: web/src/routes/campaigns/$campaignId/voters/imports/new.tsx
// Lines 356-364 (step 4 completion view)
{jobQuery.data.error_report_key && (
  <a
    href={jobQuery.data.error_report_key}
    className="text-sm text-primary underline"
    target="_blank"
    rel="noopener noreferrer"
  >
    Download error report
  </a>
)}
```

### Backend pre-signed URL generation (no changes needed)

```python
# Source: app/api/v1/imports.py lines 367-370
# The get_import_status endpoint already generates the pre-signed URL:
if job.error_report_key:
    storage = request.app.state.storage_service
    response.error_report_key = await storage.generate_download_url(
        job.error_report_key
    )
```

### Corrected ImportUploadResponse type

```typescript
// Source: web/src/types/import-job.ts lines 30-34
export interface ImportUploadResponse {
  job_id: string
  upload_url: string
  file_key: string
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via `web/vitest.config.ts`) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run src/hooks/useImports.test.ts` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESL-05 (download) | Error report link uses pre-signed URL from jobQuery.data | manual + unit | `cd web && npx vitest run src/hooks/useImports.test.ts` | Partial (hooks tested, download link not tested) |
| INT-02 (type fix) | ImportUploadResponse has file_key, no expires_in | type-check | `cd web && npx tsc --noEmit` | N/A (type-level) |

### Sampling Rate
- **Per task commit:** `cd web && npx tsc --noEmit && npx vitest run src/hooks/useImports.test.ts`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green + `tsc --noEmit` clean

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The download link fix is a single-line href change best verified visually (Playwright or manual). The type fix is verified by `tsc --noEmit`. No new test files needed.

## Open Questions

1. **`download` attribute behavior with MinIO URLs**
   - What we know: HTML spec says `download` is ignored for cross-origin. MinIO pre-signed URLs are cross-origin (different port in dev, different domain in prod).
   - What's unclear: Whether MinIO sets `Content-Disposition: attachment` by default for CSV objects.
   - Recommendation: Use `target="_blank" rel="noopener noreferrer"` -- the browser will either download or display the CSV based on MinIO headers, both of which are acceptable. If download behavior is critical, a follow-up task could set `Content-Disposition` via `ResponseContentDisposition` in the `generate_download_url` params.

2. **Comment in useImports.ts referencing `expires_in`**
   - What we know: Line 57 of `useImports.ts` has a JSDoc comment `Returns ImportUploadResponse { job_id, upload_url, expires_in }`.
   - What's unclear: Nothing -- this comment is also stale and should be updated.
   - Recommendation: Update the comment to `{ job_id, upload_url, file_key }` when fixing the type.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `app/api/v1/imports.py` lines 364-373 (pre-signed URL generation in get_import_status)
- Direct code inspection of `app/schemas/import_job.py` lines 37-43 (backend ImportUploadResponse schema)
- Direct code inspection of `web/src/types/import-job.ts` lines 30-34 (frontend ImportUploadResponse type)
- Direct code inspection of `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` line 358 (broken href)
- Direct code inspection of `app/services/storage.py` lines 79-97 (generate_download_url implementation)
- v1.6 Milestone Audit `.planning/v1.6-MILESTONE-AUDIT.md` (INT-01, INT-02 issue descriptions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed, all existing code
- Architecture: HIGH - Backend pre-signed URL pattern already implemented and verified
- Pitfalls: HIGH - Well-understood HTML/S3 behavior, documented in specs

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no moving parts)
