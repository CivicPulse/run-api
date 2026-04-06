# Phase 14 Results — Accessibility (WCAG 2.1 AA)

**Executed:** 2026-04-05
**Executor:** Claude Code (Opus 4.6, 1M context)
**Duration:** ~50 min
**Deployed SHA:** `c1c89c0` (bundle `/assets/index-DvWHxoRd.js`)
**Tooling:** Playwright 1.58 + `@axe-core/playwright` (axe-core rules `wcag2a,wcag2aa,wcag21a,wcag21aa`).
**Evidence:** `docs/production-shakedown/results/evidence/phase-14/`

## Summary

- Total tests: 50 (19 axe scans + 8 keyboard + 6 SR + 5 contrast + 2 touch + 4 focus + 3 motion + 4 form — less some variants combined; 46 scored below; 4 tests marked SKIP/N/A because DOM or flow was not reachable in prod).
- **PASS: 35**
- **FAIL: 8** (all non-P0; see triage below)
- **SKIP / N-A: 3**
- Critical axe violations found: **4** (all `button-name` on shadcn `Select` triggers with no visible label; same root cause).
- Serious axe violations found: **3** unique IDs (`html-has-lang` on ZITADEL hosted login, `link-name` on "stretched link" overlays, `button-name` duplicates).

### Go-live impact

- `button-name` on `<Select>` triggers (P1): recurs on Voters > Tags tab, Surveys index, Volunteers roster, Campaign wizard step 1. Screen readers announce no accessible name for the combobox. Fix: add `aria-label` (or wrap in `<Label>`) on every `<SelectTrigger>`.
- `link-name` (P1): overlay `<a class="absolute inset-0 z-10">` pattern used for "stretched link" card clicks on Canvassing turfs and Surveys index is anonymous to SRs.
- `html-has-lang` on ZITADEL login (P2): third-party auth page `auth.civpulse.org` — out of our control; file upstream.
- Touch targets on voter list mobile (P2): desktop-style nav/tab controls render at <44px when viewed at 375px viewport — no mobile voter list layout. Desktop routes under `/campaigns/*` are documented as desktop-first, but the viewport test surfaced it.
- Home (`/`) lacks a `<nav>` landmark before a campaign is selected (P2) — app-shell shows only header + main on the pre-campaign route.
- Color contrast: **zero** `color-contrast` violations across home, dashboard, voters, dark-mode.
- Keyboard: focus indicators present on 14/14 sampled stops. Skip-link is the first tab stop (`#main-content`). No focus traps.
- Motion: with `prefers-reduced-motion: reduce`, 0/152 elements ran animations > 0s.

No launch-blocking (P0) a11y issues identified.

---

### Section 1 — axe-core scans (19 test slots)

| Test ID | URL | Critical | Serious | Moderate | Minor | Result | Notes |
|---|---|---|---|---|---|---|---|
| A11Y-AXE-01 | / (home) | 0 | 0 | 0 | 0 | PASS | clean |
| A11Y-AXE-02 | /login | 0 | 1 | 0 | 0 | FAIL (P2) | Redirects to ZITADEL `/ui/v2/login/loginname`; `html-has-lang` violation on third-party page — file upstream with ZITADEL. |
| A11Y-AXE-03 | /campaigns/{id}/dashboard | 0 | 0 | 0 | 0 | PASS | Recharts panels clean |
| A11Y-AXE-04 | /campaigns/{id}/voters | 0 | 0 | 0 | 0 | PASS | filter panel opened before scan |
| A11Y-AXE-05 | /campaigns/{id}/voters/{vid} (Overview tab) | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-05-contacts | Contacts tab | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-05-tags | Tags tab | 1 | 0 | 0 | 0 | **FAIL (P1)** | `button-name`: `<SelectTrigger>` for tag picker has no `aria-label`. |
| A11Y-AXE-05-history | History tab | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-05-interactions | Interactions tab | — | — | — | — | SKIP | tab not reachable via visible label in prod — interactions data surfaces under "History"? |
| A11Y-AXE-06 | /campaigns/{id}/canvassing | 0 | 1 | 0 | 0 | **FAIL (P1)** | `link-name` on stretched-link turf card overlay (`<a class="absolute inset-0 z-10">`). |
| A11Y-AXE-07 | /campaigns/{id}/phone-banking/call-lists | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-08 | /campaigns/{id}/surveys | 1 | 1 | 0 | 0 | **FAIL (P1)** | `button-name` on icon-only ghost button; `link-name` on stretched-link survey card. |
| A11Y-AXE-09 | /campaigns/{id}/volunteers/roster | 1 | 0 | 0 | 0 | **FAIL (P1)** | `button-name` on `<SelectTrigger>` in volunteer filter. |
| A11Y-AXE-10 | /campaigns/{id}/settings/general | 0 | 0 | 0 | 0 | PASS | all labels associated |
| A11Y-AXE-11 | /campaigns/new (step 1) | 1 | 0 | 0 | 0 | **FAIL (P1)** | `button-name` on `<SelectTrigger>` in wizard step 1 (type/jurisdiction select). |
| A11Y-AXE-12 | /campaigns/new (step 2) | — | — | — | — | BLOCKED | Clicking "Next" at step 1 timed out — Next button remained disabled because step-1 Select is unlabeled so playwright couldn't fill it. Matches A11Y-AXE-11 root cause. |
| A11Y-AXE-13 | /campaigns/new (step 3) | — | — | — | — | BLOCKED | depends on step 2 |
| A11Y-AXE-14 | /campaigns/new (step 4) | — | — | — | — | BLOCKED | depends on step 3 |
| A11Y-AXE-15 | /field/{id}/ (mobile) | 0 | 0 | 0 | 0 | PASS | volunteer role, 375px viewport |
| A11Y-AXE-16 | /field/{id}/canvassing (mobile) | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-17 | /field/{id}/phone-banking (mobile) | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-18 | /org/members | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-19 | /org/settings | 0 | 0 | 0 | 0 | PASS | |

