# Phase 29: Integration Polish & Tech Debt Cleanup - Research

**Researched:** 2026-03-15
**Domain:** Frontend TypeScript / Backend schema alignment, UI filter controls, documentation
**Confidence:** HIGH

## Summary

Phase 29 is a surgical integration fix phase that closes 3 integration gaps (INT-01, INT-02, INT-03) identified in the v1.3 milestone audit, plus a type safety improvement and documentation update. No new features or libraries are involved -- every change modifies existing files following established patterns.

The codebase is well-structured with clear, repeatable patterns for each fix. The `buildFilterChips`/`buildDialogChips` functions follow an if-block pattern with `chips.push(...)`, the VoterFilterBuilder Location section uses a consistent Label+Input+onChange pattern, and the ImportJob interface is a straightforward TypeScript interface. All changes have been precisely scoped in the CONTEXT.md decisions.

**Primary recommendation:** Execute as 2-3 small, focused plans: (1) ImportJob type alignment + import table fix, (2) tags_any chip + registration_county UI + chip wiring, (3) sort_by type narrowing + REQUIREMENTS.md doc fix. Each plan touches disjoint files and can be independently verified.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- ImportJob TS type: Rename `filename` to `original_filename`, remove `error_count` field, remove Errors column from import history table, add missing backend fields (`source_type`, `field_mapping`, `mapping_template_id`) as optional, update all references
- tags_any chip: Add inline in `buildFilterChips` (voters/index.tsx) and `buildDialogChips` (lists/index.tsx), label "Tags (any): N", category "other" (grey), dismiss clears to undefined
- Registration county UI: Add text input to VoterFilterBuilder Location section after Registration ZIP (before Precinct), add to Location section filter count, add "County: {value}" dismissible chip in Location category (green) to both buildFilterChips and buildDialogChips, placed after ZIP chip
- sort_by type safety: Narrow `VoterSearchBody.sort_by` from `string` to exact union of 12 valid column names
- Union: `"last_name" | "first_name" | "party" | "age" | "registration_city" | "registration_state" | "registration_zip" | "created_at" | "updated_at" | "propensity_general" | "propensity_primary" | "propensity_combined"`
- `sort_dir` already correctly typed -- no change needed
- REQUIREMENTS.md: Update Coverage section to reflect 27/27 satisfied, 0 pending

### Claude's Discretion
- Exact placement of `source_type`, `field_mapping`, `mapping_template_id` in ImportJob interface
- Whether to extract `SortableColumn` as a named type or inline the union

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | (project version) | Type definitions for ImportJob, VoterSearchBody | All changes are TS interface/type modifications |
| React | (project version) | JSX for filter inputs and table columns | UI component additions |
| TanStack Table | (project version) | Import history table ColumnDef | accessorKey alignment |

### Supporting
No new libraries required. All changes use existing imports and patterns.

## Architecture Patterns

### Pattern 1: ImportJob Type Alignment (INT-01)
**What:** Rename/remove fields in the TypeScript interface to match backend `ImportJobResponse`, then update all consumers.
**When to use:** When frontend type diverges from backend schema.

**Current ImportJob interface** (`web/src/types/import-job.ts`):
- `filename: string` -- should be `original_filename: string` (matches `ImportJobResponse.original_filename`)
- `error_count: number` -- has NO backend counterpart; remove entirely
- Missing: `source_type`, `field_mapping` (both exist on `ImportJobResponse`)

**Backend ImportJobResponse** (`app/schemas/import_job.py`):
```
original_filename: str
source_type: str
field_mapping: dict | None = None
# Note: NO error_count, NO mapping_template_id
```

**IMPORTANT RESEARCH FINDING:** The CONTEXT.md lists `mapping_template_id` as a field to add, but this field does NOT exist on `ImportJobResponse` in the backend schema. The backend has no `mapping_template_id` field on import jobs. The planner should add `source_type` and `field_mapping` but should NOT add `mapping_template_id` (or add it only if the backend schema adds it, which it currently does not).

**Consumers that reference `filename` or `error_count`:**

