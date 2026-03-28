# Feature Landscape: v1.6 Production Ready Polish

**Domain:** Campaign field operations platform -- import UX, data isolation verification, navigation consolidation, volunteer onboarding guides
**Researched:** 2026-03-27
**Overall confidence:** HIGH (all four feature areas are well-understood domains with strong codebase evidence)

## Table Stakes

Features users expect in a production-ready campaign platform. Missing = import friction drives users to competitors, duplicated navigation confuses new users, volunteers arrive without context.

| Feature | Why Expected | Complexity | Depends On | Notes |
|---------|--------------|------------|------------|-------|
| L2 file imports without manual column mapping | L2 is the dominant voter data vendor; campaigns buy L2 files and expect upload-then-go | Medium | Existing import service, CANONICAL_FIELDS alias dict | Current system has ~30 L2 aliases but misses key variations; RapidFuzz 75% threshold fails on dissimilar L2 headers like "Residence_Addresses_AddressLine" vs "registration_line1" |
| Voting history column format flexibility | L2 files use `General_YYYY`/`Primary_YYYY` format but real exports vary (underscore vs no-underscore, abbreviations, multi-word election types) | Low | `_VOTING_HISTORY_RE` regex in import_service.py | Current regex `^(General|Primary)_(\d{4})$` is strict; needs to handle `General_Election_YYYY`, `Gen_YYYY`, `Prim_YYYY`, and potentially `GeneralElection_YYYY` |
| Single navigation hierarchy (no duplicate tabs) | Users see sidebar nav AND inline ModuleLayout tab bar for the same module -- confusing, wastes vertical space, violates "single source of truth" navigation principle | Medium | Sidebar in `__root.tsx`, ModuleLayout in 4 route layouts | Sidebar handles top-level modules; ModuleLayout handles sub-sections within modules. These need merging. |
| Surveys accessible from sidebar | Surveys route exists (`/campaigns/$campaignId/surveys`) but is not in sidebar navigation; only reachable via direct URL or phone banking context | Low | `__root.tsx` AppSidebar navItems array | Literally adding one entry to the navItems array plus an icon import |
| Campaign data isolation verification | Users trust that their voter data is invisible to other campaigns; must be provably true across all 15 campaign-scoped models | High | Existing RLS infrastructure, 2800+ lines of existing RLS tests | Tests exist for voters, canvassing, phone banking, volunteers -- need systematic audit across ALL 15 models for both read and write paths |
| Volunteer-facing onboarding documentation | Volunteers arrive at shift start with zero training; need quick-reference guides accessible without login | Medium | Existing driver.js tour system (in-app), need public static pages | Current tours are interactive overlays requiring authentication; need separate shareable documentation |

## Differentiators

Features that set the product apart. Not universally expected, but significantly improve the demo/production experience.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| Zero-touch L2 import (upload-to-completion with no manual mapping) | Campaigns using L2 files get one-click import; eliminates the mapping step entirely for recognized formats | Medium | Expanded alias dictionary, L2 format auto-detection, import wizard UI changes | Detect L2 format from column name patterns (e.g., presence of "LALVOTERID" or "Voters_" prefix), auto-apply complete mapping, skip mapping step in wizard |
| Format auto-detection with confidence scoring | Show users a confidence indicator (e.g., "98% of columns auto-mapped") so they trust the auto-mapping without reviewing every field | Low | `suggest_field_mapping()` return value enhancement | Currently returns dict of column->field or None; add a confidence score per mapping and an overall percentage |
| Smart import wizard that adapts steps | If all columns map at 100% confidence, skip the mapping step; if some fail, show only unmapped columns for manual attention | Medium | Frontend wizard step logic, backend confidence scoring | Current wizard always shows 4 steps; progressive reduction for recognized formats |
| Collapsible sidebar with sub-navigation | Replace ModuleLayout inline tabs with sidebar sub-menus that expand under each module; single navigation surface | Medium | shadcn/ui Sidebar collapsible subgroups, route structure | Linear, Notion, and Stripe all use this pattern; sidebar expands to show sub-items on click |
| Progressive onboarding guide system | Markdown-authored guides rendered as public pages AND referenceable from in-app context | Medium | react-markdown library, new `/guides` public routes | Markdown source files enable non-developer editing; public routes enable sharing via URL/QR code |
| Cross-campaign audit report | Automated test suite that verifies data isolation across all entities and produces a human-readable report | Medium | Existing RLS test infrastructure, pytest fixtures | Value for compliance demos and stakeholder trust |

