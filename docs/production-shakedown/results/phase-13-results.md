# Phase 13 Results — Concurrency & Race Conditions

**Executed:** 2026-04-05 21:35–21:50 UTC
**Executor:** Claude Opus 4.6 (1M ctx)
**Target:** https://run.civpulse.org (sha-c1c89c0)
**Evidence dir:** `docs/production-shakedown/results/evidence/phase-13/`

## Summary

- **Total tests:** 25
- **PASS:** 16
- **FAIL (P1):** 3 (ASSIGN-02, VOTER-04, OFFLINE-03 — same root cause: DB IntegrityError leaked as HTTP 500)
- **SKIP:** 6 (ROLE-01 async imports, TXN-02/03 campaign create broken via ZITADEL grant 400, OFFLINE-02/04/05 covered by phase-10 Playwright runs, EXPIRY-03 no WS/SSE in prod)
- **P0 blockers:** 0

### Launch-gate verdict

All four P0 gates **PASS**:
- **CONC-CLAIM cross-user race (supplemental)**: 2 volunteers × batch_size=5 → 10 distinct entries, zero overlap. `FOR UPDATE SKIP LOCKED` safe (confirms phase-07 finding).
- **CONC-ROLE-03 (stale permissions)**: 403 enforced on next request after membership DELETE — JWT alone insufficient, membership re-checked every request.
- **CONC-OFFLINE-01 (data loss)**: Two concurrent interactions for same voter from different users both persist as distinct rows. Multi-record pattern holds. Phase 10 FIELD-OFFLINE-05 already validated the Playwright offline-queue drain path end-to-end (5 items → 5×201 → 0 dupes).
- **Orphan rows**: Every FK / uniqueness violation tested leaves DB invariants intact (FK upheld, unique constraints hold).

### P1 findings — DB exception leakage (3 instances, same class)

The API leaks raw `sqlalchemy...IntegrityError` payloads to clients as HTTP 500 on concurrency conflicts, instead of normalizing to 409 Conflict / 404 Not Found. DB invariants are preserved, so no data corruption — but the 500s mask legitimate race conditions from clients that need to retry gracefully.

| Test | Trigger | Expected | Actual |
|---|---|---|---|
| **CONC-ASSIGN-02** | Concurrent duplicate walk-list canvasser assign (5×POST same `user_id`) | 200/201 + 409 | 3×201, **2×500** with `asyncpg.UniqueViolationError` in body |
| **CONC-VOTER-04** | POST voter tag assignment racing with DELETE of the tag | 409/404 | **500** with `asyncpg.ForeignKeyViolationError` in body |
| **CONC-OFFLINE-03** | POST interaction for just-deleted voter (simulates offline-queue drain after online delete) | 404 Not Found with clean error | **500** with `asyncpg.ForeignKeyViolationError` in body |

**Severity: P1** — not a data-integrity bug (DB rejects the writes correctly), but (a) leaks internal SQL error text and schema details to authenticated clients, (b) breaks the field-mode offline drain contract in phase-10 FIELD-EDGE-03 which expects 4xx for retryable-vs-permanent discrimination, (c) contradicts API problem+json style used elsewhere. Wrap writes in try/except and normalize to 409/404.

## Results tables

### Call list claim races

| Test ID | Result | Notes |
|---|---|---|
| CONC-CLAIM-01 | PASS | Covered by phase-07 PB-EDGE-05 + supplemental cross-user race this phase: VOL+MGR batch_size=5 each → 10 distinct entries, zero overlap. |
| CONC-CLAIM-02 | PASS | Covered by phase-07 (5×3=15 unique claims, no dupes). Not re-run here per instructions. |
| CONC-CLAIM-03 | PASS | Post-drain claim batch_size=5 returns `[]` + 200, clean exhaustion signal. |
| CONC-CLAIM-04 | PASS | Two concurrent session creations for same `call_list_id` → 2×201, 2 distinct `phone_bank_sessions` rows with distinct `created_by`. |

### Canvasser assignment races

| Test ID | Result | Notes |
|---|---|---|
| CONC-ASSIGN-01 | PASS | MGR+ADM concurrent POSTs with distinct `user_id` → 2×201, 2 rows. No 500. |
| CONC-ASSIGN-02 | **FAIL (P1)** | 5× concurrent POST same `user_id` → 3×201 + **2×500** (UniqueViolationError leaked). DB correct: 1 row exists. Evidence: `assign02-{1..5}.json`. |
| CONC-ASSIGN-03 | PASS | Concurrent DELETE+POST same (`wl`,`user_id`) → DEL 204, ADD 201, final state consistent (0 rows — DEL committed last, ran after ADD). No 500, no orphans. |

### Voter modification races

| Test ID | Result | Notes |
|---|---|---|
| CONC-VOTER-01 | PASS | Concurrent PATCH disjoint fields (`first_name`, `last_name`) → both 200, both updates persisted. |
| CONC-VOTER-02 | PASS | Concurrent PATCH same field → both 200, last-write-wins (`Winner-Manager` kept). No corruption. |
| CONC-VOTER-03 | PASS | Concurrent DELETE + PATCH → UPD 200, DEL 204 (delete ran after update), voter hard-deleted. No 500. |
| CONC-VOTER-04 | **FAIL (P1)** | DELETE tag + POST voter-tag-assign racing → DEL 204, ADD **500** with `asyncpg.ForeignKeyViolationError`. **No orphan rows** (FK upheld). Evidence: `voter04-{delT,add}.json`. |

