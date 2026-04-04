# Phase 62: Resilience & Cancellation - Research

**Researched:** 2026-04-03
**Domain:** Parallel import resilience, cancellation propagation, and concurrent upsert safety
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Failure isolation and parent outcome
- **D-01:** A failed chunk stays failed without forcing sibling chunks to stop; successful chunks are preserved for parent fan-in.
- **D-02:** Parent outcome remains deferred to the existing Phase 61 finalizer rather than introducing eager parent failure on the first chunk error.
- **D-03:** Chunk-local error details continue to live on the chunk record and merged parent artifact; Phase 62 should not invent a second error surface.

### Cancellation propagation
- **D-04:** The parent `cancelled_at` field remains the single cancellation signal for both queued and in-flight chunk workers.
- **D-05:** Queued chunk workers should skip execution entirely when the parent is already cancelled and mark the chunk `CANCELLED`, not `FAILED`.
- **D-06:** In-flight chunk workers should stop only at the next durable batch boundary so already-committed rows remain preserved.
- **D-07:** A cancelled chunk is a terminal chunk outcome that contributes to the existing parent finalization logic instead of bypassing it.

### Crash resume model
- **D-08:** Retries reuse the same `ImportChunk` row and resume from that chunk's own `last_committed_row`; no replacement chunk rows are created for retries.
- **D-09:** Chunk retries must preserve already-imported rows from prior committed batches and only process rows after the chunk-local checkpoint.
- **D-10:** Chunk startup should recognize both queued and previously-processing retry states without resetting counters for resumable chunks.

### Deadlock prevention
- **D-11:** Each batch upsert must sort voter rows deterministically by the voter conflict key before issuing `INSERT ... ON CONFLICT`.
- **D-12:** The same deterministic ordering policy should apply before bulk `VoterPhone` upserts when phone records are still written inline in Phase 62.
- **D-13:** Deadlock hardening should happen inside the existing batch-processing path rather than introducing worker-level coordination or global locking.

### Carry-forward constraints
- **D-14:** Phase 61’s lock-guarded parent finalizer remains the sole authority for terminal parent status, aggregate counters, and merged error artifacts.
- **D-15:** Phase 62 must not pull forward secondary-work offloading from Phase 63 or throughput UI work from Phase 64.

### the agent's Discretion
- Exact helper boundaries for cancellation checks and chunk retry-state detection, as long as the source of truth remains the parent/chunk records.
- Exact sort-key implementation details for voters and phones, as long as ordering is deterministic and aligned with the actual conflict target.
- Exact retry-state transitions around `QUEUED` versus `PROCESSING`, as long as resumable chunks do not lose committed progress.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Moving phone creation or geometry updates out of the batch path — Phase 63.
- Throughput/ETA UI and partial-failure presentation — Phase 64.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESL-01 | Individual chunk failure does not block other chunks; partial results are preserved | Keep chunk-local failure recording in [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py) and finalize only through [`ImportService.maybe_finalize_chunked_import()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py); add regression tests for mixed outcomes. |
| RESL-02 | Cancellation propagates to all in-flight and queued chunks via parent's `cancelled_at` check | Add queued preflight cancel skip in chunk task, batch-boundary cancel refresh in ranged processing, and parent-finalizer coverage for cancelled chunks. |
| RESL-03 | Each chunk resumes from its own `last_committed_row` after worker crash | Reuse the same `ImportChunk` row, preserve counters on resumable queued/processing chunks, and extend chunk tests to prove resume starts after chunk-local checkpoint. |
| RESL-04 | Batch upserts sort rows by conflict key before `INSERT` to prevent cross-chunk deadlocks | Sort voter and phone upsert inputs in [`process_csv_batch()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py) and add deterministic-order unit tests plus concurrent integration coverage. |
</phase_requirements>

## Summary

The core import design is already close to the Phase 62 target. Failure isolation is mostly present: child workers already fail their own `ImportChunk` without failing the parent, chunk counters already persist on the chunk row, and the Phase 61 finalizer already fan-ins chunk terminal states under an advisory lock. The missing work is concentrated in three places: chunk-specific cancellation, chunk retry/resume coverage, and deterministic ordering inside the batch upsert path.

The highest-value implementation path is to keep all resilience logic inside the existing seams instead of adding new orchestration. Use the parent `cancelled_at` field as the only signal, enforce it in the chunk task before work starts and in the shared ranged engine after each committed batch, and let the existing finalizer publish the parent terminal state. For deadlocks, fix ordering where locks are actually acquired: inside `process_csv_batch()`, before both voter and inline phone upserts.

**Primary recommendation:** Implement Phase 62 as three slices inside the current task/service code: `chunk cancel propagation`, `same-row chunk resume`, and `deterministic batch ordering`, then verify with focused unit coverage plus one concurrent integration path.

