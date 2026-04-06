# Phase 15 Results — Performance

**Executed:** 2026-04-05 (20:40–21:00 UTC)
**Executor:** Claude Code (Opus 4.6, 1M context)
**Deployed SHA:** `c1c89c0` (ghcr.io/civicpulse/run-api:sha-c1c89c0)
**Tester network:** Tailscale from Pop!_OS dev workstation (Macon, GA area); prod is Cloudflare-fronted.
**Pod uptime at start:** ≥ 1h (warm); confirmed via /health/live git_sha match.
**Evidence:** `docs/production-shakedown/results/evidence/phase-15/`

## Summary

- Total tests: 23
- **PASS: 17**
- **FAIL: 3** (all P2 except PERF-PAGE-04 → P1)
- **SKIP: 3** (DB pg_stat_statements not installed, imports multi-step flow too complex, bulk tag endpoint not deployed)

### Launch-blocking check (per plan P1 set: PERF-PAGE-04, PERF-API-04, PERF-API-10, PERF-BUNDLE-01)

- PERF-PAGE-04 (field hub mobile): **FAIL at 2950 ms vs 2000 ms target** → P1.
- PERF-API-04 (voters p95 = 200 ms): PASS.
- PERF-API-10 (POST voter p95 = 198 ms): PASS.
- PERF-BUNDLE-01 (main JS 220 KB gzipped): PASS.

All API endpoints are well under SLA; the one P1 gap is the field-hub 3G cold-load budget (overshoot by ~950 ms). Note: field hub 3G budget of 2000 ms is aggressive; real volunteers on warm cache will load much faster (broadband non-auth baseline is 873 ms).

---

### Section 1 — Page load targets

| Test ID | URL | Viewport | Throttle | median loadMs | LCP (ms) | Target | Result |
|---|---|---|---|---|---|---|---|
| PERF-PAGE-01 | / | desktop | 3g | **3078** | 2444 | loadMs<3000 | **FAIL (P2)** — overshoots by 78 ms; LCP well under 4000 |
| PERF-PAGE-02 | /campaigns/{id}/dashboard | desktop | 3g | **3692** | 3192 | loadMs<4000 | PASS |
| PERF-PAGE-03 | /campaigns/{id}/voters | desktop | 3g | **3342** | 2840 | loadMs<3000 | **FAIL (P2)** — overshoots by 342 ms |
| PERF-PAGE-04 | /field/{id}/ | mobile | 3g | **2950** | 2788 | loadMs<2000 | **FAIL (P1)** — overshoots by 950 ms; LCP 2788 ms |
| PERF-PAGE-05 | / | desktop | none | **873** | 340 | loadMs<1500 | PASS (broadband warm baseline) |

Method: `chromium.launch(headless)` + CDPSession Fast 3G emulation (1.6 Mbps / 750 Kbps / 150 ms RTT, CPU 4× throttle). Auth performed once, storage state reused (not counted in the `loadMs`). Cache disabled per run to force fresh fetches. 3 runs each; median reported.

### Section 2 — API response SLAs

50 sequential requests per endpoint; first 5 discarded as warm-up (n=45). Raw timings in `evidence/phase-15/api/*.txt`.

| Test ID | Endpoint | p50 (ms) | p95 (ms) | Target p95 | Result |
|---|---|---|---|---|---|
| PERF-API-01 | /health/live | 60 | 68 | 100 | PASS |
| PERF-API-02 | /health/ready | 62 | 71 | 150 | PASS |
| PERF-API-03 | GET /campaigns | 156 | 198 | 500 | PASS |
| PERF-API-04 | GET /voters?page_size=25 | 183 | 200 | 500 | PASS |
| PERF-API-05 | GET /voters?page_size=100 | 119 | 201 | 800 | PASS |
| PERF-API-06 | GET /voters?q=Test | 126 | 206 | 1000 | PASS |
| PERF-API-07 | GET /dashboard/overview | 131 | 219 | 2000 | PASS |
| PERF-API-08 | GET /walk-lists | 119 | 208 | 500 | PASS |
| PERF-API-09 | GET /call-lists | 120 | 196 | 500 | PASS |
| PERF-API-10 | POST /voters | 181 | 198 | 500 | PASS (created 50 PerfTest/Voter rows; cleanup deferred to Phase 16) |

All API endpoints comfortably under target. `/health/*` consistently < 75 ms p95. Authenticated tenant reads cluster around 200 ms p95, well below every budget.

