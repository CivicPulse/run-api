# Phase 29: Integration Polish & Tech Debt Cleanup - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix integration mismatches between frontend TypeScript types and backend schemas, surface missing UI controls for already-wired backend filters, add missing filter chips, and clean up documentation. This closes INT-01, INT-02, INT-03 from the v1.3 milestone audit plus type safety and documentation tech debt.

</domain>

<decisions>
## Implementation Decisions

### ImportJob TS type fix (INT-01)
- Rename `filename` to `original_filename` to match backend `ImportJobResponse`
- Remove `error_count` field entirely — no backend counterpart exists
- Remove Errors column from import history table (it always rendered blank)
- Full interface alignment: add missing backend fields (`source_type`, `field_mapping`, `mapping_template_id`) as optional
- Update all references to `filename` across imports table, new.tsx, ImportProgress

### tags_any chip wiring (INT-02)
- Add `tags_any` chip inline in `buildFilterChips` (voters/index.tsx) right after the existing `tags` block
- Add `tags_any` chip inline in `buildDialogChips` (voters/lists/index.tsx) following same pattern
- Chip label: "Tags (any): N" — mirrors existing "Tags (all): N" pattern
- Category: "other" (grey) — matches `tags` chip category assignment
- Dismiss clears `tags_any` to undefined

### Registration county UI (INT-03)
- Add Registration County text input to VoterFilterBuilder Location section, placed after Registration ZIP (before Precinct)
- Add `registration_county` to Location section filter count (`if (value.registration_county) count++`)
- Add "County: {value}" dismissible chip in Location category (green) to both `buildFilterChips` and `buildDialogChips`
- Chip placed after ZIP chip in Location group ordering

### sort_by type safety
- Narrow `VoterSearchBody.sort_by` from `string` to exact union of 12 valid column names matching backend `SORTABLE_COLUMNS`
- Union: `"last_name" | "first_name" | "party" | "age" | "registration_city" | "registration_state" | "registration_zip" | "created_at" | "updated_at" | "propensity_general" | "propensity_primary" | "propensity_combined"`
- `sort_dir` already correctly typed as `"asc" | "desc"` — no change needed

### REQUIREMENTS.md documentation fix
- Update Coverage section to reflect 27/27 satisfied, 0 pending (currently says "Pending (gap closure): 6")

### Claude's Discretion
- Exact placement of `source_type`, `field_mapping`, `mapping_template_id` in ImportJob interface
- Whether to extract `SortableColumn` as a named type or inline the union

</decisions>

<specifics>
## Specific Ideas

- All changes are surgical fixes — no new features, no refactoring beyond the fix scope
- ImportJob `filename` → `original_filename` rename should fix the blank Filename column in the import history table immediately
- Registration county input follows the exact same pattern as city/state/zip inputs (Label + Input + onChange)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `filterChipUtils.ts`: Already has `tags_any` in category map and `buildStaticChipDescriptors` — proves the chip formatting works
- `FilterChip` component: Already supports `className` (category colors) and `tooltip` props from Phase 28
- `VoterFilterBuilder`: Location section has consistent pattern for text inputs (Label + Input + onChange with undefined coercion)
- `CATEGORY_CLASSES`: Green for location chips already defined in both consumers

### Established Patterns
- `buildFilterChips`: if-block pattern with `chips.push({label, className, onDismiss})` — add new entries following this pattern
- `buildDialogChips`: Same if-block pattern as `buildFilterChips` but with `setFilters` instead of `update`
- `activeFilterCount`: switch-case with `count++` per filter field
- Import history table: TanStack Table `ColumnDef<ImportJob>[]` with `accessorKey` matching interface fields

### Integration Points
- `web/src/types/import-job.ts`: ImportJob interface — rename `filename`, remove `error_count`, add missing fields
- `web/src/routes/campaigns/$campaignId/voters/imports/index.tsx`: Import history table columns — fix accessorKey, remove Errors column
- `web/src/routes/campaigns/$campaignId/voters/index.tsx`: `buildFilterChips` — add `tags_any` and `registration_county` chips
- `web/src/routes/campaigns/$campaignId/voters/lists/index.tsx`: `buildDialogChips` — add `tags_any` and `registration_county` chips
- `web/src/components/voters/VoterFilterBuilder.tsx`: Location section — add county input, update filter count
- `web/src/types/voter.ts`: `VoterSearchBody.sort_by` — narrow type
- `.planning/REQUIREMENTS.md`: Coverage section — fix pending count

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 29-integration-polish-tech-debt-cleanup*
*Context gathered: 2026-03-15*
