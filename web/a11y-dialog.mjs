// Focus management & dialog tests
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/home/kwhatcher/projects/civicpulse/run-api/docs/production-shakedown/results/evidence/phase-14';
const CAMPAIGN = '06d710c8-32ce-44ae-bbab-7fcc72aab248';
const PROD = 'https://run.civpulse.org';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${PROD}/`);
await page.waitForSelector('input', { timeout: 30000 });
await page.locator('input').first().fill('qa-owner@civpulse.org');
await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
await page.waitForSelector('input[type=password]', { timeout: 30000 });
await page.locator('input[type=password]').fill('k%A&ZrlYH4tgztoVK&Ms');
await page.getByRole('button', { name: /continue|next|sign in/i }).first().click();
await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 45000 });

// Navigate to voters and try opening a delete dialog
await page.goto(`${PROD}/campaigns/${CAMPAIGN}/voters`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const results = {};

// Try to find a row action trigger (three-dot menu / delete button)
const triggered = await (async () => {
  try {
    // Try clicking first row's action menu
    const triggers = await page.locator('button[aria-haspopup="menu"], button[aria-label*="actions" i], button[aria-label*="more" i]').all();
    if (triggers.length > 0) {
      await triggers[0].click();
      await page.waitForTimeout(400);
      const deleteItem = page.getByRole('menuitem', { name: /delete|remove/i }).first();
      if (await deleteItem.count() > 0) {
        await deleteItem.click();
        await page.waitForTimeout(500);
        return 'menu->delete';
      }
    }
    // Fall back to any visible delete button
    const delBtn = page.getByRole('button', { name: /delete|remove/i }).first();
    if (await delBtn.count() > 0) {
      await delBtn.click();
      await page.waitForTimeout(500);
      return 'direct-button';
    }
    return null;
  } catch (e) {
    return `error:${e.message}`;
  }
})();

results.triggered = triggered;

// Check if dialog opened and where focus is
const afterOpen = await page.evaluate(() => {
  const el = document.activeElement;
  const dialog = el?.closest('[role=dialog]');
  const anyDialog = document.querySelector('[role=dialog]');
  return {
    insideDialog: !!dialog,
    activeTag: el?.tagName,
    activeLabel: el?.getAttribute('aria-label') || el?.textContent?.trim()?.slice(0, 60),
    dialogExists: !!anyDialog,
    dialogLabel: anyDialog?.getAttribute('aria-labelledby') || anyDialog?.getAttribute('aria-label'),
  };
});
results.afterOpen = afterOpen;

// Press Esc and check focus restored
if (afterOpen.dialogExists) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const afterClose = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName,
      label: el?.getAttribute('aria-label') || el?.textContent?.trim()?.slice(0, 60),
      dialogGone: !document.querySelector('[role=dialog]'),
    };
  });
  results.afterClose = afterClose;
}

// Route change focus (KBD/FOCUS-03)
await page.goto(`${PROD}/campaigns/${CAMPAIGN}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const beforeNav = await page.evaluate(() => ({ tag: document.activeElement.tagName }));
try {
  await page.getByRole('link', { name: /^voters$/i }).first().click();
  await page.waitForTimeout(1000);
  const afterNav = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    isBody: document.activeElement === document.body,
    inMain: !!document.activeElement?.closest('main'),
  }));
  results.routeChange = { before: beforeNav, after: afterNav };
} catch (e) {
  results.routeChange = { error: e.message };
}

fs.writeFileSync(`${OUT}/dialog-focus.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
