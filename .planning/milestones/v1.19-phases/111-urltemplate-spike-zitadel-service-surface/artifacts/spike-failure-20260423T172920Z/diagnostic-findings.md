# Phase 111 Spike Failure — Diagnostic Findings

**Run timestamp:** 2026-04-23T17:25:21Z (UTC)
**Duration:** 35.3s (timed out at 30s waitForURL)
**Dev ZITADEL version:** v4.10.1 (docker image `ghcr.io/zitadel/zitadel:v4.10.1`)
**Dev ZITADEL URL:** https://kudzu.tailb56d83.ts.net:49373

## Failing Assertion

`page.waitForURL(/^https:\/\/run\.civpulse\.org\/invites\/[^/?#]+\?zitadelCode=[^&#]+&userID=[^&#]+$/, { timeout: 30_000 })` — timed out after 30s.

## Observed Browser Navigation Sequence

After the spike POSTed the password-set form at `/ui/login/user/invite`, the
browser navigated through the following URLs (captured in Playwright's page
log, `run-output.log` lines 23-26):

1. `https://kudzu.tailb56d83.ts.net:49373/ui/console/`
2. `https://kudzu.tailb56d83.ts.net:49373/ui/console/` (same, likely redirect)
3. `https://kudzu.tailb56d83.ts.net:49373/ui/login/login?authRequestID=369885816668815365`

The browser was stopped at step 3 (a regular ZITADEL login prompt) when the
30s timeout fired. The `run.civpulse.org/invites/...` deep link was never
navigated to.

## Page State At Timeout

Per `error-context.md` page snapshot:

- Heading: "Welcome Back!"
- Paragraph: "Enter your login data."
- Textbox: "Login Name" (placeholder "username@domain")
- Button: "Next" (disabled)

This is the standard ZITADEL login-name prompt — NOT our app's invite page.

## API-Level Shape Probe

Direct `POST /v2/users/{userId}/invite_code` calls (bypassing the browser)
succeeded for five shapes:

| Shape | Body | Result | Code returned? |
|-------|------|--------|---------------|
| A | `{"returnCode": {}, "urlTemplate": "..."}` | 200 OK | yes |
| B | `{"sendCode": {"urlTemplate": "..."}}` | 200 OK + "could not create email channel" error (no SMTP) | no |
| C | `{"returnCode": {"urlTemplate": "..."}}` | 200 OK | yes |
| D | `{"returnCode": {}, "applicationName": "CivicPulse", "urlTemplate": "..."}` | 200 OK | yes |
| E | `{"sendCode": {"urlTemplate": "...", "applicationName": "CivicPulse"}}` | 200 OK + "could not create email channel" error | no |

Shape A is the plan's (and the spike's) chosen shape. The API accepts it
and returns an `inviteCode`. **The API does not error, but the stored
`urlTemplate` appears to be ignored by ZITADEL's legacy Go-templates
login UI when the user submits the password-set form at
`/ui/login/user/invite`.**

## Legacy vs v2 Login UI

- `/ui/v2/login/verify?userId=...&code=...&invite=true` — **404 Not Found** on
  our dev ZITADEL v4.10.1. The v2 TypeScript login app is NOT bundled into
  the ZITADEL server binary.
- `/ui/login/user/invite?userID=...&code=...` — **200 OK**. Serves the
  legacy "Activate User" Go-templates form.
- `/ui/login/user/init?userID=...&code=...` — **200 OK**. Same form.

Both `/ui/login/user/invite` and `/ui/login/user/init` render the same
form with fields `code`, `password`, `passwordconfirm`, and a "Next" button.
After POST, ZITADEL redirects to `/ui/console/` — NOT to our stored
`urlTemplate`. This matches the behavior seen in the spike trace.

The `urlTemplate` field of `POST /v2/users/{userId}/invite_code` appears
to be honored only by the separately-deployed `zitadel/typescript` login
app, which is not part of the ZITADEL server binary for v4.x. The dev
instance (and presumably any instance that only runs the server binary)
does not route through the v2 login app, so the stored `urlTemplate` has
no observable effect on the redirect after password set.

## Other Dev Environment Notes

- ZITADEL SMTP is NOT configured (dev). This is orthogonal to the spike —
  the spike uses `returnCode: {}` to get the invite code back synchronously
  and drives the hosted UI itself, never relying on ZITADEL-sent email.
- The service-account token exchange (`/oauth/v2/token` client_credentials)
  succeeded. `POST /v2/users/human` with `isVerified: true` succeeded. The
  failure is strictly at the post-password-set redirect boundary.

## What This Means

The spike's pass signal requires the browser to **land** at
`https://run.civpulse.org/invites/<token>?zitadelCode=<code>&userID=<id>`
after the user sets a password. ZITADEL v4.10.1's bundled legacy login UI
does not perform that redirect — the stored `urlTemplate` is silently
ignored. This is the exact contingency D-SPIKE-03 was designed to detect.

The plan's Option B architecture (init code → hosted setup → `urlTemplate`
redirect → OIDC session on auth origin) depends on the v2 login app being
available. Deploying the v2 app separately is a non-trivial ops change and
would need to be added to the milestone plan. The alternative is
Option C non-ROPC, which is the escape hatch documented in the roadmap.

## Artifacts In This Directory

- `run-output.log` — full stdout of `run-e2e.sh invite-urltemplate-spike.spec.ts`
- `test-failed-1.png` — screenshot at timeout (shows the ZITADEL "Welcome Back!" login prompt)
- `trace.zip` — full Playwright trace (open with `npx playwright show-trace <path>`)
- `error-context.md` — Playwright's rendered page snapshot at failure
- `e2e-runs-jsonl-row.json` — the `e2e-runs.jsonl` row for this run

## Reproduction

```bash
export ZITADEL_URL=https://kudzu.tailb56d83.ts.net:49373
export ZITADEL_SERVICE_CLIENT_ID=run-api-service
export ZITADEL_SERVICE_CLIENT_SECRET=<from .env.zitadel>
cd web && ./scripts/run-e2e.sh invite-urltemplate-spike.spec.ts
```

The failure is deterministic against our dev ZITADEL v4.10.1 instance.