## Project Constraints (from CLAUDE.md)

- Use `uv` for Python commands and package management.
- Target Python 3.13.
- Lint/test commands are `uv run ruff check .`, `uv run ruff format .`, and `uv run pytest`.
- Async SQLAlchemy + PostgreSQL/PostGIS is the current backend stack.
- Do not recommend pulling Phase 63 secondary-work offloading into this phase.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.13.5 | Runtime | Matches repo requirement and installed local runtime. |
| FastAPI | 0.135.3 | API/task host | Current installed app framework. |
| SQLAlchemy | 2.0.48 | Async ORM and PostgreSQL upserts | Existing import path is built on dialect `insert(...).on_conflict_do_update(...)`. |
| PostgreSQL | 16.x semantics | Locking and `ON CONFLICT` behavior | Deadlock reduction depends on consistent row lock order. |
| Procrastinate | 3.7.3 | Background task execution | Current parent/chunk work is already scheduled through Procrastinate tasks. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | 9.0.2 | Unit/integration verification | All new resilience coverage should land here. |
| pytest-asyncio | 1.3.0+ | Async test execution | Needed for chunk worker and import service tests. |

**Version verification:** Verified locally with `uv run python` and `uv run pytest --version` on 2026-04-03.

## Architecture Patterns

### Recommended Project Structure

```text
app/tasks/import_task.py         # parent/chunk task entrypoints and task-state transitions
app/services/import_service.py   # batch engine, cancellation checks, ordering, fan-in
app/models/import_job.py         # durable parent/chunk state contract; no schema change expected
tests/unit/test_import_task.py   # queued-cancel + chunk retry-state tests
tests/unit/test_import_service.py # ranged-engine cancel/resume/order tests
tests/integration/test_import_parallel_processing.py # concurrent chunk fan-in/cancel cases
tests/unit/test_import_cancel.py # serial cancellation baseline; align semantics
```

### Pattern 1: Parent-Driven Chunk Cancellation

**What:** Use the parent `ImportJob.cancelled_at` as the single source of truth for both queued and in-flight chunk workers.

**When to use:** Every chunk start and after every committed chunk batch.

**Concrete file targets:**
- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)

**Implementation notes:**
- In `process_import_chunk()`, refresh/read the parent before setting the chunk to `PROCESSING`; if `job.cancelled_at` is already set, mark the chunk `CANCELLED`, persist it, and call `maybe_finalize_chunked_import()`.
- In `process_import_range()`, apply the same batch-boundary check used by the serial path to chunk targets as well. The current code only refreshes `job.cancelled_at` for serial imports.
- When a chunk sees cancellation after a committed batch, stop processing without clearing committed counters and mark the chunk `CANCELLED`, not `COMPLETED` or `FAILED`.

### Pattern 2: Same-Row Chunk Resume

**What:** Resume a chunk from `ImportChunk.last_committed_row` using the same row record and without resetting imported/skipped/phone counters.

**When to use:** Any retry/requeue path where the chunk already has committed progress.

**Concrete file targets:**
- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)

**Implementation notes:**
- Treat `last_committed_row > 0` on a chunk as resumable state when the chunk is `QUEUED` or `PROCESSING`.
- Keep `process_import_range()` as the source of truth for counter reset behavior; it already skips resetting when `last_committed_row > 0`.
- Do not create replacement chunk rows for retries; parent fan-in depends on one durable chunk identity.

### Pattern 3: Deterministic Upsert Ordering

**What:** Sort batch inputs by the actual conflict keys before issuing multi-row `INSERT ... ON CONFLICT`.

**When to use:** Right before the voter upsert and the inline `VoterPhone` upsert.

**Concrete file targets:**
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)

**Implementation notes:**
- Build a single sortable structure per valid row, for example `(campaign_id, source_type, source_id, voter_payload, phone_value)`, generate any missing `source_id` first, then sort once and derive `valid_voters` plus phone metadata from that sorted structure.
- For phone upserts, sort `phone_records` by the actual uniqueness surface `(campaign_id, voter_id, value)`.
- Do not sort `valid_voters` and `phone_values` independently; that will corrupt voter-phone pairing.
- Prefer returning both voter id and stable key from the voter upsert and joining by key instead of relying on positional `RETURNING` row order.

### Anti-Patterns to Avoid

- **Queue-level cancellation state:** Do not add a second cancellation mechanism in Procrastinate when `cancelled_at` on the parent already exists.
- **Eager parent failure:** Do not fail the parent on first chunk error; that breaks D-01/D-02 and discards useful work.
- **Replacement chunk rows on retry:** This would make fan-in ambiguous and risks duplicate aggregation.
- **Global serialization locks for deadlocks:** PostgreSQL guidance favors consistent lock order; global locking would sacrifice the throughput gains Phase 60 introduced.

