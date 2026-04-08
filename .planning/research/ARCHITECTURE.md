# Architecture Research: Transactional Email Delivery

**Domain:** Transactional/system email integration for the existing Run API stack
**Researched:** 2026-04-08
**Overall confidence:** HIGH

## Recommendation

Add email as a first-class backend integration with the same shape already used for Twilio:

- App-owned transactional emails go through a provider abstraction in the FastAPI backend.
- Initial send happens asynchronously through Procrastinate for reliability and retry control.
- Minimal delivery metadata is persisted in app tables owned by the backend.
- ZITADEL-authored emails stay outside the app send pipeline and are configured through ZITADEL SMTP settings plus operator docs.

Mailgun should be the first provider implementation, but the app should depend on an internal `EmailProvider` contract, not Mailgun request shapes.

## Existing Integration Seams

### Modified Components

| Component | Current role | Email change |
|-----------|--------------|--------------|
| `app/services/invite.py` | Creates/accepts campaign invite records and ZITADEL role assignment | After invite row commit, enqueue transactional invite email |
| `app/api/v1/invites.py` | Synchronous invite CRUD API | Continue returning 201 after DB write; do not block on provider send |
| `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` | Invite mode is UI-only and shows "coming soon" | Route invite mode to real backend invite workflow |
| `app/tasks/procrastinate_app.py` | Registers import and SMS tasks | Register email tasks on a dedicated `communications` or `email` queue |
| `app/core/config.py` | Holds external integration settings | Add app email provider, sender, webhook, and Mailgun settings |
| `.planning` ops/docs | Has deployment and integration runbooks | Add provider setup, webhook config, failure handling, and ZITADEL SMTP docs |

### New Components

| Component | Responsibility |
|-----------|----------------|
| `app/services/email/base.py` | `EmailProvider` interface plus normalized request/response models |
| `app/services/email/mailgun.py` | Mailgun REST implementation |
| `app/services/email/service.py` | Orchestrates rendering inputs, persistence, idempotency, provider calls, and status changes |
| `app/tasks/email_tasks.py` | Procrastinate tasks for send and optional reconciliation |
| `app/models/email_message.py` | Canonical outbound email record owned by the app |
| `app/models/email_event.py` | Append-only provider lifecycle events or status changes |
| `app/api/webhooks/email.py` | Provider webhook ingress with signature validation |
| `app/services/email/templates.py` or schema helpers | Stable payload building for invite/system emails |

## Recommended Architecture

### Boundary 1: App Email vs ZITADEL Email

Use two separate delivery paths.

| Path | Owner | Sends what | Configuration lives where |
|------|-------|------------|---------------------------|
| App transactional email | Run API | Campaign/org/volunteer/staff invites and future app-owned system emails | Run API env vars, provider account/domain, webhook secret |
| Auth/system email from ZITADEL | ZITADEL | Password reset, verification, login/auth notifications, ZITADEL-triggered user lifecycle mail | ZITADEL notification settings, SMTP provider, custom domain, message texts |

Do not proxy ZITADEL email through the app. ZITADEL already expects its own SMTP provider configuration and treats its built-in SMTP as testing/evaluation only. The app should document that operational dependency, not reimplement it.

### Boundary 2: Sync API Write vs Async Delivery

Use a split-phase flow:

1. API call writes the invite/domain record in the request transaction.
2. API call creates an `EmailMessage` row with status `queued`.
3. API enqueues a Procrastinate job after commit.
4. Worker resolves provider config, sends via `EmailProvider`, and updates the record.
5. Optional webhook updates final delivery state later.

This matches existing import/SMS patterns and keeps outbound email failures from breaking the core invite mutation.

### Boundary 3: Provider Abstraction

The application should expose one internal interface:

```python
class EmailProvider(Protocol):
    async def send(self, message: OutboundEmail) -> ProviderSendResult: ...
    async def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> VerifiedWebhook: ...
```

Provider-specific fields such as Mailgun tags, variables, event IDs, and signature material should be translated at the adapter layer. Invite and volunteer services should only know about an app-level `EmailService`.

## Persistence Boundaries

### Recommended Tables

#### `email_messages`

One row per outbound app-owned transactional email.

