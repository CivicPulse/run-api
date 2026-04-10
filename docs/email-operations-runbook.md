# Transactional Email Operations Runbook

This runbook covers production readiness for CivicPulse-owned transactional
invite mail and the shared Mailgun dependencies that can also affect ZITADEL
auth/system mail.

Use [`docs/zitadel-email-runbook.md`](./zitadel-email-runbook.md) for the
ZITADEL-specific SMTP path and ownership boundary.

## Scope Guardrails

- In scope:
  - CivicPulse invite mail
  - Mailgun domain and DNS readiness
  - Mailgun webhook verification and outcome monitoring
  - resend/remediation expectations for invite mail
- Out of scope:
  - campaign-authored email
  - bulk marketing email
  - analytics-heavy email reporting

## DNS and Domain Checklist

Before enabling production traffic, verify:

1. Sender domain exists in Mailgun in the correct region.
2. SPF record is published for the sending domain.
3. DKIM records are published and verified.
4. DMARC policy exists and routes reports to a monitored mailbox.
5. Sender identity used by CivicPulse invite mail matches the intended Mailgun
   domain.
6. Sender identity used by ZITADEL auth/system mail is also documented and
   aligned.

## Required App Config

For CivicPulse-owned invite delivery:

- `EMAIL_PROVIDER=mailgun`
- `APP_BASE_URL`
- `EMAIL_SENDER_NAME`
- `EMAIL_SENDER_ADDRESS`
- `MAILGUN_DOMAIN`
- `MAILGUN_REGION`
- `MAILGUN_API_KEY`
- `MAILGUN_WEBHOOK_SIGNING_KEY`

For ZITADEL-owned auth/system delivery, see the ZITADEL runbook and the
`ZITADEL_SMTP_*` variables documented in the admin guide.

## Monitoring Split

| Signal | Owning system | Where to inspect |
|---|---|---|
| Invite queued/submitted/failed/delivered/bounced | CivicPulse | Invite API state, `email_delivery_attempts`, Mailgun webhook logs |
| Password reset / verification send failures | ZITADEL | ZITADEL logs and SMTP config |
| DNS/SPF/DKIM/DMARC sender failures | Shared external dependency | Mailgun domain health + DNS |

## Smoke Tests

Run these before production launch and after any Mailgun or sender-domain
change:

1. Create a test invite and confirm the invite appears as queued/submitted.
2. Confirm Mailgun webhook callbacks update the invite outcome beyond
   submission.
3. Trigger a ZITADEL password-reset email and confirm receipt.
4. Verify the sender/reply-to identities match the documented operational
   policy.
5. Verify support can tell which system owns each message path.

## Retry and Remediation Expectations

- CivicPulse invite delivery:
  - queueing failure should persist a failed state on the invite rather than
    pretending the invite was never created
  - retries/resends must reuse the existing invite when it is still valid
  - webhook reconciliation is the source of truth for delivered/bounced/etc.
- ZITADEL auth/system delivery:
  - investigate via ZITADEL logs and SMTP configuration
  - do not attempt to remediate through CivicPulse invite code paths

## Incident Routing

### Invite mail issue

- Start with CivicPulse invite status and Mailgun webhook reconciliation.
- Check whether the failure happened before submission, at submission, or after
  provider acceptance.

### Auth/system mail issue

- Start with ZITADEL configuration and notification-provider behavior.
- Check SMTP credentials, sender identity, and ZITADEL logs.

### Shared provider issue

- If both invite and auth mail are failing, inspect Mailgun account health,
  DNS, SPF, DKIM, DMARC, and sender-domain alignment before blaming one
  application path.
