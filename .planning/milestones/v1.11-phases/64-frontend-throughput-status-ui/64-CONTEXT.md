# Phase 64: Frontend Throughput & Status UI - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose faster-import outcomes clearly to users without surfacing chunk internals. This phase covers client-side throughput and ETA metrics in the import progress UI, first-class `completed_with_errors` handling across the wizard and import history, and a consistent API/UI contract for downloading merged error reports. Backend runtime changes to import execution are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Status handling
- **D-01:** Treat `completed_with_errors` as a terminal frontend status everywhere polling, step derivation, and badges reason about imports.
- **D-02:** Partial success needs its own warning-style presentation rather than reusing success or failure visuals.

### Progress metrics
- **D-03:** Derive throughput and ETA on the client from `created_at`, `last_progress_at`, `total_rows`, and `imported_rows`.
- **D-04:** Hide ETA until progress data is meaningful instead of showing unstable or misleading numbers.

### Error-report access
- **D-05:** Stop overloading `error_report_key` with a signed URL; expose a dedicated `error_report_url` field from the API.
- **D-06:** History rows may offer direct download only when they have a usable browser URL.

### Carry-forward constraints
- **D-07:** Preserve the existing import wizard flow and 3-second polling model.
- **D-08:** Keep chunking as an internal implementation detail; the UI remains parent-import only.

### the agent's Discretion
- Exact helper boundaries for status normalization and progress metrics.
- Exact warning copy and visual treatment, as long as partial success is clearly distinct and accessible.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` — Active roadmap entry for Phase 64 scope and success criteria.
- `.planning/REQUIREMENTS.md` — Active requirement IDs `PROG-04` and `PROG-05`.
- `.planning/phases/64-frontend-throughput-status-ui/64-RESEARCH.md` — Recommended frontend and API slices.
- `app/schemas/import_job.py` — Import response contract that currently overloads `error_report_key`.
- `app/api/v1/imports.py` — Detail/list endpoints for import status and history.
- `web/src/types/import-job.ts` — Frontend import status/type contract.
- `web/src/hooks/useImports.ts` — Polling, terminal-status logic, and wizard step restoration.
- `web/src/components/voters/ImportProgress.tsx` — Progress display surface for throughput and ETA.
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` — Wizard completion UI.
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx` — Import history UI and status badges.

</canonical_refs>

<specifics>
## Specific Ideas

- Add one shared terminal-status helper in the import hooks module and reuse it from polling plus wizard step derivation.
- Introduce a small pure metrics helper so time math stays testable and out of the render path.
- Prefer human-readable status labels instead of raw enum values in the history table.

</specifics>

<deferred>
## Deferred Ideas

- Server-authored processing ETA fields.
- Chunk-level visibility or operator diagnostics in the UI.

</deferred>

---

*Phase: 64-frontend-throughput-status-ui*
*Context gathered: 2026-04-03*
