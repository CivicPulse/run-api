# Domain Pitfalls -- Twilio Communications

**Domain:** Browser-based calling, two-way SMS, number validation for multi-tenant campaign field operations
**Researched:** 2026-04-07
**Confidence:** HIGH (Twilio-specific), HIGH (regulatory -- multiple legal sources cross-referenced)

---

## Security & Credential Pitfalls

### CRITICAL -- Pitfall 1: Plaintext Auth Token Storage

**What goes wrong:** Twilio Auth Tokens stored as plain VARCHAR in PostgreSQL appear in database dumps, `pg_stat_statements`, slow query logs, Sentry breadcrumbs, and backup files. An attacker with any database read access gains full control of every org's Twilio account.

**Why it happens in this codebase:** The Organization model has no encrypted-at-rest columns. Adding `twilio_auth_token` as VARCHAR is the path of least resistance. Error responses had stack-trace leaks fixed in v1.13, but structlog fields or Pydantic serialization could still leak tokens.

**Consequences:** Full Twilio account takeover per org. Attacker sends unlimited SMS/calls billed to the org. Voter PII exposure through Twilio call/message logs.

**Prevention:**
- Encrypt with Fernet (via `cryptography` library) from day one. Never create a plaintext credential column.
- Use BYTEA columns for encrypted values. Platform encryption key from environment variables only.
- Exclude credential columns from all Pydantic response schemas. Add a CI grep check: any schema field matching `*_token`, `*_secret`, `*_key` that isn't write-only is a failure.
- Add `auth_token` to structlog's processor filter list to prevent logging.
- Rotate Twilio auth tokens quarterly. Twilio supports secondary auth tokens for zero-downtime rotation.

**Detection:** Grep response schemas for credential fields. Review Sentry breadcrumbs. Monitor Twilio usage dashboard for unexpected activity.

### CRITICAL -- Pitfall 2: Webhook URL Mismatch Behind Reverse Proxy

**What goes wrong:** `RequestValidator.validate()` silently returns `False` because the URL constructed from FastAPI's `request.url` differs from the public URL Twilio POSTed to. All webhook processing fails -- no call status updates, no inbound SMS, no STOP handling.

**Why it happens in this codebase:** FastAPI behind Traefik sees `http://api:8000/...` while Twilio POSTed to `https://api.civpulse.org/...`. The HMAC-SHA1 signature is computed against the exact public URL including scheme, host, port, and path.

**Consequences:** Silent failure. Twilio retries, then gives up. No status callbacks processed, no inbound SMS, no STOP/DNC sync.

**Prevention:**
- Configure `TWILIO_WEBHOOK_BASE_URL` as an explicit environment setting. Construct validation URL as `base_url + request.url.path + "?" + request.url.query` (if query params exist).
- Never derive the URL from the incoming request object behind a proxy.
- For JSON payloads (Event Streams), use `validateRequestWithBody` -- not the form-parameter method.
- Test signature validation with a real Twilio request before going live. Add structured logging on validation failure that includes the constructed URL.

### HIGH -- Pitfall 3: Auth Token Used to Sign Access Tokens Instead of API Key

**What goes wrong:** Developer uses the master Auth Token to sign Voice SDK Access Tokens instead of a scoped API Key. If the token JWT is intercepted, the signing secret is the account's master credential.

**Why it happens:** Twilio quick-start examples sometimes use Auth Token for simplicity.

**Prevention:**
- The `AccessToken()` constructor must use `api_key_sid` and `api_key_secret`, never `auth_token`.
- Store API Key credentials separately from the Auth Token in the twilio_credentials table.
- Add a code review checklist item. The JWT header's `iss` field contains the API Key SID -- if it contains the Account SID instead, it was signed with the Auth Token.

### HIGH -- Pitfall 4: Access Token Over-Permissioning

**What goes wrong:** Voice SDK Access Token grants are too broad. A captured token allows calls to any number, not just campaign call list numbers.

**Prevention:**
- Set token TTL to 15-30 minutes (not the 1-hour default). Handle `tokenWillExpire` event for refresh.
- Bind the `identity` to the authenticated user's ID.
- In the TwiML application handler, validate the destination number exists in the campaign's active call list before connecting. Never trust client-side number input.

