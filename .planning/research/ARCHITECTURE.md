# Architecture Research: v1.19 Invite Onboarding

**Domain:** Where ZITADEL programmatic user provisioning fits inside the existing FastAPI + Procrastinate + ZitadelService stack
**Project:** CivicPulse Run
**Researched:** 2026-04-22
**Scope:** Q1–Q5 from the spawn brief. Both Option B (ZITADEL `invite_code` flow) and Option C (app-owned `/invites/<token>/setup` page) are addressed; Option B is favored downstream of STACK.md but the architecture is given honest treatment for both.

---

## Q1. Where does `create_human_user` belong?

### Recommendation: **(b) — async on the `communications` queue**, with one tweak.

Specifically: a **new Procrastinate task** `provision_invite_identity` on the `communications` queue, queued immediately after invite commit, that **chains into** `send_campaign_invite_email` only on success. Email sending becomes downstream of identity provisioning, not parallel to it.

### Rationale by option

**(a) Synchronous inside `create_invite`** — REJECTED.
- Fails the existing v1.16 contract that invite-creation is durable-then-deliver. Today `create_invite` commits the invite row, *then* `enqueue_invite_email` updates delivery state and defers the email (`app/services/invite.py:99-113, 148-174`). A synchronous ZITADEL call inside `create_invite` re-introduces a foreign-system blocker on the request path that v1.16 deliberately removed for email.
- Failure mode: ZITADEL slow/down → admin's "Send invite" button spins for 15s then errors. Admin retries, may create a duplicate invite (the existence check at `invite.py:83-97` only catches *pending* invites — but if the first attempt rolled back the invite *and* a partial ZITADEL user lingers, idempotency now lives across two systems with no durable handoff).
- Failure mode: ZITADEL succeeds, then DB commit fails → orphaned ZITADEL user. We have no compensating tx today.
- The only argument for (a) is "fail fast so the admin sees the error." That argument is weaker than it looks: the admin already cannot tell from the create response whether the email was delivered (that's async). Adding partial sync provisioning makes the failure surface more confusing, not less.

**(b) Pure async on `communications`** — RECOMMENDED.
- Matches v1.16's invite-delivery shape exactly: invite commits → defer task → task is durable, retryable, observable via `email_delivery_status` + (new) `identity_provisioning_status` columns on `Invite`.
- Failure mode: ZITADEL down → Procrastinate retries with backoff (already configured for the queue). Invite row exists with `identity_provisioning_status="failed"` after exhausted retries; admin pending-invites table (v1.16) surfaces it; admin retries via the resend button. No data loss.
- Failure mode: ZITADEL succeeds, email send fails → next attempt of the email task no-ops the user-create (because the `provision_identity` step already wrote the `zitadel_user_id` onto the Invite row). Idempotent by construction.
- Failure mode: invite revoked between provision and email → email task skip-path (`invite_tasks.py:44-49`) already handles this; just extend it to also skip provisioning if revoked first.
- **The required tweak:** today the email task and provisioning task are conceptually one job. Splitting them as two independent queue items risks email being sent before the ZITADEL user exists (Option B's invite-code link would 404 at ZITADEL). Use **task chaining**: `provision_invite_identity` is enqueued first; on success it enqueues `send_campaign_invite_email`. Or, simpler and what I'd ship: **fold the provisioning step into the start of `send_campaign_invite_email`** (one new function call, guarded by an `if invite.zitadel_user_id is None:` check). One queue item, one durable retry envelope, no chaining gymnastics.

**(c) Hybrid (sync user-create, async email)** — REJECTED.
- All the failure surface of (a) for the user-create, and none of the recovery affordances of (b). The split also creates a new failure mode unique to the hybrid: user-create succeeds, request handler crashes before deferring the email → orphaned ZITADEL user with no email ever sent. (b) does not have this hole.

### Concrete shape (recommended)

```python
# app/tasks/invite_tasks.py
@procrastinate_app.task(name="send_campaign_invite_email", queue="communications")
async def send_campaign_invite_email(*, invite_id: str, campaign_id: str) -> None:
    async with async_session_factory() as session:
        await set_campaign_context(session, campaign_id)
        invite = await session.get(Invite, uuid.UUID(invite_id))
        # ... existing skip / expiry checks ...

        # NEW: ensure ZITADEL identity exists before we can send the link.
        if invite.zitadel_user_id is None:
            await ensure_zitadel_identity_for_invite(session, invite, campaign)
            # writes invite.zitadel_user_id, commits, raises on hard failure
            # so Procrastinate retries the whole task

        # Option B: also generate and stash the invite code (or have the email
        # template fetch a fresh one each time — see Q2).
        # ... existing email send path, now with init_url in template context ...
```

`ensure_zitadel_identity_for_invite` lives in a new `app/services/identity_provisioning.py` (tight scope, easy to test), is fully idempotent (Q2), and writes its outcome onto the `invite` row before returning. The email task is the single durable retry boundary.

### Fit with v1.16 pattern

This *is* the v1.16 pattern: delivery-status columns on `Invite`, post-commit `defer_async`, queueing_lock per invite, status visible in admin pending-invites UI. We are extending the same shape with a sibling concern (identity provisioning) rather than adding a parallel one. Status on the Invite row gets one new column family: `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at`, mirroring the `email_delivery_*` columns from v1.16/v1.17.

---

## Q2. Idempotency — where does it live?

### Recommendation: **All three layers, each doing one job.**

| Layer | Responsibility | Why we need it |
|-------|---------------|----------------|
| Procrastinate `queueing_lock="invite-provision:{invite.id}"` | Prevents double-enqueue from concurrent admin clicks / retries within the request | Already used at `invite.py:163` for email; mirror exactly |
| DB constraint on `Invite (campaign_id, email, accepted_at IS NULL, revoked_at IS NULL)` | Prevents two pending invites for the same email+campaign | Already enforced by the existence check at `invite.py:83-97`; v1.17 may have promoted it to a partial unique index — verify and keep |
| `ZitadelService.ensure_human_user(email)` — search-then-create at the service boundary | Prevents duplicate ZITADEL users across re-invites in *different* campaigns, and across Procrastinate retries that may run after a partial success | The proven pattern (`bootstrap-zitadel.py:131,447` and `ensure_project_grant` at `zitadel.py:463`) |

### Why all three (not "just one")

Each layer catches a different race:

1. **Queueing lock** catches the in-process race: admin clicks "Send invite" twice in 200ms, or the request handler crashes between defer and commit and the retry path fires. Without it, two tasks run concurrently and both try to provision.
2. **DB constraint** catches the cross-request race at the right semantic level: "you already have a pending invite for this person in this campaign — refuse." This is a business-rule guard, not an idempotency guard, but it usefully prevents the case where the invitee gets two emails for the same campaign.
3. **Search-then-create at the ZITADEL boundary** catches the cross-campaign case (Bob is invited to Campaign A, accepts, then is invited to Campaign B — must not create a second ZITADEL user) AND the cross-retry case (provisioning task ran, succeeded at ZITADEL, crashed before writing `invite.zitadel_user_id`, retries — must not create a second user). DB constraints can't catch this because each invite row is legitimately distinct; the dedup must happen at the ZITADEL identity boundary.

### The `ensure_human_user` shape (mirrors `ensure_project_grant`)

```python
# app/services/zitadel.py
async def ensure_human_user(
    self,
    *,
    email: str,
    given_name: str,
    family_name: str,
    org_id: str | None = None,
) -> str:
    """Return ZITADEL userId for email, creating the user if absent."""
    # 1) Search first — cheap, avoids 409 noise in metrics
    existing_id = await self._find_user_by_email(email, org_id=org_id)
    if existing_id is not None:
        return existing_id
    # 2) Create. On 409 (race lost to a concurrent caller), re-search and return.
    try:
        return await self._create_human_user(email, given_name, family_name, org_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (409, 400) and _is_already_exists(exc):
            existing_id = await self._find_user_by_email(email, org_id=org_id)
            if existing_id:
                return existing_id
        raise
```

Search-then-create > create-then-409-fallback because email-uniqueness lookups are cheap and the search-first path keeps the happy path quiet in logs/metrics. `ensure_project_grant` uses create-first because grants are rarely re-created; users-by-email are commonly re-checked.

---

## Q3. New endpoints needed

### Option B — **Zero new endpoints required.**

The init-link in the invite email points at ZITADEL's hosted password-set page (origin: `auth.civpulse.org`). After password-set, ZITADEL redirects to the `urlTemplate` we registered — which should be `https://run.civpulse.org/invites/{{.InviteToken}}` (we pass our invite token through ZITADEL's URL template machinery so the user lands on the *existing* `/invites/$token` route already authenticated, and clicks Accept).

Note: ZITADEL's default `urlTemplate` placeholders are `{{.UserID}}`, `{{.LoginName}}`, `{{.Code}}`, `{{.OrgID}}` — there is **no `{{.InviteToken}}` placeholder out of the box**. Two fixes either of which works:

- **(b1)** Persist a sidecar lookup `zitadel_user_id → invite_id` (or just put `zitadel_user_id` on Invite as recommended in Q1, then query by it on the landing page) and template the URL as `https://run.civpulse.org/invites/zitadel-callback?userID={{.UserID}}&code={{.Code}}`. Add a small `/invites/zitadel-callback` route on the frontend that POSTs to a new `GET /api/v1/public/invites/by-zitadel-user/{user_id}` lookup → 302s to `/invites/<token>`. **One new lookup endpoint.**
- **(b2)** Bake the invite token into the `urlTemplate` at `CreateInviteCode` time as a literal: `https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`. Per ZITADEL docs the URL template is per-invite, so we can substitute our own values *into the template string itself* before sending it. **Zero new endpoints.** This is the cleaner path and what I'd ship.

So Option B's frontend lands at the existing `/invites/$token` route, which already has the "Accept invite" UX. We just need that route to:
- detect the user is now authenticated (oidc-client-ts session is fresh from the ZITADEL redirect)
- and behave exactly as it does today for an authed user clicking Accept.

No backend endpoint changes for Option B. (Optional: a `POST /api/v1/invites/{id}/resend` admin endpoint for the v1.16 admin pending-invites table, which would re-call `CreateInviteCode` — but that's strictly the resend feature, not Option B itself.)

### Option C — One new endpoint, plus a policy-fetch endpoint.

```
POST /api/v1/public/invites/{token}/register
```

**Closest analog:** `POST /api/v1/join/{slug}/register` at `app/api/v1/join.py:64-100`. Same shape — public, rate-limited, uses the URL token as the gate, registers something. Differences below.

| Aspect | `/join/{slug}/register` (today) | `/invites/{token}/register` (proposed) |
|--------|-----------------------------------|----------------------------------------|
| Auth | `Depends(get_current_user)` — requires the user to *already* be authed via ZITADEL | **None**. The invite token IS the bearer. The whole point is the user has no credentials yet. |
| Body | `{}` (the slug is the only input) | `{"password": "<plaintext>"}` — sent over TLS only. Validate length + non-empty server-side; ZITADEL validates against full policy on submit. |
| Response | `JoinResponse(message, campaign_id, volunteer_id)` | `{"status": "password_set", "next": "/invites/{token}", "login_hint": "<email>"}` — return JSON, **NOT** tokens or cookies. The frontend uses `next` + `login_hint` to start the OIDC flow via oidc-client-ts on the next step. |
| Rate limit | `@limiter.limit("10/minute")` (per IP, default key) | **`@limiter.limit("5/minute", key_func=lambda req: token_from_path(req))`** — per-token, not per-IP. Cap also at the IP layer for safety: a separate `@limiter.limit("20/minute")` per IP. |
| Token validation | slug → campaign | token → invite via `InviteService.validate_invite` (which already enforces expiry, accepted, revoked). Reject 404 on invalid token *before* doing any work. |
| Side effects | Creates Volunteer, optionally CampaignMember | Calls `ZitadelService.set_user_password(zitadel_user_id, password)`. Does NOT mark invite accepted (acceptance happens on the existing `/invites/{token}/accept` endpoint after auth). |

**Why no token return.** Returning JWTs from this endpoint would mean the backend mints user sessions, which it doesn't today (ZITADEL is the IdP — backend only validates JWTs at the edge per `app/api/deps.py`). Setting cookies cross-origin from `run-api.civpulse.org` to `run.civpulse.org` brings the SameSite headache. Cleanest is: backend confirms password-set succeeded → frontend kicks off the standard OIDC redirect with `login_hint=<email>` so ZITADEL pre-fills the username field; the user re-types the password they just set on ZITADEL's hosted login (one extra step) and lands authenticated. This is the Option C non-ROPC variant from STACK.md and accepts the "two trips" UX cost noted there.

**The ROPC alternative** (`signinResourceOwnerCredentials` immediately after password set) eliminates the second trip but requires the SPA security regression flagged in STACK.md. If the team chooses ROPC, the backend endpoint shape doesn't change — only the frontend's response handling changes.

```
GET /api/v1/public/invites/{token}/password-policy   (Option C only, optional)
```

Returns sanitized password complexity policy from ZITADEL for client-side hints. Same auth model as above (token is the bearer). Cache policy server-side (1h TTL) to keep ZITADEL load minimal.

---

## Q4. Frontend route changes

### Option B — **Effectively zero.**

- `web/src/routes/invites/$token.tsx`: the existing route already handles "user is authenticated → show Accept button" and "user is unauthenticated → redirect to /login." After ZITADEL completes setup and redirects back to `/invites/<token>`, oidc-client-ts will pick up the session (the redirect from ZITADEL carries the auth cookie at `auth.civpulse.org`; on next API call, the silent renew flow restores it). No code change.
- `web/src/routes/login.tsx`: minor copy/handling tweak so the bounced-through-login case doesn't leave the user staring at "Redirecting…" (Table-Stakes #10 from FEATURES.md). Optional, not strictly required for Option B to function.
- One new frontend file possibly: `web/src/routes/invites/zitadel-callback.tsx` if we go with the (b1) variant from Q3. Not needed if (b2).

### Option C — One new route file plus copy.

```
web/src/routes/invites/$token.setup.tsx   (NEW)
```

TanStack Router file-based routing means this nests *under* `$token.tsx` as a sibling segment. Path: `/invites/<token>/setup`. The existing `$token.tsx` continues to be the index route at `/invites/<token>`.

**Layout sibling files (existing for reference):**
- `web/src/routes/invites/$token.tsx` — invite landing page (loads, renders campaign/role context, "Accept invite" button when authed)
- `web/src/routes/signup/$token.tsx` — volunteer-application flow (different feature, similar pattern of "public token gate" page)

Both are good crib references. `signup/$token.tsx` in particular already has the public-token-gated-form pattern.

**Setup page flow:**

1. On mount: `GET /api/v1/public/invites/{token}` (existing) to confirm the token is valid + load context for the framing. Reuses existing TanStack Query key `["public-invite", token]`.
2. Render shadcn/ui form (RHF + Zod): one password field with show-toggle, live strength meter from `GET /api/v1/public/invites/{token}/password-policy`, primary CTA "Set password & continue."
3. On submit: `POST /api/v1/public/invites/{token}/register` with `{password}`. On success, store `next` in sessionStorage under the existing `POST_LOGIN_REDIRECT_KEY`.
4. **Hand-off to OIDC:**
   - **Non-ROPC path:** call `useAuthStore.getState().login()` (or directly `userManager.signinRedirect({ extraQueryParams: { login_hint: invite.email } })`). User redirects to ZITADEL hosted login, types the password they just set, redirects back to `/auth/callback`, then `/invites/<token>` (the redirect target stored in step 3). One extra password-entry step.
   - **ROPC path (if approved):** `await userManager.signinResourceOwnerCredentials({ username: invite.email, password })` immediately, then `navigate({ to: "/invites/$token", params: { token } })`. No second password entry. Requires SPA-app changes per STACK.md.

**Files to add (Option C):**
- `web/src/routes/invites/$token.setup.tsx` — the page
- `web/src/components/invite/PasswordSetupForm.tsx` — the RHF + Zod form (cribbed from existing form patterns)
- Optional: `web/src/types/invite.ts` extension for `PasswordPolicy` type
- Update copy on `web/src/routes/invites/$token.tsx` to recognize and link into the setup page when the user lands there unauthed *and* the invite metadata says "first-time user" (signal computed server-side from `zitadel_user_id IS NOT NULL AND identity_provisioning_status = 'provisioned' AND user_has_password = false` — see Q5 for where that signal can come from).

---

## Q5. Local `users` table sync — pre-create or wait?

### Recommendation: **Wait. Do NOT pre-create the local `users` row.**

`ensure_user_synced` (`app/api/deps.py:91-160`) uses the JWT `sub` as the canonical id, and runs idempotently on first authed request. Knowing the `sub` early (because we just created the ZITADEL user) is *technically* enough to insert a `users` row early, but the costs outweigh the benefits.

### The case for pre-creating

- Admin sees "Bob Smith — invite pending" in the campaign roster instead of just "bob@…".
- One fewer round-trip on the user's first authed request (the row already exists, `ensure_user_synced` short-circuits to the update branch).
- We could pre-create the `CampaignMember` row too, so admin tools that filter on members would see the invitee immediately.

### The case against (stronger)

1. **Display-name unknown at invite time.** The current invite-create form takes only `email` and `role` (`invite.py:36-43`). `User.display_name` would be empty or a guess from the email local-part — both worse than letting ZITADEL collect a real name during signup and syncing on first request. (The `signup/$token` flow takes a name; the invite flow does not.)
2. **The display problem already has a solution.** The Invite row carries `email` (and via `created_by` the inviter context). The admin pending-invites UI from v1.16 already shows pending invitees by email. There's nothing the user-row would add to the admin view that the invite row doesn't already provide. Add `display_name` to the invite create form if we want richer admin display — that's a 5-LOC schema change, not a sync-architecture change.
3. **Pre-creating the User row before first auth creates a "phantom user" foot-gun.** Today, if you query `users`, every row corresponds to someone who has authed at least once. Breaking that invariant means every read site has to know "users.last_seen_at IS NOT NULL means they've actually logged in" — a leaky abstraction across many call sites.
4. **CampaignMember pre-create is worse.** It changes the semantics of `select(*).from(campaign_members)` everywhere — "members" would now include unaccepted invitees. Reports, RLS policies, and downstream count queries would all need an `accepted_at IS NOT NULL` filter retroactively. This is the same anti-pattern as auto-creating membership before accept (FEATURES.md anti-feature: "Auto-creating campaign membership before accept").
5. **The first-request sync cost is negligible.** `ensure_user_synced` is 1-2 queries; the request is already paying ZITADEL JWT-validation cost. Saving a single insert is not worth the invariant change.

### What to do instead

- Store `zitadel_user_id` on the **Invite** row at provisioning time (we have it — write it).
- Surface `zitadel_user_id IS NOT NULL` as the "identity provisioned" signal in admin UIs.
- Let `ensure_user_synced` continue to be the single point of truth for `users` row creation, on first authed request, where we have the real display name from JWT claims.

If the admin-UX argument is felt strongly later, the right wedge is "extend the invite create form to capture display_name, render it in admin pending-invites." Don't pre-populate `users`.

### One subtle tradeoff to accept

When the user first authenticates after Option B/C, `ensure_user_synced` runs and creates the `users` row using `user.id` from the JWT. That `user.id` MUST equal the `zitadel_user_id` we provisioned, because both are the same ZITADEL `sub`. If for any reason ZITADEL hands back a different `sub` than the one we recorded on the Invite (it shouldn't — `sub` is stable for a created user), the link breaks silently. Mitigation: when handling the post-OIDC accept, verify `authed_user.id == invite.zitadel_user_id`; on mismatch, log loudly and refuse the accept. (Reuses the existing email-match check pattern at `invite.py:202-205`.)

---

## Build-Order Sketches

### Option B (recommended) — 5 steps

1. **Schema + service surface.** Alembic migration: add `zitadel_user_id`, `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at` to `Invite`. Add `ZitadelService.ensure_human_user(email, given_name, family_name, org_id)` and `ZitadelService.create_invite_code(user_id, url_template)` using existing `_get_token` + 409-idempotent pattern. Unit tests for both with a mocked httpx client.
2. **Provisioning step inside the email task.** Extend `send_campaign_invite_email` (`app/tasks/invite_tasks.py`) with a guarded `if invite.zitadel_user_id is None` block that calls a new `app/services/identity_provisioning.py::ensure_zitadel_identity_for_invite(session, invite, campaign)`. Writes outcome to invite row, raises on hard failure so Procrastinate retries. Integration test: ZITADEL stub down → task retries; ZITADEL up → user provisioned, code generated, email queued.
3. **Email template + URL template.** Update `submit_campaign_invite_email` to template `urlTemplate` with the literal invite token (Option B variant b2 from Q3) — `https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`. Pass to `create_invite_code`. Update first-time vs returning email templates per FEATURES.md Table-Stakes #14.
4. **Frontend confirmation pass.** Verify `web/src/routes/invites/$token.tsx` correctly handles "user just landed via ZITADEL invite-code redirect, oidc-client-ts session is fresh." Update `/login` interstitial copy (FEATURES.md Table-Stakes #10). E2E test via `web/scripts/run-e2e.sh`: full create-invite → email-link → ZITADEL hosted setup → land on `/invites/<token>` → Accept → land on campaign.
5. **Resend + admin polish.** Add `POST /api/v1/invites/{id}/resend` for the v1.16 admin pending-invites table (calls `create_invite_code` again — that invalidates the prior code per ZITADEL docs, which is fine). Add the "request new invite" CTA on the expired-invite frontend state (FEATURES.md Table-Stakes #8).

### Option C — 6 steps

1. **Schema + service surface (same as B step 1, plus password endpoint).** Add the same Invite columns. Add `ensure_human_user`, `set_user_password`, `get_password_policy_for_org` to `ZitadelService`. Decide ROPC vs non-ROPC (this gates step 5).
2. **Provisioning step inside the email task (same as B step 2).** Identity-provisioning logic is shared between B and C.
3. **Email template + URL.** Email link points to `https://run.civpulse.org/invites/<token>/setup` (NOT the existing `/invites/<token>` index — the setup variant). Branch first-time vs returning per FEATURES.md.
4. **New backend endpoints.** `POST /api/v1/public/invites/{token}/register` and `GET /api/v1/public/invites/{token}/password-policy` per Q3. Per-token rate limiting. Integration tests for: invalid token, expired token, weak password, ZITADEL-rejected password, success.
5. **New frontend route.** `web/src/routes/invites/$token.setup.tsx` + `PasswordSetupForm` component. Implement the chosen post-set-password handoff (non-ROPC redirect or ROPC `signinResourceOwnerCredentials`). If ROPC chosen, also update `bootstrap-zitadel.py` to add `OIDC_GRANT_TYPE_PASSWORD` and a client_secret to the SPA app — and accept the security regression from STACK.md.
6. **E2E + polish.** `web/scripts/run-e2e.sh` end-to-end: create invite → email-link → setup page → enter password → OIDC handoff → land on `/invites/<token>` authed → Accept → campaign. Resend endpoint + expired-link CTA as in B step 5.

---

## B vs C — Architecture Scorecard

| Criterion | Option B (ZITADEL invite_code) | Option C (App-owned setup page) | Lean |
|-----------|--------------------------------|----------------------------------|------|
| **Build-order length (#steps)** | 5 | 6 (or 7 if ROPC variant pulls in `bootstrap-zitadel.py` work as its own step) | **B** |
| **New backend endpoints** | 0 (1 optional resend) | 1 required (`/register`) + 1 optional (`/password-policy`) | **B** |
| **New frontend routes/components** | 0 (just copy tweaks; possibly 1 callback route in variant b1) | 1 route + 1 form component + types | **B** |
| **Files touched in `bootstrap-zitadel.py`** | 0 (optional: invitation message template, additive only) | 0 for non-ROPC; **3+ lines + security regression** for ROPC variant | **B** |
| **Blast radius if it goes wrong (worst plausible failure)** | ZITADEL hosted setup page UX is off / `urlTemplate` doesn't deep-link → users land at the wrong place after setup. Recoverable: invite link is still valid until expiry; admin can resend. No data corruption, no security regression. | Non-ROPC: UX has an extra password-entry step (the FEATURES.md "Option C unifies the experience" promise softens). Recoverable. **ROPC: the SPA becomes a confidential client with a leakable secret, ROPC grant active for the org.** Hard to roll back without re-bootstrapping ZITADEL. | **B** (small blast); **C non-ROPC** (medium); **C ROPC** (large) |
| **Fit with existing v1.16 invite-delivery pattern** | Drop-in: same Procrastinate task, same `email_delivery_*` columns extended with `identity_provisioning_*` siblings. Zero new patterns introduced. | Same provisioning fit as B, but adds a new pattern: a public token-gated POST endpoint that mutates ZITADEL state. The closest analog (`/join/{slug}/register` at `join.py:64`) requires the user to already be authed — so this endpoint type is genuinely new. Not bad, just new. | **B** |
| **Fit with existing ZitadelService idempotency pattern** | `ensure_human_user` mirrors `ensure_project_grant` exactly. `create_invite_code` is naturally non-idempotent (each call invalidates the prior code) — that's a feature, not a bug, for resends. | Same `ensure_human_user`. `set_user_password` is naturally idempotent (set is set). Both fit. | **Tie** |
| **Compensating-tx complexity if invite is revoked between provision and email** | None required — orphaned ZITADEL user is benign (no grants, no membership). Optional: deactivate via `POST /v2/users/{id}/deactivate` on revoke. | Same — none required. Optional same. | **Tie** |
| **First-request `ensure_user_synced` interaction** | Identical to today. JWT `sub` = pre-provisioned `zitadel_user_id`, sync runs once, link verified by Q5's `authed_user.id == invite.zitadel_user_id` check. | Identical. | **Tie** |

### Architecture-only verdict

**Option B is the architecturally cheaper change** by every measure that matters: fewer endpoints, fewer routes, smaller blast radius, no new endpoint patterns, and a clean fit with the v1.16 delivery shape. Option C's only architectural advantage is "we own the page" — a product/UX argument, not an architecture argument. If the product argument is decisive, ship Option C non-ROPC and accept the extra password-entry step; do not ship Option C ROPC without a separate security review.

The decision should still be informed by the Phase-111 `urlTemplate` spike from FEATURES.md (LOW-confidence flag): if `urlTemplate` cannot reliably deep-link to `/invites/<token>`, Option B's main UX promise weakens and Option C non-ROPC becomes more attractive.
