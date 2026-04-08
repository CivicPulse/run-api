# Domain Pitfalls -- Transactional Email Delivery

**Domain:** Mailgun-first transactional email plus ZITADEL auth/system email in an existing multi-tenant platform
**Researched:** 2026-04-08
**Confidence:** HIGH for Mailgun/ZITADEL capability boundaries and core deliverability guidance; MEDIUM for roadmap phasing recommendations

## Critical Pitfalls

### Pitfall 1: Treating Mailgun `accepted` as delivery success
**What goes wrong:** The app records invite/auth email as "sent" when Mailgun only accepted the request into queue. Hard bounces, temp failures, complaints, and suppressions never make it back into product state.
**Why it happens here:** Existing invite flows are app-transaction driven; adding outbound email later makes it easy to stop at synchronous API success and skip asynchronous event truth.
**Consequences:** Operators trust emails that never arrived. Users do not receive invites or password flows. Support has no source of truth.
**Prevention:**
- Model lifecycle states separately: `queued`, `accepted`, `delivered`, `temporary_fail`, `permanent_fail`, `complained`, `suppressed`.
- Persist Mailgun message identifiers plus local send attempt IDs at send time.
- Do not show "delivered" in UI until webhook or event API evidence says so.
**Warning signs:**
- Support reports "invite says sent but user never got it."
- Database has only boolean `sent=true` with no downstream status updates.
**Address in phase:** `Phase 97 - Email Events, Webhooks, and Audit Ledger`

### Pitfall 2: Region/base-URL mismatch between Mailgun account and code
**What goes wrong:** The integration uses `api.mailgun.net` while the account/domain lives in EU (`api.eu.mailgun.net`), or rotates one endpoint but not the others.
**Why it happens here:** Mailgun splits API surfaces by US/EU region, and webhook signing-key endpoints are region-specific too.
**Consequences:** Sends fail intermittently, webhook verification setup breaks, and operators debug the wrong environment.
**Prevention:**
- Make region a first-class config value, not a string buried in service code.
- Derive API base URL, webhook signing-key endpoint, and operator docs from one region setting.
- Validate region during org/provider setup with a live health check.
**Warning signs:**
- 401/404 from one Mailgun endpoint while others work.
- Docs or runbooks mention both US and EU URLs.
**Address in phase:** `Phase 95 - Provider Foundation and Secret Hygiene`

### Pitfall 3: Sending from an unaligned or shared domain
**What goes wrong:** CivicPulse sends transactional mail from a domain/subdomain that is not fully authenticated, does not match the visible `From` domain, or is shared with future bulk mail.
**Why it happens here:** This milestone is "transactional only," but the easy path is to reuse the root domain or a future campaign-mail domain.
**Consequences:** Junk-folder placement rises, especially at Outlook/Hotmail. Later marketing or campaign mail can damage auth/invite reputation. DNS/auth troubleshooting becomes expensive after launch.
**Prevention:**
- Use a dedicated authenticated transactional subdomain such as `mg.tx.civpulse.org` or equivalent.
- Keep visible `From` aligned with the actual authenticated sending domain where possible.
- Keep transactional/auth traffic isolated from any future bulk or campaign-authored email domain.
- Complete SPF, DKIM, MX, and DMARC before production cutover.
**Warning signs:**
- Outlook-specific junking.
- Provider setup uses root domain "for now."
- Future roadmap discussions mention reusing the same domain for bulk mail.
**Address in phase:** `Phase 95 - Provider Foundation and Secret Hygiene`

### Pitfall 4: Using Mailgun API success while ignoring provider suppression state
**What goes wrong:** The app keeps trying to resend to addresses that hard-bounced, complained, or unsubscribed at the provider/domain level.
**Why it happens here:** Existing invite flows likely key on app-local invite state, not provider suppression state.
**Consequences:** Deliverability reputation degrades, retries become noisy, and some users are permanently unreachable without operators realizing why.
**Prevention:**
- Mirror suppression-relevant events into a local email-delivery ledger.
- Show operator-visible reason codes on invite/email records.
- Define product policy for transactional mail to complaint/bounce cases: usually stop automatic retries and require manual remediation.
**Warning signs:**
- Repeated send attempts to the same address after permanent failure.
- Support can see invite retries but not bounce reason.
**Address in phase:** `Phase 97 - Email Events, Webhooks, and Audit Ledger`

