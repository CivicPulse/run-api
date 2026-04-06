import { chromium } from 'playwright';

const EMAIL = 'qa-owner@civpulse.org';
const PASSWORD = 'k%A&ZrlYH4tgztoVK&Ms';
const CAMPAIGN_ID = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
const VOTER_IDS = ['6ded6bc1-3fe0-4cbb-b517-1b4d1a006447', 'd6856ae0-b6cc-4668-9b2d-7355129e82c9'];

const b = await chromium.launch({ headless: true });
const page = await b.newPage();
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

await page.goto('https://run.civpulse.org');
await page.waitForSelector('input');
await page.locator('input').first().fill(EMAIL);
await page.getByRole('button', { name: /continue|next|log ?in|sign ?in/i }).click();
await page.waitForSelector('input[type=password]');
await page.locator('input[type=password]').fill(PASSWORD);
await page.getByRole('button', { name: /continue|next|log ?in|sign ?in/i }).click();
await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 20000 });
console.log('logged in:', page.url());

// Visit voter list first
await page.goto(`https://run.civpulse.org/campaigns/${CAMPAIGN_ID}/voters`);
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));
const pwnedAfterList = await page.evaluate(() => ({ pwned: window.__pwned, xss2: window.__xss2 }));
console.log('After voter list:', JSON.stringify(pwnedAfterList));
console.log('Dialogs fired:', dialogs.length);

// Visit each voter detail
for (const vid of VOTER_IDS) {
  await page.goto(`https://run.civpulse.org/campaigns/${CAMPAIGN_ID}/voters/${vid}`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  const res = await page.evaluate(() => ({ pwned: window.__pwned, xss2: window.__xss2 }));
  console.log(`After voter ${vid}:`, JSON.stringify(res));
}

// Check script text is escaped in DOM
const content = await page.content();
const hasScript = content.includes('<script>window.__pwned');
const hasEscaped = content.includes('&lt;script&gt;') || content.includes('window.__pwned');
console.log('rawScriptTag:', hasScript, 'escapedOrAsText:', hasEscaped);
console.log('Dialogs total:', dialogs.length, dialogs);

// CSP headers check
const resp = await page.request.get('https://run.civpulse.org/');
console.log('CSP:', resp.headers()['content-security-policy'] || 'NONE');
console.log('X-Frame-Options:', resp.headers()['x-frame-options'] || 'NONE');
console.log('X-Content-Type-Options:', resp.headers()['x-content-type-options'] || 'NONE');

await b.close();
