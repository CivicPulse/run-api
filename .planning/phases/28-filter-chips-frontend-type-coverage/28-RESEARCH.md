# Phase 28: Filter Chips & Frontend Type Coverage - Research

**Researched:** 2026-03-15
**Domain:** React UI components (filter chips, Badge/Tooltip), TypeScript type alignment, Vitest unit testing, Playwright E2E
**Confidence:** HIGH

## Summary

Phase 28 is a frontend-only gap closure phase. The existing `buildFilterChips()` function in `voters/index.tsx` handles 11 legacy filter types but has zero entries for the 12 new filter dimensions added in Phases 25-27 (propensity ranges, multi-select demographics, mailing address). The `FilterChip` component is a simple Badge wrapper that needs two new optional props (`className` for category colors, `tooltip` for truncated multi-selects). TypeScript type mismatches exist in `VoterCreate` (missing 12 backend fields) and `ImportJob` (missing `phones_created`).

All building blocks already exist in the codebase: the `Badge` component accepts `className` via `cn()` (cva pattern), the `Tooltip` component from shadcn is available with `TooltipProvider` already at the app root (`main.tsx`), and the `buildFilterChips` pattern is straightforward if-block expansion. The primary complexity is in the chip label formatting (propensity range display, multi-select truncation, mailing prefix) and ensuring consistent formatting across three consumer pages (voters list, voter list detail, dynamic list dialogs).

**Primary recommendation:** Extract chip formatting into a shared utility (`lib/filterChipUtils.ts`) first, then wire it into all three consumer pages. Unit test the formatting logic directly (pure functions, no DOM needed). E2E tests validate chip visibility and dismiss behavior on the main voter list page.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Propensity chip format: abbreviated labels ("Gen. Propensity:", "Pri. Propensity:", "Comb. Propensity:") with dash notation ("50--80", "50--", "--80"). One chip per type, dismiss clears both bounds. No chip when at defaults (min=0 or max=100).
- Multi-select truncation: up to 3 values then "+N more". One chip per filter type. Tooltip on hover for truncated chips only (shadcn Tooltip). Applied only to new chips (ethnicity, language, military).
- Mailing address chip prefix: "Mail City:", "Mail State:", "Mail Zip:". Registration chips keep existing labels ("City:", "State:", "Zip:"). Mailing chips grouped right after registration address chips.
- Chip ordering follows VoterFilterBuilder accordion section order: Demographics (party, age, gender, ethnicity, language, military) -> Scoring (gen., pri., comb. propensity) -> Location (city, state, zip, precinct, mail city, mail state, mail zip) -> Voting (voted_in, not_voted_in, congressional_district) -> Other (tags, registered after/before, has phone, match logic)
- Category-colored chips via Tailwind className overrides on Badge: Demographics (blue: bg-blue-100 text-blue-800), Location (green: bg-green-100 text-green-800), Scoring (amber: bg-amber-100 text-amber-800), Voting (purple: bg-purple-100 text-purple-800), Other (grey: bg-secondary). Include dark: variants.
- FilterChipProps gains optional `className` and optional `tooltip` fields.
- buildFilterChips returns `{label, onDismiss, className, tooltip?}` for each chip.
- Missing legacy filter chips: add registered_after, registered_before, has_phone, logic (AND/OR). All grey (Other) category.
- "Clear all" resets ALL filter types. Chip row keeps flex-wrap. No animation on dismiss. Same aria-label pattern.
- Shared formatting utility in `web/src/lib/filterChipUtils.ts`. Both voter list page and voter list detail page import it.
- Dynamic list create/edit dialogs show dismissible filter chips below VoterFilterBuilder.
- Keep if-block pattern in buildFilterChips (not data-driven refactoring).
- VoterCreate: add all 12 missing fields as optional. ImportJob: add `phones_created` as `number | null`.
- voterSchema (Zod): expand to match VoterCreate with all 12 new fields as optional (no new form inputs).
- phones_created display: import history table new column, import completion view new line, ImportProgress stats row new count.
- Unit tests: ~8-10 test cases in `web/src/lib/filterChipUtils.test.ts`.
- E2E tests: 4 Playwright scenarios in `web/e2e/filter-chips.spec.ts`.

### Claude's Discretion
- phones_created column label ("Phones" vs "Phones Created")
- phones_created column position in import history table
- phones_created color in ImportProgress stats row
- Exact dark mode color values
- E2E test internal implementation details

