# Phase 15: Performance

**Prefix:** `PERF`
**Depends on:** phase-00, phase-05
**Estimated duration:** 20 min
**Agents required:** 1

## Purpose

Validate that production meets baseline performance SLAs under light load. This is **not** a load test — k6/Artillery at scale is a separate effort. Instead we capture:

- Initial page load timings (TTI, LCP, transfer bytes) on key surfaces.
- API p50/p95 latency for common endpoints measured over 50 sequential requests.
- Bulk-operation budget (imports, tag application).
- Frontend bundle size + code-splitting sanity.
- DB query health — no obvious N+1 on dashboard aggregates.

Failures against these thresholds are **P1** if they affect core workflows (login, voter list, field hub) and **P2** if they affect admin surfaces.

## Prerequisites

- Phase 00 complete (authenticated users + seed data).
- Phase 05 complete (voters populated — tests benefit from ≥50 voters in Org A).
- `hey` installed (`go install github.com/rakyll/hey@latest`) OR `wrk` OR fallback to a curl-based loop.
- Playwright ≥ 1.58 available at `web/node_modules/playwright`.
- JWT for `qa-owner@civpulse.org` stored in `$TOKEN_A` (see README § "Obtaining a JWT").
- `CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248`.
- Evidence output: `docs/production-shakedown/results/evidence/phase-15/`.

```bash
mkdir -p docs/production-shakedown/results/evidence/phase-15
```

**Environment conditions to record** in every test's Notes column:

- Time of day (UTC)
- Tester network location (ISP / approximate latency to `run.civpulse.org`)
- Whether k8s pod was cold or warm (check `kubectl -n civpulse-prod get pods -l app=run-api` uptime)

---

## Section 1: Page Load Targets

Use Playwright to capture Core Web Vitals + Navigation Timing API metrics. Each test runs cold (new browser context, cache disabled) 3 times; report the **median** run.

### Shared harness: `web/perf-page-load.mjs`

```javascript
// web/perf-page-load.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL;
const LABEL = process.env.LABEL || 'perf';
const AUTH = process.env.AUTH === '1';
const MOBILE = process.env.VIEWPORT === 'mobile';
const THROTTLE = process.env.THROTTLE === '3g'; // emulate Fast 3G
const OUT = `docs/production-shakedown/results/evidence/phase-15/${LABEL}`;
fs.mkdirSync(OUT, { recursive: true });

async function measure() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: MOBILE ? { width: 375, height: 667 } : { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const client = await page.context().newCDPSession(page);
  if (THROTTLE) {
    // Fast 3G: 1.6 Mbps down, 750 Kbps up, 150 ms RTT
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  if (AUTH) {
    await page.goto('https://run.civpulse.org/');
    await page.waitForSelector('input', { timeout: 30000 });
    await page.locator('input').first().fill(process.env.EMAIL);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForSelector('input[type=password]', { timeout: 30000 });
    await page.locator('input[type=password]').fill(process.env.PASSWORD);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/, { timeout: 45000 });
  }

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle' });
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

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await measure());
runs.sort((a, b) => a.loadMs - b.loadMs);
const median = runs[1];
fs.writeFileSync(`${OUT}/runs.json`, JSON.stringify({ runs, median }, null, 2));
console.log(JSON.stringify({ url: URL, throttle: THROTTLE, viewport: MOBILE ? 'mobile' : 'desktop', median }, null, 2));
```

---

### PERF-PAGE-01 | Home page TTI under Fast 3G (desktop)

**Purpose:** Global TTI budget for authenticated landing.

**Environment:** Fast 3G emulation, CPU 4× slowdown, desktop viewport, sample size 3 runs (median reported).

**Steps:**
```bash
cd web && AUTH=1 EMAIL='qa-owner@civpulse.org' PASSWORD='k%A&ZrlYH4tgztoVK&Ms' \
  URL='https://run.civpulse.org/' LABEL='page-01-home-3g' THROTTLE=3g \
  node perf-page-load.mjs
```

**Expected:** median `loadMs` < 3000 ms, LCP < 4000 ms.

**Pass criteria:** median `loadMs < 3000` AND `lcp < 4000`.

---

### PERF-PAGE-02 | Campaign dashboard under Fast 3G

