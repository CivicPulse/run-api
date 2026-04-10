status: passed

# Verification

## Phase Goal

Valid campaign signup links support a true public volunteer application flow for anonymous and existing CivicPulse users without granting campaign access before approval.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| APPL-01 | satisfied | `app/api/v1/volunteer_applications.py` now accepts optional auth for public submit/status, and `web/src/routes/signup/$token.tsx` renders the application form for anonymous visitors. |
| APPL-04 | satisfied | Signed-in users still reuse the same flow with `applicant_user_id` carried through the service layer instead of creating a second account path. |
| APPL-05 | satisfied | `web/src/routes/signup/$token.tsx` still prefills known profile data and reloads current application details for authenticated users. |

## Checks Run

- `uv run pytest tests/unit/test_volunteer_application_service.py tests/unit/test_volunteer_application_api.py`
- `cd web && npm test -- --run src/routes/campaigns/$campaignId/settings/members.test.tsx`

## Outcome

Anonymous visitors can now complete the volunteer-application flow from a valid signup link, while authenticated users retain the low-friction prefilled experience and the campaign-access approval gate remains intact.
