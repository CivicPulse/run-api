# Phase 70: Reopened Import Restore Flow Closure - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Gap closure — audit-driven fix

<domain>
## Phase Boundary

Restore the uploaded-import reopen flow so the mapping wizard can resume with the detected-column payload and suggested mappings intact. When a user navigates to an import that's in `uploaded` status (from history or details), the wizard should hydrate step 2's column mapping state from the persisted job data rather than requiring a re-upload.

</domain>

<decisions>
## Implementation Decisions

### Frontend Contract Extension
- Add `detected_columns`, `suggested_mapping`, and `format_detected` to the `ImportJob` TypeScript interface (they already exist on the backend schema and model)
- The backend already returns these fields — no API changes needed

### Wizard State Restoration
- When the step-restore effect detects an `uploaded` job with `detected_columns` present, hydrate `detectedColumns`, `suggestedMapping`, `formatDetected`, and `mapping` state from the job data
- This mirrors the hydration logic already in `handleFileSelect` after detect-columns returns

### Claude's Discretion
- Exact placement of hydration logic (extend existing useEffect or add a new one)
- Whether to add a loading state while job data is being fetched for the restore case
- Test structure and organization

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useImportJob` hook in `web/src/hooks/useImports.ts` — already fetches the full job data
- `deriveStep()` in `web/src/hooks/useImports.ts` — maps status to wizard step
- `ImportDetectResponse` type already models the detect-columns shape
- Backend `ImportJobResponse` schema already includes `detected_columns`, `suggested_mapping`, `format_detected`

### Established Patterns
- Wizard state: `useState` hooks for `detectedColumns`, `suggestedMapping`, `formatDetected`, `mapping`
- Step restoration: `useEffect` at line 106 uses `deriveStep(status)` to navigate
- Hydration pattern: `handleFileSelect` at lines 148-158 shows how to hydrate state from detect response

### Integration Points
- `web/src/types/import-job.ts:12-33` — `ImportJob` interface (add fields here)
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx:106-117` — step-restore effect (add hydration here)
- `web/src/hooks/useImports.ts` — `useImportJob` returns `ImportJob` (types flow through)

</code_context>

<specifics>
## Specific Ideas

The audit evidence specifically identifies:
- Backend returns fields at `app/api/v1/imports.py:226-235` and `app/schemas/import_job.py:21-38`
- Model stores fields at `app/models/import_job.py:69-70`
- Frontend type omits them at `web/src/types/import-job.ts:12-33`
- Restore effect only derives step at `web/src/routes/.../new.tsx:105-117`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
