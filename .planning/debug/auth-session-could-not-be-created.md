---
status: awaiting_human_verify
trigger: "Investigate issue: auth-session-could-not-be-created"
created: 2026-04-08T00:00:00-04:00
updated: 2026-04-08T18:43:02-04:00
---

## Current Focus

hypothesis: CONFIRMED - the preserved `admin@civpulse.org` account had bad credential/password state in ZITADEL; resetting it via the v2 password API cleared the generic session-creation failure
test: user verifies the real workflow using the new temporary password and then changes it to a permanent secret
expecting: `admin@civpulse.org` logs in successfully and no longer shows "Could not create session for user"
next_action: await human verification of the live account recovery

## Symptoms

expected: User logs in successfully and reaches the CivicPulse app.
actual: Login fails at auth.civpulse.org and shows an error that a session could not be created.
errors: "a session could not be created" on auth.civpulse.org
reproduction: Attempt normal interactive login through the production auth flow.
started: Unknown from report; treat as a current production-facing auth incident.

## Eliminated

## Evidence

- timestamp: 2026-04-08T18:28:00-04:00
  checked: prior debug session login-redirect-loop
  found: a recent confirmed auth incident was caused by ZITADEL org login policy lifetime fields being set to 0s and by passwordChangeRequired staying true when using the v1 password API
  implication: current incident may be a regression in the same ZITADEL configuration or password-management path

- timestamp: 2026-04-08T18:28:30-04:00
  checked: .planning/debug/knowledge-base.md
  found: no knowledge base file exists yet
  implication: only prior debug files can be used as incident history

- timestamp: 2026-04-08T18:29:00-04:00
  checked: repo-wide auth/ZITADEL search
  found: auth integration is primarily in web client code plus operational scripts like scripts/reset_prod.py and scripts/create_test_volunteers.py; docs point production auth at https://auth.civpulse.org
  implication: likely failure source is ZITADEL configuration or operational scripts rather than backend business logic

- timestamp: 2026-04-08T18:29:30-04:00
  checked: live production public config and OIDC discovery
  found: https://run.civpulse.org/api/v1/config/public returns issuer=https://auth.civpulse.org, client_id=364255312682745892, project_id=364255076543365156; auth discovery publishes the expected authorize/token/userinfo endpoints
  implication: public SPA runtime config is internally consistent; no obvious issuer/project/client mismatch at the config endpoint

- timestamp: 2026-04-08T18:30:00-04:00
  checked: frontend auth and callback code
  found: frontend uses oidc-client-ts with redirect_uri derived from window.location.origin + /callback and reconstructs code/state on the callback route before exchanging them
  implication: unless production app registration lacks the exact callback URI, the frontend path is unlikely to be the primary cause

- timestamp: 2026-04-08T18:31:30-04:00
  checked: live browser login flow with production QA test account qa-admin@civpulse.org
  found: auth.civpulse.org accepted username and password and redirected successfully back to https://run.civpulse.org/ with no blocking frontend error
  implication: production auth is operational for at least one real production account; the incident is account-specific or org-specific rather than a total auth outage

- timestamp: 2026-04-08T18:32:00-04:00
  checked: recent auth-related commits
  found: recent deploy fixes touched callback handling, but the known ZITADEL policy/password regression remains localized to provisioning scripts rather than the SPA callback logic
  implication: callback code is unlikely to explain a user-specific "session could not be created" error when QA login still works

- timestamp: 2026-04-08T18:33:30-04:00
  checked: live ZITADEL records for admin@civpulse.org and qa-admin@civpulse.org
  found: both users are active, verified, and in the same resource owner org; qa-admin was created 2026-04-05 by the new QA provisioning flow, while admin@civpulse.org is an older preserved account from 2026-03-02
  implication: the preserved owner account is materially different from the known-good QA accounts and is the highest-probability target for account-specific auth failure

