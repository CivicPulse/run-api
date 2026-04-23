# Feature Landscape

**Domain:** Invite-onboarding for a multi-tenant SaaS — specifically the "click invite link → set credentials → accept invite → land in app" flow for brand-new volunteers on CivicPulse Run.
**Researched:** 2026-04-22
**Scope:** v1.19 only (the new invite-onboarding feature surface). Existing invite-creation, accept-invite endpoint, and `/signup/$token` volunteer-application flow are NOT in scope.

---

## Context Recap

Today, a brand-new invitee:

1. Receives an email from CivicPulse Run with a link to `/invites/<token>`.
2. Clicks it. The frontend shows campaign/role context and a "Sign in to accept invite" button.
3. Button bounces them to `/login`, which silently redirects to ZITADEL's hosted login page.
4. ZITADEL self-registration is **disabled** and there is no pre-provisioned identity for that email — the user dead-ends with no obvious path forward. Audited 2026-04-22.

v1.19 must close that gap. Two candidate approaches — referenced throughout this doc as **Option B** and **Option C** — were defined in the milestone goals:

| Option | Mechanism | Where the password is set |
|--------|-----------|---------------------------|
| **B** | Backend calls ZITADEL `CreateUser` + `CreateInviteCode` at invite-creation time. The init-link in the invite email goes to ZITADEL's hosted setup page, then redirects back to `/invites/<token>` already authenticated. | ZITADEL hosted UI |
| **C** | Backend calls `CreateUser`. App ships an own `/invites/<token>/setup` page that collects the password inline, calls a new backend endpoint that sets the ZITADEL password, then bounces user into the OIDC flow with `prompt=none` so they land on `/invites/<token>` already authed. | CivicPulse Run UI on `run.civpulse.org` |

Each feature below is annotated with **B / C / both / neither** to flag which approach naturally supports it.

---

## Table Stakes

Features without which the flow is broken or feels unprofessional. Missing any of these is an immediate volunteer-confusion incident.