| File | Reference | Fix |
|------|-----------|-----|
| `web/src/types/import-job.ts` | `filename: string` | Rename to `original_filename: string` |
| `web/src/types/import-job.ts` | `error_count: number` | Remove field |
| `web/src/routes/.../imports/index.tsx` L50 | `accessorKey: "filename"` | Change to `"original_filename"` |
| `web/src/routes/.../imports/index.tsx` L68-70 | `accessorKey: "error_count"` + header "Errors" | Remove entire column definition |
| `web/src/routes/.../imports/new.tsx` L124 | `filename: file.name` | This is the `useInitiateImport` call arg -- keep as `filename` (the hook maps it to `original_filename` query param internally) |
| `web/src/routes/.../imports/new.tsx` L322-325 | `jobQuery.data.error_count > 0` | Remove this block (no backend field) |
| `web/src/components/voters/ImportProgress.tsx` L53 | `job.error_count` display | Remove or replace with 0 fallback |
| `web/src/components/voters/ImportProgress.tsx` L69-72 | `job.error_count > 0` conditional | Remove this block |
| `web/src/hooks/useImports.ts` L57 | `mutationFn: (data: { filename: string })` | This is the local parameter name for `useInitiateImport`, NOT the ImportJob interface field. Keep as-is -- it maps to `original_filename` on L60 |

**Key insight:** The `useInitiateImport` hook already correctly maps `data.filename` to `original_filename` query param (L60). The `filename` parameter name in the hook's mutation function is NOT an ImportJob field reference -- it is a local convenience name. Do NOT rename it.

### Pattern 2: Filter Chip Wiring (INT-02 + INT-03)
**What:** Add if-blocks to `buildFilterChips` and `buildDialogChips` for `tags_any` and `registration_county`.
**When to use:** When a backend filter dimension exists but has no dismissible chip in the UI.

**Existing pattern** (from `buildFilterChips` in voters/index.tsx):
```typescript
// tags (all) chip -- existing pattern to follow
if (filters.tags && filters.tags.length > 0) {
  chips.push({
    label: `Tags (all): ${filters.tags.length}`,
    className: CATEGORY_CLASSES.other,
    onDismiss: () => update({ tags: undefined }),
  })
}

// tags_any chip -- ADD AFTER tags block
if (filters.tags_any && filters.tags_any.length > 0) {
  chips.push({
    label: `Tags (any): ${filters.tags_any.length}`,
    className: CATEGORY_CLASSES.other,
    onDismiss: () => update({ tags_any: undefined }),
  })
}
```

**Registration county chip** (add after ZIP chip in Location section):
```typescript
if (filters.registration_county) {
  chips.push({
    label: `County: ${filters.registration_county}`,
    className: CATEGORY_CLASSES.location,
    onDismiss: () => update({ registration_county: undefined }),
  })
}
```

**Both must be added in TWO files:**
1. `web/src/routes/campaigns/$campaignId/voters/index.tsx` (`buildFilterChips`)
2. `web/src/routes/campaigns/$campaignId/voters/lists/index.tsx` (`buildDialogChips`)

**Also add `registration_county` chip to `buildStaticChipDescriptors`** in `web/src/lib/filterChipUtils.ts` (this function is for the voter list detail page). Currently missing there too -- only `tags_any` is handled.

### Pattern 3: VoterFilterBuilder Registration County Input (INT-03)
**What:** Add a text input for `registration_county` in the Location accordion section.
**When to use:** When a backend filter exists but has no UI control.

**Placement:** After Registration ZIP, before Precinct (per CONTEXT.md decision).

**Existing pattern** (from VoterFilterBuilder Location section):
```typescript
<div>
  <Label className="text-sm font-medium mb-2 block">Registration County</Label>
  <Input
    placeholder="County"
    value={value.registration_county ?? ""}
    onChange={(e) => update({ registration_county: e.target.value || undefined })}
  />
</div>
```

**Also update `countSectionFilters`** Location case:
```typescript
case "location":
  // ... existing checks ...
  if (value.registration_county) count++  // ADD THIS
  // ... remaining checks ...
```

**Current Location section order (lines 463-523):**
1. Registration City (L465-470)
2. Registration State (L472-478)
3. Registration ZIP (L480-486)
4. Precinct (L488-493)
5. Separator + Mailing header
6. Mailing City/State/ZIP

