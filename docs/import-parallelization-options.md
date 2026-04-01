# Import Parallelization Options

## Live Check

Observed on `2026-04-01` against `https://run.civpulse.org` after importing `/home/kwhatcher/Downloads/old/full-2026-03-11.csv` into test campaign `7a217884-f3c7-40d7-947a-b1c96c5ac7fa`:

- import job: `5d0a86d0-e59e-4992-a767-6e9ac795b3c3`
- status: `completed`
- total rows: `113,851`
- imported rows: `113,851`
- skipped rows: `0`
- phones created: `49,646`
- last committed row: `113,851`
- error message: `null`

This confirms the current background import path can complete a large file in the current dev environment. Increasing worker count would increase total throughput across jobs, but it would not materially speed up a single import because one import currently runs as one serial background task.

## Current Constraint

Today a single import is processed by one `process_import` task, and the file is handled serially in batches inside `ImportService.process_import_file()`. The enqueue path also uses a per-campaign queueing lock, so one campaign cannot run multiple imports concurrently.

## Options

### 1. Parallelize secondary work only

Keep the main voter-row import serial, but move expensive follow-up work into separate tasks after each committed batch.

Examples:

- phone normalization and `VoterPhone` creation
- geometry or derived-field updates
- denormalized analytics counters

Pros:

- lowest-risk change
- preserves current resume and commit behavior
- easy to roll out incrementally

Cons:

- voter row ingestion is still serial
- eventual consistency between voters and secondary tables

Recommendation:

- best first step if the goal is to reduce batch latency without rewriting the import model

### 2. Chunk one import into multiple child jobs

Split one file into chunk ranges and process those chunks in parallel worker tasks.

How it works:

- create a parent import job
- derive child chunk jobs such as `1-10000`, `10001-20000`, and so on
- enqueue one task per chunk
- aggregate progress into the parent job

Pros:

- real speedup for one large CSV
- scales horizontally with more worker pods
- failures are isolated to individual chunks

Cons:

- requires new chunk state and aggregation logic
- retry and idempotency need to be designed carefully
- more complex progress reporting

Recommendation:

- strongest option if the product requirement is "make one large import finish materially faster"

### 3. Build a producer-consumer pipeline

Separate CSV parsing from DB writing.

How it works:

- one producer streams and parses CSV rows into normalized payload batches
- multiple consumers write batches to the database
- optional downstream consumers process phones or derived data

Pros:

- better CPU utilization
- clear separation between parsing and persistence
- good long-term architecture if imports keep growing

Cons:

- significantly more complexity
- needs durable intermediate state or queue payload design
- harder to keep resume behavior simple

Recommendation:

- appropriate if imports become a core workload, not just an occasional admin action

### 4. Use staging tables and database-native bulk load

Load the CSV into a staging table with `COPY`, then transform from staging into application tables.

How it works:

- upload CSV
- bulk load raw rows into a staging table
- run SQL transforms and upserts into `voters`
- run separate SQL for phones and other derived records

Pros:

- usually the fastest option for very large files
- shifts heavy work into Postgres where bulk operations are efficient
- reduces Python per-row overhead

Cons:

- largest behavior change
- more SQL-heavy implementation
- validation and per-row error reporting become more complex

Recommendation:

- best when import throughput becomes a platform-level concern and SQL-heavy maintenance is acceptable

## Suggested Sequence

1. Parallelize secondary work first.
2. If that is not enough, move to chunked child jobs for one import.
3. Consider producer-consumer or staging-table redesign only if import volume justifies the operational complexity.

## File Targets For Future Work

- `/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py`
- `/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py`
- `/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/imports.py`
- potential new models or tables for chunk state and aggregation

