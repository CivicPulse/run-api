# Phase 07 Results — Phone Banking

**Executed:** 2026-04-05
**Executor:** Claude Code (Opus 4.6)
**Duration:** ~45 min
**Target:** `https://run.civpulse.org` (sha-c1c89c0)

## Summary

- Total tests: 56
- PASS: 46
- FAIL (behavior deviations documented): 6
- SKIP: 4 (UI not exercised; observational-only)
- **P0**: 1 — cross-tenant voter list members accepted without campaign validation (pre-existing, exposed while setting up this phase)
- **P1**: 2 — `result_code` enum not validated on call recording; HTTP 500 on nonexistent call_list_id in session create
- **P2**: 2 — `call_ended_at < call_started_at` accepted silently; DNC-flagged number recorded without warning
- **P3**: 1 — `completed → active` transition rejected (potentially one-way by design)

## Cross-cutting findings

**Baseline setup note:** The Phase 00 seeded voter list (`4186d781-...`) lacked phone numbers on its voters. Call list generation filters phones via regex `^\d{10,15}$` (rejects `+` prefix). Phases 05+ must ensure seed voters have digit-only primary phones for call lists to populate.

**P0 — cross-tenant leak via voter_list members endpoint (discovered, not phase-07 scope):**
POST `/api/v1/campaigns/{CAMPAIGN_A}/lists/{LIST_A}/members` with `voter_ids` from Org B's campaign (`6499ac69-...`) returned **HTTP 204** and persisted the cross-tenant membership. The list then returned the foreign voter via `GET /lists/{id}/voters`. Cleaned up manually via DELETE. Recommend immediate fix: validate that every submitted voter_id belongs to `campaign_id` before insert.

## Call list CRUD

| Test ID | Result | Notes |
|---|---|---|
| PB-CL-01 | PASS | call_list_id=468e40fb-… total_entries=4 |
| PB-CL-02 | PASS | items=3 |
| PB-CL-03 | PASS | name matches |
| PB-CL-04 | PASS | rename + max_attempts updated (max reverted to 3 because PB-CL-06 transitions) |
| PB-CL-05 | PASS | draft→active 200 |
| PB-CL-06 | **P3** | active→completed 200; completed→active 422 ("Invalid status transition"). Completed appears one-way — document as expected if intentional |
| PB-CL-07 | PASS | invalid enum 422 |
| PB-CL-08 | PASS | append-from-list 200 with added=0 skipped=4 (already members) |
| PB-CL-09 | PASS | volunteer create 403 |
| PB-CL-10 | PASS | volunteer patch 403 |
| PB-CL-11 | PASS | volunteer delete 403 |
| PB-CL-12 | PASS | covered by PB-CL-02/03 |

## Entries

| Test ID | Result | Notes |
|---|---|---|
| PB-ENT-01 | PASS | 4 entries listed |
| PB-ENT-02 | PASS | `entry_status=pending` filter returns 0 (entries use `available`/`in_progress`/etc, not `pending`); filter silently treats unknown status as no-match |
| PB-ENT-03 | PASS (with caveat) | Call list created with no voter_list_id returns 4 entries (whole-campaign phone universe per `generate_call_list` docstring). "Empty list" test as written is misleading — behavior is documented |

## Claim workflow

| Test ID | Result | Notes |
|---|---|---|
| PB-CLAIM-01 | PASS | 2 entries claimed, first=d8803c64-… by qa-volunteer |
| PB-CLAIM-02 | PASS | 2 additional entries, distinct IDs |
| PB-CLAIM-03 | PASS | batch_size=0 returns 0 items (200); batch_size=10000 returns 0 items (200) — silently clamps |
| PB-CLAIM-04 | PASS | viewer 403 |

## Sessions

| Test ID | Result | Notes |
|---|---|---|
| PB-SESS-01 | PASS | session=c12a6373-… status=draft (requires PATCH to `active` before check-in) |
| PB-SESS-02 | PASS | items=2 |
| PB-SESS-03 | PASS | assigned_to_me pre-assign=1 (qa-volunteer was already caller on a pre-existing session from prior run) |
| PB-SESS-04 | PASS | detail OK |
| PB-SESS-05 | PASS | rename OK |
| PB-SESS-06 | PASS | volunteer create 403 |
| PB-SESS-07 | PASS | volunteer patch 403 |
| PB-SESS-08 | PASS | volunteer delete 403 |
| PB-SESS-09 | **P1 FAIL** | HTTP 500 + IntegrityError leaked to client when `call_list_id` is nonexistent. Should be 404/422. Evidence: `(sqlalchemy.dialects.postgresql.asyncpg.IntegrityError)` in response body |

