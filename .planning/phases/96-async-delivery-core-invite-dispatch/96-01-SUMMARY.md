# 96-01 Summary

## Outcome

Completed the async invite-delivery core for phase 96 by queueing invite email after commit, adding a public invite-entry route, and routing volunteer invite mode through the same transactional email path.

## What Changed

- Added [`app/services/invite.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/invite.py), [`app/services/invite_email.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/invite_email.py), and [`app/tasks/invite_tasks.py`](/home/kwhatcher/projects/civicpulse/run-api/app/tasks/invite_tasks.py) to queue invite-email work after durable invite writes, render invite emails from app-owned templates, and submit them idempotently in the `communications` queue.
- Extended [`app/models/invite.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/invite.py) and [`alembic/versions/036_invite_async_delivery_state.py`](/home/kwhatcher/projects/civicpulse/run-api/alembic/versions/036_invite_async_delivery_state.py) with minimal invite-email state needed for queueing, submission, skip, and failure tracking.
- Added public invite metadata in [`app/api/v1/invites.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/invites.py) and a same-origin acceptance screen in [`web/src/routes/invites/$token.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/invites/$token.tsx), with [`web/src/routes/__root.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/__root.tsx) updated to treat invite pages as public.
- Routed volunteer invite mode through the shared invite path in [`app/api/v1/volunteers.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/volunteers.py) and updated campaign member / volunteer UI messaging in [`web/src/routes/campaigns/$campaignId/settings/members.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/campaigns/$campaignId/settings/members.tsx) and [`web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx).

## Verification

- `uv run pytest tests/unit/test_invite_service.py tests/unit/test_email_templates.py tests/unit/test_mailgun_provider.py tests/unit/test_email_provider_factory.py`
- `uv run ruff check app/api/v1/invites.py app/api/v1/volunteers.py app/models/invite.py app/schemas/invite.py app/schemas/volunteer.py app/services/invite.py app/services/invite_email.py app/tasks/invite_tasks.py app/tasks/procrastinate_app.py tests/unit/test_invite_service.py`
- `npm run build`