| # | Feature | Why expected | Complexity | B/C affinity | Notes |
|---|---------|--------------|------------|--------------|-------|
| 1 | **Invitee can set a password without admin intervention** | This is the core user job. Without it, every new volunteer requires manual help. | Med | Both — B uses ZITADEL hosted; C uses app-owned form | The current state fails this; this is the entire reason v1.19 exists. |
| 2 | **Pre-provisioned ZITADEL identity at invite-creation time** | Required for ZITADEL `CreateInviteCode` to even be callable on a real `user_id`. Both options need this. | Med | Both | New backend surface: `ZitadelService.create_human_user(email, given_name, family_name)`. |
| 3 | **Idempotent re-invite on existing email** | Re-inviting must NOT create a duplicate ZITADEL user or 409. | Med | Both | Look up by email/login-name first; only `CreateUser` if missing. ZITADEL surfaces `User.UserName.AlreadyExists` (`409`) — catch and degrade to skip-provision path. |
| 4 | **First-click email link works on mobile** | Volunteers click invite links on phones, often in landing pages opened from Gmail/Outlook in-app browsers. | Low | Both | Touch targets ≥ 44 px (project's existing WCAG-AA standard). Single-column layout. No horizontal scroll. |
| 5 | **Show password toggle (eye icon) on the password field** | 2026 standard. Reduces typos on mobile keyboards dramatically. WCAG-allowed and recommended. | Low | C only — B is ZITADEL's UI | Single password field + show-password is preferred over confirm-password (WAI guidance, 2024+). If C, this is on us; if B, ZITADEL hosted UI's behavior is what it is. |
| 6 | **Password strength indicator with live-updating requirement checklist** | Show requirements *before* the user errors — each becomes a green check as met. WCAG-AA: requirements wired via `aria-describedby`. | Low–Med | C only — B is ZITADEL's UI | If C, build with the existing shadcn/ui + Zod stack. Don't *block* on "weak" if min requirements are met — guide, don't force. |
| 7 | **Email-already-has-an-account → "sign in instead" branch** | The user might already have a CivicPulse identity (joining a second campaign). Loud "create password" CTA on a returning user is wrong. | Med | Both | Detect at invite-render time on the `/invites/<token>` page using the existing public-invite endpoint, plus a new "does ZITADEL know this email?" signal. Do NOT leak account-existence to anonymous callers — server gates the signal behind the invite token. |
| 8 | **Expired-link recovery path with a clear "request new invite" CTA** | Invites currently expire after 7 days (`INVITE_EXPIRY_DAYS=7`). Volunteer momentum is days, not minutes — expired links happen. The current page just says "Ask your campaign admin to send a new one" with no action. | Med | Both | Add a lightweight "Request a fresh invite" button on the expired-state UI. Backend rate-limits + emails the inviter (or campaign admins). MUST NOT auto-resurrect a revoked invite — only re-notify the campaign team. |
| 9 | **Contextual page copy that mentions campaign + role + inviter** | Already partially done on `/invites/<token>`. Must also be present on the password-set page (whichever lives at) so the user remembers WHY they're setting a password. | Low | C cleanly; B requires ZITADEL `application_name` config + branding | If B: pass `applicationName` to `CreateInviteCode` so ZITADEL's hosted page at least shows "Set up your account for CivicPulse Run." If C: full contextual framing ("Set your password to join Mayor Smith for City Council as a Volunteer"). |
| 10 | **`/login` page that surfaces invite context when bounced through it** | Today's `/login` is a 4-line "Redirecting to login..." screen. If ZITADEL ever bounces the user back to `/login` (init expired, session lost, browser clears cookie mid-flow), the user is stranded with no instructions. | Low | Both | Read `?redirect=/invites/<token>` from search params and render a brief "You're signing in to accept your invite to <campaign>" pre-redirect interstitial. Ties into the existing `POST_LOGIN_REDIRECT_KEY` sessionStorage pattern. |
| 11 | **Email-match enforcement on accept** | Already enforced by `accept_invite` (case-insensitive). Must remain. Critical: prevents User-A from accepting an invite addressed to User-B by clicking a forwarded link. | Low | Both | Existing behavior — keep. |
| 12 | **Single-use, one-time invite link** | Invite-accept already idempotent at the DB layer (`accepted_at` set once). The init-code from ZITADEL is also single-use. Both layers must remain single-use. | Low | Both | Industry standard (Postmark, Clerk: "links should mirror password-reset semantics"). |
| 13 | **Same-origin landing** (`run.civpulse.org/invites/<token>`) | Already in place. Critical for trust — a Mailgun-signed link to `run.civpulse.org` is recognizable to the user. | Low | Both | Keep `app_base_url` as the origin in `build_invite_accept_url`. |
| 14 | **Email content that distinguishes "first-time setup" from "re-invite to a second campaign"** | Today's email body is one-size-fits-all ("X invited you to join Y"). For an existing user, the "Accept your invite" button works fine; for a new user, they need to know they'll be asked to set a password. | Low | Both | Two template variants keyed off "does ZITADEL know this email?" computed at queue time. |

> **What good looks like (Table Stakes):**
> *"A volunteer who has never heard of CivicPulse Run clicks the invite link on their phone, sets a password in under 90 seconds, lands on the campaign page, and never thinks about the auth system. If their link is expired, they tap one button to ask for a new one."*

---

## Differentiators

Features that make the flow feel genuinely well-designed. Skip without shame for v1.19, but each shortens the activation curve and reduces support load.

| # | Feature | Value proposition | Complexity | B/C affinity | Notes |
|---|---------|-------------------|------------|--------------|-------|
| 1 | **Magic-link / passwordless option on the setup page** | Lets volunteers skip password creation entirely. Some campaigns will have volunteers who don't want yet-another password. | High | B can lean on ZITADEL's email-OTP/passkey support; C needs custom backend | ZITADEL Login V2 already supports passkeys/IdP/password as configurable per-org auth methods. Defer for v1.19 unless truly trivial — it's a v1.20+ candidate. |
| 2 | **Passkey enrollment on first setup** | WebAuthn passkeys are the modern default for new accounts. ZITADEL supports this in Login V2. | Med | B (ZITADEL hosted does it natively) ; C would need custom WebAuthn glue | If we go with B and enable passkeys at the org level in ZITADEL, we get this nearly for free. Strong argument *for* Option B. |
| 3 | **Single-click activation when no password is required** | If campaign admins flag "this volunteer doesn't need login access yet" (e.g. for receive-only SMS lists), the invite could be a no-op acknowledgement. | High | Neither natively — needs new backend modeling | Out of scope for v1.19 — flag in REQUIREMENTS as deferred. Listed for completeness because the question asked. |
| 4 | **"Joining X campaign as Y role" framing rendered ON the password page itself** | Reinforces the *why* at the moment of friction. Reduces "what is this site again?" abandonment. | Low | C natively (we own the page); B only via ZITADEL `applicationName` (limited) | Strong argument *for* Option C. With C, we can also show the inviter's name and the campaign's logo (if we ever ship per-campaign branding). |
| 5 | **Inviter's first name + a short personal message in the email** | Postmark, Linear, Notion, Vercel-style. "Sara from Mayor Smith for City Council invited you…" outperforms "A CivicPulse teammate invited you." Today's template falls back to "A CivicPulse teammate" when inviter has no display name — that's the bad path. | Med | Both — pure email-content change | Add an optional "personal note" field in the create-invite form. Admin can leave blank. If blank, omit the section (don't show empty quotes). |
| 6 | **Pre-fill the user's name from invite metadata** | If the admin invited "kerry@…", the password-set page can show "Hi Kerry" if they typed a name. Tiny, warm. | Low | C natively; B not really controllable | Requires extending the invite create form to optionally collect first/last name. Already partially solved by `signup/$token` — can crib that pattern. |
| 7 | **Show pending-invite list on the post-login dashboard for users with multiple workspaces** | If a user has 3 pending campaign invites, after accepting one they should see the other two surfaced. | Med | Both | Defer to v1.20+. Our model already supports this (multiple `Invite` rows per email), the UI just doesn't surface it. |
| 8 | **"You're already a member of this campaign" detection on accept** | If a user clicks an old invite link after they've already been added by another path, show "You're already in! Open campaign" instead of "Accept invite." | Low | Both | Cheap win — add to accept-invite UX. Existing `effectiveStatus === "accepted"` partly does this; needs to also check campaign membership independent of invite state. |
| 9 | **Resend-invite from the admin pending-invites table** | v1.16 added "pending invite admin visibility for delivery status." A button on each pending-invite row that re-runs delivery (and, if needed, regenerates the ZITADEL init code) closes the loop without requiring a new invite-create. | Low–Med | Both — but B's resend must call `CreateInviteCode` again (which invalidates the prior code, per ZITADEL docs) | Combines neatly with the "Request a fresh invite" CTA in #8 of Table Stakes — same backend handler. |
| 10 | **Honest "this might be in your spam folder" prompt** | On the `/invites/<token>` page when status is `not_found`, suggest checking spam *and* offer the "request new invite" path. | Low | Both | Tiny copy change. |

