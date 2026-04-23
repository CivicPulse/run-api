# Domain Pitfalls — v1.19 Invite Onboarding

**Domain:** Multi-tenant invite acceptance flow with ZITADEL OIDC pre-provisioning
**Researched:** 2026-04-22
**Scope:** Comparison of Option B (user sets password via ZITADEL init-code UI) vs Option C (we set password ourselves and submit to ZITADEL)

Severity scale: 1 (cosmetic) → 5 (security breach or data corruption)
Option key: **B** = ZITADEL init-code flow, **C** = self-managed password flow, **both** = applies regardless

---

## 1. Security

### S1. Initial-password bypass of email verification (ZITADEL issue #10319)
- **Severity:** 5
- **Hits:** C only
- **What goes wrong:** When a ZITADEL user is created with an `initialPassword` set by the calling service, that user can authenticate without ever verifying their email. An attacker who compromises the invite link (or guesses an email + password we set) gains an authenticated session bound to an unverified email.
- **Why it happens:** ZITADEL's verification gate only fires for the init-code path; setting a password server-side short-circuits it. Tracked upstream as `zitadel/zitadel#10319`.
- **Prevention:** Choose Option B (init-code path), OR if Option C is mandated, force `email_verified=false` at creation, then require a separate explicit verification step before issuing the JWT and reject login until verified at the FastAPI session-exchange layer.
- **Phase:** Provisioning phase / decision gate before build

### S2. Email enumeration via response shape
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** Public invite-accept and "resend invite" endpoints return distinguishable responses (`404 user not found` vs `200 invite resent`) letting an attacker enumerate which emails belong to which campaigns.
- **Prevention:** Return a single neutral 202 response from public-facing accept/resend endpoints regardless of whether the email matched, and emit any actionable signal only via the email channel.
- **Phase:** Accept-flow phase, resend-flow phase

### S3. Email-mismatch account takeover
- **Severity:** 5
- **Hits:** both (worse on B because OIDC may auto-provision a different identity)
- **What goes wrong:** Inviter sends invite to `alice@org.com`. Recipient clicks, signs in to ZITADEL with `alice.personal@gmail.com` (already in ZITADEL). Invite is silently accepted under the wrong identity, granting org access to whoever holds the gmail.
- **Prevention:** Compare `id_token.email` against `invite.email` in the accept callback; if they differ, reject with a clear "this invite is for X, you signed in as Y" page and never auto-bind.
- **Phase:** Accept-flow phase

### S4. Invite token reuse / replay
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** Invite link forwarded, indexed by email-scanning AV, or logged in browser history is re-used after the legitimate recipient already accepted, creating a duplicate session or downgrading membership state.
- **Prevention:** Single-use `accepted_at` timestamp on the invite row checked under `SELECT FOR UPDATE` inside the accept transaction; reject any second use with 410 Gone.
- **Phase:** Accept-flow phase

### S5. CSRF on public invite endpoints
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** Public POST endpoints (resend, accept-confirm) accept any origin because they sit outside the authenticated session, letting a malicious page trigger invite resends or accept-actions on a victim's behalf.
- **Prevention:** Require an opaque single-use nonce embedded in the invite link to be echoed in any state-changing POST, and bind it to the invite row.
- **Phase:** Accept-flow phase, resend-flow phase

### S6. Service-account privilege escalation
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** Our ZITADEL Management API service-account is granted `IAM_OWNER` (default in many setups) when it only needs user/membership-write inside one org. A leaked PAT becomes a tenant-wide compromise.
- **Prevention:** Bind the service-account to the single CivicPulse organization with the minimum role (`ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR`), never `IAM_OWNER`, and rotate the PAT on each deploy.
- **Phase:** Provisioning phase / infra setup

### S7. Password-policy mismatch (Option C)
- **Severity:** 4
- **Hits:** C only
- **What goes wrong:** App-side validation accepts a password ZITADEL later rejects (or vice versa) — user gets a 400 from `SetPassword` after the UX flow already showed "success", leaving a half-provisioned account.
- **Prevention:** Fetch the active `PasswordComplexityPolicy` from ZITADEL at request time (cache 60s) and validate against that exact policy in the app before submission; never duplicate hard-coded rules.
- **Phase:** Password-set phase (Option C only)

---

## 2. UX

### U1. Email-mismatch dead-end
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** User accepts on the wrong account (see S3) and sees a confusing error with no recovery — they don't know whether to log out, re-invite, or contact admin.
- **Prevention:** When email mismatch is detected, render a page with three explicit actions: "Log out and try again", "Ask <inviter name> to re-send to <signed-in email>", "Contact support".
- **Phase:** Accept-flow phase

