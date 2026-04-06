# Phase 14: Accessibility

**Prefix:** `A11Y`
**Depends on:** phase-00
**Estimated duration:** 40 min
**Agents required:** 1

## Purpose

Validate that production conforms to **WCAG 2.1 Level AA** across every user-facing surface. Per the CivicPulse Run design brief (CLAUDE.md), the aspirational target is WCAG 2.1 **AAA**, but AA is the go-live bar. This phase exercises automated scans, keyboard-only navigation, assistive-tech semantics, color contrast, mobile touch targets, focus management, motion preferences, and form accessibility.

Failures are scored by impact:

- **Critical / Serious** axe violations, missing focus indicators, unlabeled interactive controls, and contrast < 4.5:1 on body text → **P1** minimum, **P0** if they block a core workflow.
- **Moderate / Minor** violations → document for post-launch hardening (P2/P3).

## Prerequisites

- Phase 00 complete (Org A + Org B provisioned, baseline seed data present).
- `@axe-core/playwright` installed at `web/node_modules/@axe-core/playwright` (already present — confirm with `ls web/node_modules/@axe-core/playwright/package.json`).
- Playwright ≥ 1.58 with Chromium browser installed.
- JWT / login credentials for `qa-owner@civpulse.org` (Org A owner) from README § Configuration.
- Test campaign IDs: `${CAMPAIGN_A}` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`.
- Evidence output directory: `docs/production-shakedown/results/evidence/phase-14/` — create it before running.

```bash
mkdir -p docs/production-shakedown/results/evidence/phase-14
```

---

## Section 1: Automated axe-core Scans

Each test loads a URL (authenticated where required) and runs an `AxeBuilder` scan restricted to WCAG 2.1 A + AA rule tags. Fail on any `critical` or `serious` violation. Moderate/minor violations are recorded but do not fail the test.

### Shared harness (reusable across A11Y-AXE-01 … 17)

Save the following once as `web/a11y-axe-harness.mjs` (do not commit — it lives only for the duration of phase 14):

```javascript
// web/a11y-axe-harness.mjs
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';

const URL = process.env.URL;
const LABEL = process.env.LABEL || 'scan';
const AUTH = process.env.AUTH === '1';
const VIEWPORT = process.env.VIEWPORT === 'mobile'
  ? { width: 375, height: 667 }
  : { width: 1440, height: 900 };
const OUT = `docs/production-shakedown/results/evidence/phase-14/${LABEL}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();

if (AUTH) {
  await page.goto('https://run.civpulse.org/');
  await page.waitForSelector('input', { timeout: 20000 });
  await page.locator('input').first().fill(process.env.EMAIL);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForSelector('input[type=password]', { timeout: 20000 });
  await page.locator('input[type=password]').fill(process.env.PASSWORD);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 30000 });
}

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500); // let async data land

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .analyze();

const bucket = { critical: [], serious: [], moderate: [], minor: [] };
for (const v of results.violations) bucket[v.impact]?.push(v);

fs.writeFileSync(`${OUT}/axe-results.json`, JSON.stringify(results, null, 2));
await page.screenshot({ path: `${OUT}/page.png`, fullPage: true });

console.log(JSON.stringify({
  url: URL,
  viewport: VIEWPORT,
  counts: {
    critical: bucket.critical.length,
    serious: bucket.serious.length,
    moderate: bucket.moderate.length,
    minor: bucket.minor.length,
  },
  criticalIds: bucket.critical.map((v) => v.id),
  seriousIds: bucket.serious.map((v) => v.id),
}, null, 2));

await browser.close();
process.exit(bucket.critical.length + bucket.serious.length > 0 ? 1 : 0);
```

Run pattern:

```bash
cd web && AUTH=1 EMAIL='qa-owner@civpulse.org' PASSWORD='k%A&ZrlYH4tgztoVK&Ms' \
  URL='https://run.civpulse.org/' LABEL='axe-01-home' \
  node a11y-axe-harness.mjs
```

**Pass criteria (every A11Y-AXE test):** exit code 0; `counts.critical == 0` AND `counts.serious == 0`.

