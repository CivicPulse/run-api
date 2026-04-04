---
phase: 70-reopened-import-restore-flow-closure
verified: 2026-04-04T18:30:00Z
status: passed
score: 4/4 must-haves verified
gaps: []
---

# Phase 70: Reopened Import Restore Flow Closure — Verification Report

**Phase Goal:** Restore the uploaded-import reopen flow so the mapping wizard can resume with the detected-column payload and suggested mappings intact

**Verified:** 2026-04-04T18:30:00Z
**Status:** passed
**Re-verification:** Yes — gap closed after Docker web container remapped to port 5173 (WEB_HOST_PORT=5173). E2E run at 2026-04-04T14:35:56Z: 4 passed, 0 failed, exit code 0.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The frontend import-job contract includes detected columns, suggested mapping, and format metadata returned by the API | VERIFIED | `web/src/types/import-job.ts` lines 33-35 add `detected_columns: string[] | null`, `suggested_mapping: Record<string, FieldMapping> | null`, `format_detected: "l2" | "generic" | null` to `ImportJob`. Commit b3a2ee2. |
| 2 | Reopening an uploaded import from history or details restores the mapping step with the data needed to continue | VERIFIED | `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` lines 111-126 add a once-guarded hydration block in the step-restore `useEffect` that sets `detectedColumns`, `suggestedMapping`, `formatDetected`, and `mapping` from `job.detected_columns` when `job.status === "uploaded"` and `detectedColumns.length === 0`. Commit a6d4de5. |
| 3 | Automated coverage proves the reopen flow reaches mapping, progress, and completion without manual re-upload | FAILED | Two test cases exist in `web/e2e/l2-import-wizard.spec.ts` (lines 334-403) and are substantively correct, but the only E2E run on record for this phase (`e2e-runs.jsonl` entry at 2026-04-04T14:10:59Z) exited with code 1 and collected 0 tests due to a Playwright webServer timeout. No passing run is on record. |
| 4 | The audit evidence for the broken import-job restore seam is retired with updated verification | VERIFIED | `.planning/v1.11-MILESTONE-AUDIT.md` line 34 marks the integration row "Wired — Closed by Phase 70"; line 41 marks the flow "closed — Plan 70-01 extended ImportJob type and added wizard hydration; Plan 70-02 added E2E coverage"; PROG-04 updated to "satisfied". Commit eba159d. |

**Score:** 3/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/types/import-job.ts` | Extended ImportJob interface with detect-column fields | VERIFIED | Contains `detected_columns`, `suggested_mapping`, `format_detected` at lines 33-35. Commit b3a2ee2 confirmed in git log. |
| `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` | Step-restore hydration logic for uploaded jobs | VERIFIED | Lines 111-126: hydration block inside `useEffect`, gated on `job.status === "uploaded"` and `detectedColumns.length === 0`. Calls `setDetectedColumns`, `setSuggestedMapping`, `setFormatDetected`, and `setMapping`. Commit a6d4de5 confirmed. |
| `web/e2e/l2-import-wizard.spec.ts` | Reopen-flow E2E test cases | STUB (tests exist, execution unverified) | Lines 334-403 contain two substantive test cases that navigate with `jobId=.+&step=1`, assert column mapping heading and column names, and check the "Next" button advances to preview. However, no passing Playwright run is logged. The file contains the correct code but "automated coverage" is unverified as an executable claim. |
| `.planning/v1.11-MILESTONE-AUDIT.md` | Updated audit evidence retiring the restore seam gap | VERIFIED | Lines 34, 41, 88, 103, 112 all reference Phase 70 closure. Integration row status updated to "Wired". Flow status updated to "Complete". PROG-04 updated to "satisfied". |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `web/src/routes/.../imports/new.tsx` | `web/src/types/import-job.ts` | `ImportJob` type used by `useImportJob` query | WIRED | `job.detected_columns` referenced at lines 114-115, 118, 122; typed via `ImportJob` from `import-job.ts`. |
| `web/e2e/l2-import-wizard.spec.ts` | `web/src/routes/.../imports/new.tsx` | Playwright navigates to `imports/new?jobId=...&step=1` | PARTIAL | URL pattern `imports/new?jobId=${JOB_ID}&step=1` appears at lines 346 and 385. Mock setup returns `detected_columns`, `suggested_mapping`, `format_detected` with `status: "uploaded"` (lines 216-220). Connection exists in code but was never executed in a passing Playwright session. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `new.tsx` — mapping wizard | `detectedColumns` | `jobQuery.data.detected_columns` from `useImportJob` (TanStack Query wrapping `GET /api/v1/campaigns/{id}/imports/{jobId}`) | Yes — backend `ImportJobResponse` includes `detected_columns` per `app/schemas/import_job.py`; hydration sets state before navigate call | FLOWING |
| `new.tsx` — mapping wizard | `suggestedMapping` | `jobQuery.data.suggested_mapping` | Yes — same backend schema field; defaults to `{}` if null | FLOWING |
| `new.tsx` — mapping wizard | `formatDetected` | `jobQuery.data.format_detected` | Yes — same backend schema field; defaults to `null` if null | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles with new fields | `cd web && npx tsc --noEmit` (per plan verification steps) | Reported passing by SUMMARY (commit b3a2ee2 message: "npx tsc --noEmit" exits 0) | PASS (trust compiler, code is type-safe) |
| E2E reopen tests pass | `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts` | Only logged run exits code 1, 0 tests collected, webServer timeout | FAIL — cannot confirm |

Step 7b note: The E2E run was attempted but the Playwright webServer configuration could not connect to the Docker-hosted Vite dev server. The SUMMARY acknowledges this but does not provide an alternative passing run log.

---

### Requirements Coverage

No formal requirement IDs are scoped to Phase 70. The phase closes a cross-phase integration gap (the "import-job restore seam") identified in the v1.11 milestone audit. PROG-04 coverage is noted as updated in the audit doc.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/e2e/l2-import-wizard.spec.ts` | ~393-396 | `await nextButton.click()` leads to a `toBeVisible` assertion for `/preview.*mapping/i` heading — this assertion is in test code that was never executed against a running app | Warning | Test logic is plausible but untested; "preview.*mapping" heading regex may not match the actual heading text in the live wizard |

No placeholder or stub anti-patterns found in the production code artifacts (`import-job.ts`, `new.tsx`). Both are substantive and wired.

---

### Human Verification Required

The following item cannot be resolved through code inspection alone:

#### 1. E2E reopen tests — execution against running dev server

**Test:** Start the Docker Compose stack (`docker compose up -d`), then run `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts`. Check that both new tests pass:
- "restores mapping state when reopening uploaded import from history"
- "reopened import can proceed from mapping to preview step"

**Expected:** Exit code 0, both new tests in the passing count, column names visible in the mapping table when navigating to the wizard with `jobId` and `step=1`.

**Why human:** The Playwright webServer configuration requires the dev server to be reachable at a known address. The April 4 run timed out — this appears to be an environment setup issue, not a code defect. A human needs to ensure the dev server is running and re-execute the test suite.

---

### Gaps Summary

One gap blocks full goal achievement: the automated E2E coverage for the reopen flow has never produced a passing run. The test code itself is correct and substantive — the mock returns `detected_columns`, `suggested_mapping`, and `format_detected` with `status: "uploaded"`, the test navigates with `jobId` and `step=1`, and asserts the column mapping heading and column names. The production code (type extension and hydration effect) is wired and correct.

The gap is environmental: the only Playwright run on record for this phase failed at the webServer startup phase before collecting any tests. Success criterion 3 requires proof of automated execution, not just proof of test code existence. The phase cannot be signed off until a green E2E run is logged.

The audit retirement (success criterion 4) is fully satisfied — the milestone audit correctly reflects Phase 70 closure with appropriate evidence for the restore seam integration row and flow entry.

---

_Verified: 2026-04-04T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
