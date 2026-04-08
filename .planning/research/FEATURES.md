# Feature Landscape

**Domain:** Transactional email delivery for product invites and auth/system email
**Project:** CivicPulse Run API
**Researched:** 2026-04-08
**Overall confidence:** MEDIUM-HIGH

## Scope Boundary

This milestone is about **system-triggered transactional email only**:
- Existing org/campaign/staff/volunteer invite flows sending real email
- ZITADEL auth/system email delivered through a configured provider path
- Basic delivery state and auditability for operators

This milestone is **not** campaign-authored email:
- No newsletters, blasts, list segmentation, drip campaigns, or editor workflows
- No unsubscribe/preferences center beyond provider-required compliance behavior
- No analytics product for opens/clicks as a roadmap driver

## How Transactional Email Foundations Typically Work

1. App code emits a typed email request from an existing product event.
2. A provider abstraction normalizes send, provider message ID, status, and error handling.
3. Templates are rendered from server-owned data with both HTML and text parts.
4. The app persists message metadata tied to the domain object that caused the email.
5. Provider webhooks update final delivery state for bounce, complaint, delivered, failed, and unsubscribed/suppressed cases.
6. Auth/system mail from the identity provider is configured separately but documented and operationally aligned with the app provider setup.

For this milestone, the critical split is:
- **App-owned emails:** membership invites and similar product flow emails sent by CivicPulse
- **Auth-owned emails:** password reset, verification, and related ZITADEL emails configured in ZITADEL, not rebuilt in app code

## Table Stakes

Features users and operators will expect for a credible first transactional email milestone.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Existing invite flows send real email | Invites without email delivery are incomplete product behavior | Medium | Must cover org, campaign, volunteer, and staff flows already in the app |
| Typed transactional email service | Prevents provider coupling and keeps future providers possible | Medium | Normalize provider response, message ID, accepted/rejected result, and retry-safe API surface |
| Provider-backed sending with Mailgun first | A real provider is the minimum viable delivery path | Medium | Use provider domain, authentication, and environment-scoped config |
| Template system for invite/auth-adjacent emails | Operators need branded, consistent, maintainable content | Medium | Prefer server-rendered templates with subject + HTML + text variants |
| Invite email content includes org/campaign context | Recipients need to know who invited them and why | Low | Include inviter name, target org/campaign, role, action CTA, and expiration if applicable |
| Stable accept-invite links into existing flows | The email must land in the already-working invite acceptance path | Low | Reuse current invite tokens and acceptance routes rather than inventing new flow state |
| Delivery metadata persisted in app DB | Operators need proof that a send was attempted and what happened | Medium | Store message type, recipient, related entity, provider, provider message ID, timestamps, latest status, last error |
| Delivery status updates from provider events | “Sent” is not the same as delivered | Medium | Track accepted, delivered, bounced, complained, failed, and suppressed/rejected when available |
| Idempotent send behavior for invite flows | Invite resend/retry paths otherwise create duplicates and noisy state | Medium | Key on invite ID + template/version + recipient or equivalent application idempotency key |
| Basic resend and failure visibility for staff | Staff need to recover from typos, expired invites, or transient delivery issues | Medium | Milestone can be simple: resend endpoint/action plus visible last-send status |
| ZITADEL outbound email configured and documented | Auth emails are table stakes even if app code does not send them | Medium | Cover sender identity, SMTP/provider wiring, env/secrets, and operator runbook |
| SPF/DKIM/DMARC and sender domain setup guidance | Deliverability breaks without domain authentication | Medium | This is operationally mandatory even if partly outside app code |
| Plain-text fallback | Transactional mail should still be readable in restrictive clients | Low | Generate alongside HTML templates |
| Minimal accessibility and safety standards | System email must be readable and trustworthy | Low | Clear CTA, accessible structure, no image-only content, no marketing-heavy layout |

## Differentiators

Useful, but not required to call the milestone complete.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Light branding configuration | Makes system email feel product-native without becoming a full design system | Medium | Logo, product name, support contact, sender name, and footer copy |
| Provider health/admin view | Faster operator debugging when email issues occur | Medium | Aggregate recent failures, bounce reasons, and webhook health |
| Template preview/testing workflow | Reduces regressions before sending real email | Medium | Preview with fixture data and send-to-test-address flow |
| Delivery event timeline per invite | Helps support diagnose “I never got it” claims | Medium | Show accepted, delivered, bounced, resend attempts, and acting user |
| Suppression-aware UX | Avoids repeated sends to bounced or complained addresses | Medium | Surface a warning before resend if provider marks recipient suppressed |
| Multi-provider readiness beyond interface level | Real failover or easy provider swap lowers vendor risk | High | Useful later, but not needed for first-provider milestone |

## Anti-Features