> **What good looks like (Differentiators):**
> *"The invite email reads like it was written by a human teammate, the setup page says 'Set your password to volunteer with Mayor Smith,' and a returning user sees 'Welcome back, you've also been invited to two more campaigns.' Nothing about the auth provider leaks through."*

---

## Anti-Features (Out of Scope / Avoid)

Things competing products sometimes ship that we should NOT.

| Anti-feature | Why avoid | Do this instead |
|--------------|-----------|-----------------|
| **CAPTCHA on the invite-accept or password-setup page** | The invite token itself is the gate — it's a unique, expiring, single-use, server-issued secret delivered to a verified inbox. Adding CAPTCHA on top is friction with no incremental security benefit, and CAPTCHAs harm WCAG compliance (visual challenges fail screen readers). | Rely on the existing rate-limiting on public endpoints (already shipped per `/v1.5`). Add per-token attempt rate-limit if abuse appears. |
| **Email verification step on top of the invite link** | The invite link itself proves email ownership — they had to receive it to click it. Adding a "verify your email" hop is redundant and stalls activation. ZITADEL's `isEmailVerified=true` flag should be set at `CreateUser` time precisely to skip this. | Set `isEmailVerified=true` when creating the ZITADEL user (the invite token is the verification proof). Documented ZITADEL pattern. |
| **Forced 2FA / MFA enrollment during first setup** | Volunteers in the field need to be able to log in fast. Forcing MFA at first run will tank activation. | Make MFA optional, surface it as a post-onboarding nudge for admin/manager roles only. (And only when the org actually wants it.) |
| **Required confirm-password field** | 2026 best practice (WAI / Atomic A11y) is a single password field with a show-password toggle. Confirm-password adds friction without security value when a show toggle exists. | One field + show toggle. |
| **Generic `noreply@` sender** | Already partly avoided since we route via Mailgun with org context. Don't regress — keep the inviter's name in the body and use a campaign-recognizable sender display name. | Keep current `EmailTenantContext` + add inviter display name in subject for personality (e.g. "Sara invited you to Mayor Smith for City Council"). |
| **"Reset password to recover an expired invite link" flow** | An expired invite is NOT a forgotten password — they're orthogonal. Conflating them confuses both states. | Expired invite → "request new invite" → admin re-issues. Forgotten password → ZITADEL's existing reset flow. Two separate paths. |
| **Auto-creating campaign membership before accept** | Tempting (saves a step), but breaks the "user must explicitly opt in" trust model and would surprise users invited to campaigns they don't want to join. | Keep the explicit "Accept invite" click as the consent point. |
| **A separate "welcome to CivicPulse" tour on first login** | Invited users are joining an already-running campaign. They want to *do their job*, not learn the product. The existing field-mode driver.js tour (v1.4) is the right scope; don't add a setup-wizard tour on top. | Land them directly on the relevant campaign page (existing behavior — keep). |
| **Captcha on the "request new invite" button** | Same reasoning as above — the original invite token's campaign context is the gate. | Per-token / per-IP rate limit. The request just emails the campaign admin team. |
| **Surveying volunteer demographics during account setup** | Out of scope and slows activation. There's already a separate `/signup/$token` volunteer-application flow for that. Don't conflate. | Keep invite onboarding minimal — set password, accept, land in app. |

