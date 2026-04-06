// Additional a11y checks: keyboard, screen reader, touch, focus, motion, form.
import { chromium } from 'playwright';
import AxeBuilderMod from '@axe-core/playwright';
import fs from 'node:fs';

const AxeBuilder = AxeBuilderMod.default || AxeBuilderMod.AxeBuilder || AxeBuilderMod;
const OUT_BASE = '/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-14';
const CAMPAIGN = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
const PROD = 'https://run.civpulse.org';

const OWNER_EMAIL = 'qa-owner@civpulse.org';
const OWNER_PASSWORD = 'k%A&ZrlYH4tgztoVK&Ms';

fs.mkdirSync(OUT_BASE, { recursive: true });
const write = (name, data) => fs.writeFileSync(`${OUT_BASE}/${name}`, JSON.stringify(data, null, 2));

async function login(page, email, password) {
  await page.goto(`${PROD}/`);
  await page.waitForSelector('input', { timeout: 30000 });
  await page.locator('input').first().fill(email);
  await page.getByRole('button', { name: /continue|next|sign in|log in/i }).first().click();
  await page.waitForSelector('input[type=password]', { timeout: 30000 });
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: /continue|next|sign in|log in/i }).first().click();
  await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 45000 });
}

const results = {};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await login(page, OWNER_EMAIL, OWNER_PASSWORD);
await page.goto(`${PROD}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// --- A11Y-KBD-01: Tab order through home
const order = [];
for (let i = 0; i < 25; i++) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: 'BODY', visible: false };
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      label: (el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 60) || el.getAttribute('name') || ''),
      href: el.getAttribute('href') || undefined,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  order.push(focused);
}
results.KBD_01 = { stops: order.length, firstLabel: order[0]?.label, order };
write('kbd-01-order.json', order);

// --- A11Y-KBD-02: Visible focus on each stop
const focusIndicators = [];
await page.evaluate(() => document.activeElement?.blur());
for (let i = 0; i < 15; i++) {
  await page.keyboard.press('Tab');
  const style = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      label: (el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || ''),
      outline: cs.outline,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      outlineStyle: cs.outlineStyle,
      boxShadow: cs.boxShadow,
      hasIndicator: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none',
    };
  });
  if (style) focusIndicators.push(style);
}
const missingFocus = focusIndicators.filter((x) => !x.hasIndicator);
results.KBD_02 = { checked: focusIndicators.length, missing: missingFocus.length, missingSamples: missingFocus.slice(0, 5) };
write('kbd-02-focus-indicators.json', focusIndicators);

// --- A11Y-KBD-08: skip link
const skipLinkCheck = await (async () => {
  await page.goto(`${PROD}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 60),
      href: el.getAttribute('href'),
    };
  });
  const isSkip = first?.text?.toLowerCase().includes('skip') || /skip|main/i.test(first?.href || '');
  return { first, isSkip };
})();
results.KBD_08 = skipLinkCheck;

// --- A11Y-SR-01 / 02 / 05 across multiple surfaces
const surfaces = [
  { label: 'home', url: `${PROD}/` },
  { label: 'dashboard', url: `${PROD}/campaigns/${CAMPAIGN}/dashboard` },
  { label: 'voters', url: `${PROD}/campaigns/${CAMPAIGN}/voters` },
  { label: 'canvassing', url: `${PROD}/campaigns/${CAMPAIGN}/canvassing` },
];
const srReport = [];
for (const s of surfaces) {
  await page.goto(s.url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, a[href], [role=button], [role=link]')];
    const unnamed = controls
      .filter((el) => !el.getAttribute('aria-label') && !el.textContent?.trim() && !el.getAttribute('title') && !el.getAttribute('aria-labelledby'))
      .map((el) => ({ tag: el.tagName, html: el.outerHTML.slice(0, 150) }));
    const iconBtns = [...document.querySelectorAll('button')]
      .filter((b) => !b.textContent?.trim() && b.querySelector('svg'))
      .filter((b) => !b.getAttribute('aria-label') && !b.getAttribute('title') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 150));
    const landmarks = {
      banner: !!document.querySelector('header, [role=banner]'),
      nav: !!document.querySelector('nav, [role=navigation]'),
      main: !!document.querySelector('main, [role=main]'),
      contentinfo: !!document.querySelector('footer, [role=contentinfo]'),
    };
    const orphanInputs = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')]
      .filter((el) => {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
        if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
        if (el.closest('label')) return false;
        return true;
      })
      .map((el) => ({ name: el.getAttribute('name'), type: el.getAttribute('type'), html: el.outerHTML.slice(0, 150) }));
    const liveRegions = [...document.querySelectorAll('[aria-live]')].map((el) => ({
      live: el.getAttribute('aria-live'),
      role: el.getAttribute('role'),
    }));
    const roleStatus = [...document.querySelectorAll('[role=status], [role=alert]')].length;
    return { unnamedCount: unnamed.length, unnamed: unnamed.slice(0, 3), iconBtnsCount: iconBtns.length, iconBtns: iconBtns.slice(0, 3), landmarks, orphanInputsCount: orphanInputs.length, orphanInputs: orphanInputs.slice(0, 3), liveRegions, roleStatus };
  });
  srReport.push({ ...s, ...data });
}
results.SR = srReport;
write('sr-report.json', srReport);

