# Phase 26: Frontend Updates - Research

**Researched:** 2026-03-14
**Domain:** React/TypeScript frontend -- voter detail, filter builder, edit sheet, import mapping
**Confidence:** HIGH

## Summary

Phase 26 updates the web UI to display and interact with the expanded voter model from Phases 23-25. The work spans five files: TypeScript types, voter detail page, filter builder, edit sheet, and column mapping table. A new backend endpoint (distinct values) and three new shadcn wrapper components (Accordion, Slider, Collapsible) are needed.

The most significant technical finding is a **field name mismatch**: the frontend Voter interface uses legacy field names (`address_line1`, `city`, `state`, `zip_code`, `county`) while the backend VoterResponse schema now uses `registration_line1`, `registration_city`, `registration_state`, `registration_zip`, `registration_county`. This rename was explicitly deferred to Phase 26 (documented in STATE.md). The VoterFilter type similarly uses `city`/`state`/`zip_code`/`county` while the backend VoterFilter uses `registration_city`/`registration_state`/`registration_zip`/`registration_county`. All frontend references to the old field names must be updated simultaneously.

**Primary recommendation:** Start with TypeScript types (FRNT-05) as the foundational change, then let the compiler guide all downstream file updates. Handle the field rename carefully since it touches the voter list page, voter detail page, voter list detail page, filter builder, filter chips, and DataTable column definitions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Expand existing card pattern -- 4 cards left column, 3 cards right column
- Propensity scores as color-coded badge chips (green 67-100, yellow 34-66, red 0-33), grey "N/A" for NULL
- Hide cards entirely when ALL fields in that section are NULL (adaptive layout)
- Personal Info card expanded with demographics inline: language, marital status, military status below ethnicity
- New Mailing Address card (right column) -- mirrors registration address structure
- New Household card (right column) -- size, party registration, family ID
- New Propensity Scores card (top of left column) -- compact badge row
- Voting history displayed as year-grouped table (Year | General | Primary columns, checkmark/dot, descending sort)
- Collapsible accordion sections replacing flat "show more" toggle with 5 groups: Demographics, Location, Political, Scoring, Advanced
- Badge count on collapsed section headers showing active filter count
- "Clear all" button at top of filter panel -- only visible when filters are active
- Dynamic checkboxes for ethnicity/language/military_status populated from campaign's actual voter data via new API endpoint
- Propensity ranges: dual-handle range sliders
- New endpoint: GET /api/campaigns/{id}/voters/distinct-values?fields=ethnicity,spoken_language,military_status with whitelisted fields, 400 for unlisted
- Frontend caching: TanStack Query staleTime 5 minutes, invalidate on import completion
- Wider edit sheet: max-w-xl (~36rem) with visual section headers using shadcn Separator
- Edit sheet sections: Personal, Registration Address, Mailing Address
- Editable fields: name (first, middle, last, suffix), DOB, party, gender, ethnicity, language, marital status, military status, registration address (all), mailing address (all)
- Read-only fields (detail page only): propensity scores, household data, cell_phone_confidence, party_change_indicator
- Mailing address section: collapsible -- collapsed by default, auto-expanded if voter has mailing data
- Grouped dropdown using shadcn SelectGroup + SelectLabel with groups: Personal, Registration Address, Mailing Address, Demographics, Propensity, Household, Political, Other
- Human-readable labels (e.g., "Registration Line 1" not "registration_line1")
- Expand CANONICAL_FIELDS const array with all new fields from Phase 23

