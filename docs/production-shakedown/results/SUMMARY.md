# Production Shakedown — Summary

**Shakedown run:** 2026-04-05 (20:00 – 21:55 UTC, ~2h wall clock with 5-agent parallelism)
**Target:** https://run.civpulse.org
**Commit at execution:** `sha-c1c89c0` (ghcr.io/civicpulse/run-api:sha-c1c89c0)
**Executor:** Claude Code (Opus 4.6) — 1 orchestrator + 6 sub-agents
**Verdict:** ❌ **NO-GO**

**Launch blocker:** 6 distinct cross-tenant isolation breaches in production API. The non-negotiable criterion "ZERO cross-tenant leaks" (README §Success criteria) is violated. See P0 section below.

---

## Per-phase results

| Phase | Name | Total | PASS | FAIL | SKIP | BLOCKED | P0 | P1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 00 | Environment Setup | 21 | 21 | 0 | 0 | 0 | 0 | 0 |
| 01 | Authentication & OIDC | 22 | 21 | 0 | 1 | 0 | 0 | 0 |
| 02 | Org Lifecycle | 31 | 21 | 2 | 8 | 0 | 0 | 0 |
| 03 | **Cross-Tenant Isolation** | 34 | 27 | **3** | 4 | 0 | **3** | 0 |
| 04 | Campaign Lifecycle | 53 | 34 | 8 | 11 | 0 | 0 | 1 |
| 05 | Voters | 92 | 71 | 2 | 11 | 8 | 0 | 2 |
| 06 | **Canvassing** | 64 | 34 | 5 | 15 | 10 | **1** | 1 |
| 07 | Phone Banking | 56 | 46 | 6 | 4 | 0 | 0 | 2 |
| 08 | Surveys | 38 | 36 | 2 | 0 | 0 | 0 | 0 |
| 09 | **Volunteers & Shifts** | 53 | 38 | 15 | 0 | 0 | **1** | 1 |
| 10 | **Field Mode** | 57 | 17 | 3 | 28 | 0 | **1** | 1 |
| 11 | RBAC Matrix | 31 | 31 | 0 | 0 | 0 | 0 | 0 |
| 12 | Security | 56 | 43 | 9 | 7 | 0 | 0 | 4 |
| 13 | Concurrency | 25 | 16 | 3 | 6 | 0 | 0 | 3 |
| 14 | Accessibility | 46 | 35 | 8 | 3 | 0 | 0 | 4 |
| 15 | Performance | 23 | 17 | 3 | 3 | 0 | 0 | 1 |
| 16 | Cleanup | — | — | — | — | — | — | — |
| **TOTAL** | | **702** | **508** | **69** | **101** | **18** | **6** | **20** |

Overall pass rate (excluding SKIP/BLOCKED): 508/583 = **87%**.
Pass rate among executable tests excluding P0-blocked: also ~87%.

---

## Critical-tests matrix (launch blockers)

| Criterion | Phase | Result | Detail |
|---|---|---|---|
| 6 health checks PASS | 00 | ✅ PASS | git_sha matches, DB connected, OIDC discovery ok |
| All auth flows PASS, no token leakage | 01 | ✅ PASS | All forged-token rejections hold (alg:none, wrong iss/aud, tampered sig, bogus kid) |
| **ZERO cross-tenant leaks** | 03 + 06 + 09 + 10 | ❌ **FAIL** | **6 distinct breaches** (see below) |
| No permission bypasses (RBAC) | 11 | ✅ PASS | 31/31 — viewer/volunteer/manager/admin/owner boundaries correct |
| No SQLi / XSS / forged-token success | 12 | ✅ PASS | 11/11 SQLi probes rejected, XSS stored-but-not-executed (React escape), auth bypass 401s hold |
| Offline queue drains reliably, no data loss | 10 | ✅ PASS | 5 door-knocks drained to 5× 201, 0 duplicates, retry cap honored |
| Role hierarchy enforced | 11 | ✅ PASS | Owner-only deletes, admin-only imports/invites, write-gates all correct |
| Mass-assignment blocked | 12 | ✅ PASS | body `campaign_id` override ignored; path wins |

---

## P0 failures (6) — all cross-tenant isolation, single root-cause family

**Pattern:** Write and read handlers accept resource UUIDs from path or body without validating the referenced row belongs to the request's `campaign_id` / `organization_id`. RLS protects the campaign-scoped session variable on some reads, but these endpoints either bypass that guard or don't join the FK to the path context.

