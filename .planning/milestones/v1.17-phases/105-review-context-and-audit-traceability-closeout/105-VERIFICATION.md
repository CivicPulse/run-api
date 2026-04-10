status: passed

# Verification

## Phase Goal

Campaign admins can review volunteer applications with the full context required for safe decisions, and the milestone carries the traceability artifacts needed to pass re-audit.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| REVW-02 | satisfied | `app/services/volunteer_application.py` derives existing-account, existing-member, prior-status, and approval-delivery context; `web/src/routes/campaigns/$campaignId/settings/members.tsx` renders it in the admin review table. |
| SAFE-03 | satisfied | Existing members now stay in the review flow, approval remains idempotent, and anonymous-approved applicants are routed through `InviteService` instead of creating duplicate access records or failing closed. |

## Checks Run

- `uv run pytest tests/unit/test_volunteer_application_service.py tests/unit/test_volunteer_application_api.py`
- `cd web && npm test -- --run src/routes/campaigns/$campaignId/settings/members.test.tsx`

## Outcome

The volunteer-application review flow now exposes the missing duplicate/existing-account context, existing-member approvals preserve reviewer semantics, and the milestone documentation set reflects the actual delivered requirements.