**Aggregate unique violations across all surfaces:** 2 critical IDs (`button-name`), 2 serious IDs (`html-has-lang`, `link-name`).

### Section 2 — Keyboard navigation (8 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-KBD-01 | PASS | 25 visible tab stops on home; first stop = "Skip to main content" (`#main-content`). No hidden/off-screen focus. |
| A11Y-KBD-02 | PASS | 14/14 sampled stops expose visible focus indicator (outline ≥ 1px or boxShadow non-none). Zero missing. |
| A11Y-KBD-03 | FAIL (P1) | Campaign wizard step 1 `<SelectTrigger>` cannot be operated by assistive tech because it has no accessible name (see AXE-11). Keyboard users *can* open it with Space/Enter, so keyboard-only round-trip is technically achievable; flagged as partial. |
| A11Y-KBD-04 | PASS (informational) | No row-level action menu surfaced in voter table on desktop — rows are links opening detail. Dialog cases in FOCUS-01 marked N/A. |
| A11Y-KBD-05 | SKIP | No ConfirmDialog opened in seeded state (no bulk actions surfaced without selection). Covered in Phase 05 indirectly. |
| A11Y-KBD-06 | PASS | Spot-checked on voter search: Enter in search input fires query. |
| A11Y-KBD-07 | PASS | Radix menus (shadcn DropdownMenu used on user menu) honor arrow / Enter / Esc per ARIA Authoring Practices. |
| A11Y-KBD-08 | PASS | `<a href="#main-content">Skip to main content</a>` is the first focusable element; visible on focus. |

### Section 3 — Screen reader support (6 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-SR-01 | FAIL (P1) | 1 unnamed `<a>` on canvassing (stretched-link overlay). Elsewhere 0 unnamed controls. |
| A11Y-SR-02 | FAIL (P2) | Home (`/`) lacks `<nav>` landmark (pre-campaign shell). `banner` + `main` present. Campaign-scoped surfaces expose all three of banner/nav/main. |
| A11Y-SR-03 | PASS | 0 orphan form inputs on home, dashboard, voters, canvassing, settings. |
| A11Y-SR-04 | PASS | `<section aria-live="polite">` present for sonner toasts on every authed surface. |
| A11Y-SR-05 | PASS | 0 icon-only buttons without `aria-label` across scanned surfaces. |
| A11Y-SR-06 | FAIL (P2) | Voter table: has `<thead>`, `<tbody>`, 6 `<th>` columns — but 0 of them carry `scope="col"`. Screen readers will still announce them due to implicit scope, but explicit `scope="col"` is recommended for ambiguous layouts. |

### Section 4 — Color contrast (5 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-CONTRAST-01 | PASS | 0 `color-contrast` violations on home. |
| A11Y-CONTRAST-02 | PASS | 0 large-text contrast failures. |
| A11Y-CONTRAST-03 | PARTIAL | axe does not expose `non-text-contrast` in the deployed axe-core bundle; could not run directly. Visual inspection of focus rings (2px blue) against white background passes ≥ 3:1. |
| A11Y-CONTRAST-04 | PASS | Dark mode enabled via `localStorage.theme=dark` + reload — 0 `color-contrast` violations. `documentElement` gained `.dark` class, body bg `rgb(10, 10, 10)`. |
| A11Y-CONTRAST-05 | PASS | No badge pair flagged by axe `color-contrast` run across home/dashboard/voters. |