---

### A11Y-AXE-01 | Home (authenticated org dashboard)

**Purpose:** Entry point for all signed-in users; any violation here affects every session.

**URL:** `https://run.civpulse.org/`

**Steps:**
```bash
cd web && AUTH=1 EMAIL='qa-owner@civpulse.org' PASSWORD='k%A&ZrlYH4tgztoVK&Ms' \
  URL='https://run.civpulse.org/' LABEL='axe-01-home' node a11y-axe-harness.mjs
```

**Expected:** 0 critical, 0 serious. Moderate/minor documented.

**Pass criteria:** exit 0.

---

### A11Y-AXE-02 | Login page (unauthenticated)

**Purpose:** First surface every user hits; must be perfect.

**URL:** `https://run.civpulse.org/login`

**Steps:**
```bash
cd web && URL='https://run.civpulse.org/login' LABEL='axe-02-login' node a11y-axe-harness.mjs
```

Note: production login may redirect to ZITADEL at `auth.civpulse.org`. If so, scan lands on the ZITADEL hosted login page — record that URL in notes but still require 0 critical/serious.

**Expected:** 0 critical, 0 serious on the login surface (ZITADEL or local).

**Pass criteria:** exit 0.

---

### A11Y-AXE-03 | Campaign dashboard

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/dashboard`

**Steps:** as above with `LABEL='axe-03-campaign-dashboard'`.

**Pass criteria:** exit 0. Chart/canvas regions may surface `aria-hidden`/`svg-img-alt` — log under serious if so.

---

### A11Y-AXE-04 | Voter list + filter UI

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters`

**Steps:** Before scan, open the filter panel (click the "Filters" button) so filter controls are in the DOM:

```javascript
// Append before AxeBuilder call in harness
await page.getByRole('button', { name: /filter/i }).click().catch(() => {});
await page.waitForTimeout(500);
```

**LABEL:** `axe-04-voter-list`

**Pass criteria:** exit 0; column headers expose `role="columnheader"`; every table has an accessible name.

---

### A11Y-AXE-05 | Voter detail (tabs)

**Purpose:** Tab panels must expose correct ARIA state (`aria-selected`, `tabindex`, `role="tabpanel"`).

**URL:** Fetch a voter ID first:

```bash
export TOKEN_A='<qa-owner token>'
VOTER_ID=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters?page_size=1" \
  | jq -r '.items[0].id')
echo "https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters/$VOTER_ID"
```

**LABEL:** `axe-05-voter-detail`. Scan each tab — iterate click-and-rescan:

```javascript
for (const tabName of ['Overview', 'Contacts', 'Tags', 'Interactions', 'History']) {
  await page.getByRole('tab', { name: new RegExp(tabName, 'i') }).click().catch(() => {});
  await page.waitForTimeout(400);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  // write per-tab JSON + counts
}
```

**Pass criteria:** every tab panel returns 0 critical/serious.

---

### A11Y-AXE-06 | Canvassing hub (turfs + walk lists)

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/canvassing`

**LABEL:** `axe-06-canvassing`

**Pass criteria:** exit 0. Leaflet map container may trigger `region` / `aria-hidden-focus` — treat as serious if so.

---

### A11Y-AXE-07 | Phone banking / call lists

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/phone-banking/call-lists`

**LABEL:** `axe-07-phone-banking`

**Pass criteria:** exit 0.

---

### A11Y-AXE-08 | Surveys index

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/surveys`

**LABEL:** `axe-08-surveys`

**Pass criteria:** exit 0.

---

### A11Y-AXE-09 | Volunteer roster

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/volunteers/roster`

**LABEL:** `axe-09-volunteers`

**Pass criteria:** exit 0.

---

### A11Y-AXE-10 | Campaign settings (general)

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/settings/general`

**LABEL:** `axe-10-campaign-settings`

**Pass criteria:** exit 0; every form input has an associated `<label>`.

---

### A11Y-AXE-11 | Campaign creation wizard — Step 1

**URL:** `https://run.civpulse.org/campaigns/new`

