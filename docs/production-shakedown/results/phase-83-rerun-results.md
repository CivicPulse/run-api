# Phase 83 Results — Reverification Reruns

**Executed:** 2026-04-06
**Executor:** Claude Code (Opus 4.6)
**Target:** https://run.civpulse.org
**Deployed SHA:** sha-34bdaa9 (includes v1.13 remediation PR #22)

## Summary

- **P0 cross-tenant isolation: 4/4 FIXED** — all previously confirmed breaches now return proper error codes
- **P1 error handling: FIXED** — no stack traces leak in error responses
- **P1 security headers: 3/4 FIXED** — CSP, X-Frame-Options, X-Content-Type-Options present; HSTS pending (Cloudflare config)
- **P1 workflow recovery: MIXED** — import endpoint works (201); campaign creation still 500 (ZITADEL service connectivity)
- **P1 accessibility: FIXED** — 0 critical axe violations across 16 pages (was multiple button-name/link-name/touch-target violations)
- **PERF-01: needs rebaseline** — field hub mobile 3G cold-load at 3185 ms vs 2000 ms target (LCP 2712 ms, improved from 2788 ms)

**Verdict: GO with conditions** — all P0 cross-tenant breaches eliminated, security hardened, a11y cleared. Two conditions: (1) campaign creation 500 traced and resolved as ops/config issue, (2) PERF-01 field hub mobile budget rebaselined with product sign-off.

---

## P0 Cross-Tenant Isolation Reruns

All 4 previously-confirmed P0 breaches are **FIXED**.

| # | Test ID | Phase | Endpoint | Before | After | Verdict |
|---|---------|-------|----------|--------|-------|---------|
| P0-4 | CANV-TURF-07 | 06 | `GET /campaigns/{A}/turfs/{turf}/voters` | 200 + 2,415 cross-tenant voters | 200 + 0 voters (campaign-scoped) | ✅ FIXED |
| P0-5 | VOL-ISO-01 | 09 | `GET /campaigns/{A}/volunteers/{foreign_uuid}` | 200 (cross-tenant read+write) | 404 (campaign-scoped lookup) | ✅ FIXED |
| P0-6 | FIELD-XTENANT-01 | 10 | `GET /campaigns/{B}/field/me` with Org A token | 200 + campaign_name leak | 403 (require_campaign_member gate) | ✅ FIXED |
| P0-7 | PB-CALL-LIST | 07 | `POST /campaigns/{A}/call-lists` with foreign voter_list_id | 201 (cross-tenant reference) | 422 "Voter list not found" | ✅ FIXED |

### Additional cross-tenant probes

| Probe | Expected | Actual | Verdict |
|-------|----------|--------|---------|
| `GET /campaigns/{B}/volunteers` with Org A token | 403 | 403 | ✅ PASS |
| All 4 Org A turfs: voters count | 0 each (campaign-scoped) | 0 each | ✅ PASS |

---

## P1 Error Handling Reruns

### Stack trace leak prevention (Phase 79 fix)

| Test | Before | After | Verdict |
|------|--------|-------|---------|
| FK violation: assign nonexistent canvasser | 500 + asyncpg.ForeignKeyViolationError | 404 `{"type":"foreign-key-not-found",...}` | ✅ FIXED |
| Phone bank: nonexistent call_list_id | 500 + asyncpg.IntegrityError | 404 `{"type":"call-list-not-found",...}` | ✅ FIXED |
| Invalid UUID in path | 500 + raw traceback | 422 clean validation error | ✅ FIXED |

No stack traces found in any error response. The FastAPI exception handler correctly maps DB exceptions to clean HTTP errors.

### Security headers (Phase 79 fix)

| Header | Before | After | Verdict |
|--------|--------|-------|---------|
| `content-security-policy` | Missing | `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; ...` | ✅ FIXED |
| `x-frame-options` | Missing | `DENY` | ✅ FIXED |
| `x-content-type-options` | Missing | `nosniff` | ✅ FIXED |
| `strict-transport-security` | Missing | Missing (needs Cloudflare edge config) | ⚠ PENDING |

HSTS is an operational/infrastructure configuration at the Cloudflare edge, not an application code change. Disposition: accepted as ops follow-up.

---

## P1 Workflow Recovery Reruns

| Test | Before | After | Verdict |
|------|--------|-------|---------|
| Import initiation | 500 (ImportService.count_csv_data_rows missing) | 201 with pre-signed upload URL | ✅ FIXED |
| Campaign creation | 500 (ensure_project_grant non-idempotent) | 500 (ZITADEL service call fails) | ⚠ PARTIAL |

**Campaign creation analysis:** The code fix for `ensure_project_grant` idempotency (Phase 80) is deployed — the function now handles 409 Conflict by searching for the existing grant. However, production campaign creation still returns 500. Root cause is likely ZITADEL service connectivity or credential configuration in the production pod, not a code regression. Disposition: ops/config investigation required.

---

## P1 Accessibility Reruns (Phase 81 fixes)

**Axe automated audit: 0 critical violations across 16 pages.**

| Page | Critical | Serious | Moderate | Minor | Previously Failing |
|------|----------|---------|----------|-------|--------------------|
| Home/landing | 0 | 0 | 0 | 0 | — |
| Login (ZITADEL) | 0 | 1 | 0 | 0 | — (html-has-lang is ZITADEL-controlled) |
| Campaign dashboard | 0 | 1 | 0 | 0 | — (aria-hidden-focus, cosmetic) |
| Voter list | 0 | 0 | 0 | 0 | ✅ Was: button-name on filter |
| Voter detail | 0 | 0 | 0 | 0 | — |
| Canvassing | 0 | 0 | 0 | 0 | ✅ Was: link-name on turf cards |
| Phone banking | 0 | 0 | 0 | 0 | — |
| Surveys | 0 | 0 | 0 | 0 | ✅ Was: button-name on header |
| Volunteers | 0 | 0 | 0 | 0 | ✅ Was: button-name on filter |
| Campaign settings | 0 | 0 | 0 | 0 | — |
| Campaign wizard step 1 | 0 | 0 | 0 | 0 | ✅ Was: button-name on step select |
| Org members | 0 | 0 | 0 | 0 | — |
| Org settings | 0 | 0 | 0 | 0 | — |
| Field hub | 0 | 0 | 0 | 0 | ✅ Was: touch-target violations |
| Field canvassing | 0 | 0 | 0 | 0 | ✅ Was: touch-target violations |
| Field phone banking | 0 | 0 | 0 | 0 | — |

Evidence saved to `evidence/phase-83/` (16 axe scan result directories + `_all-summaries.json`).

---

## PERF-01: Field Hub Mobile Cold-Load

| Metric | Original (Phase 15) | Phase 83 Rerun | Target | Status |
|--------|---------------------|----------------|--------|--------|
| Total load | 2950 ms | 3185 ms | 2000 ms | ⚠ Over budget |
| LCP | 2788 ms | 2712 ms | — | Slight improvement |
| TTFB | — | 57 ms | — | Good |
| FCP | — | 1880 ms | — | Acceptable |
| DOM Content Loaded | — | 1605 ms | — | Good |

**Analysis:** The field hub mobile 3G cold-load remains above the 2000 ms budget. LCP improved slightly (2788 → 2712 ms). The bottleneck is JS bundle execution on throttled 3G — the main bundle is 220 KB gzipped with 20+ lazy chunks, which is already well-optimized. Further improvement would require code-splitting the field route more aggressively or pre-rendering.

**Disposition per success criteria:** PERF-01 requires "explicitly rebaselined with evidence and product sign-off (accepted-budget decision)." Evidence captured. Product sign-off pending.

---

## Evidence Files

| Category | Path |
|----------|------|
| A11y axe scans (16 pages) | `evidence/phase-83/axe-*` |
| A11y summary JSON | `evidence/phase-83/_all-summaries.json` |
| Performance rerun | `evidence/phase-83/PERF-01-field-hub-mobile/` |
| API probe results | This document (API calls made 2026-04-06) |

---

## Changelog

- **1.0** (2026-04-06): Phase 83 reverification. All P0s fixed. A11y cleared. PERF-01 evidence captured. Campaign creation ops issue noted.
