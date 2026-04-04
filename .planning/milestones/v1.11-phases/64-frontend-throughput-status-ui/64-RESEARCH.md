# Phase 64: Frontend Throughput & Status UI - Research

**Researched:** 2026-04-03
**Domain:** Import progress UI, frontend status handling, import status API contract
**Confidence:** HIGH

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROG-04 | Import progress UI shows rows/second throughput and estimated time remaining | Use existing `total_rows`, `imported_rows`, `created_at`, and `last_progress_at` from the import status payload; add a pure frontend metrics helper and wire it into the existing progress/detail screens |

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python operations; do not use `pip`, `poetry`, or system Python directly.
- Frontend stack is React + TypeScript + TanStack Router/Query + shadcn/ui + Tailwind CSS.
- E2E runs must use `web/scripts/run-e2e.sh`.
- Preserve the existing neutral, accessible UI language; light and dark mode already exist.
- Target responsive, touch-friendly behavior and accessible status communication.

## Summary

Phase 64 should stay additive and mostly frontend-scoped. The current backend already exposes enough raw data to compute throughput client-side: `total_rows`, `imported_rows`, `created_at`, and `last_progress_at` are present on `ImportJobResponse`, and the detail endpoint already returns a pre-signed error report URL by overwriting `error_report_key`. The existing UI seams are also clear: `ImportProgress` owns the live progress card, the import wizard owns the completion card, and the history table owns status badges and row actions.

There are three concrete gaps in the current codebase that Phase 64 must close. First, the frontend type union does not include `completed_with_errors`, even though the backend now emits it. Second, polling and step restoration logic treat that status as non-terminal or unknown, so the wizard can poll forever and mis-derive the current step. Third, the UI does not yet distinguish partial success from clean success, and the history table cannot directly open the merged error report because list responses still expose the raw storage key.

**Primary recommendation:** Implement Phase 64 as one small API contract cleanup plus three frontend slices: status normalization, progress metrics, and partial-success presentation.

## Current Codebase Findings

- `app/models/import_job.py` defines `ImportStatus.COMPLETED_WITH_ERRORS`, so the backend contract already supports partial-success outcomes.
- `app/schemas/import_job.py` already exposes `total_rows`, `imported_rows`, `last_progress_at`, and `created_at`, which are enough for client-side throughput and ETA.
- `app/api/v1/imports.py` pre-signs the error report only on `GET /imports/{id}`, but `GET /imports` returns raw `error_report_key` values.
- `web/src/types/import-job.ts` omits `completed_with_errors`, `last_progress_at`, and `last_committed_row`, so the frontend contract is stale.
- `web/src/hooks/useImports.ts` treats only `completed`, `failed`, and `cancelled` as terminal; `completed_with_errors` would keep polling and `deriveStep()` would fall back to step 1.
- `web/src/components/voters/ImportProgress.tsx` is the right place for throughput + ETA, but it currently only renders percent/counts.
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx` already owns badge styling and row actions, but it maps unknown statuses to the default badge and disables “Download error report”.
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` already has a completion card with download-link support, so it is the right place for the distinct `COMPLETED_WITH_ERRORS` treatment.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI rendering | Existing app standard |
| TypeScript | 5.9.3 | Typed UI contracts | Existing app standard |
| @tanstack/react-query | 5.90.21 | Import polling and cache invalidation | Already owns import status fetching |
| @tanstack/react-router | 1.159.5 | Wizard/history route state | Existing app route standard |
| Tailwind CSS | 4.1.18 | Status layout/styling | Existing app styling standard |
| shadcn/ui primitives | repo standard | Progress, badge, button, dialog | Already used in import screens |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 4.0.18 | Unit/component tests | Pure helpers, status mapping, rendering states |
| Testing Library | 16.3.2 | DOM assertions | `ImportProgress` and completion-card behavior |
| Playwright | 1.58.2 | E2E import journey verification | One end-to-end partial-success regression |

## Recommended Implementation Slices

### Slice 1: Fix the frontend contract before adding UI

**Targets**

- `web/src/types/import-job.ts`
- `web/src/hooks/useImports.ts`
- `web/src/hooks/useImports.test.ts`

**Changes**

- Add `"completed_with_errors"` to `ImportStatus`.
- Add `last_progress_at`, `last_committed_row`, and a dedicated `error_report_url` field if the API is cleaned up.
- Treat `completed_with_errors` as terminal in `deriveStep()`, `useImportJob()` polling, and `useImports()` active-job detection.