**LABEL:** `axe-11-wizard-step-1`

**Pass criteria:** exit 0; step indicator exposes `aria-current="step"`.

---

### A11Y-AXE-12 | Wizard Step 2

**Steps:** From `/campaigns/new`, fill step 1 with valid minimum data then click Next; scan step 2.

```javascript
// append in harness after landing on /campaigns/new
await page.getByLabel(/campaign name/i).fill('A11Y Wizard Test');
await page.getByLabel(/jurisdiction/i).fill('Macon-Bibb County, GA');
await page.getByRole('button', { name: /next/i }).click();
await page.waitForTimeout(700);
```

**LABEL:** `axe-12-wizard-step-2`

**Pass criteria:** exit 0. Do **not** submit the wizard — abandon before final step so no campaign is created.

---

### A11Y-AXE-13 | Wizard Step 3

**Steps:** Continue from step 2 → Next. Scan step 3.

**LABEL:** `axe-13-wizard-step-3`

**Pass criteria:** exit 0.

---

### A11Y-AXE-14 | Wizard Step 4 (review)

**Steps:** Continue to step 4. Scan the review screen. Close/abandon — do not submit.

**LABEL:** `axe-14-wizard-step-4`

**Pass criteria:** exit 0.

---

### A11Y-AXE-15 | Field hub (mobile viewport)

**URL:** `https://run.civpulse.org/field/06d710c8-32ce-44ae-bbab-7fcc72aab248/`

**Steps:** Set `VIEWPORT=mobile`:

```bash
cd web && AUTH=1 EMAIL='qa-volunteer@civpulse.org' PASSWORD='S27hYyk#b6ntLK8jHZLv' \
  URL='https://run.civpulse.org/field/06d710c8-32ce-44ae-bbab-7fcc72aab248/' \
  LABEL='axe-15-field-hub' VIEWPORT=mobile node a11y-axe-harness.mjs
```

**Pass criteria:** exit 0. Volunteer-role context is the primary use case for this surface.

---

### A11Y-AXE-16 | Field canvassing (mobile)

**URL:** `https://run.civpulse.org/field/06d710c8-32ce-44ae-bbab-7fcc72aab248/canvassing`

**LABEL:** `axe-16-field-canvassing`, `VIEWPORT=mobile`.

**Pass criteria:** exit 0.

---

### A11Y-AXE-17 | Field phone banking (mobile)

**URL:** `https://run.civpulse.org/field/06d710c8-32ce-44ae-bbab-7fcc72aab248/phone-banking`

**LABEL:** `axe-17-field-phone-banking`, `VIEWPORT=mobile`.

**Pass criteria:** exit 0.

---

### A11Y-AXE-18 | Org members

**URL:** `https://run.civpulse.org/org/members`

**LABEL:** `axe-18-org-members`

**Pass criteria:** exit 0.

---

### A11Y-AXE-19 | Org settings

**URL:** `https://run.civpulse.org/org/settings`

**LABEL:** `axe-19-org-settings`

**Pass criteria:** exit 0.

---

## Section 2: Keyboard Navigation

### A11Y-KBD-01 | Tab order through org dashboard is logical

**Purpose:** Sighted keyboard users must be able to reach every interactive element in reading order.

**Steps:**
```javascript
// web/a11y-kbd-order.mjs — after authenticated nav to https://run.civpulse.org/
const order = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 60) || el.getAttribute('name'),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    };
  });
  order.push(focused);
}
fs.writeFileSync('docs/production-shakedown/results/evidence/phase-14/kbd-01-order.json',
  JSON.stringify(order, null, 2));
```

**Expected:** The first ~5 tab stops include a skip-to-main-content link and primary navigation. No focus enters off-screen / hidden elements. Focus never gets trapped.

**Pass criteria:** Every entry has `visible: true`; order matches visual reading order; skip link reachable within first 3 tabs.

---

### A11Y-KBD-02 | Visible focus indicator on every control

**Purpose:** WCAG 2.4.7 requires a visible focus indicator.

**Steps:** Walk through tab order from KBD-01; at each stop, call `getBoundingClientRect()` + computed `outline`/`box-shadow` styles:

