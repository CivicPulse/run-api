# CivicPulse Run — UI Quality Audit

**Date:** 2026-03-27
**Scope:** All components, routes, and styles in `web/src/`
**Files analyzed:** ~100+ .tsx, .ts, .css files

---

## Anti-Patterns Verdict

**PASS.** This interface does **not** look AI-generated. It avoids every major tell from the anti-pattern checklist:

- No gradient text, no glassmorphism, no neon-on-dark
- No hero metric dashboard template — stat cards are simple and purposeful
- No identical card grids with icon+heading+text
- No bounce easing, no decorative sparklines
- System font stack per spec (no Inter/Roboto imports)
- Neutral OKLCH color palette, no purple-to-blue gradients
- Cards are used sparingly and meaningfully, not nested
- Empty states teach the interface ("Import a voter file or add voters manually to get started")
- UX copy is direct and action-oriented, no redundant descriptions

The aesthetic is clean, data-dense, and professional — consistent with the stated design goal of "Linear meets Stripe meets Canva."

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 4 |
| Medium | 6 |
| Low | 5 |
| **Total** | **16** |

**Top issues:**
1. **No `prefers-reduced-motion` support** in custom animations (Critical — WCAG 2.3.3)
2. **Hard-coded Tailwind colors** (`text-green-600`, `text-yellow-500`) bypass semantic tokens and break in dark mode (High)
3. **Dark mode is unreachable** — CSS variables are defined but no theme toggle exists (High)
4. **Campaign tab nav lacks ARIA tab pattern** — missing `role="tablist"`, `role="tab"`, `aria-selected` (High)
5. **Multiple/conflicting heading levels** across pages (Medium)

**Overall quality:** Strong foundation. The codebase demonstrates consistent accessibility thinking (skip nav, aria-labels, sr-only chart alternatives, live regions, 44px touch targets in field mode). The issues are mostly polish-level rather than architectural.

---

## Detailed Findings

### Critical Issues