**Purpose:** Dashboard renders Recharts — charts are the heaviest widget.

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/dashboard`

**Steps:** As PERF-PAGE-01 with `URL` replaced; `LABEL='page-02-dashboard-3g'`.

**Expected:** median `loadMs` < 4000 ms (charts add ~500-800 ms of JS parse).

**Pass criteria:** median `loadMs < 4000`.

---

### PERF-PAGE-03 | Voter list initial render under Fast 3G

**URL:** `https://run.civpulse.org/campaigns/06d710c8-32ce-44ae-bbab-7fcc72aab248/voters`

**LABEL:** `page-03-voter-list-3g`

**Expected:** median `loadMs < 3000`, first page of voters visible.

**Pass criteria:** median `loadMs < 3000`.

---

### PERF-PAGE-04 | Field hub mobile (critical for field use)

**Purpose:** Volunteers load this on real mobile hardware over cellular. Tightest budget.

**URL:** `https://run.civpulse.org/field/06d710c8-32ce-44ae-bbab-7fcc72aab248/`

**Steps:** Authenticate as `qa-volunteer@civpulse.org`. `VIEWPORT=mobile`, `THROTTLE=3g`.

```bash
cd web && AUTH=1 EMAIL='qa-volunteer@civpulse.org' PASSWORD='S27hYyk#b6ntLK8jHZLv' \
  URL='https://run.civpulse.org/field/06d710c8-32ce-44ae-bbab-7fcc72aab248/' \
  LABEL='page-04-field-hub' VIEWPORT=mobile THROTTLE=3g \
  node perf-page-load.mjs
```

**Expected:** median `loadMs < 2000` ms. Field mode is the tightest budget because volunteers work under time pressure.

**Pass criteria:** median `loadMs < 2000`.

---

### PERF-PAGE-05 | Home page TTI on desktop broadband (baseline)

**Purpose:** Establish best-case baseline for regression tracking.

**Steps:** Same as PERF-PAGE-01 with `THROTTLE=` (unset).

**Expected:** median `loadMs < 1500`, LCP < 2000.

**Pass criteria:** median `loadMs < 1500`.

---

## Section 2: API Response SLAs

Measure p50 + p95 over 50 sequential warm requests per endpoint. Reject the first 5 (warm-up). Use `hey` when available:

```bash
hey -n 50 -c 1 -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org${ENDPOINT}" > "docs/production-shakedown/results/evidence/phase-15/api-${LABEL}.txt"
```

Fallback curl-loop (if `hey` unavailable):

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{time_total}\n" -H "Authorization: Bearer $TOKEN_A" \
    "https://run.civpulse.org${ENDPOINT}"
done | sort -n | awk '
  { a[NR]=$1 } END {
    print "p50="a[int(NR*0.5)], "p95="a[int(NR*0.95)], "max="a[NR]
  }'
```

### PERF-API-01 | /health/live

**Purpose:** Smallest possible handler — upper bound for network + frontend LB overhead.

**Endpoint:** `GET /health/live` (unauthenticated)

**Steps:**
```bash
hey -n 50 -c 1 https://run.civpulse.org/health/live
```

**Expected:** p95 < 100 ms. Median ≤ 50 ms.

**Pass criteria:** p95 < 100 ms.

---

### PERF-API-02 | /health/ready

**Endpoint:** `GET /health/ready`

**Expected:** p95 < 150 ms (includes DB SELECT 1).

**Pass criteria:** p95 < 150 ms.

---

### PERF-API-03 | List campaigns

**Endpoint:** `GET /api/v1/campaigns`

**Steps:**
```bash
hey -n 50 -c 1 -H "Authorization: Bearer $TOKEN_A" https://run.civpulse.org/api/v1/campaigns
```

**Expected:** p95 < 500 ms for small-tenant campaign list (< 20 rows).

**Pass criteria:** p95 < 500 ms.

---

### PERF-API-04 | List voters (page size 25)

**Endpoint:** `GET /api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=25`

**Expected:** p95 < 500 ms.

**Pass criteria:** p95 < 500 ms.

---

### PERF-API-05 | List voters (page size 100)

**Endpoint:** `GET /api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=100`

**Expected:** p95 < 800 ms (larger result set, more serialization).

**Pass criteria:** p95 < 800 ms.

---

### PERF-API-06 | Voter search

**Endpoint:** `GET /api/v1/campaigns/${CAMPAIGN_A}/voters?q=Test`

**Expected:** p95 < 1000 ms. Search hits `ILIKE`/trigram indexes.

**Pass criteria:** p95 < 1000 ms.

---

### PERF-API-07 | Dashboard overview aggregates

**Endpoint:** `GET /api/v1/campaigns/${CAMPAIGN_A}/dashboard/overview`

**Expected:** p95 < 2000 ms. This endpoint aggregates counts + recent activity.

**Pass criteria:** p95 < 2000 ms.

---

### PERF-API-08 | Walk lists index

**Endpoint:** `GET /api/v1/campaigns/${CAMPAIGN_A}/walk-lists`

**Expected:** p95 < 500 ms.

**Pass criteria:** p95 < 500 ms.

---

### PERF-API-09 | Call lists index

**Endpoint:** `GET /api/v1/campaigns/${CAMPAIGN_A}/call-lists`

**Expected:** p95 < 500 ms.

**Pass criteria:** p95 < 500 ms.

---

### PERF-API-10 | Create voter (write path)

**Purpose:** Write endpoints must stay under 500 ms for snappy field UX.

**Endpoint:** `POST /api/v1/campaigns/${CAMPAIGN_A}/voters`

**Steps:**
```bash
hey -n 50 -c 1 -m POST \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"first_name":"PerfTest","last_name":"Voter","address_line_1":"1 Main St","city":"Macon","state":"GA","zip_code":"31201"}' \
  "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters"
