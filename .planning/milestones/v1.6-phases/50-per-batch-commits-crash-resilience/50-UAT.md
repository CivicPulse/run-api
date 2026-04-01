---
status: complete
phase: 50-per-batch-commits-crash-resilience
source: [50-01-SUMMARY.md, 50-02-SUMMARY.md]
started: "2026-03-29T12:00:00Z"
updated: "2026-03-29T12:05:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. last_committed_row column in model and migration
expected: ImportJob model has last_committed_row Mapped[int | None] with default=0; migration 018 adds the column with server_default='0'
result: pass

### 2. import_batch_size config setting
expected: Settings class has import_batch_size: int = 1000, configurable via env var
result: pass

### 3. commit_and_restore_rls helper function
expected: Module-level async function in app/db/rls.py that calls session.commit() then set_campaign_context()
result: pass

### 4. StorageService list_objects and delete_objects methods
expected: list_objects(prefix) uses paginated list_objects_v2; delete_objects(keys) batches up to 1000 per call
result: pass

### 5. Per-batch commit loop in import_service.py
expected: process_import_file commits after each batch of settings.import_batch_size rows, not once at end
result: pass

### 6. Crash resume logic via last_committed_row
expected: On restart, reads last_committed_row and skips that many CSV rows before resuming processing
result: pass

### 7. Per-batch error storage to MinIO
expected: Errors from each batch are immediately written to MinIO as imports/{cid}/{jid}/errors/batch_NNNN.csv
result: pass

### 8. Error merge on completion
expected: _merge_error_files concatenates batch CSVs (single header), uploads to errors.csv, deletes batch files
result: pass

### 9. Polling endpoint returns committed row counts
expected: GET /campaigns/{id}/imports/{id} returns ImportJobResponse including last_committed_row and imported_rows which increment after each batch
result: pass

### 10. RLS context maintained across batch boundaries
expected: After each commit (which clears transaction-scoped set_config), RLS is immediately restored before next batch query
result: pass

### 11. COMPLETED status moved to import_service.py (not import_task.py)
expected: import_task.py does not set ImportStatus.COMPLETED; import_service.py sets it at end of process_import_file
result: pass

### 12. All 13 batch resilience unit tests pass
expected: tests/unit/test_batch_resilience.py 13/13 pass; full unit suite still green (610 passed)
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
