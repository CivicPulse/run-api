# Phase 28: Filter Chips & Frontend Type Coverage - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Add dismissible filter chips for all filter dimensions (including 12 new from Phase 25/26 and legacy gaps), update ImportJob and VoterCreate TypeScript types to match backend schemas, and display phones_created in the import UI. Color-code chips by filter category. Align voter list detail page chip formatting. This is gap closure from the v1.3 milestone audit.

</domain>

<decisions>
## Implementation Decisions

### Propensity range chip format
- Short abbreviation labels: "Gen. Propensity:", "Pri. Propensity:", "Comb. Propensity:"
- Open range with dash for single-bound: "Gen. Propensity: 50–" (min only), "Gen. Propensity: –80" (max only), "Gen. Propensity: 50–80" (both)
- One chip per propensity type (combining min+max) — dismissing clears both bounds
- No chip shown when bounds are at defaults (min=0 or max=100 treated as "no filter"; chip appears when min>0 or max<100)

### Multi-select chip display
- Truncate after 3 values: show up to 3 values, then "+N more" (e.g., "Ethnicity: Hispanic, Black, Asian +2 more")
- Truncation only applied to new chips (ethnicity, language, military); existing chips (parties, voted_in) unchanged
- One chip per filter type — dismissing removes all selections for that type
- Military status chip labeled "Military" (not "Military Status")
- Tooltip on hover for truncated chips only: shows full value list using shadcn Tooltip component

### Mailing address chips
- "Mail" prefix: "Mail City:", "Mail State:", "Mail Zip:"
- Registration chips stay as-is ("City:", "State:", "Zip:") — no prefix added
- Mailing chips grouped right after registration address chips in chip ordering

### Chip ordering
- Follows category groups, matching VoterFilterBuilder accordion section order within each group:
  - Demographics: party → age → gender → ethnicity → language → military
  - Scoring: gen. propensity → pri. propensity → comb. propensity
  - Location: city → state → zip → precinct → mail city → mail state → mail zip
  - Voting: voted_in → not_voted_in → congressional_district
  - Other: tags → registered after/before → has phone → match logic

### Category-colored chips
- All chips (legacy and new) color-coded by category via Tailwind className overrides on Badge:
  - Demographics (blue): bg-blue-100 text-blue-800
  - Location (green): bg-green-100 text-green-800
  - Scoring (amber): bg-amber-100 text-amber-800
  - Voting (purple): bg-purple-100 text-purple-800
  - Other (grey): bg-secondary (existing)
- Include dark: variants for all colors (e.g., dark:bg-blue-900 dark:text-blue-200) even though dark mode isn't currently enabled

### FilterChip component API
- FilterChipProps gains optional `className` (for category colors) and optional `tooltip` (for truncation) fields
- buildFilterChips returns `{label, onDismiss, className, tooltip?}` for each chip

### Missing legacy filter chips
- Add chips for ALL currently unchipped filter types: registered_after, registered_before, has_phone, logic (AND/OR)
- All assigned to grey (Other) category

### Chip behavior
- "Clear all" resets ALL filter types (legacy and new)
- Chip row keeps flex-wrap (no horizontal scroll or collapse)
- No animation on chip dismiss — instant removal
- Same aria-label pattern as existing: aria-label="Remove {label} filter"
- Loading: TanStack Query keepPreviousData handles smooth transitions (no special loading state)

### Shared formatting utility
- Extract chip label formatting and category assignment into shared utility (e.g., web/src/lib/filterChipUtils.ts)
- Both voter list page (dismissible chips) and voter list detail page (static chips) import it
- Voter list detail page ($listId.tsx) updated with category colors and human-readable labels (no dismiss button)

### Dynamic list dialog chips
- Dynamic list create/edit dialogs (lists/index.tsx) show dismissible filter chips below VoterFilterBuilder
- Same chip component and behavior as voter list page

### buildFilterChips implementation
- Keep if-block pattern (not data-driven refactoring) — each filter type has unique formatting
- Add new entries following existing pattern

