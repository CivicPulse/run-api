# ZITADEL Email Delivery Runbook

This runbook covers the email path that ZITADEL owns directly:

- password reset
- verification / initialization
- other ZITADEL auth or system notifications

It does not cover CivicPulse-owned invite mail. CivicPulse invite delivery is
handled by the application runtime, background worker, Mailgun API submission,
and Mailgun webhook reconciliation added in phases 95-97.

## Ownership Boundary

| Scenario | Owning system | First place to inspect |
|---|---|---|
| Campaign/staff/volunteer invite email | CivicPulse runtime | Invite delivery status in CivicPulse APIs / Mailgun webhook records |
| Password reset email | ZITADEL | ZITADEL notification provider config and ZITADEL logs |
| Email verification / user initialization | ZITADEL | ZITADEL notification provider config and ZITADEL logs |
| Mailgun DNS / domain reputation issue impacting both paths | Shared external dependency | Mailgun domain settings, SPF/DKIM/DMARC, sender alignment |

## Required Inputs

- Mailgun SMTP hostname:
  - `smtp.mailgun.org:587` for US
  - `smtp.eu.mailgun.org:587` for EU
- Mailgun SMTP username, typically `postmaster@<mailgun-domain>`
- Mailgun SMTP password
- Sender address for ZITADEL auth/system mail
- Reply-to address for support
- Decision on whether the sender domain matches the ZITADEL external domain

## Local / Shared Env Wiring

`docker-compose.yml` passes the following optional variables through to
ZITADEL's `DefaultInstance.SMTPConfiguration`:

```dotenv
ZITADEL_SMTP_HOST=
ZITADEL_SMTP_USER=
ZITADEL_SMTP_PASSWORD=
ZITADEL_SMTP_TLS=true
ZITADEL_SMTP_FROM=
ZITADEL_SMTP_FROM_NAME=
ZITADEL_SMTP_REPLY_TO=
ZITADEL_SMTP_SENDER_ADDRESS_MATCHES_INSTANCE_DOMAIN=true
```

These map to ZITADEL's runtime configuration environment variables:

- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_SMTP_HOST`
- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_SMTP_USER`
- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_SMTP_PASSWORD`
- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_TLS`
- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_FROM`
- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_FROMNAME`
- `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_REPLYTOADDRESS`
- `ZITADEL_DEFAULTINSTANCE_DOMAINPOLICY_SMTPSENDERADDRESSMATCHESINSTANCEDOMAIN`

## Production Setup Checklist

1. Provision the Mailgun sending domain and verify DNS.
2. Confirm SPF, DKIM, and DMARC are aligned for the sender domain.
3. Create or retrieve the Mailgun SMTP credentials for that domain.
4. Set the ZITADEL SMTP environment variables in the environment that runs
   ZITADEL, not in CivicPulse runtime code.
5. Restart or roll ZITADEL so the provider config is picked up.
6. Verify the sender/reply-to addresses are supportable and monitored.
7. Document the chosen sender identity in the incident runbook.

## Smoke Tests

Run these after any SMTP credential, sender-domain, or ZITADEL upgrade change:

1. Trigger a password-reset flow for a test user and confirm receipt.
2. Trigger an email-verification or user-initialization flow and confirm receipt.
3. Confirm the received message headers show the expected sender/reply-to.
4. If the message does not arrive, check ZITADEL logs before CivicPulse logs.
5. If Mailgun accepts but downstream delivery fails, continue investigation in
   Mailgun because CivicPulse runtime is out of path for ZITADEL mail.

## Incident Triage

### If invite mail is failing

- Inspect CivicPulse invite status and Mailgun webhook reconciliation first.
- Do not treat ZITADEL SMTP configuration as the primary suspect unless
  Mailgun-wide DNS or sender issues are affecting both systems.

### If password reset or verification mail is failing

- Inspect ZITADEL notification provider configuration.
- Confirm the SMTP credentials and sender identity loaded into ZITADEL.
- Check ZITADEL logs for notification-provider errors.
- Confirm Mailgun SMTP credentials still match the intended Mailgun domain.

### If both invite mail and auth mail are failing

- Check shared Mailgun domain health, SMTP credentials, sender alignment, SPF,
  DKIM, DMARC, and DNS propagation.
- Treat CivicPulse runtime and ZITADEL runtime as separate clients of the same
  provider until proven otherwise.
