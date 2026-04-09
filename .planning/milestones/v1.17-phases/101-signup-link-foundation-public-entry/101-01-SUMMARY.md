# 101-01 Summary

## Outcome

Delivered the signup-link foundation for `v1.17` by adding a dedicated
campaign-scoped signup-link resource, a safe public resolver and landing page,
and an admin management surface for creating, copying, regenerating, and
disabling public volunteer signup URLs.

## What Changed

- Added backend signup-link persistence and lifecycle management in
  [`/alembic/versions/038_signup_links.py`](/home/kwhatcher/projects/civicpulse/run-api/alembic/versions/038_signup_links.py),
  [`/app/models/signup_link.py`](/home/kwhatcher/projects/civicpulse/run-api/app/models/signup_link.py),
  [`/app/schemas/signup_link.py`](/home/kwhatcher/projects/civicpulse/run-api/app/schemas/signup_link.py),
  and
  [`/app/services/signup_link.py`](/home/kwhatcher/projects/civicpulse/run-api/app/services/signup_link.py).
- Exposed admin CRUD and neutral public resolution endpoints in
  [`/app/api/v1/signup_links.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/signup_links.py)
  and wired the router in
  [`/app/api/v1/router.py`](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/router.py).
- Added frontend types/hooks plus a public signup landing page in
  [`/web/src/types/signupLink.ts`](/home/kwhatcher/projects/civicpulse/run-api/web/src/types/signupLink.ts),
  [`/web/src/hooks/useSignupLinks.ts`](/home/kwhatcher/projects/civicpulse/run-api/web/src/hooks/useSignupLinks.ts),
  and
  [`/web/src/routes/signup/$token.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/signup/$token.tsx).
- Extended the members settings workflow in
  [`/web/src/routes/campaigns/$campaignId/settings/members.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/campaigns/$campaignId/settings/members.tsx)
  so admins can manage volunteer signup links alongside member invites.
- Added focused regression coverage in
  [`/tests/unit/test_signup_link_service.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_signup_link_service.py),
  [`/tests/unit/test_signup_link_api.py`](/home/kwhatcher/projects/civicpulse/run-api/tests/unit/test_signup_link_api.py),
  and
  [`/web/src/hooks/useSignupLinks.test.ts`](/home/kwhatcher/projects/civicpulse/run-api/web/src/hooks/useSignupLinks.test.ts).

## Verification

- `uv run pytest tests/unit/test_signup_link_service.py tests/unit/test_signup_link_api.py`
- `uv run ruff check app/models/signup_link.py app/schemas/signup_link.py app/services/signup_link.py app/api/v1/signup_links.py app/api/v1/router.py app/db/base.py tests/unit/test_signup_link_service.py tests/unit/test_signup_link_api.py`
- `cd web && npm test -- --run src/hooks/useSignupLinks.test.ts`
- `cd web && npm run build`
