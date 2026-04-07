# Feature Landscape -- Twilio Communications (v1.15)

**Domain:** Political campaign field operations -- browser calling, two-way SMS, phone validation, opt-out management, number provisioning, spend controls
**Researched:** 2026-04-07
**Confidence:** MEDIUM (Twilio docs are authoritative; political compliance landscape verified via multiple sources)

---

## Voice (Click-to-Call via Twilio Voice SDK)

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Browser-to-PSTN calling via Voice JS SDK (WebRTC) | Replaces tel: links with in-app calling; callers stay in the UI, see voter context while talking | High | Org Twilio credentials, TwiML app, backend token endpoint |
| Access token generation endpoint | Voice SDK requires short-lived JWT access tokens from your server; cannot use Account SID directly | Medium | Twilio helper library, org credential store |
| Call status events (ringing, answered, completed) | Callers need visual feedback; supervisors need to know call outcomes | Medium | StatusCallback webhook endpoint, Call model |
| Graceful tel: fallback on mobile | Mobile field volunteers already use tap-to-call; do not break existing flow when Twilio is not configured | Low | Existing PhoneNumberList component |
| Call duration and disposition capture | Every call must produce a VoterInteraction record with duration, outcome, and timestamp | Medium | Existing VoterInteraction model, StatusCallback webhook |
| DNC check before dialing | Must block calls to numbers on the campaign DNC list; existing behavior must carry forward | Low | Existing DNCService |
| Mute/unmute during call | Standard calling UX; Voice SDK exposes `call.mute()` natively | Low | Voice JS SDK |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Inline call controls with voter context card | Caller sees voter name, address, prior interactions, survey script while on the call -- no tab switching | Medium | Existing phone banking UI, Voice SDK event binding |
| Call timer with live duration display | Visual urgency indicator; helps callers stay on pace during phone bank sessions | Low | Voice SDK `accept` event timestamp |
| Supervisor live session dashboard with call counts | Managers see how many callers are active, calls completed, avg duration in real time | Medium | Call metadata model, polling or SSE |
| Warm transfer between callers | Allow a caller to transfer a voter to a supervisor or specialist without hanging up | High | TwiML `<Dial>` with `<Conference>`, complex state management |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Predictive/auto-dialer | TCPA violation risk ($500-$1500 per call penalty); explicitly out of scope in PROJECT.md | Manual click-to-call only; human initiates every call |
| Call recording (audio capture) | Storage liability, consent laws vary by state (11 states require two-party consent), PII risk | Log metadata only (duration, outcome, timestamp); no audio storage |
| Voicemail drop (ringless voicemail) | FCC considers this a "call" under TCPA; requires prior express consent for cell phones | Skip to next voter on no-answer; log as "no_answer" outcome |
| Power dialer (auto-advance to next number) | Blurs line with auto-dialer; TCPA risk; FCC enforcement is aggressive | Caller manually clicks "Next" after recording outcome |

### Notes

- Voice SDK requires a TwiML Application SID. The backend generates an access token scoped to the TwiML app, which routes outbound calls through a `/voice/outbound` webhook that returns TwiML `<Dial><Number>`.
- Token lifetime should be short (1 hour max). Refresh before expiry using SDK's `tokenWillExpire` event.
- Voice SDK supports Chrome, Firefox, Safari, Edge. No polyfill needed.
- Existing `CallListEntry.claim()` pattern (SELECT FOR UPDATE SKIP LOCKED) works perfectly with browser calling -- claim, dial, record outcome, release.
- The SDK emits `disconnect`, `error`, `cancel` events that map directly to call outcome recording.

---