```

**Expected:** p95 < 500 ms.

**Pass criteria:** p95 < 500 ms.

**Cleanup:** This creates 50 voters. Delete after: `DELETE FROM voters WHERE first_name='PerfTest'` via psql (or leave — phase 16 will clean).

---

## Section 3: Bulk Operations

### PERF-BULK-01 | Voter list paginates smoothly with 10k rows

**Purpose:** UI should not stall when voter count is large.

**Prerequisites:** Seed 10k voters into a throwaway campaign (if not already present via phase 05 import testing). If unavailable, mark SKIP and record current voter count.

**Steps:**
```bash
# Measure cursor pagination through 10 pages
for i in $(seq 1 10); do
  if [ -z "$CURSOR" ]; then
    RESPONSE=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
      "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=100")
  else
    RESPONSE=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
      "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=100&cursor=${CURSOR}")
  fi
  echo "$i $(echo $RESPONSE | jq '.items | length')"
  CURSOR=$(echo $RESPONSE | jq -r '.pagination.next_cursor // empty')
  [ -z "$CURSOR" ] && break
done
```

Time each iteration with `date +%s%3N` before/after.

**Expected:** Every page loads in < 800 ms.

**Pass criteria:** Max single-page time < 800 ms across all pages.

---

### PERF-BULK-02 | CSV import 1k rows completes < 30s

**Purpose:** Imports are the heaviest background op volunteers-turned-coordinators will hit.

**Steps:** Generate a 1k-row CSV:

```bash
python3 -c "
import csv, sys
w = csv.writer(sys.stdout)
w.writerow(['first_name','last_name','address_line_1','city','state','zip_code'])
for i in range(1000):
    w.writerow([f'Bulk{i}','Imported',f'{i} Test Rd','Macon','GA','31201'])
" > /tmp/perf-import.csv

START=$(date +%s)
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/imports/voters" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/perf-import.csv" | jq -r .id > /tmp/perf-import-id.txt
IMPORT_ID=$(cat /tmp/perf-import-id.txt)

# Poll until status != RUNNING
while true; do
  STATUS=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
    "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/imports/$IMPORT_ID" | jq -r .status)
  END=$(date +%s)
  ELAPSED=$((END - START))
  echo "status=$STATUS elapsed=${ELAPSED}s"
  [ "$STATUS" != "RUNNING" ] && [ "$STATUS" != "PENDING" ] && break
  sleep 2
done
```

**Expected:** Import completes with `status=COMPLETED` in < 30 s.

**Pass criteria:** Total elapsed time < 30 s AND 1000 rows inserted.

**Cleanup:** `DELETE FROM voters WHERE last_name='Imported'` after the test (or via phase 16).

---

### PERF-BULK-03 | Bulk tag add to 500 voters < 5s

**Steps:**
```bash
# Collect 500 voter IDs
VOTER_IDS=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voters?page_size=500" \
  | jq -c '[.items[].id]')
TAG_ID=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voter-tags" \
  | jq -r '.items[0].id')