#### C-1: No `prefers-reduced-motion` support for custom animations
- **Location:** Global — all uses of `animate-spin`, transition classes, chevron rotation
- **Category:** Accessibility
- **WCAG:** 2.3.3 (Animation from Interactions, AAA)
- **Description:** `prefers-reduced-motion` appears in zero custom component files. The `tw-animate-css` library may handle its own keyframes, but custom usage of `animate-spin` on loaders ([`__root.tsx:237`](__root.tsx#L237), [`field/$campaignId/index.tsx:89`](web/src/routes/field/$campaignId/index.tsx#L89)), chevron rotation ([`index.tsx:108`](web/src/routes/index.tsx#L108)), and transition classes throughout have no reduced-motion alternative.
- **Impact:** Users with vestibular disorders or motion sensitivity may experience discomfort. The project targets WCAG AAA compliance per CLAUDE.md.
- **Recommendation:** Add a global reduced-motion rule: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` or use Tailwind's `motion-reduce:` prefix on individual animations.
- **Suggested command:** `/impeccable:harden`

---

### High-Severity Issues

#### H-1: Hard-coded Tailwind colors bypass design tokens
- **Location:**
  - [`CompletionSummary.tsx:16`](web/src/components/field/CompletionSummary.tsx#L16) — `text-green-600`
  - [`CanvassingCompletionSummary.tsx:20`](web/src/components/field/CanvassingCompletionSummary.tsx#L20) — `text-green-600`
  - [`voters/imports/new.tsx:315,322`](web/src/routes/campaigns/$campaignId/voters/imports/new.tsx#L315) — `text-green-600`
  - [`voters/$voterId.tsx:377,384`](web/src/routes/campaigns/$campaignId/voters/$voterId.tsx#L377) — `text-green-600`
  - [`ColumnMappingTable.tsx:84,87`](web/src/components/voters/ColumnMappingTable.tsx#L84) — `text-green-500`, `text-yellow-500`
- **Category:** Theming
- **Description:** 8 instances of raw Tailwind color classes (`text-green-600`, `text-green-500`, `text-yellow-500`) instead of the semantic `text-status-success-foreground`, `text-status-warning-foreground` tokens already defined in the theme.
- **Impact:** These colors won't adapt to dark mode. Green-600 on a dark background yields poor contrast. Breaks the otherwise consistent token system.
- **Recommendation:** Replace with `text-status-success-foreground` and `text-status-warning-foreground` respectively.
- **Suggested command:** `/impeccable:normalize`

#### H-2: Dark mode is defined but unreachable
- **Location:** [`index.css:125-189`](web/src/index.css#L125) defines `.dark` variables; [`sonner.tsx`](web/src/components/ui/sonner.tsx) imports `useTheme` from `next-themes`
- **Category:** Theming
- **Description:** A complete dark mode color system is defined in CSS, and the sonner component references `next-themes`, but no `ThemeProvider` wraps the app and no theme toggle UI exists anywhere. The `.dark` class is never applied.
- **Impact:** The entire dark mode investment is dormant. Users in low-light field conditions (evening canvassing) cannot switch themes. The design spec calls for "Light and dark mode (via next-themes)."
- **Recommendation:** Add a `ThemeProvider` to the root layout and a theme toggle in the sidebar footer and field header.
- **Suggested command:** `/impeccable:normalize`

#### H-3: Campaign tab navigation lacks ARIA tab semantics
- **Location:** [`$campaignId.tsx:67-78`](web/src/routes/campaigns/$campaignId.tsx#L67)
- **Category:** Accessibility
- **WCAG:** 4.1.2 (Name, Role, Value)
- **Description:** The campaign sub-navigation renders `<nav>` with `<Link>` elements styled as tabs, but uses no tab ARIA pattern (`role="tablist"` on container, `role="tab"` on items, `aria-selected` on active). Screen readers announce these as regular links, not a tab interface.
- **Impact:** Screen reader users cannot navigate this as a tab widget. The visual affordance (underline on active) has no semantic equivalent.
- **Recommendation:** Either add ARIA tab roles or convert to a proper Tabs component from shadcn/ui. Since these are route-based links (not in-page tabs), the current `<nav>` approach is acceptable IF `aria-current="page"` is added to the active link. TanStack Router may already add this — verify and add if missing.
- **Suggested command:** `/impeccable:harden`

#### H-4: Desktop user menu button is 32px (below 44px target)
- **Location:** [`__root.tsx:193`](web/src/routes/__root.tsx#L193) — `className="relative h-8 w-8 rounded-full"`
- **Category:** Accessibility
- **WCAG:** 2.5.8 (Target Size Minimum, AAA)
- **Description:** The user avatar/menu trigger in the top nav bar is `h-8 w-8` (32px). Field components correctly use `min-h-11 min-w-11` but the desktop header does not.
- **Impact:** Touch/pointer users on tablets or touch-screen laptops may struggle with the small target. The project targets AAA compliance.
- **Recommendation:** Add `min-h-11 min-w-11` to match the pattern used in FieldHeader.
- **Suggested command:** `/impeccable:polish`

---

### Medium-Severity Issues

#### M-1: Multiple/conflicting heading levels
- **Location:** Multiple routes
- **Category:** Accessibility
- **WCAG:** 1.3.1 (Info and Relationships)
- **Description:**
  - CampaignLayout renders `<h1>` for the campaign name ([`$campaignId.tsx:60`](web/src/routes/campaigns/$campaignId.tsx#L60)). Child pages also render `<h1>` (e.g., dashboard.tsx:512 renders `<h1>Dashboard</h1>`), creating duplicate h1s.
  - Some pages use `<h2>` as their top heading (voters/index.tsx:640 — "All Voters") since the parent already has h1 — this is correct but inconsistent.
  - Walk list detail jumps from `<h1>` to `<h3>` without `<h2>` ([`walk-lists/$walkListId.tsx:82,110`](web/src/routes/campaigns/$campaignId/canvassing/walk-lists/$walkListId.tsx#L82)).
  - [`canvassing/index.tsx`](web/src/routes/campaigns/$campaignId/canvassing/index.tsx) uses `<h1>` then `<h3>` without `<h2>`.
- **Impact:** Screen reader users relying on heading navigation encounter inconsistent hierarchy. Some pages have two h1s, others skip levels.
- **Recommendation:** Establish a convention: CampaignLayout owns `<h1>` (campaign name). Child pages use `<h2>` for their title, `<h3>` for sections. Audit all routes for consistency.
- **Suggested command:** `/impeccable:harden`

#### M-2: VoterCard uses dynamic class interpolation for colors
- **Location:** [`VoterCard.tsx:83-89`](web/src/components/field/VoterCard.tsx#L83)
- **Category:** Performance / Correctness
- **Description:** Party and propensity colors are applied via template literals: `${partyColor.bg} ${partyColor.text}`. If `getPartyColor()` returns Tailwind classes like `bg-blue-100`, these must be in Tailwind's content scan to be included in the build. If the color values come from a map that's not statically analyzable, they may be purged.
- **Impact:** Colors could silently disappear in production builds if Tailwind can't detect them statically.
- **Recommendation:** Verify that all possible values from `getPartyColor()` and `getPropensityDisplay()` are either in a safelist or appear as full string literals somewhere in the source.
- **Suggested command:** `/impeccable:harden`

#### M-3: Charts lack direct color contrast verification
- **Location:** [`dashboard.tsx:128-134`](web/src/routes/campaigns/$campaignId/dashboard.tsx#L128) — Recharts bars use `var(--chart-1)`, `var(--chart-2)`, `var(--chart-3)`
- **Category:** Accessibility
- **WCAG:** 1.4.11 (Non-text Contrast)
- **Description:** Chart bars reference CSS custom properties. While the sr-only data table is excellent for screen readers, the visual chart colors have not been verified for 3:1 contrast against backgrounds in both light and dark modes. Chart colors also need to be distinguishable from each other for color-blind users.
- **Impact:** Users with low vision or color blindness may not be able to distinguish chart bars.
- **Recommendation:** Verify chart token contrast ratios against both `--background` and `--card` in light and dark modes. Consider adding patterns (hatching) in addition to color for accessibility.
- **Suggested command:** `/impeccable:audit` (re-run after dark mode is enabled)

#### M-4: Loading spinners lack accessible announcements
- **Location:** [`__root.tsx:236-239`](web/src/routes/__root.tsx#L236), [`field/$campaignId/index.tsx:86-93`](web/src/routes/field/$campaignId/index.tsx#L86), multiple skeleton loading states
- **Category:** Accessibility
- **WCAG:** 4.1.3 (Status Messages)
- **Description:** Loading spinners render `<Loader2 className="animate-spin" />` with visible "Loading..." text but no `role="status"` or `aria-live` region to announce the loading state to screen readers. The `EmptyState` component correctly uses `role="status"`, but loading states do not.
- **Impact:** Screen reader users may not know the page is loading.
- **Recommendation:** Wrap loading indicators in a `role="status" aria-live="polite"` container, or use the existing `LiveRegion` component.
- **Suggested command:** `/impeccable:harden`

#### M-5: Campaign tab navigation horizontal scroll on mobile
- **Location:** [`$campaignId.tsx:67`](web/src/routes/campaigns/$campaignId.tsx#L67) — `className="flex gap-1 overflow-x-auto border-b"`
- **Category:** Responsive Design
- **Description:** The 6-item tab bar (Dashboard, Voters, Canvassing, Phone Banking, Surveys, Volunteers) uses `overflow-x-auto` which creates horizontal scrolling on mobile. There's no visual affordance (fade, shadow, scroll indicator) to hint that more tabs exist off-screen.
- **Impact:** Mobile users may miss tabs that are scrolled out of view, particularly Surveys and Volunteers.
- **Recommendation:** Add a gradient fade on the right edge to indicate scrollable content, or consider a scrollable tab pattern with left/right arrows on small screens.
- **Suggested command:** `/impeccable:adapt`

#### M-6: Sidebar `defaultOpen={false}` on all screen sizes
- **Location:** [`__root.tsx:267`](web/src/routes/__root.tsx#L267) — `<SidebarProvider defaultOpen={false}>`
- **Category:** Responsive Design
- **Description:** The sidebar starts collapsed on all viewport sizes. On large desktop screens, starting with the sidebar open would provide better discoverability for first-time users. The current implementation requires users to discover and click the hamburger trigger.
- **Impact:** New users on desktop may not realize the sidebar exists, reducing discoverability of navigation.
- **Recommendation:** Consider `defaultOpen={true}` or conditionally open based on viewport width using `useMobile()` hook already present in the codebase.
- **Suggested command:** `/impeccable:adapt`

---

### Low-Severity Issues

#### L-1: Loader icons lack `aria-hidden`
- **Location:** [`__root.tsx:237`](web/src/routes/__root.tsx#L237), [`OfflineBanner.tsx:25`](web/src/components/field/OfflineBanner.tsx#L25) (correctly uses `aria-hidden="true"`), others
- **Category:** Accessibility
- **Description:** Some decorative Lucide icons on loading spinners don't have `aria-hidden="true"`, which may cause screen readers to announce SVG path data. The OfflineBanner correctly adds `aria-hidden`, but the pattern is not universal.
- **Impact:** Minor screen reader noise.
- **Recommendation:** Add `aria-hidden="true"` to all decorative/icon SVGs that have adjacent text labels.

#### L-2: Filter chip dismiss button uses text character
- **Location:** [`voters/index.tsx:89`](web/src/routes/campaigns/$campaignId/voters/index.tsx#L89) — `{"\u00d7"}`
- **Category:** Accessibility
- **Description:** The dismiss button uses the `×` character (U+00D7 multiplication sign). It does have a proper `aria-label`, so screen readers are fine. However, the visual × is small at the default size.
- **Impact:** Minimal — aria-label covers screen readers; visual size is slightly small.
- **Recommendation:** Consider using a Lucide `X` icon for visual consistency with the rest of the UI.

#### L-3: No error boundary on field routes
- **Location:** [`field/$campaignId.tsx`](web/src/routes/field/$campaignId.tsx) — no `errorComponent`
- **Category:** Resilience
- **Description:** Campaign routes use `RouteErrorBoundary` ([`$campaignId.tsx:86`](web/src/routes/campaigns/$campaignId.tsx#L86)), but field routes do not specify an `errorComponent`. An uncaught error in field mode would show a blank screen.
- **Impact:** Volunteers in the field hitting an error would see a broken page with no recovery path.
- **Recommendation:** Add `errorComponent` to field route definitions with a mobile-friendly error message and retry button.
- **Suggested command:** `/impeccable:harden`

#### L-4: Tour popover uses px-based sizing, not rem
- **Location:** [`tour.css:8`](web/src/styles/tour.css#L8) — `max-width: 320px`, `padding: 16px`, etc.
- **Category:** Accessibility
- **Description:** The tour popover overrides use fixed `px` values instead of `rem`. This means the popover won't scale with user font-size preferences.
- **Impact:** Users who increase their browser font size won't see the tour popover scale accordingly.
- **Recommendation:** Convert `px` values to `rem` (e.g., `16px` -> `1rem`, `320px` -> `20rem`).

#### L-5: `key` prop on FilterChip uses label text, which may not be unique
- **Location:** [`voters/index.tsx:674`](web/src/routes/campaigns/$campaignId/voters/index.tsx#L674) — `<FilterChip key={chip.label} ...>`
- **Category:** Performance / Correctness
- **Description:** Filter chips use `chip.label` as the React key. If two filters produce the same label (unlikely but possible), React reconciliation could misbehave.
- **Impact:** Edge case — would cause incorrect chip removal behavior.
- **Recommendation:** Use an index or generate a unique key from the filter field name.

---

## Patterns & Systemic Issues

1. **Token system is strong but not fully adopted.** The OKLCH semantic tokens are well-designed with light/dark variants, status colors, and turf overlays. But 8 instances of raw Tailwind colors (`text-green-600`, etc.) leak through. A lint rule or codemod could enforce token-only usage.

2. **Field (mobile) components are exemplary.** Touch targets, offline banners, live regions, pull-to-refresh, sr-only labels — field components consistently demonstrate accessibility-first thinking. This is the gold standard within the codebase.

3. **Desktop admin views have fewer a11y refinements.** The desktop sidebar, header, and admin pages are functional but lack the same rigor as field components (e.g., smaller touch targets, missing aria patterns on tab navigation).

4. **Heading hierarchy is inconsistent.** The layout-owns-h1/page-owns-h2 pattern is followed in some places but not others. A convention document would prevent drift.

---

## Positive Findings

These practices should be maintained and replicated:

1. **Skip navigation** — `SkipNav` component in root and field layouts
2. **Screen reader chart alternatives** — sr-only data tables alongside visual Recharts
3. **LiveRegion component** — reusable ARIA live announcements
4. **44px touch targets in field mode** — `min-h-11 min-w-11` consistently applied
5. **Semantic status tokens** — `--status-success`, `--status-warning`, etc. with proper foreground pairs
6. **OKLCH color system** — perceptually uniform, modern, well-structured with dark mode variants
7. **Keyboard-navigable DataTable sorting** — `onKeyDown`, `tabIndex`, `aria-sort`
8. **Offline-first field design** — offline queue, connectivity status, sync indicators
9. **Proper form labeling** — `<Label htmlFor>` + `<Input id>` associations throughout
10. **No div-onClick anti-pattern** — zero instances found; all interactive elements use proper `<button>` or `<Link>`
11. **EmptyState teaches the interface** — empty states provide context and next-step guidance
12. **OfflineBanner accessibility** — `role="status"`, `aria-live="polite"`, `aria-label` with dynamic counts
13. **Guided onboarding tour** — driver.js integration with tour steps per workflow

---

## Recommendations by Priority

### Immediate (before next release)
1. **C-1:** Add `prefers-reduced-motion` global rule
2. **H-1:** Replace 8 hard-coded color instances with semantic tokens

### Short-term (this sprint)
3. **H-2:** Add ThemeProvider + theme toggle (dark mode)
4. **H-3:** Add `aria-current="page"` or ARIA tab pattern to campaign nav
5. **H-4:** Add `min-h-11 min-w-11` to desktop user menu button
6. **M-1:** Audit and standardize heading hierarchy across all routes
7. **M-4:** Wrap loading states in `role="status"` containers

### Medium-term (next sprint)
8. **M-2:** Verify Tailwind safelist for dynamic VoterCard classes
9. **M-3:** Verify chart color contrast in both themes
10. **M-5:** Add scroll affordance to campaign tab bar on mobile
11. **M-6:** Conditionally open sidebar on large viewports
12. **L-3:** Add error boundaries to field routes

### Long-term (backlog)
13. **L-1:** Standardize `aria-hidden` on decorative icons
14. **L-2:** Replace × character with Lucide X icon
15. **L-4:** Convert tour.css from px to rem
16. **L-5:** Use unique keys for filter chips

---

## Suggested Commands for Fixes

| Command | Issues Addressed | Count |
|---------|-----------------|-------|
| `/impeccable:harden` | C-1, H-3, M-1, M-2, M-4, L-3 | 6 |
| `/impeccable:normalize` | H-1, H-2 | 2 |
| `/impeccable:adapt` | M-5, M-6 | 2 |
| `/impeccable:polish` | H-4, L-1, L-2, L-4, L-5 | 5 |
| `/impeccable:audit` | M-3 (re-audit after dark mode) | 1 |