### Pitfall 5: Secret/config sprawl across Mailgun API, Mailgun webhook signing, and ZITADEL SMTP
**What goes wrong:** API keys, SMTP credentials, and webhook signing keys end up in plaintext columns, logs, Sentry breadcrumbs, or mixed together in one "email password" field.
**Why it happens here:** This milestone adds both app-side provider integration and ZITADEL-side SMTP delivery at the same time; they use different credentials for different channels.
**Consequences:** Account compromise, forged webhook events, and hard-to-rotate production credentials.
**Prevention:**
- Separate secrets by purpose: Mailgun sending API, Mailgun webhook verification, ZITADEL SMTP auth.
- Encrypt at rest; never return secrets via API after write.
- Add log redaction for `mailgun`, `smtp`, `api_key`, `signing_key`, `password`, `token`.
- Document rotation procedure before go-live.
**Warning signs:**
- One generic config blob stores all email credentials.
- UI can read back secret values after save.
- Runbooks do not say which secret rotates which path.
**Address in phase:** `Phase 95 - Provider Foundation and Secret Hygiene`

### Pitfall 6: Building a Mailgun-specific domain model instead of a provider seam
**What goes wrong:** Product code stores Mailgun terms directly everywhere (`o:tag`, raw event names, raw payload blobs, domain IDs) and makes invite delivery depend on Mailgun-specific request shapes.
**Why it happens here:** Mailgun is the first provider and the milestone is intentionally narrow; the easiest implementation is direct coupling.
**Consequences:** SMTP/Postmark/SES support later becomes a rewrite. Tests and DB schema become provider-specific.
**Prevention:**
- Define provider-agnostic commands and states: send request, template key, provider message ID, normalized delivery event, normalized failure reason.
- Keep raw provider payloads in a debug/audit column, not as the main application contract.
- Restrict provider-specific code to one adapter package.
**Warning signs:**
- DB columns named after Mailgun request parameters.
- API schemas expose provider event names directly.
**Address in phase:** `Phase 95 - Provider Foundation and Secret Hygiene`

### Pitfall 7: Email event reconciliation by recipient email instead of send-attempt identity
**What goes wrong:** Webhook processing matches events to rows by recipient address alone.
**Why it happens here:** Invites already key on email; it is tempting to join event data back the same way.
**Consequences:** Cross-tenant misattachment when the same person is invited to multiple orgs/campaigns, duplicate sends overwrite each other, and audit trails become untrustworthy.
**Prevention:**
- Attach a stable local send-attempt ID and local entity reference at send time.
- Store both local ID and provider message ID, then reconcile on those first.
- Never use recipient email as the primary event join key.
**Warning signs:**
- Event table schema has `recipient_email` but no `delivery_id` or `provider_message_id`.
- Support cannot distinguish two invites to the same person from different orgs.
**Address in phase:** `Phase 97 - Email Events, Webhooks, and Audit Ledger`

### Pitfall 8: Cross-tenant leakage through batching, tags, or metadata
**What goes wrong:** Multiple invite recipients are sent in one batch, or provider metadata/tags include raw org names, campaign names, or internal IDs that leak across tenants or to third-party systems.
**Why it happens here:** Mailgun supports batch features and tags; existing platform flows already send many invite-like emails across org/campaign boundaries.
**Consequences:** Tenant data leakage, accidental disclosure of campaign affiliation, and poor audit separation.
**Prevention:**
- Send one transactional invite per recipient.
- Do not batch org/campaign invites together.
- Use minimal metadata: opaque internal IDs only, no human-readable tenant names or sensitive voter data.
- Review every provider tag and variable against the platform's tenant-boundary rules.
**Warning signs:**
- A single Mailgun request has multiple `to` recipients for invites.
- Tags contain org or campaign names.
**Address in phase:** `Phase 96 - Invite Delivery Integration`

