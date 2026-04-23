---
title: Architectural decision — Drop ZITADEL, adopt DIY auth (fastapi-users + cookie + Postgres)
date: 2026-04-23
context: v1.19 Phase 111 urlTemplate spike-FAIL replan
session: "/gsd-explore — Option C non-ROPC design (pivot)"
tags: [architecture, auth, decision, zitadel, fastapi-users, v1.19, tactical-pivot]
---

# Decision — Drop ZITADEL, adopt DIY auth (fastapi-users + cookie + Postgres)

## Decision

**Stop integrating with ZITADEL. Build native auth on top of `fastapi-users`
15.0.5 using `CookieTransport` + `DatabaseStrategy` (Postgres-backed session
tokens — no new infra service).** No ROPC, no OIDC in the
SPA, no ZITADEL v2 Sessions API integration. CSRF via double-submit cookie +
`X-CSRF-Token` header (our own middleware, ~40 LOC).

This is a **tactical** move in intent — ZITADEL stays in the project's
"things we might come back to" list — but the session-model choice
(httponly cookies, not JWT-in-Authorization) is acknowledged to lean
**permanent** because the frontend auth contract changes, not just the
backend.

## What Triggered This

### Proximate trigger

Phase 111's `urlTemplate` deep-link spike ended with
[verdict: FAIL](../phases/111-urltemplate-spike-zitadel-service-surface/111-SPIKE-VERDICT.md).
ZITADEL v4.10.1's server binary bundles only the legacy Go-templates login
UI at `/ui/login/*`. The v2 TypeScript login app (which is the component
that honors `urlTemplate` from `CreateInviteCode`) is distributed as a
separate Next.js app that must be deployed alongside the server. It is not
bundled.

The replan was going to be **Option C non-ROPC** — app-owned password-set
page on `run.civpulse.org` with one of:
- a 2nd password entry at `auth.civpulse.org` after we set it (UX regression), or
- v2 Sessions API integration to mint a ZITADEL session from the just-set
  password (custom-login-UI-territory, significant added complexity).

Plus [S1 mitigation](../research/PITFALLS.md) (ZITADEL #10319 —
`initialPassword` bypasses email verification) and
password-policy surfacing (rules must be shown at typing-time AND
pre-validated in our backend to avoid post-submit ZITADEL rejection).

### Underlying trigger

Accumulated friction: the v1.19 research surfaced 3 extra pitfalls and +11
severity points unique to Option C that we'd inherit even under a successful
integration. The sizing analysis during this exploration found DIY auth is
**roughly the same engineering time** as finishing Option C (~2–3 weeks
either way), but DIY moves every auth surface under our control and
eliminates future ZITADEL-version-bundling landmines.

Once the paths are cost-equivalent, the ownership case wins.

## Rationale

1. **Effort parity.** Option C non-ROPC (v2 Sessions path) ≈ DIY native auth
   ≈ ~2–3 weeks of focused work. When DIY isn't more expensive, the
   argument for a third-party IdP collapses unless it's buying us something
   specific (SSO, compliance posture, MFA) — which v1.19 doesn't need.
2. **Surface ownership.** The invite flow, password-set UX, verification
   ceremony, and policy surfacing are all things we wanted to own at the
   UX layer anyway. DIY makes that automatic.
3. **Eliminates class of blockers.** The spike-FAIL was a ZITADEL *version*
   problem, not a fundamental one — but the v2 TypeScript login bundling
   quirk is exactly the kind of 3rd-party-surface risk we keep hitting.
4. **No near-term driver to keep ZITADEL.** No customer has asked for SSO;
   no compliance conversation hinges on "we use an OIDC IdP"; MFA/TOTP is
   not a v1.x product requirement.

## Decisions Made During This Exploration