## SMS (Two-Way Messaging)

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Send individual SMS to a voter from their contact page | Basic outreach capability; must check DNC and opt-out before sending | Medium | Twilio Messaging API, org credentials, DNC + opt-out check |
| Bulk SMS to a voter list/segment | Campaign-wide outreach (GOTV reminders, event invites); core value of SMS integration | High | Messaging Service (number pool), A2P 10DLC registration, rate limiting |
| Two-way conversational reply inbox | Inbound replies must be visible to staff; P2P texting is the political standard | High | Inbound webhook, message threading model, inbox UI |
| Message templates with merge fields | "Hi {{first_name}}, early voting starts {{date}}" -- standard for any outreach tool | Medium | Template model, variable substitution engine |
| Delivery status tracking (sent, delivered, failed, undelivered) | Staff must know if messages reached voters; required for follow-up decisions | Medium | StatusCallback webhook, message status model |
| Opt-out instructions in first message | TCPA/carrier requirement: "Reply STOP to unsubscribe" must appear in initial contact | Low | Template validation, message composition UI |
| Sticky sender (consistent From number per voter) | Voters should see the same number each time; Twilio Messaging Service handles this automatically | Low | Messaging Service configuration |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Conversation threading with voter context | Reply inbox shows full thread alongside voter record, prior interactions, tags | Medium | Message model with voter FK, inbox UI |
| Canned response library | Volunteers pick from approved responses; reduces training time and message quality variance | Low | Response template CRUD |
| Assignment routing (route replies to original sender) | The volunteer who texted a voter gets their replies, not a random inbox reader | Medium | Sender-to-conversation mapping |
| Scheduled send (send at optimal time) | Avoid texting at 6 AM; schedule for afternoon delivery | Medium | Procrastinate job queue, scheduled_at field |
| MMS support (image attachments) | Send event flyers, voting location maps | Low | Twilio MMS API (same endpoint, add MediaUrl) |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Fully automated A2P blast without human initiation | FCC/carrier rules for political messaging favor P2P (human-initiated); pure A2P triggers stricter filtering and 10DLC throughput caps | Require a human to initiate each send batch; UI should make this a deliberate action, not a cron job |
| AI-generated reply suggestions | Out of scope per PROJECT.md ("AI-generated campaign content -- client-side concern"); also risks off-message volunteer responses | Canned responses curated by campaign managers |
| SMS to voters without any contact consent record | TCPA requires prior express consent for texts to cell phones; political exemption only covers manual live calls to landlines | Require consent flag or existing relationship indicator before enabling SMS sends |
| Unlimited send rate without throttling | Carrier filtering and Twilio 10DLC throughput limits (1-200 msg/sec depending on trust score) will reject messages; looks like spam | Platform-enforced rate limits matching 10DLC tier; queue excess messages |

### Notes

- **A2P 10DLC registration is mandatory** for sending SMS over local numbers. Political campaigns must register through Campaign Verify ($95/election cycle) plus Twilio brand registration. This is a multi-week process (3-5 weeks for full approval). The platform should guide orgs through this or handle it as an ISV.
- Twilio Messaging Services provide number pooling, sticky sender, and automatic scaling. Each org should have its own Messaging Service SID.
- **Toll-free numbers** are an alternative to 10DLC with faster provisioning (5-14 days) but lack local area code presence. Good for orgs that want to start sending before 10DLC clears.
- P2P texting (human-initiated, one-at-a-time) has more favorable TCPA treatment than bulk A2P. The UI should enforce a "click to send" pattern for each batch rather than fire-and-forget.
- Existing `VoterInteraction` model should log SMS contacts alongside call contacts for unified interaction history.

---

## Number Validation (Twilio Lookup API v2)

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| E.164 format validation on phone create/edit | Catch typos and invalid numbers before they enter the system; Lookup v2 basic validation is free | Low | Twilio Lookup v2 API, VoterPhone create/update hooks |
| Line type detection (mobile, landline, VoIP) | Determines SMS eligibility (landlines cannot receive SMS); informs calling strategy | Low | Lookup v2 Line Type Intelligence ($0.01/lookup) |
| Store line type on VoterPhone record | Avoid re-looking up the same number repeatedly; use cached type for DNC/SMS filtering | Low | New `line_type` column on `voter_phones` |
| Batch validation on import | Validate phone numbers during CSV import; flag invalid numbers in error report | Medium | Import pipeline integration, bulk Lookup calls, rate limiting |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Automatic SMS eligibility badge on voter contact cards | Visual indicator: green phone icon = can text, gray = landline/VoIP only | Low | Line type data, UI badge component |
| Call list generation filtering by line type | Generate call lists that separate mobile (can text + call) from landline (call only) | Low | Existing call list generation query + line_type filter |
| Stale validation refresh (re-validate after N months) | Numbers get ported; a landline can become a cell. Periodic refresh keeps data accurate | Medium | Background job, validation_checked_at timestamp |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Caller name (CNAM) lookup | $0.01/lookup adds up fast on large voter files (50K voters = $500); data is often inaccurate for cell phones; voter files already have names | Skip CNAM; use voter record name |
| Real-time validation on every API call | Adds latency to contact endpoints; wasteful for numbers already validated | Validate on create/edit only; cache result; refresh on schedule |
| Blocking import on validation failure | A bad phone number should not prevent a voter record from being imported | Import the record; flag the phone as unvalidated; validate async |