**Insert Registration County between ZIP (after L486) and Precinct (before L488).**

### Pattern 4: sort_by Type Narrowing
**What:** Change `sort_by?: string` to a union type on `VoterSearchBody`.
**Backend definition** (from `app/schemas/voter_filter.py`):
```python
SORTABLE_COLUMNS = Literal[
    "last_name", "first_name", "party", "age",
    "registration_city", "registration_state", "registration_zip",
    "created_at", "updated_at",
    "propensity_general", "propensity_primary", "propensity_combined",
]
```

**Frontend change** (`web/src/types/voter.ts`):
```typescript
// Option A: Named type (recommended -- reusable, self-documenting)
export type SortableColumn =
  | "last_name" | "first_name" | "party" | "age"
  | "registration_city" | "registration_state" | "registration_zip"
  | "created_at" | "updated_at"
  | "propensity_general" | "propensity_primary" | "propensity_combined"

export interface VoterSearchBody {
  filters: VoterFilter
  cursor?: string
  limit?: number
  sort_by?: SortableColumn
  sort_dir?: "asc" | "desc"
}
```

**Downstream impact:** `SORT_COLUMN_MAP` in voters/index.tsx uses `Record<string, string>` for column mapping. The values are consumed as `sort_by` in the search body. Since `mappedSortBy` is derived as `SORT_COLUMN_MAP[sortBy] ?? sortBy` (line 538), its type will be `string`. The assignment to `searchBody.sort_by` may require a cast or assertion if we use a strict union. Check: current SORT_COLUMN_MAP values are `"last_name"`, `"party"`, `"registration_city"`, `"age"` -- all valid members of the union. The map can be typed as `Record<string, SortableColumn>` to maintain type safety.

### Anti-Patterns to Avoid
- **Do NOT refactor `useInitiateImport`'s `filename` parameter**: It is a local mutation parameter, not an ImportJob field. The hook already correctly maps to `original_filename` query param.
- **Do NOT extract FilterChip to a shared module**: Phase 28 explicitly decided to duplicate it inline (20 lines, 2 consumers). Keep this decision.
- **Do NOT add `mapping_template_id` to ImportJob**: The field does not exist on the backend `ImportJobResponse` schema. Adding it would create a new type mismatch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filter chip formatting | Custom chip label logic | Follow existing `chips.push({label, className, onDismiss})` pattern | Consistency with 20+ existing chips |
| Category colors | Custom CSS classes | `CATEGORY_CLASSES.location` / `CATEGORY_CLASSES.other` | Already defined in filterChipUtils.ts |
| Static chip descriptors | Separate logic | Follow `buildStaticChipDescriptors` pattern in filterChipUtils.ts | Single source of truth for non-dismissible chips |

## Common Pitfalls

### Pitfall 1: Renaming filename in useInitiateImport
**What goes wrong:** Renaming `data.filename` to `data.original_filename` in the hook's mutation function breaks the API call or is unnecessary.
**Why it happens:** Conflating the ImportJob interface field name with the local mutation parameter.
**How to avoid:** The `useInitiateImport` hook's `mutationFn` parameter is `{ filename: string }` -- this is a local convenience name. Line 60 already maps it to `searchParams: { original_filename: data.filename }`. Leave this unchanged.
**Warning signs:** TypeScript errors in new.tsx (which calls `initiateImport.mutateAsync({ filename: file.name })`).

### Pitfall 2: Forgetting countSectionFilters for registration_county
**What goes wrong:** The Location section badge count doesn't include registration_county active filters.
**Why it happens:** Adding the UI input but forgetting the counter function.
**How to avoid:** Add `if (value.registration_county) count++` to the "location" case in `countSectionFilters`.
**Warning signs:** Filter count badge shows wrong number when county filter is active.

### Pitfall 3: Missing registration_county chip in buildStaticChipDescriptors
**What goes wrong:** Voter list detail page (non-dismissible chips) won't show the county filter.
**Why it happens:** `buildStaticChipDescriptors` in `filterChipUtils.ts` is a third location for chip rendering, separate from `buildFilterChips` and `buildDialogChips`.
**How to avoid:** Check all 3 chip-building functions when adding a new filter dimension.
**Warning signs:** Dynamic list detail view doesn't show county chip even though voters/index.tsx and lists/index.tsx do.

