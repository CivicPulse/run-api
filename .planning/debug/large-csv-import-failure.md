---
status: awaiting_human_verify
trigger: "Large voter CSV imports are failing in production. The UI shows an error and the worker pod crashes (likely OOM)."
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T22:10:00Z
---

## Current Focus

hypothesis: CONFIRMED - process_import_chunk defer_async calls use positional args; procrastinate silently discards positional args and stores empty args {}
test: All 140 unit tests pass after fix
expecting: Deploy to production and retry a large import
next_action: Awaiting human verification that large imports work in production after deploy

## Symptoms

expected: Voter CSV imports of any size should complete successfully, processing all rows and updating the database.
actual: Large voter CSV imports fail. The UI shows an error message, and the background worker pod crashes (likely OOM kill).
errors: Worker pod crash/OOM + UI error on large imports.
reproduction: Upload a large voter CSV file via the import feature in production.
started: Unknown — needs investigation. Recent deploys may have introduced the issue.

## Eliminated

- hypothesis: Worker loads entire CSV into memory causing OOM
  evidence: stream_csv_lines() streams 64KB chunks; _process_single_batch processes in batches of ~1000 rows. Memory pattern is correct.
  timestamp: 2026-04-06T22:00:00Z

- hypothesis: Worker pod resource limits too low
  evidence: Worker has 512Mi limit. Worker is actually idle — never crashes because the chunk tasks fail instantly before processing any data.
  timestamp: 2026-04-06T22:00:00Z

## Evidence

- timestamp: 2026-04-06T22:00:00Z
  checked: Production import_jobs table
  found: Two 113,851-row imports stuck in PROCESSING. One 552-row import completed (used serial path, not chunks).
  implication: Issue is specific to chunked imports (>10,000 rows)

- timestamp: 2026-04-06T22:00:00Z
  checked: Production import_chunks table
  found: Both stuck imports have 178 chunks each. 4 QUEUED (0 imported), 174 PENDING. None ever processed.
  implication: Chunk workers never successfully executed

- timestamp: 2026-04-06T22:00:00Z
  checked: procrastinate.procrastinate_jobs table
  found: All 8 process_import_chunk jobs have args={} (empty). All 3 process_import jobs have correct args with keyword params.
  implication: chunk defer_async calls are losing their arguments

- timestamp: 2026-04-06T22:00:00Z
  checked: defer_async signature via inspect
  found: Signature is (*_: Args.args, **task_kwargs: Args.kwargs). Positional args go to throwaway *_, only kwargs populate job args.
  implication: Positional args are silently discarded by procrastinate

- timestamp: 2026-04-06T22:00:00Z
  checked: import_task.py line 220 and line 71
  found: process_import_chunk.defer_async(str(chunk.id), campaign_id) uses positional args. API endpoint at imports.py:349 correctly uses keyword args.
  implication: Bug is in import_task.py where defer_async is called with positional instead of keyword arguments

- timestamp: 2026-04-06T22:10:00Z
  checked: Unit tests after fix
  found: 23 import task tests pass, 117 total import-related unit tests pass
  implication: Fix is correct and no regressions

## Resolution

root_cause: All defer_async calls for process_import_chunk, process_import_chunk_phones, and process_import_chunk_geometry in app/tasks/import_task.py use positional arguments. Procrastinate's defer_async signature discards positional args (*_) and only stores keyword args (**task_kwargs) as the job's args JSON. This results in empty args={} in the database, causing chunk workers to fail instantly with missing argument errors. Small imports (<10,000 rows) use the serial path and are unaffected.
fix: Changed all 4 defer_async calls in import_task.py from positional to keyword arguments (chunk_id=..., campaign_id=...). Updated 2 test assertions that were checking the buggy positional arg pattern.
verification: 23 import task unit tests pass, 117 total import-related unit tests pass
files_changed: [app/tasks/import_task.py, tests/unit/test_import_task.py]