```javascript
const style = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { outline: cs.outline, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow };
});
```

**Expected:** Every stop has `outline` OR `boxShadow` applied with a width > 0 and non-transparent color.

**Pass criteria:** 100% of focus stops expose a visible indicator. Zero controls relying solely on `outline: none` with no replacement.

---

### A11Y-KBD-03 | Campaign wizard fully keyboard-operable

**Steps:** Navigate to `/campaigns/new`. Using only Tab/Shift+Tab/Enter/Space/Arrow keys, complete steps 1-3 (then abandon). Record whether every field could be filled, every Next/Back button activated, and every select opened.

**Expected:** Full round trip achievable without mouse; no steps require pointer input.

**Pass criteria:** Every interactive control reachable + operable via keyboard.

---

### A11Y-KBD-04 | Voter table row focus + action buttons

**Steps:** On `/campaigns/{id}/voters`, Tab into the table; arrow keys navigate rows (or Tab-per-row if table pattern), and row action menu opens with Enter.

**Expected:** Either arrow-key navigation (grid pattern) OR Tab-per-row (linear pattern), consistently applied. Action menus open with Enter/Space and first item focused.

**Pass criteria:** No row action is unreachable by keyboard.

---

### A11Y-KBD-05 | Esc closes dialogs

**Steps:** Open any confirm dialog (e.g., "Delete voter"), press Esc.

**Expected:** Dialog closes, focus returns to the trigger button.

**Pass criteria:** Esc dismisses every dialog type (ConfirmDialog, shadcn Dialog, shadcn Sheet).

---

### A11Y-KBD-06 | Enter submits forms

**Steps:** On the voter-create form, Tab into a text input, press Enter.

**Expected:** Form submits (or validation fires) identically to clicking the primary button.

**Pass criteria:** Enter in any required input triggers submit.

---

### A11Y-KBD-07 | Arrow keys navigate dropdown menus

**Steps:** Open a user-profile menu or column-chooser dropdown; press Down arrow.

**Expected:** Down/Up cycles through menu items; Enter activates; Esc closes and returns focus.

**Pass criteria:** ARIA menu pattern honored (per WAI-ARIA Authoring Practices 1.2).

---

### A11Y-KBD-08 | Skip-to-main-content link works

**Steps:** Load home page fresh, press Tab once.

**Expected:** First focusable element is a "Skip to main content" anchor (visible on focus). Pressing Enter moves focus to the `<main>` landmark.

**Pass criteria:** Skip link present, visible on focus, functional.

---

## Section 3: Screen Reader Support

### A11Y-SR-01 | All buttons/links have accessible names

**Steps:**
```javascript
const unnamed = await page.evaluate(() => {
  const controls = [...document.querySelectorAll('button, a[href], [role=button], [role=link]')];
  return controls
    .filter((el) => !el.getAttribute('aria-label') && !el.textContent?.trim() && !el.getAttribute('title'))
    .map((el) => ({ tag: el.tagName, outerHTML: el.outerHTML.slice(0, 120) }));
});
```

**Expected:** `unnamed` is empty on every scanned surface (run across the same URL set as Section 1).

**Pass criteria:** 0 unnamed interactive controls.

---

### A11Y-SR-02 | Landmark roles present on every page

**Steps:**
```javascript
const landmarks = await page.evaluate(() => ({
  banner: !!document.querySelector('header, [role=banner]'),
  nav: !!document.querySelector('nav, [role=navigation]'),
  main: !!document.querySelector('main, [role=main]'),
  contentinfo: !!document.querySelector('footer, [role=contentinfo]'),
}));
```

**Expected:** `banner`, `navigation`, and `main` are present on every authenticated surface. `contentinfo` present on marketing/anonymous pages at minimum.

**Pass criteria:** `banner && nav && main === true` on every authenticated URL.

---

### A11Y-SR-03 | Every form input has an associated label

**Steps:**
```javascript
const orphanInputs = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')];
  return inputs
    .filter((el) => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
      if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
      if (el.closest('label')) return false;
      return true;
    })
    .map((el) => ({ name: el.getAttribute('name'), type: el.getAttribute('type'), html: el.outerHTML.slice(0, 120) }));
});
```

