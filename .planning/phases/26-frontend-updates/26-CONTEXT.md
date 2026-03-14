# Phase 26: Frontend Updates - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The web UI displays all new voter fields (propensity scores, mailing address, extended demographics, household data), exposes filter controls for new dimensions (propensity ranges, demographic multi-select, mailing address), supports editing expanded voter data, and updates import wizard column mapping for the expanded schema. TypeScript types updated to match backend. No backend schema changes, no new API endpoints except a distinct values endpoint for dynamic filter options.

</domain>

<decisions>
## Implementation Decisions

### Voter detail layout
- Expand existing card pattern — 4 cards left column, 3 cards right column
- Propensity scores displayed as color-coded badge chips (green 67-100, yellow 34-66, red 0-33)
- NULL propensity = grey "N/A" badge
- Hide cards entirely when ALL fields in that section are NULL (adaptive layout)
  - L2-imported voter: all cards visible
  - Manually-added voter: only Personal Info, Address, Registration, Activity
- Personal Info card expanded with demographics inline (flat list): language, marital status, military status added below ethnicity
- New Mailing Address card (right column) — mirrors registration address structure
- New Household card (right column) — size, party registration, family ID
- New Propensity Scores card (top of left column) — compact badge row
- Voting history displayed as year-grouped table inside Registration card (Year | General | Primary columns, checkmark/dot, descending sort)

### Filter builder organization
- Collapsible accordion sections replacing flat "show more" toggle:
  - Demographics: party, age, gender, ethnicity, language, military status
  - Location: city, state, zip, precinct, mailing city, mailing state, mailing zip
  - Political: congressional district, voting history (voted_in, not_voted_in)
  - Scoring: propensity general/primary/combined range sliders
  - Advanced: phone, registered after/before, filter logic (AND/OR)
- Badge count on collapsed section headers showing number of active filters (e.g., "Demographics (3)")
- "Clear all" button at top of filter panel — only visible when filters are active
- Demographic multi-select (ethnicity, language, military status): dynamic checkboxes populated from campaign's actual voter data via new API endpoint
- Propensity ranges: dual-handle range sliders (requires @radix-ui/react-slider or shadcn Slider)

### Distinct values API endpoint
- New endpoint: GET /api/campaigns/{id}/voters/distinct-values?fields=ethnicity,spoken_language,military_status
- Response: `{ "ethnicity": [{"value": "Hispanic", "count": 890}, ...], ... }` sorted by count descending
- Whitelisted fields only (ethnicity, spoken_language, military_status) — 400 error for unlisted fields
- Frontend caching: TanStack Query with staleTime of 5 minutes, invalidate on import completion

### Edit sheet scope & structure
- Wider sheet: max-w-xl (~36rem) with visual section headers using shadcn Separator
- Sections: Personal, Registration Address, Mailing Address
- Editable fields: name (first, middle, last, suffix), DOB, party, gender, ethnicity, language, marital status, military status, registration address (all fields), mailing address (all fields)
- Read-only fields (detail page only): propensity scores, household data (size, family_id, party_registration), cell_phone_confidence, party_change_indicator
- Mailing address section: collapsible — collapsed by default with "+ Add mailing address" link, auto-expanded if voter already has mailing data

### Column mapping dropdown
- Grouped dropdown using shadcn SelectGroup + SelectLabel: Personal, Registration Address, Mailing Address, Demographics, Propensity, Household, Political, Other
- Human-readable labels (e.g., "Registration Line 1" not "registration_line1") with a label map object
- Expand CANONICAL_FIELDS const array with all new fields from Phase 23

### Claude's Discretion
- Exact accordion component implementation (shadcn Collapsible, Accordion, or custom)
- Range slider component choice (@radix-ui/react-slider vs shadcn Slider)
- Zod validation schema details for expanded edit form
- Loading/skeleton states for distinct values fetch
- Exact color hex values for propensity badge thresholds
- Field ordering within edit sheet sections
- Whether search input is maintained within the filter panel

</decisions>

<specifics>
## Specific Ideas

- Voting history table uses checkmark (voted) and dot (did not vote) — visual scan pattern for campaign staff assessing voter reliability
- Propensity badge chips: compact inline display, not full-width progress bars — keeps the card small
- Dynamic checkboxes avoid maintaining hardcoded vendor-specific value lists — adapts to any L2 data variation
- Collapsible mailing address in edit sheet mirrors the hide-when-empty pattern on the detail page — consistent empty-data philosophy

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Card, CardHeader, CardTitle, CardContent (shadcn): Used in voter detail for all sections
- Badge component (shadcn): Used for tags, party display — reuse for propensity score chips
- Select, SelectGroup, SelectLabel, SelectItem (shadcn): Native grouping support for column mapping dropdown
- Progress component (shadcn): Available but NOT used for propensity (badges chosen instead)
- Checkbox (shadcn): Used for party filters, voting history — reuse for dynamic demographic filters
- useFormGuard hook: Prevents unsaved changes loss — already in VoterEditSheet
- TanStack Query: Established pattern for data fetching and caching throughout the app

### Established Patterns
- `const update = (partial: Partial<VoterFilter>) => onChange({ ...value, ...partial })` — filter update pattern in VoterFilterBuilder
- React Hook Form + zodResolver for form validation (VoterEditSheet)
- Server-side DataTable with manualSorting/manualFiltering/manualPagination
- Empty state handling with EmptyState component
- Toast notifications for success/error feedback on form submissions

### Integration Points
- TypeScript types (web/src/types/voter.ts): Voter interface needs ~25 new fields, VoterFilter needs ~12 new fields
- Voter detail page (web/src/routes/campaigns/$campaignId/voters/$voterId.tsx): Add new cards, expand existing cards
- VoterFilterBuilder (web/src/components/voters/VoterFilterBuilder.tsx): Complete restructure to accordion sections
- VoterEditSheet (web/src/components/voters/VoterEditSheet.tsx): Widen, add sections, expand fields
- ColumnMappingTable (web/src/components/voters/ColumnMappingTable.tsx): Expand CANONICAL_FIELDS, add grouping and labels
- Backend: New distinct values endpoint needed (voter service + router)
- Import completion: Invalidate distinct-values query cache

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-frontend-updates*
*Context gathered: 2026-03-14*
