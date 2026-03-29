# Phase 50: Per-Batch Commits & Crash Resilience - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Each batch of imported voter rows is committed independently so partial progress persists through worker crashes. RLS campaign context is restored after every commit. On crash or restart, the import resumes from the last committed batch. The polling endpoint shows committed row counts updated after each batch. Error rows are written to MinIO per-batch so memory stays bounded regardless of error volume.

</domain>

<decisions>
## Implementation Decisions

### Crash Resume Strategy
- **D-01:** Add `last_committed_row` (integer, default 0) column to ImportJob — stores the CSV row offset of the last fully committed batch. On resume, skip that many rows from the CSV and continue.
- **D-02:** Resume is silent — worker detects PROCESSING status + non-zero `last_committed_row`, skips ahead, and continues. No new ImportStatus value needed. Polling endpoint shows progress incrementing naturally.
- **D-03:** Upsert (INSERT ON CONFLICT DO UPDATE) provides natural idempotency — if a crash happens mid-batch, the uncommitted batch gets re-processed on resume. `last_committed_row` only increments after successful commit, so no gap is possible.

### Error Storage
- **D-04:** Per-batch error files written to MinIO (e.g., `imports/{campaign_id}/{job_id}/errors/batch_001.csv`). Memory freed after each batch write. No in-memory `all_errors` accumulation.
- **D-05:** On import completion, merge per-batch error CSVs into one final `errors.csv`, update `error_report_key`, and clean up batch files. User downloads a single consolidated error report.

### Progress Commit Visibility
- **D-06:** ImportJob counters (`imported_rows`, `skipped_rows`, `total_rows`, `last_committed_row`) are committed with each batch transaction. Polling endpoint sees incremental progress immediately.
- **D-07:** Existing `ImportStatus.PROCESSING` + incrementing `imported_rows` is sufficient for frontend — no new batch progress fields needed.

### Batch Transaction Design
- **D-08:** Single long-lived session with commit + RLS re-set per batch. After each batch: `session.commit()` (clears RLS context), then `set_campaign_context(session, campaign_id)` before the next batch. Matches existing import_task.py pattern.
- **D-09:** If a single batch fails (DB constraint error, etc.): rollback that batch, write its rows to the error file, re-set RLS, and continue with the next batch. Import completes with partial success. Already-committed batches are safe.

### Schema Migration
- **D-10:** Add `last_committed_row` (Integer, nullable, default 0) to ImportJob model and create Alembic migration. `phones_created` column already exists. Combined with existing `imported_rows`/`skipped_rows`/`total_rows`, this is sufficient for full state reconstruction on resume.

### Batch Size Configuration
- **D-11:** Add `IMPORT_BATCH_SIZE` to Settings (`app/core/config.py`) with default 1000. Configurable per deployment via environment variable. Follows existing Settings pattern.

### Claude's Discretion
- Exact MinIO path structure for per-batch error files
- Error CSV merge implementation details (streaming concatenation vs. in-memory)
- Whether to add structured logging around batch commit/resume events (likely yes)
- Alembic migration naming and sequencing
- Any necessary test fixtures or mocking approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Import Task & Service (primary modification targets)
- `app/tasks/import_task.py` — Current single-session import task; needs per-batch commit loop with RLS restore
- `app/services/import_service.py` — `process_import_file()` method (line 836+) is the main refactor target; `process_csv_batch()` (line 704+) stays mostly unchanged
- `app/models/import_job.py` — ImportJob model; needs `last_committed_row` column addition

### RLS Context (critical constraint)
- `app/db/rls.py` — `set_campaign_context()` uses `set_config(..., true)` scoped to transaction. RESETS ON COMMIT. This is the reason per-batch RLS restore is mandatory.

### Infrastructure
- `app/db/session.py` — `async_session_factory` used by worker task
- `app/core/config.py` — Settings class; add IMPORT_BATCH_SIZE here
- `app/services/storage.py` — StorageService for MinIO uploads (per-batch error files)
- `app/api/v1/imports.py` — Polling endpoint `get_import_status` (line 268+); no changes needed but verify it reflects committed counters

### Requirements
- `.planning/REQUIREMENTS.md` — RESL-01 through RESL-05 (all five import resilience requirements map to this phase)

### Prior Phase Context
- `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-CONTEXT.md` — D-05 (queueing_lock), D-07 (ImportJob.status is business truth), D-08 (202 Accepted)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `process_csv_batch()` — Batch upsert logic with INSERT ON CONFLICT DO UPDATE. Already returns (imported_count, errors, phones_created). Can be called unchanged per batch.
- `set_campaign_context()` — RLS helper. Will be called after every `session.commit()`.
- `StorageService.upload_bytes()` — Used for error report upload. Will be called per-batch for error files.
- `async_session_factory()` — Session factory used by import task. Single session will be reused with commit+re-set pattern.

### Established Patterns
- Import task creates own session via `async_session_factory()`, sets RLS, delegates to ImportService
- ImportJob progress fields updated via `session.flush()` currently — will change to `session.commit()` per batch
- Error report written to MinIO as CSV with key `imports/{campaign_id}/{job_id}/errors.csv`
- Settings class in `app/core/config.py` for environment-variable-driven configuration

### Integration Points
- `import_task.py:process_import()` — Main refactor: add per-batch commit loop, RLS restore, resume skip logic
- `import_service.py:process_import_file()` — Refactor: per-batch error writes to MinIO, merge at end, resume-aware row skipping
- `import_job.py:ImportJob` — Add `last_committed_row` column
- `alembic/` — New migration for `last_committed_row` column
- `app/core/config.py:Settings` — Add `IMPORT_BATCH_SIZE` field

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

*Phase: 50-per-batch-commits-crash-resilience*
*Context gathered: 2026-03-28*