### Pitfall 4: error_count removal in ImportProgress component
**What goes wrong:** ImportProgress.tsx references `job.error_count` in three places. Simply removing the field from the interface causes TypeScript errors.
**Why it happens:** The progress component was built when `error_count` existed on the type.
**How to avoid:** Remove all `error_count` references from ImportProgress.tsx. Replace the "errors" stat display with either removal or a placeholder. The backend provides `error_message` (string) and `error_report_key` (string) but not a numeric count.
**Warning signs:** TypeScript compilation fails after removing `error_count` from interface.

### Pitfall 5: SORT_COLUMN_MAP type after sort_by narrowing
**What goes wrong:** `SORT_COLUMN_MAP[sortBy] ?? sortBy` returns `string`, which cannot be assigned to `SortableColumn | undefined`.
**Why it happens:** `Record<string, string>` values are typed as `string`, not `SortableColumn`.
**How to avoid:** Type the map as `Record<string, SortableColumn>` and use `as SortableColumn` on the fallback, or type the entire `mappedSortBy` expression with an assertion.
**Warning signs:** TypeScript error on `searchBody.sort_by = mappedSortBy`.

## Code Examples

### ImportJob interface (after fix)
```typescript
// Source: verified against app/schemas/import_job.py ImportJobResponse
export interface ImportJob {
  id: string
  campaign_id: string
  original_filename: string  // was: filename
  status: ImportStatus
  total_rows: number | null
  imported_rows: number
  skipped_rows: number
  // error_count: REMOVED -- no backend counterpart
  error_report_key: string | null
  error_message: string | null  // ADD -- exists on backend
  phones_created: number | null
  source_type: string  // ADD -- exists on backend
  field_mapping: Record<string, string> | null  // ADD -- exists on backend
  created_by: string  // ADD -- exists on backend
  created_at: string
  updated_at: string
}
```

### tags_any chip (both consumers)
```typescript
// Source: follows existing tags chip pattern at voters/index.tsx L279-285
if (filters.tags_any && filters.tags_any.length > 0) {
  chips.push({
    label: `Tags (any): ${filters.tags_any.length}`,
    className: CATEGORY_CLASSES.other,
    onDismiss: () => update({ tags_any: undefined }),
  })
}
```

### Registration county input
```typescript
// Source: follows existing city/state/zip pattern at VoterFilterBuilder.tsx L465-486
<div>
  <Label className="text-sm font-medium mb-2 block">Registration County</Label>
  <Input
    placeholder="County"
    value={value.registration_county ?? ""}
    onChange={(e) => update({ registration_county: e.target.value || undefined })}
  />
</div>
```

### SortableColumn type
```typescript
// Source: matches app/schemas/voter_filter.py SORTABLE_COLUMNS Literal
export type SortableColumn =
  | "last_name"
  | "first_name"
  | "party"
  | "age"
  | "registration_city"
  | "registration_state"
  | "registration_zip"
  | "created_at"
  | "updated_at"
  | "propensity_general"
  | "propensity_primary"
  | "propensity_combined"
```

## State of the Art

No version changes or deprecated APIs involved. All changes are internal type alignment and UI additions using existing established patterns.

## Open Questions

1. **`mapping_template_id` in CONTEXT.md**
   - What we know: CONTEXT.md lists `mapping_template_id` as a field to add to ImportJob. However, the backend `ImportJobResponse` schema has no such field.
   - What's unclear: Whether this was an error in the context discussion or whether the backend should also be updated.
   - Recommendation: Do NOT add `mapping_template_id` to the frontend type. The backend schema does not include it, and adding it would create a new type mismatch (the opposite of this phase's goal). If the user wants this field, it requires a backend change first.

2. **error_count removal impact on ImportProgress**
   - What we know: ImportProgress.tsx displays `job.error_count` in 3 places. The backend has `error_message: str | None` but no numeric error count.
   - What's unclear: Whether to remove the errors display entirely or replace it with something based on `error_message`.
   - Recommendation: Remove the numeric error count display. Keep the error_report_key-based download link. The "errors" stat in the progress bar should be removed since there is no reliable numeric count from the backend.

3. **REQUIREMENTS.md Coverage text**
   - What we know: The current REQUIREMENTS.md already shows "Satisfied: 27, Pending: 0" (verified by reading lines 105-110). The milestone audit said it had a stale "Pending (gap closure): 6" message, but the file appears to have been updated already.
   - What's unclear: Whether the "Last updated" date should change.
   - Recommendation: Update the "Last updated" line to reflect the current date. The Coverage section content appears already correct.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E), Vitest (unit) |
