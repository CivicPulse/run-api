# v1.19 Invite Onboarding Roadmap

**Milestone:** v1.19 Invite Onboarding
**Goal:** Make the volunteer-invite link work end-to-end for brand-new users — clicking the link leads to a working "set password → accept invite" flow without manual admin intervention or generic-login dead-ends.
**Granularity:** standard (5 phases, continuing from Phase 110)
**Coverage:** 29/29 v1.19 requirements mapped
**Last updated:** 2026-04-23

---

## Strategy

Derived from `.planning/research/SUMMARY.md` which converged on **Option B** (ZITADEL `invite_code` flow with `urlTemplate` deep-link) across all four research workstreams. Phase 111 opens with a one-day spike that gates the rest of the milestone — if the deep-link UX fails end-to-end on the prod-equivalent ZITADEL 2.71.x instance, the milestone replans to Option C non-ROPC. ROPC is out of scope under every branch.

Phase dependencies are strictly sequential (111 → 112 → 113 → 114 → 115). Each phase delivers a verifiable capability; none ship partial functionality that depends on a subsequent phase.

**Test obligations:** TEST-01 (unit), TEST-02 (integration), TEST-03 (E2E), and TEST-04 (baseline trustworthiness before each phase-exit gate) are cross-cutting per-phase obligations — the same pattern used in v1.18. They are formally anchored to Phase 115 in the traceability table for the milestone-final pass, and they appear as explicit success criteria on every code-changing phase 111-115.

---

## Phases

- [ ] **Phase 111: `urlTemplate` Spike + ZITADEL Service Surface** — Verify ZITADEL deep-link behavior; ship `ensure_human_user` + `create_invite_code` with bounded retry and least-privilege scope
- [ ] **Phase 112: Schema Migration + Legacy-Invite Handling** — Add provisioning columns to invites; mark pre-v1.19 pending invites legacy_flow so deploy does not couple to ZITADEL availability
- [ ] **Phase 113: Provisioning Step in Email Task + Branched Email Content** — Extend `send_campaign_invite_email` with idempotent ZITADEL provisioning and first-time-vs-returning email branching
- [ ] **Phase 114: Frontend `/login` Interstitial + Empty-Membership Login Gate** — Ship the pre-redirect `/login` context, the OIDC-callback empty-membership gate, auto-landing-authed verification on `/invites/<token>`, and the email-mismatch recovery page
- [ ] **Phase 115: Resend, Recovery, and Observability** — Admin resend, transparent init-code re-mint, public "request a fresh invite" endpoint, funnel telemetry, admin pending-invite visibility extension

---

## Phase Details

### Phase 111: `urlTemplate` Spike + ZITADEL Service Surface

**Goal:** Prove that ZITADEL's `urlTemplate` reliably deep-links an authenticated invitee back to `/invites/<token>` after they set a password, then ship the ZITADEL service surface the rest of the milestone depends on.

**Depends on:** Nothing (first phase of milestone; continues sequentially from v1.18 Phase 110).

**Requirements:** PROV-01, PROV-02, PROV-03, SEC-03

**Success Criteria** (what must be TRUE):
1. A dev-environment spike call to `POST /v2/users/{userId}/invite_code` with our templated URL lands the invitee back on `/invites/<token>` with a fresh authenticated OIDC session visible to `oidc-client-ts` — or, if the spike fails, the milestone is explicitly replanned to Option C non-ROPC and this phase is marked blocked with a replan note.
2. `ZitadelService.ensure_human_user(email, given_name, family_name, org_id) -> (user_id, created)` is implemented using the search-then-create idempotency pattern mirroring `ensure_project_grant`, sets `email.isVerified=true`, and returns whether the identity was newly created or already existed.
3. `ZitadelService.create_invite_code(user_id, url_template) -> code` posts to the v2 invite-code endpoint with `{"returnCode": {}}` so CivicPulse emails the code via Mailgun instead of letting ZITADEL send it.
4. Both new service methods share the existing bounded exponential retry (3x, 1/2/4s) on 5xx/connect/timeout errors, matching the `bootstrap-zitadel.py:102-117` pattern, with unit tests covering retry exhaustion, retry success, and idempotent re-entry.
5. The ZITADEL service-account PAT is confirmed scoped to `ORG_USER_MANAGER` + `ORG_PROJECT_USER_GRANT_EDITOR` on the CivicPulse org (not `IAM_OWNER`); if over-privileged today, it is narrowed inside this phase.
6. Phase-exit gate: pytest/vitest/Playwright baselines remain green on consecutive runs per TEST-04; every changed file has unit coverage per TEST-01; every new service boundary has integration coverage per TEST-02.

**Plans:** TBD

---

### Phase 112: Schema Migration + Legacy-Invite Handling

