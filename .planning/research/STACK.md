# Technology Stack: v1.6 Production Ready Polish

**Project:** CivicPulse Run API
**Researched:** 2026-03-27
**Overall confidence:** HIGH (npm registry versions verified, codebase patterns analyzed, L2 data dictionary reviewed)

---

## Executive Summary

v1.6 requires minimal stack additions. The four target features (zero-touch CSV import, RLS data isolation audit, navigation consolidation, volunteer onboarding guides) are primarily code-level improvements to existing infrastructure. Only two new npm packages are needed for the onboarding guide pages. Everything else is alias expansion, test additions, and sidebar restructuring using tools already in the stack.

---

## Feature-by-Feature Stack Analysis

### 1. Zero-Touch CSV Import for L2 Voter Files

**Stack changes: NONE. Pure code changes to existing `import_service.py`.**

The import pipeline already uses RapidFuzz (3.14.3) for fuzzy column matching with a 75% threshold. The "zero-touch" improvement means expanding the `CANONICAL_FIELDS` alias dictionary so that L2 voter files auto-map without user intervention.

**What needs to change (code, not stack):**

The current `CANONICAL_FIELDS` dict in `app/services/import_service.py` covers ~45 L2 column aliases but is missing several that appear in real L2 exports. Based on the L2 Voter File Available Fields data dictionary, the following alias gaps exist:

| Canonical Field | Missing L2 Aliases | Confidence |
|----------------|-------------------|------------|
| `registration_line1` | `residence_addresses_addressline` (has partial), `residence_address_line` | MEDIUM |
| `registration_county` | `counties` (L2 uses this in Boundaries section) | MEDIUM |
| `precinct` | `precinct_voting_districts` | LOW |
| `__cell_phone` | `landline_telephone_number` (different phone type, may need `__landline` field) | MEDIUM |
| `congressional_district` | `new_congressional_districts`, `old_congressional_districts` | MEDIUM |
| `state_senate_district` | `new_state_senate_districts`, `old_state_senate_districts` | MEDIUM |
| `state_house_district` | `new_state_house_districts`, `old_state_house_districts` | MEDIUM |
| `ethnicity` | `broad_ethnic_groupings` | MEDIUM |
| `party` | `party_identification` (L2 data dictionary lists this variant) | HIGH |
| `registration_date` | `official_reg_date`, `calculated_reg_date` | HIGH |
| (new) `registration_status` | `voters_active`, `registration_status` | MEDIUM |

**Voting history format variations:**

The current parser (`parse_voting_history`) only handles `General_YYYY` / `Primary_YYYY` column patterns. Based on L2 documentation, alternate formats observed in the wild include:

| Pattern | Example | Currently Handled |
|---------|---------|------------------|
| `General_YYYY` | `General_2024` | YES |
| `Primary_YYYY` | `Primary_2022` | YES |
| `Elections_General_YYYY` | `Elections_General_2024` | NO |
| `Elections_Primary_YYYY` | `Elections_Primary_2022` | NO |
| `General_Election_YYYY` | `General_Election_2020` | NO |
| `Primary_Election_YYYY` | `Primary_Election_2020` | NO |
| `Special_YYYY` | `Special_2023` | NO |
| `Local_YYYY` | `Local_2023` | NO |
| `Runoff_YYYY` | `Runoff_2024` | NO |

The regex `_VOTING_HISTORY_RE = re.compile(r"^(General|Primary)_(\d{4})$")` needs broadening to handle these additional patterns. This is a one-line regex change, not a library addition.

**Recommendation:** Expand the regex to `r"^(?:Elections_)?(?:General|Primary|Special|Local|Runoff)(?:_Election)?_(\d{4})$"` and update the `_VOTED_VALUES` frozenset if needed. No new packages required.

### 2. Campaign Data Isolation Audit (RLS)

**Stack changes: NONE. Uses existing pytest + SQLAlchemy async test infrastructure.**

The project already has comprehensive RLS test infrastructure:
- `tests/integration/conftest.py` provides `superuser_session` (bypasses RLS), `app_user_session` (RLS enforced), and `two_campaigns` fixture
- 8 RLS test files covering voter, canvassing, phone banking, volunteer, API smoke, and pool isolation
- Connection patterns: superuser via `postgresql+asyncpg://postgres:postgres@localhost:5432/run_api`, app_user via `postgresql+asyncpg://app_user:app_password@localhost:5432/run_api`

**What the audit needs (code, not stack):**

The existing tests cover the major entities but a comprehensive audit should verify ALL 33+ RLS-enabled tables. The current test files test isolation for:
- Campaigns, campaign_members, users (test_rls.py)
- Voters, voter_tags, voter_lists, voter_contacts, voter_interactions, import_jobs (test_voter_rls.py)
- Turfs, walk_lists, walk_list_entries, walk_list_canvassers, surveys, survey_questions (test_canvassing_rls.py)
- Phone_banks, call_lists, call_list_entries, session_callers, dnc_entries (test_phone_banking_rls.py)
- Volunteers, shifts, shift_volunteers, volunteer_tags, volunteer_tag_members, volunteer_availability (test_volunteer_rls.py)
- API-level smoke tests for voters, turfs (test_rls_api_smoke.py)
- Pool isolation and transaction scope (test_rls_isolation.py)

