# Stack Research: v1.19 Invite Onboarding (ZITADEL User Provisioning)

**Domain:** Programmatic ZITADEL human user provisioning + first-time setup flow for campaign invites
**Project:** CivicPulse Run API
**Researched:** 2026-04-22
**Overall confidence:** HIGH (ZITADEL endpoints) / MEDIUM (oidc-client-ts re-login pattern for Option C)

## TL;DR Recommendation

The existing stack is sufficient. **No new pyproject dependencies required for either Option B or Option C.** Both options extend `app/services/zitadel.py` with three to four new methods using the already-imported `httpx` + cached service-account token (`_get_token`). The decision is about which ZITADEL endpoints to call and where the password-set UI lives — not about adopting a new SDK.

The lean is **Option B (ZITADEL `invite_code` flow)**: one stable v2 endpoint replaces the entire frontend setup page + ROPC fallback that Option C requires, eliminates ROPC lock-in concerns, and leaves password-policy enforcement entirely on ZITADEL's side. See the scorecard at the bottom.

## Existing Seams To Reuse

| Seam | Where | What It Already Does |
|------|-------|---------------------|
| `ZitadelService` | `app/services/zitadel.py` | httpx-based Management API client; cached service-account token via `client_credentials` (`_get_token`); per-call host header + TLS verify control; existing 409 idempotency pattern in `assign_project_role` and `ensure_project_grant` |
| Service-account JWT auth | `app/services/zitadel.py:46-93` (`_get_token`) | Caches token until 60s before expiry; refreshes lazily; raises `ZitadelUnavailableError` on connect/timeout. New methods can just call `await self._get_token()` |
| `ZitadelUnavailableError` | `app/core/errors.py` (referenced) | Already mapped to upstream-unavailable HTTP responses; new methods reuse the same error envelope |
| Mailgun invite delivery | `app/services/invite_email.py`, `app/tasks/invite_tasks.py` | Durable, post-commit, Procrastinate-queued. Both Option B and Option C send their links via this seam — neither needs a new email path |
| oidc-client-ts UserManager | `web/src/stores/authStore.ts` | Already configured for ZITADEL with PKCE Authorization Code flow; provides `signinRedirect`, `signinSilent`, and (via library) `signinResourceOwnerCredentials` |
| Bootstrap script project/roles | `scripts/bootstrap-zitadel.py` | Owns project, roles, SPA app, instance login policy. **Touch only if password complexity policy needs to be set programmatically (see Pitfalls #5)** |

> **Correction:** `app/services/zitadel_auth.py` does not exist on disk. The service-account auth lives inline in `ZitadelService._get_token`. New work should extend that, not introduce a parallel module.

## ZITADEL API Surface Required

ZITADEL version in production (per `scripts/bootstrap-zitadel.py:432`): **v2.71.x** (Management v1 + User Service v2 both present and stable on 2.71). All endpoints below are GA on v2.71.

### Both Options Need

| # | Endpoint | Purpose | Notes |
|---|----------|---------|-------|
| 1 | `POST /v2/users/human` | Create the human user (no password) | Set `email.isVerified=true` (we trust the invitee email since they received the token). Omit `password` block to leave the user without credentials. Returns `userId`. **HIGH confidence** — primary documented "create human user" endpoint in v2.71. Source: https://zitadel.com/docs/guides/integrate/login-ui/username-password |
| 2 | `POST /management/v1/users/_search` | Find existing user by email/loginName before create (idempotent re-invite) | Already used pattern in `bootstrap-zitadel.py:131` (machine user lookup) and `:447` (admin user lookup) — proven against this exact ZITADEL version. Body: `{"queries": [{"emailQuery": {"emailAddress": "...", "method": "TEXT_QUERY_METHOD_EQUALS"}}]}`. **HIGH confidence**. |
| 3 | `POST /management/v1/users/{userId}/grants` (existing) | Assign campaign project role to the new ZITADEL user | Already implemented in `ZitadelService.assign_project_role`; reuse with `org_id` header for the campaign's ZITADEL org. **HIGH confidence**. |

### Option B Adds (one endpoint)

| # | Endpoint | Purpose | Notes |
|---|----------|---------|-------|
| 4 | `POST /v2/users/{userId}/invite_code` | Generate a one-time invitation code; ZITADEL hosts the password-set UI | Body controls delivery: `{"sendCode": {"applicationName": "CivicPulse Run", "urlTemplate": "https://run.civpulse.org/invite/zitadel-callback?userID={{.UserID}}&code={{.Code}}&loginName={{.LoginName}}&orgID={{.OrgID}}"}}` to have ZITADEL email it, OR `{"returnCode": {}}` to get the code back and email it ourselves through Mailgun (preferred — keeps deliverability under our DMARC/SPF). **HIGH confidence** that this endpoint exists and is the documented v2 onboarding path; the exact JSON shape mirrors the well-documented `/v2/users/{id}/passkeys/registration_link` endpoint. Source: https://zitadel.com/docs/apis/migration_v1_to_v2 ("New onboarding process: invitation codes"). |

### Option C Adds (two endpoints + ROPC config)

| # | Endpoint | Purpose | Notes |
|---|----------|---------|-------|
| 4 | `POST /v2/users/{userId}/password` | Set the password the user typed on our `/invites/<token>/setup` page | Body for an admin-set: `{"newPassword": {"password": "...", "changeRequired": false}}` (no `verificationCode` or `currentPassword` needed when called with a service-account token holding `user.write` on the user's org). **HIGH confidence** — fully documented v2 endpoint. Source: https://zitadel.com/docs/guides/integrate/login-ui/password-reset |
| 5 | `GET /management/v1/policies/password/complexity` (or `/admin/v1/policies/password/complexity`) | Read the active password complexity (min length, has-number, has-symbol, etc.) so the frontend can echo policy hints | Per-org from management API; instance default from admin API. We need this only if we want client-side validation parity. **MEDIUM confidence** on exact path name; ZITADEL docs confirm "Password Complexity Policy" exists at instance + org level via Management/Admin. Source: https://zitadel.com/docs/guides/manage/console/default-settings |
| — | SPA app `grantTypes` change | If using ROPC for auto-login (the `signinResourceOwnerCredentials` path), the SPA OIDC app must include `OIDC_GRANT_TYPE_PASSWORD` and likely a `client_secret` (not currently issued — SPA is `OIDC_AUTH_METHOD_TYPE_NONE`) | This is a **bootstrap-zitadel.py change** with security trade-offs (ROPC discouraged by OAuth 2.1 BCP). See Pitfalls #6. |

### Optional / Nice-to-Have for Either Option

| Endpoint | Purpose |
|----------|---------|
| `POST /v2/users/{userId}/email/_resend_code` | If the invitee's verification code expires before they click |
| `POST /v2/users/{userId}/deactivate` | Compensating tx — if invite is revoked before acceptance, deactivate the half-provisioned ZITADEL user |
| `DELETE /management/v1/users/{userId}` | Hard-delete in the same compensating tx if the invite was never accepted (consider only if the user is brand-new and has no other grants) |

## httpx + JWT Service-Account Patterns

### What's Already Right

`ZitadelService._get_token` is the right shape: cached, lazy refresh, narrow exception envelope. New methods slot in alongside `create_organization` and follow the same pattern (`async with httpx.AsyncClient(verify=self._verify_tls, timeout=10.0) as client:` → POST → `raise_for_status()` → 409 swallowed for idempotency). No structural changes needed.

### Suggested Additions (small, no new deps)

1. **Surface a configurable timeout.** Today every method hard-codes `timeout=10.0`. Invite creation runs inside a request handler — bump to `timeout=15.0` and make it a class constant so we can dial it without churn.

2. **Idempotency via the existing 409-then-search pattern.** No new library. Mirror `ensure_project_grant` (zitadel.py:463): try create → on `409`/`400 already exists` → search by email → return existing `userId`. This is the same idempotency primitive `assign_project_role` already uses. **No `idempotency-key` library is needed** — ZITADEL doesn't honor RFC idempotency keys; the safe pattern is "search by email first, then create on miss."

3. **Bounded retry on 5xx for the user-create call.** The bootstrap script already does this manually (see `bootstrap-zitadel.py:102-117` — 10x retry on 503 with 3s sleep). For the runtime path, a 3x retry with exponential backoff (1s, 2s, 4s) on `httpx.ConnectError`, `httpx.TimeoutException`, and 5xx is sufficient. **Implement inline with `asyncio.sleep`** rather than adding `tenacity` — the policy is identical to existing patterns and a single new dep for one retry loop is overkill.

4. **No rate-limit library needed.** ZITADEL's documented per-instance rate limits are well above the invite-creation cadence (admin actions are not user-facing throughput). `slowapi` is already in `pyproject.toml` for our own API rate limiting; no inbound limit on ZITADEL calls is required.

## Frontend (Option C only)

The currently-imported `oidc-client-ts` (per `web/src/stores/authStore.ts`) supports two paths to "log this user in immediately after we just set their password":

### Path C1 — `signinResourceOwnerCredentials` (Direct)

```ts
const user = await mgr.signinResourceOwnerCredentials({ username, password })
```

- **Pros:** One call. No redirect bounce. Auto-fills the OIDC store.
- **Cons:** Requires the SPA OIDC app to enable `OIDC_GRANT_TYPE_PASSWORD` AND requires a `client_secret` (per oidc-client-ts docs: "Required for ROPC"). The current SPA app is `OIDC_AUTH_METHOD_TYPE_NONE` (PKCE public client). Adding a secret to a browser-resident SPA is a regression — secrets in client-side JS are extractable. ROPC is also explicitly discouraged in OAuth 2.1 (deprecated grant). **LOW confidence** that this is acceptable for a production SPA.

### Path C2 — `signinRedirect` with `prompt=none` after password set (Hidden Iframe)

```ts
await mgr.signinRedirect({ extraQueryParams: { login_hint: email, prompt: "login" } })
```

- ZITADEL still owns the password check (the user has *just* set the password; submitting it once via our form sets it in ZITADEL but does not establish a ZITADEL session cookie at `auth.civpulse.org`). The redirect re-authenticates them through ZITADEL's standard hosted login.
- **Pros:** No grant-type changes. No client_secret. Matches existing flow.
- **Cons:** Two trips: (1) our form POST sets the password, (2) `signinRedirect` bounces through `auth.civpulse.org` where the user is asked to enter the password again (since they have no active ZITADEL session). This **defeats the "Option C unifies the experience" promise** unless we also pre-create a ZITADEL session via `POST /v2/sessions` and pass the session token through the OIDC flow — which is a substantially deeper integration (custom login UI territory, see https://zitadel.com/docs/guides/integrate/login-ui/username-password).

### Conclusion

Option C's frontend cost is significantly higher than the Project Description implies. The clean version (no ROPC, no `client_secret`, full SPA security posture preserved) requires implementing parts of the v2 sessions API to mint a ZITADEL session token from the password we just set, then redirecting through ZITADEL with that session in cookie/state — meaningful added complexity. The hacky version (ROPC) regresses the SPA security model.

This is the strongest argument for Option B.

## Password Policy Enforcement (Option C only)

For Option C, the frontend must show password rules at typing-time AND the backend must reject passwords that ZITADEL will reject (otherwise the user types, submits, hits "ZITADEL rejected your password," and re-types — bad UX).

**Recommended:** Server-side proxy validation that defers to ZITADEL on submit, plus a one-time policy fetch the frontend caches.

1. Backend exposes `GET /api/v1/public/invites/{token}/password-policy` that internally calls `GET /management/v1/policies/password/complexity` for the campaign's ZITADEL org and returns a sanitized JSON shape (`{minLength, hasNumber, hasSymbol, hasUppercase, hasLowercase}`).
2. Frontend renders rules and does inline validation against this shape (no app-side echo of business logic — just render the policy ZITADEL gave us).
3. On submit, backend forwards the password to ZITADEL's `POST /v2/users/{userId}/password`. If ZITADEL rejects (400 with policy violation in body), backend translates the error to a 422 with the violated rule.

**Do NOT** hard-code policy numbers in the frontend — they will drift from ZITADEL's actual policy if an operator changes settings.

For Option B this whole concern goes away — ZITADEL's hosted UI enforces policy with its own messages.

## Stack Additions Required

**None.**

| Need | Status |
|------|--------|
| HTTP client | `httpx>=0.28.1` already present |
| Async retry/backoff | Implement inline with `asyncio.sleep` — no `tenacity` needed |
| Idempotency keys | Not needed — search-then-create pattern (already in codebase) |
| Rate limiting (outbound) | Not needed at expected invite cadence |
| Rate limiting (inbound) | `slowapi>=0.1.9` already in use; reuse on new public endpoints |
| OIDC client (SPA) | `oidc-client-ts` already present in `web/package.json` |
| Email delivery | Mailgun seam in `app/services/invite_email.py` already in use |
| Job queue | `procrastinate>=3.7.3` already present (use only if init-code email needs async — but it already runs through `app/tasks/invite_tasks.py`) |

## Bootstrap Script Implications

| Change | Required For | Risk |
|--------|-------------|------|
| Set explicit password complexity policy on instance/default org | Both options (so policy is deterministic in dev) | LOW — additive `PUT /admin/v1/policies/password/complexity` modeled on existing `set_instance_login_policy` (`bootstrap-zitadel.py:388`) |
| Add `OIDC_GRANT_TYPE_PASSWORD` to SPA app's `grantTypes` | **Option C, ROPC variant only** | **HIGH** — SPA becomes a confidential client (needs secret) which is a security regression and contradicts existing `OIDC_AUTH_METHOD_TYPE_NONE` posture |
| Add a ZITADEL invitation message template (URL template baked into instance) | Option B if we let ZITADEL send the email; not needed if we use `returnCode` + Mailgun | LOW |

## Sources

- ZITADEL v2 Create Human User: https://zitadel.com/docs/guides/integrate/login-ui/username-password
- ZITADEL v2 Password Change/Reset: https://zitadel.com/docs/guides/integrate/login-ui/password-reset
- ZITADEL v1→v2 Migration (mentions invitation-code onboarding): https://zitadel.com/docs/apis/migration_v1_to_v2
- ZITADEL v2 sessions: https://zitadel.com/docs/guides/integrate/login-ui/username-password
- ZITADEL onboarding flows: https://zitadel.com/docs/guides/integrate/onboarding/end-users
- ZITADEL default settings (password complexity): https://zitadel.com/docs/guides/manage/console/default-settings
- oidc-client-ts ROPC + silent renewal: https://context7.com/authts/oidc-client-ts/llms.txt
- Existing in-repo patterns: `app/services/zitadel.py` (`_get_token`, `assign_project_role`, `ensure_project_grant`, 409-idempotency); `scripts/bootstrap-zitadel.py:102-117` (5xx retry), `:421-443` (v2 password set with `changeRequired=false`), `:131,447` (user search by username); `web/src/stores/authStore.ts` (oidc-client-ts UserManager configuration)

## B vs C — Stack Scorecard

| Criterion | Option B (ZITADEL invite_code) | Option C (App-owned setup page) | Lean |
|-----------|--------------------------------|----------------------------------|------|
| **Implementation cost (LOC, new libs)** | ~1 new ZitadelService method (`create_invite_code`), ~50 LOC backend total. **Zero frontend code** (ZITADEL hosts the UI). No new libs. | 4 new ZitadelService methods (`create_human_user`, `set_user_password`, `get_password_policy`, `find_user_by_email`), ~200 LOC backend, ~300 LOC frontend (setup page + form + validation + post-set login flow + error mapping). Zero new libs. | **B** (≈5x less code) |
| **ZITADEL endpoint stability** | One v2 endpoint (`/v2/users/{id}/invite_code`). v2 is GA, but this specific endpoint is the newest of the bunch — surfaced in 2.x as part of the new onboarding process. **MEDIUM-HIGH** | Three endpoints (`/v2/users/human`, `/v2/users/{id}/password`, `/management/v1/policies/password/complexity`). All long-standing GA in 2.71. **HIGH** | **C** (slightly older endpoints) |
| **Lock-in risk** | We bind to ZITADEL's hosted "set password" UI at `auth.civpulse.org`. Migration to a different IdP requires re-implementing this anyway. **MEDIUM** | We own the password-set form. Migration to a different IdP swaps the backend ZITADEL calls but the frontend page survives. **LOW**. ROPC variant adds **HIGH** lock-in to ROPC grant type which most modern IdPs deprecate. | **C (non-ROPC), tied (ROPC)** |
| **Auto-login UX after password set** | Via `urlTemplate` deep-link, ZITADEL completes setup and redirects to our app. ZITADEL session is established by ZITADEL itself; we just OIDC-callback. **Works out of the box.** | Either ROPC (security regression) or `POST /v2/sessions` integration (custom login UI complexity, ~300 more LOC). **Hard.** | **B** (decisive) |
| **Bootstrap-zitadel.py impact** | None required (optional: invitation message template) | None required for non-ROPC; **SPA confidentiality regression required for ROPC variant** | **B** (no risk) |
| **Password policy enforcement** | Entirely ZITADEL's responsibility | We must read policy + render rules + map errors back, or accept "submit-then-fail" UX | **B** |

### Recommended Lean

**Option B.** It is roughly 5x less code, requires no SPA security regression, gets auto-login for free via the `urlTemplate` deep-link, and fully delegates password policy to the system that owns it. The lock-in cost (ZITADEL hosts the password-set UI on `auth.civpulse.org`) is real but largely unavoidable — any IdP migration would need a re-implementation regardless.

**Pick Option C only if** there is a hard product requirement that the entire flow stays on `run.civpulse.org` (e.g. a brand reason that's worth the engineering cost), AND we accept implementing the v2 sessions integration to avoid ROPC.