### Claude's Discretion
- Exact accordion component implementation (shadcn Collapsible, Accordion, or custom)
- Range slider component choice (@radix-ui/react-slider vs shadcn Slider)
- Zod validation schema details for expanded edit form
- Loading/skeleton states for distinct values fetch
- Exact color hex values for propensity badge thresholds
- Field ordering within edit sheet sections
- Whether search input is maintained within the filter panel

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRNT-01 | Voter detail page displays propensity scores, mailing address, demographics, and household data in organized sections | Voter detail page structure analyzed; backend VoterResponse schema with all new fields documented; field rename mapping identified; adaptive card visibility pattern defined |
| FRNT-02 | VoterFilterBuilder includes controls for propensity ranges, ethnicity, language, military status with collapsible filter groups | Current filter builder analyzed; new VoterFilter fields mapped (6 propensity range fields, 3 multi-select arrays, 3 mailing address fields); accordion/slider components available via radix-ui; distinct values endpoint pattern defined |
| FRNT-03 | VoterEditSheet includes editable fields for all new voter columns | Current edit sheet analyzed (5 fields); expansion to ~20+ editable fields mapped; Zod 4 + RHF 7 patterns confirmed; Collapsible for mailing address section |
| FRNT-04 | ColumnMappingTable includes all new canonical fields for import wizard column mapping | Current CANONICAL_FIELDS (23 entries) vs backend (40+ entries) gap identified; SelectGroup/SelectLabel for grouped dropdown already available in shadcn Select; label map pattern defined |
| FRNT-05 | TypeScript Voter and VoterFilter interfaces updated to match backend schemas | Full field-by-field diff between frontend types and backend schemas completed; critical field rename (address_line1->registration_line1, city->registration_city, etc.) identified with all downstream impact points |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI framework | Already installed |
| TypeScript | 5.9.3 | Type safety | Already installed |
| TanStack Query | 5.90.21 | Data fetching/caching | Established pattern throughout app |
| React Hook Form | 7.71.1 | Form state management | Used in VoterEditSheet, VoterCreateForm |
| Zod | 4.3.6 | Schema validation | Used with zodResolver for all forms |
| ky | 1.14.3 | HTTP client | API client wrapper established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| radix-ui | 1.4.3 | UI primitives | Already installed -- includes Accordion, Slider, Collapsible primitives |
| shadcn/ui | 3.8.4 (dev) | Component wrappers | Add Accordion, Slider, Collapsible wrappers via `npx shadcn@latest add` |
| lucide-react | 0.563.0 | Icons | Check, Minus (for voting history), ChevronDown (for accordion) |
| sonner | 2.0.7 | Toast notifications | Success/error feedback on edit form |

### No New Dependencies Needed
All required Radix primitives (react-accordion, react-slider, react-collapsible) are already installed as transitive dependencies of the `radix-ui@1.4.3` package. Only shadcn wrapper components need to be generated.

**Installation (shadcn components only):**
```bash
cd web && npx shadcn@latest add accordion slider collapsible
```

## Architecture Patterns

### Critical: Field Name Rename Mapping

The backend renamed address fields in Phase 23. The frontend still uses old names. Phase 26 must update all references.

| Old Frontend Name | New Backend Name | Files Affected |
|-------------------|-----------------|----------------|
| `address_line1` | `registration_line1` | voter.ts, VoterEditSheet, voters/index (create form), voter detail |
| `address_line2` | `registration_line2` | voter.ts, voter detail |
| `city` | `registration_city` | voter.ts, VoterFilterBuilder, voters/index (columns, chips, create form), voter detail, list detail |
| `state` | `registration_state` | voter.ts, VoterFilterBuilder, voters/index (columns, chips, create form), voter detail |
| `zip_code` | `registration_zip` | voter.ts, VoterFilterBuilder, voters/index (chips, create form), voter detail |
| `county` | `registration_county` | voter.ts, VoterFilterBuilder, voter detail |
| `zip_plus4` | `registration_zip4` | voter.ts (new field -- not present in current frontend) |
| `apartment_type` | `registration_apartment_type` | voter.ts (new field -- not present in current frontend) |

**Strategy:** Update `Voter` interface first, then follow TypeScript compiler errors to find every file that needs updating. This is safer than grep-and-replace since the compiler will catch every usage.

### New Fields to Add to Voter Interface

Fields present in backend VoterResponse but missing from frontend Voter interface:

