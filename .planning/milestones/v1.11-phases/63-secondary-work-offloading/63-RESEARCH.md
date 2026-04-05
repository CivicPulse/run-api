# Phase 63: Secondary Work Offloading - Research

**Researched:** 2026-04-03
**Domain:** Import pipeline throughput, chunk lifecycle, post-chunk task orchestration
**Confidence:** HIGH

## User Constraints

- Focus only on Phase 63, especially `SECW-01` and `SECW-02`.
- Research against the current codebase, not archived phase history.
- Cover VoterPhone creation and geometry/derived-field updates moving out of the critical voter upsert path.
- Include implementation slices, concrete file targets, test strategy, risks, and a requirements-to-test map.

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python commands and `uv run pytest` for tests.
- Preserve the current stack: Python 3.13, FastAPI, async SQLAlchemy, PostgreSQL/PostGIS, Procrastinate.
- Keep RLS handling intact: import tasks set campaign context before querying and use `commit_and_restore_rls`.
- Follow Ruff formatting/linting conventions already configured in the repo.

## Summary

The current chunk hot path still does three writes in one batch transaction: voter upsert, `geom` update, and `VoterPhone` upsert. That work is centralized in [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py#L1022), and chunk completion/fan-in still assumes the chunk is fully done as soon as [`process_import_range()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py#L1480) returns. In other words, Phase 60-62 made voter upserts parallel, but the expensive secondary writes are still blocking chunk completion.

Phase 63 should keep the voter upsert as the only critical-path DB write in the chunk worker, then defer two follow-up Procrastinate tasks per chunk: one for phones and one for geometry. The important constraint is lifecycle durability: parent finalization currently keys off chunk terminal state, so chunk completion cannot be marked until both secondary tasks are terminal too.

**Primary recommendation:** Add durable per-chunk secondary-work state plus a chunk-scoped work manifest, then finalize the chunk and parent only after phone and geometry tasks finish.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SECW-01 | VoterPhone creation runs as a separate post-chunk task instead of inline with voter upsert | Split phone preparation from voter upsert, persist chunk-scoped phone work, defer `process_import_chunk_phones`, aggregate `phones_created` only from that task |
| SECW-02 | Geometry and derived-field updates run as separate post-chunk tasks | Move `geom` update out of `process_csv_batch`, defer `process_import_chunk_geometry`, keep chunk non-terminal until geometry work finishes |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | Async ORM and bulk upserts | Already drives all import writes and conflict handling |
| Procrastinate | 3.7.3 | Background task queue | Existing import orchestration already uses it for parent/chunk fan-out |
| asyncpg | 0.31.0 | PostgreSQL driver | Existing bind-limit logic and async sessions assume it |
| GeoAlchemy2 | 0.18.4 | PostGIS model support | `Voter.geom` is already a PostGIS geometry column |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostgreSQL + PostGIS | repo standard | Upsert target and geometry functions | For voter writes and `ST_SetSRID/ST_MakePoint` updates |
| MinIO/S3 storage | repo standard | Import source and error reports | Keep using for CSV input and merged error artifacts |

## Current Code Findings

- Inline secondary work lives in [`process_csv_batch()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py#L1022). After voter upsert, it immediately runs the bulk `geom` update and `VoterPhone` upsert.
- Chunk progress and fan-in currently assume `phones_created` is produced during primary chunk processing in [`_process_single_batch()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py#L1374).
- Chunk terminal state is set inside [`process_import_range()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py#L1666) and parent fan-in happens in [`process_import_chunk()`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py#L207).
- Parent aggregation already sums `ImportChunk.phones_created` in [`maybe_finalize_chunked_import()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py#L1331), so `phones_created` can stay chunk-scoped if the phone task owns it.
- The only concrete derived-field work visible in the current import path is `geom`. I did not find other voter-derived import updates beyond geometry.

## Architecture Patterns

### Recommended Pattern: Primary Upsert First, Secondary Tasks After Commit

**What:** Keep `process_import_chunk()` responsible for primary voter upsert durability only, then defer follow-up tasks after the chunk's voter rows are committed.

**Why:** This shortens the critical path without weakening Phase 61/62 guarantees.

**Concrete shape:**

1. `process_csv_batch()` becomes primary-write only.
2. Primary path persists chunk-scoped secondary work items in the same transaction as the voter upsert.
3. `process_import_chunk()` defers:
   - `process_import_chunk_phones(chunk_id, campaign_id)`
   - `process_import_chunk_geometry(chunk_id, campaign_id)`
4. A helper finalizes the chunk only when both secondary task states are terminal.
5. Parent finalization remains in `maybe_finalize_chunked_import()`, but it must wait on overall chunk completion, not just primary completion.

### Recommended Pattern: Durable Chunk Work Manifest

**What:** Persist exact post-upsert work items keyed by chunk and voter rather than reconstructing them later from a second CSV pass.

**Use instead of:** Re-reading the CSV in secondary tasks and trying to rejoin rows back to voters.

**Why this is the safer fit here:**

- Current source-less rows get a generated `source_id` during primary processing, so a later CSV re-read cannot reliably reconstruct the same voter identity without additional changes.
- Recovery and retries are simpler when the phone/geom tasks consume durable chunk work rows rather than recomputing them.
- The manifest can be narrow: `chunk_id`, `campaign_id`, `voter_id`, `phone_value`, `needs_geom`.

## Recommended Implementation Slices

### Slice 1: Remove Inline Secondary Writes From `process_csv_batch`

**Goal:** Make the primary batch path do voter upsert only.

**File targets:**

- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)

**Changes:**

- Refactor `process_csv_batch()` so it no longer executes:
  - the `geom` `UPDATE voters ... WHERE id = ANY(:ids)`
  - the `VoterPhone` upsert
- Have it return a secondary-work payload summary or persist work items before commit.
- Keep voter conflict-key ordering unchanged.

### Slice 2: Add Durable Secondary-Work State Per Chunk

**Goal:** Distinguish "primary voter upsert done" from "chunk fully done."

**File targets:**

- [`app/models/import_job.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py)
- new Alembic migration
- optionally new model file for chunk work items

**Recommended schema additions:**

- On `ImportChunk`:
  - `phone_task_status`
  - `geometry_task_status`
  - `phone_task_error`
  - `geometry_task_error`
  - optional `secondary_enqueued_at`
- New durable work-item storage:
  - one new table or model for chunk-scoped post-upsert work rows

**Reason:** Without separate secondary state, the current `ImportChunk.status` becomes terminal too early and parent fan-in can close the import before phones/geometry finish.

### Slice 3: Add Post-Chunk Tasks and Delay Chunk Finalization

**Goal:** Offload phones and geometry to their own retryable tasks.

**File targets:**

- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py)
- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)

**Changes:**

- Keep `process_import_chunk()` as the primary-upsert task.
- After primary commit, defer:
  - `process_import_chunk_phones`
  - `process_import_chunk_geometry`
- Add a helper that marks the chunk terminal only after both secondary tasks finish; with the current enum that means `COMPLETED` only when both succeed, otherwise `FAILED` or `CANCELLED`.
- Move the call to `maybe_finalize_chunked_import()` so it runs after chunk-wide completion, not immediately after primary range work.

### Slice 4: Preserve Counters and Finalization Semantics

**Goal:** Keep Phase 61 aggregation valid after moving `phones_created`.

**File targets:**

- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)

**Changes:**

- `phones_created` should be incremented only by the phone task.
- Parent finalization should still sum `ImportChunk.phones_created`.
- Geometry task should not mutate import counts; it only affects chunk/task completion state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chunk follow-up coordination | Ad-hoc in-memory "done" flags | Durable chunk task-status fields in the DB | Retries and concurrent workers need persistent state |
| Secondary task input | Reconstructed voter matching from a second CSV parse | Chunk-scoped durable work manifest | Current generated `source_id` behavior makes replay matching brittle |
| Import completion | Parent completion from primary chunk termination | Parent completion from overall chunk completion | Otherwise SECW tasks can still be running after parent says complete |

## Common Pitfalls

### Pitfall 1: Parent Finalizes Before Secondary Tasks Finish

**What goes wrong:** The parent import becomes terminal while phones or geometry are still queued/running.

**Why it happens:** Current fan-in only looks at `ImportChunk.status`.

**How to avoid:** Keep chunk non-terminal until both secondary task states are terminal.

### Pitfall 2: Replaying CSV Rows Cannot Reattach to Source-Less Voters

**What goes wrong:** Secondary tasks cannot reliably find the voter row they should update.

**Why it happens:** `process_csv_batch()` currently generates missing `source_id` values at write time.

**How to avoid:** Persist exact post-upsert work items tied to `voter_id`.

### Pitfall 3: `phones_created` Drifts From Real Secondary Task Results

**What goes wrong:** Parent summary shows phone counts from primary work even though phone creation moved out of band.

**Why it happens:** `_process_single_batch()` currently increments `total_phones_created` inline.

**How to avoid:** Remove phone counting from the primary path; update `ImportChunk.phones_created` only in the phone task.

### Pitfall 4: Geometry Task Changes Semantics

**What goes wrong:** Offloaded geometry backfill clears or overwrites `geom` differently than today.

**Why it happens:** The current inline update only sets `geom` for voters that have both `latitude` and `longitude`.

**How to avoid:** Preserve current semantics exactly for Phase 63; do not introduce null-clearing behavior unless explicitly planned.

## Test Strategy

### Fast Unit Coverage

- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)
  - prove `process_csv_batch()` no longer issues inline phone or geometry SQL
  - prove primary path emits or persists secondary work items
  - prove parent finalization waits for secondary task completion
- [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py)
  - prove `process_import_chunk()` defers both secondary tasks
  - prove parent finalization is not called early
  - prove phone/geometry tasks are idempotent on retry

### Integration Coverage

- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)
  - successful chunk primary work followed by successful phone + geometry tasks
  - one secondary task failing on one chunk yields partial-success parent finalization
  - cancellation while secondary tasks are queued or running does not re-open completed chunks

## Requirements To Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SECW-01 | Chunk worker defers VoterPhone creation to a post-chunk task and does not upsert phones inline | unit | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x -q` | Yes |
| SECW-01 | Parent `phones_created` reflects phone-task results, including partial chunk failures | integration | `uv run pytest tests/integration/test_import_parallel_processing.py -x -q` | Yes |
| SECW-02 | Chunk worker defers geometry updates to a post-chunk task and does not run inline `geom` SQL | unit | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x -q` | Yes |
| SECW-02 | Parent import does not finalize until geometry task reaches a terminal state for every chunk | integration | `uv run pytest tests/integration/test_import_parallel_processing.py -x -q` | Yes |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | all Python commands/tests | Yes | 0.8.14 | — |
| Docker | local Postgres/MinIO/worker stack | Yes | 29.3.1 | — |
| `uv run pytest` | unit/integration verification | Yes | via project env | — |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | [`pyproject.toml`](/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml) |
| Quick run command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py -x -q` |
| Full phase command | `uv run pytest tests/unit/test_import_service.py tests/unit/test_import_task.py tests/integration/test_import_parallel_processing.py -x` |

### Wave 0 Gaps

- Add unit assertions that no inline phone or geometry SQL is emitted from `process_csv_batch()`.
- Add unit coverage for the new secondary-task status fields and finalization helper.
- Extend integration coverage so chunk fan-in includes post-chunk task completion, not just primary range completion.

## Risks

- Adding secondary task state without a durable work manifest will make retries fragile.
- If chunk completion is still driven by `process_import_range()` return, Phase 61 parent finalization will race ahead of SECW tasks.
- If the phone task recomputes phone values from CSV instead of consuming durable work items, source-less rows become ambiguous.
- If geometry work is made "best effort" without chunk/task status changes, failures will be invisible to parent status and tests.

## Open Questions

1. **Should Phase 63 implement only `geom`, or a generic "derived field" task seam?**
   - What we know: the current import path only shows `geom` as a derived update.
   - Recommendation: ship the task seam generically, but only implement `geom` work in this phase.

2. **Should chunk work items live in `import_job.py` or a new model file?**
   - What we know: `ImportChunk` already lives in [`app/models/import_job.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py).
   - Recommendation: if the manifest model stays import-specific, co-locate it there; if it grows beyond one table, split into a dedicated model file.

## Sources

### Primary

- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/models/import_job.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py)
- [`app/models/voter.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/voter.py)
- [`app/models/voter_contact.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/voter_contact.py)
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)
- [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py)
- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)
- [`CLAUDE.md`](/home/kwhatcher/projects/civicpulse/run-api/CLAUDE.md)
- [`AGENTS.md`](/home/kwhatcher/projects/civicpulse/run-api/AGENTS.md)
- [`\.planning/ROADMAP.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/ROADMAP.md)
- [`\.planning/REQUIREMENTS.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/REQUIREMENTS.md)
- [`\.planning/STATE.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/STATE.md)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - verified from `pyproject.toml` and installed package versions
- Architecture: HIGH - derived directly from current import task/service flow and existing tests
- Pitfalls: HIGH - each is tied to a visible current code path or current status/counter contract

**Valid until:** 2026-05-03
