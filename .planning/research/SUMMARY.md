# Research Summary — v1.15 Twilio Communications

**Project:** CivicPulse Run v1.15
**Domain:** Browser-based calling, two-way SMS, phone validation, opt-out management for multi-tenant political campaign field ops
**Researched:** 2026-04-07
**Confidence:** HIGH

## Executive Summary

v1.15 adds Twilio-powered communications to CivicPulse Run: WebRTC click-to-call for phone banking, two-way SMS with a reply inbox, phone number validation via Twilio Lookup, and org-scoped spend controls. The integration follows a well-documented pattern — official Twilio Python SDK with async HTTP client, `@twilio/voice-sdk` v2 in the browser, Fernet-encrypted credentials per org in PostgreSQL, and FastAPI webhook routes secured by Twilio signature validation. All patterns have HIGH-confidence official documentation. The stack additions are minimal: two backend packages (`twilio`, `cryptography`) and one frontend package (`@twilio/voice-sdk`). No new infrastructure is required — bulk SMS jobs run through the existing Procrastinate queue.

The feature surface is large but naturally phases around a hard dependency tree: org credential storage must come first, then phone number provisioning, then webhook infrastructure, then voice calling, then SMS, then spend controls. Voice calling (replacing `tel:` links with in-browser WebRTC) is the highest-value feature and is largely self-contained once webhook infra is in place. SMS is higher complexity — it requires A2P 10DLC brand registration (3-5 week external approval) and full conversation thread management. The single most important lead-time item is starting A2P 10DLC registration in Phase 1, even though SMS ships in Phase 5.

The dominant risks are not technical — they are security and compliance. Storing Twilio credentials in plaintext is the fastest path to org account takeover. Misunderstanding the TCPA political exemption (it only covers manually-initiated calls, not SMS or automated calling) creates class-action exposure for every campaign on the platform. Silent webhook URL mismatch behind Traefik is the most common integration failure. All three are avoidable with clear implementation rules established before any code is written.

## Stack Additions

- **`twilio >= 9.10.4` (Python)** — Official REST client, Access Token generation, TwiML builder, webhook validator, and `AsyncTwilioHttpClient` for non-blocking API calls. Covers all five Twilio integration surfaces in a single package.
- **`cryptography >= 44.0.0` (Python)** — Fernet symmetric encryption for Auth Token and API Key Secret at rest in PostgreSQL. Already a transitive dependency of `authlib`; no new build overhead. Implemented as a SQLAlchemy `TypeDecorator` (`EncryptedString`) for transparent encrypt/decrypt.
- **`@twilio/voice-sdk ^2.18.1` (TypeScript/React)** — Browser WebRTC calling. v1.x EOL as of April 2025 — only v2.x supported. Wraps WebRTC, manages call state via event emitters (`Device`, `Call`). The frontend wraps it in a `useTwilioDevice` hook; no React-specific Twilio library needed.
- **No new infrastructure** — Procrastinate (existing) handles bulk SMS job queuing via PostgreSQL. No Redis, no Celery, no separate webhook microservice.
- **Key integration pattern** — All Twilio API calls must use `AsyncTwilioHttpClient`; synchronous SDK calls in async FastAPI handlers will block the event loop and degrade all concurrent requests.

## Feature Table Stakes

These must ship in v1.15:

**Voice (Click-to-Call):**
- Browser-to-PSTN calling via Voice JS SDK (WebRTC) in phone banking UI
- Access token generation endpoint with VoiceGrant (scoped to org TwiML App)
- Mute/unmute controls, call status events (ringing, answered, completed)
- Graceful `tel:` fallback when no Twilio config — existing field volunteer behavior must not break
- Call duration and disposition captured as `VoterInteraction` record
- DNC check before every dial (existing `DNCService`)

**SMS:**
- Individual SMS to a voter from their contact page (DNC + opt-out check before send)
- Two-way conversational reply inbox for inbound messages
- Message templates with merge fields
- Delivery status tracking (sent / delivered / failed)
- "Reply STOP to opt out" in first message (TCPA/carrier requirement)

**Number Management:**
- BYO phone number registration in org settings
- Phone number inventory display with capabilities (voice/SMS/MMS)

**Opt-Out:**
- STOP keyword processing synced to local DNC list via webhook (Twilio handles carrier-level block; platform syncs for UI visibility)
- `SMS_STOP` reason added to `DNCReason` enum — distinct from call refusals
- START/UNSTOP re-subscribe via inbound webhook

