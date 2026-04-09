---
status: diagnosed
trigger: "Investigate issue: zitadel-password-reset-email"
created: 2026-04-09T00:00:00-04:00
updated: 2026-04-09T00:20:00-04:00
---

## Current Focus

hypothesis: Confirmed: ZITADEL mail fails because SMTP configuration is absent in the workspace/runtime environment, so no SMTP config row exists for ZITADEL to use.
test: Compared compose wiring, local `.env` and `.zitadel-data/env.zitadel` inputs, rendered `docker compose config`, and live ZITADEL logs.
expecting: The zitadel service should render blank SMTP values and emit `Errors.SMTPConfig.NotFound` when password-reset or auth mail is triggered.
next_action: return diagnosis report with evidence and classification as environment/setup issue

## Symptoms

expected: Triggering a ZITADEL password reset should send an email.
actual: Password reset and other auth/system mail are not sent.
errors: ZITADEL logs show `could not create email channel` and `Errors.SMTPConfig.NotFound Parent=(sql: no rows in result set)`.
reproduction: Trigger a password reset or user-initialization email in the local/shared environment.
started: SMTP wiring was added in commit f1d94dc on 2026-04-08, but the current rendered compose config still shows all ZITADEL SMTP fields empty in this workspace. ZITADEL logs showing SMTPConfig.NotFound were captured from the local container logs.

## Eliminated

## Evidence

- timestamp: 2026-04-09T00:05:00-04:00
  checked: docker-compose SMTP passthrough wiring
  found: `docker-compose.yml` maps `ZITADEL_SMTP_*` into `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_*` using `${...:-}` defaults, so unset inputs become empty strings.
  implication: The repo contains the intended SMTP wiring; if mail fails, the likely problem is missing environment values rather than missing compose keys.

- timestamp: 2026-04-09T00:08:00-04:00
  checked: local workspace env sources
  found: `.env` contains no `ZITADEL_SMTP_*` variables, and `.zitadel-data/env.zitadel` contains only bootstrap/OIDC values with no SMTP fields.
  implication: This workspace does not provide SMTP settings to Docker Compose or to the bootstrap-generated ZITADEL env file.

- timestamp: 2026-04-09T00:12:00-04:00
  checked: rendered container configuration
  found: `docker compose config` renders the `zitadel` service with `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_SMTP_HOST`, `_USER`, `_PASSWORD`, `_FROM`, and related fields as empty strings, with TLS defaulting to `false`.
  implication: The live container is starting without SMTP configuration, so ZITADEL cannot create an email channel.

- timestamp: 2026-04-09T00:15:00-04:00
  checked: ZITADEL runtime logs during password/setup mail flow
  found: `docker compose logs --tail=200 zitadel` repeatedly shows `could not create email channel` and `Errors.SMTPConfig.NotFound Parent=(sql: no rows in result set)` immediately after password-change/setup mail attempts.
  implication: Runtime behavior matches the missing-SMTP hypothesis exactly; ZITADEL is attempting to send mail but has no configured SMTP provider.

- timestamp: 2026-04-09T00:18:00-04:00
  checked: repo docs and commit history
  found: commit `f1d94dc` added compose/env-example passthrough only, and docs describe `ZITADEL_SMTP_*` as optional variables operators must set for ZITADEL-owned auth mail.
  implication: The change introduced wiring but not automatic secret provisioning. The failure is an environment/setup gap in this workspace, not a broken application code path.

## Resolution

root_cause: The workspace launches the `zitadel` container without any `ZITADEL_SMTP_*` values, so Compose renders blank `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_*` env vars. ZITADEL therefore has no SMTP configuration row and emits `Errors.SMTPConfig.NotFound` whenever it tries to send password-reset or other auth/system mail.
fix: No code fix required to explain the current failure. Populate `ZITADEL_SMTP_HOST`, `ZITADEL_SMTP_USER`, `ZITADEL_SMTP_PASSWORD`, `ZITADEL_SMTP_FROM`, and related values in the environment that runs the `zitadel` service, then restart/recreate that container.
verification: Diagnosis verified by direct agreement between repo wiring, absent local env values, rendered Compose output showing empty SMTP fields, and matching ZITADEL runtime errors during mail-triggering flows.
files_changed: []
