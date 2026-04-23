---
phase: 111
plan: "01"
artifact: spike-verdict
verdict: FAIL
run_at: "2026-04-23T17:33:05Z"
e2e_run_row: "2026-04-23T17:33:05Z entry in web/e2e-runs.jsonl (second run with storageState fix)"
prior_run_at: "2026-04-23T17:25:21Z"
---

# Phase 111 urlTemplate Deep-Link Spike — Verdict: FAIL

## Outcome

The `urlTemplate` deep-link contract — a ZITADEL-hosted password-set flow
that redirects the browser to
`https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`
after the user submits the password form — **does not hold on our dev ZITADEL
v4.10.1 instance.** The spike failed at the `waitForURL` assertion after the
browser was redirected to ZITADEL's `/ui/console/` and then bounced to a
regular `/ui/login/login?authRequestID=...` prompt instead of our app.

The spike was designed exactly to catch this. Per **D-SPIKE-03**, phase 111
exits `status: blocked (spike failed)` and the milestone replans.

## What Passed

- `POST /oauth/v2/token` (client_credentials grant) — service account authenticates.
- `POST /v2/users/human` with `email.isVerified: true` — throwaway invitee created (200 OK).
- `POST /v2/users/{userId}/invite_code` with body
  `{"returnCode": {}, "urlTemplate": "<locked template>"}` — accepted (200 OK),
  invite code returned.
- Cleanup `DELETE /v2/users/{userId}` — idempotent; no user leak.
- ZITADEL-hosted form at `/ui/login/user/invite` — rendered and accepted password.

The API surface and the runtime service account are **not** the bottleneck.
The failure is strictly at the post-password-set redirect boundary.

## What Failed

- Expected landing URL:
  `^https://run\.civpulse\.org/invites/[^/?#]+\?zitadelCode=[^&#]+&userID=[^&#]+$`
- Actual navigation after form submit (from Playwright page log):
  1. `https://kudzu.tailb56d83.ts.net:49373/ui/console/`
  2. `https://kudzu.tailb56d83.ts.net:49373/ui/console/`
  3. `https://kudzu.tailb56d83.ts.net:49373/ui/login/login?authRequestID=369886596171825157`
- Playwright error: `page.waitForURL: Timeout 30000ms exceeded` at
  `web/e2e/invite-urltemplate-spike.spec.ts:339`.

The stored `urlTemplate` has no observable effect on the post-init redirect
when the user is driven through ZITADEL's legacy Go-templates login UI.

## Root Cause (Diagnostic)

ZITADEL v4.10.1's server binary bundles ONLY the legacy Go-templates login
UI at `/ui/login/*`. The v2 TypeScript login app (`zitadel/typescript`),
which is the component that honors the `urlTemplate` from `CreateInviteCode`,
is distributed as a **separate Next.js app** that must be deployed alongside
the ZITADEL server and routed to by the operator. It is **not** bundled.

Probes confirmed:
- `/ui/v2/login/verify?userId=...&code=...&invite=true` → HTTP 404
- `/ui/v2/login/*` (any subpath) → HTTP 404
- `/ui/login/user/invite?userID=...&code=...` → HTTP 200 (legacy form, but no urlTemplate honoring)
- `/ui/login/user/init?userID=...&code=...` → HTTP 200 (same form)

API-level shape variants all behave the same way at the legacy UI boundary —
the backend stores `urlTemplate` but the legacy UI never reads it on the
redirect path after password set.

Full diagnostic findings:
`.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/diagnostic-findings.md`

## Evidence Paths

- Playwright trace:
  `.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/trace.zip`
  (open with `npx playwright show-trace <path>`)
- Failure screenshot:
  `.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/test-failed-1.png`
- Playwright page snapshot at failure:
  `.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/error-context.md`
- Full run output:
  `.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/run-output.log`
- Raw e2e-runs.jsonl row:
  `.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/e2e-runs-jsonl-row.json`
  (timestamp `2026-04-23T17:25:21Z`, exit_code 1, log `e2e-logs/20260423-132521.log`)
- Diagnostic writeup (shape probes + UI-path probes):
  `.planning/phases/111-urltemplate-spike-zitadel-service-surface/artifacts/spike-failure-20260423T172920Z/diagnostic-findings.md`

## Next Action

Run `/gsd-replan-milestone v1.19 --reason option-c-non-ropc` to reroute this milestone. Do NOT proceed with plans 02-06 until the milestone is replanned.

Phase 111 is marked `status: blocked (spike failed)`. Plans 02-06 are gated
by `wave: 1` + `gating: true` on this plan and MUST NOT execute. The
`ensure_human_user` / `create_invite_code` methods and the scope audit are
not shipped in this state — they would be wasted work if the milestone
switches to Option C non-ROPC.

## Options For The Replan

Decision input for the user — not acted on by the executor:

1. **Option C non-ROPC (original fallback).** Reroute the milestone to an
   app-owned setup flow that does not rely on ZITADEL's hosted UI or
   `urlTemplate`. Matches the research contingency plan.
2. **Option B with separate TypeScript login app deploy.** Stand up the
   `zitadel/typescript` login app alongside ZITADEL in dev + prod, route
   `/ui/v2/login/*` to it, then re-run the spike. This is a new operational
   surface; not free. The exact same `urlTemplate` contract would then
   need re-proving against that deployment.
3. **Downgrade scope.** Accept that the init-code deep-link redirect is not
   available and shape EMAIL-03 so our email points at a legacy ZITADEL
   path with an app-side bounce — e.g. `https://run.civpulse.org/invite-bounce?token=<our_token>&zitadelUserID=<id>&zitadelCode=<code>`
   that the app renders and then posts to the legacy init endpoint behind
   the scenes. Requires app-side design work; trade-off matrix needed.

All three options require planner + user review. This verdict does not
select one — it reports the failure and hands control back.

## Phase 114 Follow-Up (N/A)

Section deliberately omitted — this is a FAIL verdict. The Phase 114
follow-up section applies only on PASS.

## Gating Effect

- Plans 02-06 in Phase 111 **do not execute** until this verdict is
  upgraded to PASS (which requires infrastructure changes — Option B+app
  deploy — or the milestone replans to Option C non-ROPC).
- No Phase 111 commits touch `app/services/zitadel.py`. The service surface
  is not shipped.
- STATE.md is updated to mark Phase 111 as blocked on spike failure.

---

**Verdict author:** Executor (Claude, sequential mode)
**Verdict timestamp:** 2026-04-23T17:36:00Z (updated from second run)
**Second run:** 2026-04-23T17:33:05Z — added `storageState: { cookies: [], origins: [] }` to prevent stale session interference. Same FAIL result; ZITADEL still redirected to `/ui/console/` instead of urlTemplate URL. Artifacts in `artifacts/spike-failure-20260423T173305Z/`.
**Plan reference:** `.planning/phases/111-urltemplate-spike-zitadel-service-surface/111-01-PLAN.md`
