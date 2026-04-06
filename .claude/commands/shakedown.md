---
description: Run the production shakedown test plan against run.civpulse.org. Accepts: (empty=all), phase-NN-*, <chain-name>, or list.
argument-hint: "[all | phase-NN-* | isolation | security | perms | field | a11y | perf | list]"
---

## User Input

```text
$ARGUMENTS
```

You are executing the **CivicPulse Run production shakedown test plan**. This validates `https://run.civpulse.org` is ready for real users. Treat this as a high-stakes production task — you have direct access to prod systems.

## Start here

1. **Read `docs/production-shakedown/README.md` in full** — it contains the configuration, credential placeholders, dependency graph, tool conventions, and severity rules.
2. **Read `.secrets/prod-test-users.md`** — Org A test user credentials (gitignored).
3. **Run the pre-flight checks** listed in README §"Pre-flight verification":
   - `curl -fsS https://run.civpulse.org/health/live`
   - `curl -fsS https://auth.civpulse.org/.well-known/openid-configuration`
   - `psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "SELECT version();"`
   - `kubectl -n civpulse-prod get deploy run-api -o jsonpath='{.status.availableReplicas}'`
   - `cd web && npx playwright --version`

If ANY pre-flight fails, STOP and report to user.

## Decide what to run based on `$ARGUMENTS`

| Argument | Phases to execute |
|---|---|
| (empty) or `all` | All phases 00 → 16 in order |
| `phase-NN-…` (exact filename) | Just that single phase |
| `isolation` | 00, 01, 02, **03** (multi-tenant isolation focus) |
| `security` | 00, 01, **12** (security probes) |
| `perms` | 00, 04, **11** (RBAC matrix) |
| `field` | 00, 04, 06, 07, 08, **10** (field mode offline) |
| `a11y` | 00, **14** (accessibility audit) |
| `perf` | 00, 05, **15** (performance smoke) |
| `critical` | 00, 01, 02, 03, 11, 12 (pre-launch must-pass set) |
| `list` | List all phase files + brief description, then exit |

If `$ARGUMENTS` doesn't match any of these, ask the user to clarify with a list of options.

## Execute each selected phase

For every phase in your selection:

1. **Read the phase file in full** (`docs/production-shakedown/phase-NN-*.md`) before starting.
2. **Check dependencies** — the file's "Depends on" line lists required prior phases. If a dependency's `results/phase-NN-results.md` doesn't exist, either run it first (if in your selection) or STOP and report.
3. **Create TodoWrite tasks** — one per test section in the phase — so the user can see progress.
4. **Execute every test ID in order.** For each test:
   - Follow the Steps literally (adapt placeholders from README config).
   - Capture evidence (response bodies, screenshots, DB dumps).
   - Evaluate against Expected + Pass criteria.
   - Record PASS/FAIL/SKIP/BLOCKED + 1-2 line note per test.
5. **Run any inline Cleanup** mentioned in the test before moving on.
6. **After the phase**, write results to `docs/production-shakedown/results/phase-NN-results.md` by copying the Results Template from the phase file and filling in every row.
7. **Post a progress summary** to the user: `Phase NN complete: X/Y PASS, Z FAIL. [P0/P1 failures listed]`. Then continue.

## Tool usage

- **API probes** → `curl -fsS` (fail on errors, silent)
- **Browser / UI** → Playwright via `cd web && EMAIL=… PASSWORD=… ROLE=… node smoke-test-harness.mjs` OR `mcp__plugin_chrome-devtools-mcp_*` if available
- **DB verification** → `psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod` (you have superuser access)
- **Pod logs / exec** → `kubectl -n civpulse-prod …`
- **Direct app execution** → `kubectl exec -i deploy/run-api -c run-api -- python < script.py` (has httpx, asyncpg, SQLAlchemy)
- For obtaining user JWT tokens, see README §"Obtaining a JWT"

## Guardrails — this is production

- **NEVER** modify any file under `docs/production-shakedown/` except under `results/` and `results/evidence/`.
- **NEVER** delete or mutate pre-existing non-test data in prod DB. Kerry Hatcher has 17 legacy campaigns — leave them alone.
- **NEVER** run `phase-16-cleanup.md` unless explicitly in your selection AND the user confirms.
- **STOP on P0 findings**: any successful cross-tenant data access, any 200 where 401/403 is expected on sensitive endpoints, any leaked credentials, any SQL injection success, any 500 on auth paths. Report to user with full evidence and do NOT continue until the user approves.
- **Known workarounds to leave in place**: `ALTER ROLE civpulse_run_prod BYPASSRLS` (tracked in #21), `alembic_version VARCHAR(128)` (tracked in #19). Don't attempt to remove these.
- If a phase has a prerequisite you can't satisfy, mark tests BLOCKED and continue — don't fabricate data.

## At the end

1. Produce `docs/production-shakedown/results/SUMMARY.md` per the template in `results/README.md`:
   - Per-phase pass/fail totals
   - All P0/P1 failures with evidence links
   - Go/no-go verdict for production launch
2. Post the summary to the user.
3. If there are any FAIL or BLOCKED tests, file a brief list with severity labels and suggest filing GitHub issues.

## Failure handling

- Transient errors (network, rate limit): retry up to 3× with 2s backoff, then mark FAIL with "transient: {error}" note.
- Unexpected schema/endpoint drift: mark the test FAIL with "drift: expected X, got Y" and continue. Don't try to fix the plan.
- If a test's Steps reference a UUID you haven't captured (e.g. `${ORG_B_VOTER_ID}`), look it up first from `results/phase-00-results.md` or via a quick DB query.

Begin by reading the README and running pre-flight checks.