### Notes

- Lookup v2 basic validation (format check, valid=true/false) is **free**. Line Type Intelligence costs $0.01/lookup. Budget impact: 50K voter phones = $500 for initial line type enrichment.
- The existing `VoterPhone.type` field stores "home/work/cell" from import data. Lookup line type is more authoritative (12 types: mobile, landline, fixedVoip, nonFixedVoip, etc.). Store as a separate `line_type` field, not overwrite `type`.
- Validation should be async (Procrastinate job) for bulk operations. Synchronous for single phone create/edit in the UI.
- Invalid numbers from Lookup return HTTP 200 with `valid: false` and error codes like `TOO_SHORT`, `TOO_LONG`, `INVALID_NUMBER`. Surface these to the user.

---

## Opt-Out Management

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Automatic STOP keyword processing | Twilio handles STOP/UNSUBSCRIBE/END/QUIT/CANCEL/REVOKE/OPTOUT/STOPALL at the platform level; inbound webhook must sync this to DNC list | Medium | Inbound SMS webhook, DNC model integration |
| DNC entry with "sms_opt_out" reason | Existing DNC model supports reason enum; add new reason for SMS opt-outs distinct from call refusals | Low | Existing DNCReason enum extension |
| Opt-out confirmation message | Twilio auto-sends "You have been unsubscribed" but platform should also log the confirmation | Low | Twilio Advanced Opt-Out configuration |
| Cross-channel opt-out awareness | If a voter STOPs SMS, they should NOT be auto-added to call DNC (they may still accept calls); but SMS sends must be blocked | Medium | Separate SMS opt-out tracking from call DNC, or add channel field to DNC |
| Opt-in / re-subscribe via START keyword | Twilio handles START/YES/UNSTOP; webhook must remove the SMS opt-out from DNC | Medium | Inbound webhook, DNC removal logic |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Self-service web opt-out page | Link in SMS: "Or visit {{url}} to manage preferences" -- provides a web-based unsubscribe for voters who do not want to text STOP | Medium | Public-facing opt-out route (no auth), voter token/hash for identification |
| Opt-out dashboard for campaign managers | See opt-out rates, reasons, trends; identify if messaging is causing high opt-out | Low | Aggregate queries on DNC entries |
| Channel-specific consent tracking | Track consent status per channel (SMS, voice) per voter; not just "on DNC list" | Medium | New consent model or channel field on DNC |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Overriding Twilio's STOP processing | Twilio enforces STOP at the carrier/platform level; attempting to bypass = account suspension | Let Twilio handle keyword processing; sync state via webhook |
| Requiring opt-in confirmation before honoring STOP | TCPA requires immediate honoring of opt-out; cannot gate it behind "Are you sure?" | One final confirmation message only (Twilio sends this automatically) |
| Delaying opt-out processing | Must be honored immediately; cannot batch-process opt-outs on a schedule | Webhook processes synchronously; DNC entry created in same request |

### Notes