```typescript
// Registration Address (renamed from flat names)
registration_line1: string | null    // was address_line1
registration_line2: string | null    // was address_line2
registration_city: string | null     // was city
registration_state: string | null    // was state
registration_zip: string | null      // was zip_code
registration_zip4: string | null     // new
registration_county: string | null   // was county
registration_apartment_type: string | null  // new

// Mailing Address (all new)
mailing_line1: string | null
mailing_line2: string | null
mailing_city: string | null
mailing_state: string | null
mailing_zip: string | null
mailing_zip4: string | null
mailing_country: string | null
mailing_type: string | null

// Propensity Scores (all new)
propensity_general: number | null
propensity_primary: number | null
propensity_combined: number | null

// Demographics (new additions)
spoken_language: string | null
marital_status: string | null
military_status: string | null
party_change_indicator: string | null
cell_phone_confidence: number | null

// Household (partially new)
household_party_registration: string | null
household_size: number | null
family_id: string | null
```

### New Fields to Add to VoterFilter Interface

```typescript
// Must match backend VoterFilter field names exactly
// Renamed fields
registration_city?: string     // was city
registration_state?: string    // was state
registration_zip?: string      // was zip_code
registration_county?: string   // was county

// Propensity ranges (new)
propensity_general_min?: number
propensity_general_max?: number
propensity_primary_min?: number
propensity_primary_max?: number
propensity_combined_min?: number
propensity_combined_max?: number

// Multi-select demographics (new)
ethnicities?: string[]
spoken_languages?: string[]
military_statuses?: string[]

// Mailing address (new)
mailing_city?: string
mailing_state?: string
mailing_zip?: string
```

### Pattern: Accordion Filter Sections

**Recommendation:** Use shadcn Accordion component (wraps @radix-ui/react-accordion). It provides built-in open/close state management, animation, keyboard navigation, and ARIA attributes. Supports `type="multiple"` for independent section control.

```typescript
// Source: @radix-ui/react-accordion API
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

<Accordion type="multiple" defaultValue={["demographics"]}>
  <AccordionItem value="demographics">
    <AccordionTrigger>
      Demographics {activeCount > 0 && <Badge>{activeCount}</Badge>}
    </AccordionTrigger>
    <AccordionContent>
      {/* party, age, gender, ethnicity, language, military status */}
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

### Pattern: Dual-Handle Range Slider

**Recommendation:** Use shadcn Slider component (wraps @radix-ui/react-slider). Radix Slider natively supports multiple thumbs via `defaultValue={[min, max]}`.

```typescript
// Source: @radix-ui/react-slider API
import { Slider } from "@/components/ui/slider"

<Slider
  min={0}
  max={100}
  step={1}
  value={[value.propensity_general_min ?? 0, value.propensity_general_max ?? 100]}
  onValueChange={([min, max]) => update({
    propensity_general_min: min === 0 ? undefined : min,
    propensity_general_max: max === 100 ? undefined : max,
  })}
/>
```

### Pattern: Propensity Score Badge

```typescript
function PropensityBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null || score === undefined) {
    return <Badge variant="secondary" className="bg-gray-100 text-gray-500">{label}: N/A</Badge>
  }
  const color = score >= 67
    ? "bg-green-100 text-green-800"
    : score >= 34
    ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800"
  return <Badge className={color}>{label}: {score}</Badge>
}
```

### Pattern: Voting History Year-Grouped Table

The backend stores voting history as `string[]` with format `"{Type}_{Year}"` (e.g., `"General_2024"`, `"Primary_2022"`). Display as a year-grouped table:

```typescript
function parseVotingHistory(history: string[] | null) {
  if (!history?.length) return []
  const yearMap = new Map<number, { general: boolean; primary: boolean }>()
  for (const entry of history) {
    const match = entry.match(/^(General|Primary)_(\d{4})$/)
    if (match) {
      const type = match[1] as "General" | "Primary"
      const year = Number(match[2])
      const record = yearMap.get(year) ?? { general: false, primary: false }
      record[type.toLowerCase() as "general" | "primary"] = true
      yearMap.set(year, record)
    }
  }
  return Array.from(yearMap.entries())
    .sort(([a], [b]) => b - a) // descending by year
}
```

### Pattern: Distinct Values Hook

```typescript
// New hook: useDistinctValues
interface DistinctValueEntry { value: string; count: number }
type DistinctValuesResponse = Record<string, DistinctValueEntry[]>