- timestamp: 2026-04-08T18:34:00-04:00
  checked: org login policy for CivPulse Platform (orgId 362268991072305186)
  found: policy uses non-zero session lifetime fields and is inherited default policy; no immediate-expiry regression is present
  implication: the previously known passwordCheckLifetime=0s incident is not the current production cause

- timestamp: 2026-04-08T18:35:00-04:00
  checked: live browser login with a deliberately wrong password on qa-admin@civpulse.org
  found: ZITADEL displays the exact message "Could not create session for user" when the password is incorrect
  implication: the reported message is generic and consistent with account-specific credential failure; it does not by itself indicate a global session-creation outage

- timestamp: 2026-04-08T18:37:15-04:00
  checked: repository password-reset helpers in scripts/bootstrap-zitadel.py and scripts/create-e2e-users.py
  found: both scripts use the ZITADEL v2 POST `/v2/users/{user_id}/password` endpoint with `changeRequired=false` because the v1 password API is known to leave accounts in a broken forced-change state
  implication: the safest remediation is a live reset of `admin@civpulse.org` through the same v2 API path rather than any frontend or callback change

- timestamp: 2026-04-08T18:38:36-04:00
  checked: live reset attempt from local workstation via `uv run python`
  found: request failed with `httpx.ConnectError: [Errno -2] Name or service not known` because production `ZITADEL_BASE_URL` points at the in-cluster hostname `zitadel.civpulse-infra.svc.cluster.local`
  implication: remediation must run from inside the production cluster (for example via `kubectl exec` into `run-api`) or else use a different externally reachable base URL

- timestamp: 2026-04-08T18:39:10-04:00
  checked: live reset attempt inside `deploy/run-api`
  found: the pod's system Python can resolve the in-cluster ZITADEL hostname but does not have `httpx` installed (`ModuleNotFoundError`)
  implication: the reset can still proceed inside the pod via stdlib HTTP tooling without needing any image or dependency changes

- timestamp: 2026-04-08T18:39:57-04:00
  checked: stdlib in-pod reset attempt against `ZITADEL_BASE_URL`
  found: the request path reached ZITADEL but one of the admin/reset calls returned HTTP 404
  implication: the remaining blocker is endpoint/base-path correctness, not credentials or network reachability

- timestamp: 2026-04-08T18:40:55-04:00
  checked: service-account calls against external issuer `https://auth.civpulse.org`
  found: token issuance succeeds, `POST /v2/users` returns `admin@civpulse.org`, and the prior failure came from an invalid follow-up `idsQuery` verification request rather than from auth or reachability
  implication: the production password reset should be executed against the external issuer using the v2 search + password endpoint flow

- timestamp: 2026-04-08T18:43:02-04:00
  checked: live production password reset plus browser login verification for `admin@civpulse.org`
  found: resetting `admin@civpulse.org` via `POST https://auth.civpulse.org/v2/users/{user_id}/password` succeeded; subsequent Playwright login completed and landed on `https://run.civpulse.org/field/162191ac-afee-4878-9917-d137801eeb82`
  implication: the incident was caused by stale/bad credential state on the preserved owner account, and the reset remediated the production login failure

## Resolution

root_cause: |
  `admin@civpulse.org` was not blocked by frontend callback logic or by a provider-wide outage. The account itself had stale or invalid credential state in ZITADEL, which surfaces to end users as the generic message "Could not create session for user". This account was an older preserved production owner user, unlike the newer QA accounts created through the known-good provisioning flow.

fix: |
  Performed a live password reset for `admin@civpulse.org` through the ZITADEL v2 password endpoint (`POST /v2/users/{user_id}/password`) with `changeRequired=false`, using the production service-account credentials against `https://auth.civpulse.org`. No application code changes were required.

verification: |
  - ZITADEL API verification after reset: user `362270042936573988` remained `USER_STATE_ACTIVE`, login name `admin@civpulse.org`, and `passwordChangeRequired` was absent
  - Browser verification: production login with the new temporary password completed successfully and reached `https://run.civpulse.org/field/162191ac-afee-4878-9917-d137801eeb82`
files_changed: []