**Why first**

Without this slice, the wizard can keep polling forever after a partial-success completion and step restoration can mis-route the user.

### Slice 2: Add a pure progress-metrics helper and use it in `ImportProgress`

**Targets**

- New file: `web/src/lib/import-progress.ts` or `web/src/components/voters/importProgressMetrics.ts`
- `web/src/components/voters/ImportProgress.tsx`
- New file: `web/src/components/voters/ImportProgress.test.tsx`

**Changes**

- Compute:
  - `elapsedSeconds = max((now - created_at), 1)`
  - `throughput = imported_rows / elapsedSeconds`
  - `remainingRows = max(total_rows - imported_rows, 0)`
  - `etaSeconds = throughput > 0 ? remainingRows / throughput : null`
- Prefer `last_progress_at` as the freshness guard:
  - hide ETA while queued
  - hide ETA when `total_rows` is null
  - hide ETA when `imported_rows` is 0
  - show “Calculating…” instead of unstable zeros
- Render throughput and ETA as secondary stats under the progress bar.

**Why this shape**

The helper becomes easy to unit-test and avoids burying time math inside a render component.

### Slice 3: Add distinct `COMPLETED_WITH_ERRORS` treatment and merged-report access

**Targets**

- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx`
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx`
- `web/src/components/shared/StatusBadge.tsx` or a route-local status helper
- `app/schemas/import_job.py`
- `app/api/v1/imports.py`

**Changes**

- Completion screen:
  - distinct title like “Import completed with errors”
  - warning-toned summary card, not success or destructive
  - row counts plus prominent download link for the merged report
- History table:
  - map `completed_with_errors` to a warning badge
  - show user-facing label text instead of the raw enum
  - either enable direct download with a signed `error_report_url` from `list_imports`, or keep the action as “View details” and remove the disabled fake download item
- API cleanup recommendation:
  - stop overloading `error_report_key` with a signed URL on detail responses
  - add `error_report_url: str | None` on both detail and list responses when a report exists

**Why this matters**

The current list/detail contract is inconsistent. A dedicated URL field removes ambiguity and makes the history UI reliable.

## Architecture Patterns

### Pattern 1: Pure derived metrics from polled job state

**What:** Treat throughput and ETA as derived presentation state, not persisted backend fields.

**When to use:** For Phase 64’s rows/second and ETA only.

**Recommendation:** Keep the backend unchanged unless future product work needs server-authored ETA semantics.

### Pattern 2: Terminal-status normalization at the hook boundary

**What:** Centralize “is this import done?” in `useImports.ts`.

**When to use:** Step derivation, polling shutdown, badge mapping, and completion routing.

**Recommendation:** Export a small helper such as `isTerminalImportStatus(status)` and reuse it instead of repeating string comparisons.

### Pattern 3: Distinct UI state for partial success

**What:** `completed_with_errors` must not share the same visuals as `completed` or `failed`.

**When to use:** Completion card, history badge, and any future toast/callout copy.

**Recommendation:** Use warning styling plus explicit copy that successful rows were kept and the merged report contains the failures.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live progress transport | WebSocket/SSE | Existing 3-second TanStack Query polling | Already declared in requirements as sufficient |
| Persisted ETA fields | New DB columns / worker updates | Client-side derived metrics | Avoids backend churn for display-only data |
| Chunk-level UI | Chunk dashboards or per-chunk rows | Parent import-only UI | Chunking is intentionally an implementation detail |

## Concrete File Targets

- `app/schemas/import_job.py`
- `app/api/v1/imports.py`
- `web/src/types/import-job.ts`
- `web/src/hooks/useImports.ts`
- `web/src/hooks/useImports.test.ts`
- `web/src/components/voters/ImportProgress.tsx`
- `web/src/components/voters/ImportProgress.test.tsx` (new)
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx`
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx`

## Common Pitfalls

### Pitfall 1: Treating `completed_with_errors` as unknown

**What goes wrong:** The wizard falls back to step 1 and polling keeps running after the job is actually finished.

**Why it happens:** Frontend status unions and terminal-status checks still reflect the pre-Phase-61 backend.

**How to avoid:** Add the status to the type union and central terminal-status helper first.

### Pitfall 2: Showing misleading ETA values early in processing

**What goes wrong:** Users see `0s remaining`, `Infinity`, or wildly oscillating ETAs.

**Why it happens:** Throughput is calculated before meaningful progress exists.

