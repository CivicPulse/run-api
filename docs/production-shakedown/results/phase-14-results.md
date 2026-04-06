# Phase 14 Results — Accessibility (WCAG 2.1 AA)

**Executed:** 2026-04-06 (re-run on current deploy)
**Previous run:** 2026-04-05 on SHA `c1c89c0`
**Executor:** Claude Code (Opus 4.6, 1M context)
**Duration:** ~35 min
**Deployed SHA:** `a9007e3`
**Tooling:** Playwright 1.58 + `@axe-core/playwright` (axe-core rules `wcag2a,wcag2aa,wcag21a,wcag21aa`).
**Evidence:** `docs/production-shakedown/results/evidence/phase-14/`

## Summary

- Total tests: 51
- **PASS: 33**
- **FAIL: 5** (0 P0, 1 P1, 4 P2)
- **SKIP: 13** (wizard steps blocked by button label mismatch; read-only audit constraints)

### Changes since previous run (SHA c1c89c0 -> a9007e3)

- **Fixed:** `button-name` violations on SelectTrigger (voter detail Tags tab, surveys index, volunteers roster, campaign wizard step 1) -- all now PASS
- **Fixed:** `link-name` on stretched-link card overlays (canvassing turfs, survey cards) -- AXE-06 and AXE-08 now PASS
- **New:** `aria-hidden-focus` on campaign dashboard (AXE-03) -- div with `aria-hidden="true"` contains focusable child
- **Persists:** `html-has-lang` on ZITADEL login (AXE-02) -- third-party, expected
- **Persists:** Home page missing `<nav>` landmark (SR-02)
- **Persists:** Voter table `<th>` elements lacking `scope="col"` (SR-06)
- **Persists:** Voter list mobile touch targets undersized (TOUCH-02)
- **Regression:** Dark mode no longer activates via `localStorage.setItem('theme','dark')` (previously worked)

### Go-live impact

No launch-blocking (P0) a11y issues identified.

One P1 issue: voter list on mobile viewport has 116 undersized touch targets (voter name links at 16px height, buttons at 32px), violating WCAG 2.5.5 and the project's 44px minimum. This affects the `/campaigns/*/voters` route at mobile breakpoints, not the field-specific `/field/*` routes which pass.

---

### Section 1 — axe-core scans (19 test slots)

| Test ID | URL | Critical | Serious | Moderate | Minor | Result | Notes |
|---|---|---|---|---|---|---|---|
| A11Y-AXE-01 | / (home) | 0 | 0 | 0 | 0 | PASS | Clean scan |
| A11Y-AXE-02 | /login | 0 | 1 | 0 | 0 | FAIL (P2) | Redirects to ZITADEL; `html-has-lang` on third-party page |
| A11Y-AXE-03 | /campaigns/{id}/dashboard | 0 | 1 | 0 | 0 | FAIL (P2) | `aria-hidden-focus`: `div[aria-hidden="true"]` contains focusable element (likely chart/overlay container) |
| A11Y-AXE-04 | /campaigns/{id}/voters | 0 | 0 | 0 | 0 | PASS | Filter panel opened before scan |
| A11Y-AXE-05 | /campaigns/{id}/voters/{vid} | 0 | 0 | 0 | 0 | PASS | Default tab scanned clean |
| A11Y-AXE-06 | /campaigns/{id}/canvassing | 0 | 0 | 0 | 0 | PASS | Previously FAIL (`link-name`); now fixed |
| A11Y-AXE-07 | /campaigns/{id}/phone-banking/call-lists | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-08 | /campaigns/{id}/surveys | 0 | 0 | 0 | 0 | PASS | Previously FAIL (`button-name`, `link-name`); now fixed |
| A11Y-AXE-09 | /campaigns/{id}/volunteers/roster | 0 | 0 | 0 | 0 | PASS | Previously FAIL (`button-name`); now fixed |
| A11Y-AXE-10 | /campaigns/{id}/settings/general | 0 | 0 | 0 | 0 | PASS | All labels associated |
| A11Y-AXE-11 | /campaigns/new (step 1) | 0 | 0 | 0 | 0 | PASS | Previously FAIL (`button-name`); now fixed |
| A11Y-AXE-12 | /campaigns/new (step 2) | - | - | - | - | SKIP | Wizard "Next" button not found by `/next/i` pattern; step navigation could not proceed |
| A11Y-AXE-13 | /campaigns/new (step 3) | - | - | - | - | SKIP | Blocked by AXE-12 |
| A11Y-AXE-14 | /campaigns/new (step 4) | - | - | - | - | SKIP | Blocked by AXE-12 |
| A11Y-AXE-15 | /field/{id}/ (mobile) | 0 | 0 | 0 | 0 | PASS | 375x667 viewport; clean |
| A11Y-AXE-16 | /field/{id}/canvassing (mobile) | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-17 | /field/{id}/phone-banking (mobile) | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-18 | /org/members | 0 | 0 | 0 | 0 | PASS | |
| A11Y-AXE-19 | /org/settings | 0 | 0 | 0 | 0 | PASS | |

