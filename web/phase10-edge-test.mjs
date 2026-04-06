#!/usr/bin/env node
// Edge case: 404 responses should increment retry and drop after MAX_RETRY=3
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://run.civpulse.org';
const CAMPAIGN_ID = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
const WALK_LIST_ID = '1bb3282d-98b1-4e4f-ab2d-ca1d0951d9e7';
const EMAIL = 'qa-volunteer@civpulse.org';
const PASSWORD = process.env.PASSWORD_VOL || 'S27hYyk#b6ntLK8jHZLv';
const EVIDENCE = join(process.cwd(), '..', 'docs', 'production-shakedown', 'results', 'evidence', 'phase-10');

const t0 = Date.now();
const log = [];
function l(m) { console.log(m); log.push({ t: Date.now() - t0, m }); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const posts = [];
page.on('response', async (r) => {
  if (/door-knocks/.test(r.url()) && r.request().method() === 'POST') {
    posts.push({ status: r.status() });
  }
});

// Login
await page.goto(BASE, { timeout: 30000 });
await page.waitForSelector('input', { timeout: 15000 });
await page.locator('input').filter({ hasNot: page.locator('[type="hidden"]') }).first().fill(EMAIL);
await page.getByRole('button', { name: /continue|next/i }).click();
await page.waitForSelector('input[type="password"]', { timeout: 15000 });
await page.locator('input[type="password"]').fill(PASSWORD);
await page.getByRole('button', { name: /continue|next|sign in/i }).click();
await page.waitForURL(/run\.civpulse\.org\/(?!.*\/callback)/, { timeout: 30000 }).catch(() => {});
l('logged in');

// Navigate to canvassing, then seed 5 BOGUS items (fake UUIDs → will 404 or 4xx)
await page.goto(`${BASE}/field/${CAMPAIGN_ID}/canvassing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);

await page.evaluate(({ campId, wlId }) => {
  const items = [];
  for (let i = 0; i < 5; i++) {
    items.push({
      id: crypto.randomUUID(),
      type: 'door_knock',
      payload: { voter_id: crypto.randomUUID(), walk_list_entry_id: crypto.randomUUID(), result_code: 'not_home', survey_complete: false },
      campaignId: campId,
      resourceId: wlId,
      createdAt: Date.now(),
      retryCount: 0,
    });
  }
  localStorage.setItem('offline-queue', JSON.stringify({ state: { items }, version: 0 }));
}, { campId: CAMPAIGN_ID, wlId: WALK_LIST_ID });

// Reload to hydrate store
await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
l('seeded 5 bogus items');

// Dispatch online events repeatedly (simulates flapping + periodic drain)
// useSyncEngine periodic drain is 30s — simulate 4 drains
const deadline = Date.now() + 180000;
let lastState = null;
while (Date.now() < deadline) {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(10000);
  lastState = await page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('offline-queue') || '{}');
      const items = raw.state?.items || [];
      return { len: items.length, retries: items.map(i => i.retryCount) };
    } catch (e) { return { err: e.message }; }
  });
  l(`state: ${JSON.stringify(lastState)}  posts=${posts.length}`);
  if (lastState.len === 0) break;
}

// Check POST responses — were they all 4xx?
const postSummary = posts.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
l(`posts by status: ${JSON.stringify(postSummary)}, total=${posts.length}`);

writeFileSync(join(EVIDENCE, 'edge-404-retry-result.json'), JSON.stringify({ lastState, postSummary, totalPosts: posts.length, log }, null, 2));

await browser.close();
