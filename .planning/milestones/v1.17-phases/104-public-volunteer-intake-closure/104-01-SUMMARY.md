---
phase: 104
plan: 01
requirements_completed:
  - APPL-01
  - APPL-04
  - APPL-05
---

# Summary 104-01: Anonymous Public Volunteer Intake

## Delivered

- Opened the public volunteer-application endpoints to optional authentication so anonymous visitors can submit from a valid signup link.
- Preserved the signed-in prefill and current-application status path for existing CivicPulse users.
- Changed intake semantics so existing campaign members stay reviewable instead of auto-approving themselves, and rejected applicants can submit a fresh application.
- Added backend and frontend regression coverage for the anonymous intake path and the updated review-safe behavior.

## Verification

- `uv run pytest tests/unit/test_volunteer_application_service.py tests/unit/test_volunteer_application_api.py`
- `cd web && npm test -- --run src/routes/campaigns/$campaignId/settings/members.test.tsx`