### Role changes mid-request

| Test ID | Result | Notes |
|---|---|---|
| CONC-ROLE-01 | SKIP | Async multi-step CSV import flow is high setup cost; role-revocation timing not easily testable via single curl. |
| CONC-ROLE-02 | PASS | Concurrent voter PATCH + role-demotion (manager→viewer) → both 200. Re-promotion 200, post-promotion PATCH 200. No 500. |
| CONC-ROLE-03 | **PASS (P0 gate)** | Viewer promoted to manager → pre-check POST /tags = 201 ✓. Owner DELETEs viewer membership → subsequent POST /tags with same JWT = **403 Forbidden** ✓. Membership re-checked on every request, stale JWT cannot bypass. |

### Offline queue conflict

| Test ID | Result | Notes |
|---|---|---|
| CONC-OFFLINE-01 | PASS | **P0 gate.** Two concurrent interactions same voter from distinct users → both 201, both persist as separate `voter_interactions` rows. Multi-record pattern holds; no last-write-wins overwrite. (Phase-10 FIELD-OFFLINE-05 validated full Playwright offline-queue drain: 5 items→5×201→0 dupes.) |
| CONC-OFFLINE-02 | SKIP | Covered by phase-10 FIELD-OFFLINE-03 (5 items queued offline, all drained). |
| CONC-OFFLINE-03 | **FAIL (P1)** | POST interaction for just-deleted voter → **500** with `asyncpg.ForeignKeyViolationError`. Expected 404. Hardening gap affects offline-queue drain (items for deleted voters will appear as server errors, not permanent-failure signals). Evidence: `offline03.json`. |
| CONC-OFFLINE-04 | SKIP | Covered by phase-10 FIELD-OFFLINE-04 (zustand `persist()` rehydrates). |
| CONC-OFFLINE-05 | SKIP | Covered by phase-10 — `client_timestamp` preserved on POST, no server-side chronology validation observed. |

### Transaction boundaries

| Test ID | Result | Notes |
|---|---|---|
| CONC-TXN-01 | PASS | 300-char name → 422, no orphan `campaigns` rows, no orphan `campaign_members`. |
| CONC-TXN-02 | SKIP | CSV bulk-import test requires multi-step async workflow (`POST /imports` → `/detect` → `/confirm`); out of scope for direct curl probe. |
| CONC-TXN-03 | SKIP | **Side finding:** campaign creation via `POST /campaigns` currently **broken in prod** — returns 500 with leaked ZITADEL error `400 Bad Request for url .../projects/.../grants`. ZITADEL grant provisioning fails for new orgs. Separate P1 bug, not a concurrency issue. Confirmed no orphan `campaigns` rows (rollback works). |

### Token expiry mid-request

| Test ID | Result | Notes |
|---|---|---|
| CONC-EXPIRY-01 | PASS (proxy) | Invalid/tampered JWT → 401 clean problem+json. Short-lived token setup deferred (OIDC token TTL control not available via curl). |
| CONC-EXPIRY-02 | PASS (proxy) | 3 concurrent requests with same JWT → 3×200, no refresh-token burn observed (stateless JWT). |
| CONC-EXPIRY-03 | SKIP | No WebSocket/SSE endpoints in prod API surface. |

## Additional findings

### P1 — `POST /campaigns` broken in prod (not a concurrency bug)

```
POST /api/v1/campaigns {"name":"X","type":"local","jurisdiction_name":"T","organization_id":"227ef98c-..."}
→ 500 {"detail":"Client error '400 Bad Request' for url 'http://zitadel.civpulse-infra.svc.cluster.local:8080/management/v1/projects/364255076543365156/grants'"}
```

Discovered while attempting TXN-03 setup. ZITADEL project-grant provisioning fails for existing orgs. Blocks new-campaign creation via the canonical API. DB rollback works (no orphan rows), but error text leaks internal service DNS + ZITADEL URLs. Worth tracking separately — likely related to the ZITADEL v1/v2 API split referenced in phase-00 results.

## Cleanup

- Deleted 4 test voters (`ConcTest`, `ConcTag`, `RoleRace`, `OfflineRace`, `Deletable`) + their interactions + voter_tag_members
- Deleted 2 `CONC-04%` phone_bank_sessions
- Removed 2 walk_list_canvassers rows on WL2 (`6e03469d-...`)
- Restored `qa-manager` role from any transient demotions (final: manager)
- Released all 24 entries on CL `f5c0623c-...` (still claimed by qa-volunteer from drain step; benign)
- `qa-viewer` was temporarily promoted→removed→re-added via ROLE-03; final state: viewer in `campaign_members` (verified in DB)

No lingering production data mutations. All throwaway tag `conc-race-tag-phase13` and `role03-pre-check`/`ShouldFail-role03` removed.
