# Phase 89: Phone Number Inventory & Provisioning - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds org-scoped phone number inventory: a durable `org_phone_numbers` table where org admins can register their existing Twilio phone numbers, inspect voice/SMS capability, and designate default numbers for voice and SMS flows. Later phases (webhooks, voice, SMS) consume this table as their source of routing truth.

The phase stops at inventory and defaults management. Provisioning new numbers via the Twilio API (search/purchase) is explicitly out of scope.

</domain>

<decisions>
## Implementation Decisions

### Number Storage Model
- Separate `org_phone_numbers` table (many-to-one from org) rather than adding columns to `organizations`.
- Each row stores: phone_number, friendly_name, phone_type (local/toll-free/mobile), voice_capable, sms_capable, mms_capable, twilio_sid, capabilities_synced_at, created_at.
- The org row holds two FK references: `default_voice_number_id` and `default_sms_number_id` → `org_phone_numbers.id` to make default lookups trivially fast.

### Capability Sourcing
- Store capabilities at registration time by fetching from Twilio API.
- Expose a sync/refresh endpoint org admins can call on demand to re-fetch from Twilio.
- No background polling — sync is explicit and admin-initiated.

### Number Registration Scope
- BYO-only: admins register numbers that already exist in their Twilio account.
- Platform does a Twilio API lookup at registration to validate the number exists and fetch its capabilities.
- Provisioning new numbers via Twilio API (search/purchase) is v2 scope.

### Default Number Management
- Two FK columns on the `Organization` model: `default_voice_number_id` and `default_sms_number_id`.
- PATCH `/api/v1/org/numbers/{id}/set-default` with a `capability` field (`voice` | `sms`) sets the correct FK and clears the old one atomically.
- DB: nullable FKs with SET NULL on delete so removing a number safely clears defaults.

### Capability Fields (Richer Model)
- Boolean flags: `voice_capable`, `sms_capable`, `mms_capable`.
- `phone_type` string: `local`, `toll_free`, `mobile`, `unknown`.
- `twilio_sid` (IncomingPhoneNumber SID) for API identity.
- `friendly_name` from Twilio for display.
- `capabilities_synced_at` timestamp for staleness display.

### API Surface
- All endpoints under `/api/v1/org/numbers` (org-scoped, no campaign context).
- `GET /api/v1/org/numbers` — list org phone numbers.
- `POST /api/v1/org/numbers` — register a BYO number (validates via Twilio API).
- `DELETE /api/v1/org/numbers/{id}` — remove a number (clears defaults if applicable).
- `POST /api/v1/org/numbers/{id}/sync` — re-fetch capabilities from Twilio.
- `PATCH /api/v1/org/numbers/{id}/set-default` — set voice or SMS default.
- Role gates: read = org_admin; write/delete = org_owner.

### Frontend Surface
- Extend `/org/settings` with a new "Phone Numbers" card below the existing Twilio credentials card.
- Show the registered number list with capability badges (Voice, SMS, MMS), default tags, and last-synced time.
- Add number form: phone number input + register button (validates format client-side, full validation server-side via Twilio).
- Set-default and remove actions inline per row.
- Reuse existing `useOrg` hook pattern; add `useOrgNumbers` hook.

### The Agent's Discretion
- Specific Twilio API call shape for IncomingPhoneNumber lookup (`PhoneNumbers.get()` vs `IncomingPhoneNumbers.list()`) is at the agent's discretion.
- Exact migration numbering (030_xxx) and column ordering are at the agent's discretion.
- UI layout details within the settings card are at the agent's discretion provided they follow the existing settings card pattern.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/twilio_config.py` — TwilioConfigService owns Fernet encryption and org credential access; Phase 89 can extend it with a `get_twilio_client(org)` method that returns an authenticated `twilio.rest.Client`.
- `app/api/v1/org.py` — existing `/api/v1/org` router; Phase 89 adds a `numbers` sub-router mounted on it.
- `app/models/organization.py` — Organization model; Phase 89 adds two nullable FK columns for defaults.
- `app/schemas/org.py` — OrgResponse already includes `TwilioOrgStatus`; Phase 89 adds OrgPhoneNumber schemas.
- `web/src/hooks/useOrg.ts` — existing pattern for org queries and mutations; replicate for `useOrgNumbers`.
- `web/src/routes/org/settings.tsx` — existing settings page with Twilio credentials card; Phase 89 adds the Phone Numbers card below it.

### Established Patterns
- Org-scoped APIs: no campaign_id in path, filter by `user.org_id` via zitadel_org_id join.
- Role gating: `require_org_role("org_admin")` for reads, `require_org_role("org_owner")` for writes.
- Rate limiting: `@limiter.limit("240/minute", ...)` on GETs, `120/minute` on mutations.
- TanStack Query hooks: `useQuery` for lists, `useMutation` + `queryClient.invalidateQueries` for mutations.
- Forms: react-hook-form + zod + zodResolver.

### Integration Points
- `TwilioConfigService.get_twilio_client(org)` — new method that decrypts auth token and returns a Twilio REST client; consumed by the Phase 89 number registration and sync handlers.
- Migration `030_*` — adds `org_phone_numbers` table and two FK columns on `organizations`.
- Router mount: add `numbers` APIRouter to `org.py` and mount at `/api/v1/org/numbers` in the main router setup.
- Settings page: import the new `PhoneNumbersCard` component into `settings.tsx`.

</code_context>

<specifics>
## Specific Ideas

- Numbers card should show a clear empty state when no numbers are registered yet, prompting the admin to add their first number.
- The capability badges (Voice, SMS, MMS) should be visually distinct — green for enabled, muted for not supported.
- Default tags ("Default Voice", "Default SMS") should appear inline with the number row.
- When a number is deleted that was a default, the UI should reflect the cleared default immediately after invalidation.
- Capabilities synced-at timestamp should show relative time (e.g., "synced 3 days ago") with a Refresh button.

</specifics>

<deferred>
## Deferred Ideas

- Twilio API number search and purchase (provisioning new numbers) — v2 or future phase.
- A2P 10DLC campaign registration tracking per number — out of scope for this milestone.
- Number-level webhook URL display — Phase 90 responsibility.
- Background capability sync schedule — not needed for this phase; on-demand only.

</deferred>
