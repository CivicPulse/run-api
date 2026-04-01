# Phase 51: Memory Safety & Streaming - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Stream CSV files from MinIO incrementally instead of loading the entire file into memory. The worker must be able to import a 30MB+ CSV file without being OOM-killed, with memory usage roughly constant regardless of file size. The per-batch commit loop, crash resume, error storage, and all user-facing behavior remain unchanged.

</domain>

<decisions>
## Implementation Decisions

### Streaming Approach
- **D-01:** Replace the "download all chunks → join → decode → StringIO" pattern with an async line-by-line iterator over S3 chunks. A line buffer reconstructs complete CSV lines across chunk boundaries, then feeds them to `csv.DictReader` via a synchronous file-like wrapper. No new third-party library required — builds on existing `StorageService.download_file()` async iterator.
- **D-02:** The per-batch commit loop (`_process_single_batch`) is unchanged. Only the file download and CSV parsing preamble in `process_import_file()` changes — rows are yielded one at a time from the stream instead of materialized from an in-memory string.

### Encoding Detection
- **D-03:** Detect encoding from the first S3 chunk (typically 8-64KB). Try utf-8-sig decode first, fall back to latin-1 — same logic as current code but applied to one chunk, not the full file. The detected encoding is then used to decode all subsequent chunks in the stream.
- **D-04:** If the first chunk decodes as utf-8-sig, a BOM (byte order mark) at position 0 is stripped. This matches the current `utf-8-sig` codec behavior.

### Resume Strategy
- **D-05:** Keep the existing row-skip approach for crash resume (`rows_skipped < rows_to_skip`). Streaming already frees memory from skipped rows immediately (they aren't accumulated). S3 Range byte-offset optimization is deferred — it adds byte-position tracking complexity for marginal benefit since row-skip only runs once per resume.

### Memory Invariant
- **D-06:** At no point should more than ~2 batches worth of row data (plus one S3 chunk) be resident in memory. The streaming iterator, the current batch list, and one S3 read-ahead chunk are the only significant allocations. All other intermediate buffers (line reconstruction, decoded text) are bounded by chunk size.

### Claude's Discretion
- Exact async line iterator implementation (async generator vs class-based AsyncIterator)
- S3 chunk size hints (default from aioboto3 vs explicit chunk_size parameter)
- Whether to extract the streaming CSV reader as a utility or keep it inline in import_service
- Structured logging additions for streaming progress (bytes read, chunks processed)
- Test approach for verifying memory-bounded behavior (mock large file, check no full materialization)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Import Processing (primary modification target)
- `app/services/import_service.py` lines 1033-1053 — Current "download all → decode → StringIO" pattern to be replaced with streaming
- `app/services/import_service.py` lines 987-1109 — Full `process_import_file()` method including per-batch commit loop (loop stays, preamble changes)
- `app/services/import_service.py` lines 930-986 — `_process_single_batch()` helper (unchanged — receives batch list, processes it)

### Storage Service (streaming source)
- `app/services/storage.py` lines 99-114 — `download_file()` async generator yielding byte chunks via `response["Body"].iter_chunks()`. This is the streaming source to build on.

### RLS & Session Context
- `app/db/rls.py` — `set_campaign_context()` and `commit_and_restore_rls()` — unchanged, but streaming must not interfere with the session/commit pattern

### Configuration
- `app/core/config.py` — Settings class with `import_batch_size` (default 1000) — no changes needed

### Prior Phase Context
- `.planning/phases/50-per-batch-commits-crash-resilience/50-CONTEXT.md` — D-01 (last_committed_row), D-08 (single session with commit + RLS re-set), D-09 (batch error handling)
- `.planning/phases/49-procrastinate-integration-worker-infrastructure/49-CONTEXT.md` — D-03 (worker entrypoint), D-07 (ImportJob.status as business truth)

### Requirements
- `.planning/REQUIREMENTS.md` — MEMD-01: CSV streamed from MinIO incrementally instead of loaded entirely into memory

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StorageService.download_file()` — Already an async generator yielding byte chunks. The streaming CSV reader wraps this directly.
- `_process_single_batch()` — Batch processing helper. Unchanged — continues to receive a `list[dict[str, str]]` batch and process it.
- `commit_and_restore_rls()` — Module-level helper for batch commits with RLS restore. Unchanged.
- `csv.DictReader` — Standard library. Can accept any iterable of strings (not just file objects). A line-yielding wrapper over the byte stream is sufficient.

### Established Patterns
- Async generators for S3 streaming (`download_file` yields chunks)
- Per-batch commit loop in `process_import_file()` with configurable `import_batch_size`
- Resume via `last_committed_row` with row-skip loop
- Error files written per-batch to MinIO then merged on completion

### Integration Points
- `process_import_file()` preamble (lines 1033-1053): Replace download-all + decode + StringIO with streaming line iterator
- The row iteration loop (line 1071: `for row in reader:`) stays structurally identical — `reader` just comes from a streaming source instead of an in-memory StringIO
- No changes to API endpoints, models, or schemas — this is purely an internal refactor of the worker's file reading

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

*Phase: 51-memory-safety-streaming*
*Context gathered: 2026-03-28*