**Expected:** Empty array on every form-bearing page (login, voter create, campaign wizard, settings).

**Pass criteria:** 0 orphan inputs.

---

### A11Y-SR-04 | Live regions announce dynamic updates

**Purpose:** Toasts (sonner), FieldProgress, and InlineSurvey should use `aria-live`.

**Steps:**
```javascript
const live = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-live]')].map((el) => ({
    live: el.getAttribute('aria-live'),
    atomic: el.getAttribute('aria-atomic'),
    role: el.getAttribute('role'),
  })));
```

Trigger a toast (e.g., create a voter) and assert a matching live region exists with `aria-live="polite"` or `role="status"`.

**Expected:** At minimum one `aria-live="polite"` region for toasts; `role="status"` on FieldProgress.

**Pass criteria:** Toast container exposes live region; FieldProgress announces on update.

---

### A11Y-SR-05 | Icon-only buttons have aria-label or aria-hidden siblings

**Steps:**
```javascript
const iconBtns = await page.evaluate(() =>
  [...document.querySelectorAll('button')].filter((b) => !b.textContent?.trim() && b.querySelector('svg'))
    .filter((b) => !b.getAttribute('aria-label') && !b.getAttribute('title'))
    .map((b) => b.outerHTML.slice(0, 150)));
```

**Expected:** Empty.

**Pass criteria:** 0 icon-only buttons without accessible names.

---

### A11Y-SR-06 | Table semantics (thead/tbody/th scope)

**Steps:** On `/campaigns/{id}/voters`:
```javascript
const tableSem = await page.evaluate(() => {
  const t = document.querySelector('table');
  if (!t) return { hasTable: false };
  return {
    hasTable: true,
    hasThead: !!t.querySelector('thead'),
    hasTbody: !!t.querySelector('tbody'),
    thCount: t.querySelectorAll('th').length,
    thWithScope: t.querySelectorAll('th[scope]').length,
  };
});
```

**Expected:** `hasThead && hasTbody`, `thCount > 0`, every `th` has `scope="col"` or `scope="row"`.

**Pass criteria:** `thCount === thWithScope`.

---

## Section 4: Color Contrast

### A11Y-CONTRAST-01 | Body text ≥ 4.5:1

**Steps:** axe-core `color-contrast` rule already catches this in Section 1. Re-run filtered:

```javascript
const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
```

Across the URL set from Section 1, aggregate any `color-contrast` violations.

**Expected:** 0 violations.

**Pass criteria:** No `color-contrast` failures on normal text (<24px regular or <19px bold).

---

### A11Y-CONTRAST-02 | Large text ≥ 3:1

**Steps:** Same scan; `color-contrast` rule already distinguishes large text.

**Expected:** 0 violations on large text.

**Pass criteria:** 0 failures.

---

### A11Y-CONTRAST-03 | UI component contrast ≥ 3:1

**Purpose:** WCAG 1.4.11 — borders on buttons, input outlines, focus rings.

**Steps:**
```javascript
const results = await new AxeBuilder({ page }).withRules(['color-contrast-enhanced', 'non-text-contrast']).analyze();
```

**Expected:** 0 `non-text-contrast` violations.

**Pass criteria:** Input borders, button outlines, focus rings all ≥ 3:1.

---

### A11Y-CONTRAST-04 | Dark mode contrast

**Steps:** If dark mode is exposed via `next-themes`, switch via `localStorage.setItem('theme','dark')` before scan:

```javascript
await page.evaluate(() => localStorage.setItem('theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
```

Rerun contrast scans on home, campaign dashboard, voter list.

**Expected:** 0 `color-contrast` violations in dark mode.

**Pass criteria:** Parity with light mode. If dark mode is not yet shipped, mark SKIP with note.

---

### A11Y-CONTRAST-05 | Status badge contrast

**Steps:** Navigate to a surface that renders StatusBadge (campaigns list shows Active/Archived). Inspect each variant's computed text + background:

