# Phase 66: Import Wizard Flow Recovery & Progress Accuracy - Context

**Gathered:** 2026-04-03
**Status:** Ready for execution
**Mode:** Autonomous gap closure

<domain>
## Phase Boundary

Restore the end-to-end import upload flow so users reliably reach mapping, progress, completion, and partial-success surfaces for newly created imports.

</domain>

<decisions>
## Implementation Decisions

### Locked for this phase

- Fix the stale detect-columns bug at the hook boundary so the wizard can target the newly created import job explicitly.
- Add route-level coverage for the upload-to-detect transition instead of relying only on isolated hook tests.
- Reuse the existing partial-success UI introduced in Phase 64 and verify it remains reachable once the new-job handoff is fixed.
- Validate progress metric behavior against the existing durable timestamp inputs without expanding the backend schema in this gap-closure phase.

</decisions>

<code_context>
## Existing Code Insights

- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` uploads the file, updates URL search state, and then immediately calls detect-columns.
- `web/src/hooks/useImports.ts` currently closes over `jobId` inside `useDetectColumns`, which makes the immediate post-upload detect request vulnerable to a stale job id.
- Partial-success UI and progress rendering already exist and only need flow recovery plus regression coverage.

</code_context>

<specifics>
## Specific Ideas

- Allow `useDetectColumns` to accept an override job id for the just-created import.
- Call detect-columns with the returned `job_id` from `useInitiateImport`.
- Add a route test for the new-job detect handoff and a completion-state test for `completed_with_errors`.

</specifics>

<deferred>
## Deferred Ideas

- No backend schema additions for a dedicated processing-start timestamp in this phase.

</deferred>
