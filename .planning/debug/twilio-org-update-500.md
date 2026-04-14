---
status: diagnosed
trigger: "PATCH /api/v1/org returns HTTP 500 when saving Twilio credentials on run.civpulse.org"
created: 2026-04-13
updated: 2026-04-13
---

## Current Focus

hypothesis: Production API pod is missing TWILIO_ENCRYPTION_* environment variables, so TwilioConfigService.encrypt_auth_token() raises TwilioConfigError("Twilio encryption is not configured"), which is uncaught in the PATCH /org handler and surfaces as HTTP 500.
test: Read the encryption service, config defaults, prod k8s configmap, prod secret template, and prod deployment envFrom.
expecting: Zero references to TWILIO_ENCRYPTION_* in prod k8s manifests confirms missing config.
next_action: Return diagnosis to caller.

## Symptoms

expected: PATCH /api/v1/org accepts Twilio Account SID + Auth Token and returns 200 with updated org.
actual: PATCH /api/v1/org returns HTTP 500 in ~56-92ms. Other org GETs succeed.
errors: HTTP 500 on PATCH, UI toast "Failed to update organization. Please try again."
reproduction: Log in as org owner → /org/settings → enter Account SID + Auth Token → Save Changes.
started: First attempt to configure Twilio on this org (org shows account_sid and auth_token both "Not configured").

## Evidence

- timestamp: 2026-04-13
  checked: app/api/v1/org.py `update_org` handler
  found: No try/except around `_service.update_org_details(...)`. Any service-layer exception becomes a 500.
  implication: TwilioConfigError from encryption path would be uncaught and surface as HTTP 500.

- timestamp: 2026-04-13
  checked: app/services/org.py update_org_details()
  found: When body.twilio.auth_token is set, it calls `self._twilio.encrypt_auth_token(body.twilio.auth_token.get_secret_value())` with no exception handling.
  implication: Any TwilioConfigError from encrypt_auth_token propagates to the route handler.

- timestamp: 2026-04-13
  checked: app/services/twilio_config.py TwilioConfigService.encrypt_auth_token() + _fernet_for_key_id()
  found: encrypt_auth_token() calls `_fernet_for_key_id(self._current_key_id)`, which reads `settings.twilio_encryption_keys`. If the keyring is empty → `raise TwilioConfigError("Twilio encryption is not configured")`. If current_key_id isn't in the keyring → `raise TwilioConfigError(f"Unknown Twilio encryption key id: {key_id}")`.
  implication: Either missing config produces a 500 via the unhandled path above.

- timestamp: 2026-04-13
  checked: app/core/config.py settings defaults for twilio encryption
  found: Defaults: `twilio_encryption_current_key_id = "dev"`, `twilio_encryption_current_key = ""`, `twilio_encryption_keys_json = ""`. The `twilio_encryption_keys` cached_property returns `{}` when both are empty.
  implication: Without TWILIO_ENCRYPTION_CURRENT_KEY or TWILIO_ENCRYPTION_KEYS_JSON set, the keyring is empty and encryption raises on first use.

- timestamp: 2026-04-13
  checked: k8s/apps/run-api-prod/configmap.yaml
  found: Only APP_NAME, DEBUG, CORS_ALLOWED_ORIGINS, ZITADEL_BASE_URL. No Twilio settings.
  implication: No Twilio encryption config via ConfigMap.

- timestamp: 2026-04-13
  checked: k8s/apps/run-api-prod/run-api-secret.yaml.example
  found: Documented secret keys: DATABASE_URL, DATABASE_URL_SYNC, ZITADEL_ISSUER, ZITADEL_PROJECT_ID, ZITADEL_SERVICE_CLIENT_ID, ZITADEL_SERVICE_CLIENT_SECRET, ZITADEL_SPA_CLIENT_ID, S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION. Total 12. No TWILIO_ENCRYPTION_* keys.
  implication: The prod Secret template has never included Twilio encryption keys; prod almost certainly doesn't have them set.

- timestamp: 2026-04-13
  checked: k8s/apps/run-api-prod/deployment.yaml
  found: Container uses `envFrom: [configMapRef: run-api-config, secretRef: run-api-secret]` only. No additional env sources.
  implication: Prod API pod's only env sources are the ConfigMap and Secret checked above — neither contains Twilio encryption keys.

- timestamp: 2026-04-13
  checked: Grep for TWILIO|twilio across k8s/ directory
  found: Zero matches across all prod AND dev manifests.
  implication: Dev k8s deployment is likely similarly broken, but only triggers on first use.

- timestamp: 2026-04-13
  checked: Which routes catch TwilioConfigError
  found: app/api/v1/voice.py:161 catches it; app/services/org_phone_number.py and phone_validation.py catch it. app/api/v1/org.py (the PATCH /org handler) does NOT.
  implication: The bare 500 behavior is specific to this handler. Even if encryption were fixed, the org PATCH route should still translate TwilioConfigError into a clean 400/503.

## Resolution

root_cause: Production (and likely dev) Kubernetes deployment is missing the Twilio encryption configuration environment variables (`TWILIO_ENCRYPTION_CURRENT_KEY` and/or `TWILIO_ENCRYPTION_KEYS_JSON`, plus optionally `TWILIO_ENCRYPTION_CURRENT_KEY_ID`). With an empty keyring, `TwilioConfigService.encrypt_auth_token()` raises `TwilioConfigError("Twilio encryption is not configured")` on the very first attempt to save an auth token. The `PATCH /api/v1/org` handler in `app/api/v1/org.py` does not catch this exception, so it propagates to FastAPI's default 500 handler. A secondary contributing issue is that the prod Secret template (`k8s/apps/run-api-prod/run-api-secret.yaml.example`) never documented these keys, so they would only be present if an operator set them manually out-of-band.

fix: (not applied — diagnose-only mode)
  1. Primary: add Twilio encryption keys to the prod Secret. Generate a Fernet key and set at least `TWILIO_ENCRYPTION_CURRENT_KEY=<fernet-key>` (and optionally `TWILIO_ENCRYPTION_CURRENT_KEY_ID=prod-2026-04`) on the `run-api-secret` in the `civpulse-prod` namespace, then restart the deployment. Mirror the change for `civpulse-dev`.
  2. Secondary: update `k8s/apps/run-api-prod/run-api-secret.yaml.example` (and the dev equivalent) to document `TWILIO_ENCRYPTION_CURRENT_KEY` / `TWILIO_ENCRYPTION_CURRENT_KEY_ID` so this doesn't recur on rebuilds.
  3. Hardening: wrap `_service.update_org_details(...)` in `app/api/v1/org.py` with `except TwilioConfigError` → `HTTPException(503, "Twilio encryption not configured")` (or 400 for empty-token cases) so misconfiguration surfaces as an actionable error instead of an opaque 500.

verification:
files_changed: []