// --- A11Y-SR-06: voter table semantics
await page.goto(`${PROD}/campaigns/${CAMPAIGN}/voters`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
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
results.SR_06 = tableSem;

// --- A11Y-CONTRAST via focused axe run
await page.goto(`${PROD}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const contrastResults = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
results.CONTRAST = {
  violations: contrastResults.violations.map((v) => ({
    id: v.id, impact: v.impact, nodeCount: v.nodes.length,
    samples: v.nodes.slice(0, 3).map((n) => ({ html: n.html.slice(0, 150), target: n.target })),
  })),
};
write('contrast-home.json', contrastResults);

// Contrast on dashboard
await page.goto(`${PROD}/campaigns/${CAMPAIGN}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const contrastDash = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
results.CONTRAST_dashboard = {
  violations: contrastDash.violations.map((v) => ({ id: v.id, impact: v.impact, nodeCount: v.nodes.length })),
};
write('contrast-dashboard.json', contrastDash);

// Contrast on voters
await page.goto(`${PROD}/campaigns/${CAMPAIGN}/voters`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const contrastVoters = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
results.CONTRAST_voters = {
  violations: contrastVoters.violations.map((v) => ({ id: v.id, impact: v.impact, nodeCount: v.nodes.length })),
};
write('contrast-voters.json', contrastVoters);

// --- A11Y-CONTRAST-04: dark mode
try {
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const darkMode = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    hasDark: document.documentElement.classList.contains('dark'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  const contrastDark = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  results.CONTRAST_dark = {
    mode: darkMode,
    violations: contrastDark.violations.map((v) => ({ id: v.id, impact: v.impact, nodeCount: v.nodes.length })),
  };
  write('contrast-dark.json', contrastDark);
  // reset
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
} catch (e) {
  results.CONTRAST_dark = { error: e.message };
}

await ctx.close();

// --- A11Y-TOUCH-01 / 02 (mobile viewport, volunteer)
const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const mp = await mobileCtx.newPage();
try {
  await login(mp, 'qa-volunteer@civpulse.org', 'S27hYyk#b6ntLK8jHZLv');
  const fieldSurfaces = [
    { label: 'field-hub', url: `${PROD}/field/${CAMPAIGN}/` },
    { label: 'field-canvassing', url: `${PROD}/field/${CAMPAIGN}/canvassing` },
    { label: 'field-phone-banking', url: `${PROD}/field/${CAMPAIGN}/phone-banking` },
  ];
  const touchReport = [];
  for (const s of fieldSurfaces) {
    await mp.goto(s.url, { waitUntil: 'networkidle' }).catch(() => {});
    await mp.waitForTimeout(1500);
    const small = await mp.evaluate(() => {
      const controls = [...document.querySelectorAll('button, a[href], [role=button], input, select, textarea')];
      return controls
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || '') };
        })
        .filter((x) => x.w < 44 || x.h < 44);
    });
    touchReport.push({ ...s, smallCount: small.length, samples: small.slice(0, 6) });
  }
  results.TOUCH_field = touchReport;

  // voter list mobile
  await mp.goto(`${PROD}/campaigns/${CAMPAIGN}/voters`, { waitUntil: 'networkidle' }).catch(() => {});
  await mp.waitForTimeout(1500);
  const smallVoters = await mp.evaluate(() => {
    const controls = [...document.querySelectorAll('button, a[href], [role=button], input, select, textarea')];
    return controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || '') };
      })
      .filter((x) => x.w < 44 || x.h < 44);
  });
  results.TOUCH_voters = { smallCount: smallVoters.length, samples: smallVoters.slice(0, 10) };
} catch (e) {
  results.TOUCH_error = e.message;
}
await mobileCtx.close();

