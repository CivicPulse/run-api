# 100-01 Summary

## Outcome

Closed the remaining v1.16 invite visibility gap by bringing the pending
invites UI back into sync with the backend contract and surfacing delivery
status, latest error, last-event timing, and a working revoke path directly in
the members settings table.

## What Changed

- Updated
  [`/web/src/hooks/useInvites.ts`](/home/kwhatcher/projects/civicpulse/run-api/web/src/hooks/useInvites.ts)
  to consume the backend's bare `Invite[]` response instead of a stale paginated
  wrapper and to treat revoke as a successful `204 No Content` mutation.
- Realigned
  [`/web/src/types/invite.ts`](/home/kwhatcher/projects/civicpulse/run-api/web/src/types/invite.ts)
  with the current invite schema, including delivery-error and last-event
  fields from the API.
- Expanded
  [`/web/src/routes/campaigns/$campaignId/settings/members.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/campaigns/$campaignId/settings/members.tsx)
  so pending invites show delivery status, operational detail text, latest
  event time, and the latest delivery error when present.
- Added regression coverage in
  [`/web/src/hooks/useInvites.test.ts`](/home/kwhatcher/projects/civicpulse/run-api/web/src/hooks/useInvites.test.ts)
  and
  [`/web/src/routes/campaigns/$campaignId/settings/members.test.tsx`](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/campaigns/$campaignId/settings/members.test.tsx).

## Verification

- `cd web && npm test -- useInvites.test.ts 'src/routes/campaigns/$campaignId/settings/members.test.tsx'`
- `cd web && npm run build`
