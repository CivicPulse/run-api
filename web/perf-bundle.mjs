import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-15/bundle';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const initialJs = [];
page.on('response', async (r) => {
  const url = r.url();
  const ct = r.headers()['content-type'] || '';
  if (ct.includes('javascript') || /\.js(\?|$)/.test(url)) {
    try {
      const buf = await r.body();
      initialJs.push({
        url,
        status: r.status(),
        contentLength: Number(r.headers()['content-length'] || 0),
        contentEncoding: r.headers()['content-encoding'] || 'none',
        uncompressed: buf.length,
      });
    } catch {}
  }
});

await page.goto('https://run.civpulse.org/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const initialCount = initialJs.length;
const initialUrls = new Set(initialJs.map((x) => x.url));

// Now navigate to a route we haven't visited — /login (unauth) doesn't help since auth required
// Login first, then observe new chunks on nav
await page.locator('input').first().fill('qa-owner@civpulse.org');
await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
await page.waitForSelector('input[type=password]');
await page.locator('input[type=password]').fill('k%A&ZrlYH4tgztoVK&Ms');
await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 60000 });
await page.waitForTimeout(2000);

const afterLoginJs = [...initialJs];
const afterLoginCount = afterLoginJs.length;

// Clear tracker, observe navigation to /campaigns
const navJs = [];
const navListener = async (r) => {
  const url = r.url();
  const ct = r.headers()['content-type'] || '';
  if ((ct.includes('javascript') || /\.js(\?|$)/.test(url)) && !initialUrls.has(url)) {
    try {
      const buf = await r.body();
      navJs.push({ url, contentLength: Number(r.headers()['content-length'] || 0), uncompressed: buf.length });
    } catch {}
  }
};
page.on('response', navListener);

await page.goto('https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

fs.writeFileSync(`${OUT}/initial-js.json`, JSON.stringify(initialJs, null, 2));
fs.writeFileSync(`${OUT}/nav-js.json`, JSON.stringify(navJs, null, 2));

// Find main bundle (largest js)
const mainBundle = initialJs.sort((a, b) => b.uncompressed - a.uncompressed)[0];
const totalGzipped = initialJs.reduce((s, x) => s + (x.contentLength || 0), 0);
const totalUncompressed = initialJs.reduce((s, x) => s + x.uncompressed, 0);

// Check known-large libs in largest bundle
let largeLibHits = [];
if (mainBundle) {
  try {
    const res = await page.context().request.get(mainBundle.url);
    const text = await res.text();
    for (const lib of ['moment', 'lodash.', '"lodash"', '@mui', 'material-ui', 'd3-force', 'three.js']) {
      if (text.includes(lib)) largeLibHits.push(lib);
    }
  } catch (e) { largeLibHits = [`err:${e.message}`]; }
}

const report = {
  initialJsCount: initialCount,
  afterLoginJsCount: afterLoginCount,
  navJsCount: navJs.length,
  mainBundle: mainBundle ? { url: mainBundle.url, gzipped: mainBundle.contentLength, uncompressed: mainBundle.uncompressed } : null,
  mainBundleGzipped: mainBundle?.contentLength,
  mainBundleGzippedMB: mainBundle ? (mainBundle.contentLength / 1048576).toFixed(3) : null,
  totalInitialGzipped: totalGzipped,
  totalInitialUncompressed: totalUncompressed,
  largeLibHits,
};
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