// --- A11Y-MOTION-01: reduced motion
const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rmp = await rmCtx.newPage();
try {
  await login(rmp, OWNER_EMAIL, OWNER_PASSWORD);
  await rmp.goto(`${PROD}/`, { waitUntil: 'networkidle' });
  await rmp.waitForTimeout(1500);
  const animated = await rmp.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const running = all.filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.animationName === 'none' || cs.animationDuration === '0s') return false;
      return true;
    });
    return { total: all.length, running: running.length, samples: running.slice(0, 5).map((el) => ({ tag: el.tagName, cls: el.className.toString().slice(0, 100), anim: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration })) };
  });
  results.MOTION_01 = animated;
} catch (e) {
  results.MOTION_01 = { error: e.message };
}
await rmCtx.close();

// --- A11Y-FORM-01/02/03: voter create form
const formCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const fp = await formCtx.newPage();
try {
  await login(fp, OWNER_EMAIL, OWNER_PASSWORD);
  await fp.goto(`${PROD}/campaigns/${CAMPAIGN}/voters`, { waitUntil: 'networkidle' });
  await fp.waitForTimeout(1200);
  // Try to open new voter form
  let formOpened = false;
  try {
    await fp.getByRole('button', { name: /add voter|new voter|create voter|\+ voter/i }).first().click({ timeout: 3000 });
    await fp.waitForTimeout(800);
    formOpened = true;
  } catch {
    try {
      await fp.getByRole('link', { name: /add voter|new voter|create voter/i }).first().click({ timeout: 2000 });
      await fp.waitForTimeout(800);
      formOpened = true;
    } catch {}
  }
  const formInfo = await fp.evaluate(() => {
    const required = [...document.querySelectorAll('input[required], textarea[required], select[required]')].map((el) => ({
      name: el.getAttribute('name'), required: el.hasAttribute('required'), ariaRequired: el.getAttribute('aria-required'),
    }));
    const allAriaReq = [...document.querySelectorAll('[aria-required="true"]')].map((el) => ({ name: el.getAttribute('name'), tag: el.tagName }));
    const fieldsets = [...document.querySelectorAll('fieldset')].map((el) => ({
      hasLegend: !!el.querySelector('legend'),
      radios: el.querySelectorAll('input[type=radio]').length,
    }));
    const radioGroups = [...document.querySelectorAll('[role=radiogroup]')].map((el) => ({
      labelledby: el.getAttribute('aria-labelledby'),
      label: el.getAttribute('aria-label'),
    }));
    return { formOpened: !!document.querySelector('form'), requiredInputs: required, ariaRequired: allAriaReq, fieldsets, radioGroups };
  });
  results.FORM = { formOpened, ...formInfo };
} catch (e) {
  results.FORM = { error: e.message };
}
await formCtx.close();

await browser.close();

fs.writeFileSync(`${OUT_BASE}/_checks-summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  KBD_01_stops: results.KBD_01.stops,
  KBD_01_first: results.KBD_01.firstLabel,
  KBD_02_missing: results.KBD_02.missing,
  KBD_02_checked: results.KBD_02.checked,
  KBD_08: results.KBD_08,
  SR_landmarks: results.SR.map((s) => ({ label: s.label, lm: s.landmarks, unnamed: s.unnamedCount, icons: s.iconBtnsCount, orphans: s.orphanInputsCount, live: s.liveRegions.length, roleStatus: s.roleStatus })),
  SR_06: results.SR_06,
  CONTRAST_home: results.CONTRAST.violations,
  CONTRAST_dashboard: results.CONTRAST_dashboard.violations,
  CONTRAST_voters: results.CONTRAST_voters.violations,
  CONTRAST_dark: results.CONTRAST_dark?.violations || results.CONTRAST_dark,
  TOUCH_field: results.TOUCH_field,
  TOUCH_voters: results.TOUCH_voters,
  MOTION_01: results.MOTION_01,
  FORM: results.FORM,
}, null, 2));
