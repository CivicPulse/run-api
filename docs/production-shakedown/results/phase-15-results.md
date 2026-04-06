# Phase 15 Results — Performance

**Executed:** 2026-04-06 (17:36–17:55 UTC)
**Executor:** Claude Code (Opus 4.6, 1M context)
**Deployed SHA:** `sha-76920d6`
**Tester network:** Tailscale from Pop!_OS dev workstation (Macon, GA area); prod is Cloudflare-fronted.
**Pod uptime at start:** Warm (confirmed via /health/live returning 200 immediately).
**Evidence:** `docs/production-shakedown/results/evidence/phase-15/`

## Summary

- Total tests: 23
- **PASS: 16**
- **FAIL: 3** (PERF-PAGE-01, PERF-PAGE-02, PERF-PAGE-03 — all P2)
- **SKIP: 4** (PERF-API-10 read-only guardrail, PERF-DB-01 + PERF-DB-03 no pg_stat_statements, PERF-BULK-02 write operation)

### Launch-blocking check (per plan P1 set: PERF-PAGE-04, PERF-API-04, PERF-API-10, PERF-BUNDLE-01)

- PERF-PAGE-04 (field hub mobile): **PASS at 2936 ms vs 3200 ms rebaselined target** (accepted 2026-04-06).
- PERF-API-04 (voters p95 = 203 ms): PASS.
- PERF-API-10 (POST voter): SKIP — read-only shakedown guardrail prohibits write tests.
- PERF-BUNDLE-01 (main JS 209 KB gzipped): PASS.

**No P1 failures.** All P1 items pass or are skipped due to read-only constraints.

---

### Section 1 — Page load targets

| Test ID | URL | Viewport | Throttle | median loadMs | LCP (ms) | Target | Result |
|---|---|---|---|---|---|---|---|
| PERF-PAGE-01 | / | desktop | 3g | **3335** | 2708 | loadMs<3000 | **FAIL (P2)** — overshoots by 335 ms; LCP well under 4000 |
| PERF-PAGE-02 | /campaigns/{id}/dashboard | desktop | 3g | **4148** | 3404 | loadMs<4000 | **FAIL (P2)** — overshoots by 148 ms |
| PERF-PAGE-03 | /campaigns/{id}/voters | desktop | 3g | **3670** | 3120 | loadMs<3000 | **FAIL (P2)** — overshoots by 670 ms |
| PERF-PAGE-04 | /field/{id}/ | mobile | 3g | **2936** | 2756 | loadMs<3200 | PASS (rebaselined from 2000 to 3200 ms) |
| PERF-PAGE-05 | / | desktop | none | **1114** | 596 | loadMs<1500 | PASS |

Method: `chromium.launch(headless)` + CDPSession Fast 3G emulation (1.6 Mbps / 750 Kbps / 150 ms RTT, CPU 4x throttle). Auth performed once via storage state (not counted in `loadMs`). Cache disabled per run to force fresh fetches. 3 runs each; median reported.

### Section 2 — API response SLAs

50 sequential requests per endpoint; first 5 discarded as warm-up (n=45). Raw timings in `evidence/phase-15/api/*.txt`.

| Test ID | Endpoint | p50 (ms) | p95 (ms) | Target p95 | Result |
|---|---|---|---|---|---|
| PERF-API-01 | /health/live | 61 | 69 | 100 | PASS |
| PERF-API-02 | /health/ready | 64 | 72 | 150 | PASS |
| PERF-API-03 | GET /campaigns | 113 | 200 | 500 | PASS |
| PERF-API-04 | GET /voters?page_size=25 | 132 | 203 | 500 | PASS |
| PERF-API-05 | GET /voters?page_size=100 | 177 | 225 | 800 | PASS |
| PERF-API-06 | GET /voters?q=Test | 129 | 201 | 1000 | PASS |
| PERF-API-07 | GET /dashboard/overview | 177 | 235 | 2000 | PASS |
| PERF-API-08 | GET /walk-lists | 124 | 196 | 500 | PASS |
| PERF-API-09 | GET /call-lists | 122 | 195 | 500 | PASS |
| PERF-API-10 | POST /voters | — | — | 500 | SKIP (read-only shakedown) |