| Column | Notes |
|--------|-------|
| `id` | UUID PK |
| `campaign_id` | Nullable FK when campaign-scoped invite email |
| `organization_id` | Nullable FK when org-scoped context exists |
| `invite_id` | Nullable FK for campaign invite linkage |
| `volunteer_id` | Nullable FK when volunteer invite is added |
| `template_key` | `campaign_invite`, `volunteer_invite`, `staff_invite`, etc. |
| `provider` | `mailgun` initially |
| `provider_message_id` | Mailgun message id if available |
| `to_email` | Normalized recipient |
| `from_email` | Resolved sender |
| `subject` | Stored for audit/debugging |
| `status` | `queued`, `sending`, `submitted`, `delivered`, `failed`, `bounced`, `complained` |
| `failure_code` | Provider/app failure classification |
| `failure_detail` | Short sanitized detail |
| `idempotency_key` | Unique key per logical email action |
| `metadata_json` | Template params, actor IDs, provider-normalized extras |
| `queued_at` / `sent_at` / `finalized_at` | Lifecycle timestamps |
| `created_at` / `updated_at` | Standard timestamps |

#### `email_events`

Append-only event log for provider lifecycle changes.

| Column | Notes |
|--------|-------|
| `id` | UUID PK |
| `email_message_id` | FK to `email_messages` |
| `event_type` | `submitted`, `accepted`, `delivered`, `failed`, `opened`, `clicked`, `bounced`, etc. |
| `provider_event_id` | Unique when available |
| `provider_status` | Raw provider status |
| `payload_json` | Redacted webhook payload or send response subset |
| `occurred_at` | Provider/event time |
| `created_at` | Insert time |

### What Not To Persist

- Full rendered HTML bodies unless compliance/audit requires it later.
- Raw webhook payloads with unnecessary PII.
- Provider secrets or signing keys outside config/secret management.
- ZITADEL mail delivery state inside app tables.

### RLS Guidance

- `email_messages` should be campaign-aware when the initiating feature is campaign-scoped.
- `organization_id` is useful for org-level querying and future org invite flows.
- Webhook processing should use a privileged DB session plus explicit lookup by `provider_message_id`; it should not depend on request-path campaign context.

## Call Sites

### 1. Campaign Member Invite

Primary initial call site.

- `InviteService.create_invite()` should stay responsible for role validation and invite token creation.
- After the invite row is committed and refreshed, call `EmailService.queue_campaign_invite(...)`.
- The email payload should include the invite acceptance URL, campaign name, inviter identity, role, and expiry timestamp.
- Failure to enqueue should mark the email record failed or create an operator-visible warning, but should not roll back the invite itself.

### 2. Volunteer Invite Mode

Second call site after campaign invites.

- Replace the frontend stub that sends `send_invite: true` but only shows a toast.
- Back the flow with a real backend endpoint that creates the volunteer record and queues an email if the volunteer has an email address.
- Keep this separate from the existing campaign-member invite unless the product explicitly wants volunteers to become authenticated campaign members immediately.

### 3. Staff / Org Invite Variants

Treat as the same architectural pattern:

- domain record first
- email queue second
- acceptance/auth consequences later

Reuse the same `EmailService` and persistence tables; differentiate only by `template_key` and metadata.

## Data Flow

### App-Owned Invite Email

1. Authenticated caller hits invite endpoint.
2. `InviteService` validates role rules and writes `Invite`.
3. `EmailService.queue_*` creates `email_messages(status='queued')` with deterministic `idempotency_key`.
4. Service defers `send_transactional_email` Procrastinate task.
5. Worker loads `email_messages`, sets status `sending`, builds provider payload, and calls `EmailProvider.send`.
6. On success, worker stores `provider_message_id`, updates status to `submitted`, appends `email_events(submitted)`.
7. Mailgun webhook later confirms `delivered` or `failed`; webhook handler verifies signature, appends `email_events`, and updates final status.

### ZITADEL-Owned Email

1. Operator configures SMTP/custom domain inside ZITADEL.
2. ZITADEL sends auth/system emails directly.
3. App documents prerequisites and environment boundaries.
4. App does not persist or reconcile those events.

## Sync vs Async Tradeoffs

### Recommended Default: Async Send

Use async worker delivery for all initial app emails.

| Choice | Why |
|--------|-----|
| Async send after DB commit | avoids provider latency in invite API, gives retries, keeps invite creation durable |
| Persist queued row before enqueue | gives recovery and operator visibility if worker/provider fails |
| Provider webhook optional but recommended | enables real final state beyond "submitted" |

### What To Avoid

- Sending the Mailgun request inline inside `create_invite()`. That makes invite creation depend on third-party latency and transient outages.
- Treating provider acceptance as delivery success.
- Making the frontend responsible for provider calls or provider-specific payload shaping.

### Acceptable Temporary Shortcut