## Recommended Implementation Slices

### Slice 1: Chunk cancellation semantics

**Target behavior**
- Queued chunk + cancelled parent => chunk exits immediately as `CANCELLED`.
- In-flight chunk + parent cancelled between batches => chunk preserves committed work, stops after the next boundary, and finishes `CANCELLED`.
- Parent finalizer remains the only place that publishes parent terminal state.

**Files**
- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py)
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)
- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)

### Slice 2: Chunk crash-resume hardening

**Target behavior**
- Retrying a chunk with `last_committed_row > 0` reuses the same chunk record.
- Already-committed rows are skipped.
- Successful retries preserve chunk counters and previously written row data.

**Files**
- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)
- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)

### Slice 3: Deterministic ordering in the batch path

**Target behavior**
- Concurrent chunks touching overlapping voter keys acquire row locks in a stable order.
- Inline phone writes use the same principle.

**Files**
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)
- [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parent/chunk terminal coordination | New orchestration layer | Existing `maybe_finalize_chunked_import()` lock-guarded fan-in | Phase 61 already solved exactly-once parent finalization. |
| Cancellation propagation | Queue metadata or per-worker flags | Parent `cancelled_at` checks at task start and batch boundaries | One durable signal is simpler and already user-facing. |
| Deadlock avoidance | Global mutex or serialized worker execution | Deterministic input ordering before `ON CONFLICT` writes | Preserves parallelism and follows PostgreSQL locking guidance. |
| Retry bookkeeping | New retry tables | Existing `ImportChunk.last_committed_row` and counters | The chunk row already stores the durable checkpoint. |

**Key insight:** Phase 62 is a seam-hardening phase, not an architecture phase. Most of the required durability fields and fan-in behavior already exist.

## Common Pitfalls

### Pitfall 1: Marking cancelled chunks as completed

**What goes wrong:** A chunk sees parent cancellation after a successful batch commit, exits the loop, and then falls through to the unconditional chunk `COMPLETED` path.

**How to avoid:** Make cancellation an explicit chunk terminal branch in `process_import_range()` and preserve existing counters.

### Pitfall 2: Resetting resumable chunk counters

**What goes wrong:** Retry startup clears `imported_rows`, `skipped_rows`, `phones_created`, or `last_committed_row`, causing duplicate work and wrong parent aggregation.

**How to avoid:** Let `last_committed_row > 0` suppress reset logic for chunk targets just like the serial recovery path already does.

### Pitfall 3: Breaking voter-phone alignment during sort

**What goes wrong:** Sorting voters and phones separately associates phone numbers with the wrong `voter_id`.

**How to avoid:** Sort a combined structure once, then derive both upsert payloads from that ordered structure.

### Pitfall 4: Leaving parent cancellation mapped to `FAILED`

**What goes wrong:** If every chunk is cancelled, the current parent-status mapping can still collapse to `FAILED`.

**How to avoid:** Update the finalizer mapping to treat cancellation as its own terminal parent outcome when cancellation is the dominant result and `job.cancelled_at` is set.

## Code Examples

### Chunk cancel preflight

```python
await session.refresh(job)
if job.cancelled_at is not None:
    chunk.status = ImportChunkStatus.CANCELLED
    chunk.last_progress_at = utcnow()
    await commit_and_restore_rls(session, campaign_id)
    await service.maybe_finalize_chunked_import(
        session=session,
        storage=storage,
        job=job,
        campaign_id=campaign_id,
    )
    return
```

### Deterministic voter ordering

```python
ordered_rows = []
for result in mapped_results:
    voter = result["voter"]
    source_id = voter.get("source_id") or str(uuid.uuid4())
    voter["source_id"] = source_id
    ordered_rows.append((campaign_id, source_type, source_id, voter, result.get("phone_value")))

ordered_rows.sort(key=lambda item: (item[0], item[1], item[2]))
valid_voters = [item[3] for item in ordered_rows]
phone_values = [item[4] for item in ordered_rows]
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Implicit batch order from CSV stream | Explicit sort by conflict key before `ON CONFLICT` | Reduces cross-chunk deadlock probability. |
| Serial-only cancel checks | Shared cancel semantics for serial and chunked paths | Makes user cancellation predictable in parallel mode. |
| Parent-only crash resume | Parent + chunk-local checkpoint resume | Preserves chunk progress after worker interruption. |

## Open Questions

1. **How should the parent finalizer map all-cancelled or mixed completed/cancelled outcomes?**
   - What we know: the current finalizer already counts cancelled chunks, but its status mapping still collapses all non-completed chunks into failure.
   - Recommendation: Phase 62 should update `_determine_chunked_parent_status()` so `job.cancelled_at` can yield a truthful parent terminal status while preserving partial success semantics.

2. **Should chunk retries be automatic or only resumable when retried?**
   - What we know: the phase requirement is about safe resume on retry, not about inventing a new recovery scheduler.
   - Recommendation: implement resumability now; keep automatic stalled-chunk reconciliation as separate operational work unless planning explicitly expands scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | all Python commands | ✓ | 0.8.14 | none |
| `pytest` via `uv run pytest` | unit/integration validation | ✓ | 9.0.2 | none |
| Docker | local integration environment | ✓ | 29.3.1 | none |
| PostgreSQL on `:5433` | integration tests that need DB services | ✗ | — | start local stack with `docker compose up -d` |

**Missing dependencies with no fallback:**
- Live Postgres on `5433` is not running, so DB-backed integration coverage cannot run until the compose stack is up.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio |
| Config file | [`pyproject.toml`](/home/kwhatcher/projects/civicpulse/run-api/pyproject.toml) |
| Quick run command | `uv run pytest tests/unit/test_import_task.py tests/unit/test_import_service.py tests/unit/test_import_cancel.py -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESL-01 | failed chunk does not stop successful siblings; parent preserves partial results | unit + integration | `uv run pytest tests/unit/test_import_task.py -k chunk_marks_only_chunk_failed tests/integration/test_import_parallel_processing.py -k partial_success -q` | ✅ extend existing |
| RESL-02 | queued chunks skip on cancelled parent; in-flight chunks stop at next batch boundary; parent finalizes through fan-in | unit + integration | `uv run pytest tests/unit/test_import_cancel.py tests/unit/test_import_task.py tests/unit/test_import_service.py -k cancel -q` | ✅ extend existing |
| RESL-03 | chunk retry resumes from chunk `last_committed_row` without resetting counters | unit + integration | `uv run pytest tests/unit/test_import_service.py tests/integration/test_import_parallel_processing.py -k resume -q` | ⚠️ add chunk-specific cases |
| RESL-04 | voter and phone upserts are deterministically ordered before bulk insert | unit + integration | `uv run pytest tests/unit/test_import_service.py tests/integration/test_import_parallel_processing.py -k order -q` | ⚠️ add new cases |

### Wave 0 Gaps

- [ ] Add a unit test in [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py) for `process_import_chunk()` skipping a queued chunk when `job.cancelled_at` is already set.
- [ ] Add a unit test in [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) proving chunk-mode `process_import_range()` stops after the next committed batch and ends `CANCELLED`.
- [ ] Add a unit test in [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) proving a chunk with `last_committed_row > 0` and status `QUEUED`/`PROCESSING` resumes without counter reset.
- [ ] Add a unit test in [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py) that asserts the voter payload order and phone payload order are sorted by conflict keys before execution.
- [ ] Extend [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py) with one parent-cancel case covering one queued chunk and one in-flight chunk.

## Risks

- **Parent status drift:** If the finalizer is left unchanged, all-cancelled chunk imports may still surface as `FAILED` instead of `CANCELLED`.
- **Phone association bug during ordering:** Sorting without a stable voter-id mapping can attach a phone number to the wrong voter.
- **False confidence from unit-only coverage:** RESL-02 and RESL-04 both benefit from one concurrent integration path; unit tests alone will miss some race shape mistakes.
- **Scope creep into Phase 63:** Do not move phone creation out of the batch path here; only harden the current inline behavior.

## Sources

### Primary (HIGH confidence)

- Local phase context and requirements:
  - [`62-CONTEXT.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/phases/62-resilience-cancellation/62-CONTEXT.md)
  - [`REQUIREMENTS.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/REQUIREMENTS.md)
  - [`ROADMAP.md`](/home/kwhatcher/projects/civicpulse/run-api/.planning/ROADMAP.md)
- Current implementation:
  - [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
  - [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
  - [`app/models/import_job.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/import_job.py)
- Existing tests:
  - [`tests/unit/test_import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_task.py)
  - [`tests/unit/test_import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_service.py)
  - [`tests/unit/test_import_cancel.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_import_cancel.py)
  - [`tests/integration/test_import_parallel_processing.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_parallel_processing.py)
  - [`tests/integration/test_import_recovery_flow.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/integration/test_import_recovery_flow.py)
- PostgreSQL locking guidance: https://www.postgresql.org/docs/16/sql-lock.html
- Procrastinate retry semantics: https://procrastinate.readthedocs.io/en/stable/howto/advanced/retry.html
- SQLAlchemy ORM DML / upsert docs: https://docs.sqlalchemy.org/21/orm/queryguide/dml.html

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified from local runtime, `pyproject.toml`, and `uv.lock`.
- Architecture: HIGH - recommendations are direct extensions of the current import seams.
- Pitfalls: HIGH - based on current code paths plus PostgreSQL locking guidance.

**Research date:** 2026-04-03
**Valid until:** 2026-05-03
