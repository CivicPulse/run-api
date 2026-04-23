---
id: SEED-003
status: dormant
planted: 2026-04-23
planted_during: v1.19 Invites & Signup — Phase 111 spike-FAIL replan (/gsd-explore session)
trigger_when: Customer SSO/SAML request, MFA/TOTP becomes a product requirement, enterprise compliance driver touches IdP posture, or regulatory requirement we can't cleanly meet in-house
scope: Medium
---

# SEED-003: Revisit ZITADEL (or another external IdP) when SSO/MFA/enterprise drivers appear

## Why This Matters

v1.19 pivoted from ZITADEL to DIY auth (fastapi-users + `CookieTransport` +
`DatabaseStrategy`) after the Phase 111 `urlTemplate` spike failed on ZITADEL
v4.10.1's bundled legacy login UI (the v2 TypeScript login app is a separate
Next.js deployment, not bundled — not a fundamental ZITADEL flaw, but the
kind of 3rd-party-surface friction we kept hitting).

The pivot was **tactical in motivation** — same engineering effort as
finishing Option C non-ROPC (~2-3 weeks either way), but every auth surface
under our control. It was explicitly **not** "IdPs are bad" or "we'll never
want SSO." See `.planning/notes/decision-drop-zitadel-diy-auth.md` for the
full decision record.

The cost of the pivot is that we now own:
- Password storage and rotation liability (argon2id via fastapi-users handles
  the crypto, but breach response and postmortem is on us).
- Password-reset, email-verify, account-lockout email pipelines.
- Any future SSO / SAML / OAuth-provider integration we need to build from
  scratch rather than wire up.

If a near-term driver emerges that wants any of these outsourced, DIY becomes
temporary scaffolding and an external IdP (ZITADEL or otherwise) reappears in
the design.

## When to Surface

**Trigger conditions** — present this seed during `/gsd-new-milestone` or
adjacent planning when any of these is in scope:

- **Customer asks for SSO** — Google Workspace, Microsoft Entra, Okta.
  "Bring-your-own-IdP" for a campaign's internal staff is the most likely
  first ask. Retail campaigns won't care; larger statewide ones will.
- **MFA / TOTP becomes a product requirement** — technically buildable
  in-house (fastapi-users has a TOTP extension) but an IdP makes it an
  integration rather than an engineering project.
- **SAML** enters the conversation — enterprise-buyer signal. Never worth
  building ourselves; always worth paying someone for.
- **Compliance driver** — SOC 2, HIPAA-adjacent posture for health-advocacy
  campaigns, state campaign-finance regulation — where "we use an established
  OIDC provider" is a materially shorter conversation with auditors than
  "we built our own auth stack."
- **Breach-scenario planning** — hypothetical but relevant: if we have a
  password-table incident, the postmortem likely recommends moving credential
  storage out of our perimeter. Better to plan this exit path now than
  under incident pressure.

Surface during `/gsd-new-milestone` whenever the scope touches: auth, user
management, enterprise / multi-tenancy features, or compliance.

## Return Path Notes

The DIY architecture has been designed with swap-back in mind — cookie-based
SPA auth was the *one* design choice that tips slightly permanent (because
the frontend auth contract changes), but the backend seams remain clean.

### If we return to ZITADEL specifically

- **Don't re-attempt the `urlTemplate` spike on v4.10.x** without first
  verifying the v2 TypeScript login app is deployed alongside the server.
  v4.10.1 ships only the legacy Go-templates UI; the v2 login app
  (`zitadel/typescript` as a Next.js app) is what honors `urlTemplate`.
  See: `.planning/phases/111-urltemplate-spike-zitadel-service-surface/111-SPIKE-VERDICT.md`.
- Alternative: pin ZITADEL to a version known to bundle v2 login. Verify
  before committing.
- With DIY already in place, ZITADEL can be reintroduced as an **OIDC provider
  alongside** password login (via fastapi-users' OAuth integration) rather
  than a total replacement. Legacy DIY-auth users stay on password login;
  new users and SSO-enabled customers onboard via ZITADEL.

### If we choose a different IdP

Candidates worth evaluating by axis:

- **WorkOS** — strong for SSO-as-a-feature, targeted at B2B "Enterprise
  Ready" use cases. Right fit if the trigger is customer-driven SSO.
- **Auth0** — mature, expensive at scale, friction-free.
- **Supabase Auth** — OIDC-compatible, inexpensive, good if we're also
  using Supabase for anything else (we currently aren't).
- **Clerk** — full replacement including UI components; heavy, opinionated.
- **ZITADEL again** — open-source, self-hosted, but same surface-ownership
  problems we just pivoted away from.

The same swap-back discipline applies regardless of which IdP — keep the
SPA auth surface and FastAPI session-exchange layer abstracted so we don't
have to rewrite the frontend again. This means: don't let any one IdP's
SDK bleed into route guards or query hooks.

## Scope Estimate

**Medium** — depends on the re-introduction path:

- **ZITADEL (or any IdP) as OIDC provider alongside DIY:**
  ~1-2 weeks. Reintroduce `oidc-client-ts` (or equivalent) behind a
  provider-toggle surface, wire fastapi-users' OAuth integration, add
  account-linking for existing users.
- **Full IdP replacement (rip out DIY):**
  ~2-3 weeks — a mirror of the current pivot in reverse, with an added
  migration step for existing password-based users (password-reset-forced
  or silent migration via a login-time IdP-federation prompt).
- **SSO-only for enterprise tier (DIY stays for retail tier):**
  ~2 weeks. Most likely shape if the trigger is a single enterprise
  customer asking for their corporate IdP.

## References

- Architectural pivot decision: `.planning/notes/decision-drop-zitadel-diy-auth.md`
- Phase 111 spike-FAIL verdict: `.planning/phases/111-urltemplate-spike-zitadel-service-surface/111-SPIKE-VERDICT.md`
- Research context (pitfall analysis, option comparison): `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`