## Anti-Features

Features to explicitly NOT build for v1.6. Including rationale so these do not creep in.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| AI/LLM-based column mapping | Adds external dependency, latency, cost, and unpredictability to a deterministic problem solvable with a comprehensive alias dictionary | Expand the CANONICAL_FIELDS alias dictionary to cover all known L2, TargetSmart, and state voter file column naming patterns; RapidFuzz at 75% threshold handles fuzzy variations |
| Custom navigation layout builder | Lets users rearrange sidebar items; massive complexity for no campaign-operations value | Fixed sidebar order matching workflow priority (Dashboard > Voters > Canvassing > Phone Banking > Surveys > Volunteers > Field Ops) |
| Video onboarding tutorials | Production costs, hosting costs, maintenance burden when UI changes; text/image guides update trivially | Markdown guides with annotated screenshots; cheaper to produce and maintain |
| Interactive onboarding playground/sandbox | Fake data sandbox environment for practice; enormous infrastructure cost | Real guided tours via driver.js (already built) plus static guides with screenshots |
| Per-vendor import profile configuration UI | Admin screen to define custom vendor import profiles with field mappings | System-level templates via FieldMappingTemplate model (already exists) plus auto-detection; no UI needed for what's a one-time backend configuration |
| Real-time import progress via WebSocket | Push-based import progress updates | Current polling via TanStack Query refetchInterval works fine for imports that take 5-30 seconds; SSE/WS adds complexity for marginal UX gain |
| Full WCAG AAA audit for v1.6 | Already have WCAG AA from v1.5; AAA is aspirational and massive scope | Maintain AA compliance on new features; defer AAA to a dedicated accessibility milestone |

## Feature Dependencies

```
L2 alias expansion --> Zero-touch auto-detection --> Smart wizard step reduction
                                                 --> Confidence scoring display

Sidebar consolidation --> Remove ModuleLayout --> Add sub-navigation groups
                     --> Add Surveys to sidebar

Markdown guide authoring --> Public route for guides --> In-app help link integration
                        --> QR code generation for shift handouts

RLS audit framework --> Per-model isolation tests --> Cross-population fix if found
                   --> Audit report generation
```

## Detailed Feature Analysis

### 1. Zero-Touch CSV Import for L2 Voter Files

**Current state:** The import wizard is a 4-step flow: Upload > Map Columns > Preview > Progress. The `suggest_field_mapping()` function uses RapidFuzz at a 75% threshold against a known alias dictionary. For L2 files, approximately 30 aliases are defined covering the `Voters_`, `Residence_Addresses_`, `Parties_`, `EthnicGroups_`, and `CommercialData_` prefixes.

**Problem:** When a user uploads a standard L2 export, the auto-mapping catches most fields but misses enough that the mapping step requires manual intervention. The voting history regex only handles `General_YYYY` and `Primary_YYYY` exactly, missing format variations. This makes L2 imports 3-click instead of 1-click.

**What "zero-touch" means for this codebase:**

1. **Expand alias dictionary** (CANONICAL_FIELDS in import_service.py):
   - Add all known L2 VM2 Uniform Format column names as aliases
   - L2 uses camelCase-ish naming with underscores: `Voters_FirstName`, `Voters_LastName`, `Residence_Addresses_AddressLine`, `Residence_Addresses_City`, `Residence_Addresses_State`, `Residence_Addresses_Zip`, `Residence_Addresses_Latitude`, `Residence_Addresses_Longitude`, etc.
   - Add `LALVOTERID` as source_id alias (the L2 unique voter identifier)
   - Add propensity score variations: `General_Turnout_Score`, `Primary_Turnout_Score`, `Combined_Turnout_Score` (note underscores differ from current aliases which use no underscores)
   - Add `Voters_RegistrationDate`, `Voters_PrecinctID`, `Voters_OfficialRegParty`
   - Confidence: MEDIUM -- exact column names vary by L2 export type (VM2 Uniform vs VM2 Demographic vs custom extracts). The alias list should be validated against an actual L2 file export.