---

## Multi-Tenant Pitfalls

### CRITICAL -- Pitfall 5: Cross-Org Credential Leakage via Webhook Routing

**What goes wrong:** Webhook endpoints receive callbacks for all orgs. If routing doesn't correctly identify which org's auth token to use for signature validation, validation uses the wrong token (always failing) or falls back to a platform-level token that shouldn't exist.

**Why it happens in this codebase:** RLS is scoped to `campaign_id`, but Twilio credentials are at the `organization` level. Webhooks arrive with a CallSid/MessageSid but no campaign_id. The routing from "Twilio callback" to "which org, which campaign" is a new mapping.

**Prevention:**
- Include `org_id` in the webhook URL path: `/api/v1/webhooks/twilio/{org_id}/voice/status`.
- Look up the org's decrypted auth token from `org_id`, validate signature, then proceed.
- Store `call_sid`/`message_sid` with both `org_id` and `campaign_id` at call/SMS creation time. When a status callback arrives, look up by SID to find campaign context.
- Do NOT use a single platform-level Twilio account for all orgs.

### HIGH -- Pitfall 6: RLS Gap on New Communication Tables

**What goes wrong:** New tables (call_logs, message_logs, sms_conversations) have `campaign_id` but no RLS policy. Cross-campaign data leakage for voter phone numbers and message content.

**Why it happens:** All 33 existing tables have RLS. The pattern is established but easy to forget when adding 3-4 new tables in one migration.

**Prevention:**
- Extend the existing AST-based CI guard (rate-limit check pattern) to verify all tables with `campaign_id` have RLS enabled.
- All new communication endpoints must use `get_campaign_db` dependency.
- Write explicit RLS isolation tests for communication records (extend v1.5 test pattern).

### HIGH -- Pitfall 7: Phone Number Shared Across Orgs Breaks Opt-Out Isolation

**What goes wrong:** If sender numbers are shared across orgs, a voter's STOP to that number opts them out of ALL orgs using it. Twilio's opt-out is per phone-number-pair, not per-org.

**Prevention:**
- Each org must own its phone numbers exclusively. BYO numbers are org-scoped.
- Never pool sender numbers across orgs. Document this constraint in org onboarding.

---

## TCPA & Compliance Pitfalls (Political Campaigns)

### CRITICAL -- Pitfall 8: Misunderstanding the Political Campaign TCPA Exemption

**What goes wrong:** Developers assume "political calls are exempt from TCPA" and skip consent checks. This is dangerously wrong. The exemption is narrow:

- **Manual dialing to landlines:** Exempt from TCPA restrictions. No PEC needed.
- **Manual dialing to cell phones:** The TCPA exemption for political calls applies only to manually dialed calls. The Twilio Voice SDK click-to-call qualifies as "manual" if a volunteer initiates each call by clicking.
- **Auto-dialed or pre-recorded calls to cell phones:** Require Prior Express Consent (PEC). No political exemption.
- **DNC registry scrubbing:** NOT required for political calls (this IS an actual exemption).
- **Voter registration phone numbers are NOT consent:** A voter giving their number to register to vote does NOT constitute PEC for campaign calls. The FCC has explicitly ruled this.
- **AI/pre-recorded voice:** Treated as robocalls requiring PEC. No political exemption.

**Consequences:** $500 per violation, trebled to $1,500 for willful violations. Class action lawsuits. Supreme Court in Barr v. American Political Consultants (2020) affirmed TCPA applies to political calls.

**Why this matters for CivicPulse:** L2 voter file imports include phone numbers given for voter registration, NOT for campaign contact. Using them for automated calling or bulk SMS creates TCPA liability for every campaign on the platform.

**Prevention:**
- CivicPulse's click-to-call (volunteer initiates) is likely compliant. Document this clearly as "manual dialing."
- Do NOT add auto-dial or predictive dialing (already Out of Scope -- maintain this boundary).
- Add `consent_source` field to voter contacts: "voter_provided", "l2_import", "web_form", etc.
- For SMS: imported L2 phone numbers do NOT have SMS consent. Campaigns must collect opt-in separately.
- Display a compliance warning in SMS composition UI when targeting voters without explicit opt-in.