### Deferred Ideas (OUT OF SCOPE)
- Filter URL persistence (serialize filters to URL search params)
- Chip click-to-edit (clicking chip opens/scrolls to filter section)
- Filter count badge on "Filters" button
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRNT-02 | VoterFilterBuilder includes controls for propensity ranges, ethnicity, language, military status with collapsible filter groups | Phase 27 wired all filter controls to POST /voters/search. Phase 28 adds dismissible filter chips for all filter dimensions and updates TypeScript types to match backend. The VoterFilterBuilder UI itself is complete -- this phase closes the chip visibility gap identified in the v1.3 audit (GAP 1). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19+ | Component library | Already in project |
| TypeScript | 5.x | Type safety | Already in project |
| Tailwind CSS | 4.x | Utility CSS for chip colors | Already in project, className overrides on Badge |
| shadcn/ui Badge | latest | Chip rendering base | Already in project at `components/ui/badge.tsx` |
| shadcn/ui Tooltip | latest | Truncated chip hover | Already in project at `components/ui/tooltip.tsx` |
| Vitest | 4.0.18 | Unit testing | Already configured at `web/vitest.config.ts` |
| Playwright | latest | E2E testing | Already configured at `web/playwright.config.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | latest | Component testing utilities | Already in test setup |
| happy-dom | 20.8.3 | Test DOM environment | Already configured |
| Zod | latest | Form schema validation | Expand voterSchema |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind className overrides | New Badge variants in cva | Overrides are simpler; new variants would pollute Badge component for project-specific colors |
| shadcn Tooltip | title attribute | Tooltip provides consistent styling and positioning; title has browser-dependent rendering |

## Architecture Patterns

### Recommended Project Structure
```
web/src/
  lib/
    filterChipUtils.ts          # NEW: shared formatting + category assignment
    filterChipUtils.test.ts     # NEW: unit tests
  routes/campaigns/$campaignId/
    voters/
      index.tsx                 # MODIFY: FilterChip component, buildFilterChips, chip rendering
    voters/lists/
      $listId.tsx               # MODIFY: use shared utility for static chip display
      index.tsx                 # MODIFY: add chips below VoterFilterBuilder in dialogs
    voters/imports/
      index.tsx                 # MODIFY: add phones_created column
      new.tsx                   # MODIFY: add phones_created display line
  components/voters/
    ImportProgress.tsx           # MODIFY: add phones count stat
  types/
    voter.ts                    # MODIFY: expand VoterCreate
    import-job.ts               # MODIFY: add phones_created
  e2e/
    filter-chips.spec.ts        # NEW: Playwright E2E
```

### Pattern 1: Shared Formatting Utility (filterChipUtils.ts)
**What:** Pure functions for chip label formatting and category color assignment. No React dependencies.
**When to use:** When multiple pages need the same chip formatting logic.
**Example:**
```typescript
// web/src/lib/filterChipUtils.ts

export type ChipCategory = "demographics" | "location" | "scoring" | "voting" | "other"

export const CATEGORY_CLASSES: Record<ChipCategory, string> = {
  demographics: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  location: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  scoring: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  voting: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  other: "", // Uses Badge default "secondary" variant styles
}

export interface ChipDescriptor {
  label: string
  category: ChipCategory
  className: string
  tooltip?: string
}

/** Format a propensity range chip label. Returns null if at default bounds. */
export function formatPropensityChip(
  prefix: string, // "Gen." | "Pri." | "Comb."
  min: number | undefined,
  max: number | undefined
): string | null {
  const hasMin = min !== undefined && min > 0
  const hasMax = max !== undefined && max < 100
  if (!hasMin && !hasMax) return null
  const minStr = hasMin ? String(min) : ""
  const maxStr = hasMax ? String(max) : ""
  return `${prefix} Propensity: ${minStr}\u2013${maxStr}`
}

/** Format a multi-select chip with truncation. */
export function formatMultiSelectChip(
  label: string,
  values: string[],
  maxVisible: number = 3
): { display: string; tooltip?: string } {
  if (values.length <= maxVisible) {
    return { display: `${label}: ${values.join(", ")}` }
  }
  const visible = values.slice(0, maxVisible).join(", ")
  const remaining = values.length - maxVisible
  return {
    display: `${label}: ${visible} +${remaining} more`,
    tooltip: values.join(", "),
  }
}
```

### Pattern 2: FilterChip Component Enhancement
**What:** Add className and tooltip optional props to existing FilterChip.
**When to use:** For all chips across the application.
**Example:**
```typescript
interface FilterChipProps {
  label: string
  onDismiss?: () => void  // Optional for static (detail page) chips
  className?: string
  tooltip?: string
}