2. **Expand voting history regex** (parse_voting_history in import_service.py):
   - Current: `^(General|Primary)_(\d{4})$`
   - Add: `^(General|Primary)_Election_(\d{4})$`, `^(Gen|Prim)_(\d{4})$`
   - Consider: `^(GeneralElection|PrimaryElection)_(\d{4})$`
   - L2's standard format is `General_YYYY` and `Primary_YYYY` (current regex handles this), but some custom exports may use longer forms
   - Confidence: MEDIUM -- need to validate against real L2 file samples

3. **L2 format auto-detection** (new logic in import_service.py or detect endpoint):
   - Detect L2 format when CSV headers contain `LALVOTERID` or multiple columns matching `Voters_*` pattern
   - When detected: apply a pre-built "L2 VM2" system template instead of fuzzy matching
   - Set source_type to "l2" automatically
   - Confidence: HIGH -- pattern detection is deterministic and testable

4. **Smart wizard step reduction** (import wizard in new.tsx):
   - After detect+suggest, compute mapping confidence: `mapped_count / total_column_count`
   - If confidence >= 95% (nearly all columns mapped), offer "Quick Import" button that skips mapping review
   - If confidence < 95%, show mapping step as normal but highlight only unmapped columns
   - Never fully skip the mapping step without user consent -- always show a "Review mapping" option
   - Confidence: HIGH -- well-understood UX pattern

**Complexity: Medium** -- backend alias expansion is straightforward; auto-detection logic is simple pattern matching; frontend wizard changes are moderate.

### 2. Campaign Data Isolation Verification

**Current state:** Transaction-scoped RLS context (v1.5) with defense-in-depth pool checkout event. Centralized `get_campaign_db` dependency. Approximately 2,800 lines of RLS integration tests covering voters, canvassing, phone banking, and volunteers.

**Problem:** While the infrastructure is solid, the project description specifically calls out "audit and fix any campaign data cross-population across all scoped entities." This implies a systematic verification across all 15 campaign-scoped models, not just the 4 modules currently tested.

**What systematic audit means for this codebase:**

1. **Entity inventory** -- 15 models with campaign_id:
   - campaign_member, phone_bank, survey, turf, volunteer, voter_contact, voter_interaction, voter_list, walk_list, call_list, dnc, import_job, invite, shift, voter
   - Currently tested: voter, turf/walk_list (canvassing), phone_bank/call_list (phone banking), volunteer/shift
   - Missing test coverage: survey, voter_contact, voter_interaction, voter_list, dnc, import_job, invite, campaign_member

2. **Test pattern per entity:**
   - Create record in campaign A
   - Attempt to read/list/update/delete from campaign B context
   - Verify: read returns empty/404, write returns 403/404
   - Verify: list endpoint never leaks records across campaigns

3. **Edge cases to verify:**
   - Nested entities (voter_contact belongs to voter which belongs to campaign)
   - Cross-entity joins (walk_list references turf; call_list references phone_bank)
   - Import jobs: can campaign B see campaign A's import history?
   - Invites: campaign-scoped but also reference org -- verify isolation
   - Surveys: used across phone banking sessions -- verify session-survey isolation

4. **Fix scope:** If cross-population is found, the fix is adding missing RLS policies or WHERE clauses. Based on the v1.5 centralized `get_campaign_db` work, this is unlikely but must be verified.

**Complexity: High** -- not because any individual test is complex, but because there are 8+ untested models, each needing 4+ test scenarios (read, list, create, update, delete across campaign boundaries), plus edge cases for nested relationships.

### 3. Navigation Consolidation

**Current state:** Dual navigation surfaces:
- **Sidebar** (`__root.tsx` AppSidebar): Dashboard, Voters, Canvassing, Phone Banking, Volunteers, Field Operations, plus org-level items
- **ModuleLayout inline tabs** (4 layouts): Voters (All/Lists/Tags/Imports), Phone Banking (Sessions/Call Lists/DNC/My Sessions), Volunteers (Roster/Tags/Register/Shifts), Settings (General/Members/Danger Zone)
- **Missing from sidebar:** Surveys (route exists at `/campaigns/$campaignId/surveys`)
- **Canvassing:** Has no ModuleLayout (just an Outlet wrapper); sub-navigation is within the index page

