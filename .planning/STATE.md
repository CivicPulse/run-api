---
gsd_state_version: 1.0
milestone: v1.12
milestone_name: Hardening & Remediation
status: defining_requirements
stopped_at: ""
last_updated: "2026-04-04T15:00:00.000Z"
last_activity: 2026-04-04
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** v1.12 Hardening & Remediation — closing codebase review findings

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-04 — Milestone v1.12 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

- Chunked child jobs chosen over staging tables or producer-consumer pipelines for import parallelization
- Secondary import work should be offloaded from the critical voter upsert path where possible
- Application-level orphan detection (`last_progress_at`) is the durable recovery signal
- Fresh task requeue plus `pg_try_advisory_lock` is the recovery concurrency model
- [Phase 59]: Store campaign_id directly on import_chunks so direct PostgreSQL RLS policies and indexes match other campaign-owned tables.
- [Phase 59]: Use a dedicated ImportChunkStatus enum so chunk states can evolve independently of parent import status.
- [Phase 59]: Keep chunk routing at the background task boundary while preserving one serial process_import_file call in Phase 59.
- [Phase 59]: Treat missing or malformed total_rows values as unknown and keep them on the serial path.
- [Phase 60-parent-split-parallel-processing]: Keep batch durability centered in _process_single_batch and move only streamed row iteration into process_import_range.
- [Phase 60-parent-split-parallel-processing]: Preserve the serial entrypoint by making process_import_file a wrapper that delegates with row_start=1 and row_end=None.
- [Phase 60-parent-split-parallel-processing]: Persist pre-scan total_rows on the parent job before rerunning serial routing.
- [Phase 60-parent-split-parallel-processing]: Mark chunks queued only after each defer succeeds so parent fan-out failures remain explicit.
- [Phase 60-parent-split-parallel-processing]: Extended process_import_range with an optional chunk progress target instead of forking a second chunk-only import loop.
- [Phase 60-parent-split-parallel-processing]: Kept child workers off parent aggregation by writing imported_rows, skipped_rows, last_committed_row, and error_report_key only on ImportChunk.
- [Phase 61-completion-aggregation-error-merging]: Stored phones_created on ImportChunk during chunk processing so Phase 61 fan-in can sum chunk rows instead of mutating the parent inline.
- [Phase 61-completion-aggregation-error-merging]: Widened import_jobs.status to 30 characters so completed_with_errors can be persisted without changing enum strategy.
- [Phase 61-completion-aggregation-error-merging]: Used a transaction-scoped advisory lock for parent finalization so any terminal chunk can race safely while only one finalizer publishes the parent result.
- [Phase 61-completion-aggregation-error-merging]: Recomputed parent imported_rows, skipped_rows, and phones_created from ImportChunk SQL aggregates and merged chunk error artifacts only in the locked finalizer.
- [Phase 62-resilience-cancellation]: Kept parent cancelled_at as the only cancellation signal and taught queued plus in-flight chunk workers to honor it without introducing worker-local cancel state.
- [Phase 62-resilience-cancellation]: Mapped cancelled chunk sets to a CANCELLED parent result when cancellation, not worker failure, is the dominant terminal outcome.
- [Phase 62-resilience-cancellation]: Ordered voter and phone upsert batches on their real conflict keys inside process_csv_batch() to reduce cross-chunk deadlocks without serializing workers.
- [Phase 63-secondary-work-offloading]: Moved chunk primary processing to voter-upsert-only writes and persisted chunk-scoped phone plus geometry manifests for deferred tasks.
- [Phase 63-secondary-work-offloading]: Kept chunks non-terminal after primary range completion and finalized them only after phone and geometry task states became terminal.
- [Phase 63-secondary-work-offloading]: Made `phones_created` a deferred phone-task responsibility so parent fan-in still derives totals from chunk rows.
- [Phase 64-frontend-throughput-status-ui]: Exposed `error_report_url` explicitly and treated `completed_with_errors` as a terminal first-class frontend state.
- [Phase 64-frontend-throughput-status-ui]: Derived throughput and ETA entirely on the client from durable import timestamps and counters.
- [Phase 64-frontend-throughput-status-ui]: Gave partial-success imports warning-style completion/history treatment with direct merged-report downloads.
- [Phase 65-chunk-planning-concurrency-cap-closure]: Added file-size-aware chunk planning and `StorageService.get_object_size()` without changing the chunk schema.
- [Phase 65-chunk-planning-concurrency-cap-closure]: Replaced eager chunk deferral with capped startup fan-out plus skip-locked successor promotion.
- [Phase 66-import-wizard-flow-recovery-progress-accuracy]: Bound detect-columns to the fresh `job_id` returned from upload initiation so new imports reliably reach mapping, progress, and completion.
- [Phase 66-import-wizard-flow-recovery-progress-accuracy]: Preserved the existing throughput/ETA metric contract and locked the repaired wizard flow with route-level tests.
- [Phase 67-chunk-import-cleanup-deletion-semantics]: Delete chunk child rows and chunk error artifacts before removing the parent import, while also upgrading the chunk foreign key to cascade on delete.
- [Phase 67-chunk-import-cleanup-deletion-semantics]: Treat runtime chunk creation as Phase 60 behavior and keep Phase 59 scoped to schema/RLS foundation.
- [Phase 68-progress-metric-accuracy-validation-closeout]: Added durable `processing_started_at` so throughput and ETA exclude upload and queue time.
- [Phase 68-progress-metric-accuracy-validation-closeout]: Normalized Phase 59 and 60 validation artifacts to the compliant Nyquist frontmatter contract instead of leaving them as partial exceptions.
- [Phase 70]: Guard hydration with detectedColumns.length === 0 to prevent refetch overwrites of user edits
- [Phase 70]: Used .first() selector for column assertions that appear both as labels and select values in Playwright strict mode

### Blockers/Concerns

- 16 CRITICAL findings from 2026-04-04 codebase review block production hardening
- Multi-tenant data isolation has 4 IDOR vulnerabilities and RLS gaps on core tables

## Session Continuity

Last activity: 2026-04-04 — Started milestone v1.12 Hardening & Remediation
Stopped at: —
Resume file: None

## Performance Metrics

(Reset for v1.12 — prior metrics archived with v1.11 milestone completion.)