**Potentially untested entities** (need verification during audit):
- `survey_responses` (if separate table)
- `voter_list_members` (junction table)
- `voter_addresses` (if exists)
- `field_mapping_templates` (partially tested in test_voter_rls.py)
- `organization_members` (org-level, not campaign-scoped -- different RLS pattern)

**Testing approach:** Use the existing `two_campaigns` fixture pattern. No new test libraries needed. pytest-asyncio (1.3.0+) and SQLAlchemy async sessions handle everything.

### 3. Navigation Consolidation

**Stack changes: NONE. Pure frontend restructuring of existing components.**

The current sidebar in `web/src/routes/__root.tsx` already uses shadcn/ui's Sidebar component system (`SidebarContent`, `SidebarGroup`, `SidebarMenuItem`, etc.) with Lucide React icons. The current campaign nav items are:
- Dashboard, Voters, Canvassing, Phone Banking, Volunteers, Field Operations

**What needs to change:**
- Add "Surveys" to the campaign sidebar nav (currently only accessible via nested tabs in Canvassing/Phone Banking routes)
- Remove duplicate inline tab bars from layout routes (`canvassing.tsx`, `phone-banking.tsx`, `voters.tsx`, `volunteers.tsx`) where they duplicate sidebar navigation
- No new components or libraries needed -- just reorganize existing `navItems` array and conditionally show/hide sub-navigation

The Lucide icon for Surveys is already imported (`ClipboardList` is in use for Volunteers). The `FileQuestion` or `ListChecks` icon from `lucide-react` (0.563.0, already installed) would work for Surveys.

### 4. Volunteer Onboarding Guides (Markdown Pages)

**Stack changes: 2 new npm packages needed.**

This is the only feature requiring new dependencies. The goal is to author volunteer guides as markdown files and render them as styled, public-accessible pages within the app.

#### Recommended Approach: react-markdown + @tailwindcss/typography

**Why react-markdown over build-time alternatives:**
- Guides may eventually be loaded from API/CMS (future-proof)
- react-markdown renders to React components (safe by default, no raw innerHTML injection)
- Integrates naturally with the existing component system (can map markdown elements to shadcn/ui components)
- The content is static but the rendering context is dynamic (route params, auth state for conditional content)

**Why NOT MDX or vite-plugin-markdown:**
- MDX (@mdx-js/rollup 3.1.1) adds JSX-in-markdown complexity that volunteer guides don't need
- vite-plugin-markdown (0.21.5) produces raw HTML strings requiring unsafe innerHTML insertion
- Both add build-time coupling that makes future CMS integration harder

## Recommended Stack Additions

### New Frontend Dependencies

| Package | Version | Purpose | Why This One |
|---------|---------|---------|-------------|
| `react-markdown` | ^10.1.0 | Render markdown as React components | 900K+ weekly downloads, safe rendering via virtual DOM, component customization via `components` prop, GFM support via plugins, peer deps satisfied (React >=18) |
| `@tailwindcss/typography` | ^0.5.19 | `prose` class for beautiful markdown typography | First-party Tailwind plugin, compatible with Tailwind v4 (peer dep: `>=4.0.0-beta.1`), provides heading hierarchy, list styling, blockquote formatting, table styling, code block formatting -- all matching design system |

### Optional Frontend Dependencies (add only if needed)

| Package | Version | Purpose | When to Add |
|---------|---------|---------|-------------|
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown (tables, task lists, strikethrough) | Only if guides use GFM tables or task lists; start without it, add when first needed |
| `rehype-slug` | ^6.0.0 | Add `id` attributes to headings for anchor links | Only if guides need in-page navigation / table of contents |
| `rehype-autolink-headings` | ^7.1.0 | Add clickable anchor links to headings | Only if guides need shareable heading links; depends on rehype-slug |

### New Backend Dependencies

**NONE.** All four features use existing Python packages:
- RapidFuzz 3.14.3 (import alias matching)
- SQLAlchemy 2.0.48 + asyncpg 0.31.0 (RLS testing)
- pytest 9.0.2 + pytest-asyncio 1.3.0 (integration tests)

### New Dev Dependencies

**NONE.** Existing Playwright (1.58.2), Vitest (4.0.18), and pytest handle all testing needs.

## Integration Points

### react-markdown + @tailwindcss/typography Integration

**Tailwind v4 CSS setup** (add to `web/src/index.css`):
```css
@plugin "@tailwindcss/typography";
```

**Component pattern** (markdown page rendering):
```tsx
import Markdown from "react-markdown"

function GuidePage({ content }: { content: string }) {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <Markdown>{content}</Markdown>
    </article>
  )
}
```

