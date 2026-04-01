# Phase 53: Concurrent Safety & Cancellation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can cancel a running import, stopping it gracefully after the current batch completes with already-committed rows preserved. The system already prevents concurrent imports per campaign via Procrastinate queueing lock (Phase 49 D-05/D-06 — implemented). This phase adds the cancellation capability (BGND-03) and verifies concurrent prevention works end-to-end (BGND-04).

</domain>

<decisions>
## Implementation Decisions

### Cancellation Mechanism
- **D-01:** Add a `cancelled_at` timestamp column to ImportJob. The cancel endpoint sets this timestamp; the worker checks `cancelled_at` via `session.refresh(job)` between batches. No new infrastructure required — uses the existing DB session.
- **D-02:** The worker checks for cancellation only between batches (after each `_process_single_batch()` call), not mid-batch or mid-stream. Worst-case delay is one batch cycle (~1000 rows, seconds). This is acceptable.
- **D-03:** When cancellation is detected between batches, the worker finishes and commits the current batch before stopping. This maximizes preserved work and matches SC1: "stops after the current batch completes."
- **D-04:** On cancellation, per-batch error files are merged into a final `errors.csv`, same as on normal completion. The user gets a downloadable error report for the partial import.

### Status Lifecycle
- **D-05:** Add two new ImportStatus values: `CANCELLING` and `CANCELLED`. Cancel endpoint sets status to `CANCELLING`; worker transitions to `CANCELLED` after stopping. Frontend can show "Cancelling..." while the worker finishes the current batch.
- **D-06:** `CANCELLED` is a terminal state — no resume. The user starts a fresh import if needed. `last_committed_row` is preserved for reference only.

### Cancel Endpoint Design
- **D-07:** `POST /campaigns/{campaign_id}/imports/{import_id}/cancel` — action-style sub-resource. Clear intent, no ambiguity with DELETE semantics.
- **D-08:** Requires `admin` role, consistent with existing import endpoints (start, confirm mapping, poll status).
- **D-09:** Returns `202 Accepted` with `ImportJobResponse` showing `status=CANCELLING`. Frontend continues polling until status transitions to `CANCELLED`. Consistent with confirm_mapping's 202 pattern.

### Frontend Cancel UX
- **D-10:** Cancel button appears on the import status polling view, visible only when status is `PROCESSING` or `QUEUED`.
- **D-11:** Clicking cancel shows a ConfirmDialog: "Cancel this import? Already-imported rows will be kept." Uses the existing `ConfirmDialog` component from `web/src/components/shared/`.
- **D-12:** While in `CANCELLING` state, the cancel button is replaced with a disabled "Cancelling..." indicator (or spinner). The progress display continues showing committed row counts. Transitions to final `CANCELLED` state on the next poll cycle.

### Concurrent Prevention (BGND-04)
- **D-13:** Already implemented in Phase 49 via `queueing_lock=str(campaign_id)` in `confirm_mapping`. This phase adds end-to-end test coverage to verify it works correctly — no new code needed for the lock itself.

### Claude's Discretion
- Alembic migration naming and column ordering for `cancelled_at`
- Exact cancel check placement in `process_import_file()` (after `_process_single_batch` return vs in the streaming loop guard)
- Whether to add a `cancelled_by` column tracking which user requested cancellation
- Structured logging for cancellation events (cancel requested, cancel detected, cancel completed)
- Test approach for verifying cancellation timing (mock long-running batch, trigger cancel, verify committed rows)
- Frontend polling interval adjustment during CANCELLING state (if any)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Import Task (cancellation check integration)
- `app/tasks/import_task.py` — Worker task. Cancellation check and status transition to CANCELLED added here or delegated to import_service.
- `app/services/import_service.py` lines 1189-1318 — `process_import_file()` batch loop. Cancellation check inserted between batch iterations.
- `app/services/import_service.py` lines 1105-1187 — `_process_single_batch()` helper. Unchanged — cancellation check happens after this returns.

### Import Model (schema changes)
- `app/models/import_job.py` — ImportJob model and ImportStatus enum. Add `CANCELLING`/`CANCELLED` status values and `cancelled_at` column.

### Import API (cancel endpoint + concurrent lock)
- `app/api/v1/imports.py` lines 262-276 — `confirm_mapping` with existing `queueing_lock` and `AlreadyEnqueued` 409 handler. Verify this works end-to-end.
- `app/api/v1/imports.py` — New cancel endpoint added here.

### Import Schemas (response shape)
- `app/schemas/import_job.py` — ImportJobResponse schema. Must include new status values in serialization.

### Frontend Import Polling
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` — Import wizard with polling view. Cancel button and CANCELLING state UI added here.
- `web/src/components/shared/ConfirmDialog.tsx` — Existing confirmation dialog component.

### Prior Phase Context
- `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-CONTEXT.md` — D-05 (queueing_lock), D-06 (409 Conflict), D-07 (ImportJob.status as truth), D-08 (202 Accepted)
- `.planning/phases/50-per-batch-commits-crash-resilience/50-CONTEXT.md` — D-01 (last_committed_row), D-08 (per-batch commit + RLS restore), D-09 (batch error handling)
- `.planning/phases/51-memory-safety-streaming/51-CONTEXT.md` — D-01 (streaming CSV), D-02 (batch loop unchanged)

### Requirements
- `.planning/REQUIREMENTS.md` — BGND-03 (cancel running import), BGND-04 (prevent concurrent imports)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `queueing_lock=str(campaign_id)` in `confirm_mapping` — Already prevents concurrent imports (BGND-04 implemented).
- `ConfirmDialog` component — Existing shared dialog for cancel confirmation.
- `commit_and_restore_rls()` — Used after each batch commit. Cancellation cleanup uses the same pattern.
- `_merge_error_files()` — Existing method to consolidate per-batch error CSVs. Called on cancellation same as completion.
- `ImportJobResponse` schema — Already serializes ImportJob status. New enum values auto-serialize.

### Established Patterns
- Per-batch commit loop with `session.refresh(job)` for counter updates — same refresh pattern used for cancellation flag check
- 202 Accepted for async operations (confirm_mapping) — cancel endpoint follows same pattern
- `AlreadyEnqueued` exception handling for queueing lock conflicts
- Admin-only import endpoints with `require_role("admin")`

### Integration Points
- `process_import_file()` batch loop — Insert `session.refresh(job)` + `cancelled_at` check after each `_process_single_batch()` return
- `ImportStatus` enum — Add `CANCELLING` and `CANCELLED` values
- `ImportJob` model — Add `cancelled_at` DateTime column
- Import API router — Add `POST .../cancel` endpoint
- Import wizard frontend — Add cancel button + CANCELLING state UI to polling view

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 53-concurrent-safety-cancellation*
*Context gathered: 2026-03-28*
