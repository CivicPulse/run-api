# Research Questions

Open research questions captured during exploration and planning sessions.
Each entry includes the session that raised it, the question itself, the
decision surface, and any factors that shape the answer.

When a question is resolved, move it to the relevant plan/spec artifact and
delete the entry here (or mark it resolved with a link).

---

## v1.19 DIY Auth Replan (2026-04-23)

Three design questions surfaced during the `/gsd-explore` session that pivoted
v1.19 from ZITADEL to DIY auth (`fastapi-users` + `CookieTransport` +
`DatabaseStrategy`). These belong in the next plan-phase for the v1.19 replan.

**Session context:** `.planning/notes/decision-drop-zitadel-diy-auth.md`
**Related:** `.planning/seeds/SEED-003-revisit-zitadel-when-sso-needed.md`

### Q-AUTH-01. Email verification: invite-token-as-proof vs explicit verify ceremony

Under DIY we fully control email verification. Is possession of the
invite-token-in-URL itself sufficient proof — i.e., the token was delivered
to that inbox, so at accept-invite we can trust the email and set
`is_verified=true` — or do we want a separate explicit verification ceremony
(e.g., a second "click to confirm" email) post-invite before granting access?

**Threat model factors:**
- Invite token entropy, one-time-use enforcement, and expiration window
  determine whether "token-as-proof" holds against an attacker who
  intercepts or guesses the link.
- Regulatory posture: some compliance frameworks (and some customers)
  expect an explicit verify step regardless of delivery-channel proof.
- If self-serve registration is ever added (currently out of scope for
  v1.19), that path needs its own verification story anyway — worth knowing
  whether we're designing the invite verification consistently with a
  future self-serve path.

**Decision surface:**
- fastapi-users `verify_token_secret` flow: on or off for invite-accepted
  users?
- `is_verified` initial value at invite-accept: `true` (trust token) or
  `false` (require ceremony)?
- If ceremony: inline on the invite-accept page, or separate email click?

### Q-AUTH-02. Password policy rule set

Frontend must show rules at typing-time (live validation); backend must
pre-validate via the fastapi-users `validate_password` hook. No ZITADEL
policy to sync with — this is entirely our decision.

**Candidate rule sets:**
- **zxcvbn (strength-based):** catches dictionary + common-pattern attacks,
  adaptive to newer leaked-password corpora. Heavier frontend dep (~180KB
  minified). Current academic/industry best practice.
- **Length + character class (traditional):** simple to communicate,
  explicit rules ("8+ chars, 1 number, 1 symbol"), low frontend dep cost.
  Known to fail at catching predictable patterns (e.g., `Password1!`).
- **Length-only + HIBP top-N (NIST 800-63B current guidance):** minimum
  length 8 (NIST floor) or 12 (stricter), disallow common passwords via a
  breach-list lookup, no composition rules. Simplest UX, aligned with
  current federal recommendations.

**Decision surface:**
- Which rule set?
- If zxcvbn: strength threshold (3 = "safely unguessable", 4 = "very
  unguessable")?
- If HIBP: client-side k-anonymity API lookup, or server-side on register?
- How do we communicate rules in the setup UI without making it feel
  hostile? (First-time volunteers are a low-tech audience.)

### Q-AUTH-03. Session lifecycle under DatabaseStrategy

Determines `access_token` row expiry strategy, cookie `Max-Age`, refresh
behavior, and logout-all-sessions semantics.

**Decision surface:**
- **Absolute timeout:** does a session expire N hours/days after issue
  regardless of activity? (E.g., 7 days max, regardless of use.)
- **Idle timeout:** does a session expire after N minutes without activity?
  (E.g., 30 min idle for admin surfaces, longer for field volunteers
  mid-shift.)
- **Refresh-on-activity:** does each authenticated request extend the token
  lifetime, or are tokens fixed-lifetime requiring re-auth at expiry?
- **Logout-all-sessions triggers:** password change? admin account-disable?
  explicit "log out everywhere" UI?
- **Device/session visibility:** does the user see "your active sessions"
  and can they revoke individual ones?

**Field-ops context that matters here:** volunteers on 4-hour door-knocking
shifts shouldn't be kicked out mid-canvass; admin surfaces should err
tighter; lost-device recovery must be fast (admin-initiated revoke of a
specific user's sessions).

**Downstream impact:** this decision determines whether the `access_token`
table gets a periodic cleanup task in Procrastinate (to purge expired
rows) and how we handle the cookie `Max-Age` vs. server-side TTL mismatch
(which is the common source of "why am I logged out, I just did something"
bugs).
