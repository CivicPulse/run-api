# Phase 100: Invite Delivery Visibility UI Closure - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase closes the remaining v1.16 audit gap in the campaign members
settings UI. The backend already returns the current pending invite array plus
delivery-truth fields from phase 97; the frontend now needs to consume that
contract correctly and expose support-facing delivery details without changing
the underlying invite acceptance flow.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** Fix the pending-invites data contract at the existing frontend seam by
  updating `useInvites` and the `Invite` type to match the backend's
  `list[InviteResponse]` shape.
- **D-02:** Keep the support visibility inside the existing campaign members
  settings screen rather than introducing a new invite detail page or modal.
- **D-03:** Surface delivery status, latest delivery error, and the latest
  provider-event timestamp directly in the pending-invites table so admins can
  triage resend/remediation work from the current flow.
- **D-04:** Phase 100 is a UI contract closure. It should not add resend actions,
  new backend fields, or new email-delivery behaviors.

</decisions>