### U2. Expired init-link dead-end (72h TTL)
- **Severity:** 3
- **Hits:** both (more visible on B, since B's link IS the init code)
- **What goes wrong:** ZITADEL invite/init code TTL is fixed at ~72h and not configurable via Management API. After expiry the user lands on a generic ZITADEL error page with no path back into our app.
- **Prevention:** On every invite-accept route, check expiry first and route expired codes to our own "request a new link" page; never let users hit ZITADEL's bare error page.
- **Phase:** Accept-flow phase, expired-link recovery phase

### U3. Mobile autofill / password-manager breakage (Option C)
- **Severity:** 2
- **Hits:** C only
- **What goes wrong:** Password screens not built with proper `autocomplete="new-password"`, `name`, and form semantics break iOS Keychain and 1Password, causing volunteers on phones to abandon onboarding.
- **Prevention:** Use a single `<form>` with `autocomplete="new-password"`, visible username field with `autocomplete="username"`, and test against iOS Safari + Chrome Android in the e2e suite.
- **Phase:** Password-set phase (Option C only)

### U4. First-vs-second-campaign confusion
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** A user already in CivicPulse for Campaign A receives an invite for Campaign B. The accept flow either re-prompts for password (confusing, B) or silently joins without context-switch UI (confusing, both).
- **Prevention:** Detect existing user in accept handler and render "You're already a CivicPulse member — accept invite to <Campaign B>?" with an explicit confirm button; skip the password step entirely.
- **Phase:** Accept-flow phase

### U5. Inviter typo'd the email
- **Severity:** 2
- **Hits:** both
- **What goes wrong:** Invite sent to `alce@org.com` instead of `alice@org.com`. Currently no way for the inviter to fix it without re-issuing; `ResendInviteCode` is deprecated and `CreateInviteCode` won't change the underlying email.
- **Prevention:** Provide an "Edit email & re-send" action on the pending-invite row that voids the prior invite (sets `voided_at`) and creates a fresh invite + ZITADEL user; never mutate the existing one.
- **Phase:** Invite-management phase

### U6. Silent failure when ZITADEL Hosted Login is disabled
- **Severity:** 3
- **Hits:** B only
- **What goes wrong:** If the org disables ZITADEL's hosted login UI in favor of an embedded login, the init-code link 404s. Common in white-label setups.
- **Prevention:** Document that Option B requires Hosted Login enabled; validate at app startup by probing the `/ui/login` endpoint and refuse to start if Option B is selected without it.
- **Phase:** Provisioning phase

---

## 3. Operational

### O1. ZITADEL Management API rate limit (50 req/s, 429 response)
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** Bulk invite (e.g., 200 volunteers imported at once) sends >50 user-create calls per second and trips ZITADEL's 429, leaving partial state — half the users created, half not, and the seed process raises but doesn't roll back.
- **Prevention:** Enqueue every ZITADEL Management call through a single Procrastinate queue with a token-bucket limiter set to 40 req/s, and make the create-or-resync job idempotent on `email`.
- **Phase:** Provisioning phase, bulk-invite phase

### O2. Procrastinate retry storm on ZITADEL outage
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** ZITADEL goes down for 5min; Procrastinate retries every queued invite-send and email-send job with exponential backoff that defaults to short windows, hammering ZITADEL on recovery and double-sending invites.
- **Prevention:** Set `retry=RetryStrategy(max_attempts=5, wait=exponential, max_wait=600)` on all ZITADEL-touching tasks; and dedupe outbound emails by `(invite_id, attempt_no)` at the Mailgun adapter.
- **Phase:** Provisioning phase, email-send phase

### O3. Webhook reordering (Mailgun + ZITADEL events)
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** Mailgun `delivered` webhook arrives after `bounced` for the same message-id (out-of-order). State machine sets invite to `delivered` after we already marked it `bounced`, masking a real failure.
- **Prevention:** Apply webhook events as monotonic state transitions only — accept `delivered` only if current state is `queued|sent`, ignore otherwise; log skipped transitions with reason.
- **Phase:** Webhook-handling phase

### O4. Pre-existing pending invites at v1.19 deploy
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** Invites issued under v1.18 (no ZITADEL pre-provisioning) sit in `pending` state when v1.19 ships. New accept-flow assumes a ZITADEL user exists; old invites have none, causing 500 on click.
- **Prevention:** Ship a one-shot Alembic data migration that either (a) creates ZITADEL users for all pre-existing pending invites, or (b) marks them with `legacy_flow=true` and routes them through the v1.18 accept path; gate the new flow on this flag.
- **Phase:** Migration phase (must precede release)

### O5. "Clicked link but never completed setup" observability gap
- **Severity:** 3
- **Hits:** both (more acute on C, where there are 2-3 steps after the click)
- **What goes wrong:** Volunteers click the email, hit our landing page, then drop off at the password screen or ZITADEL handoff. Without per-step funnel logging we can't tell whether the email is broken, the link is broken, or the password screen is broken.
- **Prevention:** Emit structured events (`invite.link_clicked`, `invite.password_shown`, `invite.password_submitted`, `invite.zitadel_redirected`, `invite.completed`) keyed by invite_id; build a funnel query in the admin dashboard.
- **Phase:** Accept-flow phase, observability phase

### O6. Naive datetime regression
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** Migration 041 fixed `email_delivery_queued_at` and `email_delivery_sent_at` to be timezone-aware (PR #31). New invite-flow code paths that compute expiry, accepted_at, or webhook timestamps using `datetime.utcnow()` (naive) will re-introduce the bug.
- **Prevention:** Lint rule (`ruff` PLR or custom check) banning `datetime.utcnow()` and `datetime.now()` without `tz=`; require `datetime.now(UTC)` everywhere; add a unit test asserting all new datetime columns use `DateTime(timezone=True)`.
- **Phase:** Every phase touching the invite model

### O7. Provider-message-id bracket regression
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** v1.16 (PR #30) normalized Mailgun message-ids by stripping `<…>` brackets on store. New code paths storing ZITADEL user IDs, init-code references, or upstream identifiers alongside `provider_message_id` may store the bracketed form, breaking webhook lookup joins.
- **Prevention:** Apply the same strip-brackets-on-store pattern in a single shared helper (`normalize_external_id()`); use it for every external identifier persisted to the invite row.
- **Phase:** Provisioning phase, webhook-handling phase

### O8. ResendInviteCode deprecation
- **Severity:** 2
- **Hits:** both
- **What goes wrong:** Naively calling `ResendInviteCode` in the resend UX returns deprecation warnings and may stop working. `CreateInviteCode` is the supported replacement and *overwrites* the prior code (invalidating it).
- **Prevention:** Use `CreateInviteCode` for resend; communicate to the user that "the old link is now invalid" so they don't try to use a stale email.
- **Phase:** Resend-flow phase

---

## 4. Multi-tenant / RLS

### M1. Pre-created ZITADEL user logs in BEFORE accepting invite
- **Severity:** 5
- **Hits:** both (B and C both pre-create the ZITADEL user before the invite is accepted)
- **What goes wrong:** Once the ZITADEL user exists, they can log in to CivicPulse via OIDC even if they haven't clicked the invite link. Our session-exchange code paths that look up org/campaign membership will return an empty set — but if any code path (dashboard root, default-route resolver, RLS context middleware) lacks an explicit "no memberships → reject" guard, the user lands in an authenticated session with empty tenant context, potentially bypassing row-level filters that assume `current_org_id IS NOT NULL`.
- **Prevention:** In the OIDC-callback handler, if the authenticated user has zero campaign memberships, redirect to a hard "/accept-invite" gate page; never set the session cookie unless at least one membership row exists. Add an integration test asserting an empty-membership login returns 302 to the gate, never 200.
- **Phase:** Auth-callback phase, RLS-context phase

### M2. Cross-org invite breaks current-org switch
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** User is currently signed in to Org A; they accept an invite to Org B in another tab. The frontend's cached `currentOrgId` and TanStack-Query cache are stale, causing API calls in Org A's tab to write Org B's data (or vice versa).
- **Prevention:** On invite-accept success, broadcast a `BroadcastChannel('org-membership')` event that forces every open tab to invalidate the membership query and re-resolve current org from the server; fall back to a full page reload if BroadcastChannel is unavailable.
- **Phase:** Accept-flow phase, frontend session phase

### M3. RLS context not set for public accept endpoint
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** The accept endpoint runs *before* the user has an org context, so the request-scoped `SET LOCAL app.current_org_id` middleware has nothing to set. Any helper that assumes the GUC is present will raise (or worse, default to `NULL` and bypass RLS).
- **Prevention:** Mark the accept endpoint explicitly as `tenant_scope=public` in the middleware and use a dedicated DB session that runs with the service role (limited to the `invites` and `users` tables only); never reuse the standard tenant session.
- **Phase:** Accept-flow phase, middleware phase

---

## 5. ZITADEL-specific

### Z1. Init-code TTL is fixed at ~72h (not configurable)
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** Cannot extend the 72h TTL via Management API. Volunteers invited Friday can't accept Tuesday.
- **Prevention:** Set our own application-side invite TTL longer (e.g., 14 days), and on accept, if our invite is valid but the ZITADEL init code expired, transparently call `CreateInviteCode` to mint a fresh one before redirecting.
- **Phase:** Accept-flow phase

### Z2. ResendInviteCode deprecated
- **Severity:** 2
- **Hits:** both
- See O8 above for prevention. Listed here for completeness.
- **Phase:** Resend-flow phase

### Z3. Service-account least-privilege
- **Severity:** 4
- **Hits:** both
- See S6 above. Listed here for ZITADEL-domain visibility.
- **Phase:** Infra setup phase

### Z4. Project-grant ordering (user must exist + grant + role before login works)
- **Severity:** 4
- **Hits:** both
- **What goes wrong:** ZITADEL requires three sequential calls — `AddHumanUser`, `AddUserGrant` (binding to the project), `AddUserMembership` (role on the org/project). If any of the three fails after the prior succeeds, login produces a confusing "user has no projects" error rather than a clear retry path.
- **Prevention:** Wrap all three in a single Procrastinate task with a saga-style cleanup: on partial failure, delete the ZITADEL user and re-raise so the retry starts clean; never leave a half-provisioned user.
- **Phase:** Provisioning phase

### Z5. Password-policy mismatch (Option C)
- **Severity:** 4
- **Hits:** C only
- See S7 above. Listed here for ZITADEL-domain visibility.
- **Phase:** Password-set phase (Option C)

### Z6. ZITADEL user metadata vs CivicPulse user.id divergence
- **Severity:** 3
- **Hits:** both
- **What goes wrong:** We store `zitadel_user_id` on our `users` row. If a user is deleted in ZITADEL and re-created, the `sub` claim changes; our row points to a dead ID and login creates a duplicate row.
- **Prevention:** Treat email as the join key on OIDC callback; on `sub` mismatch, update `zitadel_user_id` in place rather than creating a new row, and log the change as an audit event.
- **Phase:** Auth-callback phase

---

## Phase-Specific Warnings

| Phase | Pitfalls to address |
|-------|--------------------|
| Provisioning | S1, S6, O1, O7, Z3, Z4 |
| Migration (must precede release) | O4 |
| Email template & send | O2, O6 |
| Accept-flow | S2, S3, S4, S5, U1, U2, U4, M1, M2, M3, Z1, Z6 |
| Password-set (Option C only) | S1, S7, U3, Z5 |
| Resend-flow | S2, S5, U5, O8, Z2 |
| Webhook-handling | O3, O7 |
| Observability | O5 |
| Every phase touching invite model | O6 |

---

## B vs C — Pitfall Surface

Counts deduplicated (S7 and Z5 are the same finding, listed in two categories; counted once below):

| Bucket | Pitfalls | Count | Severity sum |
|--------|----------|-------|--------------|
| **B-only** | U6 | 1 | 3 |
| **C-only** | S1, S7/Z5, U3 | 3 | 5 + 4 + 2 = **11** |
| **Both** | S2, S3, S4, S5, S6, U1, U2, U4, U5, O1, O2, O3, O4, O5, O6, O7, O8, M1, M2, M3, Z1, Z2, Z4, Z6 | 24 | ~80 |

### Conclusion

**Option C inherits 3 distinct additional pitfalls totaling +11 severity points** that Option B does not face:

1. **S1 (severity 5)** — ZITADEL issue #10319: setting `initialPassword` bypasses email verification. This alone is disqualifying unless we add an explicit, separate verification gate at the FastAPI layer before issuing a session — which defeats most of the "seamless UX" rationale for choosing C.
2. **S7 / Z5 (severity 4)** — We become responsible for keeping app-side password validation in sync with ZITADEL's `PasswordComplexityPolicy`, a recurring drift hazard on every ZITADEL upgrade.
3. **U3 (severity 2)** — Mobile autofill / password-manager surface area is entirely on us; ZITADEL's hosted UI gets these semantics right by default.

**Option B has exactly one unique pitfall (U6, severity 3)** — it requires the ZITADEL Hosted Login UI to be enabled, a one-time deployment-config check that we already meet today.

**Plain-English recommendation:** Option B's pitfall surface is materially smaller and shifts the password-handling, verification, and mobile-UX risk to ZITADEL where it belongs. Option C should only be chosen if there is a hard product requirement that the user *never* leaves our domain — and even then, S1 must be mitigated with an explicit verification step that erases the UX advantage that motivated choosing C in the first place.