Features to explicitly defer for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Campaign-authored bulk email | Different product surface, compliance needs, and UX | Keep milestone limited to system-triggered transactional mail |
| Marketing automations or drip sequences | Introduces segmentation, scheduling, analytics, and unsubscribe complexity | Defer to a future communications milestone |
| Rich email editor or per-org custom template builder | High UI and governance cost for little initial value | Use code-owned templates plus limited configuration |
| Open/click analytics as a core success metric | Transactional success is delivery and completion, not engagement marketing metrics | Record provider metadata only if trivially available; do not build product analytics around it |
| In-app email inbox or reply handling | Turns outbound email into a customer support product | Use provider logs and support mailbox only |
| Full preferences center/unsubscribe management | Primarily relevant for non-transactional communications | Limit to provider-required suppression/compliance handling |
| Attachment support | Adds security, storage, and deliverability risk | Keep invites/auth mail link-based and text-light |
| Cross-tenant shared email content customization | Increases branding and approval surface in a multi-tenant app | Use one platform-owned transactional style |

## Expected Behavior for Invite and Auth/System Email

### Invite Emails

Expected milestone behavior:
- Sending an org/campaign/staff/volunteer invite triggers a transactional email immediately or via a background job with equivalent UX.
- Email content tells the recipient who invited them, what they are being invited to, what role/access they will receive, and what action they should take next.
- Invite links point to the existing acceptance/auth flow and preserve enough context to finish onboarding cleanly.
- Resending an invite does not create ambiguous duplicate domain state.
- Expired, revoked, or already-accepted invites do not keep sending misleading emails.

### Auth/System Emails

Expected milestone behavior:
- Password reset, verification, and other identity-provider-owned email continue to come from ZITADEL, not duplicated in app code.
- Sender domain, provider credentials, and operational ownership are documented end to end.
- Operators can distinguish “CivicPulse app email” from “ZITADEL email” when debugging delivery issues.

## Delivery and Audit Expectations

For this milestone, “audit” should stay narrow and operational:

| Expectation | Complexity | Notes |
|------------|------------|-------|
| Persist send attempts | Medium | One row per logical send attempt tied to invite or auth-related context where available |
| Persist provider message identifiers | Low | Required to reconcile webhook events and support tickets |
| Persist latest delivery state | Medium | Enough for UI/status checks and support debugging |
| Persist failure reason / provider error excerpt | Low | Keep concise and non-secret |
| Record actor and trigger | Low | Who initiated send or resend, and from what domain object |
| Preserve timestamps | Low | requested_at, accepted_at, delivered_at, failed_at, etc. |
| Webhook authenticity verification | Medium | Required for trustworthy delivery updates |

Explicitly defer:
- Full long-term analytics warehouse for email events
- Complex SLA reporting
- BI-oriented funnel dashboards

## Template and Configuration Needs

| Need | Why | Complexity | Notes |
|------|-----|------------|-------|
| Template registry by message type | Prevents ad hoc email generation | Medium | Example types: org invite, campaign invite, volunteer invite, staff invite |
| Shared layout with partials | Keeps branding and footer changes centralized | Low | Header/footer/base CTA block |
| Provider config per environment | Required for dev/staging/prod safety | Medium | API key, domain, sender address, region/endpoints if applicable |
| Sender identity policy | Avoids inconsistent From/Reply-To behavior | Low | One approved sender strategy for app emails |
| Support/debug docs for operators | Email issues are partly operational | Low | DNS setup, secret placement, webhook setup, ZITADEL config ownership |
| Local/test delivery strategy | Needed for safe development and CI | Medium | Mock provider, sandbox mode, or captured test sink |

## Dependencies on Existing Invite Flows

```text
Existing invite creation flow
  -> email service send request
  -> template rendering with invite context
  -> provider send
  -> persisted audit row
  -> acceptance link returns into existing auth/invite path
```

Downstream dependency notes:
- Reuse current invite models, token rules, expiry rules, and acceptance UX.
- Do not redesign invite domain logic just to support email.
- Any resend action should depend on current invite validity rules.
- Volunteer/staff invite variants should share the same email foundation even if copy differs.

## MVP Recommendation

Prioritize:
1. App-owned invite emails for every existing invite flow
2. Provider abstraction plus Mailgun implementation, persistence, and webhook-backed delivery status
3. ZITADEL email delivery configuration and operator documentation

Defer:
- Branding customization: useful, but not required for trustworthy delivery
- Provider failover: adds substantial complexity before a real outage history exists
- Campaign/mass email capabilities: separate milestone with different compliance and UX needs

## Sources

- Project context: [.planning/PROJECT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/PROJECT.md)
- Mailgun docs, Sending Messages via HTTP: https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http
- ZITADEL docs, `AddEmailProviderSMTP`: https://zitadel.com/docs/reference/api/admin/zitadel.admin.v1.AdminService.AddEmailProviderSMTP

## Confidence Notes

- **HIGH:** Transactional foundation shape, provider abstraction need, ZITADEL/provider split, and delivery/audit baseline are consistent with official provider/auth docs and the project context.
- **MEDIUM:** Differentiator prioritization and operator UX recommendations are based on common current practice rather than a single canonical standard.
