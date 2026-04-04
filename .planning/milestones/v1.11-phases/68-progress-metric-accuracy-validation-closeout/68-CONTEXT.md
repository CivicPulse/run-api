# Phase 68: Progress Metric Accuracy & Validation Closeout - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Mode:** Autonomous post-audit cleanup

<domain>
## Phase Boundary

Correct import throughput/ETA timing so it reflects actual processing time, then close the remaining Nyquist validation debt from Phases 59 and 60.

</domain>

<decisions>
## Implementation Decisions

- Add a durable `processing_started_at` timestamp on `ImportJob` rather than inferring processing start from `created_at`.
- Preserve existing frontend progress presentation but switch its metric basis to the new processing-start signal.
- Bring the legacy 59/60 validation strategy files up to the same frontmatter/compliance shape used by later phases instead of replacing them with one-off notes.

</decisions>

<code_context>
## Existing Code Insights

- `web/src/lib/import-progress.ts` currently derives throughput/ETA from `created_at`, which includes upload and queue time.
- `app/tasks/import_task.py` and `app/services/import_service.py` are the places where imports first transition into real processing.
- `59-VALIDATION.md` and `60-VALIDATION.md` exist, but only Phase 59 uses the current Nyquist frontmatter contract and it is still marked non-compliant.

</code_context>

<specifics>
## Specific Ideas

- Add direct frontend tests for the corrected ETA and for the null-metric fallback when no processing-start timestamp exists.
- Add backend evidence that the processing-start timestamp is populated when import processing begins.

</specifics>

<deferred>
## Deferred Ideas

- Backfilling `processing_started_at` for already historical imports created before this schema change.

</deferred>