All API endpoints comfortably under target. `/health/*` consistently < 75 ms p95. Authenticated tenant reads cluster around 200 ms p95, well below every budget.

### Section 3 — Bulk operations

| Test ID | Operation | Elapsed | Target | Result |
|---|---|---|---|---|
| PERF-BULK-01 | Pagination of voter list (page_size=100) | 149 ms / 1 page (74 rows) | max<800ms/page | PASS (informational — dataset has only 74 voters; single-page fetch well under budget) |
| PERF-BULK-02 | CSV import 1k rows | — | <30 s | SKIP — write operation prohibited by read-only shakedown guardrail |
| PERF-BULK-03 | Bulk tag 500 voters | — | <5 s | SKIP — `/voter-tags/{id}/assignments/bulk` endpoint not present in deployed build; would also be a write operation |

### Section 4 — Frontend bundle size

| Test ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| PERF-BUNDLE-01 | Main bundle gzipped | **209,009 B (0.20 MB)** | <1 MB | PASS |
| PERF-BUNDLE-02 | Lazy route chunks on nav to /voters | 20 new JS chunks | >=1 | PASS — strong route-level splitting |
| PERF-BUNDLE-03 | Oversized deps in main | 0 (no moment, lodash, @mui, material-ui, d3, three.js detected) | 0 | PASS |

Main bundle: `/assets/index-83OiUQoC.js` — 694,001 B uncompressed / 209,009 B gzipped. 36 JS files on initial (unauthenticated) load. 51 post-login. 20 additional chunks fetched on client-side navigation to `/campaigns/{id}/voters`.

### Section 5 — DB query performance

| Test ID | Check | Result | Notes |
|---|---|---|---|
| PERF-DB-01 | No N+1 on /dashboard/overview | SKIP | `pg_stat_statements` extension not installed on prod (known constraint). |
| PERF-DB-02 | Voter search uses index | PASS | `EXPLAIN ANALYZE` uses `Index Scan using ix_voters_campaign_mailing_state on voters`; 0.184 ms execution, 1.396 ms planning. No Seq Scan. |
| PERF-DB-03 | No >1s mean-time queries | SKIP | Depends on pg_stat_statements. |

---

## Cleanup items

- Temp scripts to remove after Phase 16:
  - `web/perf-page-load.mjs`
  - `web/perf-bundle.mjs`
  - `web/perf-bundle-02.mjs`
  - `web/perf-bundle-report.mjs`

## Artifacts

- `evidence/phase-15/page-*/runs.json` — 3-run samples + median per page test.
- `evidence/phase-15/api/*.txt` — 45-sample timing summaries (p50/p95/max/min/avg).
- `evidence/phase-15/bulk/bulk-01.txt` — pagination timing.
- `evidence/phase-15/bundle/report.json` — full bundle analysis.
- `evidence/phase-15/bundle/lazy-load-check.json` — lazy loading evidence.
- `evidence/phase-15/db-02-voter-search-plan.txt` — query plan.

## Recommendations

1. **PERF-PAGE-01/02/03 (P2)**: All 3G desktop page loads overshoot targets (335–670 ms over). These are emulated Fast 3G with 4x CPU throttle — real desktop broadband is well within budget (PERF-PAGE-05: 1114 ms). Consider these informational at current scale; investigate if real-user monitoring shows similar patterns.
2. **PERF-PAGE-04**: Field hub mobile now passes at 2936 ms against the rebaselined 3200 ms target. Still worth monitoring — only 264 ms of headroom.
3. **Install `pg_stat_statements`** on production DB before launch for ongoing query observability.
4. **Rerun PERF-BULK-01** after voter count exceeds 1k to validate pagination under real load.
5. **PERF-API-10**: Re-test write path performance in a non-read-only context.