**Goal:** Give the `invites` table the provisioning columns the new flow needs and decouple deploy from ZITADEL availability by routing pre-v1.19 pending invites through a legacy-flow recovery path instead of a deploy-time backfill.

**Depends on:** Phase 111 (service surface must exist before the migration references the new columns semantically, even though the migration itself is schema-only).

**Requirements:** MIG-01, MIG-02, MIG-03, SEC-04

**Success Criteria** (what must be TRUE):
1. An Alembic migration adds `zitadel_user_id`, `identity_provisioning_status`, `identity_provisioning_error`, `identity_provisioning_at`, and `legacy_flow` to the `invites` table; all datetime columns use `DateTime(timezone=True)`.
2. The same migration marks every pre-v1.19 pending invite (no `zitadel_user_id`) with `legacy_flow=true` via pure SQL `UPDATE` so the migration runs without contacting ZITADEL and cannot fail on ZITADEL unavailability at deploy time.
3. The migration is reversible — downgrade drops all added columns cleanly — and has been dry-run against a production snapshot.
4. A ruff rule or unit test guards against naive-datetime regression: all new timestamp writes must use `datetime.now(UTC)`, never `datetime.utcnow()` (O6 mitigation).
5. Phase-exit gate: pytest/vitest/Playwright baselines remain green on consecutive runs per TEST-04; the migration has integration coverage proving both upgrade and downgrade per TEST-02.

**Plans:** TBD

---

### Phase 113: Provisioning Step in Email Task + Branched Email Content

**Goal:** Wire ZITADEL provisioning into the existing durable invite-delivery task so brand-new invitees get a ZITADEL identity and an init-code link in their email, while returning invitees get the existing direct-accept link — with retry-safe idempotency across DB, queue, and ZITADEL layers.

**Depends on:** Phase 111 (service surface), Phase 112 (schema columns).

**Requirements:** PROV-04, PROV-05, EMAIL-01, EMAIL-02, EMAIL-03

**Success Criteria** (what must be TRUE):
1. `send_campaign_invite_email` (Procrastinate `communications` queue) calls `ensure_human_user` under the existing per-invite `queueing_lock`, guarded by `if invite.zitadel_user_id is None`, so a full task retry never creates a duplicate ZITADEL user and never sends a duplicate email.
2. Partial-failure recovery works end-to-end: if `ensure_human_user` succeeds but the subsequent role-grant or email-send fails, the next retry reuses the existing ZITADEL user via search and does not create a duplicate — proven by an integration test that simulates a mid-task crash.
3. The invite email content branches on the `(user_id, created)` signal from `ensure_human_user`: first-time invitees receive a "set your password to accept this invite" subject/body with the ZITADEL init link; returning invitees receive the existing "accept your invite" subject/body with the direct `/invites/<token>` link.
4. Both email variants preserve inviter name, campaign name, organization, role, and expiry date, with a plain-text fallback, semantic HTML, and no image-only content.
5. The init-link URL uses ZITADEL's `urlTemplate` parameter in the exact placeholder shape confirmed by the Phase-111 spike (`https://run.civpulse.org/invites/<token>?zitadelCode={{.Code}}&userID={{.UserID}}`).
6. Phase-exit gate: pytest/vitest/Playwright baselines remain green on consecutive runs per TEST-04; every changed file has unit coverage per TEST-01; the task boundary has integration coverage for ZITADEL-down retry, ZITADEL-up happy-path, revoke-between-provision-and-email skip, and duplicate-retry idempotency per TEST-02.

**Plans:** TBD

---

### Phase 114: Frontend `/login` Interstitial + Empty-Membership Login Gate

**Goal:** Make the frontend handle every arrival pattern into the invite-accept flow without dead-ends: fresh authed redirects, stale-session bounces through `/login`, empty-membership post-setup logins, and email-mismatch accept attempts.

**Depends on:** Phase 113 (provisioned invite emails must exist end-to-end so `/invites/<token>` can be exercised against real first-time and returning flows).

**Requirements:** UX-01, UX-02, UX-03, UX-04, SEC-01, SEC-02

