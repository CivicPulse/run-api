# Phase 102: Volunteer Applications & Existing-Account Intake — Context

**Gathered:** 2026-04-09
**Status:** Implemented

## Phase Boundary

Public signup links now need a real application flow, but they still must not grant campaign access or create trusted membership on submit.

## Decisions

- Applications are stored in a dedicated `volunteer_applications` table instead of overloading `volunteers` or the legacy join flow.
- Public signup-link submission stays separate from membership creation; only Phase 103 approval creates `CampaignMember` and active `Volunteer` rows.
- Existing CivicPulse users apply through authenticated signup-link submission so the form can prefill known profile data and avoid duplicate account paths.
- Signup-link attribution is snapshotted onto each application (`signup_link_id`, `signup_link_label`) so later link lifecycle changes do not erase source history.

## Existing Code Insights

- `signup_links` already provides the safe public token resolver and admin lifecycle controls.
- `join.register_volunteer()` was intentionally not reused because it grants access immediately.
- Invite queue patterns were reused for pending-state modeling, admin review UI shape, and dedupe expectations.

## Specific Ideas

- Add a public current-user application status endpoint so revisits render pending/approved/rejected state instead of a blind form.
- Keep the public page fail-closed for invalid links and route unauthenticated users through the existing login flow before submission.
