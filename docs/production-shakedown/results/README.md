# Production Shakedown — Results Directory

This directory holds the recorded output of every phase in the production shakedown test plan. Each phase file in `docs/production-shakedown/phase-NN-*.md` ends with a **Results Template** section; this directory is where those templates get filled in with real values and committed.

Read this file before executing phases — it defines the conventions every agent must follow so the final `SUMMARY.md` can be aggregated mechanically.

---

## Directory layout

```
results/
├── README.md                   # this file
├── SUMMARY.md                  # cross-phase roll-up (generated in phase 16)
├── phase-00-results.md         # one per phase
├── phase-01-results.md
├── ...
├── phase-16-results.md
└── evidence/
    ├── phase-00/
    │   ├── ENV-HEALTH-01-live-response.json
    │   ├── ENV-PROV-03-users-created.json
    │   └── ...
    ├── phase-03/
    │   ├── ISO-XTENANT-15-voter-leak.png
    │   └── ...
    └── phase-NN/
```

---

## Creating `phase-NN-results.md`

1. Open the matching phase file (e.g., `../phase-02-org-lifecycle.md`).
2. Copy the **Results Template** section at the bottom into a new file `results/phase-NN-results.md`.
3. Execute the phase, filling in the `Result` and `Notes` columns as you go.
4. At the end, tally the Summary block (PASS / FAIL / SKIP / BLOCKED counts).
5. Commit the file with the phase's git history.

Each results file is self-contained — it records the exact state observed during that phase's execution and is never rewritten by later phases.

---

## Result values

Use one of these four values in the `Result` column:

| Value | Meaning |
|---|---|
| `PASS` | Test executed fully and matched all expected outcomes |
| `FAIL` | Test executed but one or more expected outcomes did not match |
| `SKIP` | Test intentionally not run (state reason in Notes) |
| `BLOCKED` | Test could not execute due to a prior failure (link to blocking test ID) |

---

## Severity labels (FAIL only)

Every `FAIL` must carry a severity label in the Notes column:

| Severity | Meaning | Launch impact |
|---|---|---|
| **P0** | Critical — security breach, data loss, complete feature breakage | Blocks launch |
| **P1** | High — significant feature broken, workaround may exist | Blocks launch |
| **P2** | Medium — minor feature issue, degraded UX but functional | Does not block |
| **P3** | Low — cosmetic, no functional impact | Does not block |

Reference: see `README.md § "Severity levels"` in the plan root for the canonical definitions.

---

## Recording evidence

When a test fails or produces output worth preserving, save artifacts under `evidence/phase-NN/` using this naming convention:

```
${TEST_ID}-${short-description}.${ext}
```

| Artifact | Extension | Example |
|---|---|---|
| Screenshot | `.png` | `ISO-XTENANT-15-voter-leak.png` |
| Response body | `.json` | `ENV-HEALTH-02-ready-response.json` |
| Log excerpt | `.txt` | `SEC-INJECT-07-server-log.txt` |
| Playwright trace | `.zip` | `FIELD-OFFLINE-03-trace.zip` |
| HAR file | `.har` | `PERF-API-04-network.har` |

Reference evidence paths from the Notes column of the results table, relative to the repo root:

```
| SEC-INJECT-07 | FAIL | P0 — server returned 500 instead of 400. Log: results/evidence/phase-12/SEC-INJECT-07-server-log.txt |
```

---

## Example: `phase-NN-results.md` stub

```markdown
# Phase 02 — Results

**Executed:** 2026-04-06 by Agent A (Claude Code)
**Duration:** 32 min
**Commit at execution:** sha-c1c89c0

## Org creation

| Test ID | Result | Notes |
|---|---|---|
| ORG-CREATE-01 | PASS | Created "Ephemeral Org A2" in 1.4s |
| ORG-CREATE-02 | FAIL | P1 — 500 on duplicate name. See evidence/phase-02/ORG-CREATE-02-response.json. Issue #42 |
| ORG-CREATE-03 | PASS | |
| ORG-CREATE-04 | SKIP | Requires ORG-CREATE-02 to pass first |

## Org switching

| Test ID | Result | Notes |
|---|---|---|
| ORG-SWITCH-01 | PASS | Switch propagated to campaign list |
| ORG-SWITCH-02 | BLOCKED | Blocked by ORG-CREATE-02 |

## Summary

- Total tests: 12
- PASS: 9 / 12
- FAIL: 1 / 12
- SKIP: 1 / 12
- BLOCKED: 1 / 12
- P0 count: 0
- P1 count: 1 (ORG-CREATE-02)
```

