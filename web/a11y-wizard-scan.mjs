// a11y-wizard-scan.mjs — scan campaign wizard steps 2-4 without submitting
import { chromium } from 'playwright';
import AxeBuilderMod from '@axe-core/playwright';
import fs from 'node:fs';

const AxeBuilder = AxeBuilderMod.default || AxeBuilderMod.AxeBuilder || AxeBuilderMod;
const OUT_BASE = 'docs/production-shakedown/results/evidence/phase-14';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

try {
  // Authenticate
  await page.goto('https://run.civpulse.org/');
  await page.waitForSelector('input', { timeout: 30000 });
  await page.locator('input').first().fill('qa-owner@civpulse.org');
  await page.getByRole('button', { name: /continue|next|sign in|log in/i }).first().click();
  await page.waitForSelector('input[type=password]', { timeout: 30000 });
  await page.locator('input[type=password]').fill('k%A&ZrlYH4tgztoVK&Ms');
  await page.getByRole('button', { name: /continue|next|sign in|log in/i }).first().click();
  await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 45000 });

  // Navigate to wizard
  await page.goto('https://run.civpulse.org/campaigns/new', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);

  // Try to fill step 1 and advance
  const results = {};

  // Step 2
  try {
    // Fill step 1 minimum fields
    const nameInput = page.getByLabel(/campaign name/i).or(page.locator('input[name="name"]')).first();
    await nameInput.fill('A11Y Wizard Test');
    await page.waitForTimeout(300);

    // Try to find and click Next
    const nextBtn = page.getByRole('button', { name: /next/i }).first();
    await nextBtn.click({ timeout: 3000 });
    await page.waitForTimeout(1000);

    const outDir = `${OUT_BASE}/axe-12-wizard-step-2`;
    fs.mkdirSync(outDir, { recursive: true });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bucket = { critical: [], serious: [], moderate: [], minor: [] };
    for (const v of r.violations) (bucket[v.impact] || (bucket[v.impact] = [])).push(v);
    fs.writeFileSync(`${outDir}/axe-results.json`, JSON.stringify(r, null, 2));
    await page.screenshot({ path: `${outDir}/page.png`, fullPage: true });
    results['axe-12'] = { critical: bucket.critical.length, serious: bucket.serious.length, moderate: bucket.moderate.length, minor: bucket.minor.length };
    console.log('AXE-12:', JSON.stringify(results['axe-12']));
  } catch (e) {
    results['axe-12'] = { error: e.message };
    console.log('AXE-12 ERROR:', e.message);
  }

  // Step 3
  try {
    const nextBtn = page.getByRole('button', { name: /next/i }).first();
    await nextBtn.click({ timeout: 3000 });
    await page.waitForTimeout(1000);

    const outDir = `${OUT_BASE}/axe-13-wizard-step-3`;
    fs.mkdirSync(outDir, { recursive: true });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bucket = { critical: [], serious: [], moderate: [], minor: [] };
    for (const v of r.violations) (bucket[v.impact] || (bucket[v.impact] = [])).push(v);
    fs.writeFileSync(`${outDir}/axe-results.json`, JSON.stringify(r, null, 2));
    await page.screenshot({ path: `${outDir}/page.png`, fullPage: true });
    results['axe-13'] = { critical: bucket.critical.length, serious: bucket.serious.length, moderate: bucket.moderate.length, minor: bucket.minor.length };
    console.log('AXE-13:', JSON.stringify(results['axe-13']));
  } catch (e) {
    results['axe-13'] = { error: e.message };
    console.log('AXE-13 ERROR:', e.message);
  }

  // Step 4
  try {
    const nextBtn = page.getByRole('button', { name: /next/i }).first();
    await nextBtn.click({ timeout: 3000 });
    await page.waitForTimeout(1000);

    const outDir = `${OUT_BASE}/axe-14-wizard-step-4`;
    fs.mkdirSync(outDir, { recursive: true });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bucket = { critical: [], serious: [], moderate: [], minor: [] };
    for (const v of r.violations) (bucket[v.impact] || (bucket[v.impact] = [])).push(v);
    fs.writeFileSync(`${outDir}/axe-results.json`, JSON.stringify(r, null, 2));
    await page.screenshot({ path: `${outDir}/page.png`, fullPage: true });
    results['axe-14'] = { critical: bucket.critical.length, serious: bucket.serious.length, moderate: bucket.moderate.length, minor: bucket.minor.length };
    console.log('AXE-14:', JSON.stringify(results['axe-14']));
  } catch (e) {
    results['axe-14'] = { error: e.message };
    console.log('AXE-14 ERROR:', e.message);
  }

  // Abandon — navigate away without submitting
  await page.goto('https://run.civpulse.org/', { waitUntil: 'networkidle' });

  console.log('RESULTS:', JSON.stringify(results, null, 2));
} catch (err) {
  console.error('HARNESS_ERROR:', err.message);
}
await browser.close();