START=$(date +%s%3N)
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/voter-tags/${TAG_ID}/assignments/bulk" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"voter_ids\": $VOTER_IDS}"
END=$(date +%s%3N)
echo "elapsed=$((END - START))ms"
```

**Expected:** Total < 5000 ms.

**Pass criteria:** Request completes in < 5 s.

**Cleanup:** Unassign via DELETE on the same endpoint, or leave (tag removal is cheap).

---

## Section 4: Frontend Bundle Size

### PERF-BUNDLE-01 | Main JS bundle < 1 MB gzipped

**Purpose:** Field users on mobile cellular are sensitive to initial JS payload.

**Steps:**
```bash
# Fetch index.html and extract bundle URL
curl -fsS https://run.civpulse.org/ -o /tmp/index.html
BUNDLE=$(grep -oE 'src="/assets/[^"]*\.js"' /tmp/index.html | head -1 | sed 's/src="//;s/"//')
echo "Bundle: $BUNDLE"
# Measure gzipped transfer
curl -fsS -H "Accept-Encoding: gzip" -o /tmp/bundle.js.gz --compressed \
  "https://run.civpulse.org${BUNDLE}" -w "size=%{size_download}\n"
# Raw size
curl -fsS -o /tmp/bundle.js "https://run.civpulse.org${BUNDLE}"
ls -la /tmp/bundle.js /tmp/bundle.js.gz
```

Alternative precise measurement via Playwright:

```javascript
// web/perf-bundle.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const jsBytes = [];
page.on('response', async (r) => {
  const ct = r.headers()['content-type'] || '';
  if (ct.includes('javascript')) {
    const buf = await r.body().catch(() => null);
    if (buf) jsBytes.push({ url: r.url(), gzipped: Number(r.headers()['content-length'] || 0), uncompressed: buf.length });
  }
});
await page.goto('https://run.civpulse.org/', { waitUntil: 'networkidle' });
const total = jsBytes.reduce((s, x) => s + (x.gzipped || x.uncompressed), 0);
console.log(JSON.stringify({ total, files: jsBytes }, null, 2));
await browser.close();
```

**Expected:** Main bundle (largest single JS asset) < 1,048,576 bytes (1 MB) gzipped.

**Pass criteria:** Main bundle gzipped < 1 MB.

---

### PERF-BUNDLE-02 | Lazy-loaded routes don't block initial render

**Purpose:** Route-level code splitting verification.

**Steps:** Using Playwright, load `/` and capture JS requests during initial nav. Then click through to `/campaigns/{id}/voters` and record any new JS chunks fetched on navigation.

**Expected:** Initial load fetches ≤ 5 JS chunks. Navigating to voters fetches ≥ 1 additional chunk (proves route code-splitting).

**Pass criteria:** At least one additional JS chunk loads on route navigation (evidence of lazy loading).

---

### PERF-BUNDLE-03 | No oversized dependency in main bundle

**Purpose:** Detect accidental imports of large libs (e.g., moment, full lodash) into the main bundle.

**Steps:** Inspect the main bundle for known-large signatures:

```bash
grep -oE '"(moment|lodash|@mui|material-ui|three|d3-)[^"]*"' /tmp/bundle.js | sort -u
```

Or run `npx source-map-explorer` locally if sourcemaps are served.

**Expected:** No occurrences of `moment`, full `lodash`, or other > 100KB libs in the main bundle.

**Pass criteria:** Zero unexpected large deps in main bundle.

---

## Section 5: DB Query Performance

Run inside the API pod to use the app's own DB connection:

```bash
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- psql "$DATABASE_URL" -c "..."
```

OR via direct psql: `psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod`.

### PERF-DB-01 | No N+1 on dashboard overview

**Purpose:** Detect N+1 via query logs while hitting the dashboard endpoint.

**Steps:**
```bash
# Enable pg_stat_statements (should already be on)
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT pg_stat_statements_reset();
"

# Hit the endpoint 3 times
for i in 1 2 3; do
  curl -fsS -H "Authorization: Bearer $TOKEN_A" \
    "https://run.civpulse.org/api/v1/campaigns/${CAMPAIGN_A}/dashboard/overview" > /dev/null
done

# Inspect top queries
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT calls, mean_exec_time::numeric(10,2) AS mean_ms, LEFT(query, 100) AS q
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY calls DESC
LIMIT 20;
"
```

**Expected:** No query with `calls > 10` for a single 3-request cycle (that would suggest N+1).

**Pass criteria:** All queries have `calls ≤ 6` (allowing 2 per request × 3 requests).

---

### PERF-DB-02 | Index usage on voter search

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
EXPLAIN ANALYZE
SELECT id, first_name, last_name
FROM voters
WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
  AND (first_name ILIKE '%Test%' OR last_name ILIKE '%Test%')
LIMIT 25;
"
```

