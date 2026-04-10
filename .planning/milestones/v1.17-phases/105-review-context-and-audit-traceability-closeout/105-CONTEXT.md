# Phase 105: Review Context and Audit Traceability Closeout - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the remaining admin-review context gaps and backfill the milestone artifacts required for `v1.17` to pass re-audit.

</domain>

<decisions>
## Implementation Decisions

### Review Context
- Admin reviewers need duplicate/existing-account signals in the review queue without introducing a new review screen.
- Review context is derived server-side from existing user, member, and prior application data rather than stored redundantly in the table.

### Approval Semantics
- If an application has no authenticated applicant account at approval time, approval should still produce a safe path forward by sending a standard volunteer invite instead of failing outright.
- Existing-member approval stays idempotent and records reviewer attribution instead of silently bypassing the queue.

### Traceability
- `REQUIREMENTS.md`, summary frontmatter, verification files, and validation artifacts are all treated as milestone deliverables for this phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `InviteService` already creates durable volunteer invites with delivery tracking.
- The campaign members settings page already owns the volunteer-application review table.
- Prior milestone audits establish the expected requirement matrix and summary frontmatter patterns.

### Integration Points
- `app/services/volunteer_application.py`
- `web/src/routes/campaigns/$campaignId/settings/members.tsx`
- `.planning/REQUIREMENTS.md`
- `.planning/v1.17-MILESTONE-AUDIT.md`

</code_context>

<specifics>
## Specific Ideas

Surface enough admin context to answer: is this already an account, is this already a member, and has this person applied before?

</specifics>

<deferred>
## Deferred Ideas

Dedicated analytics for application conversion and notification emails remain out of scope.

</deferred>