### TypeScript type alignment
- VoterCreate: add all 12 missing fields as optional (propensity scores, household data, cell_phone_confidence, registration_zip4, registration_apartment_type, age, party_change_indicator)
- ImportJob: add phones_created as `number | null`
- voterSchema (Zod) in voter create form: expand to match VoterCreate with all 12 new fields as optional (no new form inputs though)

### phones_created display
- Import history table: new column showing phones_created count. Dash (—) for null (pre-Phase 24 imports), hidden for 0, number for >0.
- Import completion view (new.tsx): "X phones created" as separate line in green text (matching "X rows imported" format), only shown when > 0
- ImportProgress component: add phones count in progress stats row alongside imported/skipped/errors. Color: Claude's discretion.
- Number formatting: use .toLocaleString() for comma formatting (1,240)
- Column header label and position: Claude's discretion

### Testing
- Unit tests: focused tests for buildFilterChips covering propensity range labels (both bounds, single bound), multi-select truncation (2 values, 5 values), mailing prefix labels, category color assignment. ~8-10 test cases. File: web/src/lib/filterChipUtils.test.ts
- E2E tests: 4 Playwright scenarios — propensity range chip dismiss, multi-select chip dismiss, mailing address chip dismiss, Clear All with new chips. File: web/e2e/filter-chips.spec.ts
- Test data strategy: dual approach (create test voters with known values AND validate against seed data), matching Phase 27 pattern

### Claude's Discretion
- phones_created column label ("Phones" vs "Phones Created")
- phones_created column position in import history table
- phones_created color in ImportProgress stats row
- Exact dark mode color values
- E2E test internal implementation details

</decisions>

<specifics>
## Specific Ideas

- Filter chips should match VoterFilterBuilder accordion section ordering — users build a mental model of where filters live and chips should reinforce that
- Tooltip only on truncated multi-select chips (not all chips) to avoid tooltip fatigue
- Same FilterChip component reused everywhere — voter list page, voter list detail page, dynamic list dialogs
- Color-coding makes chip rows scannable when many filters are active (15+ chips possible)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FilterChip` component (`voters/index.tsx:54`): Badge + dismiss button — needs className and tooltip props added
- `buildFilterChips()` function (`voters/index.tsx:70`): Currently handles 11 filter types — expand with 12+ new entries
- `Badge` component (`components/ui/badge.tsx`): Accepts className for color overrides via cva
- `Tooltip` component (shadcn): Available for truncated chip hover behavior
- `ImportProgress` component (`components/voters/ImportProgress.tsx`): Shows imported/skipped/errors — add phones
- Import history table (`voters/imports/index.tsx`): TanStack Table columns — add phones_created column
- Import completion view (`voters/imports/new.tsx`): Shows stats — add phones_created line

### Established Patterns
- `const update = (partial: Partial<VoterFilter>) => onChange({ ...value, ...partial })` — filter update in VoterFilterBuilder
- Badge variant="secondary" with className override for custom colors
- keepPreviousData for smooth loading transitions
- .toLocaleString() for number formatting in stats displays

### Integration Points
- Voter list page (`voters/index.tsx`): Primary chip consumer — FilterChip, buildFilterChips, chip row rendering
- Voter list detail page (`voters/lists/$listId.tsx`): Static badge display — update to use shared formatting utility
- Dynamic list create/edit (`voters/lists/index.tsx`): Add dismissible chips below VoterFilterBuilder
- TypeScript types (`types/voter.ts`, `types/import-job.ts`): VoterCreate and ImportJob interfaces
- voterSchema Zod (`voters/index.tsx:34`): Expand to match VoterCreate
- New shared utility: `lib/filterChipUtils.ts` + `lib/filterChipUtils.test.ts`
- New E2E test: `e2e/filter-chips.spec.ts`

</code_context>

<deferred>
## Deferred Ideas

- Filter URL persistence — serialize filters to URL search params for shareable/refreshable filtered views
- Chip click-to-edit — clicking chip label opens/scrolls to filter section in panel (bidirectional coupling too complex for gap-closure phase)
- Filter count badge on "Filters" button showing total active filter count

</deferred>

---

*Phase: 28-filter-chips-frontend-type-coverage*
*Context gathered: 2026-03-15*
