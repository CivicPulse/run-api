#!/usr/bin/env node
// Phase 10 — UI-driven canvassing: dismiss tour, click outcome online, go offline, click N outcomes,
// go online, verify drain, verify DB.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://run.civpulse.org';
const CAMPAIGN_ID = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
const VOLUNTEER_ID = '367278371970744389';
const EMAIL = 'qa-volunteer@civpulse.org';
const PASSWORD = process.env.PASSWORD_VOL || 'S27hYyk#b6ntLK8jHZLv';
const EVIDENCE = join(process.cwd(), '..', 'docs', 'production-shakedown', 'results', 'evidence', 'phase-10');

const t0 = Date.now();
const log = [];
function l(m) { console.log(m); log.push({ t: Date.now() - t0, m }); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const events = { onlinePosts: [], offlineClicks: 0 };
page.on('response', async (r) => {
  if (/door-knocks/.test(r.url()) && r.request().method() === 'POST') {
    events.onlinePosts.push({ status: r.status(), t: Date.now() - t0 });
    l(`POST ${r.request().method()} → ${r.status()}`);
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
await page.waitForURL((u) => !/\/callback/.test(u.toString()) && /run\.civpulse\.org/.test(u.toString()), { timeout: 30000 });
l(`logged in → ${page.url()}`);

// Suppress tours (set BEFORE navigating to /field)
await page.evaluate(({ key }) => {
  localStorage.setItem('tour-state', JSON.stringify({
    state: {
      completions: { [key]: { welcome: true, canvassing: true, phoneBanking: true } },
      sessionCounts: { [key]: { canvassing: 99, phoneBanking: 99 } },
    }, version: 0,
  }));
}, { key: `${CAMPAIGN_ID}_${VOLUNTEER_ID}` });

await page.goto(`${BASE}/field/${CAMPAIGN_ID}/canvassing`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(EVIDENCE, 'ui-flow-canv-ready.png') });

// Check for tour overlay; dismiss if present
const hasWelcomeOverlay = await page.locator('text=/Welcome|Your First/').first().isVisible().catch(() => false);
if (hasWelcomeOverlay) {
  l('tour overlay visible; clicking close');
  await page.locator('button[aria-label*="close" i]').first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

// Scroll the outcome buttons into view
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: join(EVIDENCE, 'ui-flow-scrolled.png') });

// Click one online outcome (verify baseline path)
l('online: click Not Home');
const notHomeBtn = page.getByRole('button', { name: /^Not Home$/ }).first();
const count = await notHomeBtn.count();
l(`Not Home button count=${count}`);
if (count > 0) {
  await notHomeBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await notHomeBtn.click({ timeout: 5000 }).catch((e) => l(`click err: ${e.message.slice(0,100)}`));
  await page.waitForTimeout(2500);
}
const onlinePosts1 = events.onlinePosts.length;
l(`after online click: posts=${onlinePosts1}`);

// Go offline, click 5 outcomes
l('OFFLINE');
await ctx.setOffline(true);
await page.waitForTimeout(1000);

for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const btn = page.getByRole('button', { name: /^(Not Home|Refused|Moved|Come Back|Inaccessible)$/ }).first();
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await btn.click({ timeout: 3000 }).catch((e) => l(`off click ${i} err: ${e.message.slice(0,80)}`));
    events.offlineClicks++;
    await page.waitForTimeout(2000);
  } else {
    l(`no outcome btn at iter ${i}`);
    break;
  }
}
await page.screenshot({ path: join(EVIDENCE, 'ui-flow-offline.png') });

const offlineQueue = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('offline-queue') || '{}').state?.items || []; }
  catch { return []; }
});
l(`after ${events.offlineClicks} offline clicks: queue=${offlineQueue.length}`);

// Go online, wait for drain
l('ONLINE → drain');
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
const drainDeadline = Date.now() + 45000;
let remaining = offlineQueue.length;
while (Date.now() < drainDeadline) {
  await page.waitForTimeout(2000);
  remaining = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('offline-queue') || '{}').state?.items || []).length; }
    catch { return -1; }
  });
  if (remaining === 0) break;
}
l(`drain done: remaining=${remaining}, totalPosts=${events.onlinePosts.length}`);

await page.screenshot({ path: join(EVIDENCE, 'ui-flow-drained.png') });

const result = {
  loggedInUrl: page.url(),
  onlineClickPosts: onlinePosts1,
  offlineClicks: events.offlineClicks,
  queuedOffline: offlineQueue.length,
  remainingAfterDrain: remaining,
  totalPosts: events.onlinePosts.length,
  postStatuses: events.onlinePosts.map(p => p.status),
  sampleQueue: offlineQueue.slice(0, 2),
  log,
};
writeFileSync(join(EVIDENCE, 'ui-flow-result.json'), JSON.stringify(result, null, 2));
l(`Result: ${JSON.stringify(result).slice(0, 300)}`);

await browser.close();