export function useDistinctValues(campaignId: string, fields: string[]) {
  return useQuery({
    queryKey: ["voters", campaignId, "distinct-values", fields],
    queryFn: () =>
      api.get(`api/v1/campaigns/${campaignId}/voters/distinct-values`, {
        searchParams: { fields: fields.join(",") },
      }).json<DistinctValuesResponse>(),
    enabled: !!campaignId && fields.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

### Pattern: Grouped Column Mapping Dropdown

```typescript
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"

const FIELD_GROUPS = {
  "Personal": ["first_name", "middle_name", "last_name", "suffix", "date_of_birth", "gender", "age"],
  "Registration Address": ["registration_line1", "registration_line2", "registration_city", ...],
  "Mailing Address": ["mailing_line1", "mailing_line2", "mailing_city", ...],
  // ... etc
}

const FIELD_LABELS: Record<string, string> = {
  registration_line1: "Registration Line 1",
  mailing_line1: "Mailing Line 1",
  // ...
}

<SelectContent>
  <SelectItem value={SKIP_VALUE}>(skip)</SelectItem>
  {Object.entries(FIELD_GROUPS).map(([group, fields]) => (
    <SelectGroup key={group}>
      <SelectLabel>{group}</SelectLabel>
      {fields.map(field => (
        <SelectItem key={field} value={field}>
          {FIELD_LABELS[field] ?? field}
        </SelectItem>
      ))}
    </SelectGroup>
  ))}
</SelectContent>
```

### Files That Need Changes

| File | Nature of Change | Complexity |
|------|-----------------|------------|
| `web/src/types/voter.ts` | Add ~25 new fields to Voter, rename 6 fields; add ~12 new fields to VoterFilter, rename 4; update VoterCreate/VoterUpdate | HIGH -- foundational |
| `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` | New cards (Propensity, Mailing Address, Household), expand Personal Info, add voting history table, adaptive card visibility | HIGH -- significant UI |
| `web/src/components/voters/VoterFilterBuilder.tsx` | Complete restructure to accordion sections; add propensity sliders, dynamic demographic checkboxes, mailing address fields | HIGH -- full rewrite |
| `web/src/components/voters/VoterEditSheet.tsx` | Widen sheet, add sections with Separator, expand from 5 to ~20 editable fields, collapsible mailing address | MEDIUM |
| `web/src/components/voters/ColumnMappingTable.tsx` | Expand CANONICAL_FIELDS, add grouping with SelectGroup/SelectLabel, add label map | MEDIUM |
| `web/src/hooks/useVoters.ts` | No changes needed -- filter serialization is generic | NONE |
| `web/src/routes/campaigns/$campaignId/voters/index.tsx` | Update column accessors (city->registration_city), filter chips for renamed+new fields, VoterCreateForm field names | MEDIUM |
| `web/src/routes/campaigns/$campaignId/voters/lists/$listId.tsx` | Update column accessor (city->registration_city) | LOW |
| `web/src/components/voters/VoterFilterBuilder.test.tsx` | Update tests for accordion structure | MEDIUM |
| `web/src/components/voters/ColumnMappingTable.test.tsx` | Update tests for grouped dropdown | LOW |
| `app/api/v1/voters.py` | Add distinct-values endpoint | MEDIUM |
| `app/services/voter.py` | Add distinct_values method | LOW |

### Backend: Distinct Values Endpoint

The backend needs a new endpoint. Follow the existing pattern in `app/api/v1/voters.py`:

```python
ALLOWED_DISTINCT_FIELDS = {"ethnicity", "spoken_language", "military_status"}

@router.get("/campaigns/{campaign_id}/voters/distinct-values")
async def distinct_values(
    campaign_id: uuid.UUID,
    fields: str = Query(..., description="Comma-separated field names"),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    requested = {f.strip() for f in fields.split(",")}
    invalid = requested - ALLOWED_DISTINCT_FIELDS
    if invalid:
        raise HTTPException(400, f"Fields not allowed: {', '.join(invalid)}")
    # ... query distinct values with counts
```

### Anti-Patterns to Avoid

- **Partial field rename:** Do NOT rename some fields but leave others with old names. The entire Voter interface must be updated atomically or TypeScript will silently allow accessing undefined fields.
- **Hardcoded demographic values:** Do NOT create `ETHNICITY_OPTIONS = ["White", "Black", ...]`. Use the distinct values endpoint for dynamic population. L2 has 50+ ethnicity values that vary by state.
- **Separate slider state:** Do NOT maintain separate React state for slider values. Use the same `VoterFilter` object and `update()` pattern for consistency.
- **Nested form objects in RHF:** Do NOT use nested `address.line1` paths in React Hook Form. Keep flat field names (`registration_line1`) matching the backend API.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accordion sections | Custom toggle/collapse logic | shadcn Accordion (type="multiple") | Handles keyboard nav, ARIA, animation, open/close state |
| Range slider | Two separate number inputs | shadcn Slider with dual thumbs | Radix Slider supports multiple thumbs natively, handles drag, keyboard, and touch |
| Collapsible mailing section | Custom show/hide toggle | shadcn Collapsible | Handles animation, ARIA, forceMount for form field preservation |
| Filter count badges | Manual count calculation | Utility function extracting active count from VoterFilter per section | Keeps badge logic testable and separate from UI |
| Voting history parsing | Inline string splitting | Dedicated `parseVotingHistory()` utility | Testable, reusable, handles edge cases (unknown formats, missing data) |

## Common Pitfalls

### Pitfall 1: Stale VoterFilter field names break API calls
**What goes wrong:** Frontend sends `city` in filter query params, backend VoterFilter schema expects `registration_city`. Pydantic v2 silently ignores unknown fields, so the filter is not applied and returns unfiltered results.
**Why it happens:** The GET /voters endpoint manually maps old names to VoterFilter, but the POST /voters/search endpoint (used for advanced filtering) uses the VoterFilter schema directly.
**How to avoid:** Rename ALL filter field names in the frontend VoterFilter type to match backend exactly. Update all components that reference old names.
**Warning signs:** Filters appear to "not work" -- selecting a city filter returns all voters instead of filtered results.

### Pitfall 2: Form field persistence across Collapsible toggle
**What goes wrong:** Collapsing the mailing address section in the edit sheet destroys form inputs, losing any typed data.
**Why it happens:** React unmounts children when Collapsible closes unless `forceMount` is used.
**How to avoid:** Use `forceMount` on CollapsibleContent and hide with CSS (`data-[state=closed]:hidden`) instead of unmounting.
**Warning signs:** User types mailing address, collapses section, re-opens to find fields empty.

### Pitfall 3: Accordion value type mismatch
**What goes wrong:** Accordion sections don't open/close properly.
**Why it happens:** Radix Accordion `type="single"` expects `value: string`, but `type="multiple"` expects `value: string[]`. Mixing them causes type errors or runtime bugs.
**How to avoid:** Always use `type="multiple"` with `string[]` for filter sections since users want multiple sections open simultaneously.
**Warning signs:** Opening one section closes another unexpectedly.

### Pitfall 4: Slider onValueChange fires on mount
**What goes wrong:** Opening the Scoring filter section immediately triggers filter API calls with default 0-100 range values.
**Why it happens:** Some Radix Slider implementations fire onValueChange during initial render.
**How to avoid:** Only call `update()` when slider values differ from current filter values. Use `onValueCommit` instead of `onValueChange` if available, or add a guard: `if (min === (value.propensity_general_min ?? 0) && max === (value.propensity_general_max ?? 100)) return`.
**Warning signs:** Network tab shows API calls immediately when expanding the Scoring section.

### Pitfall 5: VoterCreate form still uses old field names
**What goes wrong:** Creating a new voter fails or saves with empty address fields.
**Why it happens:** VoterCreateForm in voters/index.tsx uses `address_line1`, `city`, `state`, `zip_code` but backend VoterCreateRequest expects `registration_line1`, `registration_city`, etc.
**How to avoid:** Update VoterCreate type and VoterCreateForm simultaneously with Voter type changes.
**Warning signs:** TypeScript errors in VoterCreateForm after updating types.

### Pitfall 6: Distinct values query cache not invalidated on import
**What goes wrong:** After importing a new L2 file with new ethnicity values, the filter checkboxes still show the old values for 5 minutes.
**Why it happens:** staleTime of 5 minutes means TanStack Query won't refetch.
**How to avoid:** Invalidate the distinct-values query key in the import completion handler (in useImportJob or wherever import success is detected).
**Warning signs:** New filter options only appear after page refresh.

## Code Examples

### Complete Updated Voter Interface (verified against backend VoterResponse)

```typescript
export interface Voter {
  id: string
  campaign_id: string
  source_type: string
  source_id: string | null

  first_name: string | null
  middle_name: string | null
  last_name: string | null
  suffix: string | null
  date_of_birth: string | null
  gender: string | null

  // Registration Address
  registration_line1: string | null
  registration_line2: string | null
  registration_city: string | null
  registration_state: string | null
  registration_zip: string | null
  registration_zip4: string | null
  registration_county: string | null
  registration_apartment_type: string | null

  // Mailing Address
  mailing_line1: string | null
  mailing_line2: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  mailing_zip4: string | null
  mailing_country: string | null
  mailing_type: string | null

  // Political
  party: string | null
  precinct: string | null
  congressional_district: string | null
  state_senate_district: string | null
  state_house_district: string | null
  registration_date: string | null

  // Voting history
  voting_history: string[] | null

  // Propensity Scores
  propensity_general: number | null
  propensity_primary: number | null
  propensity_combined: number | null

  // Demographics
  ethnicity: string | null
  age: number | null
  spoken_language: string | null
  marital_status: string | null
  military_status: string | null
  party_change_indicator: string | null
  cell_phone_confidence: number | null

  // Geographic
  latitude: number | null
  longitude: number | null

  // Household
  household_id: string | null
  household_party_registration: string | null
  household_size: number | null
  family_id: string | null

  // Extras
  extra_data: Record<string, unknown> | null

  // Metadata
  created_at: string
  updated_at: string
}
```

### Complete Updated VoterFilter Interface (verified against backend VoterFilter)

```typescript
export interface VoterFilter {
  search?: string
  party?: string
  parties?: string[]
  registration_city?: string
  registration_state?: string
  registration_zip?: string
  registration_county?: string
  precinct?: string
  congressional_district?: string
  age_min?: number
  age_max?: number
  gender?: string
  voted_in?: string[]
  not_voted_in?: string[]
  tags?: string[]
  tags_any?: string[]
  registered_after?: string
  registered_before?: string
  has_phone?: boolean

  // Propensity score ranges
  propensity_general_min?: number
  propensity_general_max?: number
  propensity_primary_min?: number
  propensity_primary_max?: number
  propensity_combined_min?: number
  propensity_combined_max?: number

  // Multi-select demographics
  ethnicities?: string[]
  spoken_languages?: string[]
  military_statuses?: string[]

  // Mailing address
  mailing_city?: string
  mailing_state?: string
  mailing_zip?: string

  logic?: "AND" | "OR"
}
```

### Expanded CANONICAL_FIELDS with Grouping and Labels

```typescript
export const FIELD_GROUPS: Record<string, string[]> = {
  Personal: [
    "first_name", "middle_name", "last_name", "suffix",
    "date_of_birth", "gender", "age",
  ],
  "Registration Address": [
    "registration_line1", "registration_line2", "registration_city",
    "registration_state", "registration_zip", "registration_zip4",
    "registration_county", "registration_apartment_type",
  ],
  "Mailing Address": [
    "mailing_line1", "mailing_line2", "mailing_city",
    "mailing_state", "mailing_zip", "mailing_zip4",
    "mailing_country", "mailing_type",
  ],
  Demographics: [
    "ethnicity", "spoken_language", "marital_status", "military_status",
  ],
  Propensity: [
    "propensity_general", "propensity_primary", "propensity_combined",
  ],
  Household: [
    "household_id", "household_party_registration", "household_size", "family_id",
  ],
  Political: [
    "party", "precinct", "congressional_district",
    "state_senate_district", "state_house_district",
    "registration_date",
  ],
  Other: [
    "source_id", "email", "phone", "cell_phone_confidence",
    "party_change_indicator", "latitude", "longitude", "notes",
    "full_name", "address", "last_vote_date",
  ],
}

export const FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  suffix: "Suffix",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  age: "Age",
  registration_line1: "Registration Line 1",
  registration_line2: "Registration Line 2",
  registration_city: "Registration City",
  registration_state: "Registration State",
  registration_zip: "Registration ZIP",
  registration_zip4: "Registration ZIP+4",
  registration_county: "Registration County",
  registration_apartment_type: "Apartment Type",
  mailing_line1: "Mailing Line 1",
  mailing_line2: "Mailing Line 2",
  mailing_city: "Mailing City",
  mailing_state: "Mailing State",
  mailing_zip: "Mailing ZIP",
  mailing_zip4: "Mailing ZIP+4",
  mailing_country: "Mailing Country",
  mailing_type: "Mailing Type",
  ethnicity: "Ethnicity",
  spoken_language: "Language",
  marital_status: "Marital Status",
  military_status: "Military Status",
  propensity_general: "General Propensity",
  propensity_primary: "Primary Propensity",
  propensity_combined: "Combined Propensity",
  household_id: "Household ID",
  household_party_registration: "Household Party Reg.",
  household_size: "Household Size",
  family_id: "Family ID",
  party: "Party",
  precinct: "Precinct",
  congressional_district: "Congressional District",
  state_senate_district: "State Senate District",
  state_house_district: "State House District",
  registration_date: "Registration Date",
  source_id: "Voter ID",
  email: "Email",
  phone: "Phone",
  cell_phone_confidence: "Cell Phone Confidence",
  party_change_indicator: "Party Change Indicator",
  latitude: "Latitude",
  longitude: "Longitude",
  notes: "Notes",
  full_name: "Full Name",
  address: "Address",
  last_vote_date: "Last Vote Date",
}

// Flat array for backward compatibility and validation
export const CANONICAL_FIELDS = Object.values(FIELD_GROUPS).flat()
```

### Active Filter Count per Section

```typescript
function countActiveFilters(filters: VoterFilter, section: string): number {
  const checks: Record<string, () => boolean> = {
    demographics: () => [
      filters.parties?.length, filters.age_min, filters.age_max,
      filters.gender, filters.ethnicities?.length,
      filters.spoken_languages?.length, filters.military_statuses?.length,
    ].some(Boolean),
    location: () => [
      filters.registration_city, filters.registration_state,
      filters.registration_zip, filters.precinct,
      filters.mailing_city, filters.mailing_state, filters.mailing_zip,
    ].some(Boolean),
    political: () => [
      filters.congressional_district,
      filters.voted_in?.length, filters.not_voted_in?.length,
    ].some(Boolean),
    scoring: () => [
      filters.propensity_general_min, filters.propensity_general_max,
      filters.propensity_primary_min, filters.propensity_primary_max,
      filters.propensity_combined_min, filters.propensity_combined_max,
    ].some(v => v !== undefined),
    advanced: () => [
      filters.has_phone !== undefined, filters.registered_after,
      filters.registered_before, filters.logic && filters.logic !== "AND",
    ].some(Boolean),
  }
  // More granular counting can be implemented per section
  return checks[section]?.() ? 1 : 0  // Simplified; expand for exact counts
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat field names (city, state) | Prefixed names (registration_city) | Phase 23 (backend) | Frontend must catch up in Phase 26 |
| Flat filter list with "More" toggle | Accordion sections with filter groups | Phase 26 (this phase) | Better UX for 20+ filter dimensions |
| 5-field edit sheet | 20+ field sectioned edit sheet | Phase 26 (this phase) | Full voter data editing capability |
| Simple dropdown column mapping | Grouped dropdown with labels | Phase 26 (this phase) | Better discoverability for 40+ fields |
| Year-only voting history | Type_Year format (General_2024) | Phase 24/25 (backend) | Frontend display needs parsing |

## Open Questions

1. **GET /voters endpoint field mapping**
   - What we know: The GET endpoint uses `city`/`state`/`county` as query params but the backend VoterFilter has `registration_city`/`registration_state`/`registration_county`. The GET endpoint constructs `VoterFilter(city=city, ...)` which Pydantic v2 ignores (unknown fields).
   - What's unclear: Whether the GET endpoint's basic filtering actually works for location fields currently. It likely does not since `city` is not a valid VoterFilter field.
   - Recommendation: Fix the GET endpoint query param mapping to use `registration_city`/`registration_state`/`registration_county`/`registration_zip` while updating the frontend. The POST /search endpoint already works correctly since it accepts the full VoterFilter body.

2. **Dynamic list filter_query backward compatibility**
   - What we know: Dynamic voter lists store filter criteria as JSON `filter_query` with old field names (`city`, `state`, `zip_code`).
   - What's unclear: Whether existing saved dynamic lists will break when VoterFilter field names change.
   - Recommendation: The POST /search endpoint uses the backend VoterFilter which already has the new field names. Saved lists with old field names (`city`) will have those fields silently ignored by Pydantic v2. This means existing dynamic lists with location filters will silently stop filtering by location. A migration or compatibility layer may be needed -- but this is arguably pre-existing since the backend field rename happened in Phase 23.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (unit), Playwright 1.58.2 (e2e) |
| Config file | web/vitest.config.ts (unit), web/playwright.config.ts (e2e) |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run --reporter=verbose && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FRNT-05 | TypeScript Voter and VoterFilter interfaces match backend | unit (tsc) | `cd web && npx tsc --noEmit` | N/A (compiler check) |
| FRNT-01 | Voter detail shows propensity, mailing, demographics, household | e2e | `cd web && npx playwright test e2e/phase26-voter-detail.spec.ts` | No -- Wave 0 |
| FRNT-02 | Filter builder has accordion sections, sliders, dynamic checkboxes | unit | `cd web && npx vitest run src/components/voters/VoterFilterBuilder.test.tsx` | Yes (needs update) |
| FRNT-03 | Edit sheet has all new editable fields | unit | `cd web && npx vitest run src/components/voters/VoterEditSheet.test.tsx` | No -- Wave 0 |
| FRNT-04 | Column mapping has all new fields with grouping | unit | `cd web && npx vitest run src/components/voters/ColumnMappingTable.test.tsx` | Yes (needs update) |

### Sampling Rate
- **Per task commit:** `cd web && npx tsc --noEmit && npx vitest run --reporter=verbose`
- **Per wave merge:** Full unit suite + TypeScript check
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `web/src/components/voters/VoterFilterBuilder.test.tsx` -- update existing tests for accordion structure (currently tests flat layout and "More filters" toggle which will be removed)
- [ ] `web/src/components/voters/ColumnMappingTable.test.tsx` -- update for grouped dropdown and expanded fields
- [ ] shadcn component installation: `cd web && npx shadcn@latest add accordion slider collapsible`

## Sources

### Primary (HIGH confidence)
- Backend VoterResponse schema: `app/schemas/voter.py` -- all field names and types verified
- Backend VoterFilter schema: `app/schemas/voter_filter.py` -- all filter field names verified
- Backend CANONICAL_FIELDS: `app/services/import_service.py` -- all 40+ canonical fields verified
- Frontend voter.ts types: `web/src/types/voter.ts` -- current state documented
- Frontend component files: VoterEditSheet.tsx, VoterFilterBuilder.tsx, ColumnMappingTable.tsx, voter detail page -- all analyzed
- package.json: All dependency versions confirmed from installed packages
- Radix UI primitives: @radix-ui/react-accordion, react-slider, react-collapsible all confirmed installed

### Secondary (MEDIUM confidence)
- STATE.md decision: "frontend field renames deferred to Phase 26" -- confirmed this phase owns the rename
- Radix Slider dual-thumb support: API confirmed from installed package, standard usage pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified from package.json and node_modules
- Architecture: HIGH -- all patterns derived from analyzing existing codebase files and verified backend schemas
- Pitfalls: HIGH -- field name mismatch verified by comparing frontend types to backend schemas; form persistence pitfall is well-documented React pattern

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable -- no external dependency changes expected)
