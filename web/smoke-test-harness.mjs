#!/usr/bin/env node
// Role-parameterized smoke test for run.civpulse.org
// Usage: EMAIL=x PASSWORD=y ROLE=z npx playwright-core or run via `node smoke-test-harness.mjs`
// Expects playwright package to be available via npx.
//
// Outputs:
//   - stdout: structured JSON result
//   - screenshots/smoke-<role>/*.png
//
// Exit code: 0 on login success, 1 on login failure / unexpected error

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const ROLE = process.env.ROLE || 'unknown';
const BASE = 'https://run.civpulse.org';
const CAMPAIGN_ID = '06d710c8-32ce-44ae-bbab-7fcc72aab248';

if (!EMAIL || !PASSWORD) {
  console.error('EMAIL and PASSWORD env vars required');
  process.exit(2);
}

const OUT_DIR = join(process.cwd(), '..', 'screenshots', `smoke-${ROLE}`);
mkdirSync(OUT_DIR, { recursive: true });

// Per-role probe targets. Each probe records: URL, final status, whether
// an error-indicating string rendered on page, and any 4xx/5xx API calls
// seen while that page was active.
const PROBES = [
  { key: 'home',            path: '/',                                        hint: 'org dashboard' },
  { key: 'campaign_dash',   path: `/campaigns/${CAMPAIGN_ID}/dashboard`,      hint: 'campaign dashboard' },
  { key: 'voters',          path: `/campaigns/${CAMPAIGN_ID}/voters`,         hint: 'voters list' },
  { key: 'canvassing',      path: `/campaigns/${CAMPAIGN_ID}/canvassing`,     hint: 'canvassing' },
  { key: 'phone_banking',   path: `/campaigns/${CAMPAIGN_ID}/phone-banking`,  hint: 'phone banking' },
  { key: 'surveys',         path: `/campaigns/${CAMPAIGN_ID}/surveys`,        hint: 'surveys' },
  { key: 'volunteers',      path: `/campaigns/${CAMPAIGN_ID}/volunteers`,     hint: 'volunteers' },
  { key: 'field_ops',       path: `/field/${CAMPAIGN_ID}`,                    hint: 'field operations' },
  { key: 'campaign_settings', path: `/campaigns/${CAMPAIGN_ID}/settings`,     hint: 'campaign settings' },
  { key: 'org_members',     path: '/org/members',                             hint: 'org members (admin+)' },
  { key: 'org_settings',    path: '/org/settings',                            hint: 'org settings (admin+)' },
  { key: 'new_campaign',    path: '/campaigns/new',                           hint: 'create campaign (admin+)' },
];

const result = {
  role: ROLE,
  email: EMAIL,
  startedAt: new Date().toISOString(),
  loginSuccess: false,
  probes: [],
  apiErrors: [],  // 4xx/5xx from /api/v1/**
  consoleErrors: [],
  pageErrors: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

// Track all API errors globally (4xx/5xx to the api)
page.on('response', async (resp) => {
  const url = resp.url();
  const status = resp.status();
  if (url.includes('/api/v1/') && status >= 400) {
    let body = '';
    try { body = (await resp.text()).slice(0, 200); } catch {}
    result.apiErrors.push({ url: url.replace(BASE, ''), status, body });
  }
});
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    result.consoleErrors.push(msg.text().slice(0, 200));
  }
});
page.on('pageerror', (err) => {
  result.pageErrors.push(err.message.slice(0, 200));
});

try {
  // 1. Navigate to landing — should redirect to /login → OIDC
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: join(OUT_DIR, '01-login-redirected.png') });

  // 2. Fill ZITADEL login form (loginname step)
  await page.waitForSelector('input[type="text"], input[name="loginName"], input[autocomplete="username"]', { timeout: 15000 });
  // ZITADEL uses a generic textbox; grab first visible text/username input
  const loginInput = page.locator('input').filter({ hasNot: page.locator('[type="hidden"]') }).first();
  await loginInput.fill(EMAIL);
  // Continue button — find submit or button with "continue" text
  const continueBtn = page.getByRole('button', { name: /continue/i });
  await continueBtn.click();

  // 3. Password step
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /continue/i }).click();

  // 4. Wait for redirect back to run.civpulse.org
  await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 30000 });
  result.loginSuccess = true;
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: join(OUT_DIR, '02-landed-after-login.png') });
  result.landingUrl = page.url();

  // 5. For each probe: navigate, snapshot, record errors
  for (const probe of PROBES) {
    const probeResult = { key: probe.key, path: probe.path };
    const apiErrorsBefore = result.apiErrors.length;
    try {
      const resp = await page.goto(BASE + probe.path, { waitUntil: 'networkidle', timeout: 20000 });
      probeResult.httpStatus = resp ? resp.status() : null;
      probeResult.finalUrl = page.url();
      // Check if the page URL was redirected to login (session lost or access denied)
      probeResult.redirectedToLogin = /\/login/.test(page.url()) || /auth\.civpulse\.org/.test(page.url());
      // Look for on-page error indicators
      const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 2000);
      probeResult.hasForbidden = /forbidden|403|not authorized|access denied|insufficient permissions/i.test(bodyText);
      probeResult.hasError = /error occurred|something went wrong|500|server error/i.test(bodyText);
      probeResult.apiErrorsDuringProbe = result.apiErrors.slice(apiErrorsBefore);
      await page.screenshot({ path: join(OUT_DIR, `probe-${probe.key}.png`) });
    } catch (e) {
      probeResult.error = e.message.slice(0, 200);
    }
    result.probes.push(probeResult);
  }
} catch (e) {
  result.fatalError = e.message.slice(0, 500);
  await page.screenshot({ path: join(OUT_DIR, 'FATAL.png') }).catch(() => {});
} finally {
  result.finishedAt = new Date().toISOString();
  await browser.close();
}

// Write JSON result
writeFileSync(join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.loginSuccess ? 0 : 1);