```javascript
const badges = await page.$$eval('[data-status], .badge, [class*=badge]', (els) => els.map((el) => {
  const cs = getComputedStyle(el);
  return { text: el.textContent?.trim(), color: cs.color, bg: cs.backgroundColor };
}));
```

Compute contrast ratio for each pair (use axe's own `color-contrast` run for authority).

**Expected:** Every badge variant (Active, Archived, Deleted, Draft) ≥ 4.5:1.

**Pass criteria:** No badge fails 4.5:1.

---

## Section 5: Touch Targets (mobile)

### A11Y-TOUCH-01 | All tappable elements ≥ 44×44 px on mobile viewport

**Purpose:** CLAUDE.md design brief requires 44px min touch targets on field/mobile surfaces.

**Steps:** At 375×667 viewport, on `/field/{campaign_id}/`, measure every interactive element:

```javascript
await page.setViewportSize({ width: 375, height: 667 });
const small = await page.evaluate(() => {
  const controls = [...document.querySelectorAll('button, a[href], [role=button], input, select, textarea')];
  return controls
    .filter((el) => el.offsetWidth > 0)
    .map((el) => ({
      tag: el.tagName,
      w: el.getBoundingClientRect().width,
      h: el.getBoundingClientRect().height,
      label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40),
    }))
    .filter((x) => x.w < 44 || x.h < 44);
});
```

**Expected:** `small` is empty on every field surface (`/field/{id}/`, `/field/{id}/canvassing`, `/field/{id}/phone-banking`).

**Pass criteria:** 0 undersized tap targets on `/field/*` routes.

**Note:** Desktop surfaces (authenticated `/campaigns/*`) may have smaller targets — record as informational only unless viewed at mobile breakpoint.

---

### A11Y-TOUCH-02 | Touch targets on voter list mobile view

**Steps:** Same script on `/campaigns/{id}/voters` at 375×667.

**Expected:** Row action buttons, bulk-select checkboxes, filter button all ≥ 44×44.

**Pass criteria:** 0 undersized targets on row actions.

---

## Section 6: Focus Management

### A11Y-FOCUS-01 | Dialog open moves focus to dialog

**Steps:** Click a button that opens ConfirmDialog (e.g., delete voter). Read `document.activeElement`:

```javascript
const triggerEl = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent?.trim() }));
await page.getByRole('button', { name: /delete/i }).first().click();
await page.waitForTimeout(200);
const afterOpen = await page.evaluate(() => {
  const el = document.activeElement;
  const dialog = el.closest('[role=dialog]');
  return { insideDialog: !!dialog, tag: el.tagName };
});
```

**Expected:** `afterOpen.insideDialog === true`.

**Pass criteria:** Focus lands inside dialog (typically first focusable element or a labelled close button).

---

### A11Y-FOCUS-02 | Dialog close returns focus to trigger

**Steps:** Continuation of FOCUS-01. Press Esc; read `activeElement`:

```javascript
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const afterClose = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent?.trim() }));
```

**Expected:** `afterClose` matches the trigger button.

**Pass criteria:** Focus returned to the originating trigger.

---

### A11Y-FOCUS-03 | Route change moves focus to main content or page heading

**Steps:** Click a nav link (e.g., Voters → Canvassing). After navigation:

```javascript
const focused = await page.evaluate(() => ({
  tag: document.activeElement.tagName,
  isBody: document.activeElement === document.body,
  isMainOrH1: !!document.activeElement.closest('main') || document.activeElement.tagName === 'H1',
}));
```

**Expected:** `isBody === false` AND (`isMainOrH1 === true` OR focus on a skip link).

**Pass criteria:** Focus NOT left on previous-page element; announced correctly by SR.

**Acceptable fallback:** Focus may reset to `document.body` if an announcer updates a live region with the new page title. Mark PASS with note.

---

### A11Y-FOCUS-04 | Form error state moves focus to first invalid field

**Steps:** On voter-create form, submit with blank required fields. Inspect `activeElement`:

**Expected:** Focus moves to the first field with `aria-invalid="true"`.

**Pass criteria:** First invalid input receives focus on submit failure.

---

## Section 7: Motion & Animation

### A11Y-MOTION-01 | prefers-reduced-motion respected

**Steps:**
```javascript
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
```

Navigate to home; measure that animated elements (e.g., `tw-animate-css` classes) either do not play or complete instantly.

```javascript
const animated = await page.evaluate(() => {
  return [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    return cs.animationName !== 'none' && cs.animationDuration !== '0s';
  }).length;
});
```

**Expected:** `animated === 0` (or every animation has `animation-duration: 0s` under `prefers-reduced-motion: reduce`).

**Pass criteria:** No active animations > 0s under reduced-motion context.

---

### A11Y-MOTION-02 | No auto-playing motion > 5s

**Steps:** Without reduced-motion, load each main surface and observe for 6 seconds. Record any element that animates continuously past 5 seconds.

**Expected:** No infinite auto-play animations on content areas (spinners on in-flight requests are acceptable as they terminate on load).

**Pass criteria:** Zero infinite animations on non-loading UI.

---

### A11Y-MOTION-03 | Animations degrade gracefully (no layout shift)

**Steps:** With reduced-motion, verify route transitions and dialog open/close still complete visually (elements do not appear "broken" mid-state).

**Expected:** UI fully rendered in final state after each interaction.

**Pass criteria:** Zero stuck / half-transitioned elements.

---

## Section 8: Form Accessibility

### A11Y-FORM-01 | Required fields marked aria-required

**Steps:** On voter-create and campaign-wizard step 1:

```javascript
const requiredInputs = await page.evaluate(() => {
  return [...document.querySelectorAll('input[required], textarea[required], select[required]')].map((el) => ({
    name: el.getAttribute('name'),
    ariaRequired: el.getAttribute('aria-required'),
    required: el.hasAttribute('required'),
  }));
});
```

**Expected:** Every `required` input also carries `aria-required="true"` (or the native `required` attribute is sufficient for SRs — treat as PASS either way; flag if neither present).

**Pass criteria:** No required input lacks both `required` AND `aria-required`.

---

### A11Y-FORM-02 | Error messages associated via aria-describedby

**Steps:** Submit voter-create with invalid email; inspect the email input:

```javascript
const emailInput = await page.$('input[name=email]');
const describedBy = await emailInput.getAttribute('aria-describedby');
const errorEl = describedBy ? await page.$(`#${describedBy}`) : null;
const errorText = errorEl ? await errorEl.textContent() : null;
```

**Expected:** `describedBy` non-null, target element renders the validation message.

**Pass criteria:** Every invalid input exposes `aria-describedby` pointing at its error node.

---

### A11Y-FORM-03 | Fieldset/legend for grouped inputs

**Steps:** On any radio-group (e.g., voter party, canvass disposition), inspect wrapper:

```javascript
const groups = await page.$$eval('fieldset', (els) => els.map((el) => ({
  hasLegend: !!el.querySelector('legend'),
  radioCount: el.querySelectorAll('input[type=radio]').length,
})));
```

**Expected:** Every radio group wrapped in `<fieldset>` with a `<legend>` (or exposed via `role="radiogroup"` + `aria-labelledby`).

**Pass criteria:** No radio group without grouping semantics.

---

### A11Y-FORM-04 | Validation announced to screen readers

**Steps:** On voter-create, submit invalid form; check for an `aria-live` region or `role="alert"` that receives the summary:

```javascript
const alerts = await page.$$eval('[role=alert], [aria-live=assertive]', (els) => els.map((el) => el.textContent));
```

**Expected:** At least one non-empty `role="alert"` or assertive live region on validation failure.

**Pass criteria:** Validation failures announced via SR-visible region.

---

## Results Template

Save a filled-in copy to `results/phase-14-results.md`.

### Section 1: axe-core scans (19 tests)

| Test ID | URL | Critical | Serious | Moderate | Minor | Result | Notes |
|---|---|---|---|---|---|---|---|
| A11Y-AXE-01 | / (home) | | | | | | |
| A11Y-AXE-02 | /login | | | | | | |
| A11Y-AXE-03 | /campaigns/{id}/dashboard | | | | | | |
| A11Y-AXE-04 | /campaigns/{id}/voters | | | | | | |
| A11Y-AXE-05 | /campaigns/{id}/voters/{vid} | | | | | | per-tab |
| A11Y-AXE-06 | /campaigns/{id}/canvassing | | | | | | |
| A11Y-AXE-07 | /campaigns/{id}/phone-banking/call-lists | | | | | | |
| A11Y-AXE-08 | /campaigns/{id}/surveys | | | | | | |
| A11Y-AXE-09 | /campaigns/{id}/volunteers/roster | | | | | | |
| A11Y-AXE-10 | /campaigns/{id}/settings/general | | | | | | |
| A11Y-AXE-11 | /campaigns/new (step 1) | | | | | | |
| A11Y-AXE-12 | /campaigns/new (step 2) | | | | | | |
| A11Y-AXE-13 | /campaigns/new (step 3) | | | | | | |
| A11Y-AXE-14 | /campaigns/new (step 4) | | | | | | |
| A11Y-AXE-15 | /field/{id}/ | | | | | | mobile |
| A11Y-AXE-16 | /field/{id}/canvassing | | | | | | mobile |
| A11Y-AXE-17 | /field/{id}/phone-banking | | | | | | mobile |
| A11Y-AXE-18 | /org/members | | | | | | |
| A11Y-AXE-19 | /org/settings | | | | | | |

### Section 2: Keyboard navigation (8 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-KBD-01 | | |
| A11Y-KBD-02 | | |
| A11Y-KBD-03 | | |
| A11Y-KBD-04 | | |
| A11Y-KBD-05 | | |
| A11Y-KBD-06 | | |
| A11Y-KBD-07 | | |
| A11Y-KBD-08 | | |

### Section 3: Screen reader support (6 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-SR-01 | | |
| A11Y-SR-02 | | |
| A11Y-SR-03 | | |
| A11Y-SR-04 | | |
| A11Y-SR-05 | | |
| A11Y-SR-06 | | |

### Section 4: Color contrast (5 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-CONTRAST-01 | | |
| A11Y-CONTRAST-02 | | |
| A11Y-CONTRAST-03 | | |
| A11Y-CONTRAST-04 | | |
| A11Y-CONTRAST-05 | | |

### Section 5: Touch targets (2 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-TOUCH-01 | | |
| A11Y-TOUCH-02 | | |

### Section 6: Focus management (4 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-FOCUS-01 | | |
| A11Y-FOCUS-02 | | |
| A11Y-FOCUS-03 | | |
| A11Y-FOCUS-04 | | |

### Section 7: Motion & animation (3 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-MOTION-01 | | |
| A11Y-MOTION-02 | | |
| A11Y-MOTION-03 | | |

### Section 8: Form accessibility (4 tests)

| Test ID | Result | Notes |
|---|---|---|
| A11Y-FORM-01 | | |
| A11Y-FORM-02 | | |
| A11Y-FORM-03 | | |
| A11Y-FORM-04 | | |

### Summary

- Total tests: 51
- PASS: ___ / 51
- FAIL: ___ / 51
- SKIP: ___ / 51
- BLOCKED: ___ / 51

**Launch-blocking:** Any critical or serious axe violation, any keyboard-unreachable control, any unlabelled form input, and any focus-management failure on core flows are P1 minimum. Dark-mode contrast failures are P2 if dark mode is opt-in.

Record every moderate/minor axe violation in an appendix below for future hardening toward the AAA aspirational target.

## Cleanup

- Delete `web/a11y-axe-harness.mjs` and any temp scripts created during this phase.
- Do NOT submit the campaign wizard in A11Y-AXE-11…14; abandon before step 4 completes so no campaign row is created.
- If A11Y-FOCUS-01/02 created ConfirmDialog mutations (e.g., deleted a seeded voter), re-seed via phase-00 § ENV-SEED-01.
- Evidence under `docs/production-shakedown/results/evidence/phase-14/` stays committed for audit.
