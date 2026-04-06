// perf-page-load.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL;
const LABEL = process.env.LABEL || 'perf';
const AUTH = process.env.AUTH === '1';
const MOBILE = process.env.VIEWPORT === 'mobile';
const THROTTLE = process.env.THROTTLE === '3g';
const OUT_BASE = process.env.OUT_BASE || '/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-15';
const OUT = `${OUT_BASE}/${LABEL}`;
fs.mkdirSync(OUT, { recursive: true });

const STORAGE_PATH = `/tmp/perf-storage-${process.env.EMAIL || 'anon'}.json`;

async function ensureAuth() {
  if (!AUTH) return null;
  if (fs.existsSync(STORAGE_PATH) && (Date.now() - fs.statSync(STORAGE_PATH).mtimeMs) < 10 * 60 * 1000) {
    return STORAGE_PATH;
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://run.civpulse.org/');
  await page.waitForSelector('input', { timeout: 45000 });
  await page.locator('input').first().fill(process.env.EMAIL);
  await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
  await page.waitForSelector('input[type=password]', { timeout: 45000 });
  await page.locator('input[type=password]').fill(process.env.PASSWORD);
  await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
  await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await ctx.storageState({ path: STORAGE_PATH });
  await browser.close();
  return STORAGE_PATH;
}

async function measure(storagePath) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: MOBILE ? { width: 375, height: 667 } : { width: 1440, height: 900 },
    storageState: storagePath || undefined,
  });
  const page = await ctx.newPage();
  const client = await page.context().newCDPSession(page);
  // Disable cache to force fresh asset fetches each run
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  if (false) {
    await page.goto('https://run.civpulse.org/');
    await page.waitForSelector('input', { timeout: 45000 });
    await page.locator('input').first().fill(process.env.EMAIL);
    await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
    await page.waitForSelector('input[type=password]', { timeout: 45000 });
    await page.locator('input[type=password]').fill(process.env.PASSWORD);
    await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
    await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 60000 });
  }

  if (THROTTLE) {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  const t0 = Date.now();
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  const loadMs = Date.now() - t0;

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime;
    return {
      ttfb: n?.responseStart,
      domContentLoaded: n?.domContentLoadedEventEnd,
      loadEvent: n?.loadEventEnd,
      fcp,
      transferBytes: n?.transferSize,
    };
  });

  const lcp = await page.evaluate(() => new Promise((resolve) => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      resolve(entries[entries.length - 1]?.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => resolve(null), 3000);
  }));

  await browser.close();
  return { loadMs, lcp, ...nav };
}

const storage = await ensureAuth();
const runs = [];
for (let i = 0; i < 3; i++) runs.push(await measure(storage));
const sorted = [...runs].sort((a, b) => a.loadMs - b.loadMs);
const median = sorted[1];
fs.writeFileSync(`${OUT}/runs.json`, JSON.stringify({ runs, median }, null, 2));
console.log(JSON.stringify({ url: URL, throttle: THROTTLE, viewport: MOBILE ? 'mobile' : 'desktop', median }, null, 2));
