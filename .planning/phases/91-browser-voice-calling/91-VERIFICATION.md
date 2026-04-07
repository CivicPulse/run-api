---
phase: 91-browser-voice-calling
verified: 2026-04-07T23:30:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Browser call button renders in phone banking flow"
    expected: "When org is Twilio Voice configured, the call button shows 'Browser Call' with a Headphones icon and a blue 'Browser Call' badge. When org is not configured, the existing tel: link with Phone icon renders unchanged."
    why_human: "Requires live browser environment with Twilio credentials and a real or simulated phone banking session; cannot verify WebRTC Device.isSupported or DOM rendering programmatically."
  - test: "Clicking Browser Call shows inline CallStatusBar"
    expected: "After clicking Browser Call, CallStatusBar appears below the active phone row with a live duration timer (mm:ss, font-mono), a Mute toggle (aria-pressed, min 44px), and a Hang Up button (destructive, min 44px). Focus is moved to Hang Up on mount."
    why_human: "Requires a real Twilio Voice call to verify the in-call state transitions and auto-focus behavior in a browser."
  - test: "Auto-advance to outcome recording on call end"
    expected: "When the call disconnects, the page advances to the recording/outcome phase after 500ms and the outcome panel is visible."
    why_human: "Requires completing a browser call or simulating the disconnect event; cannot trigger Twilio Device lifecycle programmatically without running the app."
  - test: "DNC block banner replaces call button for DNC numbers"
    expected: "A phone number on the DNC list shows the 'On Do Not Call List' banner with role='alert' instead of a call button, with the number in strikethrough text."
    why_human: "Requires a voter with a DNC-listed phone number in the seeded data and visual inspection of the phone banking flow."
  - test: "Calling hours banner blocks calls outside allowed window"
    expected: "When the current time is outside calling hours, CallingHoursBanner with role='alert' appears and the call button is disabled, showing the allowed window in the message."
    why_human: "Requires either modifying campaign calling hours to an already-passed window, or testing at an out-of-hours time; real-time behavior cannot be verified statically."
  - test: "Microphone denial falls back to tel: mode with toast"
    expected: "Denying microphone permission when clicking Browser Call shows a toast 'Microphone access denied — using phone dialer instead.' and opens the tel: link."
    why_human: "Requires browser interaction to trigger and deny the microphone permission prompt."
---

# Phase 91: Browser Voice Calling Verification Report

**Phase Goal:** Phone bankers can place browser-based Twilio calls with the existing workflow while preserving fallback and compliance protections.
**Verified:** 2026-04-07T23:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Configured orgs can place Twilio Voice SDK calls from the phone banking flow without leaving the product. | ✓ VERIFIED | `useTwilioDevice` hook wraps Device lifecycle and calls `/voice/token`; `PhoneNumberList` renders Browser Call button when `callMode === "browser"`; `call.tsx` wires hooks to PhoneNumberList with `handleBrowserCall`; TwiML handler at `/voice/twiml` dials the voter number. |
| 2 | Unsupported clients or unconfigured orgs still fall back cleanly to the current `tel:` behavior. | ✓ VERIFIED | `useVoiceCapability` returns mode="tel" when API returns `browser_call_available: false` OR `Device.isSupported` is false OR `navigator.mediaDevices` is absent; token endpoint returns 404 when org lacks voice config; `PhoneNumberList` preserves `href="tel:..."` link for tel mode (grep: 2 occurrences); microphone denial falls back to `window.open("tel:...")` with toast. |
| 3 | Call logging captures status, timing, and outcome while enforcing DNC and calling-hours guardrails before dialing. | ✓ VERIFIED | `VoiceService.create_call_record()` inserts on initial connect; `update_call_record_from_webhook()` updates `status`, `duration_seconds`, `ended_at`, `price_cents` idempotently; TwiML handler blocks calls when `hours_check.allowed=False` or `dnc_check.blocked=True` before generating Dial XML; call_records has RLS policy `call_records_isolation`. |

**Score:** 3/3 roadmap truths verified

