# 98-01 Summary

## Outcome

Completed the ZITADEL delivery setup and support-boundary phase by exposing
optional self-hosted SMTP configuration inputs for ZITADEL, documenting the
production Mailgun SMTP path, and adding an explicit runbook that separates
ZITADEL auth/system mail ownership from CivicPulse invite-mail ownership.

## What Changed

- Added optional ZITADEL SMTP environment variables to
  [`/.env.example`](/home/kwhatcher/projects/civicpulse/run-api/.env.example).
- Wired those values through the local ZITADEL service definition in
  [`/docker-compose.yml`](/home/kwhatcher/projects/civicpulse/run-api/docker-compose.yml).
- Expanded the admin guide in
  [`/docs/getting-started-admin.md`](/home/kwhatcher/projects/civicpulse/run-api/docs/getting-started-admin.md)
  with a dedicated ZITADEL email-delivery section.
- Added
  [`/docs/zitadel-email-runbook.md`](/home/kwhatcher/projects/civicpulse/run-api/docs/zitadel-email-runbook.md)
  covering sender alignment, smoke tests, and support triage ownership.

## Verification

- `docker compose config >/tmp/run-api-docker-compose.rendered.yml`
- `rg -n "ZITADEL_SMTP_|DefaultInstance.SMTPConfiguration|Ownership Boundary|password reset|invite mail" .env.example docker-compose.yml docs/getting-started-admin.md docs/zitadel-email-runbook.md`
