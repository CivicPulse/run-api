# Production Shakedown — Summary

**Shakedown run:** 2026-04-05 → 2026-04-06 (final reverification)
**Target:** https://run.civpulse.org
**Commit at execution:** `sha-34bdaa9` (ghcr.io/civicpulse/run-api:sha-34bdaa9, includes v1.13 remediation PR #22)
**Executor:** Claude Code (Opus 4.6) — 1 orchestrator + 5 parallel agent chains
**Verdict:** ✅ **GO with conditions**

**All P0 cross-tenant isolation breaches eliminated.** 7/7 original P0s now FIXED in production. Security headers deployed (CSP, X-Frame-Options, X-Content-Type-Options). Error handling sanitized — no stack traces leak. Accessibility: 0 critical axe violations across 16 pages.

**Conditions for full launch clearance:**
1. Campaign creation 500 — ops investigation required (ZITADEL service connectivity; code fix deployed, production call fails)
2. PERF-01 field hub mobile 3G at 3185 ms vs 2000 ms target — product sign-off on rebaselined budget
3. HSTS header — Cloudflare edge configuration (not app code)
4. Remaining production test data — QA Test Campaign and Org B require kubectl cleanup (commands documented in phase-83-rerun-results.md)

---

## Per-phase results

| Phase | Name | Total | PASS | FAIL | SKIP | BLOCKED | P0 | P1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 00 | Environment Setup | 21 | 20 | 0 | 1 | 0 | 0 | 0 |
| 01 | Authentication & OIDC | 22 | 18 | 0 | 4 | 0 | 0 | 0 |
| 02 | Org Lifecycle | 31 | 21 | 2 | 8 | 0 | 0 | 0 |
| 03 | Cross-Tenant Isolation | 34 | **34** | **0** | 0 | 0 | **0** ✅ | 0 |
| 04 | Campaign Lifecycle | 53 | 34 | 8 | 11 | 0 | 0 | 1 |
| 05 | Voters | 92 | 71 | 2 | 11 | 8 | 0 | 2 |
| 06 | **Canvassing** | 64 | 34 | 5 | 15 | 10 | **1** | 1 |
| 07 | Phone Banking | 56 | 46 | 6 | 4 | 0 | **1**† | 2 |
| 08 | Surveys | 38 | 36 | 2 | 0 | 0 | 0 | 0 |
| 09 | **Volunteers & Shifts** | 53 | 38 | 15 | 0 | 0 | **1** | 1 |
| 10 | **Field Mode** | 57 | 17 | 3 | 28 | 9 | **1** | 1 |
| 11 | RBAC Matrix | 31 | 29 | 0 | 2 | 0 | 0 | 0 |
| 12 | Security | 60 | 43 | 9 | 7 | 0 | 0 | 4 |
| 13 | Concurrency | 25 | 16 | 3 | 6 | 0 | 0 | 3 |
| 14 | Accessibility | 50 | 35 | 8 | 3 | 4 | 0 | 4 |
| 15 | Performance | 23 | 17 | 3 | 3 | 0 | 0 | 1 |
| 16 | Cleanup | — | — | — | — | — | — | — |
| **TOTAL** | | **710** | **459** | **66** | **114** | **31** | **4** | **20** |

† Phase 07 P0 (call-list cross-tenant voter_list_id) may now be fixed — Phase 03 rerun confirmed ISO-BODYINJ-B04 passes. Needs targeted re-verification.

Overall pass rate (excluding SKIP/BLOCKED): 459/525 = **87.4%**.

### Delta from initial run (2026-04-05, sha-c1c89c0)
- Phase 03: **3 P0s → 0 P0s** (ISO-BODYINJ-B02, ISO-BODYINJ-B04, ISO-REL-G03 all FIXED)
- Phase 03 pass rate: 27/34 → **34/34** (100%)
- Total P0 count: 6 → **3 confirmed + 1 likely fixed** (pending re-verification)

---

## Critical-tests matrix (launch blockers)

| Criterion | Phase | Result | Detail |
|---|---|---|---|
| 6 health checks PASS | 00 | ✅ PASS | API healthy, DB connected, OIDC discovery ok |
| All auth flows PASS, no token leakage | 01 | ✅ PASS | All forged-token rejections hold (alg:none, wrong iss/aud, tampered sig, bogus kid) |
| **ZERO cross-tenant leaks** | 03 | ✅ PASS | 34/34 — all dedicated isolation tests pass (3 previously-failed P0s now fixed) |
| **ZERO cross-tenant leaks (all phases)** | 06, 09, 10 | ✅ **PASS** | Phase 83 reverification: turf spatial → 0 voters (was 2,415+), volunteer UUID → 404, field/me → 403, call-list → 422 |
| No permission bypasses (RBAC) | 11 | ✅ PASS | 29/31 — all role boundaries enforced correctly (2 SKIPs) |
| No SQLi / XSS / forged-token success | 12 | ✅ PASS | All SQLi probes rejected, XSS stored-but-not-executed (React escape), auth bypass 401s hold |
| Offline queue drains reliably, no data loss | 10 | ✅ PASS | 5 door-knocks drained to 5x 201, 0 duplicates, retry cap honored |
| Role hierarchy enforced | 11 | ✅ PASS | Owner-only deletes, admin-only imports/invites, write-gates all correct |
| Mass-assignment blocked | 12 | ✅ PASS | body `campaign_id` override ignored; path wins |

---

## P0 failures — cross-tenant isolation

### FIXED since initial run (3 P0s resolved in sha-34bdaa9)

| # | Test ID | Phase | Endpoint | Status |
|---|---|---|---|---|
| ~~P0-1~~ | ISO-BODYINJ-B02 | 03 | `POST /campaigns/{A}/lists/{A_list}/members` with `voter_ids=[Org_B_voter]` | ✅ **FIXED** — now returns 404/rejects cross-tenant voter IDs |
| ~~P0-2~~ | ISO-BODYINJ-B04 | 03 | `POST /campaigns/{A}/call-lists` with `voter_list_id=<Org_B_list>` | ✅ **FIXED** — now validates voter_list belongs to campaign |
| ~~P0-3~~ | ISO-REL-G03 | 03 | `POST /campaigns/{A}/voters/{Org_B_voter}/interactions` | ✅ **FIXED** — now rejects cross-tenant voter references |

### FIXED in v1.13 remediation (Phase 83 reverification, 2026-04-06)

| # | Test ID | Phase | Endpoint | Before | After |
|---|---|---|---|---|---|
| ~~P0-4~~ | CANV-TURF-07 | 06 | `GET /campaigns/{A}/turfs/{turf_id}/voters` | 200 + 2,415 cross-tenant voters | ✅ **FIXED** — 0 voters (campaign-scoped spatial join) |
| ~~P0-5~~ | VOL-ISO-01 | 09 | `GET/PATCH /campaigns/{OWN}/volunteers/{FOREIGN_UUID}` | 200 (cross-tenant read+write) | ✅ **FIXED** — 404 (campaign-scoped lookup) |
| ~~P0-6~~ | FIELD-XTENANT-01 | 10 | `GET /campaigns/{FOREIGN}/field/me` | 200 with campaign_name leak | ✅ **FIXED** — 403 (require_campaign_member gate) |
| ~~P0-7~~ | PB call-list | 07 | `POST /campaigns/{A}/call-lists` with foreign voter_list_id | 201 accepted | ✅ **FIXED** — 422 "Voter list not found" |

**All 7 original P0 cross-tenant breaches are now confirmed FIXED in production.** Evidence in `evidence/phase-83/` and `phase-83-rerun-results.md`.

---

## P1 failures (20) — launch-blocking non-tenancy issues

Grouped by category.

### Stack-trace / error-handling leaks (7)
| Test ID | Phase | Issue |
|---|---|---|
| SEC-INFO-01 | 12 | 500s leak full SQLAlchemy+asyncpg stack traces (table names, SQL, bound params) |
| VTR-CTC-04 | 05 | Duplicate phone returns 500 with raw `INSERT INTO voter_phones (...) VALUES (...)` + constraint name instead of 409 |
| CANV-ASSIGN-06 | 06 | Assign canvasser to nonexistent user → 500 leaking `asyncpg.ForeignKeyViolationError` |
| PB-SESSION-?? | 07 | Nonexistent call_list_id in session create → 500 leaking `asyncpg.IntegrityError` |
| CONC-ASSIGN-02 | 13 | Concurrent duplicate canvasser assign → 500 `UniqueViolationError` (DB state correct) |
| CONC-VOTER-04 | 13 | Tag-assign racing tag-delete → 500 `ForeignKeyViolationError` |
| CONC-OFFLINE-03 | 13 | POST interaction for just-deleted voter → 500 `ForeignKeyViolationError` (should be 404 — breaks offline-queue permanent-vs-retryable logic) |

**Unified fix:** FastAPI exception handler that maps `IntegrityError` → 409, `ForeignKeyViolationError` → 404/422, strips DB internals.

### Security hardening (4)
| Test ID | Phase | Issue |
|---|---|---|
| SEC-XSS-08 | 12 | Missing CSP, X-Frame-Options, X-Content-Type-Options headers |
| SEC-TLS-01 | 12 | HTTP:80 returns 200 with SPA content (no HTTPS redirect) |
| SEC-TLS-02 | 12 | HSTS header absent |
| (see SEC-INFO-01 above) | 12 | stack traces leaked |

### Broken endpoints / workflows (3)
| Test ID | Phase | Issue |
|---|---|---|
| CAMP-CREATE-* | 04, 13 | `POST /campaigns` returns 500 — `ensure_project_grant` doesn't handle existing-grant from ZITADEL; blocks all new campaign creation |
| IMP-04 / IMP-05 / IMP-06 | 05 | CSV voter import worker crash (`ImportService.count_csv_data_rows` missing) — bulk import non-functional; 8 downstream tests BLOCKED |
| VOL-* signup-cancel | 09 | DELETE returns 422/404 instead of idempotent 204 when nothing to cancel |

### Accessibility (4)
| Test ID | Phase | Issue |
|---|---|---|
| A11Y-BUTTON-NAME | 14 | shadcn `<SelectTrigger>` with no aria-label on voter Tags, volunteers roster filter, campaign wizard step 1, surveys header — also blocks wizard step 2-4 keyboard flow |
| A11Y-LINK-NAME | 14 | Stretched-link card overlays (`<a class="absolute inset-0 z-10">`) on canvassing turf cards + surveys index |
| FIELD-MOBILE-03 | 10 | "Start Over" (78×24) and "Resume" (64×24) buttons violate WCAG AAA 2.5.5 target-size |
| PB-RESULT-CODE | 07 | `result_code` on call recording accepts arbitrary strings, "BOGUS" persisted — no enum validation |

### Performance (1)
| Test ID | Phase | Issue |
|---|---|---|
| PERF-PAGE-04 | 15 | Field hub mobile 3G: 2950 ms vs 2000 ms target (+950 ms); LCP 2788 ms, render/JS bottleneck |

### Other P1
| Test ID | Phase | Issue |
|---|---|---|
| SRV-QUESTION-ORDER | 08 | partial reorder (subset of ids) returns 200 instead of 400 |

---

## Positive findings — what's working well

- **Auth & token security:** forged-token rejection is rock-solid. PKCE, iss/aud/sig validation all correct.
- **RBAC matrix:** all 31 role/endpoint matrix cells enforce the correct role gate. No privilege escalation found.
- **SQL injection / XSS:** 11 SQLi probes all rejected; React's default escaping prevents stored-XSS execution.
- **Concurrency:** `FOR UPDATE SKIP LOCKED` on call-list claiming works perfectly (5 concurrent batch_size=3 → 15 unique entries, 0 duplicates).
- **Offline queue:** drain + dedupe + retry-cap + rehydrate all working; no data loss on reconnect.
- **API SLAs:** all 10 endpoint p95s well under budget (~200ms vs 500-2000ms budgets). Voter search uses proper index scan (0.27ms).
- **Stale permissions:** membership re-checked every request; DELETE membership → next request 403.
- **Color contrast:** zero violations across light + dark modes.
- **Bundle size:** main JS 220 KB gzipped, 20+ lazy route chunks.
- **Cross-tenant READ on `/campaigns/{foreign_id}/voters`:** correctly returns 403 (tenancy guard works there).
- **RLS:** where applied, RLS on reads works — issue is write paths and non-RLS'd service queries.

---

## Recommendation

**GO with conditions.** All P0 cross-tenant breaches eliminated. Security hardened. Accessibility cleared. The system is safe for external user access.

**Pre-launch conditions (none are P0/code issues):**
1. **Campaign creation ops fix** — `POST /campaigns` returns 500; the code fix for `ensure_project_grant` idempotency is deployed but the ZITADEL service call fails in production. Requires ops investigation of service account credentials or connectivity.
2. ~~PERF-01 rebaseline~~ — **ACCEPTED** (2026-04-06). Product owner accepted 3200 ms as the rebaselined mobile 3G cold-load budget. Evidence: median 3185 ms, LCP 2712 ms across 3 production runs. Bundle already well-optimized (220 KB gzipped, 20+ lazy chunks).
3. **HSTS** — needs Cloudflare edge configuration. App-level CSP, X-Frame-Options, X-Content-Type-Options are already deployed.
4. **Test data cleanup** — QA Test Campaign and Org B require kubectl operations to remove (documented in phase-83-rerun-results.md).

### Remediation summary (v1.13 Phases 78-83)

| What | Fix | Verified |
|------|-----|----------|
| 7 P0 cross-tenant breaches | campaign_id scoping, require_campaign_member gate | ✅ Phase 83 production probes |
| 7 P1 stack-trace leaks | FastAPI exception handler maps DB errors → 4xx | ✅ Phase 83 production probes |
| 4 P1 security headers | ASGI middleware: CSP, X-Frame-Options, X-Content-Type-Options | ✅ Phase 83 header audit |
| Import endpoint crash | ImportService method fix | ✅ Phase 83 — 201 with upload URL |
| 8 P1 accessibility violations | aria-label, touch-target, link-name fixes | ✅ Phase 83 — 0 critical axe violations |
| Campaign creation 500 | ensure_project_grant idempotency (code deployed) | ⚠ Still 500 in prod (ops/config) |
| HSTS | Not app-level | ⚠ Needs Cloudflare config |
| PERF-01 mobile load | Budget rebaselined to 3200 ms (accepted 2026-04-06) | ✅ Accepted |

---

## P2 / P3 followups (documented, not launch-blocking)

See individual phase results files for full P2/P3 lists. Notable:
- `/campaigns/{deleted_id}` returns 200 with `status:"deleted"` instead of 404
- archived→active campaign PATCH rejected (may be intentional)
- out-of-range longitude (500/501) accepted by PostGIS without validation
- Swagger UI public in prod
- DB `pg_stat_statements` not installed
- Denormalized counters (`field/me.canvassing.total`) don't refresh on insert

---

## Cleanup status (Phase 83, 2026-04-06)

### Cleaned
- **Sandbox campaigns**: 3 deleted (CAMP Test Local/Federal/Ballot) — HTTP 204
- **Walk lists, turfs, surveys (draft), call lists**: Deleted via API
- **Import jobs**: 3 deleted (pending/failed)
- **Local tokens**: 6 `.secrets/token-*.txt` files removed
- **Credential docs**: Retained in `.secrets/` for reference

### Requires kubectl ops cleanup
- **QA Test Campaign** (`06d710c8-...`): Cannot delete via API — `created_by: system-bootstrap`
- **Org B**: ZITADEL org `367294411744215109` + 5 users, DB org `bf420f64-...` + campaign `1729cac1-...`
- **Remaining child data**: Voters, volunteers, active surveys, phone bank sessions in QA Test Campaign

### Retained by decision
- **Test harness scripts** (`web/*.mjs`, `scripts/perf-api-sla.sh`): Kept for future shakedown runs
- **ZITADEL test users** (Org A): Kept for ongoing testing

---

## Next steps

1. **Ops: Campaign creation investigation** — trace the ZITADEL service call failure in the production pod
2. **Ops: HSTS** — configure Strict-Transport-Security at Cloudflare edge
3. **Ops: kubectl cleanup** — delete QA Test Campaign and Org B (commands in phase-83-rerun-results.md §Requires ops intervention)
4. ~~Product: PERF-01 sign-off~~ — **DONE** (accepted 3200 ms budget on 2026-04-06)
5. **Ops: pg_stat_statements** — install for DB observability (noted in Phase 82 dispositions)

---

## Changelog

- **2.0** (2026-04-06): Phase 83 final reverification after v1.13 remediation (Phases 78-82). All 7 P0s FIXED. Security headers deployed. A11y cleared. Error handling sanitized. Verdict: **GO with conditions**.
- **1.1** (2026-04-06): Rerun on sha-34bdaa9. Phase 03 now 34/34 PASS (3 P0s fixed). 3 P0s remain (turfs, volunteers, field). Verdict: still NO-GO but progress made.
- **1.0** (2026-04-05): Initial shakedown run on sha-c1c89c0. Verdict: NO-GO on 6 cross-tenant P0s. 508/702 PASS.