**How to avoid:** Gate ETA rendering on `total_rows != null`, `imported_rows > 0`, and positive elapsed time; render “Calculating…” until stable.

### Pitfall 3: Mixing raw storage keys with browser URLs

**What goes wrong:** The history page displays a “Download error report” affordance that cannot actually open the merged file.

**Why it happens:** Detail responses rewrite `error_report_key` to a signed URL, but list responses do not.

**How to avoid:** Introduce a separate `error_report_url` response field or avoid showing direct download actions from list data.

## Code Example

```ts
export function deriveImportMetrics(job: ImportJob, now = Date.now()) {
  if (!job.total_rows || !job.created_at) {
    return { throughput: null, etaSeconds: null }
  }

  const imported = job.imported_rows ?? 0
  const elapsedSeconds = Math.max(
    (now - new Date(job.created_at).getTime()) / 1000,
    1,
  )

  if (imported <= 0) {
    return { throughput: null, etaSeconds: null }
  }

  const throughput = imported / elapsedSeconds
  const remainingRows = Math.max(job.total_rows - imported, 0)

  return {
    throughput,
    etaSeconds: throughput > 0 ? remainingRows / throughput : null,
  }
}
```

## Risks

- The history endpoint currently cannot support direct download actions cleanly without an API adjustment.
- `created_at` is a coarse start time; ETA will include queue time if the job sat queued before processing. That is acceptable for Phase 64 unless product wants a stricter “active processing ETA,” which would require a backend `started_processing_at`.
- If Phase 63 materially changes the pace of `imported_rows` updates, ETA jitter may change. Keeping the computation isolated in one helper limits rework.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Web tests and local validation | ✓ | 24.13.1 | — |
| npm | Frontend scripts | ✓ | 11.8.0 | — |
| Vitest | Component/unit tests | ✓ | 4.0.18 | `npm test -- --runInBand` not needed |
| Playwright | Import E2E verification | ✓ | 1.58.2 | Use Vitest-only coverage if browser env is unavailable |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + Testing Library; Playwright 1.58.2 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run web/src/hooks/useImports.test.ts web/src/components/voters/ImportProgress.test.tsx` |
| Full suite command | `cd web && ./scripts/run-e2e.sh voter-import.spec.ts` |

### Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-04 | `completed_with_errors` is terminal for step routing and polling | unit | `cd web && npx vitest run src/hooks/useImports.test.ts` | ✅ |
| PROG-04 | Progress card shows rows/sec and ETA only when enough data exists | component | `cd web && npx vitest run src/components/voters/ImportProgress.test.tsx` | ❌ Wave 0 |
| PROG-04 | Completion card and history badge show distinct partial-success treatment with error report access | component | `cd web && npx vitest run src/components/voters/ImportProgress.test.tsx src/hooks/useImports.test.ts` | ❌ partial |
| PROG-04 | Browser journey shows merged-report link and warning treatment after partial-success payload | e2e | `cd web && ./scripts/run-e2e.sh voter-import.spec.ts --grep "completed with errors"` | ⚠ likely Wave 0 |

### Wave 0 Gaps

- `web/src/components/voters/ImportProgress.test.tsx` — new coverage for throughput, ETA, and partial-success rendering.
- Import journey E2E fixture/state for `completed_with_errors` — likely needs a mocked response or dedicated backend seed path.

## Sources

### Primary (HIGH confidence)

- `app/models/import_job.py` - import status enum and chunk status enum
- `app/schemas/import_job.py` - current API response fields
- `app/api/v1/imports.py` - detail/list import status behavior and error report URL handling
- `web/src/types/import-job.ts` - current frontend type contract
- `web/src/hooks/useImports.ts` - polling and step-derivation behavior
- `web/src/components/voters/ImportProgress.tsx` - live progress UI seam
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` - completion-state UI seam
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx` - history badge/action seam
- `web/src/hooks/useImports.test.ts` - existing frontend regression coverage
- `tests/unit/test_import_service.py` - backend status/finalization coverage for `COMPLETED_WITH_ERRORS`
- `tests/integration/test_import_parallel_processing.py` - parent finalization coverage for mixed chunk outcomes

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - taken directly from `web/package.json` and current repo structure
- Architecture: HIGH - based on the existing route/component/hook seams already used by import flows
- Pitfalls: HIGH - directly evidenced by current stale type unions and inconsistent API behavior

**Research date:** 2026-04-03
**Valid until:** 2026-04-10