**Success Criteria** (what must be TRUE):
1. A user who completes ZITADEL setup and is redirected to `/invites/<token>` by `urlTemplate` sees the Accept-invite confirmation page without a second sign-in click — `oidc-client-ts` picks up the fresh session, verified by an E2E run of the full create-invite → email-link → hosted-setup → accept path via `web/scripts/run-e2e.sh`.
2. A user bounced to `/login?redirect=/invites/<token>` from a stale session sees a brief contextual interstitial ("You're signing in to accept your invite to <campaign>") before the OIDC redirect, so they are never stranded on "Redirecting…".
3. The OIDC-callback handler enforces an empty-membership gate — a ZITADEL user with zero campaign/organization memberships is redirected to an accept-invite prompt instead of receiving a session cookie that exposes empty tenant context (Pitfall M1 mitigation). Covered by an integration test that asserts empty-membership login returns 302 to the gate, never 200.
4. An email-mismatch accept attempt renders an explicit "this invite is for X, you signed in as Y" recovery page with three actions: log out, request a re-send, contact the campaign admin. Case-insensitive match enforcement preserved from `invite.py:202-205` (SEC-01).
5. Invite-token reuse is prevented: `accepted_at` is set under `SELECT FOR UPDATE` inside the accept transaction; a second use returns 410 Gone (SEC-02 / S4 mitigation), proven by a concurrent-accept integration test.
6. Phase-exit gate: pytest/vitest/Playwright baselines remain green on consecutive runs per TEST-04; every changed file has unit coverage per TEST-01; every new boundary has integration coverage per TEST-02; the end-to-end first-time and returning-user flows each have E2E coverage per TEST-03.

**Plans:** TBD
**UI hint**: yes

---

### Phase 115: Resend, Recovery, and Observability

**Goal:** Close the operational loops around the new flow — expired init codes auto-recover, legacy-flow invitees and stuck users have a self-service path, admins can resend on demand, and the whole funnel is observable end-to-end.

**Depends on:** Phase 114 (the recovery surfaces attach to the frontend/backend accept flow shipped in 114).

**Requirements:** RECOV-01, RECOV-02, RECOV-03, RECOV-04, OBS-01, OBS-02, TEST-01, TEST-02, TEST-03, TEST-04

**Success Criteria** (what must be TRUE):
1. When a CivicPulse invite is still valid but the ZITADEL init code has expired, the accept-flow read path transparently calls `create_invite_code` again to mint a fresh code and surfaces the new link to the user with no admin intervention (RECOV-01 / Z1 / U2 mitigation).
2. The expired-invite UI shows a "Request a fresh invite" button that hits a rate-limited public endpoint (per-token and per-IP via slowapi, no captcha) and emails the campaign admin team. Legacy-flow invites (MIG-02) surface the same CTA on first click so pre-v1.19 invitees have a path forward (RECOV-02, RECOV-04).
3. `POST /api/v1/invites/{id}/resend` is available to admins and re-calls `create_invite_code`, with messaging to both admin and user surfacing that any prior code is invalidated per ZITADEL docs (RECOV-03).
4. Structured funnel events (`invite.link_clicked`, `invite.password_shown`, `invite.zitadel_redirected`, `invite.accept_clicked`, `invite.completed`) are emitted via structlog request telemetry for future dashboard wiring (OBS-01 / O5 mitigation).
5. The admin pending-invite view exposes `identity_provisioning_status` and (when non-null) `identity_provisioning_error` alongside email-delivery status so staff can see where an invite got stuck end-to-end (OBS-02).
6. Milestone-final test pass: pytest/vitest/Playwright baselines remain green on consecutive runs (TEST-04); every v1.19-modified file has unit coverage (TEST-01); every API and service boundary touched in v1.19 has integration coverage including `ensure_human_user` idempotency across retries, `create_invite_code` against a mocked ZITADEL, the empty-membership login gate, and the migration's legacy-flow marking (TEST-02); every user-visible behavior changed in v1.19 has E2E coverage via `web/scripts/run-e2e.sh` including the first-time invite → set password → accept flow and the returning-user → accept flow (TEST-03).

**Plans:** TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 111. urlTemplate Spike + ZITADEL Service Surface | 1/6 | Blocked (spike FAIL) | 2026-04-23 |
| 112. Schema Migration + Legacy-Invite Handling | 0/? | Not started | - |
| 113. Provisioning Step in Email Task + Branched Email | 0/? | Not started | - |
| 114. Frontend `/login` Interstitial + Empty-Membership Gate | 0/? | Not started | - |
| 115. Resend, Recovery, and Observability | 0/? | Not started | - |

---

## Coverage Validation

All 29 v1.19 requirements mapped to exactly one phase. No orphans. No duplicates.

TEST-01/02/03/04 are anchored to Phase 115 in the traceability table for the milestone-final pass, and referenced as per-phase exit-gate success criteria on all code-changing phases 111-115 (same pattern used in v1.18).

| Phase | Requirements | Count |
|-------|--------------|-------|
| 111 | PROV-01, PROV-02, PROV-03, SEC-03 | 4 |
| 112 | MIG-01, MIG-02, MIG-03, SEC-04 | 4 |
| 113 | PROV-04, PROV-05, EMAIL-01, EMAIL-02, EMAIL-03 | 5 |
| 114 | UX-01, UX-02, UX-03, UX-04, SEC-01, SEC-02 | 6 |
| 115 | RECOV-01, RECOV-02, RECOV-03, RECOV-04, OBS-01, OBS-02, TEST-01, TEST-02, TEST-03, TEST-04 | 10 |
| **Total** | | **29** |