**Expected:** Plan uses an index (Bitmap/Index Scan) on `campaign_id`. If search column uses trigram GIN, also appears.

**Pass criteria:** At least one `Index Scan` or `Bitmap Index Scan` node in the plan. NO `Seq Scan` on voters for a filtered query when > 1k rows exist.

---

### PERF-DB-03 | Slow query log review

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT mean_exec_time::numeric(10,2) AS mean_ms, calls, LEFT(query, 100) AS q
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND mean_exec_time > 200
ORDER BY mean_exec_time DESC
LIMIT 10;
"
```

**Expected:** No queries with `mean_exec_time > 1000 ms` in the top 10. Any > 200 ms queries logged in Notes for follow-up.

**Pass criteria:** Zero queries with mean_exec_time > 1000 ms on tenant-scoped reads.

---

## Results Template

Save a filled-in copy to `results/phase-15-results.md`.

**Environment (record once):**
- Test run timestamp (UTC): ___
- Tester location / network: ___
- Pod uptime at start: ___
- Deployed image sha: ___

### Section 1: Page load targets

| Test ID | URL | Viewport | Throttle | median loadMs | LCP | Target | Result |
|---|---|---|---|---|---|---|---|
| PERF-PAGE-01 | / | desktop | 3g | | | loadMs<3000 | |
| PERF-PAGE-02 | /campaigns/{id}/dashboard | desktop | 3g | | | loadMs<4000 | |
| PERF-PAGE-03 | /campaigns/{id}/voters | desktop | 3g | | | loadMs<3000 | |
| PERF-PAGE-04 | /field/{id}/ | mobile | 3g | | | loadMs<2000 | |
| PERF-PAGE-05 | / | desktop | none | | | loadMs<1500 | |

### Section 2: API response SLAs

| Test ID | Endpoint | p50 (ms) | p95 (ms) | Target p95 | Result |
|---|---|---|---|---|---|
| PERF-API-01 | /health/live | | | 100 | |
| PERF-API-02 | /health/ready | | | 150 | |
| PERF-API-03 | GET /campaigns | | | 500 | |
| PERF-API-04 | GET /voters?page_size=25 | | | 500 | |
| PERF-API-05 | GET /voters?page_size=100 | | | 800 | |
| PERF-API-06 | GET /voters?q=Test | | | 1000 | |
| PERF-API-07 | GET /dashboard/overview | | | 2000 | |
| PERF-API-08 | GET /walk-lists | | | 500 | |
| PERF-API-09 | GET /call-lists | | | 500 | |
| PERF-API-10 | POST /voters | | | 500 | |

### Section 3: Bulk operations

| Test ID | Operation | Elapsed | Target | Result |
|---|---|---|---|---|
| PERF-BULK-01 | 10 pages × 100 voters | | max<800ms/page | |
| PERF-BULK-02 | CSV import 1k rows | | <30s | |
| PERF-BULK-03 | Bulk tag 500 voters | | <5s | |

### Section 4: Frontend bundle size

| Test ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| PERF-BUNDLE-01 | Main bundle gzipped | | <1 MB | |
| PERF-BUNDLE-02 | Lazy route chunk count | | ≥1 | |
| PERF-BUNDLE-03 | Oversized deps in main | | 0 | |

### Section 5: DB query performance

| Test ID | Check | Result | Notes |
|---|---|---|---|
| PERF-DB-01 | No N+1 on /dashboard/overview | | |
| PERF-DB-02 | Voter search uses index | | |
| PERF-DB-03 | No >1s mean-time queries | | |

### Summary

- Total tests: 23
- PASS: ___ / 23
- FAIL: ___ / 23
- SKIP: ___ / 23
- BLOCKED: ___ / 23

**Launch-blocking:** P1 if any of { PERF-PAGE-04, PERF-API-04, PERF-API-10, PERF-BUNDLE-01 } fail — these directly impact field volunteer UX. Everything else P2 at current scale (< 10k voters); revisit under real load.

## Cleanup

- Delete `web/perf-page-load.mjs` and `web/perf-bundle.mjs` after phase 15 completes.
- Clean perf-generated voter rows:
  ```sql
  DELETE FROM voters WHERE first_name='PerfTest' OR last_name='Imported';
  ```
  (or defer to phase 16 cleanup).
- Keep evidence JSON under `docs/production-shakedown/results/evidence/phase-15/` for post-launch regression comparison.
