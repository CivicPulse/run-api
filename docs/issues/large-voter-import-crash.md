# Large Voter Import Causes Pod Crash

**Date discovered:** 2026-03-28
**Severity:** Medium — workaround available (import smaller files)
**Affected component:** `app/services/import_service.py` + `app/api/v1/imports.py`

## Symptoms

- Uploading a CSV with ~113K rows (30MB) through the voter import wizard causes the API pod to crash (exit code 3, restart count 2+)
- The progress bar stays at 0% and the status polling endpoint starts returning errors
- No voters are imported from the large file
- The pod recovers on its own after restart, existing data is unaffected

## Root Cause

The import pipeline is fully synchronous within a single HTTP request:

1. Frontend uploads the entire CSV to MinIO
2. Frontend calls `POST /api/v1/campaigns/{id}/imports/{jobId}/run`
3. The endpoint reads the entire CSV into memory, processes all rows in batches, and returns the result
4. For 113K rows with 55 columns, this exceeds the pod's resource limits (512MB memory, 500m CPU) and/or the request timeout

The processing pipeline per batch (`process_csv_batch` in `import_service.py:~730`) does:
- Row mapping and validation
- Bulk INSERT with ON CONFLICT (upsert)
- Post-insert UPDATE for PostGIS geometry computation
- Phone number normalization and VoterPhone record creation

With 113K rows at the default batch size, this creates sustained memory pressure and long-running database transactions.

## Workaround

Import the data in smaller files. The example file (552 rows, 149KB) imports successfully in seconds. Files under ~10K rows should work within current resource limits.

## Proposed Fix

Convert the import from synchronous request-response to background task processing:

### Option A: Server-side background task (recommended)
- `POST .../imports/{jobId}/run` immediately returns 202 Accepted
- Import runs in a background asyncio task (or Celery/ARQ worker)
- Frontend polls `GET .../imports/{jobId}` for progress (already implemented)
- Batches are committed independently so partial progress survives crashes

### Option B: Increase pod resources + streaming
- Increase memory limit to 1GB+ and CPU to 1000m
- Stream CSV parsing instead of loading entire file into memory
- Add request timeout extension for long imports

### Option C: Client-side chunking
- Frontend splits the CSV into chunks (e.g., 5K rows each)
- Uploads and processes each chunk as a separate import job
- Most complex frontend changes, but no backend changes needed

## Relevant Files

- `app/services/import_service.py` — `process_csv_batch()`, `_run_import()`
- `app/api/v1/imports.py` — `run_import()` endpoint
- `k8s/apps/run-api-prod/deployment.yaml` — resource limits (512MB/500m)

## Environment

- Pod: `run-api-7d5585bff9-j6269` in `civpulse-prod`
- Image: `ghcr.io/civicpulse/run-api:sha-778e907`
- File: `data/full-2026-02-24.csv` (113,851 rows, 30MB)
- Exit code 3 after ~30s of processing, 0 rows imported
