# Phase 103: Review Queue, Approval, and Access Activation — Context

**Gathered:** 2026-04-09
**Status:** Implemented

## Phase Boundary

Campaign admins need an approval queue for signup-link applications, and only approval should create campaign membership plus volunteer access.

## Decisions

- The campaign settings members page is the review surface because it already contains invites, members, and signup-link management.
- Approval is idempotent on the application row and only creates membership if it does not already exist.
- Rejection keeps the application row as an audit record instead of deleting it.
- Approval creates or updates both `CampaignMember` and `Volunteer`, then assigns the volunteer project role when a new membership is created.

## Existing Code Insights

- Invite flows provided the closest queue and resolution pattern.
- `CampaignMember` remains the authoritative access toggle for campaign authorization.
- Existing member-management UI patterns supplied the right table, confirm-dialog, and mutation invalidation patterns.