- Twilio's Advanced Opt-Out feature can be configured per Messaging Service to customize the STOP reply message and automatically block further sends. This reduces the amount of webhook logic needed.
- The existing DNC model needs a `channel` field or a parallel `sms_opt_out` table. Current DNC is phone-number-scoped, which conflates call and SMS opt-outs. A voter who STOPs texts may still accept calls.
- The self-service web opt-out page must be public (no ZITADEL auth) but protected against enumeration. Use a signed token (HMAC of voter_id + campaign_id + expiry) in the URL.
- TCPA allows one final confirmation message after STOP. Twilio handles this automatically.
- New opt-out keywords as of April 2025: REVOKE and OPTOUT added to the standard list.

---

## Phone Number Provisioning

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| BYO (Bring Your Own) number configuration | Orgs with existing Twilio numbers enter their number in org settings; platform uses it for sending | Low | Org Twilio config model, number validation |
| Available number search by area code | Orgs want local presence; search Twilio AvailablePhoneNumbers API by area code | Low | Twilio REST API, search UI in org settings |
| Purchase number via API | One-click buy from search results; provisions into the org's Twilio account | Medium | Twilio IncomingPhoneNumbers API, org billing awareness |
| Associate number with Messaging Service | Purchased numbers must be added to the org's Messaging Service sender pool for SMS | Low | Twilio Messaging Service API |
| Number inventory display in org settings | Show all numbers owned, their capabilities (voice, SMS, MMS), and assignment status | Low | Twilio IncomingPhoneNumbers list API |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Guided 10DLC / toll-free registration wizard | Walk the org through brand registration, campaign use case registration, and verification; most competitors punt this to Twilio console | High | Twilio Regulatory API, multi-step wizard UI, status polling |
| Number capability badges (voice, SMS, MMS) | Visual clarity on what each number can do; prevents confusion when a voice-only number cannot send texts | Low | Twilio number capabilities metadata |
| Campaign-to-number assignment | Assign specific numbers to specific campaigns (e.g., local area code per campaign geography) | Medium | Number-campaign mapping model |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Short code provisioning | $1000+/month, 8-12 week approval, overkill for campaign use cases | 10DLC local numbers or toll-free |
| Automatic number purchasing without confirmation | Incurs real costs ($1-2/month per number); must be a deliberate org admin action | Require explicit confirmation dialog with cost display |
| Platform-owned shared number pool | Multi-tenant shared numbers get flagged as spam by carriers; each org needs their own numbers | Org-scoped numbers only; never share numbers across orgs |

### Notes

- Twilio phone numbers cost $1.15/month (local) or $2.15/month (toll-free) as of 2025. Purchasing is instant via API.
- 10DLC registration is per-brand (org) and per-campaign use case. The platform as an ISV needs its own registration, then registers each customer org as a brand. This is a one-time setup cost ($4 brand registration + $15 campaign use case) but requires manual review.
- Toll-free verification takes 5-14 days but is simpler than 10DLC. Good "quick start" option.
- Numbers should be provisioned into the customer's own Twilio subaccount (if using subaccounts) or the platform's master account with org-scoped metadata.

---

## Spend Controls

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Daily and monthly spend display per org | Orgs must see their current Twilio usage; prevents bill shock | Medium | Twilio Usage Records API, org settings dashboard |
| Platform-enforced soft limits (daily cap, total budget) | Platform pauses sends when org hits budget; prevents runaway costs from volunteer mistakes | Medium | Pre-send budget check, org budget config, usage tracking |
| Low-balance and limit-approaching alerts | Email/in-app notification when 80% of daily or monthly budget consumed | Medium | Twilio Usage Triggers API or platform-side tracking + notification |
| Per-campaign spend attribution | Multi-campaign orgs need to see which campaign is driving costs | Medium | Tag Twilio API calls with campaign metadata, aggregate by campaign |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Cost estimate before bulk SMS send | "This will send 2,340 messages at ~$0.0079/msg = ~$18.49. Proceed?" | Low | Message count x rate calculation |
| Spend trend charts in org dashboard | Weekly/monthly spend visualization; helps orgs budget for election cycles | Medium | Usage history aggregation, Recharts chart |
| Per-volunteer cost attribution | See which volunteers are driving the most call/SMS costs; identify training needs | Medium | Call/SMS metadata joined to volunteer records |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Hard account suspension on limit hit | Stops all communications including critical operational messages; too disruptive | Soft limit: block new bulk sends but allow individual sends with warning; notify org admin |
| Platform markup on Twilio costs | Orgs use their own Twilio credentials; platform should not skim per-message fees | Transparent pass-through; platform charges subscription, not per-message |
| Twilio account balance management | Managing real money (auto-recharge, payment methods) is Twilio's responsibility | Link to Twilio billing dashboard; surface balance read-only |