| # | Test ID | Phase | Endpoint | Evidence |
|---|---|---|---|---|
| **P0-1** | ISO-BODYINJ-B02 | 03 | `POST /campaigns/{A}/lists/{A_list}/members` with `voter_ids=[Org_B_voter]` | `evidence/phase-03/P0-findings.md` |
| **P0-2** | ISO-BODYINJ-B04 | 03 | `POST /campaigns/{A}/call-lists` with `voter_list_id=<Org_B_list>` | `evidence/phase-03/P0-findings.md` |
| **P0-3** | ISO-REL-G03 | 03 | `POST /campaigns/{A}/voters/{Org_B_voter}/interactions` | `evidence/phase-03/P0-findings.md` |
| **P0-4** | **CANV-TURF-07** | 06 | `GET /campaigns/{A}/turfs/{turf_id}/voters` spatial join → leaked 121,328 cross-tenant voters (names + lat/lng) in one call; 2,415 voters from Kerry's legacy tenant returned to an Org A volunteer | `evidence/phase-06/CANV-TURF-07-P0-*` |
| **P0-5** | VOL-ISO-01 | 09 | `GET/PATCH /campaigns/{OWN}/volunteers/{FOREIGN_UUID}` (+status/hours/availability) — returns 200 AND persists mutations on foreign volunteers | `evidence/phase-09/` |
| **P0-6** | FIELD-XTENANT-01 | 10 | `GET /campaigns/{FOREIGN}/field/me` → 200 with `campaign_name` leak — missing `require_campaign_member()` gate | `evidence/phase-10/` |

**Severity: worst is P0-4** (bulk voter exposure). P0-1/2/3/5/6 each expose/mutate a single record at a time, but the pattern suggests every service module needs a ownership audit.

### Suggested remediation
1. **Quick fix (per-endpoint):** add `.where(Model.campaign_id == campaign_id)` to every service query that fetches by id; add an explicit 404 when the join is empty.
2. **Systemic fix:** enforce `FORCE ROW LEVEL SECURITY` on the tenant-scoped tables and ensure the API middleware sets `SET LOCAL app.current_campaign_id` on EVERY request (not just reads). The `BYPASSRLS` workaround from issue #21 is undermining this.
3. **Audit task:** grep every `.get(UUID)` / `.where(Model.id ==` in `app/services/` — if it's tenant-scoped and doesn't also filter by campaign_id/organization_id, it's likely P0.

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

**Do NOT launch.** Fix the 6 P0 cross-tenant breaches and the 4 security hardening P1s (stack trace leak, CSP, HSTS, HTTPS redirect) before any external user access. The P0s are a coherent class of bug with a systematic fix; an audit pass on every `app/services/*.py` module should find the remaining similar patterns before they become incidents.

**Remediation scope estimate** (not a time estimate, just component count):
- ~5-10 service-module ownership-check additions (for P0-1..3, P0-5)
- 1 service query rewrite in canvassing turf spatial join (P0-4)
- 1 `require_campaign_member()` dependency addition to field router (P0-6)
- 1 new FastAPI exception handler mapping IntegrityError → 409/404/422 (fixes most P1 stack-trace leaks)
- 1 ASGI middleware / reverse-proxy config for CSP + HSTS + X-Frame-Options + HTTP→HTTPS redirect
- 1 fix to `ensure_project_grant` idempotency (unblocks campaign creation)
- 1 `ImportService` method fix (unblocks CSV import)
- 8 a11y label/target-size additions (P1s)
- 1 field-hub 3G perf investigation (P1)

After fixes, re-run: phase 03 + phase 06 (turf voters) + phase 09 (volunteers) + phase 10 (field) + phase 12 (security) + affected RBAC cells in phase 11.

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

## Resources created during shakedown (for phase 16 cleanup)

- **Org B**: 1 ZITADEL org (`367294411744215109`), 5 test users, 1 DB org (`bf420f64-...`), 1 campaign (`1729cac1-...`), seed data
- **Org A sandbox**: 4 campaigns via SQL (CAMP Test Federal/State/Local/Ballot), 2 voters, 2 turfs, 2 walk lists
- **Perf test data**: 50 `PerfTest/Voter` rows
- **Phase 10 seed**: 12 walk-list entries, 10 call-list entries, 6 DOOR_KNOCK interactions
- **Tokens**: Org A role tokens at `.secrets/token-org-a-{owner,admin,manager,volunteer,viewer}.txt` (12h expiry; most already expired)
- **Tools authored**: `web/smoke-test-harness.mjs` (existing), `web/seed-org.mjs`, `web/isolation-check.mjs`, `web/a11y-*.mjs`, `web/perf-page-load.mjs`, `web/perf-bundle.mjs`, `scripts/perf-api-sla.sh`

Phase 16 (cleanup) was **not executed** pending user approval per plan guardrails.

---

## Next steps

1. **File P0 issues** — one GitHub issue per finding with full repro steps from evidence files; link this SUMMARY.md
2. **File P1 issues** — group the 7 stack-trace leaks as one issue (unified fix), security hardening as another
3. **Fix P0s, re-run phases 03/06/09/10** before any external launch
4. **Run phase 16 cleanup** when ready to tear down test state
5. **Update plan docs** — significant schema drift discovered; README.md Changelog should note the v0.1.0 adaptation

---

## Changelog

- **1.0** (2026-04-05): Initial shakedown run. Verdict: NO-GO on 6 cross-tenant P0s. 508/702 PASS.