| Config file | `web/playwright.config.ts`, `web/vitest.config.ts` |
| Quick run command | `cd web && npx playwright test <spec-file> --headed` |
| Full suite command | `cd web && npm run test:e2e` |

### Phase Requirements -> Test Map

This phase has no formal requirement IDs. The success criteria are integration fixes from the milestone audit. Validation focuses on TypeScript compilation and visual correctness.

| Criteria | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| SC-01 | Import history shows Filename column correctly, no Errors column | TypeScript build + E2E | `cd web && npx tsc --noEmit` | TypeScript: yes, E2E: existing phase14 spec |
| SC-02 | tags_any filter shows dismissible chip | E2E visual | `cd web && npx playwright test e2e/filter-chips.spec.ts` | Partial (existing spec covers other chips) |
| SC-03 | Registration County input in VoterFilterBuilder | E2E visual | `cd web && npx playwright test e2e/phase27-filter-wiring.spec.ts` | Partial |
| SC-04 | VoterSearchBody.sort_by typed as union | TypeScript build | `cd web && npx tsc --noEmit` | N/A (compile-time only) |
| SC-05 | REQUIREMENTS.md reflects 27/27 | Manual doc check | `grep "Satisfied: 27" .planning/REQUIREMENTS.md` | N/A |

### Sampling Rate
- **Per task commit:** `cd web && npx tsc --noEmit` (TypeScript compilation check)
- **Per wave merge:** `cd web && npm run test:e2e` (full E2E suite)
- **Phase gate:** TypeScript build clean + full E2E suite green

### Wave 0 Gaps
None -- existing test infrastructure covers compilation checks. E2E specs for filter chips and imports already exist from phases 14, 27, and 28. TypeScript compilation (`tsc --noEmit`) is the primary automated validation for type alignment changes.

## Sources

### Primary (HIGH confidence)
- `app/schemas/import_job.py` -- ImportJobResponse backend schema (verified fields: `original_filename`, `source_type`, `field_mapping`, NO `error_count`, NO `mapping_template_id`)
- `app/schemas/voter_filter.py` -- SORTABLE_COLUMNS Literal definition (verified 12 column names)
- `web/src/types/import-job.ts` -- current ImportJob interface (verified mismatches)
- `web/src/types/voter.ts` -- current VoterSearchBody interface (verified `sort_by?: string`)
- `web/src/routes/.../voters/index.tsx` -- buildFilterChips function (verified missing tags_any and registration_county)
- `web/src/routes/.../voters/lists/index.tsx` -- buildDialogChips function (verified missing tags_any and registration_county)
- `web/src/components/voters/VoterFilterBuilder.tsx` -- Location section (verified missing registration_county input)
- `web/src/components/voters/ImportProgress.tsx` -- error_count references (verified 3 locations)
- `web/src/hooks/useImports.ts` -- useInitiateImport maps filename to original_filename (verified L57-61)
- `.planning/v1.3-MILESTONE-AUDIT.md` -- INT-01, INT-02, INT-03 gap definitions

## Metadata

**Confidence breakdown:**
- ImportJob alignment (INT-01): HIGH -- verified both frontend interface and backend schema, all references located
- tags_any chip (INT-02): HIGH -- verified existing pattern in buildStaticChipDescriptors, confirmed missing from buildFilterChips and buildDialogChips
- Registration county (INT-03): HIGH -- verified backend filter exists, verified UI input pattern, verified VoterFilter already has `registration_county`
- sort_by type safety: HIGH -- verified exact 12-column union from backend SORTABLE_COLUMNS
- REQUIREMENTS.md: HIGH -- verified current content (already shows 27/27)

**Research date:** 2026-03-15
**Valid until:** Indefinite (all changes are internal code fixes with no external dependency)