**Problem:** Users see the same module listed in the sidebar AND get a secondary tab bar within each module. This creates visual noise, wastes vertical space on mobile, and violates the "single navigation hierarchy" principle. On mobile especially, the ModuleLayout horizontal scrolling pill tabs compete with the collapsible sidebar.

**What consolidation means for this codebase:**

1. **Option A: Sidebar sub-menus (recommended)**
   - Expand sidebar with collapsible sub-items under each module
   - Voters > All Voters, Lists, Tags, Imports
   - Phone Banking > Sessions, Call Lists, DNC, My Sessions
   - Volunteers > Roster, Tags, Register, Shifts
   - Surveys (top-level, single page)
   - Settings > General, Members, Danger Zone
   - Remove ModuleLayout component entirely
   - Each sub-route renders directly in the main content area
   - **Why this option:** shadcn/ui Sidebar already supports collapsible subgroups (SidebarMenuSub, SidebarMenuSubItem). This is the pattern used by Linear, Notion, and most modern SaaS tools. Single navigation surface reduces cognitive load.

2. **Option B: Keep ModuleLayout, remove sidebar module-level items**
   - Sidebar only shows "Campaign" (top-level), then inline tabs handle sub-navigation
   - **Why NOT this option:** Sidebar becomes nearly empty for campaign context; wastes the navigation rail. ModuleLayout's horizontal scrolling tabs are problematic on mobile.

3. **Option C: Breadcrumb-based navigation**
   - Remove both, use breadcrumbs + content-area navigation
   - **Why NOT this option:** Requires page loads to navigate between siblings; much worse than sidebar sub-items for rapid switching.

4. **Implementation steps:**
   - Add SidebarMenuSub/SidebarMenuSubItem for each module's children
   - Refactor the 4 ModuleLayout route files to just render `<Outlet />`
   - Add Surveys entry to sidebar
   - Update mobile sidebar behavior (sub-items visible when parent expanded)
   - Verify all deep-link routes still work
   - Update active-state highlighting for nested routes

**Complexity: Medium** -- shadcn/ui Sidebar already provides the sub-menu primitives; the refactoring is mechanical (4 route layouts, 1 sidebar component). Risk is in route matching for active states with nested URLs.

### 4. Progressive Volunteer Onboarding Guides

**Current state:** Interactive driver.js tours for three segments: welcome (4 steps), canvassing (5 steps), phone banking (3 steps). Tours fire on first visit and can be replayed via help button. Tours are authenticated -- require login and active campaign assignment. Tour state persists in Zustand store (`tourStore`).

**Problem:** Volunteers need reference material BEFORE arriving at a shift (shared via text/email/printout), and DURING a shift when they forget a step but don't want to replay the full tour. Current tours are ephemeral overlays, not persistent reference documentation.

**What progressive onboarding guides means for this codebase:**

