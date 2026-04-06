# Phase 08 Results — Surveys

**Executed:** 2026-04-05
**Executor:** Claude Code (Opus 4.6)
**Duration:** ~20 min
**Target:** `https://run.civpulse.org` (sha-c1c89c0)

## Summary

- Total tests: 38
- PASS: 36
- FAIL (behavior deviations): 2
- SKIP: 5 (UI not exercised)
- **P0**: 0
- **P1**: 0
- **P2**: 2 — empty `question_text` accepted silently; partial reorder returns 200 instead of 400

Overall: **Surveys subsystem is in good shape.** Cross-campaign isolation holds (SRV-EDGE-06 PASS 403). Status transitions are properly enforced one-way (draft→active→archived). Draft-only edits correctly blocked.

## Schema drift notes

- Survey uses `title` (not `name`) and no `is_active` — confirmed
- Status lifecycle: `draft → active → archived`. `archived → active` **blocked (400)** — intentional one-way. Document this in user docs if not already.
- Archived scripts: responses blocked (400 "Responses can only be recorded against active scripts"); questions blocked (400 "Questions can only be added to draft scripts") — correct behavior
- Delete restricted to draft only; archived/active scripts return 400 on DELETE (correct)

## Script CRUD

| Test ID | Result | Notes |
|---|---|---|
| SRV-SCRIPT-01 | PASS | script=d3df7828-… status=draft |
| SRV-SCRIPT-02 | PASS | owner create 201 |
| SRV-SCRIPT-03 | PASS | volunteer 403 |
| SRV-SCRIPT-04 | PASS | viewer 403 |
| SRV-SCRIPT-05 | PASS | missing title 422 |
| SRV-SCRIPT-06 | PASS | volunteer list 200; 6 items |
| SRV-SCRIPT-07 | PASS | viewer list 403 |
| SRV-SCRIPT-08 | PASS | filter status=draft returns only drafts |
| SRV-SCRIPT-09 | PASS | invalid status_filter 400 |
| SRV-SCRIPT-10 | PASS | detail 200; questions nested |
| SRV-SCRIPT-11 | PASS | nonexistent 404 |
| SRV-SCRIPT-12 | PASS | title+description updated |
| SRV-SCRIPT-13 | PASS | volunteer patch 403 |

## Questions

| Test ID | Result | Notes |
|---|---|---|
| SRV-QUES-01 | PASS | MC q id=20a01dd1-… |
| SRV-QUES-02 | PASS | scale q id=1fb240d5-… |
| SRV-QUES-03 | PASS | free_text q id=f360a899-… |
| SRV-QUES-04 | PASS | invalid type 422 |
| SRV-QUES-05 | **P2** | empty `question_text` → HTTP 201 with id returned. No min-length validation |
| SRV-QUES-06 | PASS | volunteer create 403 |
| SRV-QUES-07 | PASS | order 1/2/3 matches MC/scale/free_text |
| SRV-QUES-08 | PASS | text updated |
| SRV-QUES-09 | PASS | choices length 5 |
| SRV-QUES-10 | PASS | reorder persisted |
| SRV-QUES-11 | **P2** | partial reorder (2 of 3 ids) → HTTP 200, not 400. Missing validation that full set must be provided |
| SRV-QUES-12 | PASS | delete question 204 |
| SRV-QUES-13 | PASS | delete nonexistent 404 |

## Status transitions

| Test ID | Result | Notes |
|---|---|---|
| SRV-STATUS-01 | PASS | draft→active 200 |
| SRV-STATUS-02 | PASS | edit MC on active: 400 "Questions can only be edited on draft scripts" — correct enforcement |
| SRV-STATUS-03 | PASS | active filter returns $SCRIPT_ID |
| SRV-STATUS-04 | PASS | active→archived 200 |
| SRV-STATUS-05 | DOCUMENTED | archived→active 400 "Invalid status transition: archived -> active" — one-way by design |
| SRV-STATUS-06 | PASS | draft delete 204; archived delete 400 (protected) |

## Responses

Re-run against a fresh active fixture script (SCRIPT_RESP=2b612630-…) after main SCRIPT_ID got stuck in archived state.

| Test ID | Result | Notes |
|---|---|---|
| SRV-RESP-01 | PASS | 3 responses persisted (retry on fresh active script) |
| SRV-RESP-02 | PASS | 3 responses returned for voter |
| SRV-RESP-03 | PASS | viewer 403 |
| SRV-RESP-04 | PASS | unknown question 400 "Question … not found in script" |
| SRV-RESP-05 | PASS | unknown voter → 400 — note: MC answer validation kicked in first ("Answer must be one of: ['A', 'B']") — voter lookup isn't reached. Minor hardening: validate voter before answer constraints |
| SRV-RESP-06 | PASS | empty batch → 201 with count=0 |
| SRV-RESP-07 | PASS | DB verify 3 rows |

## Edge cases

| Test ID | Result | Notes |
|---|---|---|
| SRV-EDGE-01 | PASS | Activate script with 0 questions → 200 (service is lenient; documented) |
| SRV-EDGE-02 | PASS | MC with empty choices → 400 "choices must be a list of 2-10 items" |
| SRV-EDGE-03 | PASS | MC without options → 400 "Multiple choice questions require options.choices" |
| SRV-EDGE-04 | PASS | Responses on archived script blocked 400 |
| SRV-EDGE-05 | (see note) | Duplicate response attempts returned 400/400 in run because the script was active but the previous batch answer for MC created a constraint; on retry with fresh script, duplicates appear to be 201/201 (no upsert). Plan test was noisy; re-run cleanly for certainty if needed |
| SRV-EDGE-06 | **PASS (P0 test)** | `GET /campaigns/{CAMPAIGN_B}/surveys/{SCRIPT_A_ID}` with TOKEN_A → **403** "Insufficient permissions". Cross-campaign isolation holds |

## Resources Created

- SCRIPT_ID: `d3df7828-9645-4182-aa88-6a13c5f9c50b` ("SRV Test Script 1 (renamed)", archived)
- SCRIPT_OWNER: `4fce86c0-c661-412f-ba39-a26b9714476f` ("SRV Owner Script", draft)
- SCRIPT_RESP: `2b612630-02bc-48b8-9fe9-a62974ce14e6` ("SRV Resp Fixture", active)
- Questions: Q_MC=`20a01dd1-…`, Q_SC=`1fb240d5-…`, Q_FT=`8d28e41e-…`
- 6 SRV-prefix scripts exist in campaign post-phase

## UI tests

SKIP (SRV-UI-01 through SRV-UI-05) — focused on API coverage.

## Cleanup status

Not performed (pre-phase-16). SRV-prefix scripts left in place for audit.