**Compliance guardrails:**
- Server-side calling hours enforcement (8 AM–9 PM in voter inferred timezone from ZIP)
- Block SMS sends to numbers without opt-in consent; compliance warning for L2-imported numbers
- No auto-dialer, no predictive dialer, no ringless voicemail (TCPA anti-features already in PROJECT.md scope exclusions)

**Infrastructure:**
- Org-scoped Twilio credentials stored encrypted at rest (`EncryptedString` TypeDecorator, BYTEA columns)
- Twilio signature validation on all webhook routes (custom FastAPI dependency, NOT middleware)
- Idempotent webhook handlers keyed on `twilio_sid` (Twilio retries on timeout/5xx)
- RLS policies on all new campaign-scoped tables

## Feature Differentiators

These add excellence if scope allows:

- **Inline call controls with voter context card** — caller sees voter name, prior interactions, survey script while on call; no tab-switching during phone banking
- **Call timer with live duration display** — visual urgency indicator for pace during phone bank sessions
- **A2P 10DLC registration wizard** — guided org onboarding through brand registration + Campaign Verify; most competitors punt this to the Twilio console
- **Cost estimate before bulk SMS send** — "This will send 2,340 messages at ~$0.0079/msg = ~$18.49. Proceed?"
- **SMS eligibility badge on voter contact cards** — mobile vs. landline/VoIP indicator after Lookup validation
- **Conversation threading with voter context** — reply inbox shows full thread alongside voter record and prior interaction history
- **Scheduled SMS send** — queue for afternoon delivery via Procrastinate `scheduled_at`
- **Supervisor live session dashboard** — active callers, calls completed, avg duration during phone bank sessions

## Anti-Features

Explicitly excluded from v1.15:

| Anti-Feature | Reason |
|---|---|
| Predictive / auto-dialer | TCPA $500–$1,500 per call; PROJECT.md out-of-scope |
| Ringless voicemail (voicemail drop) | FCC treats as a "call" requiring Prior Express Consent |
| Call audio recording | Two-party consent required in 12 states; PII liability |
| AI-generated SMS reply suggestions | Out of scope per PROJECT.md; off-message risk |
| Short code provisioning | $1,000+/month, 8-12 week approval; overkill for campaign scale |
| Automatic number purchase without explicit confirmation | Real costs ($1-2/month/number); must be deliberate org admin action |
| Shared sender numbers across orgs | Twilio opt-out is per-number-pair; shared numbers pollute all orgs on STOP |
| SMS body content stored in DB | PII liability; store `twilio_sid` reference and body length only |
| Master Auth Token for Access Token signing | Account-wide, cannot be scoped or revoked independently — use API Keys |
| Twilio Conversations API | Session/participant complexity with no benefit for transactional campaign SMS |
| CNAM (caller name) lookup | $0.01/lookup for inaccurate data; voter files already have names |

## Architecture Highlights

**New DB tables (7 total, ~6-7 Alembic migrations):**
- `org_twilio_configs` — one row per org; `auth_token` and `api_key_secret` as BYTEA (Fernet-encrypted); org-level (no campaign RLS); queried via `get_db()`
- `org_twilio_phones` — org phone numbers with capabilities JSONB, default voice/SMS flags; unique on `(organization_id, phone_number)`
- `call_records` — Twilio Voice metadata; RLS-protected; idempotent on `twilio_sid`; links to `voter_interactions` via FK
- `sms_conversations` — thread container per `(campaign_id, org_phone_id, voter_phone)`; tracks opt-out status and unread count
- `sms_messages` — append-only message log; idempotent on `twilio_sid` via `ON CONFLICT DO NOTHING`; body stored as TEXT (PII decision to revisit)
- `twilio_spend_ledger` — append-only billable event log; org-level (no campaign RLS); used for pre-send budget gating
- `phone_validations` — Lookup API result cache; RLS-protected; 90-day TTL; keyed on `(campaign_id, phone_number)`

**Encryption pattern:** `EncryptedString` SQLAlchemy TypeDecorator using `cryptography.fernet.Fernet`. Symmetric key from `TWILIO_ENCRYPTION_KEY` env var injected via K8s Secret. Auth Token and API Key Secret encrypted on write, decrypted only when making Twilio API calls. GET config endpoint returns masked token (last 4 chars only) — full token never returned via API.

**Webhook security:** All Twilio webhooks route to `/api/v1/webhooks/twilio/*` — public routes (no JWT auth) with Twilio signature validation as a FastAPI dependency. Org resolved from `AccountSid` or `To` phone number in form data. Critical: webhook URL must be reconstructed from `X-Forwarded-Proto` + configured `TWILIO_WEBHOOK_BASE_URL` — never from `request.url` which exposes the internal Traefik-side HTTP URL.