---

## Re-Invite UX (existing user, new campaign)

Explicitly addressed because this is a real branch the implementation will hit, and the question called it out.

**The scenario:** A user already has a CivicPulse identity (because they accepted a prior campaign invite, or because they were created via the v1.17 volunteer-application approval path). An admin on a *different* campaign now invites them.

**Required behavior:**

1. **At invite-creation time:** `InviteService.create_invite` is unchanged (it doesn't know about ZITADEL today). The new backend surface — call it `IdentityProvisioningService.ensure_identity(email)` — is invoked from `enqueue_invite_email` (or the email task itself, for clean async boundaries). It should:
   - Look up the user in ZITADEL by login-name (lowercased email).
   - If found → **no-op**. Do not regenerate an init-code. Do not call `CreateUser`.
   - If not found → `CreateUser` with `isEmailVerified=true`, then `CreateInviteCode` (Option B) or just record the user_id (Option C).
2. **Email content branches on this signal:**
   - **First-time:** subject "Set up your CivicPulse account to join {campaign}", body explains "you'll set a password on the next page."
   - **Returning:** subject "{Inviter} invited you to {campaign}", body is the existing concise "Accept your invite" pattern. NO setup-link, NO password copy — just the accept link.
3. **Landing experience:**
   - **First-time + Option B:** init-link → ZITADEL setup → redirected back to `/invites/<token>` already authed → one-click "Accept invite."
   - **First-time + Option C:** invite-link → `/invites/<token>` shows "Set a password to continue" inline form → on submit, set password + start OIDC → land back on `/invites/<token>` already authed → one-click "Accept invite."
   - **Returning (both options):** invite-link → `/invites/<token>` → if not authed, "Sign in to accept" (existing) → ZITADEL prompts for password → land back on `/invites/<token>` authed → "Accept invite."
4. **Already-a-member case:** If the returning user is *already* a member of this campaign (e.g. a duplicate invite was sent), show "You're already a member of {campaign}. Open campaign →" and silently mark the invite accepted. This is a small extension of the existing `effectiveStatus === "accepted"` branch.

**Symbol of done:** A user who already has an account and clicks an invite link sees ZERO password / setup UX. They sign in (if not already), click Accept, and land in the campaign. The flow is indistinguishable from clicking any other authenticated link.

> **What good looks like (Re-invite):**
> *"If you already have a CivicPulse account, an invite to a second campaign feels like clicking 'Accept' on a Slack channel invite — sign in if you're not, click once, you're in. No re-onboarding, no extra password, no spurious 'set up your account' email."*

---

## Expired / Lost-Link Recovery

The standard 2026 pattern (Clerk, Postmark, most B2B SaaS):

1. **Server-side detection:** Public invite endpoint already returns `status: "expired"` (lines 393–403 of `app/services/invite.py`). No change needed there.
2. **Client-side messaging:** Replace today's passive "Ask your campaign admin to send a new one" with an active "Request a new invite" button. (Existing `effectiveStatus === "expired"` branch on the page.)
3. **Recovery action:** The button hits a new public endpoint (rate-limited, captcha-free) that:
   - Takes the expired invite token.
   - Looks up the campaign + the original inviter.
   - Sends a templated email to the inviter (and any other admins on the campaign): "{invitee_email} tried to use an expired invite link to join {campaign}. Re-invite them?" with a deep link to the pending-invites admin table.
   - Shows the user a "We've notified the campaign team — they'll send a fresh invite to your email" confirmation.
4. **Lost-link recovery (user can't find the email at all):** This is a different path — the user doesn't have a token. Two acceptable patterns:
   - **a) Don't solve it in v1.19.** Most users will find the email; for the rest, "contact the campaign admin out-of-band" is fine. Punt.
   - **b) Defer to v1.20:** add a "Did you receive an invite to a campaign? Find it in your account" UX after login that lists pending invites by email match. Tied to differentiator #7 above.