### Pitfall 9: Host/header-derived invite links and wrong environment URLs
**What goes wrong:** Invite URLs, reset links, or support links are built from the incoming request host, internal service URL, or a stale frontend base URL.
**Why it happens here:** The app currently serves UI through FastAPI but plans to move frontend hosting later. ZITADEL and app emails may each need different public URLs.
**Consequences:** Users receive broken links, private cluster hostnames, or mixed-brand flows that look like phishing.
**Prevention:**
- Use explicit public base URLs for app invite flows and separate documented public URLs for ZITADEL auth flows.
- Validate generated links in staging against the public deployment shape.
- Keep email-visible domain decisions in one config surface, not spread across routes/services.
**Warning signs:**
- Emails contain `localhost`, service DNS, or cluster hostnames.
- App invite links and ZITADEL links point at different brands unexpectedly.
**Address in phase:** `Phase 96 - Invite Delivery Integration`

### Pitfall 10: Sending mail before the database transaction is durable
**What goes wrong:** The app sends the invite email, then the DB transaction rolls back, or retries the transaction and emits a second email.
**Why it happens here:** Existing invite creation is synchronous DB work; bolting on outbound delivery inside the same request path creates ordering hazards.
**Consequences:** Orphaned links, duplicate emails, support confusion, and hard-to-reproduce race bugs.
**Prevention:**
- Use an outbox/job pattern: commit invite row first, enqueue send second.
- Make send jobs idempotent on local invite/send-attempt identity.
- Retry delivery jobs safely without creating new invite tokens unless explicitly requested.
**Warning signs:**
- Email send call sits inline before `commit()`.
- Duplicate invites appear after transient provider timeouts.
**Address in phase:** `Phase 96 - Invite Delivery Integration`

### Pitfall 11: Assuming ZITADEL email delivery is tenant-scoped
**What goes wrong:** The team designs as if each customer org can have its own SMTP provider, sender identity, or full auth-email routing policy inside ZITADEL.
**Why it happens here:** CivicPulse is multi-tenant, but ZITADEL notification delivery is configured at the instance/provider level; org customization is primarily message text/branding, not isolated provider infrastructure.
**Consequences:** Wrong architecture decisions, impossible UI requirements, and late-stage rework when operators realize the auth email path is instance-scoped.
**Prevention:**
- Treat ZITADEL auth/system email as an operator-managed instance capability.
- Limit this milestone to configuring one production-ready SMTP/provider path and documenting org-level text/branding boundaries separately.
- Keep customer-facing product invites in CivicPulse's own email system, not forced through ZITADEL.
**Warning signs:**
- Requirements mention per-org SMTP credentials inside ZITADEL.
- UI mocks show org admins editing auth-email provider settings.
**Address in phase:** `Phase 98 - ZITADEL Delivery Setup, Branding Boundaries, and Operator Docs`

### Pitfall 12: Leaving ZITADEL on default/non-production email settings
**What goes wrong:** CivicPulse product invites work, but auth emails from ZITADEL still use default sender identity, wrong branding, or no production SMTP provider.
**Why it happens here:** Milestone scope splits app email and auth email; one path can ship while the other remains partially configured.
**Consequences:** Sign-in, verification, password reset, or security emails fail or look untrusted. Users blame the platform, not the auth provider.
**Prevention:**
- Add an explicit go-live checklist for ZITADEL email: SMTP provider, sender, custom/login domain alignment, message text review, smoke tests for verification/reset/invite-like flows.
- Treat ZITADEL email as a first-class launch gate, not operator follow-up.
**Warning signs:**
- Only app invite UAT exists; no auth-email UAT exists.
- Runbooks say "configure ZITADEL later."
**Address in phase:** `Phase 98 - ZITADEL Delivery Setup, Branding Boundaries, and Operator Docs`

## Moderate Pitfalls

### Pitfall 13: Capturing open/click tracking for auth/system email by default
**What goes wrong:** The team enables open/click tracking broadly for password reset, verification, and invite mail.
**Why it happens here:** Mailgun exposes opened/clicked analytics easily, but these events include IP/client/geolocation-style metadata that CivicPulse does not need for auth or basic transactional delivery.
**Consequences:** Unnecessary PII intake, higher compliance burden, and potential user-trust issues.
**Prevention:**
- Default auth/system mail to delivery/failure tracking only.
- Enable open/click only where there is a clear product need and approved privacy posture.
- Minimize stored event payload fields.
**Warning signs:**
- Ledger stores user agent, IP, and geolocation for routine auth mail.
- Product requirements ask for "engagement" on password reset emails.
**Address in phase:** `Phase 97 - Email Events, Webhooks, and Audit Ledger`