**Multi-tenant routing:** Each org has its own Twilio credentials and phone numbers (never shared). Webhook callbacks include `AccountSid` to identify org. `call_records` and `sms_messages` store both `org_id` (via phone lookup) and `campaign_id` at creation time for status callback routing.

**Existing code integration points:**
- `DNCService.add_entry()` reused for STOP processing (new `SMS_STOP` reason value)
- `VoterInteraction` extended via JSONB payload (no schema migration); `InteractionType.SMS` added as StrEnum value
- Procrastinate job queue used for bulk SMS (new `sms_task.py`); 202 Accepted pattern matches existing import jobs
- Phone banking call button switches from `<a href="tel:">` to `device.connect()` when org has Twilio config; full `tel:` fallback if not

## Watch Out For

Top 5 pitfalls most likely to derail v1.15:

1. **Plaintext credential storage (CRITICAL)** — Any column using VARCHAR for `auth_token` or `api_key_secret` exposes full Twilio account control via DB dumps, logs, and Sentry breadcrumbs. Use `EncryptedString` (BYTEA) from the very first migration. Add a CI grep check: any Pydantic response schema field matching `*_token` or `*_secret` that is not write-only is a build failure. Non-negotiable from day one.

2. **Webhook URL mismatch behind Traefik (CRITICAL)** — Twilio HMAC-SHA1 signature is computed against the exact public HTTPS URL. FastAPI behind Traefik sees `http://api:8000/...`; Twilio signed against `https://api.civpulse.org/...`. This causes silent 403 failures on every callback — no call status updates, no inbound SMS, no STOP syncing. Fix: `TWILIO_WEBHOOK_BASE_URL` env var + `_reconstruct_webhook_url()` helper using `X-Forwarded-Proto`. Test with a real Twilio request before Phase 4/5 feature work begins.

3. **TCPA political exemption misunderstanding (CRITICAL)** — The exemption covers manually-dialed calls only. It does NOT cover SMS, auto-dialed calls, or calls using an ATDS. L2 voter file phone numbers are NOT prior express consent for SMS — campaigns must collect opt-in separately. Require `consent_source` field on voter contacts and display a compliance warning when targeting imported numbers without explicit consent.

4. **A2P 10DLC registration lead time (CRITICAL for SMS timeline)** — IRS 527 political orgs must complete Campaign Verify + Twilio 10DLC brand + campaign registration. Total lead time: 2-3 weeks minimum, often 10-15 days in backlog. SMS cannot go live until registration clears. Start ISV registration in Phase 1 even though SMS ships in Phase 5. Block SMS sends with a "SMS Pending Registration" status gate in UI.

5. **Cross-org webhook credential routing (HIGH)** — A single webhook endpoint receives callbacks for all orgs. Resolving the correct org auth token for signature validation requires looking up `AccountSid` in `org_twilio_configs`. Getting this wrong causes silent validation failure for all orgs or creates a security boundary violation. Include org resolution from `AccountSid` as the first step in the webhook dependency; store `call_sid`/`message_sid` with `org_id` at creation time for status callback routing.

**Honorable mentions:** ICE/firewall failure for WebRTC in restrictive campaign locations (enable TURN relay, always offer `tel:` fallback); Lookup API cost explosion on bulk imports ($0.01/number — validate on-demand only, cache 90 days); webhook duplicate processing (Twilio at-least-once delivery — use `ON CONFLICT DO NOTHING` on `twilio_sid`); synchronous Twilio client in async handlers blocking the event loop (always use `AsyncTwilioHttpClient`).

## Phasing Recommendation

The dependency tree is strict: credentials before phones, phones before webhooks, webhooks before voice or SMS, spend controls after billable events flow. Phone validation is standalone and can parallelize with later phases.

**Phase 1: Org Credential Storage + Encryption Foundation**
Rationale: The entire milestone foundation. Nothing calls Twilio until credentials exist and are encrypted. Zero external API calls — pure CRUD + encryption pattern establishment. Also the phase to initiate A2P 10DLC ISV registration externally.
Delivers: `org_twilio_configs` table with `EncryptedString` columns, config CRUD endpoints at `/api/v1/org/twilio/config`, org settings Twilio page, `TWILIO_ENCRYPTION_KEY` env var in settings and K8s, credential test endpoint.
Critical action: Initiate ISV A2P 10DLC registration with Twilio this phase. The 3-5 week approval clock must start now.