### Notes

- Twilio Usage Triggers fire webhooks when thresholds are crossed. The platform should create triggers for each org's daily and monthly limits. Up to 1,000 triggers per account.
- Usage Triggers support `count`, `usage`, and `price` fields. Use `price` for spend limits.
- Usage Records API provides historical usage data. Poll daily for dashboard data; do not poll per-request.
- Platform-side tracking (counting messages/calls in our DB) is more responsive than waiting for Twilio Usage Triggers (evaluated ~once per minute). Use both: platform-side for pre-send gating, Twilio triggers as a backup safety net.
- Twilio pricing (US, 2025): SMS outbound $0.0079/msg, inbound $0.0075/msg. Voice outbound $0.014/min, inbound $0.0085/min. Lookup line type $0.01/query.

---

## Call & Message Metadata Logging

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Call metadata record (duration, status, from, to, timestamps) | Every call must be logged for accountability and analytics; feeds into VoterInteraction history | Medium | StatusCallback webhook, new CallRecord model |
| SMS metadata record (direction, status, from, to, body length, timestamps) | Every message must be logged; delivery receipts update status | Medium | StatusCallback webhook, new MessageRecord model |
| Link call/message records to voter and campaign | Must be queryable: "show all calls to this voter" or "show all messages in this campaign" | Medium | FK to voter, campaign_id for RLS |
| Delivery/answer rate aggregation per campaign | Campaign managers need: "What % of calls were answered? What % of texts delivered?" | Medium | Aggregate queries on metadata tables |
| Failed delivery logging with reason | Carrier rejections, invalid numbers, opt-out blocks must be visible so staff can fix data | Low | Twilio error codes mapped to human-readable reasons |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Per-voter communication timeline | Unified chronological view: calls, texts, door knocks, all in one stream per voter | Medium | Existing VoterInteraction model + new call/message records |
| Response rate analytics (SMS reply rate, call answer rate by time of day) | Helps campaigns optimize when to call/text; data-driven outreach scheduling | Medium | Time-bucketed aggregation queries |
| Cost-per-contact and cost-per-response metrics | "It costs $0.23 per answered call and $0.05 per SMS conversation" -- helps budget allocation | Medium | Join spend data to contact/response counts |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Storing SMS message body content | PII liability; storage costs; messages may contain voter-disclosed information | Store body length and whether it was inbound/outbound; reference Twilio SID for body retrieval if needed |
| Storing call audio recordings | Two-party consent laws in 11 states; massive storage; PII risk; explicitly avoided in Voice section | Log duration, outcome, timestamps only |
| Real-time analytics (sub-second refresh) | SSE/WebSocket infrastructure is out of scope per PROJECT.md; polling is sufficient | 30-second polling for live dashboards; Procrastinate job for hourly aggregates |

### Notes

- Twilio provides a Call SID and Message SID for every interaction. Store these as the canonical reference. If an org needs the actual content, they can look it up in their Twilio console.
- StatusCallback webhooks fire for each status transition (queued -> sending -> sent -> delivered/failed for SMS; initiated -> ringing -> answered -> completed for calls). Log each transition or just the final status.
- RLS must apply to call/message records. They contain voter phone numbers (PII) and must be campaign-scoped.
- The existing `VoterInteraction` model can be extended with a `twilio_sid` field to link to the detailed call/message record, or a separate `CommunicationLog` table can hold Twilio-specific metadata while VoterInteraction remains the unified interaction stream.

---

## Feature Dependencies

