# Phase 104: Public Volunteer Intake Closure - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore a true public volunteer application path on valid signup links so anonymous visitors can submit without authentication, while preserving the lower-friction authenticated path for existing CivicPulse users.

</domain>

<decisions>
## Implementation Decisions

### Public Application Entry
- The public signup form remains on the existing same-origin signup route instead of introducing a second anonymous-only flow.
- Authentication becomes optional for the public application endpoints so anonymous applicants and signed-in applicants both hit the same intake contract.
- Signed-in visitors keep profile-prefill and current-application status lookup; anonymous visitors submit the same form directly.

### Duplicate And Reapply Safety
- Duplicate suppression only blocks existing pending or approved applications; a previously rejected applicant may submit a fresh application.
- Existing campaign members no longer auto-resolve to an approved application during submission because that bypasses reviewer audit semantics.

### Agent's Discretion
- Copy and small UI affordances can shift as needed as long as the public page stays neutral and does not imply automatic access.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/volunteer_application.py` already owns signup-link intake semantics.
- `web/src/routes/signup/$token.tsx` already renders the public campaign context and authenticated apply form.
- `web/src/hooks/useVolunteerApplications.ts` already wraps the public submission and status APIs.

### Established Patterns
- Public routes use neutral fail-closed responses on invalid tokens.
- React Query hooks invalidate the public signup status query after successful mutation.

### Integration Points
- `app/api/v1/volunteer_applications.py`
- `app/core/security.py`
- `web/src/routes/signup/$token.tsx`

</code_context>

<specifics>
## Specific Ideas

Keep the anonymous flow obvious on the signup page, but still offer sign-in as the preferred faster path for existing accounts.

</specifics>

<deferred>
## Deferred Ideas

Confirmation emails and deeper applicant self-service remain out of scope for this milestone.

</deferred>