1. **Markdown source files** (new directory: `web/src/content/guides/` or `docs/guides/`):
   - `getting-started.md` -- What is CivicPulse Run, how to sign up, what to expect
   - `canvassing-guide.md` -- Step-by-step door knocking workflow with screenshots
   - `phone-banking-guide.md` -- Step-by-step phone banking workflow
   - `volunteer-faq.md` -- Common questions (what if nobody answers, what if they're hostile, what if my phone dies)
   - Markdown because: non-developers can edit, version-controlled, renders to both web and printable formats

2. **Public route rendering** (new routes: `/guides`, `/guides/:slug`):
   - No authentication required
   - Renders markdown to HTML via react-markdown
   - Styled with shadcn/ui typography (prose classes via @tailwindcss/typography)
   - Responsive layout optimized for mobile reading
   - Print-friendly CSS for shift handouts

3. **In-app help integration:**
   - Add "Help & Guides" link to sidebar (always visible, not campaign-scoped)
   - Add contextual "View guide" links in field mode headers
   - Help button in FieldHeader.tsx can link to relevant guide section

4. **Technology choice:**
   - **Use react-markdown** (not MDX) because: guides are pure content, no interactive components needed; lighter bundle; simpler build pipeline; already using remark ecosystem implicitly through other deps
   - Import markdown files as strings via Vite's `?raw` import
   - Add `@tailwindcss/typography` for prose styling
   - Confidence: HIGH -- react-markdown is the standard for this pattern

5. **Progressive disclosure structure in guides:**
   - Quick-start summary at top (3-5 bullet points, 30-second read)
   - Expandable sections for detailed steps
   - "What if..." troubleshooting sections at bottom
   - Follows NNGroup progressive disclosure pattern: essential info visible, advanced info one click away

**Complexity: Medium** -- react-markdown rendering is trivial; the work is in writing quality guide content, designing the public page layout, and wiring in-app help links. Content authoring is the bottleneck, not code.

## MVP Recommendation

Prioritize features in this order based on impact and dependencies:

1. **L2 alias expansion + voting history regex** (table stakes, low-medium complexity, highest import friction reduction)
   - Backend only, no UI changes needed for alias expansion
   - Immediately improves auto-mapping accuracy for L2 files

2. **Navigation consolidation + Surveys in sidebar** (table stakes, medium complexity, visible polish)
   - Single navigation surface removes the most visible UX confusion
   - Surveys becoming discoverable fills a feature gap

3. **Zero-touch import wizard (smart step reduction)** (differentiator, medium complexity, depends on #1)
   - After aliases are expanded, the confidence scoring and step-skipping logic builds naturally
   - Makes L2 imports genuinely one-click

4. **Campaign data isolation audit** (table stakes, high complexity, independent of others)
   - Critical for production trust but can run in parallel
   - Any fixes found are likely small (missing WHERE clauses)

5. **Volunteer onboarding guides** (table stakes, medium complexity, mostly content work)
   - Defer to last because it's the most content-heavy and least code-heavy
   - Can be iterated after initial guide content is written

**Defer beyond v1.6:**
- Cross-campaign audit report generation (nice-to-have reporting, not blocking production readiness)
- QR code generation for shift handouts (trivial to add later with any QR library)
- Print-optimized guide CSS (can iterate after guide content stabilizes)

## Sources

- L2 Political Academic Voter File documentation: [NYU Research Guide](https://guides.nyu.edu/l2political), [Penn Libraries](https://guides.library.upenn.edu/L2/documentation), [UC Berkeley](https://guides.lib.berkeley.edu/c.php?g=1381940&p=10332633)
- L2 National Voter File dataset schema: [Redivis](https://redivis.com/datasets/4r1c-d6j182y87)
- L2 Voter Data Dictionary: [L2 Data](https://l2-data.com/wp-content/uploads/2022/01/L2_Voter-Dictionary_r2.pdf), [2025 Version](https://www.l2-data.com/wp-content/uploads/2025/08/L2-2025-VOTER-DATA-DICTIONARY-1.pdf)
- CSV Column Auto-Recognition Patterns: [CodeNote](https://codenote.net/en/posts/csv-column-auto-recognition-heuristic-vs-llm/)
- Progressive Disclosure UX: [NNGroup](https://www.nngroup.com/articles/progressive-disclosure/), [IxDF](https://ixdf.org/literature/topics/progressive-disclosure), [LogRocket](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/)
- SaaS Sidebar Navigation: [ALF Design Group](https://www.alfdesigngroup.com/post/improve-your-sidebar-design-for-web-apps), [Navbar Gallery](https://www.navbar.gallery/blog/best-side-bar-navigation-menu-design-examples), [Lollypop Design](https://lollypop.design/blog/2025/december/saas-navigation-menu-design/)
- Tabs UX Best Practices: [Eleken](https://www.eleken.co/blog-posts/tabs-ux)
- React Markdown: [react-markdown GitHub](https://github.com/remarkjs/react-markdown), [Strapi Guide](https://strapi.io/blog/react-markdown-complete-guide-security-styling)
- Multi-tenant data isolation patterns: [Redis Blog](https://redis.io/blog/data-isolation-multi-tenant-saas/), [Propelius](https://propelius.tech/blogs/tenant-data-isolation-patterns-and-anti-patterns/)
- Campaign volunteer onboarding: [NationBuilder](https://nationbuilder.com/building-a-thriving-volunteer-program)
- Codebase inspection: import_service.py (CANONICAL_FIELDS, parse_voting_history, suggest_field_mapping), __root.tsx (AppSidebar), ModuleLayout.tsx, tourSteps.ts, useTour.ts, import wizard (new.tsx), imports.py API endpoints