**Custom component mapping** (to match shadcn/ui design system):
```tsx
<Markdown
  components={{
    a: ({ href, children }) => (
      <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    // Map other elements to shadcn components as needed
  }}
>
  {content}
</Markdown>
```

**Markdown file location:** Store guide source files at `web/src/content/guides/` and import as raw strings via Vite's `?raw` import suffix (built into Vite, no plugin needed):
```tsx
import canvassingGuide from "@/content/guides/canvassing.md?raw"
```

This approach avoids adding a Vite markdown plugin while keeping guides as maintainable `.md` files.

### Route structure for guides

Add routes under an unauthed or lightly-authed path (guides are "public pages" per the milestone description):
```
web/src/routes/guides/index.tsx          -- guide listing
web/src/routes/guides/$guideSlug.tsx     -- individual guide page
```

These routes should use TanStack Router's `createFileRoute` pattern, consistent with the rest of the app. The guide content can be a static map of slug-to-import for v1.6, with API-backed content as a future enhancement.

## What NOT to Add

| Technology | Why Not |
|-----------|---------|
| MDX / @mdx-js/rollup | Overkill for static volunteer guides; adds JSX-in-markdown complexity |
| vite-plugin-markdown | Produces raw HTML strings; less safe than react-markdown's virtual DOM approach |
| Contentful / Sanity / CMS | Out of scope for v1.6; guides are developer-authored markdown files |
| Docusaurus / Nextra | Full documentation frameworks; we need a few in-app pages, not a docs site |
| Any Python markdown library | Guides are frontend-rendered; no need for server-side markdown processing |
| Additional RLS test framework | Existing pytest + SQLAlchemy async fixtures are sufficient and well-established |
| react-helmet / react-head | Guides are in-app pages, not SEO-critical public pages needing meta tags |
| Any CSV parsing library | Python stdlib `csv` module handles all import parsing needs |
| chardet / charset-normalizer | Current UTF-8-sig + Latin-1 fallback handles all observed L2 file encodings |

## Installation Commands

```bash
# Frontend: only 2 new packages
cd web && npm install react-markdown @tailwindcss/typography

# Backend: nothing to install
# Dev deps: nothing to install
```

## Version Compatibility Matrix

| New Package | Requires | Project Has | Compatible |
|------------|----------|-------------|------------|
| react-markdown 10.1.0 | React >=18 | React 19.2.0 | YES |
| react-markdown 10.1.0 | @types/react >=18 | @types/react 19.2.7 | YES |
| @tailwindcss/typography 0.5.19 | tailwindcss >=3.0.0 or >=4.0.0-beta.1 | tailwindcss 4.1.18 | YES |
| @tailwindcss/typography 0.5.19 | CSS `@plugin` directive (v4) | Tailwind v4 CSS config | YES |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Import alias expansion | HIGH | L2 data dictionary reviewed, existing code patterns well understood, pure dict expansion |
| Voting history regex | MEDIUM | L2 format variations confirmed from data dictionary but exact CSV headers vary by export; regex broadening is safe (additive, not breaking) |
| RLS audit scope | HIGH | All migration files reviewed, RLS policies enumerated across 8 migration files, existing test patterns well established |
| Navigation consolidation | HIGH | Sidebar component fully analyzed, navItems array pattern clear, no new deps needed |
| react-markdown choice | HIGH | npm registry version verified (10.1.0), peer deps checked (React >=18 satisfied), 900K+ weekly downloads, used by Netlify/Gatsby/Stream |
| @tailwindcss/typography | HIGH | Version verified (0.5.19), Tailwind v4 peer dep confirmed (>=4.0.0-beta.1), first-party Tailwind plugin, `@plugin` directive documented |
| Vite ?raw imports | HIGH | Built-in Vite feature (no plugin needed), project already uses Vite 7.3.1 |

## Sources

- [react-markdown on npm](https://www.npmjs.com/package/react-markdown) -- version 10.1.0
- [react-markdown on GitHub](https://github.com/remarkjs/react-markdown) -- component API, plugin system
- [remark-gfm on npm](https://www.npmjs.com/package/remark-gfm) -- version 4.0.1
- [@tailwindcss/typography on GitHub](https://github.com/tailwindlabs/tailwindcss-typography) -- Tailwind v4 `@plugin` syntax
- [L2 Voter File Available Fields](https://l2-data.com/wp-content/uploads/2022/01/L2_Voter-Dictionary_r2.pdf) -- data dictionary for alias mapping
- [L2 National Voter File on Redivis](https://redivis.com/datasets/4r1c-d6j182y87) -- column naming patterns (Voters_*, Residence_Addresses_*)
- [React Markdown Complete Guide 2025](https://strapi.io/blog/react-markdown-complete-guide-security-styling) -- security and styling best practices
- [Tailwind Typography Plugin Docs](https://tailwindcss-typography.vercel.app/) -- prose class usage