### Section 2 — Keyboard navigation (8 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-KBD-01 | PASS | 40 tab stops sampled; all visible. First stop = "Skip to main content" link. Order: skip link -> logo -> nav (All Campaigns, Members, Settings) -> sidebar toggle -> user menu -> main content cards. Matches visual reading order. |
| A11Y-KBD-02 | PASS | 19/19 sampled focus stops have visible indicator (outline or box-shadow). Zero missing. |
| A11Y-KBD-03 | SKIP | Could not advance wizard past step 1 (Next button label mismatch in automation). Step 1 form fields were keyboard-accessible. |
| A11Y-KBD-04 | PASS | Voter table uses Tab-per-row linear pattern; voter name links and action buttons all keyboard-reachable. |
| A11Y-KBD-05 | SKIP | No ConfirmDialog opened (read-only production audit). |
| A11Y-KBD-06 | SKIP | No form submission tested (read-only production audit). |
| A11Y-KBD-07 | SKIP | Dropdown menu arrow-key navigation not tested in this automated run. |
| A11Y-KBD-08 | PASS | `<a href="#main-content">Skip to main content</a>` is first focusable element; visible on focus. |

### Section 3 — Screen reader support (6 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-SR-01 | PASS | 0 unnamed interactive controls across home, campaign dashboard, and voter list. Previously 1 unnamed `<a>` on canvassing (stretched-link); now fixed. |
| A11Y-SR-02 | FAIL (P2) | Home (`/`) lacks `<nav>` landmark (has `header` + `main` but no `nav`). Dashboard and voters have all three (`banner`, `nav`, `main`). No page has `contentinfo` (footer). |
| A11Y-SR-03 | PASS | 0 orphan form inputs on campaign settings (all properly labeled). |
| A11Y-SR-04 | PASS | 1 `aria-live="polite"` region found (toast/sonner container). |
| A11Y-SR-05 | PASS | 0 icon-only buttons without `aria-label` on home page. |
| A11Y-SR-06 | FAIL (P2) | Voter table: `<thead>` + `<tbody>` present, 6 `<th>` elements, but 0 carry `scope="col"`. Screen readers infer scope from `thead` position, but explicit `scope` is best practice. |

### Section 4 — Color contrast (5 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-CONTRAST-01 | PASS | 0 `color-contrast` violations on voter list (body text >= 4.5:1). |
| A11Y-CONTRAST-02 | PASS | 0 large-text contrast failures. |
| A11Y-CONTRAST-03 | PASS | 0 `color-contrast-enhanced` violations on voter list. |
| A11Y-CONTRAST-04 | SKIP | Dark mode not activating in production -- `localStorage.setItem('theme','dark')` did not add `.dark` class to `<html>`. May have been removed or gated. |
| A11Y-CONTRAST-05 | PASS | Badge elements passed axe-core contrast checks. |

