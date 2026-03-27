# Architecture Patterns: v1.6 Production Ready Polish

**Domain:** Import alias expansion, RLS data isolation audit, sidebar navigation consolidation, in-app markdown guide pages
**Researched:** 2026-03-27
**Overall confidence:** HIGH (based on comprehensive codebase analysis of existing patterns)

## Feature 1: Import Alias Expansion + Alternate Voting History Formats

### Current Architecture

The import pipeline lives in `app/services/import_service.py` with three core mechanisms:

1. **CANONICAL_FIELDS dict** (lines 32-332): Maps canonical voter column names to lists of known aliases. The `suggest_field_mapping()` function uses RapidFuzz fuzzy matching at a 75% threshold against the flattened alias list.

2. **`_VOTING_HISTORY_RE` regex** (line 414): Currently `r"^(General|Primary)_(\d{4})$"` -- matches only `General_YYYY` and `Primary_YYYY` column patterns. Columns matching this regex with values of Y, A, or E are collected into the voter's `voting_history` array.

3. **`parse_voting_history()` function** (lines 418-429): Scans the raw CSV row dict keys against the regex, collecting matching columns into a sorted list.

### What Needs to Change

**A. New aliases for CANONICAL_FIELDS (MODIFY `import_service.py`)**

The CANONICAL_FIELDS dict needs additional L2 aliases that are currently missing. Based on the L2 VM2 Uniform format and common state voter file conventions, the missing aliases include:

| Canonical Field | Missing Aliases to Add |
|----------------|----------------------|
| `source_id` | `voters_voterbaseid`, `voter_base_id`, `l2_voterId` |
| `registration_line1` | `voters_residentialaddress`, `residential_address` |
| `registration_city` | `voters_residentialcity`, `residential_city` |
| `registration_state` | `voters_residentialstate`, `residential_state` |
| `registration_zip` | `voters_residentialzipcode`, `residential_zipcode` |
| `registration_county` | `voters_county` |
| `precinct` | `voters_precinct`, `voters_precinctid` |
| `congressional_district` | `voters_congressionaldistrict`, `us_cong_dist_abbrv` |
| `state_senate_district` | `voters_statesenatedistrict`, `nc_senate_abbrv` |
| `state_house_district` | `voters_statehousedistrict`, `nc_house_abbrv` |
| `registration_date` | `voters_registrationdate`, `registr_dt` |
| `party` | `voters_partyregistration`, `party_cd` |
| `date_of_birth` | `voters_dateofbirth` |
| `age` | `voters_calculatedage` |
| `gender` | `voters_sex` |
| `ethnicity` | `voters_ethnicity`, `ethnic_code` |
| `propensity_general` | `voters_generalturnoutscore` |
| `propensity_primary` | `voters_primaryturnoutscore` |
| `propensity_combined` | `voters_combinedturnoutscore` |

**Impact:** Pure data change to an existing dict. No structural changes. The `_ALIAS_LIST` and `_ALIAS_TO_FIELD` reverse lookups rebuild automatically from CANONICAL_FIELDS at module load time (lines 335-340).

**B. Alternate Voting History Column Formats (MODIFY `import_service.py`)**

The current regex `^(General|Primary)_(\d{4})$` only matches one naming convention. L2 voter files use at least two other conventions:

1. **Underscore-separated with abbreviation:** `GEN_2024`, `PRI_2024`, `GEN_2022`, `PRI_2022`
2. **No separator:** `General2024`, `Primary2024`, `General2020`, `Primary2020`
3. **State-specific abbreviated:** `G2024`, `P2024`, `G2022`, `P2022`
4. **Full year with election type prefix:** `Voters_VotingHistory_General_2024`, `Voters_VotingHistory_Primary_2024`

**Approach:** Replace the single regex with a list of regex patterns, each with a normalization function that maps matched columns to the canonical `General_YYYY` / `Primary_YYYY` format stored in `voting_history`.