If webhook handling slips, the first iteration can stop at `submitted`/`failed` from the worker response. That is enough for "basic delivery/audit metadata," but mark final delivery state as partial until webhooks land.

## Provider-Specific Notes: Mailgun

- Use Mailgun's HTTP send API, not SMTP, for the app-owned path.
- Store Mailgun message ID on submission so later webhooks can reconcile.
- Include provider tags/custom variables for `template_key`, `campaign_id`, `invite_id`, and environment.
- Verify incoming Mailgun webhooks with the signing key before mutating state.

## ZITADEL Configuration and Documentation Boundaries

The app milestone should create docs, not app code, for these items:

- ZITADEL custom domain prerequisite for branded/from-domain mail.
- ZITADEL SMTP provider setup, activation, and test flow.
- Which emails are expected to come from ZITADEL vs the Run API.
- Required secrets/credentials and where they live in deployment manifests.
- Failure diagnosis boundary: auth mail issues start in ZITADEL config, not the app worker.

The app should not introduce a backend adapter that asks ZITADEL to send app invites. Keep invite emails app-owned and auth emails ZITADEL-owned.

## Operational Touchpoints

Add or update docs for:

- Mailgun domain/DNS setup and secret injection.
- `MAILGUN_API_KEY`, domain, base URL/region, webhook signing key, default sender values.
- Worker queue registration and retry policy for email tasks.
- Dead-letter/manual replay procedure from `email_messages`.
- ZITADEL SMTP/custom domain runbook.
- Environment separation: dev sandbox domain vs production domain.

## Suggested Build Order

1. **Provider abstraction and config surface**
   - Add settings, `EmailProvider` contract, Mailgun adapter.
   - Verification seam: unit tests for payload mapping and error normalization.

2. **Persistence layer**
   - Add `email_messages` and `email_events`.
   - Verification seam: migration tests and idempotency constraints.

3. **Email orchestration service + worker task**
   - Add queueing API, Procrastinate task, retry behavior, state transitions.
   - Verification seam: service/task tests with fake provider.

4. **Campaign invite integration**
   - Modify `InviteService.create_invite()` to queue email after invite commit.
   - Verification seam: endpoint test proves invite succeeds even when send is deferred.

5. **Volunteer invite integration**
   - Replace frontend/backend stub with real queued email flow.
   - Verification seam: E2E or API test proves invite mode no longer shows "coming soon."

6. **Mailgun webhook ingestion**
   - Add authenticated webhook endpoint and reconciliation into `email_events`.
   - Verification seam: signed webhook tests and idempotent replays.

7. **ZITADEL operator docs**
   - Document SMTP/custom-domain setup and ownership boundaries.
   - Verification seam: deployment checklist, not application tests.

## Risks and Pitfalls

### Critical

**Mixing app invite delivery with ZITADEL auth delivery**
- Consequence: unclear ownership, duplicated templates, broken operational debugging.
- Prevention: separate docs, config, and code paths from day one.

**Treating provider submission as final delivery**
- Consequence: false-positive "sent" state.
- Prevention: use `submitted` as intermediate state and reconcile with events when available.

**No idempotency key on logical send**
- Consequence: duplicate invite emails on retries or repeated clicks.
- Prevention: unique `idempotency_key` at `email_messages` level.

### Moderate

**Over-coupling templates to Mailgun features**
- Consequence: fake abstraction, harder future provider swap.
- Prevention: keep provider-only fields in adapter; keep template identity app-native.

**Doing email send inline in request path**
- Consequence: degraded API latency and brittle invite creation.
- Prevention: always queue after commit.

## Confidence

| Area | Level | Notes |
|------|-------|-------|
| Existing integration seams | HIGH | Verified against current code in invite, volunteer, config, Procrastinate, and lifecycle setup |
| Provider abstraction approach | HIGH | Aligns with current Twilio-style service/task boundaries and Mailgun capabilities |
| ZITADEL boundary recommendation | HIGH | Verified against current ZITADEL docs for notification/SMTP ownership |
| Final-state delivery reconciliation | MEDIUM | Mailgun webhook support is clear; exact event set can be narrowed during implementation |

## Sources

- Current codebase: `app/services/invite.py`, `app/api/v1/invites.py`, `app/tasks/procrastinate_app.py`, `app/main.py`, `app/core/config.py`, `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx`
- ZITADEL default settings / notification + SMTP docs: https://zitadel.com/docs/guides/manage/console/default-settings
- Mailgun send API docs: https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages
- Mailgun webhook security docs: https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks
