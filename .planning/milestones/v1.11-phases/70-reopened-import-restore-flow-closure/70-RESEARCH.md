# Phase 70: Reopened Import Restore Flow Closure - Research

**Researched:** 2026-04-04
**Domain:** Frontend TypeScript type contract + React wizard state hydration
**Confidence:** HIGH

## Summary

This phase closes a specific audit gap: when a user reopens an import that is in `uploaded` status (e.g., from the history page or a bookmarked URL), the wizard correctly navigates to step 2 (column mapping) but the mapping state is empty because the frontend `ImportJob` type omits `detected_columns`, `suggested_mapping`, and `format_detected` -- fields the backend already returns. The fix is a two-part seam repair: extend the TypeScript interface, then add hydration logic to the step-restore useEffect.

The backend requires zero changes. The API schema (`app/schemas/import_job.py:21-38`) already includes all three fields, and the GET endpoint returns them. The gap is purely on the frontend: the TypeScript `ImportJob` interface at `web/src/types/import-job.ts:12-33` omits these fields, and the step-restore effect at `web/src/routes/.../new.tsx:106-117` only derives the step number without hydrating the mapping state.

**Primary recommendation:** Add three optional fields to the `ImportJob` interface, then extend the existing step-restore `useEffect` to hydrate `detectedColumns`, `suggestedMapping`, `formatDetected`, and `mapping` state when an `uploaded` job has `detected_columns` present.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add `detected_columns`, `suggested_mapping`, and `format_detected` to the `ImportJob` TypeScript interface (they already exist on the backend schema and model)
- The backend already returns these fields -- no API changes needed
- When the step-restore effect detects an `uploaded` job with `detected_columns` present, hydrate `detectedColumns`, `suggestedMapping`, `formatDetected`, and `mapping` state from the job data
- This mirrors the hydration logic already in `handleFileSelect` after detect-columns returns

### Claude's Discretion
- Exact placement of hydration logic (extend existing useEffect or add a new one)
- Whether to add a loading state while job data is being fetched for the restore case
- Test structure and organization

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Architecture Patterns

### Current Wizard State Flow (Fresh Upload)

```
handleFileSelect() -> initiateImport -> uploadToMinIO -> detectColumns
  -> setDetectedColumns(detected_columns)
  -> setSuggestedMapping(suggested_mapping)
  -> setFormatDetected(format_detected)
  -> setMapping(initialMapping derived from suggested_mapping)
  -> navigate to step 2
```

### Current Step-Restore Flow (Reopened Job -- BROKEN)

```
useEffect [jobId, jobQuery.data] ->
  deriveStep(status) -> navigate to correct step
  // MISSING: no hydration of detectedColumns, suggestedMapping, mapping
```

### Target Step-Restore Flow (After Fix)

```
useEffect [jobId, jobQuery.data] ->
  deriveStep(status) -> navigate to correct step
  IF status === "uploaded" AND job.detected_columns exists:
    -> setDetectedColumns(job.detected_columns)
    -> setSuggestedMapping(job.suggested_mapping)
    -> setFormatDetected(job.format_detected)
    -> setMapping(derived from detected_columns + suggested_mapping)
```

### Hydration Pattern Reference

The exact hydration logic already exists at `new.tsx:148-158` in `handleFileSelect`. The restore path should mirror it:

```typescript
// Lines 148-158 of new.tsx (existing pattern to replicate)
setDetectedColumns(detected_columns)
setSuggestedMapping(suggested_mapping)
setFormatDetected(format_detected)
const initialMapping: Record<string, string> = {}
for (const col of detected_columns) {
  initialMapping[col] = suggested_mapping[col]?.field ?? ""
}
setMapping(initialMapping)
```

### Anti-Patterns to Avoid
- **Re-calling detect-columns API on restore:** The data is already persisted on the job and returned by useImportJob. Do not trigger another POST to /detect.
- **Hydrating when state is already populated:** Guard against re-hydrating if the user already has mapping state from a fresh upload in the same session (check `detectedColumns.length === 0` before hydrating).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job data fetching | Custom fetch logic | `useImportJob` hook (already exists) | Already wired with TanStack Query caching and polling |
| Step derivation | Manual status-to-step mapping | `deriveStep()` (already exists) | Pure function, already tested |
| Type extension | Manual API response parsing | Extend `ImportJob` interface | TypeScript will enforce contract at compile time |

## Common Pitfalls

### Pitfall 1: Race Between Navigation and Hydration
**What goes wrong:** The useEffect navigates to step 2 before hydration state is set, causing the ColumnMappingTable to render with empty columns.
**Why it happens:** React batches state updates, but navigation happens in the same effect.
**How to avoid:** Set all hydration state BEFORE the navigate call in the same effect. React will batch the useState calls and they will be available when the step 2 component renders.
**Warning signs:** ColumnMappingTable renders with zero rows on reopen.

### Pitfall 2: Re-hydrating Over User Edits
**What goes wrong:** If a user modifies mapping on step 2, then the polling refetch triggers the restore effect, overwriting their edits.
**Why it happens:** `jobQuery.data` changes on every refetch, triggering the useEffect.
**How to avoid:** Only hydrate when `detectedColumns` state is empty (length === 0). Once populated, the restore effect should not overwrite.
**Warning signs:** User mapping edits reset to suggested values.

### Pitfall 3: Suggested Mapping Shape Mismatch
**What goes wrong:** Backend returns `suggested_mapping` as `Record<string, {field: string | null, match_type: string | null}>` but the state expects `Record<string, FieldMapping>`.
**Why it happens:** The `FieldMapping` type at `import-job.ts:42-45` matches the backend shape, so this should work. But if the backend returns null for the whole field, the hydration code must guard against it.
**How to avoid:** Default `suggested_mapping` to `{}` if null/undefined from the API response.

## Code Examples

### TypeScript Interface Extension

```typescript
// web/src/types/import-job.ts -- add to ImportJob interface
export interface ImportJob {
  // ... existing fields ...
  detected_columns: string[] | null       // NEW
  suggested_mapping: Record<string, FieldMapping> | null  // NEW
  format_detected: "l2" | "generic" | null  // NEW
}
```

### Step-Restore Hydration

```typescript
// web/src/routes/.../new.tsx -- extend the existing useEffect at line 106
useEffect(() => {
  if (!jobId || !jobQuery.data) return
  const job = jobQuery.data
  const correctStep = deriveStep(job.status)

  // Hydrate mapping state for uploaded jobs (reopen case)
  if (
    job.status === "uploaded" &&
    job.detected_columns &&
    job.detected_columns.length > 0 &&
    detectedColumns.length === 0  // only hydrate once
  ) {
    setDetectedColumns(job.detected_columns)
    setSuggestedMapping(job.suggested_mapping ?? {})
    setFormatDetected(job.format_detected ?? null)
    const initialMapping: Record<string, string> = {}
    for (const col of job.detected_columns) {
      initialMapping[col] = (job.suggested_mapping?.[col]?.field) ?? ""
    }
    setMapping(initialMapping)
  }

  // Don't let stale query data navigate backwards
  if (correctStep < step) return
  if (correctStep !== step) {
    navigate({ search: { jobId, step: correctStep }, replace: true })
  }
}, [jobId, jobQuery.data, step, navigate, detectedColumns.length])
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E) + Vitest (if present) |
| Config file | `web/playwright.config.ts` |
| Quick run command | `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts` |
| Full suite command | `cd web && ./scripts/run-e2e.sh` |

### Phase Requirements -> Test Map

This phase has no formal requirement IDs, but the success criteria map to testable behaviors:

| Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-----------|----------|-----------|-------------------|-------------|
| SC-1 | ImportJob type includes detected_columns, suggested_mapping, format_detected | Type check | `cd web && npx tsc --noEmit` | N/A (compiler) |
| SC-2 | Reopening uploaded import restores mapping step with data | E2E (mocked) | Extend `l2-import-wizard.spec.ts` | Partial -- needs new test case |
| SC-3 | Reopen flow reaches mapping, progress, and completion | E2E (mocked) | Extend `l2-import-wizard.spec.ts` | No -- new test |
| SC-4 | Audit evidence retired | Manual -- update `v1.11-MILESTONE-AUDIT.md` | N/A | N/A |

### Testing Strategy

The existing `l2-import-wizard.spec.ts` already has the mock infrastructure for this phase:
- `setupApiMocks()` already returns `detected_columns`, `suggested_mapping`, and `format_detected` in the GET `/imports/{jobId}` mock response (lines 209-224)
- The mock returns `status: "uploaded"` for job detail queries
- Auth mocking via `setupAuth()` is in place

A new test case should:
1. Navigate directly to `/campaigns/{id}/voters/imports/new?jobId={id}&step=1` (simulating a reopen from history)
2. Wait for the step-restore effect to hydrate and navigate to step 2
3. Verify column mapping table renders with the expected columns
4. Verify the L2 banner appears (for L2 format) or does not appear (for generic)
5. Proceed through preview -> confirm to verify full flow continuity

### Sampling Rate
- **Per task commit:** `cd web && npx tsc --noEmit` (type check)
- **Per wave merge:** `cd web && ./scripts/run-e2e.sh l2-import-wizard.spec.ts`
- **Phase gate:** Full E2E suite green before verify

### Wave 0 Gaps
- [ ] New test case in `l2-import-wizard.spec.ts` -- "restores mapping state when reopening uploaded import"
- [ ] Mock setup for confirm + progress + completion steps in reopen flow (extend `setupApiMocks` or add state progression)

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `web/src/types/import-job.ts`, `web/src/routes/.../new.tsx`, `web/src/hooks/useImports.ts`
- Direct source code inspection of `app/schemas/import_job.py` (backend schema confirms fields exist)
- `v1.11-MILESTONE-AUDIT.md` audit gap evidence

### Secondary (MEDIUM confidence)
- Existing E2E test patterns from `web/e2e/l2-import-wizard.spec.ts` and `web/e2e/voter-import.spec.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, purely extending existing code
- Architecture: HIGH -- hydration pattern already exists in handleFileSelect, just needs replication
- Pitfalls: HIGH -- small surface area with well-understood React state patterns

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- no moving dependencies)