### Pitfall 14: No Mailgun/ZITADEL separation in monitoring and runbooks
**What goes wrong:** Alerts, dashboards, and support playbooks do not distinguish between "CivicPulse invite failed" and "ZITADEL reset email failed."
**Why it happens here:** Both are "email" in the same milestone, but they originate from different systems and credentials.
**Consequences:** Slow incident response and incorrect fixes.
**Prevention:**
- Separate monitoring dimensions by origin: `app_transactional` vs `zitadel_auth`.
- Document ownership and first-response steps for each path.
- Add smoke tests for both paths in staging and post-deploy verification.
**Warning signs:**
- One generic "email failed" log without origin.
- Support cannot tell which system sent a broken email.
**Address in phase:** `Phase 99 - Deliverability Hardening and Operations`

### Pitfall 15: No controlled fallback strategy
**What goes wrong:** Mailgun outage or DNS/auth issue blocks critical emails, but the product has no operational fallback or degradation plan.
**Why it happens here:** Milestone scope is Mailgun-first, not multi-provider.
**Consequences:** Complete email outage for invites and delayed recovery decisions.
**Prevention:**
- Decide now what "fallback" means: queue-and-retry only, manual operator resend, or later secondary provider.
- Keep provider seam clean so secondary provider work is additive later.
- Document outage playbooks and retry/backoff policy.
**Warning signs:**
- "Fallback" is mentioned but no one can define the exact operator action.
- Retry logic has no cap or no manual replay tool.
**Address in phase:** `Phase 99 - Deliverability Hardening and Operations`

## Phase-Specific Warnings

| Recommended Phase | Likely Pitfall | Mitigation |
|---|---|---|
| Phase 95 - Provider Foundation and Secret Hygiene | Region mismatch, shared domain use, Mailgun lock-in, secret mixing | Normalize provider config, isolate transactional subdomain, encrypt/rotate secrets, keep adapter boundary clean |
| Phase 96 - Invite Delivery Integration | Inline send before commit, wrong link hosts, recipient batching leaks | Use outbox jobs, explicit public URLs, one-recipient-per-send, opaque metadata only |
| Phase 97 - Email Events, Webhooks, and Audit Ledger | Accepted treated as delivered, event joins by email, suppression ignored, excess tracking PII | Build normalized delivery ledger, verify events against local send IDs, sync failure/suppression state, minimize stored payloads |
| Phase 98 - ZITADEL Delivery Setup, Branding Boundaries, and Operator Docs | Assuming per-org ZITADEL SMTP, leaving auth mail unconfigured, mismatched branding/domains | Treat ZITADEL delivery as instance-scoped ops config, document org text/branding boundaries, run auth-email smoke tests |
| Phase 99 - Deliverability Hardening and Operations | No origin-specific monitoring, no fallback plan, weak incident response | Split app vs ZITADEL monitoring, publish runbooks, define retry/resend/fallback procedures |

## Sources

- Mailgun DNS best practices: https://documentation.mailgun.com/docs/mailgun/email-best-practices/dns
- Mailgun DKIM rotation guidance: https://documentation.mailgun.com/docs/mailgun/user-manual/domains/dkim_security
- Mailgun webhooks overview and event types: https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks
- Mailgun webhook payload structure: https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhook-payloads
- Mailgun tracking FAQ and suppressions behavior: https://documentation.mailgun.com/docs/mailgun/faq/tracking
- Mailgun account management, regional endpoints, signing key API, and SMTP credentials API: https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/account-management/get-v5-accounts-http_signing_key
- ZITADEL custom domain overview and notification-provider entry point: https://zitadel.com/docs/concepts/features/custom-domain
- ZITADEL trusted domain API note showing email templates/custom-domain interaction: https://zitadel.com/docs/apis/resources/instance_service_v2/zitadel-instance-v-2-instance-service-add-trusted-domain
