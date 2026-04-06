// Driver: runs all A11Y-AXE scans by reusing one authed browser context.
import { chromium } from 'playwright';
import AxeBuilderMod from '@axe-core/playwright';
import fs from 'node:fs';

const AxeBuilder = AxeBuilderMod.default || AxeBuilderMod.AxeBuilder || AxeBuilderMod;

const OUT_BASE = process.env.OUT_BASE || '/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-14';
const CAMPAIGN = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
const VOTER_ID = '102a7c36-de39-4f35-a356-e7b590af7202';
const PROD = 'https://run.civpulse.org';

const OWNER_EMAIL = 'qa-owner@civpulse.org';
const OWNER_PASSWORD = 'k%A&ZrlYH4tgztoVK&Ms';
const VOL_EMAIL = 'qa-volunteer@civpulse.org';
const VOL_PASSWORD = 'S27hYyk#b6ntLK8jHZLv';

fs.mkdirSync(OUT_BASE, { recursive: true });

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

async function scan(page, label, pre) {
  const OUT = `${OUT_BASE}/${label}`;
  fs.mkdirSync(OUT, { recursive: true });
  try {
    if (pre) await pre(page);
    await page.waitForTimeout(1200);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const bucket = { critical: [], serious: [], moderate: [], minor: [] };
    for (const v of results.violations) (bucket[v.impact] || (bucket[v.impact] = [])).push(v);
    fs.writeFileSync(`${OUT}/axe-results.json`, JSON.stringify(results, null, 2));
    try { await page.screenshot({ path: `${OUT}/page.png`, fullPage: true }); } catch {}
    const summary = {
      label,
      url: page.url(),
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
    console.log(`[${label}] c=${summary.counts.critical} s=${summary.counts.serious} m=${summary.counts.moderate} n=${summary.counts.minor} ids=${[...summary.criticalIds,...summary.seriousIds].join(',')}`);
    return summary;
  } catch (err) {
    console.error(`[${label}] ERROR: ${err.message}`);
    try { await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }); } catch {}
    fs.writeFileSync(`${OUT}/error.txt`, String(err.stack || err));
    return { label, url: page.url(), error: err.message, counts: { critical: 0, serious: 0, moderate: 0, minor: 0 } };
  }
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  });
  await page.waitForTimeout(1500);
}

const summaries = [];

// Desktop context (owner)
const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // AXE-02: login (unauthenticated)
  await goto(page, `${PROD}/login`);
  summaries.push(await scan(page, 'axe-02-login'));

  // Login as owner
  await login(page, OWNER_EMAIL, OWNER_PASSWORD);

  // AXE-01: home
  await goto(page, `${PROD}/`);
  summaries.push(await scan(page, 'axe-01-home'));

  // AXE-03 dashboard
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/dashboard`);
  summaries.push(await scan(page, 'axe-03-campaign-dashboard'));

  // AXE-04 voters
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/voters`);
  summaries.push(await scan(page, 'axe-04-voter-list', async (p) => {
    try { await p.getByRole('button', { name: /filter/i }).first().click({ timeout: 2000 }); } catch {}
  }));

  // AXE-05 voter detail tabs
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/voters/${VOTER_ID}`);
  summaries.push(await scan(page, 'axe-05-voter-detail'));
  for (const t of ['Contacts', 'Tags', 'Interactions', 'History']) {
    try {
      await page.getByRole('tab', { name: new RegExp(t, 'i') }).first().click({ timeout: 2000 });
      await page.waitForTimeout(500);
      summaries.push(await scan(page, `axe-05-voter-detail-${t.toLowerCase()}`));
    } catch (e) {
      console.log(`[axe-05 tab ${t}] not found: ${e.message}`);
    }
  }

  // AXE-06 canvassing
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/canvassing`);
  summaries.push(await scan(page, 'axe-06-canvassing'));

  // AXE-07 phone banking
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/phone-banking/call-lists`);
  summaries.push(await scan(page, 'axe-07-phone-banking'));

  // AXE-08 surveys
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/surveys`);
  summaries.push(await scan(page, 'axe-08-surveys'));

  // AXE-09 volunteers
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/volunteers/roster`);
  summaries.push(await scan(page, 'axe-09-volunteers'));

  // AXE-10 settings
  await goto(page, `${PROD}/campaigns/${CAMPAIGN}/settings/general`);
  summaries.push(await scan(page, 'axe-10-campaign-settings'));

  // AXE-11 wizard step 1
  await goto(page, `${PROD}/campaigns/new`);
  summaries.push(await scan(page, 'axe-11-wizard-step-1'));

  // AXE-12 step 2
  try {
    await page.getByLabel(/campaign name/i).first().fill('A11Y Wizard Test');
    try { await page.getByLabel(/jurisdiction/i).first().fill('Macon-Bibb County, GA'); } catch {}
    await page.getByRole('button', { name: /next/i }).first().click();
    await page.waitForTimeout(800);
    summaries.push(await scan(page, 'axe-12-wizard-step-2'));
    // AXE-13 step 3
    try {
      await page.getByRole('button', { name: /next/i }).first().click();
      await page.waitForTimeout(800);
      summaries.push(await scan(page, 'axe-13-wizard-step-3'));
      try {
        await page.getByRole('button', { name: /next/i }).first().click();
        await page.waitForTimeout(800);
        summaries.push(await scan(page, 'axe-14-wizard-step-4'));
      } catch (e) { console.log('wizard step 4 not reached:', e.message); }
    } catch (e) { console.log('wizard step 3 not reached:', e.message); }
  } catch (e) {
    console.log('wizard step 2 failed:', e.message);
  }

  // AXE-18 org members
  await goto(page, `${PROD}/org/members`);
  summaries.push(await scan(page, 'axe-18-org-members'));

  // AXE-19 org settings
  await goto(page, `${PROD}/org/settings`);
  summaries.push(await scan(page, 'axe-19-org-settings'));

  await ctx.close();
}

// Mobile context (volunteer)
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await login(page, VOL_EMAIL, VOL_PASSWORD);

  await goto(page, `${PROD}/field/${CAMPAIGN}/`);
  summaries.push(await scan(page, 'axe-15-field-hub'));

  await goto(page, `${PROD}/field/${CAMPAIGN}/canvassing`);
  summaries.push(await scan(page, 'axe-16-field-canvassing'));

  await goto(page, `${PROD}/field/${CAMPAIGN}/phone-banking`);
  summaries.push(await scan(page, 'axe-17-field-phone-banking'));

  await ctx.close();
}

await browser.close();

fs.writeFileSync(`${OUT_BASE}/_all-summaries.json`, JSON.stringify(summaries, null, 2));
console.log('DONE', summaries.length);