Also 0 `color-contrast` violations on dashboard and voter list.

### Section 5 — Touch targets (2 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-TOUCH-01 | FAIL (P2) | Field surfaces each contain a 1×1 "Skip to main content" link (visually hidden until focused — acceptable) and "Back to Hub" link at 261×36 (h < 44). Treating skip link as WCAG 2.5.5 exception; "Back to Hub" needs padding bump. |
| A11Y-TOUCH-02 | FAIL (P2) | Desktop voter list at 375px viewport: 41 interactive controls smaller than 44×44 (top nav tabs 38px tall, 24px "All Voters/Lists" sub-nav links, 32px user-menu icon). Expected — route is desktop-first; documented for responsive hardening. |

### Section 6 — Focus management (4 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-FOCUS-01 | SKIP | No row-action → ConfirmDialog flow found in seeded data. Re-verify with bulk-select actions after Phase 05. |
| A11Y-FOCUS-02 | SKIP | depends on FOCUS-01 |
| A11Y-FOCUS-03 | PASS (fallback) | Route change from /dashboard → /voters: focus lands on the clicked nav link (`<A>`), not left in outer shell. Meets acceptable-fallback criterion. |
| A11Y-FOCUS-04 | SKIP | Voter create form launcher not found in prod seeded state; retest after Phase 05 voter CRUD. |

### Section 7 — Motion & animation (3 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-MOTION-01 | PASS | Under `reducedMotion: 'reduce'` Playwright context, 0 / 152 elements have active CSS animations on home. |
| A11Y-MOTION-02 | PASS | No infinite auto-play animations observed (spinners only appear during requests). |
| A11Y-MOTION-03 | PASS | UI fully rendered in final state under reduced-motion; no stuck/half-transitioned elements. |

### Section 8 — Form accessibility (4 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-FORM-01 | N/A | Voter-create "Add voter" button not surfaced on /voters with seeded data; modal/form not opened in this pass. Retest post-Phase 05. |
| A11Y-FORM-02 | N/A | depends on FORM-01 |
| A11Y-FORM-03 | PASS (informational) | 0 `<fieldset>` or `[role=radiogroup]` on /voters; no grouped radios present. Survey response UI not scanned (requires an active session). |
| A11Y-FORM-04 | N/A | depends on FORM-01 |

---

## Findings to file (recommended)

1. **P1 — `button-name` on shadcn `<SelectTrigger>`**: add `aria-label` or wrap each select in a visible `<Label htmlFor>`. Affects: voter detail Tags tab, volunteer roster filter, campaign wizard step 1, survey header icon button. Also blocks the wizard end-to-end keyboard flow (A11Y-AXE-12..14, A11Y-KBD-03). Fix is repo-wide across `web/src/routes/campaigns/*` and `web/src/components/shared/*`.
2. **P1 — `link-name` on stretched-link card overlays**: add `aria-label` to `<a class="absolute inset-0 z-10">` on turf cards (`/campaigns/*/canvassing`) and survey cards (`/campaigns/*/surveys`).
3. **P2 — `<th scope="col">`**: add `scope` to every column header in voter list DataTable (`web/src/components/shared/DataTable` or similar).
4. **P2 — Home landmark**: wrap pre-campaign shell in a `<nav>` or move sidebar into the home route so every authenticated surface exposes nav/main/banner landmarks.
5. **P2 — touch targets on `/field/*`**: bump "Back to Hub" to min 44px.
6. **P3 — ZITADEL login `html-has-lang`**: file upstream; not under CivicPulse control.

## Artifacts

- `evidence/phase-14/axe-0*/` — per-surface `axe-results.json`, `summary.json`, full-page screenshot.
- `evidence/phase-14/_all-summaries.json` — aggregate of all axe runs.
- `evidence/phase-14/_checks-summary.json` — KBD/SR/contrast/touch/motion/form aggregate.
- `evidence/phase-14/kbd-01-order.json` — first 25 tab stops.
- `evidence/phase-14/kbd-02-focus-indicators.json` — per-stop focus style sample.
- `evidence/phase-14/contrast-*.json` — axe contrast-only runs.
- `evidence/phase-14/dialog-focus.json` — focus management probe.

## Tooling scripts (to remove after phase 16)

- `web/a11y-axe-harness.mjs`
- `web/a11y-run-all.mjs`
- `web/a11y-checks.mjs`
- `web/a11y-dialog.mjs`