### CRITICAL -- Pitfall 9: Calling Hours Violations

**What goes wrong:** TCPA restricts calls to 8 AM - 9 PM in the *called party's* time zone. A campaign in Eastern time calling a Pacific voter at 6 AM ET (3 AM PT) violates TCPA.

**Why it happens:** Voter files include addresses but not time zones. Cell phone numbers don't reliably indicate time zone (portability).

**Prevention:**
- Derive voter time zone from registered address via ZIP-to-timezone mapping (use Python `zoneinfo` + a ZIP lookup table).
- Enforce calling hours server-side: API should refuse to return call list entries outside 8 AM - 9 PM in the voter's inferred time zone.
- Some states have stricter hours (e.g., 9 AM - 8 PM). Consider configurable per-state calling windows.
- Display a "calling hours" indicator in the phone banking UI showing which voters are currently callable.

### HIGH -- Pitfall 10: Consent Revocation Timing Gap

**What goes wrong:** A voter texts STOP or says "take me off your list" during a call. If the opt-out isn't processed before the next contact (even seconds later in a phone bank session), that subsequent contact is a TCPA violation.

**Prevention:**
- SMS STOP: Twilio handles this at the carrier/platform level automatically -- further messages are blocked. Sync to local DNC table via webhook for UI visibility.
- Voice: the existing auto-DNC mechanism on "refused" outcome fires synchronously before the next call is claimed. Verify this remains true with Twilio integration.
- Add a webhook handler for Twilio opt-out notifications to immediately update DNC. Don't rely on batch sync.

### HIGH -- Pitfall 11: Call Recording Without Consent in Two-Party States

**What goes wrong:** If call recording is enabled, ~12 states require ALL parties to consent (CA, CT, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA). Recording without consent is a criminal offense in some jurisdictions.

**Prevention:**
- If recording is added, play a consent disclosure via TwiML `<Say>` before recording begins on every call.
- Better: explicitly exclude audio recording from v1.15 scope. The existing phone banking records outcomes, not audio.
- If recording is needed later, comply with the strictest standard (two-party consent nationwide).

---

## SMS / Messaging Pitfalls

### CRITICAL -- Pitfall 12: A2P 10DLC Registration for Political ISVs

**What goes wrong:** Sending SMS from unregistered 10DLC numbers results in carrier filtering (messages silently dropped), additional per-message fees, and potential number blacklisting. For political messaging specifically:
- IRS 527 Political Organizations MUST register with Campaign Verify AND complete 10DLC with the "Political" special use case.
- Without this: lowest throughput tier, carrier penalties, potential number suspension.

**Why this is complex for CivicPulse:** As an ISV, CivicPulse must: (1) register itself, (2) register each customer org (KYC), (3) obtain Campaign Verify tokens for 527 orgs, (4) register messaging campaigns with "Political" use case. This is a four-step process per org.

**Approval timeline:** Brand: 1-3 business days. Campaign: 2-7 days (currently 10-15 days backlog). New orgs cannot send SMS for 2-3 weeks after signup.

**Prevention:**
- Build A2P 10DLC registration into org onboarding, not as an afterthought.
- Collect Campaign Verify token during Twilio credential setup.
- Display registration status in org settings: "SMS: Pending Registration" / "SMS: Active".
- Block SMS sending until 10DLC is approved. Never send from unregistered numbers.
- Use Twilio API (not Console) for ISV registration workflows.
- Start this process early in development -- platform ISV registration alone takes days.

### HIGH -- Pitfall 13: Twilio Handles STOP but Local DNC Doesn't Know

**What goes wrong:** Twilio automatically blocks messages to opted-out numbers, but CivicPulse's DNC table is unaware. Call lists still show the voter as contactable. Volunteers see no indication of SMS opt-out. Twilio silently drops attempted messages with no visible error.

**Additional (April 2025):** REVOKE and OPTOUT are now additional opt-out keywords per FCC ruling. Toll-Free numbers have carrier-level opt-out outside Twilio's control.