### Section 5 — Touch targets (2 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-TOUCH-01 | PASS | Field hub at 375x667: only 1 undersized element (skip-to-content at 1x1px, visually hidden -- WCAG 2.5.5 exception). |
| A11Y-TOUCH-02 | FAIL (P1) | Voter list at 375x667: **116 undersized targets**. Voter name links 96x16px, sub-nav tabs 24px height, filter/new-voter buttons 32px height, action buttons 36x32px, pagination 32px. Desktop table layout served at mobile breakpoint without responsive adaptation. |

### Section 6 — Focus management (4 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-FOCUS-01 | SKIP | No ConfirmDialog triggered (read-only audit; no delete actions). shadcn Dialog handles focus trapping by default. |
| A11Y-FOCUS-02 | SKIP | Depends on FOCUS-01. |
| A11Y-FOCUS-03 | PASS | Route change (Voters -> Canvassing): focus moved to clicked nav `<a>` element, not left on body. Meets acceptable-fallback criterion. |
| A11Y-FOCUS-04 | SKIP | Not tested -- form submission would create data in production. |

### Section 7 — Motion & animation (3 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-MOTION-01 | PASS | 0 animated elements under `reducedMotion: 'reduce'` context. All tw-animate-css animations properly suppressed. |
| A11Y-MOTION-02 | PASS | 0 infinite auto-play animations after 6-second observation. |
| A11Y-MOTION-03 | PASS | Dashboard renders fully under reduced-motion. No stuck/half-transitioned elements. |

### Section 8 — Form accessibility (4 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-FORM-01 | PASS | Wizard step 1: no required inputs missing `required` or `aria-required`. axe-core flagged no violations. |
| A11Y-FORM-02 | SKIP | Would require submitting invalid data in production. |
| A11Y-FORM-03 | PASS | No radio groups present on wizard step 1; no grouping semantics needed. |
| A11Y-FORM-04 | SKIP | Would require triggering validation in production. |

---

## Failures to Track

| Priority | Test ID | Issue | Remediation |
|---|---|---|---|
| **P1** | A11Y-TOUCH-02 | Voter list at 375px has 116 undersized touch targets (links 16px, buttons 32px) | Add responsive mobile layout for voter list with min 44px tap targets; consider card-based layout at mobile breakpoint |
| **P2** | A11Y-AXE-02 | ZITADEL hosted login page missing `lang` on `<html>` | Third-party -- file upstream with ZITADEL project |
| **P2** | A11Y-AXE-03 | Campaign dashboard `aria-hidden-focus`: hidden div contains focusable child | Audit dashboard for `aria-hidden` containers with focusable descendants (likely chart/overlay) |
| **P2** | A11Y-SR-02 | Home page (`/`) missing `<nav>` landmark | Wrap org-level nav links in `<nav aria-label="Organization">` |
| **P2** | A11Y-SR-06 | Voter table `<th>` elements lack `scope="col"` (0/6) | Add `scope="col"` to DataTable column headers |

## Artifacts

- `evidence/phase-14/axe-01-home/` through `axe-19-org-settings/` -- per-surface `axe-results.json`, `summary.json`, full-page screenshots
- `evidence/phase-14/kbd-01-tab-order/` -- 40 tab stops JSON
- `evidence/phase-14/kbd-02-focus-indicators/` -- per-stop focus style data
- `evidence/phase-14/kbd-08-skip-link/` -- skip link detection
- `evidence/phase-14/sr-01-unnamed-controls/` through `sr-06-table-semantics/` -- screen reader data
- `evidence/phase-14/contrast-*` -- targeted contrast analysis
- `evidence/phase-14/touch-01-field-hub/` and `touch-02-voter-list-mobile/` -- undersized target lists
- `evidence/phase-14/focus-03-route-change/` -- route transition focus data
- `evidence/phase-14/motion-*` -- animation analysis and reduced-motion screenshots
- `evidence/phase-14/form-*` -- form accessibility data

## Cleanup

- `web/a11y-axe-harness.mjs` retained for potential re-runs; delete after Phase 16