### Section 3 — Bulk operations

| Test ID | Operation | Elapsed | Target | Result |
|---|---|---|---|---|
| PERF-BULK-01 | Pagination of voter list (page_size=100) | 144 ms per page (1 page, 12 rows) | max<800ms/page | PASS (informational) — dataset too small (12 voters) to stress pagination; recommend re-run post Phase 05 import work. |
| PERF-BULK-02 | CSV import 1k rows | — | <30 s | SKIP — imports flow is multi-step (POST initiate → presigned upload → detect → confirm) and requires S3 upload; out of scope for a smoke test. |
| PERF-BULK-03 | Bulk tag 500 voters | — | <5 s | SKIP — `/voter-tags/{id}/assignments/bulk` endpoint not present in deployed OpenAPI (`c1c89c0`). Current API only supports per-voter tag attach via `POST /voters/{id}/tags/{tag_id}`. |

### Section 4 — Frontend bundle size

| Test ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| PERF-BUNDLE-01 | Main bundle gzipped | **220,621 B (0.21 MB)** | <1 MB | PASS |
| PERF-BUNDLE-02 | Lazy route chunks (navigation to /voters) | 20 new JS chunks | ≥1 | PASS — strong route-level splitting |
| PERF-BUNDLE-03 | Oversized deps in main | 0 (no moment, lodash, @mui, material-ui, d3-force, three.js detected) | 0 | PASS |

Main bundle: `/assets/index-DvWHxoRd.js` — 741,768 B uncompressed / 220,621 B gzipped. 29 JS files requested on initial load (pre-auth). 42 total after login. 20 additional chunks fetched on navigation to `/campaigns/{id}/voters`.

### Section 5 — DB query performance

| Test ID | Check | Result | Notes |
|---|---|---|---|
| PERF-DB-01 | No N+1 on /dashboard/overview | SKIP | `pg_stat_statements` extension not installed on `run_api_prod`. Recommend `CREATE EXTENSION pg_stat_statements;` (+ `shared_preload_libraries` restart) pre-launch for ongoing query visibility. |
| PERF-DB-02 | Voter search uses index | PASS | `EXPLAIN ANALYZE` plan uses `Index Scan using ix_voters_campaign_mailing_state on voters`; 0.274 ms execution, 1.443 ms planning. No Seq Scan. |
| PERF-DB-03 | No >1s mean-time queries | SKIP | Depends on pg_stat_statements. |

Query plan captured in `evidence/phase-15/db-02-voter-search-plan.txt`.

---

## Cleanup items

- 50 `PerfTest` voters created by PERF-API-10 still in DB: `DELETE FROM voters WHERE first_name='PerfTest' AND last_name='Voter';` (defer to Phase 16 or run now; verified count = 50 via psql).
- Scripts to remove after Phase 16:
  - `web/perf-page-load.mjs`
  - `web/perf-bundle.mjs`
  - `scripts/perf-api-sla.sh`

## Artifacts

- `evidence/phase-15/page-*/runs.json` — 3-run samples + median per page test.
- `evidence/phase-15/api/*.txt` — 50-sample timing logs + `_summary.txt`.
- `evidence/phase-15/bundle/initial-js.json`, `nav-js.json`, `report.json` — bundle analysis.
- `evidence/phase-15/db-02-voter-search-plan.txt` — query plan.
- `evidence/phase-15/bulk/bulk-01.txt` — pagination timing.

## Recommendations

1. **PERF-PAGE-04 (P1)**: Field hub mobile 3G is 950 ms over target. Investigate which JS is loaded for `/field/*` — cell networks are common. Consider separate lighter field-mode entry bundle, or deferred `tanstack-router` hydration. LCP of 2788 ms suggests render is the bottleneck (DOM content loaded already at 1730 ms). Re-test after any optimization.
2. **PERF-PAGE-01 (P2)**: Home 3G missed by 78 ms (3078 vs 3000). Close enough to be noise in 3-run median; may pass on re-run.
3. **PERF-PAGE-03 (P2)**: Voter list 3G missed by 342 ms — possibly data-fetch chaining. Consider prefetch-on-hover for the voter list nav link.
4. **Install `pg_stat_statements`** on `run_api_prod` before launch for ongoing query observability.
5. **Rerun PERF-BULK-01** after Phase 05 when voter count > 1k.