**Phase 2: Phone Number Management + Provisioning**
Rationale: Voice and SMS both need a configured `From` number. This phase makes the first real Twilio API calls. Isolated from call/SMS complexity.
Delivers: `org_twilio_phones` table, BYO number registration, available number search + purchase UI, phone inventory with capabilities badges.

**Phase 3: Webhook Infrastructure + Signature Validation**
Rationale: Both Voice (Phase 4) and SMS (Phase 5) depend on webhooks. Building and testing this in isolation surfaces the Traefik URL reconstruction bug before it is buried in a feature phase.
Delivers: `/api/v1/webhooks/twilio/*` route group, `validate_twilio_signature` FastAPI dependency, `_reconstruct_webhook_url()` with `X-Forwarded-Proto` handling, webhook router registered without JWT auth prefix.
Risk: High (the #1 integration failure mode) — must be tested against production proxy, not just local dev.

**Phase 4: Click-to-Call via Voice SDK**
Rationale: Highest-value feature. Replaces `tel:` links with in-browser WebRTC calling that captures metadata. Depends on Phase 3 for status callbacks. Can parallelize with Phase 5 once Phase 3 is proven.
Delivers: `/campaigns/{cid}/twilio/voice-token` endpoint, `call_records` table, TwiML voice webhook handler, `useTwilioDevice` React hook, `VoiceCallButton` in phone banking, calling hours enforcement.

**Phase 5: Two-Way SMS + STOP/DNC Integration**
Rationale: High complexity but self-contained after Phase 3. STOP processing reuses existing `DNCService`. Block real sending behind A2P registration status gate.
Delivers: `sms_conversations` + `sms_messages` tables with RLS, SMS send/reply endpoints, inbound SMS webhook + STOP pipeline, SMS inbox UI, bulk SMS via Procrastinate, `DNCReason.SMS_STOP` enum value.
Prerequisite: A2P 10DLC registration (started Phase 1) must be approved before this phase sends to real numbers.

**Phase 6: Spend Tracking + Budget Enforcement**
Rationale: Policy layer on top of existing billable events. Building last means all call_records and sms_messages are already flowing with price data.
Delivers: `twilio_spend_ledger` table, spend aggregation queries, daily/total budget soft enforcement (pre-send `SELECT SUM` check), spend dashboard in org settings (Recharts bar chart, budget progress bar).

**Phase 7: Phone Validation (Lookup API)**
Rationale: Lowest priority — platform works fully without it. Depends only on Phase 1 credentials. Can parallelize with Phases 4-6.
Delivers: `phone_validations` cache table, Lookup v2 endpoint, inline validation button + `LineTypeBadge` in voter contact UI, SMS eligibility filtering.

**Dependency graph summary:**
- Phases 1-3 are infrastructure-only (no user-visible features) — treat as a foundation sprint
- Phases 4 and 5 can parallelize by separate developers once Phase 3 is tested
- Phase 6 can begin once Phase 4 produces first `call_records` with price data
- Phase 7 is standalone and lowest risk at any point after Phase 1

## Open Questions

Decisions needed before or during implementation:

1. **DNC channel semantics** — The existing `DNCEntry` model conflates call and SMS opt-outs. A voter who STOPs SMS may still accept calls. Decision: add `channel VARCHAR(10) DEFAULT "all"` to `dnc_entries` (values: `all`, `sms`, `voice`) and update `DNCService.check_number()` to accept an optional channel filter. This must be resolved before any Phase 5 DNC code is written.

2. **A2P 10DLC ISV registration** — CivicPulse must complete its own ISV registration before any customer org can send political SMS. The exact current steps and timeline require manual verification with Twilio (the process has changed several times). Start this in Phase 1 and document the outcome.

3. **Calling hours timezone mapping** — Python `zoneinfo` handles timezone logic but not ZIP-to-timezone mapping. Options: `us-zipcode` library, a static ZCTA lookup table, or PostGIS geometry of voter addresses. Needs a decision before Phase 4 calling hours enforcement is coded.

4. **SMS body storage policy** — Research recommends not storing message body content (PII liability). The current schema draft includes a `body TEXT` column on `sms_messages`. Decision: store body or store only `body_length` + `twilio_sid` reference? The inbox UI requires the body to be visible — if not stored locally, the inbox must fetch from Twilio API on demand. Confirm policy before Phase 5 schema is finalized.

5. **Twilio subaccounts vs. master account** — Research assumed BYO Twilio credentials per org (each org uses their own Twilio account). If CivicPulse ever offers a managed Twilio tier (platform provisions numbers on behalf of orgs), subaccounts would be needed. Confirm v1.15 is strictly BYO credentials only.

---
*Research completed: 2026-04-07*
*Ready for roadmap: yes*