| Decision | Value | Reason |
|---|---|---|
| Library | `fastapi-users` 15.0.5 | Active (released 2026-03-27), async SQLAlchemy 2.x native, cookie+database sessions first-class via `CookieTransport`+`DatabaseStrategy` — no new infra service required |
| Session model | Server-side opaque tokens in Postgres (new `access_token` table, managed by fastapi-users `SQLAlchemyAccessTokenDatabase`) | Not stateless JWT-in-cookie — enables eager revocation, logout-all-sessions, no key rotation burden. Postgres chosen over Redis because (a) Redis is not currently in the stack — docker-compose.yml has no redis service, pyproject has no redis dep — and (b) our auth RPS doesn't justify adding a service; PK lookup on an indexed token column is trivially fast at our scale |
| Cookie attributes | `httponly=True`, `samesite="lax"`, `secure=True` in prod | Standard OWASP guidance for SPA auth |
| CSRF | Double-submit (our `X-CSRF-Token` header middleware, ~40 LOC) | No 2026 FastAPI auth library ships CSRF; rolling our own is unavoidable |
| Frontend | `oidc-client-ts` removed entirely; `web/src/api/client.ts` switches to `credentials: 'include'` | Cookie rides automatically; `Authorization: Bearer` pattern goes away |
| User model | Alembic migration to `fastapi-users` base mixin shape (`email`, `hashed_password`, `is_active`, `is_superuser`, `is_verified`, `id`) | fastapi-users couples to the ORM model; one-shot schema reshape is the cost |
| Password hashing | argon2id (fastapi-users default via `passlib`/`argon2-cffi`) | Current best practice; no reason to override |
| Scope exclusions | No SSO scaffolding, no OAuth provider abstraction, no SAML | "Tactical" framing — don't build for hypothetical futures |

## What Goes Away

- `app/services/zitadel.py` (~all methods)
- ZITADEL service in `docker-compose.yml` and its config
- `scripts/bootstrap-zitadel.py` + `.zitadel-data/` bootstrap artifacts
- OIDC JWKS validation in FastAPI auth dependency
- `oidc-client-ts` dependency and all its wiring in the SPA
- ZITADEL-specific columns on `users` (e.g., `zitadel_user_id`,
  `zitadel_sub`), replaced with fastapi-users base mixin columns
- `create-e2e-users.py` rewired to call our own `/auth/register` / invite
  admin endpoints instead of ZITADEL's v2 API

## What Stays

- **Invite token model** — already app-owned; the `/invites/<token>`
  landing page design survives; only the "call ZITADEL `CreateInviteCode`"
  step is removed.
- **Mailgun delivery** via `invite_email.py` + `invite_tasks.py`
  Procrastinate pipeline.
- **Role binding at invite-accept time** — `campaign_members` rows are
  still created the same way.
- **Requirements around UX** (EMAIL-01, UX-01 invite-landing behavior) —
  the letter of EMAIL-03 changes (no more `urlTemplate`), but the
  single-click-accept UX goal is preserved and actually easier to achieve.

## Open Questions (→ research/questions.md)

Three design questions surfaced during the pivot that belong in the
replan's plan-phase research:

1. **Email verification under DIY.** Is possession of the invite-token-in-email
   itself the email-verification signal (`is_verified=true` at accept-invite),
   or do we want a separate explicit verify ceremony? Threat-model-driven.
2. **Password policy rule set.** zxcvbn (strength-based) vs.
   length+character-class (traditional) vs. length-only (NIST 800-63B current).
   Decide the frontend live-validation + backend `validate_password` hook
   contract.
3. **Session lifecycle.** Idle timeout, absolute timeout,
   refresh-on-activity behavior under `DatabaseStrategy`, and
   logout-all-sessions semantics. Determines `access_token` row expiry
   strategy and cookie `Max-Age`. Redis can be reconsidered later as a
   session-lookup cache if Postgres hot-path contention ever shows up in
   practice — not needed up front.

## Implications for v1.19

- **Phase 111** stays as-is — spike-FAIL record is the decision artifact.
- **Phases 112–116** are all ZITADEL-dependent and need wholesale rewrites.
- **REQUIREMENTS.md** needs updates — current REQ-* entries (esp. `EMAIL-03`,
  `UX-01`, Option-C/ROPC out-of-scope language) are ZITADEL-shaped.
- The actual replan is a `/gsd-plan-phase` or `/gsd-new-milestone` decision
  (out of scope for this note). The structural choice is:
  (a) rewrite 112–116 in place for DIY, or
  (b) close v1.19 as "research+pivot milestone" and start v1.20 as the
  DIY-auth build-out milestone.

## Tripwires for Revisiting ZITADEL

See [SEED-003](../seeds/SEED-003-revisit-zitadel-when-sso-needed.md).
Short version: SSO request, MFA/TOTP product requirement, enterprise SAML,
or a compliance driver we can't cleanly answer in-house.
