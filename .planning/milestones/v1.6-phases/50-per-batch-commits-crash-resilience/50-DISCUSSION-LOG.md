# Phase 50: Per-Batch Commits & Crash Resilience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 50-per-batch-commits-crash-resilience
**Areas discussed:** Crash resume strategy, Error storage approach, Progress commit visibility, Batch transaction design, Schema migration scope, Batch size configuration, Idempotency on resume

---

## Crash Resume Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Batch counter on ImportJob | Add a committed_batches (or last_committed_row) column to ImportJob. Each batch commit increments it. On resume, skip that many rows from the CSV. | ✓ |
| Count voters in DB | On resume, count existing voters for this import's campaign+source. Skip that many rows. | |
| Offset tracking file in MinIO | Write a small JSON checkpoint file to MinIO after each batch with the byte offset or row number. | |

**User's choice:** Batch counter on ImportJob

| Option | Description | Selected |
|--------|-------------|----------|
| Row offset | Store last_committed_row. On resume, skip exactly that many CSV rows. Survives batch size changes. | ✓ |
| Batch number | Store committed_batches count. Compute skip = committed_batches * batch_size. | |
| You decide | Claude picks. | |

**User's choice:** Row offset

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-resume silently | Procrastinate retries the job. Worker sees PROCESSING + non-zero last_committed_row, skips ahead. | ✓ |
| New RESUMING status | Add ImportStatus.RESUMING to distinguish from fresh processing. | |
| You decide | Claude picks whichever is simpler. | |

**User's choice:** Auto-resume silently

---

## Error Storage Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Per-batch error files in MinIO | After each batch, write errors to MinIO as separate file. Memory cleared per batch. | ✓ |
| Append to single MinIO file | Append each batch's errors to a running file. MinIO doesn't support true append. | |
| Error rows in DB table | Write error rows to a new import_errors table. | |

**User's choice:** Per-batch error files in MinIO

| Option | Description | Selected |
|--------|-------------|----------|
| Merge at completion | Concatenate per-batch error CSVs into one final errors.csv. Clean up batch files. | ✓ |
| Leave as separate files | Keep per-batch files. Polling endpoint returns list of keys. | |
| You decide | Claude picks based on existing error_report_key pattern. | |

**User's choice:** Merge at completion

---

## Progress Commit Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Commit ImportJob with each batch | Update counters on ImportJob and commit with each batch transaction. Polling sees incremental progress. | ✓ |
| Separate progress transaction | Use a second connection/session to update counters outside the batch transaction. | |
| You decide | Claude picks whichever is simpler and safer. | |

**User's choice:** Commit ImportJob with each batch

| Option | Description | Selected |
|--------|-------------|----------|
| Existing status field is enough | ImportStatus.PROCESSING + incrementing imported_rows is sufficient. | ✓ |
| Add batch progress fields | Add current_batch and total_batches to response. | |
| You decide | Claude picks based on what frontend handles. | |

**User's choice:** Existing status field is enough

---

## Batch Transaction Design

| Option | Description | Selected |
|--------|-------------|----------|
| Commit + re-set on same session | After each batch: session.commit(), then set_campaign_context() again. Single long-lived session. | ✓ |
| New session per batch | Fresh async_session_factory() for each batch. Clean isolation but more overhead. | |
| Savepoints (nested transactions) | session.begin_nested() per batch. RLS stays set but data not visible to polling until outer commit. | |

**User's choice:** Commit + re-set on same session

| Option | Description | Selected |
|--------|-------------|----------|
| Rollback batch, log errors, continue | Rollback failed batch, write to error file, re-set RLS, continue. Partial success. | ✓ |
| Fail the entire import | Mark import as FAILED on any batch error. Already-committed batches stay. | |
| You decide | Claude picks based on resilience requirements. | |

**User's choice:** Rollback batch, log errors, continue

---

## Schema Migration Scope

| Option | Description | Selected |
|--------|-------------|----------|
| last_committed_row + phones_created | Add last_committed_row (integer, default 0). phones_created already exists. Sufficient for state reconstruction. | ✓ |
| last_committed_row + batch_size | Also persist batch_size used for this import. Survives batch size changes between deploys. | |
| You decide | Claude picks minimal schema change. | |

**User's choice:** last_committed_row + phones_created (phones_created already exists)

---

## Batch Size Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable | Add IMPORT_BATCH_SIZE to Settings with default 1000. Tunable per deployment. | ✓ |
| Keep hardcoded at 1000 | No configurability until proven need. YAGNI. | |
| You decide | Claude picks based on codebase conventions. | |

**User's choice:** Environment variable

---

## Idempotency on Resume

| Option | Description | Selected |
|--------|-------------|----------|
| Upsert handles it naturally | INSERT ON CONFLICT DO UPDATE means re-importing same rows is safe. last_committed_row only increments after commit. | ✓ |
| Skip one extra batch on resume | Re-process last batch as safety overlap. Combined with upsert, guarantees no gap. | |
| You decide | Claude picks based on upsert safety guarantees. | |

**User's choice:** Upsert handles it naturally

---

## Claude's Discretion

- MinIO path structure for per-batch error files
- Error CSV merge implementation details
- Structured logging around batch commit/resume events
- Alembic migration naming and sequencing
- Test fixtures and mocking approach

## Deferred Ideas

None — discussion stayed within phase scope
