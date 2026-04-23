---
phase: 111
reviewers: [gsd-plan-checker]
reviewed_at: 2026-04-23
plans_reviewed: [111-01-PLAN.md, 111-02-PLAN.md, 111-03-PLAN.md, 111-04-PLAN.md, 111-05-PLAN.md, 111-06-PLAN.md]
verdict: APPROVE WITH CHANGES
blocker_count: 2
warning_count: 4
---

# Plan Review — Phase 111

> External AI CLIs not installed on this machine — only Claude is available. `gsd-plan-checker` agent dispatched directly from the main context as the functional equivalent of `/gsd-review`. Goal-backward, read-only review.

## gsd-plan-checker Review

### Overall Verdict

**APPROVE WITH CHANGES** — 2 blockers, 4 warnings.

Plans are structurally solid, goal-backward traceable, and honor CONTEXT.md decisions. Wave topology is correct:
- **W1:** Spike (gates all) →
- **W2:** Retry helper + scope audit (parallel) →
- **W3:** `ensure_human_user` + `create_invite_code` (parallel) →
- **W4:** Baseline gate

Plan 01's D-SPIKE-02 pass-signal IS correctly exercised — Task T3 asserts landing URL + hydrated oidc-client-ts user + authed `/api/v1/me` round-trip with `profile.sub` match. Retry helper is used by both downstream methods (Plans 03/04 depend on Plan 02). `autonomous: false` gates on Plans 01 and 05 are wired correctly.

No out-of-scope work detected — `send_campaign_invite_email` wiring stays deferred to Phase 113.

### Blockers

**B1. [scope_reduction / key_link] Plan 01 Task T3 depends on Phase 114's frontend query-string parsing.**

`111-01-PLAN.md:142` explicitly defers frontend query parsing to Phase 114: *"this phase just passes the string to ZITADEL and asserts the redirect lands correctly."* Yet T3 acceptance requires authStore to have a **hydrated** OIDC user post-redirect — which requires the callback handler to actually process `zitadelCode`. Without Phase 114's work, the spike cannot satisfy D-SPIKE-02(b)+(c).

**Options to resolve:**
- (a) Add a minimal test-only callback-handling shim to Plan 01
- (b) Move the authed-API-call assertion to a later phase's verification
- (c) Explicitly document the assumption that ZITADEL's hosted password-set auto-completes OIDC via the existing `/auth/callback` handler before redirecting to `urlTemplate`, and verify this assumption in a short pre-flight Task T0 before T3 runs

Option (c) is the cleanest fix if the assumption holds — the spike still proves the urlTemplate deep-link + session continuity claim without reaching into Phase 114's scope.

**B2. [task_completeness] Plan 01 Task T3 has an undecided URL target.**

T3 action text: *"Navigate to the ZITADEL hosted invite-acceptance URL ... OR use the redirect ZITADEL places in the email (follow research ARCHITECTURE.md ... if unclear...)."* This is a TODO embedded in the gating plan. Since this is the load-bearing test for the whole milestone, ambiguity here means execution may flail.

**Fix:** Resolve the exact accept-invitation URL during planning (likely `/ui/login/login/invite?...` per ZITADEL v2 docs) and commit it in the plan before execution.

### Warnings

**W1. [Plan 05] Autonomous split missing.**

Plan 05 mixes autonomous tasks (T1/T2/T3/T5/T6/T7 — audit, bootstrap, integration) with a non-autonomous task (T4 — ZITADEL Console narrowing), but marks the WHOLE plan `autonomous: false`. Per the gates spec, execute-phase's pre-flight needs clear escalation points. The plan should either:
- Split into `05a` (audit, autonomous) / `05b` (Console narrow, non-autonomous) / `05c` (bootstrap + integration, autonomous), OR
- Add an explicit `<task type="checkpoint:human">` separator before T4.

Otherwise execute-phase stops at the start of the plan instead of at T4.

**W2. [Plan 01 / run-e2e.sh] Test envs not injected.**

Plan 01 uses `process.env.ZITADEL_SERVICE_CLIENT_ID/SECRET` but `web/scripts/run-e2e.sh` is not documented to inject these. T1 lists a pre-flight env check, but no plan updates `run-e2e.sh` or `.env.example` to surface the required envs. Without this, CI will silently skip or fail cryptically.

**W3. [Plan 06] Missing pre-phase baseline snapshot.**

T3 says *"compare against pre-phase pass counts in `web/e2e-runs.jsonl`"* — but no task captures the pre-phase baseline first. Run 1/2 should be compared to a stored baseline row, not the last row (which IS run 1).

**W4. [Plan 02 / retry helper] Invariant not test-enforced.**

The retry helper docstring warns about opening `httpx.AsyncClient` inside the callable (not around retries). Plans 03/04 implementations do it correctly. But no unit test enforces this invariant against future refactors — one line change in the helper could silently break all retries without a test catching it.

### Blind Spots

- **SCOPE-AUDIT reviewer attestation:** Plan 05 T2 produces a solid table (endpoint | method | min role | observed | OK?), but no row explicitly maps role → who-at-CivicPulse-approves. For a security control, the audit needs a reviewer attestation field. Polish item.
- **Integration test graceful skip:** Plan 06 assumes all integration tests skip gracefully when ZITADEL envs are missing — true for Plan 03/04's new tests, not verified for existing zitadel tests. Low risk, untested.

### Recommendation

Return plans to planner with the two blockers (Plan 01 T3 frontend-route dependency + undecided URL) and the Plan 05 autonomous-split warning. The remaining items can be handled as a pre-execution checklist or folded into Plan 01 T1/T2 minor edits.

---

## Consensus Summary

Single reviewer — no cross-CLI consensus to synthesize.

### Key Concerns (apply directly)

1. **Verify the ZITADEL hosted-password-set → `/auth/callback` → `urlTemplate` flow sequence before relying on it** (Blocker B1). Either add a pre-flight Task T0 to Plan 01 OR narrow the spike's pass criteria to landing only, deferring authStore + authed-API assertions to Phase 114's verification.
2. **Commit a specific URL in Plan 01 Task T3** (Blocker B2). Read ZITADEL v2 hosted-UI docs during replan to pick the right starting URL.
3. **Split Plan 05 or add a checkpoint separator at T4** (Warning W1).
4. **Update `run-e2e.sh` / `.env.example` to surface the envs Plan 01 needs** (Warning W2).
5. **Capture pre-phase baseline in Plan 06 before running comparison** (Warning W3).
6. **Add a unit test enforcing the "open AsyncClient inside callable" invariant in Plan 02** (Warning W4).

### Plan Readiness

**Status after review:** Requires revision before execution. `--autonomous: false` gates correct, but the gating spike needs structural clarification before execute-phase can run it safely.