**Prevention:**
- Subscribe to Twilio's opt-out webhook. Sync STOP events to local DNC with reason `SMS_OPT_OUT`.
- Expand `DNCReason` enum: add `SMS_OPT_OUT` and `TWILIO_STOP` alongside existing REFUSED, VOTER_REQUEST, REGISTRY_IMPORT.
- Distinguish voice DNC from SMS DNC. Display per-channel opt-out status in voter contact UI.

### MODERATE -- Pitfall 14: Carrier Filtering of Political Content

**What goes wrong:** Even with proper 10DLC registration, carriers filter messages with political keywords, URL shorteners, or aggressive formatting. Messages are silently dropped with no error returned.

**Prevention:**
- Provide template guidance in SMS composition UI. Avoid URL shorteners.
- Include "Reply STOP to opt out" in every message.
- Monitor delivery rates per campaign. Sudden drops indicate filtering.
- Use Twilio Messaging Insights to track delivery vs. filter rates.

### MODERATE -- Pitfall 15: Multi-Segment SMS Cost Surprise

**What goes wrong:** Messages over 160 characters are sent as multi-segment SMS, costing 2-4x expected. Campaign staff compose long messages without visibility into cost.

**Prevention:**
- Show character count AND segment count in SMS compose UI.
- Log `num_segments` from Twilio response for spend tracking.

---

## Voice SDK Pitfalls

### HIGH -- Pitfall 16: ICE Negotiation Failure Behind Firewalls

**What goes wrong:** WebRTC requires UDP connectivity to Twilio media servers. Corporate firewalls, restrictive Wi-Fi (government buildings, libraries, community centers where campaigns operate), and symmetric NATs block UDP. Call connects at signaling level but has no audio.

**Why this matters:** Campaign volunteers call from diverse locations with varying network quality.

**Prevention:**
- Enable TURN relay fallback (Voice SDK does this automatically if Network Traversal Service is enabled on the account).
- Add a pre-call network quality check using Twilio's preflight API. Warn if WebRTC is unsupported.
- Always offer `tel:` link fallback (planned for mobile). On desktop, offer "Call from your phone" option.
- Document firewall requirements for campaign IT staff.

### HIGH -- Pitfall 17: Browser Microphone Permission Denial

**What goes wrong:** User clicks "Call" but browser blocks microphone access. Voice SDK throws `NotAllowedError` that isn't surfaced to the user. Safari resets permissions more aggressively than Chrome.

**Prevention:**
- Request microphone permission explicitly before first call, with a clear UI explanation.
- Handle `NotAllowedError` with specific instructions per browser.
- Test on Chrome, Firefox, Safari, and mobile Safari.
- Trigger audio context on user click to avoid autoplay restrictions.

### MODERATE -- Pitfall 18: Token Expiry During Active Session

**What goes wrong:** Access Token expires mid-session (default 1 hour). `Device` emits `tokenWillExpire` 10 seconds before expiry. If unhandled, subsequent calls fail silently.

**Prevention:**
- Set token TTL to 2-4 hours for phone bank shifts, but implement refresh via `tokenWillExpire` handler.
- On refresh failure (network issue), show a clear "Session expired" message.

### MODERATE -- Pitfall 19: TwiML Application SID Misconfiguration

**What goes wrong:** TwiML App Voice URL doesn't point to the correct webhook endpoint. Outbound calls from browser fail silently.

**Prevention:**
- Validate TwiML App URL on org config save (test request to verify endpoint is reachable).
- Include expected webhook URL in org settings UI.
- Check Twilio debugger for "HTTP retrieval failure" errors on call failures.

---

## Operational Pitfalls

### HIGH -- Pitfall 20: Lookup API Cost Explosion at Import Scale

**What goes wrong:** Lookup v2 Line Type Intelligence charges ~$0.005-$0.01 per lookup. Basic validation is free. Running carrier lookups on a 50K voter import costs $250-$500. A 500K import: $2,500-$5,000.

