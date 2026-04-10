---
phase: 96-async-delivery-core-invite-dispatch
verified: 2026-04-08T17:35:51Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
human_verification: []
---

# Phase 96: Async Delivery Core & Invite Dispatch Verification Report

**Phase Goal:** Existing invite flows create durable domain state first and then dispatch real transactional email through an idempotent background delivery path.  
**Verified:** 2026-04-08T17:35:51Z  
**Status:** passed

## Goal Achievement

| Truth | Status | Evidence |
|---|---|---|
| Creating a campaign member invite commits durable invite state before asynchronous email work is deferred. | ✓ VERIFIED | [`app/services/invite.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/invite.py) commits the invite row first, then updates persisted delivery state and defers the background task via a queueing lock keyed to the invite ID. |
| Existing invite flows that promise an email invite use the shared transactional path instead of bespoke placeholder behavior. | ✓ VERIFIED | [`app/api/v1/invites.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/invites.py) returns delivery state from the shared invite service, and [`app/api/v1/volunteers.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/volunteers.py) routes volunteer invite mode through that same service. |
| Invite emails render the expected inviter, org/campaign, role, and expiry context through app-owned templates. | ✓ VERIFIED | [`app/services/invite_email.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/invite_email.py) builds campaign invite payloads from the phase 95 template seam, and [`tests/unit/test_email_templates.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_email_templates.py) plus [`tests/unit/test_mailgun_provider.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_mailgun_provider.py) cover rendering and provider submission shape. |
| Invite links land on a same-origin public entry path that can explain state, preserve login redirect, and accept the invite. | ✓ VERIFIED | [`app/api/v1/invites.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/invites.py) exposes public invite metadata, [`web/src/routes/invites/$token.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/invites/$token.tsx) handles valid/expired/revoked/accepted states and accept flow, and [`web/src/routes/__root.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/__root.tsx) keeps the invite entry route public. |
| Queue retries and queue failures do not require duplicate invite rows or misreport durable invite creation as a hard send failure. | ✓ VERIFIED | [`app/tasks/invite_tasks.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/invite_tasks.py) no-ops when the invite is missing, revoked, expired, or already sent, while [`app/services/invite.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/invite.py) now persists `failed` delivery state instead of raising after the invite is already committed; coverage was added in [`tests/unit/test_invite_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_invite_service.py). |

## Automated Verification

| Command | Result |
|---|---|
| `uv run pytest tests/unit/test_invite_service.py tests/unit/test_email_templates.py tests/unit/test_mailgun_provider.py tests/unit/test_email_provider_factory.py` | `21 passed, 1 warning` |
| `uv run ruff check app/api/v1/invites.py app/api/v1/volunteers.py app/models/invite.py app/schemas/invite.py app/schemas/volunteer.py app/services/invite.py app/services/invite_email.py app/tasks/invite_tasks.py app/tasks/procrastinate_app.py tests/unit/test_invite_service.py tests/test_observability.py` | `All checks passed!` |
| `npm run build` | `passed` |

## Residual Risks

- Delivery truth still stops at provider submission in this phase; delivered, bounced, complained, and suppression outcomes remain phase 97 work.
- Volunteer invite mode returns the volunteer resource, so operators must use the pending-invites surface to inspect delivery state details.
- Build output still reports existing chunk-size warnings unrelated to this phase’s invite changes.

## Outcome

Phase 96 is complete and verified. CivicPulse now creates durable invite state first, queues invite email through the communications worker, exposes same-origin invite acceptance entry, and keeps queue-failure state observable without forcing duplicate invite creation.