```
Org Twilio Credentials (config) --> everything else depends on this
  |
  +-- Phone Number Provisioning --> Voice + SMS (need a From number)
  |
  +-- Voice (Click-to-Call)
  |     +-- depends on: existing PhoneBankSession, CallList, DNC
  |     +-- produces: CallRecord --> VoterInteraction
  |
  +-- SMS (Two-Way)
  |     +-- depends on: A2P 10DLC registration (long lead time!)
  |     +-- depends on: Messaging Service setup
  |     +-- depends on: Opt-Out Management
  |     +-- produces: MessageRecord --> VoterInteraction
  |
  +-- Number Validation (Lookup API)
  |     +-- depends on: VoterPhone model (add line_type column)
  |     +-- enhances: Call list generation (filter by line type)
  |     +-- enhances: SMS eligibility (skip landlines)
  |
  +-- Opt-Out Management
  |     +-- depends on: existing DNC model (extend with channel)
  |     +-- depends on: SMS inbound webhook
  |     +-- blocks: SMS sends (must check before every send)
  |
  +-- Spend Controls
  |     +-- depends on: Call + Message metadata (for platform-side tracking)
  |     +-- depends on: Twilio Usage API (for account-level data)
  |
  +-- Metadata Logging
        +-- depends on: StatusCallback webhooks from Voice + SMS
        +-- feeds: Spend Controls, Dashboards, VoterInteraction history
```

## MVP Recommendation

**Prioritize (Phase 1-2):**
1. Org Twilio credential storage -- everything depends on this
2. Phone number provisioning (BYO + search/purchase) -- need a From number
3. Voice click-to-call in phone banking -- highest immediate value; replaces tel: links with in-app calling
4. Call metadata logging -- accountability; feeds existing dashboards
5. Number validation (Lookup API) -- enriches existing voter phones; cheap; low complexity

**Defer to Phase 3-4:**
6. Two-way SMS with reply inbox -- high complexity; requires 10DLC registration (3-5 week lead time); start registration early but build later
7. Opt-out management (STOP + web) -- needed before SMS goes live but not before voice
8. Spend controls -- needed before SMS bulk sends but voice spend is lower risk
9. Bulk SMS to segments -- highest complexity; last to ship

**Critical lead-time item:** A2P 10DLC brand registration should be initiated in Phase 1 even though SMS features ship later. The 3-5 week approval timeline is the longest dependency in the milestone.

## Sources

- [Twilio Voice JS SDK docs](https://www.twilio.com/docs/voice/sdks/javascript)
- [Twilio Browser Calls tutorial](https://www.twilio.com/docs/voice/tutorials/browser-calls)
- [Twilio Lookup v2 API](https://www.twilio.com/docs/lookup/v2-api)
- [Twilio Line Type Intelligence](https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence)
- [Twilio Messaging Services](https://www.twilio.com/docs/messaging/services)
- [Twilio Sticky Sender](https://www.twilio.com/docs/glossary/what-is-a-sticky-sender)
- [Twilio A2P 10DLC overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [Twilio Political ISV 10DLC guide](https://help.twilio.com/articles/9515675492251)
- [Twilio STOP keyword support](https://help.twilio.com/articles/223134027-Twilio-support-for-opt-out-keywords-SMS-STOP-filtering-)
- [FCC opt-out keyword update (April 2025)](https://www.twilio.com/en-us/blog/insights/best-practices/update-to-fcc-s-sms-opt-out-keywords)
- [Twilio Usage Triggers API](https://www.twilio.com/docs/usage/api/usage-trigger)
- [Twilio Call resource](https://www.twilio.com/docs/voice/api/call-resource)
- [Twilio StatusCallback events](https://www.twilio.com/docs/events/event-types/voice/status-callback)
- [FCC political campaign calling/texting rules](https://www.fcc.gov/rules-political-campaign-calls-and-texts)
- [TCPA political compliance guide](https://mslawgroup.com/tcpa-compliance-for-political-calls/)
- [2025 political texting compliance](https://politicalcomms.com/blog/2025-political-texting-compliance-fcc-tcpa/)
- [Best P2P texting platforms 2026](https://goodparty.org/blog/article/best-p2p-texting-platforms)
- [CallHub P2P texting guide](https://callhub.io/blog/text-messaging/peer-to-peer-texting/)
