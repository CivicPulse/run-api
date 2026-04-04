---
phase: 66-import-wizard-flow-recovery-progress-accuracy
plan: 01
subsystem: web
tags: [imports, upload-wizard, routing, tests]
requires:
  - phase: 64-frontend-throughput-status-ui
    provides: progress and partial-success UI surfaces
provides:
  - explicit detect-columns job-id override
  - fresh-job upload wizard handoff
  - route-level coverage for the detect flow
affects: [phase-66-upload-flow, import-wizard-route, import-hooks]
tech-stack:
  added:
    - web/src/routes/campaigns/$campaignId/voters/imports/new.test.tsx
  patterns:
    [mutation override parameters for post-create flows, route-level upload handoff tests]
key-files:
  created:
    - .planning/phases/66-import-wizard-flow-recovery-progress-accuracy/66-01-SUMMARY.md
    - web/src/routes/campaigns/$campaignId/voters/imports/new.test.tsx
  modified:
    - web/src/hooks/useImports.ts
    - web/src/routes/campaigns/$campaignId/voters/imports/new.tsx
    - web/src/hooks/useImports.test.ts
key-decisions:
  - "Let `useDetectColumns` accept an override job id so create-and-follow-up flows do not depend on a re-rendered URL."
  - "Kept the fix at the web boundary instead of adding backend indirection because the bug is purely client-side state timing."
patterns-established:
  - "Wizard flows that create a resource and immediately call a second mutation should pass the fresh resource id directly."
requirements-completed: [PROG-04, PROG-05]
duration: 10min
completed: 2026-04-03
---

# Phase 66 Plan 01: Import Wizard Flow Recovery & Progress Accuracy Summary

**Fresh-job detect-columns wiring for the upload wizard**

## Accomplishments

- Updated `useDetectColumns()` to accept an override job id and invalidate the correct detail query for that job.
- Updated the import wizard to call detect-columns with the freshly created `job_id` instead of relying on the stale URL-bound hook closure.
- Added route-level coverage proving the upload wizard uses the new job id and still exposes the partial-success completion state.

## Verification

- `npm --prefix web test -- --run src/hooks/useImports.test.ts src/routes/campaigns/$campaignId/voters/imports/new.test.tsx`

## Next Phase Readiness

- The upload-to-detect-to-mapping flow is now reliable for newly created imports, which restores the route into progress and completion surfaces.