**Prevention:**
- Basic E.164 format validation is free -- always use this.
- Carrier/line-type lookups should be opt-in, triggered only before SMS send or during call list generation, not on import.
- Cache results in a `phone_lookup_cache` table with 90-day TTL. Phone carriers don't change frequently.
- Display cost estimates before bulk lookups: "Looking up 5,000 numbers costs approximately $25-$50."
- Set daily Lookup spend cap per org.
- Rate limit: use asyncio.Semaphore (10-20 concurrent) with exponential backoff on 429s.

### HIGH -- Pitfall 21: Webhook Duplicate Processing

**What goes wrong:** Twilio guarantees at-least-once delivery. On timeout or 5xx, Twilio retries. Without idempotency, calls/messages get double-logged, skewing analytics and potentially double-processing DNC entries.

**Prevention:**
- Use `CallSid`/`MessageSid` + status as deduplication key.
- Add `twilio_event_log` table with unique constraint on `(sid, status)`. Use `INSERT ... ON CONFLICT DO NOTHING`.
- Return 200 immediately after validation, process asynchronously via Procrastinate (existing pattern).
- Ensure webhook handlers respond within 5 seconds (Twilio's connection timeout is 15 seconds).

### HIGH -- Pitfall 22: Spend Limit Race Conditions

**What goes wrong:** Multiple callers in a phone bank session simultaneously initiate calls. The check-then-call-then-update pattern is not atomic. Budget is exceeded before the counter updates.

**Prevention:**
- Pre-decrement budget: reserve estimated cost with `SELECT FOR UPDATE` before making Twilio API call. Credit back on failure.
- Use Twilio Usage Triggers as a secondary safety net (but note: they have minutes-to-hours latency, not real-time).
- For bulk SMS, calculate total estimated cost and reject the batch if it exceeds remaining budget.

### HIGH -- Pitfall 23: Synchronous Twilio API Calls Blocking Event Loop

**What goes wrong:** Using `client.messages.create()` (sync) in an async FastAPI endpoint blocks the event loop, causing timeouts for all concurrent requests.

**Why it happens:** Most Twilio Python examples show sync usage. The async API requires explicitly passing `AsyncTwilioHttpClient`.

**Prevention:**
- Create the Twilio client with `AsyncTwilioHttpClient` at initialization.
- Lint rule: any `twilio.rest.Client` call in an `async def` must use async methods.

### MODERATE -- Pitfall 24: Status Callbacks Arrive Out of Order

**What goes wrong:** Twilio does NOT guarantee webhook delivery order. A "completed" callback can arrive before "ringing" or "answered." Sequential state processing overwrites later status with earlier one.

**Prevention:**
- Design call state as a forward-only state machine (ringing -> in-progress -> completed).
- Use the `Timestamp` field in callbacks to order events, not arrival order.
- Store all status transitions for audit trail, not just current status.

### MODERATE -- Pitfall 25: Twilio SMS Rate Limits on Standard Numbers

**What goes wrong:** Standard 10DLC numbers have per-second rate limits (varies by trust score, typically 1-75 msg/sec). Bulk SMS exceeding this results in 429 errors and undelivered messages.

**Prevention:**
- In Procrastinate bulk SMS job, throttle to match the org's Twilio number throughput tier.
- Queue messages and send at a controlled rate. Report send progress in UI.
- Messaging Services with number pools increase throughput but add complexity.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Org Twilio Config (Phase 1) | Plaintext credentials (#1) | Fernet encryption from day one; BYTEA columns |
| Org Twilio Config (Phase 1) | Cross-org webhook routing (#5) | Org ID in webhook URL path; SID-to-campaign mapping |
| Schema Design (Phase 1) | RLS gap on new tables (#6) | CI check for RLS on all campaign_id tables |
| Schema Design (Phase 1) | Webhook idempotency (#21) | Event log table with unique constraint |
| Schema Design (Phase 1) | Out-of-order callbacks (#24) | Timestamp-based state machine design |
| Voice Click-to-Call (Phase 2) | Webhook URL mismatch (#2) | TWILIO_WEBHOOK_BASE_URL env var |
| Voice Click-to-Call (Phase 2) | Auth Token in Access Token (#3) | Enforce API Key usage; code review check |
| Voice Click-to-Call (Phase 2) | ICE/firewall failure (#16) | TURN fallback + tel: link fallback |
| Voice Click-to-Call (Phase 2) | Microphone permissions (#17) | Pre-call permission request |
| Voice Click-to-Call (Phase 2) | Calling hours (#9) | ZIP-to-timezone + server-side enforcement |
| Two-Way SMS (Phase 2-3) | A2P 10DLC registration (#12) | Start registration EARLY -- 2-3 week lead time |
| Two-Way SMS (Phase 2-3) | STOP/DNC sync (#13) | Webhook handler + DNCReason expansion |
| Two-Way SMS (Phase 2-3) | TCPA consent for SMS (#8) | consent_source field; compliance warnings |
| Two-Way SMS (Phase 2-3) | Event loop blocking (#23) | AsyncTwilioHttpClient from start |
| Lookup & Spend (Phase 3-4) | Lookup cost (#20) | Cache 90 days; batch only; cost estimates |
| Lookup & Spend (Phase 3-4) | Spend limit races (#22) | Pre-decrement with SELECT FOR UPDATE |

---

## Sources

- [Twilio: Webhooks Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) -- signature validation, URL matching, proxy gotchas
- [Twilio: Secure Your Account](https://www.twilio.com/docs/usage/security/secure-your-twilio-account) -- credential storage best practices
- [Twilio: Protect Your Auth Token](https://www.twilio.com/en-us/blog/protect-phishing-auth-token-fraud) -- auth token exposure risks
- [Twilio: Access Tokens](https://www.twilio.com/docs/iam/access-tokens) -- token lifetime, API Key vs Auth Token
- [Twilio: Voice SDK Best Practices](https://www.twilio.com/docs/voice/sdks/javascript/best-practices) -- WebRTC pitfalls, token refresh
- [Twilio: Voice SDK Network Connectivity](https://www.twilio.com/docs/voice/sdks/network-connectivity-requirements) -- firewall/NAT/TURN
- [Twilio: Troubleshooting Voice JavaScript SDK](https://support.twilio.com/hc/en-us/articles/223180908) -- common SDK issues
- [Twilio: A2P 10DLC for Political ISVs](https://help.twilio.com/articles/9515675492251) -- political registration requirements
- [Twilio: A2P 10DLC Overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) -- registration enforcement
- [Twilio: Opt-out Keywords (STOP Filtering)](https://help.twilio.com/articles/223134027) -- automatic STOP handling
- [Twilio: Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) -- custom opt-out configuration
- [Twilio: Lookup v2 API](https://www.twilio.com/docs/lookup/v2-api) -- pricing, rate limits
- [Twilio: Usage Triggers](https://support.twilio.com/hc/en-us/articles/223132387) -- spend protection
- [Twilio: Legal Considerations for Recording](https://help.twilio.com/articles/360011522553) -- two-party consent states
- [Twilio: Does Voice Work Behind Firewalls?](https://support.twilio.com/hc/en-us/articles/223133207) -- firewall requirements
- [GitGuardian: Remediating Twilio Credential Leaks](https://www.gitguardian.com/remediation/twilio-master-credential) -- leak remediation
- [Hookdeck: Twilio Webhooks Guide](https://hookdeck.com/webhooks/platforms/twilio-webhooks-features-and-best-practices-guide) -- retry behavior, idempotency
- [TCPA Compliance for Political Calls](https://mslawgroup.com/tcpa-compliance-for-political-calls/) -- political exemptions, manual vs auto-dial
- [Navigating TCPA Regulations for Political Calls](https://mslawgroup.com/navigating-tcpa-regulations-for-political-calls/) -- PEC requirements, voter registration data
- [BCLP: TCPA Opt-Out Rules April 2025](https://www.bclplaw.com/en-US/events-insights-news/the-tcpas-new-opt-out-rules-take-effect-on-april-11-2025-what-does-this-mean-for-businesses.html) -- REVOKE/OPTOUT keywords

---
*Pitfalls research for: Twilio Communications (v1.15)*
*Researched: 2026-04-07*
