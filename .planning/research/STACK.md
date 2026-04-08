# Technology Stack

**Project:** CivicPulse Run v1.16 transactional email
**Researched:** 2026-04-08
**Overall confidence:** HIGH

## Recommended Stack

### Required Foundation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `httpx` | existing `>=0.28.1` | Mailgun HTTP API client | Do not add a Mailgun SDK first. The app already standardizes on async `httpx`, and Mailgun's primary send path is plain HTTP API. This keeps the provider adapter small, testable, and consistent with the existing ZITADEL service client. |
| `Jinja2` | `>=3.1.6` | Local transactional email template rendering | Invite/system email needs stable text+HTML rendering under app control. Use local templates, not provider-stored templates, so copy/versioning stays in Git and the provider remains swappable. |
| `procrastinate` | existing `>=3.7.3` | Async send/retry execution | Reuse the existing job system for outbound email dispatch, retries, and failure isolation. No Celery/Redis expansion is justified for transactional volume. |
| PostgreSQL | existing | Email audit metadata and idempotency | Persist message intent, provider, provider message id, status, error summary, and timestamps in the existing database. This is enough for transactional auditing without adding an event pipeline yet. |
| Mailgun Email API | current service | First provider implementation | Mailgun gives both HTTP API and SMTP paths, domain-level isolation, EU/US regional endpoints, and a clear route for app email now plus ZITADEL SMTP delivery separately. |
| ZITADEL SMTP configuration | current product capability | Auth/system email delivery | ZITADEL already supports instance SMTP configuration and also documents Mailgun SMTP specifically. Configure ZITADEL directly against Mailgun SMTP instead of proxying auth emails through the app. |

### Optional Future Tooling

Add only when a second provider or richer lifecycle needs it.

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| `aiosmtplib` | latest stable, if adopted later | Generic async SMTP adapter for app-sent email | Add only when the application itself must support a second SMTP-only provider. It is not needed for Mailgun-first delivery because Mailgun HTTP is cleaner and ZITADEL handles its own SMTP path. |
| Mailgun webhooks | current service | Delivery/open/bounce reconciliation | Add after the app truly needs provider-pushed status updates. Basic audit metadata can ship without webhook ingestion. |
| CSS inlining tooling | none yet | HTML email client compatibility hardening | Add only if templates become marketing-like or heavily styled. For invite/system mail, keep markup simple enough to avoid a premailer dependency. |

## Concrete Recommendations

### 1. App Email Delivery

Use a provider abstraction in the backend with this shape:

```python
class TransactionalEmailProvider(Protocol):
    async def send(message: TransactionalEmailMessage) -> ProviderSendResult: ...
```

Implement only:

- `MailgunEmailProvider` using `httpx.AsyncClient`

Do not implement yet:

- SMTP provider adapter
- SES/Postmark/Resend adapters
- provider-stored templates

Reason: this milestone needs pluggable design, not multiple live providers. A clean interface plus one production implementation is enough.

### 2. Template Strategy

Add `Jinja2>=3.1.6` and render both:

- plain text body
- simple HTML body

Store templates in repo, for example:

```text
app/templates/email/
```

Reason: invites and system notices are product assets, not provider configuration. Git-backed templates are easier to review, test, and eventually localize.

### 3. Queueing and Retry

Keep send execution in Procrastinate jobs.

Use sync boundaries like:

1. API/service creates invite or system event
2. DB commit succeeds
3. enqueue email job with message payload/reference
4. worker sends email and updates audit row

Reason: avoids sending mail for rolled-back transactions and matches the existing platform job model.

### 4. Audit Model

Add a small email-delivery table, not a full communications platform schema.

Recommended minimum fields:

| Field | Purpose |
|-------|---------|
| `id` | internal id |
| `organization_id` / `campaign_id` nullable as appropriate | tenancy context |
| `template_key` | which transactional template was used |
| `to_email` | recipient |
| `from_email` | effective sender |
| `provider` | `mailgun` initially |
| `provider_message_id` | external reference |
| `status` | `queued/sent/failed` to start |
| `error_code` / `error_detail` | operator troubleshooting |
| `sent_at` / `failed_at` | timeline |
| `created_by_job_id` or equivalent | traceability |

Not yet:

- opens/clicks
- unsubscribe state
- campaign audience segmentation
- rich analytics tables

## Integration Points

### Backend Libraries / Config