**Recommendation:** Ship 1–3 in v1.19. Defer (b) to v1.20.

> **What good looks like (Recovery):**
> *"An expired link offers a one-tap 'request a fresh invite' that emails the campaign team — the user knows what to expect and isn't dead-ended. No password-reset confusion. No support ticket required."*

---

## Email Content Patterns

Distilled from Postmark's invitation-email guide, the SaaSframe collection (Linear, Notion, Miro, Mixpanel, etc.), and Clerk's invitation docs.

**Subject line patterns that work in 2026:**

- Good: `{Inviter first name} invited you to {workspace}` (Linear, Notion, Slack, Vercel pattern)
- Good: `Set up your {Product} account` (for first-time-only sends, when the email serves as both invite and account-init)
- Bad: `You have a new invitation` (vague — kills open rate)
- Bad: `[Action Required] Accept your invite to ProductName` (looks like spam)

Today's template: `"{inviter_name} invited you to join {campaign_name}"` — already close to the recommended pattern. Keep, with the inviter-name fallback fixed (don't show "A CivicPulse teammate" if avoidable).

**Body patterns that work:**

- **Inviter context:** "Sara from Mayor Smith for City Council invited you to volunteer." Use the campaign+org+inviter we already have in `build_campaign_invite_email`.
- **Role + value:** "You'll be joining as a {role} — you'll be able to {1-line role-specific value statement}." Don't list features — list *what they can do*.
- **Optional personal note:** Render a quoted block ONLY if the admin filled one in. Never show empty quotes.
- **Single primary CTA:** "Accept your invite" or "Set up your account" — one button, not two.
- **Expiry messaging:** "This invite expires {date}." We already include this — keep.
- **What to expect on click:** Two-template branch per re-invite section above:
  - First-time: "You'll set a password on the next page (takes about a minute)."
  - Returning: "Sign in to accept" — no password mention.
- **Footer:** Reply-to a real inbox or include a "Need help? Contact …" line. Postmark guidance.
- **Plain-text version:** Already implemented (`text_body`) — keep parity. Many clients (mobile in particular) render text by default.

**What to drop from today's template:**

- The "for {organization_name}" sub-clause is fine when org ≠ campaign, but the current code falls back to `organization_name = campaign.name` — meaning we sometimes render "join Foo for Foo" when no org exists. Suppress the "for X" clause when org ≡ campaign or org is None.

> **What good looks like (Email):**
> *"The subject reads 'Sara invited you to Mayor Smith for City Council.' The body opens with Sara's name, a one-line on what the user will be doing as a Volunteer, a single 'Set up your account' button, and a quiet 'expires Apr 29' line. Nothing else. It looks like Sara wrote it personally — not like a SaaS notification."*

---

## MVP Recommendation for v1.19

Prioritize, in this order:

1. **Pre-provisioned ZITADEL identity** (Table Stakes #2) — required for both options; do this first.
2. **Password-set flow** — pick Option B or C and ship it (Table Stakes #1, #5, #6, #9).
3. **Idempotent re-invite** (Table Stakes #3) — non-negotiable, gate to merge.
4. **Email-already-has-account branch + first-time vs returning email content** (Table Stakes #7, #14).
5. **Defensive `/login` interstitial when bounced with `redirect=/invites/...`** (Table Stakes #10).
6. **Expired-link "request new invite" button** (Table Stakes #8) + admin resend from pending-invites table (Differentiator #9).

Defer to v1.20+:

- Magic-link / passwordless (Differentiator #1).
- Multi-pending-invite dashboard (Differentiator #7).
- Post-onboarding MFA nudges (anti-feature avoidance still).
- Lost-link "find my invite by email" recovery (Recovery option b).

---

## Sources

- [ZITADEL CreateInviteCode API reference](https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateInviteCode)
- [ZITADEL CreateUser API reference](https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateUser)
- [ZITADEL Onboard End Users guide](https://zitadel.com/docs/guides/integrate/onboarding/end-users)
- [ZITADEL Console — manage users](https://zitadel.com/docs/guides/manage/console/users)
- [Clerk Invitations docs](https://clerk.com/docs/users/invitations)
- [Postmark — User invitation email best practices](https://postmarkapp.com/guides/user-invitation-email-best-practices)
- [SaaSframe — 29 invitation email examples (Linear, Notion, Miro, Mixpanel, Vercel-adjacent products)](https://www.saasframe.io/categories/invitation-emails)
- [Userpilot — How to onboard invited users in SaaS](https://userpilot.com/blog/onboard-invited-users-saas/)
- [Appcues — onboarding strategies for invited users](https://www.appcues.com/blog/user-onboarding-strategies-invited-users)
- [Atomic A11y — Accessible password input checklist (2026)](https://www.atomica11y.com/accessible-web/password-input/)
- [W3C WAI — Complete password example](https://www.w3.org/WAI/tutorials/forms/examples/password/)
- [PatternFly — Password strength design guidelines](https://www.patternfly.org/components/password-strength/design-guidelines/)
- [CourseUX — UX login & signup guidelines 2026](https://courseux.com/ux-login-signup-password-guidelines/)
- [PageFlows — invite teammate flow patterns](https://pageflows.com/resources/invite-teammates-user-flow/)
- ZITADEL GitHub issue [#8310 — Invite User Link](https://github.com/zitadel/zitadel/issues/8310) (clarifies CreateInviteCode link semantics)

**Confidence levels:**

- **HIGH:** ZITADEL API capabilities (CreateUser, CreateInviteCode, isEmailVerified, idempotency-by-email) — verified against official ZITADEL docs.
- **HIGH:** WCAG-AA / accessible password-form patterns — multi-source consensus (W3C WAI, Atomic A11y, PatternFly).
- **MEDIUM:** Specific SaaS competitor email content patterns (Linear, Notion, Vercel) — drawn from aggregator + Postmark guidance, not direct fetches of each product's actual email. Patterns are well-known and unlikely to be wrong.
- **LOW (flagged):** Exact behavior of ZITADEL's `url_template` and `applicationName` parameters in `CreateInviteCode` — docs are sparse. **Spike required during Phase 111** to verify Option B can actually deep-link the user back to `/invites/<token>` after init. If it can't, Option C wins by default.

---

## B vs C — Feature Affinity

Quick reference for the requirements author. "Easier" = less new code on our side.

| # | Feature | Option B (ZITADEL init code) | Option C (App-owned setup page) | Winner |
|---|---------|------------------------------|---------------------------------|--------|
| 1 | **Set password without admin help** (table stakes) | Easy — ZITADEL hosted UI handles it. | Med — we own the form, password POST endpoint, error states. | **B** for speed of delivery |
| 2 | **Contextual "joining {campaign} as {role}" framing on the password page** | Hard — only `applicationName` + ZITADEL branding config; cannot show campaign/role. | Trivial — full control of page content. | **C** for activation quality |
| 3 | **Passkey enrollment at first setup** | Native — enable at the org level in ZITADEL Login V2. | Hard — would need WebAuthn implementation in our backend. | **B** strongly |
| 4 | **Password strength meter + show-password toggle + WCAG-AA tied via aria-describedby** | Outsourced to ZITADEL hosted UI (their compliance, their controls). | We build it — but we already have shadcn/ui, RHF, Zod. Standard work. | **B** for "don't reinvent"; **C** for "we control the bar" |
| 5 | **Idempotent re-invite (existing identity skips setup)** | Both must look up by email before `CreateUser`. Identical work. | Identical work. | **Tie** |
| 6 | **Magic-link / passwordless option** | Native if we enable it in ZITADEL. | Significant new backend work. | **B** strongly |
| 7 | **Mobile UX parity (≥ 44 px tap targets, single-column, native autofill)** | Depends on ZITADEL hosted UI's mobile quality (separately verifiable, but outside our control). | We own it — meets our existing WCAG-AA bar by default. | **C** for control; **B** for not-our-problem |
| 8 | **Deep-link back to `/invites/<token>` after auth setup so user lands on accept** | Depends on `url_template` working as expected — UNVERIFIED, requires spike. | Trivial — we orchestrate the OIDC start ourselves and pass `redirect` through. | **C** until B's deep-link is proven |

**Synthesis for the requirements author:**

- If the Phase-111 spike confirms ZITADEL's `url_template` reliably deep-links back, **Option B** has the lowest delivery cost and gets us passkey support nearly for free. The cost is contextual framing on the password page (we lose it).
- If the spike shows `url_template` is flaky / ZITADEL hosted UI looks visibly off-brand on mobile / we want passkeys to wait, **Option C** wins — more code, but full control of the activation experience and clean integration with our existing same-origin same-stack UI.
- The decision should be made *after* the Phase-111 spike, not before. REQUIREMENTS should encode this as a conditional: "REQ-XX: implement Option B if spike succeeds, otherwise Option C."
