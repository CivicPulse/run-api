# Import Recovery Patch Plan

## Problem

Production import job `9237f09a-cdae-4132-bbe9-d84ab8a2758e` is stuck in `PROCESSING` after a worker rollout.

Observed state:

- Uploaded CSV in object storage has about `113,851` data rows.
- `import_jobs` row shows:
  - `status = PROCESSING`
  - `total_rows = 90,522`
  - `imported_rows = 90,522`
  - `skipped_rows = 0`
  - `last_committed_row = 90,522`
- Procrastinate queue row is still `doing`.
- The owning Procrastinate worker heartbeat is stale.

This means the importer processed part of the file, then the worker died or was replaced, and the job was never reclaimed or finalized.

## Goal

Make import processing crash-safe across worker restarts, deploy rollouts, and pod eviction.

Desired outcome:

- orphaned import tasks are detected and reclaimed
- resumed imports continue from `last_committed_row`
- completed imports always transition to `COMPLETED`
- interrupted imports do not remain forever in `PROCESSING`
- queue state and import job state converge

## Root Cause Hypothesis

The current logic supports resume only when a task is actively invoked again:

- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)

But there is no recovery path for:

1. Procrastinate job row left in `doing`
2. worker heartbeat stale
3. matching `import_jobs` row left in `PROCESSING`

So the queue thinks the task is still owned, while the worker is gone, and no new worker reclaims it.

## Patch Plan

### 1. Add explicit orphan detection for import jobs

Implement a recovery query that finds imports where:

- `import_jobs.status = PROCESSING`
- matching Procrastinate job is `doing`
- worker heartbeat is older than a configured timeout or missing

Create a helper in a focused location, likely:

- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py), or
- a new helper module such as `app/tasks/import_recovery.py`

The helper should return enough metadata to:

- identify the `import_job_id`
- identify the `campaign_id`
- identify the stale queue job row
- identify last committed progress

### 2. Requeue or reclaim orphaned import tasks safely

Add a startup or periodic recovery loop in the worker process that:

- scans for orphaned import tasks
- resets the Procrastinate job from `doing` to a runnable state, or enqueues a replacement task
- preserves idempotency by using `import_job_id` + `campaign_id`

Rules:

- never restart imports already marked `COMPLETED`, `FAILED`, `CANCELLED`
- only reclaim imports whose worker heartbeat is definitively stale
- avoid duplicate concurrent execution of the same import

Preferred approach:

- enqueue a fresh `process_import(import_job_id, campaign_id)` task
- mark old stale queue row as aborted/failed/retired if Procrastinate supports it cleanly

Fallback approach:

- directly reset stale queue rows to `todo`/equivalent status if supported and safe

### 3. Add an import-level lease/heartbeat guard

Queue heartbeat alone is not enough. Add import-level ownership metadata to `import_jobs`, for example:

- `worker_instance_id`
- `processing_started_at`
- `last_progress_at`

Update `last_progress_at` after each committed batch.

This gives the app a queue-independent signal for:

- job is actively making progress
- job is stalled
- job can be reclaimed

### 4. Finalize completed imports robustly

Patch [`process_import_file()`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py) so completion status is harder to lose.

Specifically:

- wrap final status transition in a narrow, well-logged block
- emit a clear log before and after marking `COMPLETED`
- if all rows are consumed and finalization fails, record a distinct error state instead of silently remaining `PROCESSING`

Also add a recovery rule:

- if `last_committed_row == total_rows`
- and source file EOF has already been reached
- and no active worker lease exists
- then finalize as `COMPLETED` during recovery

### 5. Reconcile queue state and import state

Add an invariant check:

- if queue says `doing` but worker heartbeat is stale, import cannot remain active forever
- if import says `PROCESSING` but there is no live queue owner, import must be reclaimed or failed

Implement a reconciliation routine that runs:

- on worker startup
- optionally every N minutes in the worker

### 6. Add recovery logging and metrics

Add structured logs for:

- orphan detected
- stale worker heartbeat
- requeue/reclaim action taken
- resumed import from row N
- finalized import after recovery

This is needed so future incidents can be diagnosed from cluster logs alone.

### 7. Add tests

#### Unit tests

Add tests for:

- stale worker heartbeat detection
- requeue decision logic
- no reclaim when heartbeat is fresh
- no reclaim for completed/cancelled/failed jobs

Likely files:

- new tests under `tests/unit/`
- extend import-task tests if they already exist

#### Integration tests

Create a recovery test that simulates:

1. import starts
2. some batches commit
3. worker dies before completion
4. queue row remains stale
5. new worker startup triggers recovery
6. import resumes at `last_committed_row`
7. import reaches `COMPLETED`

#### Regression assertions

Verify:

- row count matches full file
- no duplicated voters after resume
- `skipped_rows` reflects real skips only
- queue row does not remain indefinitely `doing`

## Implementation Order

1. Add import/queue recovery helper and stale-worker detection.
2. Add worker startup recovery hook.
3. Add import-level progress timestamp/lease fields if needed.
4. Harden completion/finalization path.
5. Add unit tests.
6. Add crash-resume integration test.
7. Validate on a staging-like environment with a large CSV and forced worker restart.

## Suggested File Touches

- [`app/tasks/import_task.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/import_task.py)
- [`app/services/import_service.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/import_service.py)
- [`scripts/worker.py`](/home/kwhatcher/projects/civicpulse/run-api/scripts/worker.py)
- new helper module, likely `app/tasks/import_recovery.py`
- new migration if import lease/progress fields are added
- tests under `tests/unit/` and possibly integration coverage

## Rollout Notes

- Before deploying the patch, manually inspect and recover current stuck imports.
- After deploying, verify the worker startup logs show recovery scan results.
- Confirm the currently stuck production import either:
  - resumes from row `90,522`, or
  - finalizes if EOF had already been reached

## Immediate Follow-Up After Patch

Once code is merged:

1. Deploy updated worker and API.
2. Trigger recovery scan or restart worker once.
3. Verify import `9237f09a-cdae-4132-bbe9-d84ab8a2758e` leaves `PROCESSING`.
4. Compare final imported voter count to object row count.