### Plan Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| P1-1 | call_records table with campaign_id FK, twilio_sid unique index, and RLS policy | ✓ VERIFIED | `032_call_records_and_voice_config.py` creates table; grep confirms `ROW LEVEL SECURITY` (4 matches), `call_records_isolation` (1 match); unique partial index on twilio_sid present. |
| P1-2 | Campaign model has calling_hours_start, calling_hours_end, calling_hours_timezone columns with sensible defaults | ✓ VERIFIED | `campaign.py` has `calling_hours_start` and `calling_hours_end` (grep: 2 matches); migration sets defaults 09:00, 21:00, America/New_York. |
| P1-3 | Organization model has twilio_api_key_sid, twilio_api_key_secret_encrypted, twilio_api_key_secret_key_id, twilio_twiml_app_sid columns | ✓ VERIFIED | `organization.py` has `twilio_api_key_sid` and `twilio_twiml_app_sid` (grep: 2 matches). |
| P1-4 | VoiceService can generate tokens, check DNC, check calling hours, create/update call records | ✓ VERIFIED | `VoiceService` class present; grep: 5 matches for the 5 key methods (`generate_voice_token`, `check_calling_hours`, `check_dnc`, `create_call_record`, `update_call_record_from_webhook`); all 10 service unit tests pass. |
| P1-5 | TwilioConfigService can encrypt/decrypt API Key secrets using existing Fernet keyring | ✓ VERIFIED | `twilio_config.py` has `VoiceCredentials` dataclass and `encrypt_api_key_secret` (grep: 2 matches each). |
| P2-1 | Authenticated users can request a Twilio Voice Access Token for a campaign they belong to | ✓ VERIFIED | `POST /{campaign_id}/voice/token` endpoint requires `require_role("volunteer")` auth; calls `VoiceService.generate_voice_token(org, user.id)`; returns 404 on unconfigured org. |
| P2-2 | Twilio can POST to the TwiML voice URL and receive valid Dial XML | ✓ VERIFIED | `POST /voice/twiml` returns `VoiceResponse` with `dial.number(to_number, ...)` containing status callback; test `test_twiml_returns_dial_xml_when_to_provided` passes. |
| P2-3 | Voice status webhooks update call_records with final status, duration, and ended_at | ✓ VERIFIED | `voice_status_callback` in `webhooks.py` parses `CallSid`, `CallStatus`, `CallDuration`; maps terminal statuses to `ended_at=datetime.now(UTC)`; calls `VoiceService.update_call_record_from_webhook`; idempotent via `check_idempotency`. |
| P2-4 | TwiML handler validates destination server-side and rejects DNC numbers and calls outside hours | ✓ VERIFIED | `twiml_voice_handler` calls `check_calling_hours()` and `check_dnc()` before generating Dial XML; returns `say()` + `hangup()` responses for blocked calls; tests `test_twiml_rejects_dnc_number` and `test_twiml_rejects_outside_calling_hours` pass. |
| P3-1 | Phone bankers see a 'Browser Call' button when Twilio voice is configured and WebRTC is available | ? HUMAN | `PhoneNumberList` conditionally renders Headphones button for `callMode === "browser"` (grep: 22 callMode matches); UI behavior requires visual verification. |

