# SUMMARY.md — v1.19 Invite Onboarding Research Synthesis

**Project:** CivicPulse Run — v1.19 Invite Onboarding
**Domain:** Multi-tenant SaaS invite onboarding with ZITADEL OIDC pre-provisioning
**Researched:** 2026-04-22
**Overall confidence:** HIGH on stack/architecture/pitfalls; MEDIUM on one ZITADEL behavior (`urlTemplate` deep-link) that gates the recommendation

---

## Recommendation

**Ship Option B (ZITADEL `invite_code` flow), gated on a Phase-111 spike that verifies ZITADEL's `urlTemplate` reliably deep-links the invitee back to `/invites/<token>` after password set.**

All four research workstreams converged on B independently:

| Axis | Option B | Option C |
|------|----------|----------|
| Implementation cost | ~50 LOC, 1 new ZitadelService method, 0 new frontend routes | ~500 LOC, 4 new ZitadelService methods, 1 route + form + handoff logic |
| New backend endpoints | 0 (1 optional admin resend) | 1 required (`/register`) + 1 optional (`/password-policy`) |
| Pitfall surface (unique) | 1 pitfall, severity 3 (U6 — Hosted Login must stay enabled; we already meet this) | 3 pitfalls, +11 severity points (S1 sev-5 email-verification bypass per ZITADEL #10319; S7/Z5 sev-4 password-policy drift; U3 sev-2 mobile autofill) |
| Auto-login after setup | Free via ZITADEL's `urlTemplate` redirect — ZITADEL establishes the session itself | Either ROPC (SPA security regression — disqualifying) or v2 Sessions API integration (~300 more LOC) or accept a second password entry |
| SPA bootstrap impact | None | None for non-ROPC; **adds `OIDC_GRANT_TYPE_PASSWORD` + `client_secret` to the SPA** if ROPC chosen |
| Brand control of password page | ZITADEL hosted at `auth.civpulse.org` (loses contextual "join Mayor Smith" framing) | Full control on `run.civpulse.org` |

**Spike contingency.** The `urlTemplate` placeholder behavior (`{{.UserID}}`, `{{.Code}}`, `{{.LoginName}}`, `{{.OrgID}}`) is documented but the deep-link UX has not been verified end-to-end against our 2.71.x instance. Phase 111 is a one-day spike: call `CreateInviteCode` with our templated URL, click through ZITADEL's hosted setup, confirm the redirect lands an authenticated user on `/invites/<token>`. If the spike fails, fall through to **Option C non-ROPC** (either redirect handoff with `login_hint=<email>` and accept the second password entry, or invest in the v2 Sessions API to mint a session token from the just-set password). **ROPC is explicitly out of scope** under any branch — adding `OIDC_GRANT_TYPE_PASSWORD` and a `client_secret` to a public SPA is a security regression, contradicts our existing `OIDC_AUTH_METHOD_TYPE_NONE` posture, and is deprecated in OAuth 2.1.

---

## Stack Additions

**None.** No new `pyproject.toml` entries are required for either branch.

| Need | Existing seam |
|------|---------------|
| HTTP client | `httpx>=0.28.1` already used by `ZitadelService` |
| Service-account JWT cache | `ZitadelService._get_token` (`app/services/zitadel.py`) — refresh on 60s-before-expiry, cached |
| Idempotency | Search-then-create pattern already used in `ensure_project_grant` and `bootstrap-zitadel.py:131,447` |
| Async retry/backoff | Inline `asyncio.sleep` mirroring `bootstrap-zitadel.py:102-117` (3x with exponential 1/2/4s on 5xx + connect/timeout) — no `tenacity` |
| Inbound rate limiting | `slowapi` already in use; reuse for any new public endpoint |
| Email delivery | `app/services/invite_email.py` + `app/tasks/invite_tasks.py` — durable, post-commit, Procrastinate-queued |
| Job queue | `procrastinate>=3.7.3`, `communications` queue already in use |
| Frontend OIDC | `oidc-client-ts` already configured in `web/src/stores/authStore.ts` with PKCE Authorization Code flow |

**New `ZitadelService` methods** (Option B):

1. `ensure_human_user(email, given_name, family_name, org_id) -> str` — search-then-create, mirrors `ensure_project_grant`. Sets `email.isVerified=true` (the invite token is the email-ownership proof — documented ZITADEL pattern).
2. `create_invite_code(user_id, url_template) -> str` — POSTs to `/v2/users/{userId}/invite_code` with `{"returnCode": {}}` so we email it via Mailgun (keeps deliverability under our DMARC/SPF) and bake the invite token literally into the `urlTemplate`: `https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`.

That's it on the backend service surface for the Option-B happy path.

---

## Feature Table-Stakes (must ship for v1.19 to be "not broken")

In priority order — these are the gate-to-merge bar:

1. **Pre-provisioned ZITADEL identity at invite-creation time.** `ensure_human_user` at email-task start, write `zitadel_user_id` onto the Invite row.
2. **Working set-password flow.** Option B: ZITADEL hosted UI via `invite_code`; redirect lands user on `/invites/<token>` authed. Option C fallback: app-owned setup page with non-ROPC OIDC handoff.
3. **Idempotent re-invite.** Re-inviting an existing email MUST NOT create a duplicate ZITADEL user or 409 to the admin. Search by login-name (lowercased email) first; only `CreateUser` on miss.
4. **Email-already-has-account branch.** First-time email vs returning email — keyed off "does ZITADEL know this email?" computed at queue time. Returning users get the v1.18 "Accept your invite" template, no setup-link.
5. **Email-match enforcement on accept.** Already enforced (`accept_invite` is case-insensitive). Keep — prevents User-A accepting a forwarded invite addressed to User-B.
6. **Single-use invite + single-use init code.** Both layers stay single-use; existing `accepted_at` timestamp under `SELECT FOR UPDATE` is the right primitive.
7. **Expired-link recovery.** ZITADEL init-code TTL is fixed at ~72h and not extendable (Z1). Our application invite TTL is 7d (`INVITE_EXPIRY_DAYS`). The two TTLs WILL diverge — when the user's invite is still valid but the init code has expired, **transparently call `CreateInviteCode` again on the accept-flow read path** to mint a fresh code, rather than dead-ending at ZITADEL's bare error page (U2). Pair this with a "Request a fresh invite" button on the expired-invite UI that emails the campaign admins.
8. **Defensive `/login` interstitial when bounced with `?redirect=/invites/...`.** Today's `/login` is a 4-line "Redirecting…" screen; render a brief "You're signing in to accept your invite to <campaign>" pre-redirect message so a user bounced through `/login` from a stale session is not stranded.
9. **Empty-membership login gate (M1).** A user who completes setup but has not yet clicked Accept can log in. The OIDC-callback handler MUST redirect zero-membership users to `/accept-invite` and never set the session cookie with empty tenant context. Add an integration test asserting empty-membership login returns 302 to the gate, never 200.

Defer to v1.20+: passkey enrollment (Differentiator #2 — one of the strongest *for* arguments for B but not table stakes), magic-link passwordless, multi-pending-invite dashboard, lost-link "find my invite by email" recovery, post-onboarding MFA nudges.

---

## Watch Out For (top 7 by severity)

| # | Pitfall | Sev | Hits | Prevention |
|---|---------|-----|------|------------|
| 1 | **M1 — Pre-created ZITADEL user logs in BEFORE accepting invite** | 5 | both | OIDC-callback handler: zero memberships → 302 to `/accept-invite` gate, never set the session cookie. Integration test required. |
| 2 | **S3 — Email-mismatch account takeover** | 5 | both | In accept callback, compare `id_token.email` vs `invite.email` (case-insensitive). On mismatch, refuse with explicit "this invite is for X, you signed in as Y" page. Already partially in `invite.py:202-205` — keep + extend to render a 3-action recovery page (logout / ask re-send / contact). |
| 3 | **S1 — Initial-password bypasses email verification (ZITADEL #10319)** | 5 | C only | **Ship Option B.** If the spike forces Option C, force `email_verified=false` at creation and require an explicit verification step at the FastAPI session-exchange layer before issuing a JWT — but this defeats most of C's UX promise. |
| 4 | **O4 — Pre-existing pending invites at v1.19 deploy will 500 the new accept flow** | 4 | both | **One-shot data migration must precede release.** See "Migration / Rollout" below. Without this, every pre-v1.19 pending invite breaks on click. |
| 5 | **S4 — Invite token reuse / replay** | 4 | both | Single-use `accepted_at` timestamp checked under `SELECT FOR UPDATE` inside the accept transaction; second use → 410 Gone. Already largely in place — verify the `FOR UPDATE` lock on the read. |
| 6 | **O6 — Naive datetime regression** | 4 | both | Recent PR #31 fixed `email_delivery_{queued,sent}_at` to be tz-aware. New columns (`identity_provisioning_at`, etc.) MUST use `DateTime(timezone=True)` and `datetime.now(UTC)` — never `datetime.utcnow()`. Add a ruff rule and a unit test. |
| 7 | **Z4 — Project-grant ordering (user + grant + role must succeed atomically)** | 4 | both | Wrap `AddHumanUser → AddUserGrant → AddProjectRole` in one Procrastinate task with saga-style cleanup: on partial failure, deactivate (or delete) the half-provisioned ZITADEL user and re-raise so the retry starts clean. |

Honorable mention: **O1 (severity 4)** — ZITADEL Management API is rate-limited (~50 req/s). Bulk re-invite scenarios should funnel through a single Procrastinate queue with a token-bucket limiter at 40 req/s. Not a v1.19 blocker (we don't bulk-invite today), but the new provisioning task should be designed so adding the limiter later is one-line.

---

## Build-Order Sketch (Option B, continuing from Phase 110)

**Phase 111 — `urlTemplate` spike + ZITADEL Service Surface**
- Spike: hand-craft a `CreateInviteCode` call against the dev ZITADEL with our templated URL; verify deep-link redirect lands at `/invites/<token>` with a fresh OIDC session.
- If spike succeeds, proceed to Phase 112. If spike fails, replan as Option C non-ROPC (add Phase 111b for `/register` endpoint + setup page).
- Ship: `ZitadelService.ensure_human_user`, `ZitadelService.create_invite_code`, unit tests with mocked httpx, the search-then-create idempotency pattern, the bounded 5xx retry. No DB changes yet beyond adding `zitadel_user_id` lookup capability to the service.
- Confirm service-account least-privilege scope: the PAT we use must have `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR` on the CivicPulse org, NOT `IAM_OWNER` (S6/Z3).

**Phase 112 — Schema migration + invite-row provisioning columns**
- Alembic migration: add `zitadel_user_id`, `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at` to `invites`. All datetimes `DateTime(timezone=True)`.
- One-shot data migration for O4 (see "Migration / Rollout" below) lives in this same Alembic revision.

**Phase 113 — Provisioning step in the email task**
- Extend `send_campaign_invite_email` (`app/tasks/invite_tasks.py`) with `if invite.zitadel_user_id is None:` guard → call new `app/services/identity_provisioning.py::ensure_zitadel_identity_for_invite(session, invite, campaign)`. Writes outcome to invite row; raises on hard failure so Procrastinate retries the whole task.
- Idempotent across retries because: queueing-lock per invite (already used at `invite.py:163`), DB partial-unique-index on pending invites, search-then-create at the ZITADEL boundary.
- Branch first-time vs returning email content here, off the `ensure_human_user` "did we just create them?" signal.
- Integration tests: ZITADEL stub down → task retries with backoff; ZITADEL up → user provisioned, code generated, email queued; revoke-between-provision-and-email → existing skip path at `invite_tasks.py:44-49` honored.

**Phase 114 — Frontend confirmation + `/login` interstitial**
- Verify `/invites/<token>` already handles "user just landed authed via ZITADEL redirect" — should be no-op since oidc-client-ts picks up the fresh session.
- Update `/login` to render the bounced-with-`?redirect=/invites/...` interstitial (Table-Stakes #8).
- Add the empty-membership gate in the OIDC callback (Pitfall M1) with integration test.
- Playwright E2E via `web/scripts/run-e2e.sh`: full create-invite → email-link → ZITADEL hosted setup → land on `/invites/<token>` → Accept → land on campaign.

**Phase 115 — Resend + expired-link recovery + observability**
- `POST /api/v1/invites/{id}/resend` admin endpoint (re-calls `create_invite_code`, which invalidates the prior code per ZITADEL docs — communicate this to the admin/user).
- "Request a fresh invite" button on the expired-invite frontend state, hitting a new public rate-limited endpoint that emails the campaign admin team (no captcha — invite token is the gate; per-token + per-IP rate limit only).
- Transparent re-mint of expired init codes when our invite is still valid (Z1 / U2).
- Structured funnel events: `invite.link_clicked`, `invite.password_shown`, `invite.password_submitted`, `invite.zitadel_redirected`, `invite.completed` (O5).
- Confirm `current_org_id` GUC handling for the public accept path is `tenant_scope=public` and uses a service-role DB session limited to `invites` + `users` (M3).

---

## Migration / Rollout

**O4 is a release blocker.** Pre-v1.19 pending invites have no ZITADEL identity. The new accept flow assumes `invite.zitadel_user_id IS NOT NULL` — old invites will 500 on click.

Options (pick one in Phase 112):

1. **Backfill ZITADEL users for all pending invites at migration time.** Alembic data migration iterates `Invite WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, calls `ensure_human_user` for each. Rate-limit at 40 req/s to stay under ZITADEL's 50 req/s ceiling (O1). Pros: every pending invite "just works" after deploy. Cons: migration is now non-trivial and ZITADEL-coupled — if ZITADEL is unreachable during deploy, migration fails and rollback is complex.

2. **Mark pre-existing pending invites with `legacy_flow=true` and route them through the v1.18 dead-end behavior with the new "request a fresh invite" CTA.** Pros: migration is a pure SQL `UPDATE`. Pre-existing invitees get the recovery path explicitly. Cons: the bug we're fixing persists for those users until they request a fresh invite.

**Recommendation:** Option 2. Pre-v1.19 pending invites are a small, finite, decaying set (most are within their 7-day TTL window of when they were issued). The recovery path we're already shipping for expired links handles them naturally, and avoids a deploy-time ZITADEL dependency. Document the operational runbook for ops to manually re-invite anyone who reports being stuck.

**Pre-deploy checklist:**

- [ ] Service-account PAT confirmed scoped to `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR` on the CivicPulse org (not `IAM_OWNER`)
- [ ] ZITADEL Hosted Login UI confirmed enabled on the prod org (probe `/ui/login` at app startup)
- [ ] Mailgun DKIM/SPF/DMARC confirmed (we send the init-code email ourselves via `returnCode`, so deliverability is on us — already in place from v1.16)
- [ ] Empty-membership login gate integration test green
- [ ] `urlTemplate` spike on the prod-equivalent ZITADEL instance shows deep-link works (not just dev)
- [ ] Alembic data migration for O4 dry-run on a prod snapshot
- [ ] All new datetime columns are `DateTime(timezone=True)` (lint check passes)

---

## Open Contingencies

These need resolution during planning, not after:

1. **`urlTemplate` deep-link behavior** (gates the entire recommendation)
   - Spike in Phase 111. If the redirect arrives at `/invites/<token>` with a usable OIDC session in oidc-client-ts, ship Option B. If not, fall through to Option C non-ROPC.
   - Confidence today: MEDIUM. Docs are sparse on the exact placeholder semantics and whether the redirect carries an established session cookie at `auth.civpulse.org` to the SPA at `run.civpulse.org`.

2. **ZITADEL service-account scope confirmation**
   - The bootstrap script (`bootstrap-zitadel.py`) creates the service account but doesn't pin its role explicitly. Confirm against the running prod org that the PAT is scoped to org-user-management only, not `IAM_OWNER`. If it's `IAM_OWNER` today, narrow it as part of Phase 111 (Pitfall S6/Z3).

3. **Exact init-code TTL on our ZITADEL 2.71.x instance**
   - Pitfall research cites ~72h based on docs, but the value is not configurable via Management API and may differ across versions. Confirm with a one-line test: create an invite code, query its `expirationDate` field on the response. Drives the precise threshold for the "transparently re-mint expired init code" logic in Phase 115.

4. **Optional: invitation message template registration in ZITADEL**
   - We're emailing the init link ourselves via Mailgun (`returnCode`), so we do NOT need to register an invitation message template in ZITADEL for the happy path. Decide explicitly whether to also register one as a belt-and-suspenders fallback (would let us swap to ZITADEL-sent emails without code changes). Recommendation: defer — adds operational surface for negligible benefit.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All ZITADEL endpoints confirmed against v2.71 docs; existing in-repo patterns (`_get_token`, `ensure_project_grant`) directly transferable; no new libs |
| Features | HIGH | Table-stakes triangulated against Postmark, Clerk, WAI/Atomic A11y guidance; differentiator vs anti-feature distinction clear |
| Architecture | HIGH | Recommendation slots cleanly into the v1.16 invite-delivery shape (post-commit defer, queueing lock, status columns on Invite); no new patterns introduced for Option B |
| Pitfalls | HIGH on enumeration; MEDIUM on severity-of-blast-radius for some operational pitfalls | ZITADEL #10319 verified upstream; M1 (pre-created user can log in) is the most subtle finding and deserves explicit test coverage |
| `urlTemplate` deep-link behavior | **MEDIUM — the one gating gap** | Drives the Phase 111 spike |

---

## Sources

Aggregated from the four research workstreams. See individual files for full citation lists.

- ZITADEL v2 user APIs: https://zitadel.com/docs/guides/integrate/login-ui/username-password
- ZITADEL v1→v2 migration (invitation-code onboarding): https://zitadel.com/docs/apis/migration_v1_to_v2
- ZITADEL onboarding end-users guide: https://zitadel.com/docs/guides/integrate/onboarding/end-users
- ZITADEL CreateInviteCode reference: https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateInviteCode
- ZITADEL CreateUser reference: https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateUser
- ZITADEL password reset: https://zitadel.com/docs/guides/integrate/login-ui/password-reset
- ZITADEL default settings (password complexity): https://zitadel.com/docs/guides/manage/console/default-settings
- ZITADEL issue #10319 (initial-password bypasses email verification): https://github.com/zitadel/zitadel/issues/10319
- ZITADEL issue #8310 (Invite User Link semantics): https://github.com/zitadel/zitadel/issues/8310
- oidc-client-ts ROPC + silent renewal: https://context7.com/authts/oidc-client-ts/llms.txt
- Clerk invitations docs: https://clerk.com/docs/users/invitations
- Postmark user-invitation email best practices: https://postmarkapp.com/guides/user-invitation-email-best-practices
- W3C WAI accessible password example: https://www.w3.org/WAI/tutorials/forms/examples/password/
- Atomic A11y password input checklist: https://www.atomica11y.com/accessible-web/password-input/
- Existing in-repo patterns: `app/services/zitadel.py` (`_get_token`, `assign_project_role`, `ensure_project_grant`), `scripts/bootstrap-zitadel.py:102-117,131,447`, `app/tasks/invite_tasks.py`, `app/services/invite.py:83-97,99-113,148-174,202-205`, `web/src/stores/authStore.ts`