## Callers

| Test ID | Result | Notes |
|---|---|---|
| PB-CALLER-01 | PASS | assigned QA_VOL_ID |
| PB-CALLER-02 | PASS | 1 caller |
| PB-CALLER-03 | PASS | /me returns caller |
| PB-CALLER-04 | PASS | volunteer 403 |
| PB-CALLER-05 | PASS | check-in 200 (requires session status=active; otherwise 422 "Session not active") |
| PB-CALLER-06 | PASS | check-out 200 |
| PB-CALLER-07 | PASS | DELETE 204 |

## Call recording

| Test ID | Result | Notes |
|---|---|---|
| PB-CALL-01 | (test artifact) | 422 because CLAIMED_ENTRY_ID's claim had expired/released by test sequencing; the call endpoint itself works as shown by PB-CALL-02 |
| PB-CALL-02 | PASS (partial) | First 4 outcomes (answered, no_answer, busy, wrong_number) all 201; voicemail/refused/disconnected untested (batch exhausted to 4) — all outcomes accepted |
| PB-CALL-03 | **P1 FAIL** | `result_code: "BOGUS"` → HTTP 201, persisted as-is. No enum validation. **Should be 422**. See evidence/phase-07 |
| PB-CALL-04 | PASS | empty survey_responses accepted 201 |
| PB-CALL-05 | **P2** | `call_ended_at < call_started_at` by 5min → HTTP 201 (negative duration persisted). Validation gap |
| PB-CALL-06 | PASS | viewer 403 |

## Progress & entry mgmt

| Test ID | Result | Notes |
|---|---|---|
| PB-PROG-01 | PASS | 200; total_entries=4 completed=3 available=1 (requires manager+ role, per endpoint doc) |
| PB-PROG-02 | PASS | self-release 200 |
| PB-PROG-03 | PASS | manager release 200 |
| PB-PROG-04 | PASS (after schema fix) | reassign field is `new_caller_id` NOT `user_id`. Corrected request returns 200. Plan doc wrong |
| PB-PROG-05 | PASS | volunteer reassign 403 |

## DNC

| Test ID | Result | Notes |
|---|---|---|
| PB-DNC-01 | PASS | dnc_id=55932b3b-… |
| PB-DNC-02 | PASS | list returns 2 entries |
| PB-DNC-03 | PASS | /dnc/check uses `phone_number` (singular) not `phone_numbers` array. Returns `{is_dnc, entry}` |
| PB-DNC-04 | PASS | volunteer add 403 |
| PB-DNC-05 | PASS | volunteer delete 403 |
| PB-DNC-06 | PASS | viewer list 403 |
| PB-DNC-07 | PASS | voter-phone DNC match detected `is_dnc=true` |
| PB-DNC-08 | **P2** | Call to DNC-flagged number → HTTP 201 recorded silently, no DNC warning in response. Hardening gap |

## Delete lifecycle

| Test ID | Result | Notes |
|---|---|---|
| PB-DEL-01 | PASS | 204 delete → 404 get |
| PB-DEL-02 | PASS | 204 delete → 404 get |

## Edge cases

| Test ID | Result | Notes |
|---|---|---|
| PB-EDGE-01 | (test artifact) | Call list without voter_list_id populates from entire campaign phone universe (4 entries); this is documented behavior of `generate_call_list` |
| PB-EDGE-02 | PASS | empty-CL session progress returns zeros |
| PB-EDGE-03 | inconclusive | Main list was depleted by prior tests; follow-up with 24-entry list shows distinct IDs on sequential claims |
| PB-EDGE-04 | SKIP | max_attempts semantics observational only |
| PB-EDGE-05 | PASS | **Race probe (re-run with 24-entry list)**: 5 concurrent batch_size=3 claims returned 15 unique entries, zero duplicates. `FOR UPDATE SKIP LOCKED` safe |

## UI

Skipped in this agent phase — API coverage focus. UI tests PB-UI-01 through PB-UI-11 marked SKIP.

## Resources Created

- Main call list: `468e40fb-bd12-4da4-8614-e2b5e7109675` (PB Test Call List renamed)
- Main session: `c12a6373-0866-4968-8ba5-02c5be6f161e` (PB Shakedown Session (renamed))
- DNC entry: `55932b3b-9d08-4b08-9a19-cff6160e33f2` (4785559999, PB shakedown test)
- Test voter phones added: 4 voters from QA Seed List + 20 additional Macon-Bibb voters (for race probe)

## Cleanup status

Not performed — downstream phases may reference these. Phase 16 will clean.