---

## Filing issues for FAIL tests

Every `FAIL` at P0 or P1 severity should have a GitHub issue opened against `CivicPulse/run-api`. Link the issue URL in the Notes column.

### Issue template

```markdown
Title: [shakedown] ${TEST_ID} — ${short description}

**Phase:** NN-${phase name}
**Test ID:** ${TEST_ID}
**Severity:** P0 / P1
**Executed:** YYYY-MM-DD
**Commit at execution:** sha-XXXXXXX

### Expected
(copy from phase file)

### Actual
(what happened)

### Reproduction
(copy/adapt the Steps block from the phase file)

### Evidence
- docs/production-shakedown/results/evidence/phase-NN/${TEST_ID}-*.{png,json,txt}

### Impact
(launch-blocking reasoning)
```

---

## Generating `SUMMARY.md` (phase 16)

After all phases complete, produce `results/SUMMARY.md` as the stakeholder-facing verdict document.

### SUMMARY.md template stub

```markdown
# Production Shakedown — Summary

**Shakedown run:** YYYY-MM-DD → YYYY-MM-DD
**Target:** https://run.civpulse.org
**Commit at execution:** sha-XXXXXXX
**Verdict:** GO / NO-GO

## Per-phase results

| Phase | Name | Total | PASS | FAIL | SKIP | BLOCKED | Pass % |
|---|---|---|---|---|---|---|---|
| 00 | Environment Setup | 21 | 21 | 0 | 0 | 0 | 100% |
| 01 | Authentication | … | … | … | … | … | … |
| … | | | | | | | |
| 16 | Cleanup | 18 | 18 | 0 | 0 | 0 | 100% |
| **Total** | | **NNN** | **NNN** | **NN** | **NN** | **NN** | **NN%** |

## Critical-tests matrix (launch blockers)

| Criterion | Phase | Result | Detail |
|---|---|---|---|
| 6 health checks PASS | 00 | PASS | |
| All auth flows PASS | 01 | PASS | |
| ZERO cross-tenant leaks | 03 | PASS | |
| No permission bypasses | 11 | PASS | |
| No SQLi/XSS/forged-token | 12 | PASS | |
| Offline queue drains | 10 | PASS | |

## P0 failures

(none, or list with issue links)

## P1 failures

| Test ID | Phase | Issue | Status |
|---|---|---|---|
| ORG-CREATE-02 | 02 | #42 | open |

## Launch decision

GO — all non-negotiable criteria met, 0 open P0 issues, N open P1 issues accepted with workarounds documented.

OR

NO-GO — {criteria name} failed. See {issue link}. Re-run phase {NN} after fix.
```

---

## Next steps after cleanup

Once phase 16 completes and `SUMMARY.md` is written:

1. **Commit the full results tree** to the repo:
   ```bash
   git add docs/production-shakedown/results/
   git commit -m "docs(shakedown): record production shakedown results YYYY-MM-DD"
   ```
2. **Archive the evidence directory** if it exceeds 10 MB — move to external storage and leave a pointer file behind.
3. **Close all FAIL-linked issues** that were fixed during the shakedown window.
4. **Sign off on launch** in the PROJECT.md or release notes, referencing the SUMMARY.md verdict.
5. **Preserve the run** — tag the commit (`shakedown-YYYY-MM-DD`) so the results are retrievable.
6. **Update the plan** if tests proved unreliable or missed coverage — edit the relevant `phase-NN-*.md` and bump the Changelog in `README.md`.

---

## Cross-references

- `../README.md` — plan overview, configuration, execution guidance
- `../phase-00-environment-setup.md` — first phase to execute, produces Org B IDs
- `../phase-16-cleanup.md` — last phase, tears down state and generates SUMMARY.md
- `.secrets/prod-test-users.md` — live credentials (not committed)