```python
# Current (single regex):
_VOTING_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")

# Proposed (multi-pattern with normalization):
_VOTING_HISTORY_PATTERNS: list[tuple[re.Pattern, Callable[[re.Match], str]]] = [
    # Original format: General_2024, Primary_2024
    (re.compile(r"^(General|Primary)_(\d{4})$"),
     lambda m: f"{m.group(1)}_{m.group(2)}"),
    # Abbreviated: GEN_2024, PRI_2024
    (re.compile(r"^(GEN|PRI)_(\d{4})$", re.IGNORECASE),
     lambda m: f"{'General' if m.group(1).upper() == 'GEN' else 'Primary'}_{m.group(2)}"),
    # No separator: General2024, Primary2024
    (re.compile(r"^(General|Primary)(\d{4})$"),
     lambda m: f"{m.group(1)}_{m.group(2)}"),
    # Short: G2024, P2024
    (re.compile(r"^([GP])(\d{4})$", re.IGNORECASE),
     lambda m: f"{'General' if m.group(1).upper() == 'G' else 'Primary'}_{m.group(2)}"),
    # L2 long form: Voters_VotingHistory_General_2024
    (re.compile(r"^Voters_VotingHistory_(General|Primary)_(\d{4})$", re.IGNORECASE),
     lambda m: f"{m.group(1).capitalize()}_{m.group(2)}"),
]
```

**Modified `parse_voting_history()` function:**

```python
def parse_voting_history(row: dict[str, str]) -> list[str]:
    history: list[str] = []
    for col, val in row.items():
        for pattern, normalizer in _VOTING_HISTORY_PATTERNS:
            match = pattern.match(col)
            if match and val.strip().upper() in _VOTED_VALUES:
                history.append(normalizer(match))
                break  # first matching pattern wins
    return sorted(history)
```

**Impact:** The return format (`list[str]` of `General_YYYY`/`Primary_YYYY` entries) stays identical. The stored `voting_history` array in the Voter model is unchanged. The filter system on the frontend and backend already works with this format. No migration needed. No schema changes.

### Components Affected

| Component | File | Change Type | Scope |
|-----------|------|-------------|-------|
| CANONICAL_FIELDS dict | `app/services/import_service.py` | MODIFY | Add ~30 new alias entries |
| `_VOTING_HISTORY_RE` | `app/services/import_service.py` | REPLACE | Single regex -> pattern list |
| `parse_voting_history()` | `app/services/import_service.py` | MODIFY | Loop over pattern list |
| Unit tests | `tests/unit/test_import_parsing.py` | MODIFY | Add test cases for new patterns |
| Unit tests | `tests/unit/test_field_mapping.py` | MODIFY | Add test cases for new aliases |

### What Does NOT Change

- `ImportService` class methods (no structural changes)
- `suggest_field_mapping()` function (works automatically from expanded CANONICAL_FIELDS)
- `apply_field_mapping()` method (unchanged)
- `process_csv_batch()` method (unchanged)
- `process_import_file()` method (unchanged)
- API endpoints in `app/api/v1/imports.py` (unchanged)
- Frontend import wizard (unchanged)
- Voter model/schema (unchanged)
- Voting history filter system (unchanged -- already consumes `General_YYYY`/`Primary_YYYY` format)

---

## Feature 2: RLS Data Isolation Audit

### Current Architecture

The RLS implementation has three layers:

**Layer 1: PostgreSQL RLS Policies (33 policies across 6 migrations)**

All 33 RLS policies use `current_setting('app.current_campaign_id', true)::uuid` as the isolation predicate. Tables with direct `campaign_id` columns use a simple USING clause. Junction tables (voter_tag_members, voter_list_members, walk_list_entries, walk_list_canvassers, call_list_entries, session_callers, volunteer_tag_members, volunteer_availability, shift_volunteers, survey_questions) use subquery joins.

Migration-level audit was completed in v1.5 (noted in `001_initial_schema.py` header: "RLS AUDIT Phase 39, D-11").

**Layer 2: Connection Pool Defense (pool checkout event)**

`app/db/session.py` line 23-38: The `reset_rls_context()` event listener fires on every pool checkout, setting campaign context to a null UUID (`00000000-...`). This ensures no stale context survives pool reuse.

**Layer 3: Transaction-Scoped RLS Context**

`app/db/rls.py` line 27-30: `set_campaign_context()` uses `set_config(..., true)` to scope the campaign context to the current transaction. Context auto-resets at COMMIT/ROLLBACK.

**Layer 4: Centralized Dependency**

`app/api/deps.py` line 24-51: `get_campaign_db()` is the single dependency for all campaign-scoped endpoints. It extracts `campaign_id` from the URL path parameter and calls `set_campaign_context()` before yielding the session. 18 route files depend on it.