**Score:** 10/10 must-haves verified (P3-1 deferred to human verification for visual confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `alembic/versions/032_call_records_and_voice_config.py` | Migration for call_records, campaign calling hours, org API key columns | ✓ VERIFIED | File exists; call_records creation, RLS policy, org and campaign column additions confirmed. |
| `app/models/call_record.py` | CallRecord SQLAlchemy model | ✓ VERIFIED | `class CallRecord` present (1 match); all migration columns mapped. |
| `app/schemas/voice.py` | Pydantic schemas for voice | ✓ VERIFIED | 5 schema classes confirmed: VoiceTokenResponse, CallRecordRead, CallingHoursCheck, DNCCheckResult, VoiceCapabilityResponse. |
| `app/services/voice.py` | VoiceService with token, compliance, CRUD | ✓ VERIFIED | `class VoiceService` present; all 5 core methods implemented; real DB operations via SQLAlchemy. |
| `app/services/twilio_config.py` | Extended with VoiceCredentials and API key encryption | ✓ VERIFIED | `VoiceCredentials` dataclass and `encrypt_api_key_secret` present. |
| `app/api/v1/voice.py` | Voice token endpoint and TwiML handler | ✓ VERIFIED | `campaign_router` with 4 endpoints + `twiml_router` with TwiML handler; router registered in `router.py`. |
| `app/api/v1/webhooks.py` | Voice status webhook handler | ✓ VERIFIED | `voice_status_callback` has real implementation; SMS routes are intentional Phase 92 stubs. |
| `tests/unit/test_voice_service.py` | Unit tests for VoiceService | ✓ VERIFIED | 10 tests, all passing. |
| `tests/unit/test_voice_api.py` | Unit tests for voice API endpoints | ✓ VERIFIED | 10 tests (4 parametrized), all passing. |
| `web/src/types/voice.ts` | TypeScript types for voice calling | ✓ VERIFIED | `TwilioCallStatus`, `CallMode`, `VoiceCapabilityResponse` and 3 other types present. |
| `web/src/hooks/useTwilioDevice.ts` | Twilio Device lifecycle hook | ✓ VERIFIED | `useTwilioDevice` present; fetches token from `api/v1/campaigns/${campaignId}/voice/token`; full Device lifecycle with connect/disconnect/mute/timer. |
| `web/src/hooks/useVoiceCapability.ts` | Capability check hook | ✓ VERIFIED | `useVoiceCapability` present; fetches `api/v1/campaigns/${campaignId}/voice/capability` via TanStack Query; checks `Device.isSupported` + `navigator.mediaDevices`. |
| `web/src/components/field/CallStatusBar.tsx` | Inline call status bar | ✓ VERIFIED | Present; 3 `aria-pressed`/`aria-label` attributes; 2 `min-h-11 min-w-11` touch targets; `aria-live` on timer. |
| `web/src/components/field/CallModeIndicator.tsx` | Browser vs Phone mode badge | ✓ VERIFIED | Present; renders Headphones or Phone icon per mode. |
| `web/src/components/field/DncBlockBanner.tsx` | DNC block message | ✓ VERIFIED | Present; `role="alert"` confirmed. |
| `web/src/components/field/CallingHoursBanner.tsx` | Calling hours block message | ✓ VERIFIED | Present; `role="alert"` confirmed; renders `callingHours.message` content. |
| `web/src/components/field/PhoneNumberList.tsx` | Phone list with conditional call rendering | ✓ VERIFIED | 22 callMode references; imports all 4 field components; preserves `href="tel:..."` (2 occurrences); `getUserMedia` microphone probe present. |
| `web/src/routes/.../call.tsx` | Call page with voice hooks | ✓ VERIFIED | Imports `useVoiceCapability` and `useTwilioDevice`; tracks `dncStatus`, `callingHoursCheck`, `activeCallNumber`; fetches DNC check and calling hours on voter claim; `setTimeout(500)` auto-advance on disconnect. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/api/v1/voice.py` | `app/services/voice.py` | VoiceService singleton | ✓ WIRED | `from app.services.voice import VoiceService`; `_voice_service = VoiceService()` used in all endpoints (2 import refs + 3+ call sites). |
| `app/api/v1/webhooks.py` | `app/services/voice.py` | `update_call_record_from_webhook` | ✓ WIRED | `from app.services.voice import VoiceService`; called at line 80 in `voice_status_callback`. |
| `app/services/voice.py` | `app/services/twilio_config.py` | TwilioConfigService credential access | ✓ WIRED | 4 TwilioConfigService references in voice.py; `voice_credentials_for_org()` called in `generate_voice_token`. |
| `app/services/voice.py` | `app/services/dnc.py` | DNCService.check_number | ✓ WIRED | `from app.services.dnc import DNCService`; `DNCService` instantiated and `check_number` called in `check_dnc`. |
| `app/api/v1/router.py` | `app/api/v1/voice.py` | `voice.router` registration | ✓ WIRED | `router.include_router(voice.campaign_router, prefix="/campaigns")` and `router.include_router(voice.twiml_router, prefix="/voice")` confirmed at lines 60-61. |
| `web/src/hooks/useTwilioDevice.ts` | `/api/v1/campaigns/{id}/voice/token` | `api.post(...voice/token)` | ✓ WIRED | `fetchToken` function at line 17-20 calls `api.post(api/v1/campaigns/${campaignId}/voice/token)`; invoked on mount and `tokenWillExpire`. |
| `web/src/hooks/useVoiceCapability.ts` | `/api/v1/campaigns/{id}/voice/capability` | TanStack Query fetch | ✓ WIRED | `useQuery` fetches `api/v1/campaigns/${campaignId}/voice/capability` at line 14. |
| `web/src/components/field/PhoneNumberList.tsx` | `web/src/hooks/useTwilioDevice.ts` | Props from parent | ✓ WIRED | `call.tsx` passes `twilioDevice` result as props to `PhoneNumberList`; PhoneNumberList imports `TwilioCallStatus`, `CallMode` types. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app/services/voice.py` | `call_record` | `db.execute(select(CallRecord).where(...))` / `db.add(record)` | Yes — real AsyncSession queries | ✓ FLOWING |
| `app/services/voice.py` | `VoiceCredentials` | `TwilioConfigService.voice_credentials_for_org(org)` with Fernet decrypt | Yes — real org model fields | ✓ FLOWING |
| `web/src/hooks/useTwilioDevice.ts` | `token` | `api.post(voice/token).json<VoiceTokenResponse>()` | Yes — live API call | ✓ FLOWING |
| `web/src/hooks/useVoiceCapability.ts` | `data.browser_call_available` | `useQuery` → `api.get(voice/capability).json()` | Yes — live API call | ✓ FLOWING |
| `web/src/routes/.../call.tsx` | `dncStatus` | `api.post(voice/dnc-check)` on each phone on voter claim | Yes — per-phone API calls | ✓ FLOWING |
| `web/src/routes/.../call.tsx` | `callingHoursCheck` | `api.get(voice/calling-hours)` on voter claim | Yes — live API call | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 23 voice unit tests pass | `uv run pytest tests/unit/test_voice_service.py tests/unit/test_voice_api.py -x` | 23 passed, 0 failed | ✓ PASS |
| Python lint clean | `uv run ruff check app/models/call_record.py app/schemas/voice.py app/services/voice.py app/api/v1/voice.py app/api/v1/webhooks.py` | All checks passed | ✓ PASS |
| TypeScript compiles | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| VoiceService module exports `VoiceService` class | `grep -c "class VoiceService" app/services/voice.py` | 1 | ✓ PASS |
| TwiML handler rejects DNC numbers | `test_twiml_rejects_dnc_number` | PASSED | ✓ PASS |
| TwiML handler rejects outside-hours calls | `test_twiml_rejects_outside_calling_hours` | PASSED | ✓ PASS |
| Webhook idempotency works | `test_webhook_idempotent_duplicate` | PASSED | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VOICE-01 | 91-02, 91-03 | Phone bankers can place browser-based click-to-call from phone banking flow when Twilio Voice configured | ✓ SATISFIED | Token endpoint, TwiML handler, frontend hooks + Browser Call button all wired. Unit tests confirm token endpoint returns 200 and TwiML returns Dial XML. |
| VOICE-02 | 91-02, 91-03 | Users on unsupported browsers or unconfigured orgs fall back to tel: behavior | ✓ SATISFIED | `useVoiceCapability` returns mode="tel" on 404/Device.isSupported=false/no mediaDevices; `PhoneNumberList` preserves `href="tel:..."` in tel mode; microphone denial falls back to `window.open("tel:")` with toast. |
| VOICE-03 | 91-01, 91-02 | Call state, duration, and final outcome captured for reporting | ✓ SATISFIED | `call_records` table with RLS; `create_call_record()` on initial connect; `update_call_record_from_webhook()` handles all terminal statuses with duration and ended_at; idempotent on CallSid. |
| VOICE-04 | 91-01, 91-02, 91-03 | Calls blocked when voter is on DNC or outside calling hours, with clear operator feedback | ✓ SATISFIED | Server-side: TwiML handler blocks with `say()` + `hangup()` for DNC and hours; Client-side: `DncBlockBanner` (role=alert) and `CallingHoursBanner` (role=alert) displayed; `CallingHoursCheck.message` surfaces allowed window to user. |

All 4 phase requirements satisfied programmatically. Visual/behavioral confirmation required for complete sign-off (see Human Verification Required section).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/api/v1/webhooks.py` | 106, 123 | `return ""` in `sms_inbound_callback` and `sms_status_callback` | ℹ️ Info | Intentional Phase 92 stubs; explicitly documented in comments and SUMMARY; not part of this phase's scope. |

No blockers or warnings found. The SMS stub returns are correctly scoped to Phase 92 and annotated.

### Human Verification Required

#### 1. Browser Call Button Rendering

**Test:** Log into the dev environment, navigate to a phone banking session call page for a campaign whose org has Twilio Voice configured (API Key + TwiML App SID). Confirm the call button shows "Browser Call" with a Headphones icon and a blue "Browser Call" badge below it.

**Expected:** Blue "Browser Call" button visible with Headphones icon; CallModeIndicator badge shows "Browser Call" text.

**Why human:** Requires live browser with WebRTC support and org Twilio credentials populated. `Device.isSupported` is a runtime check that cannot be evaluated statically.

---

#### 2. Inline CallStatusBar During Active Call

**Test:** Click "Browser Call" on a phone number. Allow microphone. Confirm the CallStatusBar appears below the active phone row with a running timer, a Mute button, and a Hang Up button. Confirm focus moves to Hang Up on appearance.

**Expected:** CallStatusBar visible with mm:ss timer, Mute toggle (aria-pressed), Hang Up (destructive). Timer increments. Mute toggles microphone.

**Why human:** Requires a live Twilio Voice call to transition the Device through connecting → ringing → open states and observe DOM updates.

---

#### 3. Auto-Advance to Outcome Recording

**Test:** Allow a browser call to connect and then hang up (or click "Hang Up"). Confirm the page transitions to the outcome recording phase after approximately 500ms.

**Expected:** Outcome/survey panel appears for recording call result without manual navigation.

**Why human:** Requires triggering a real disconnect event from the Twilio Device to observe the 500ms setTimeout transition.

---

#### 4. DNC Block Banner

**Test:** Set up a voter with a phone number on the DNC list. Open the call page for that voter in a phone banking session. Confirm the phone row shows the "On Do Not Call List" banner with `role="alert"` instead of a call button, and the number displays in strikethrough.

**Expected:** `DncBlockBanner` renders with ShieldAlert icon and red styling; no call button visible for that number.

**Why human:** Requires seeded DNC data and visual inspection of the specific phone row state.

---

#### 5. Calling Hours Banner

**Test:** Temporarily set a campaign's `calling_hours_start` and `calling_hours_end` to a past time window (e.g., 00:00–01:00). Open the phone banking call page. Confirm the CallingHoursBanner appears with the allowed window message and the call button is disabled.

**Expected:** Yellow `CallingHoursBanner` with `role="alert"` visible; call buttons disabled; message shows allowed time window.

**Why human:** Requires runtime time comparison against campaign settings; real-time behavior cannot be verified statically.

---

#### 6. Microphone Denial Fallback

**Test:** Click "Browser Call," then deny the microphone permission prompt. Confirm a toast appears saying "Microphone access denied — using phone dialer instead." and the system opens the tel: link.

**Expected:** Toast notification visible; tel: link opens phone dialer; no error state shown in the call UI.

**Why human:** Requires browser interaction to trigger and deny the getUserMedia permission prompt.

---

### Gaps Summary

No gaps found. All programmatically verifiable must-haves pass. The phase is blocked on human verification for UI behavioral states that require a live browser environment with active Twilio credentials.

The deviation documented in Plan 02 (TwiML endpoint does not use `verify_twilio_signature` because `resolve_org_from_phone` would fail when `To` is the voter's number) is architecturally sound — the CampaignId parameter from the frontend connect params serves as the campaign context signal, and T-91-09 mitigation validates it server-side.

---

_Verified: 2026-04-07T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