| Addition | Required | Why |
|----------|----------|-----|
| `Jinja2>=3.1.6` | Yes | Only clearly missing runtime dependency for local template rendering. |
| `MAILGUN_API_KEY` | Yes | Secret for Mailgun HTTP API. |
| `MAILGUN_DOMAIN` | Yes | Sending domain used in `/v3/{domain}/messages`. |
| `MAILGUN_REGION` (`us` or `eu`) | Yes | Mailgun uses different base URLs per region and the domain is region-bound. |
| `MAILGUN_BASE_URL` derived from region | Yes | `https://api.mailgun.net` for US, `https://api.eu.mailgun.net` for EU. |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` | Yes | Stable sender identity for app mail. |
| `APP_EMAIL_PROVIDER=mailgun` | Yes | Future-safe provider selection. |
| `ZITADEL_SMTP_HOST/USER/PASSWORD/FROM` or operator-managed equivalent | Yes, for auth/system mail | ZITADEL sends its own emails and should be configured directly. |

### Service Boundaries

| Component | Responsibility |
|-----------|---------------|
| `EmailService` | app-facing orchestration, idempotency, audit creation |
| `TransactionalEmailProvider` | provider abstraction |
| `MailgunEmailProvider` | HTTP request signing and send call |
| `EmailTemplateRenderer` | Jinja text/html rendering |
| Procrastinate job | asynchronous delivery and retry |
| ZITADEL operator config | auth/reset/verification mail outside app runtime |

### ZITADEL Delivery Implications

Use direct ZITADEL -> Mailgun SMTP configuration for auth/system email.

Why this is the right split:

- ZITADEL already supports SMTP configuration at instance setup.
- ZITADEL documents Mailgun SMTP specifically, so this path is first-class enough for operator setup.
- Auth emails should not depend on the Run API being up or correctly routing a custom relay endpoint.

Do not route ZITADEL email through the app in this milestone.

## Operational Prerequisites

### Mailgun

| Requirement | Why it Exists |
|-------------|---------------|
| Verified sending domain | Mailgun delivery depends on domain verification and DNS records. |
| SPF/DKIM/CNAME records applied | Required for domain verification and proper authenticated sending/tracking behavior. |
| Region decision before provisioning (`US` vs `EU`) | Mailgun domains are region-bound and API base URL differs by region. |
| Per-environment domain/subdomain strategy | Keep dev/staging/prod isolated; do not send all environments from one production domain. |
| Secret distribution in Kubernetes | Mailgun API key and sender config belong in K8s secrets, not committed env files. |

### ZITADEL

| Requirement | Why it Exists |
|-------------|---------------|
| SMTP host/user/password configured on the instance | ZITADEL sends verification, password reset, and related auth mail itself. |
| Sender address aligned with domain policy | ZITADEL's production docs call out sender/domain matching behavior in SMTP configuration. |
| Operator runbook for first-instance/default-instance config | This is partly infrastructure configuration, not just application code. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Mailgun integration | `httpx` against Mailgun HTTP API | Mailgun Python SDK (`mailgun`) | The SDK is current, but PyPI still labels it alpha and it adds little value over a thin HTTP adapter in an app that already uses `httpx`. |
| Template storage | In-repo Jinja templates | Mailgun stored templates | Locks content/versioning into provider config too early. |
| Queueing | existing Procrastinate | Celery/Redis | New infra with no milestone payoff. |
| ZITADEL delivery path | direct SMTP config to Mailgun | Run API as custom relay | Adds an extra hop and makes auth emails depend on app availability. |
| Future provider abstraction | interface + one implementation | building multiple live adapters now | Scope expansion without product value this milestone. |

## What NOT to Add Yet

| Avoid | Why | Do Instead |
|------|-----|------------|
| Marketing/campaign email tooling | Out of scope for transactional/system mail | Ship invites and system notifications only |
| Email builder/WYSIWYG | Adds content-management complexity | Keep templates in code |
| Webhook ingestion pipeline | Useful later, not required for minimal audit metadata | Store send result and provider message id first |
| SMTP adapter in app | Not needed for Mailgun-first delivery | Add only when a real second provider requires it |
| Dedicated email microservice | Premature service split | Keep email delivery in existing FastAPI + worker architecture |
| Link tracking/open tracking work | Pulls milestone toward campaign-email analytics | Defer until broader communications roadmap |

## Installation

```bash
# backend
cd /home/kwhatcher/projects/civicpulse/run-api
uv add Jinja2
```

No Mailgun SDK install is recommended for v1.16.

## Sources

- Mailgun API overview: https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview
  - HIGH confidence. Confirms regional base URLs and HTTP API behavior.
- Mailgun sending messages: https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages
  - HIGH confidence. Confirms Mailgun send flow and test mode behavior.
- Jinja2 on PyPI: https://pypi.org/project/Jinja2/
  - MEDIUM confidence. Confirms current stable package version (`3.1.6`) and that it supports async-friendly template rendering patterns needed for backend email composition.
- Mailgun Python SDK on PyPI: https://pypi.org/project/mailgun/
  - MEDIUM confidence. Current package exists (`1.6.0`, uploaded 2026-01-08), but PyPI metadata shows alpha status; used here mainly to justify not depending on it yet.
- ZITADEL production setup: https://zitadel.com/docs/self-hosting/manage/production
  - HIGH confidence. Confirms `SMTPConfiguration` in instance/default-instance config and sender/domain notes.
- ZITADEL notification providers: https://zitadel.com/docs/guides/manage/customize/notification-providers
  - HIGH confidence. Confirms ZITADEL supports SMTP providers, includes Mailgun templates, and notes console/API differences for SMTP auth methods.
- ZITADEL default settings: https://zitadel.com/docs/guides/manage/console/default-settings
  - HIGH confidence. Confirms production guidance to configure your own SMTP provider, activate it, and align sender/domain settings.

---
*Focused stack research for v1.16 transactional email only. Existing FastAPI, React, PostgreSQL, Procrastinate, Kubernetes, and ZITADEL auth integration were intentionally not re-researched.*