### What the Audit Needs to Verify

The audit is about verifying correctness at the data layer, not changing architecture. Key verification points:

**A. Cross-campaign population check (all scoped entities)**

The system has 33 RLS policies across these tables:

| Migration | Tables with RLS |
|-----------|----------------|
| 001 | campaigns, campaign_members, users |
| 002_invites | invites |
| 002_voter | voters, voter_phones, voter_tags, voter_tag_members, voter_lists, voter_list_members, voter_contacts, voter_interactions, import_jobs, field_mapping_templates |
| 003 | turfs, walk_lists, walk_list_entries, walk_list_canvassers, surveys, survey_questions, survey_responses |
| 004 | phone_bank_sessions, call_lists, call_list_entries, session_callers, dnc_entries |
| 005 | volunteers, volunteer_tags, volunteer_tag_members, volunteer_availability, shifts, shift_volunteers |

For EVERY table with RLS: query as campaign A, verify zero rows from campaign B are visible.

**B. Junction table leak vectors**

The riskiest tables are junction tables that use subquery-based RLS policies instead of direct `campaign_id` checks. These include:
- `voter_tag_members` (joins through `voters.campaign_id`)
- `voter_list_members` (joins through `voter_lists.campaign_id`)
- `walk_list_entries` (joins through `walk_lists.campaign_id`)
- `walk_list_canvassers` (joins through `walk_lists.campaign_id`)
- `call_list_entries` (joins through `call_lists.campaign_id`)
- `session_callers` (joins through `phone_bank_sessions.campaign_id`)
- `volunteer_tag_members` (joins through `volunteer_tags.campaign_id`)
- `volunteer_availability` (joins through `volunteers.campaign_id`)
- `shift_volunteers` (joins through `shifts.campaign_id`)
- `survey_questions` (joins through `surveys.campaign_id`)

**C. Non-RLS tables that should NOT have RLS**

These tables are correctly NOT RLS-scoped:
- `organizations` (cross-campaign by design)
- `organization_members` (org-level, not campaign-scoped)

### Components Affected

| Component | File | Change Type | Scope |
|-----------|------|-------------|-------|
| New test file | `tests/integration/test_rls_full_audit.py` | CREATE | Comprehensive cross-campaign test for all 33 tables |
| Existing tests | `tests/integration/test_rls_isolation.py` | VERIFY | Confirm pool reuse tests still pass |
| Existing tests | `tests/integration/test_rls_api_smoke.py` | VERIFY | Confirm API-level tests still pass |
| Seed data | `scripts/seed.py` or test conftest | MODIFY | May need second campaign's data for audit |

### What Does NOT Change

- No migration changes (policies are correct per v1.5 audit)
- No model changes
- No service/API changes
- No frontend changes
- No `deps.py` changes

### Recommended Audit Approach

Write an integration test that:
1. Creates two campaigns with data in every RLS-protected table
2. For each table: sets context to campaign A, queries table, asserts only campaign A data visible
3. Sets context to campaign B, queries same table, asserts only campaign B data visible
4. Tests junction tables specifically with cross-campaign ID injection attempts
5. Tests the pool checkout reset by reusing connections

This is a test-only deliverable. If any policy is found to be incorrect, the fix is a migration to correct the policy. Based on the v1.5 audit note in the migration header, this is expected to pass.

---

## Feature 3: Sidebar Navigation Consolidation

### Current Architecture

Navigation exists in TWO places:

**1. Sidebar (`__root.tsx` AppSidebar, lines 58-167)**

```
Campaign group (visible when campaignId in URL):
  - Dashboard
  - Voters
  - Canvassing
  - Phone Banking
  - Volunteers
  - Field Operations

Organization group (always visible when authenticated):
  - All Campaigns
  - Members (org_admin+)
  - Settings (org_admin+)

Footer (visible when campaignId, admin+):
  - Settings
```

**2. Inline tab bar (`$campaignId.tsx` CampaignLayout, lines 48-78)**

```
Dashboard | Voters | Canvassing | Phone Banking | Surveys | Volunteers
```

The duplication is clear: both the sidebar and the tab bar have Dashboard, Voters, Canvassing, Phone Banking, and Volunteers. The tab bar additionally has **Surveys** which the sidebar is missing.

### What Needs to Change

**A. Remove the inline tab bar from `$campaignId.tsx`**

The `CampaignLayout` component currently renders a `<nav>` with tabs (lines 67-78). Remove the entire `tabs` array and `<nav>` element. Keep the campaign name header and `<Outlet />`.

**B. Add Surveys to the sidebar in `__root.tsx`**

Add a Surveys nav item to the Campaign group in AppSidebar. The sidebar currently has 6 items; adding Surveys makes 7.

**C. Ensure sidebar active state is correct**

The sidebar uses `location.pathname.startsWith(item.to)` for active state detection. Since campaign sub-routes are nested under `/campaigns/$campaignId/...`, this pattern already works. No change needed.

### Components Affected

| Component | File | Change Type | Scope |
|-----------|------|-------------|-------|
| CampaignLayout | `web/src/routes/campaigns/$campaignId.tsx` | MODIFY | Remove tabs array and nav element, keep header + Outlet |
| AppSidebar | `web/src/routes/__root.tsx` | MODIFY | Add Surveys nav item with FileText icon |
| Sidebar imports | `web/src/routes/__root.tsx` | MODIFY | Add FileText to lucide-react imports (already imported in $campaignId.tsx) |

### What Does NOT Change

- No backend changes
- No route structure changes (routes are file-based, independent of navigation)
- No hook changes
- No TanStack Router configuration changes
- Field mode layout (separate layout, no sidebar)
- Organization nav group (already in sidebar)

### Specific Code Changes

**`__root.tsx` AppSidebar navItems array (line 63-70):**

```typescript
// Current:
const navItems = [
  { to: `/campaigns/${campaignId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
  { to: `/campaigns/${campaignId}/voters`, label: "Voters", icon: Users },
  { to: `/campaigns/${campaignId}/canvassing`, label: "Canvassing", icon: Map },
  { to: `/campaigns/${campaignId}/phone-banking`, label: "Phone Banking", icon: Phone },
  { to: `/campaigns/${campaignId}/volunteers`, label: "Volunteers", icon: ClipboardList },
  { to: `/field/${campaignId}`, label: "Field Operations", icon: Navigation },
]

// After (add Surveys between Phone Banking and Volunteers):
const navItems = [
  { to: `/campaigns/${campaignId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
  { to: `/campaigns/${campaignId}/voters`, label: "Voters", icon: Users },
  { to: `/campaigns/${campaignId}/canvassing`, label: "Canvassing", icon: Map },
  { to: `/campaigns/${campaignId}/phone-banking`, label: "Phone Banking", icon: Phone },
  { to: `/campaigns/${campaignId}/surveys`, label: "Surveys", icon: FileText },
  { to: `/campaigns/${campaignId}/volunteers`, label: "Volunteers", icon: ClipboardList },
  { to: `/field/${campaignId}`, label: "Field Operations", icon: Navigation },
]
```

**`$campaignId.tsx` CampaignLayout (lines 48-78):**

Remove the `tabs` array (lines 48-55) and the `<nav>` block (lines 67-78). The component becomes:

```tsx
function CampaignLayout() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" })
  const { data: campaign, isLoading, isError } = useQuery({...})

  if (isLoading) return <Skeleton ... />
  if (isError || !campaign) return <ErrorState ... />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{campaign?.name ?? "Campaign"}</h1>
        {campaign?.candidate_name && (
          <p className="text-sm text-muted-foreground">
            {campaign.candidate_name}
            {campaign.party_affiliation ? ` (${campaign.party_affiliation})` : ""}
          </p>
        )}
      </div>
      <Outlet />
    </div>
  )
}
```

The unused icon imports (`LayoutDashboard`, `Users`, `Map`, `Phone`, `ClipboardList`, `FileText`) can be removed from `$campaignId.tsx`.

---

## Feature 4: Progressive Volunteer Onboarding Guides (Markdown Pages)

### Current Architecture

The existing onboarding system uses **driver.js** for interactive in-app tours (`web/src/components/field/tour/tourSteps.ts`, `web/src/hooks/useTour.ts`, `web/src/stores/tourStore.ts`). These are step-by-step walkthroughs that highlight UI elements.

The v1.6 feature is different: it adds **static guide content** rendered from markdown source files. These are shareable, linkable pages that volunteers can read before arriving at a shift -- not interactive tours.

### Architecture Decision: How to Serve Markdown

**Option A: Build-time compilation with a Vite plugin (RECOMMENDED)**

Use a Vite plugin (`vite-plugin-md` or raw import + `react-markdown`) to import `.md` files as content at build time. The markdown content is bundled into the JavaScript output and rendered client-side.

**Option B: Runtime fetch from API endpoint**

Serve markdown files from a FastAPI endpoint. This requires backend changes and introduces a request for every page view.

**Option C: MDX with full component embedding**

Use MDX to embed React components in markdown. Powerful but unnecessary -- the guides are informational text, not interactive.

**Recommendation: Option A (build-time with `react-markdown`)**

Rationale:
- Guide content is static -- no need for runtime fetch
- `react-markdown` is the standard React markdown renderer (3.5M+ weekly npm downloads)
- Markdown files live in the codebase, are version-controlled, and are part of the build
- No backend changes needed
- Content updates require a new deploy, which is acceptable for guides that change infrequently
- `react-markdown` renders to standard React elements, so Tailwind prose styling works naturally

### New Components

**A. Markdown source files**

```
web/src/content/guides/
  getting-started.md          -- First-time volunteer orientation
  canvassing-guide.md         -- How to canvass door-to-door
  phone-banking-guide.md      -- How to make calls for the campaign
  faq.md                      -- Frequently asked questions
```

**B. Guide viewer component**

```
web/src/components/guides/GuideViewer.tsx
```

A generic markdown renderer component using `react-markdown` with Tailwind's `prose` class for typography. Accepts markdown content as a string prop.

```typescript
// GuideViewer.tsx (conceptual)
import ReactMarkdown from 'react-markdown'

export function GuideViewer({ content }: { content: string }) {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  )
}
```

**C. Guide routes**

These should be **public routes** (no auth required) so volunteers can read them before logging in. This means they need to be excluded from the auth redirect logic in `__root.tsx`.

```
web/src/routes/
  guides/
    index.tsx                  -- Guide listing page (card grid)
    $slug.tsx                  -- Individual guide page
```

**D. Route configuration changes**

In `__root.tsx`, the `PUBLIC_ROUTES` constant (line 56) needs `/guides` added:

```typescript
const PUBLIC_ROUTES = ["/login", "/callback", "/guides"]
```

This ensures the guide pages render without the sidebar shell and without requiring authentication.

**E. SPA fallback awareness**

The FastAPI SPA fallback in `app/main.py` (line 122-127) catches all non-API paths and returns `index.html`. Guide routes at `/guides/*` will be handled by the SPA fallback, which then lets TanStack Router render the correct component client-side. No backend changes needed.

### New Dependency

| Package | Version | Purpose | Size Impact |
|---------|---------|---------|-------------|
| `react-markdown` | ^9.x | Render markdown to React elements | ~40KB gzipped (with remark-parse, unified) |

Alternatively, use Vite's raw import (`?raw` suffix) to import markdown as strings, avoiding any plugin:

```typescript
import gettingStarted from '@/content/guides/getting-started.md?raw'
```

This is a Vite built-in feature -- no additional plugin needed. Combined with `react-markdown` for rendering, this is the lightest-weight approach.

### Components Affected

| Component | File | Change Type | Scope |
|-----------|------|-------------|-------|
| PUBLIC_ROUTES | `web/src/routes/__root.tsx` | MODIFY | Add `/guides` to public routes array |
| New: guide content | `web/src/content/guides/*.md` | CREATE | 4 markdown guide files |
| New: GuideViewer | `web/src/components/guides/GuideViewer.tsx` | CREATE | Markdown renderer component |
| New: guide listing | `web/src/routes/guides/index.tsx` | CREATE | Guide card grid page |
| New: guide page | `web/src/routes/guides/$slug.tsx` | CREATE | Individual guide route |
| package.json | `web/package.json` | MODIFY | Add `react-markdown` dependency |

### What Does NOT Change

- No backend API changes
- No database changes
- No auth flow changes (guides are public)
- No existing component modifications (except PUBLIC_ROUTES)
- driver.js tour system (remains separate and complementary)

### Navigation to Guides

Guides should be accessible from:
1. **Public URL** -- `/guides` and `/guides/getting-started` etc. for sharing
2. **Field mode help button** -- Optionally link from the FieldHeader help menu to relevant guide
3. **Sidebar** -- Optionally add a "Guides" link in the Organization group

The field mode FieldHeader already has an `onHelpClick` callback (in `$campaignId.tsx` line 62). This currently triggers driver.js tours. A secondary "Read Guide" link could be added alongside the tour trigger, linking to the relevant `/guides/*` page.

---

## Recommended Build Order

### Phase 1: Import Alias Expansion (backend only, isolated)

**Why first:**
- Smallest scope, lowest risk
- Pure data/logic change in one file (`import_service.py`)
- No dependencies on other features
- Immediately testable with unit tests
- Fixes real user friction (L2 files not auto-mapping)

**Dependency chain:**
```
Add new aliases to CANONICAL_FIELDS
  -> Add voting history patterns
    -> Update parse_voting_history()
      -> Add unit tests for new aliases
        -> Add unit tests for new voting history patterns
```

### Phase 2: Sidebar Consolidation (frontend only, isolated)

**Why second:**
- Very small scope (2 files modified)
- No backend dependencies
- Removes code (tab bar) rather than adding
- Quick visual verification with screenshots
- Reduces navigation confusion for all subsequent testing

**Dependency chain:**
```
Add Surveys + FileText to sidebar navItems (__root.tsx)
  -> Remove tab bar from CampaignLayout ($campaignId.tsx)
    -> Remove unused icon imports from $campaignId.tsx
      -> Visual verification (screenshot all campaign pages)
```

### Phase 3: RLS Audit (test-only, validates data layer)

**Why third:**
- Test-only deliverable -- writes new integration tests
- Does not modify production code (unless a bug is found)
- Benefits from sidebar consolidation being done (easier manual testing)
- Verifies the data isolation foundation before adding more features

**Dependency chain:**
```
Create two-campaign test fixture with data in all 33 RLS tables
  -> Write per-table isolation assertions
    -> Write junction table cross-reference tests
      -> Run full test suite
        -> Fix any discovered issues (migration if needed)
```

### Phase 4: Onboarding Guides (frontend + new dependency)

**Why last:**
- Requires new npm dependency (`react-markdown`)
- Creates new routes and components
- Content writing is separate from code work
- Does not block any other feature
- Least urgency for demo readiness

**Dependency chain:**
```
Install react-markdown
  -> Create GuideViewer component
    -> Create guide markdown content files
      -> Create guide routes (index + $slug)
        -> Add /guides to PUBLIC_ROUTES
          -> Optional: link from FieldHeader
            -> Visual verification (screenshot guide pages)
```

### Cross-Feature Dependencies

```
Phase 1 (Import) -----> Independent
Phase 2 (Sidebar) ----> Independent
Phase 3 (RLS Audit) --> Independent (but benefits from Phase 2 for manual testing)
Phase 4 (Guides) -----> Independent
```

**All four features are independent.** No cross-feature dependencies exist. They can theoretically be built in parallel, but the recommended order minimizes risk and provides early value.

---

## Summary: New vs Modified Components

### Backend -- Modified

| File | Change | Feature |
|------|--------|---------|
| `app/services/import_service.py` | Add ~30 aliases, replace voting history regex | Import Aliases |

### Backend -- New

| File | Purpose | Feature |
|------|---------|---------|
| None | -- | -- |

### Backend -- Test Only

| File | Purpose | Feature |
|------|---------|---------|
| `tests/unit/test_import_parsing.py` | New test cases for voting history patterns | Import Aliases |
| `tests/unit/test_field_mapping.py` | New test cases for expanded aliases | Import Aliases |
| `tests/integration/test_rls_full_audit.py` | Comprehensive cross-campaign isolation test | RLS Audit |

### Frontend -- Modified

| File | Change | Feature |
|------|--------|---------|
| `web/src/routes/__root.tsx` | Add Surveys nav item + FileText icon; add `/guides` to PUBLIC_ROUTES | Sidebar + Guides |
| `web/src/routes/campaigns/$campaignId.tsx` | Remove tabs array and nav element | Sidebar |
| `web/package.json` | Add `react-markdown` dependency | Guides |

### Frontend -- New

| File | Purpose | Feature |
|------|---------|---------|
| `web/src/content/guides/getting-started.md` | First-time volunteer guide | Guides |
| `web/src/content/guides/canvassing-guide.md` | Canvassing walkthrough | Guides |
| `web/src/content/guides/phone-banking-guide.md` | Phone banking walkthrough | Guides |
| `web/src/content/guides/faq.md` | Frequently asked questions | Guides |
| `web/src/components/guides/GuideViewer.tsx` | Markdown renderer component | Guides |
| `web/src/routes/guides/index.tsx` | Guide listing page | Guides |
| `web/src/routes/guides/$slug.tsx` | Individual guide page | Guides |

---

## Data Flow Diagrams

### Import Pipeline (after alias expansion)

```
CSV file uploaded to MinIO
  |
  v
detect_columns endpoint downloads first 8KB
  |
  v
ImportService.detect_columns() extracts headers
  |
  v
suggest_field_mapping() fuzzy-matches against EXPANDED CANONICAL_FIELDS
  (new aliases auto-map more L2 columns -> fewer manual corrections)
  |
  v
User confirms mapping (or tweaks in wizard UI)
  |
  v
Background task: process_import_file()
  |
  v
For each batch of 1000 rows:
  apply_field_mapping() maps CSV values to voter dicts
    |
    v
  parse_voting_history() now uses MULTI-PATTERN matching
    (GEN_2024 -> General_2024, G2024 -> General_2024, etc.)
    |
    v
  process_csv_batch() upserts voters + creates VoterPhone records
  |
  v
Voter.voting_history stores canonical ["General_2024", "Primary_2022", ...]
  (same format regardless of CSV column naming convention)
```

### Navigation Flow (after sidebar consolidation)

```
Authenticated user at /campaigns/$campaignId/*
  |
  v
__root.tsx RootLayout renders SidebarProvider
  |
  v
AppSidebar renders Campaign group with 7 items:
  Dashboard, Voters, Canvassing, Phone Banking,
  Surveys (NEW), Volunteers, Field Operations
  |
  v
$campaignId.tsx CampaignLayout renders:
  Campaign name header + <Outlet /> (NO TAB BAR)
  |
  v
Nested route component renders in Outlet
```

### Guide Pages Flow

```
User navigates to /guides (public, no auth required)
  |
  v
__root.tsx detects /guides in PUBLIC_ROUTES
  -> Renders without sidebar shell (just Outlet + Toaster)
  |
  v
TanStack Router matches /guides/index.tsx
  -> Renders card grid of available guides
  |
  v
User clicks guide card
  -> Navigates to /guides/$slug
  |
  v
$slug.tsx imports markdown via Vite ?raw suffix
  -> Passes content string to GuideViewer component
  |
  v
GuideViewer renders ReactMarkdown with Tailwind prose styling
```

## Sources

- Codebase analysis: `app/services/import_service.py` (CANONICAL_FIELDS, voting history regex, ImportService methods)
- Codebase analysis: `app/db/rls.py`, `app/db/session.py` (RLS context, pool checkout defense)
- Codebase analysis: `app/api/deps.py` (get_campaign_db centralized dependency)
- Codebase analysis: `alembic/versions/001-005` (all 33 RLS policies enumerated)
- Codebase analysis: `web/src/routes/__root.tsx` (sidebar navigation, PUBLIC_ROUTES)
- Codebase analysis: `web/src/routes/campaigns/$campaignId.tsx` (duplicate tab bar)
- Codebase analysis: `web/src/components/field/tour/tourSteps.ts` (existing driver.js onboarding)
- Codebase analysis: `app/main.py` (SPA fallback for client-side routing)
- Codebase analysis: `web/vite.config.ts` (Vite build pipeline, plugin configuration)
- Codebase analysis: `tests/integration/test_rls_isolation.py`, `test_rls_api_smoke.py` (existing RLS tests)
- [L2 National Voter File documentation](https://redivis.com/datasets/4r1c-d6j182y87) (voting history column formats: elec_date/elec_type)
- [L2 voter data guides](https://libguides.wustl.edu/L2_voter_data) (VM2 format documentation)
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) (markdown renderer for React, HIGH confidence)
- [L2 Documentation at Penn Libraries](https://guides.library.upenn.edu/L2/documentation) (VM2 Uniform Format File Layout)
- [Voter Reference Foundation - Vote History 101](https://www.voterreferencefoundation.com/voter-data-101-vote-history/) (voting history data patterns)