function FilterChip({ label, onDismiss, className, tooltip }: FilterChipProps) {
  const badge = (
    <Badge variant="secondary" className={cn("gap-1 pr-1", className)}>
      {label}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
          aria-label={`Remove ${label} filter`}
        >
          x
        </button>
      )}
    </Badge>
  )

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    )
  }

  return badge
}
```

### Pattern 3: buildFilterChips Expansion (if-block pattern)
**What:** Add new if-blocks for each filter type, using shared formatting utility.
**When to use:** For the main voter list page (dismissible chips).
**Example:**
```typescript
// Inside buildFilterChips -- propensity example
const genLabel = formatPropensityChip("Gen.", filters.propensity_general_min, filters.propensity_general_max)
if (genLabel) {
  chips.push({
    label: genLabel,
    onDismiss: () => update({
      propensity_general_min: undefined,
      propensity_general_max: undefined,
    }),
    className: CATEGORY_CLASSES.scoring,
  })
}

// Multi-select example (ethnicity)
if (filters.ethnicities && filters.ethnicities.length > 0) {
  const { display, tooltip } = formatMultiSelectChip("Ethnicity", filters.ethnicities)
  chips.push({
    label: display,
    onDismiss: () => update({ ethnicities: undefined }),
    className: CATEGORY_CLASSES.demographics,
    tooltip,
  })
}
```

### Pattern 4: Voter List Detail Page (static chips via shared utility)
**What:** Replace raw `Object.entries` badge rendering with shared utility for human-readable labels.
**When to use:** On $listId.tsx for dynamic list filter criteria display.
**Example:**
```typescript
// Instead of:
//   filterChips.map(([key, val]) => <Badge>{key}: {display}</Badge>)
// Use shared utility to get category-colored, human-readable labels:
import { buildStaticChipDescriptors } from "@/lib/filterChipUtils"

const chipDescriptors = buildStaticChipDescriptors(parsedFilters)
// Render: chipDescriptors.map(d => <Badge className={d.className}>{d.label}</Badge>)
```

### Anti-Patterns to Avoid
- **Data-driven chip config objects:** The CONTEXT.md explicitly locks in the if-block pattern. Each filter type has unique formatting logic; a config array would add abstraction without reducing code.
- **Chip animation/transitions:** Explicitly deferred. Instant removal on dismiss.
- **Individual dismiss for multi-select values:** Each chip dismisses ALL values for that filter type, not individual values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip rendering | Custom hover popup | shadcn Tooltip (already available) | Accessible, positioned correctly, consistent styling |
| Color class management | Runtime style computation | Tailwind className constants | Build-time optimization, design system consistency |
| Number formatting | Custom formatter | `.toLocaleString()` | Handles commas, locale-aware, already used in project |
| Test DOM environment | Custom JSDOM setup | happy-dom via vitest.config.ts | Already configured with Radix mocks |

## Common Pitfalls

### Pitfall 1: Propensity Chip Default Detection
**What goes wrong:** Showing a chip for propensity range when bounds are at defaults (min=0, max=100).
**Why it happens:** The VoterFilter stores `undefined` for unset values, but after slider interaction and reset, the value might be `0` or `100` rather than `undefined`.
**How to avoid:** Check `min > 0 || max < 100` not just `min !== undefined || max !== undefined`. The PropensitySlider's `onValueCommit` already converts 0->undefined and 100->undefined, but guard against it in chip logic too.
**Warning signs:** Ghost chips appearing for propensity when no filter is active.

### Pitfall 2: Category Colors on Existing Chips
**What goes wrong:** Existing legacy chips (party, age, gender, city, etc.) lose their styling or get wrong colors.
**Why it happens:** Adding className to existing chip entries but forgetting to assign the correct category.
**How to avoid:** ALL existing chip entries must get a className from CATEGORY_CLASSES. Map each existing entry: party->demographics, age->demographics, gender->demographics, city->location, state->location, zip->location, precinct->location, voted_in->voting, not_voted_in->voting, congressional_district->voting, tags->other.
**Warning signs:** Some chips are grey while they should be colored.

### Pitfall 3: Tooltip Not Rendering Without TooltipProvider
**What goes wrong:** Tooltip doesn't appear on hover.
**Why it happens:** Radix Tooltip requires a TooltipProvider ancestor.
**How to avoid:** Already handled -- `TooltipProvider` is in `main.tsx` (app root). In tests, `render.tsx` wraps with `TooltipProvider`. No action needed.

### Pitfall 4: Badge className Override Specificity
**What goes wrong:** Custom color classes don't take effect because Badge's cva classes have higher specificity.
**Why it happens:** The `cn()` utility merges classes but Tailwind ordering can affect which styles win.
**How to avoid:** The Badge component uses `cn(badgeVariants({ variant }), className)` -- className comes AFTER variant, so it wins. Use `variant="secondary"` as the base and override with category colors. The "secondary" variant provides `bg-secondary text-secondary-foreground` which will be overridden by e.g., `bg-blue-100 text-blue-800`. This works because `cn()` from `clsx`+`twMerge` resolves conflicting utilities.

### Pitfall 5: Clear All Not Covering New Filter Types
**What goes wrong:** "Clear all" button resets to `{}` but some new filter types still show chips.
**Why it happens:** The existing `setFilters({})` already handles this correctly since `{}` has no properties. But if the `buildFilterChips` function checks for default values incorrectly, chips may persist.
**How to avoid:** The existing `setFilters({})` is correct. Just ensure chip logic checks for truthiness, not specific values.

### Pitfall 6: Chip Ordering Requires Reordering Existing Code
**What goes wrong:** Chips render in wrong order.
**Why it happens:** Currently, existing chips are in the order they appear in buildFilterChips. The CONTEXT.md specifies a specific category-group order. Existing chips need to be reordered within the function, not just appended at the end.
**How to avoid:** Restructure buildFilterChips to follow the specified order: demographics -> scoring -> location -> voting -> other. Move existing if-blocks into the correct position.

## Code Examples

### VoterCreate Type Expansion (12 missing fields)
```typescript
// web/src/types/voter.ts - VoterCreate interface
// Add these fields as optional:
export interface VoterCreate {
  // ... existing fields ...

  // Missing fields to add:
  registration_date?: string
  voting_history?: string[]
  propensity_general?: number
  propensity_primary?: number
  propensity_combined?: number
  age?: number
  party_change_indicator?: string
  cell_phone_confidence?: number
  latitude?: number
  longitude?: number
  household_id?: string
  household_party_registration?: string
  household_size?: number
  family_id?: string
  extra_data?: Record<string, unknown>
  source_id?: string
}
```

Note: The diff analysis shows 16 fields missing, but CONTEXT.md specifies "12 fields" focused on: propensity scores (3), household data (3: household_party_registration, household_size, family_id), cell_phone_confidence, registration_zip4 (already present), registration_apartment_type (already present), age, party_change_indicator. The remaining fields (latitude, longitude, extra_data, source_id, registration_date, voting_history, household_id) should also be added for complete alignment.

### ImportJob phones_created Addition
```typescript
// web/src/types/import-job.ts
export interface ImportJob {
  // ... existing fields ...
  phones_created: number | null  // NEW
}
```

### phones_created in Import History Table
```typescript
// In imports/index.tsx columns array, add before "created_at" column:
{
  accessorKey: "phones_created",
  header: "Phones",  // Claude's discretion: short label
  cell: ({ row }) => {
    const count = row.original.phones_created
    if (count === null) return <span className="text-muted-foreground">--</span>
    if (count === 0) return null  // Hidden for 0
    return <span className="font-medium text-blue-600">{count.toLocaleString()}</span>
  },
},
```

### phones_created in Import Completion View
```typescript
// In imports/new.tsx step 4, after imported_rows paragraph:
{jobQuery.data?.phones_created != null && jobQuery.data.phones_created > 0 && (
  <p className="text-sm">
    <span className="font-medium text-green-600">
      {jobQuery.data.phones_created.toLocaleString()}
    </span>{" "}
    phones created
  </p>
)}
```

### phones_created in ImportProgress Stats
```typescript
// In ImportProgress.tsx stats row, add after errors span:
{job.phones_created != null && job.phones_created > 0 && (
  <span>
    <span className="font-medium text-blue-600">
      {job.phones_created.toLocaleString()}
    </span>{" "}
    phones
  </span>
)}
```

### Zod Schema Expansion
```typescript
// In voters/index.tsx voterSchema
const voterSchema = z.object({
  // ... existing fields ...
  // New optional fields (no form inputs -- type coverage only):
  registration_date: z.string().optional(),
  propensity_general: z.number().optional(),
  propensity_primary: z.number().optional(),
  propensity_combined: z.number().optional(),
  age: z.number().optional(),
  party_change_indicator: z.string().optional(),
  cell_phone_confidence: z.number().optional(),
  household_party_registration: z.string().optional(),
  household_size: z.number().optional(),
  family_id: z.string().optional(),
  // ... etc
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| buildFilterChips in voters/index.tsx only | Shared filterChipUtils.ts | Phase 28 | Same formatting across voter list, detail, and dialog pages |
| Raw Object.entries for detail page chips | Shared utility with human-readable labels | Phase 28 | Better UX on detail page |
| No category colors | Category-colored chips via Tailwind | Phase 28 | Visual scanning of 15+ chips |
| GET /voters with query params | POST /voters/search (Phase 27) | Phase 27 | All filter dimensions wired; chips now have data to display |

## Open Questions

1. **Exact 12 fields for VoterCreate**
   - What we know: CONTEXT.md says "12 missing fields" listing propensity scores, household data, cell_phone_confidence, registration_zip4, registration_apartment_type, age, party_change_indicator. However, registration_zip4 and registration_apartment_type already exist in the frontend VoterCreate. The actual diff shows 16 fields missing.
   - What's unclear: Whether "12" is a precise count or approximate. The diff includes fields like latitude/longitude/extra_data/source_id/registration_date/voting_history/household_id.
   - Recommendation: Add ALL missing fields from backend VoterCreateRequest for complete alignment. CONTEXT.md intention is clearly "match backend" -- add all 16 missing fields.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + happy-dom 20.8.3 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run src/lib/filterChipUtils.test.ts` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FRNT-02-a | Propensity chip labels: both bounds, single bound, default bounds | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "propensity"` | Wave 0 |
| FRNT-02-b | Multi-select truncation: 2 values (no truncation), 5 values (truncated) | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "truncat"` | Wave 0 |
| FRNT-02-c | Mailing prefix chip labels | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "mailing"` | Wave 0 |
| FRNT-02-d | Category color assignment | unit | `cd web && npx vitest run src/lib/filterChipUtils.test.ts -t "category"` | Wave 0 |
| FRNT-02-e | Propensity chip dismiss clears filter and refreshes | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "propensity"` | Wave 0 |
| FRNT-02-f | Multi-select chip dismiss clears filter | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "multi-select"` | Wave 0 |
| FRNT-02-g | Mailing address chip dismiss | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "mailing"` | Wave 0 |
| FRNT-02-h | Clear All with new chips | e2e | `cd web && npx playwright test e2e/filter-chips.spec.ts -g "clear"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run src/lib/filterChipUtils.test.ts`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green + E2E green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/src/lib/filterChipUtils.ts` -- shared utility (new file)
- [ ] `web/src/lib/filterChipUtils.test.ts` -- unit tests covering propensity, truncation, mailing, categories
- [ ] `web/e2e/filter-chips.spec.ts` -- E2E tests (4 scenarios)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all referenced files (voters/index.tsx, types/voter.ts, types/import-job.ts, badge.tsx, tooltip.tsx, ImportProgress.tsx, VoterFilterBuilder.tsx, imports/index.tsx, imports/new.tsx, lists/$listId.tsx, lists/index.tsx)
- Backend schema inspection (app/schemas/voter.py VoterCreateRequest, app/schemas/import_job.py ImportJobResponse)
- v1.3 Milestone Audit (.planning/v1.3-MILESTONE-AUDIT.md) -- gap identification
- Vitest config (web/vitest.config.ts) and Playwright config (web/playwright.config.ts)
- Existing E2E patterns (web/e2e/phase27-filter-wiring.spec.ts)
- Test setup (web/src/test/setup.ts, web/src/test/render.tsx)

### Secondary (MEDIUM confidence)
- None needed -- this is entirely project-internal code with clear patterns to follow.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - extending existing patterns (if-blocks, Badge className, Tooltip)
- Pitfalls: HIGH - derived from direct code inspection of existing implementations
- Type alignment: HIGH - precise diff between backend Pydantic schema and frontend TS interface

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependency changes expected)
