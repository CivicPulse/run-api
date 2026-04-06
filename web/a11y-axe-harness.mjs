// a11y-axe-harness.mjs — run axe-core against a prod URL
import { chromium } from 'playwright';
import AxeBuilderMod from '@axe-core/playwright';
import fs from 'node:fs';

const AxeBuilder = AxeBuilderMod.default || AxeBuilderMod.AxeBuilder || AxeBuilderMod;

const URL = process.env.URL;
const LABEL = process.env.LABEL || 'scan';
const AUTH = process.env.AUTH === '1';
const VIEWPORT = process.env.VIEWPORT === 'mobile'
  ? { width: 375, height: 667 }
  : { width: 1440, height: 900 };
const OUT_BASE = process.env.OUT_BASE || 'docs/production-shakedown/results/evidence/phase-14';
const OUT = `${OUT_BASE}/${LABEL}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();

try {
  if (AUTH) {
    await page.goto('https://run.civpulse.org/');
    await page.waitForSelector('input', { timeout: 30000 });
    await page.locator('input').first().fill(process.env.EMAIL);
    await page.getByRole('button', { name: /continue|next|sign in|log in/i }).first().click();
    await page.waitForSelector('input[type=password]', { timeout: 30000 });
    await page.locator('input[type=password]').fill(process.env.PASSWORD);
    await page.getByRole('button', { name: /continue|next|sign in|log in/i }).first().click();
    await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 45000 });
  }

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);

  // Optional extra interactions
  if (process.env.PRE_CLICK) {
    try {
      await page.getByRole('button', { name: new RegExp(process.env.PRE_CLICK, 'i') }).first().click({ timeout: 3000 });
      await page.waitForTimeout(500);
    } catch (e) {
      // ignore
    }
  }

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const bucket = { critical: [], serious: [], moderate: [], minor: [] };
  for (const v of results.violations) (bucket[v.impact] || (bucket[v.impact] = [])).push(v);

  fs.writeFileSync(`${OUT}/axe-results.json`, JSON.stringify(results, null, 2));
  try { await page.screenshot({ path: `${OUT}/page.png`, fullPage: true }); } catch (e) {}

  const summary = {
    url: URL,
    label: LABEL,
    viewport: VIEWPORT,
    counts: {
      critical: bucket.critical.length,
      serious: bucket.serious.length,
      moderate: bucket.moderate.length,
      minor: bucket.minor.length,
    },
    criticalIds: bucket.critical.map((v) => v.id),
    seriousIds: bucket.serious.map((v) => v.id),
    moderateIds: bucket.moderate.map((v) => v.id),
    minorIds: bucket.minor.map((v) => v.id),
  };
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  process.exit((bucket.critical.length + bucket.serious.length) > 0 ? 1 : 0);
} catch (err) {
  console.error('HARNESS_ERROR:', err.message);
  try { await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }); } catch (e) {}
  try { fs.writeFileSync(`${OUT}/error.txt`, String(err.stack || err)); } catch (e) {}
  await browser.close();
  process.exit(2);
}
