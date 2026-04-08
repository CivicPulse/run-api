---
phase: 91-browser-voice-calling
plan: "03"
subsystem: frontend-voice
tags: [twilio, voice-sdk, webrtc, phone-banking, accessibility]
dependency_graph:
  requires: [91-02]
  provides: [browser-calling-ui, voice-hooks, compliance-banners]
  affects: [phone-banking-call-page, phone-number-list]
tech_stack:
  added: ["@twilio/voice-sdk"]
  patterns: [twilio-device-lifecycle, microphone-permission-probe, auto-advance-on-disconnect]
key_files:
  created:
    - web/src/types/voice.ts
    - web/src/hooks/useVoiceCapability.ts
    - web/src/hooks/useTwilioDevice.ts
    - web/src/components/field/CallStatusBar.tsx
    - web/src/components/field/CallModeIndicator.tsx
    - web/src/components/field/DncBlockBanner.tsx
    - web/src/components/field/CallingHoursBanner.tsx
  modified:
    - web/package.json
    - web/src/components/field/PhoneNumberList.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx
decisions:
  - "Microphone permission probed on first browser call attempt; denial falls back to tel: with toast"
  - "DNC and calling hours checks fetched on voter claim (non-blocking); failures allow calls since server-side TwiML enforces compliance"
  - "Auto-advance uses 500ms setTimeout on callStatus transition to closed"
  - "VoterInfoPanel refactored to use PhoneNumberList component instead of inline phone buttons"
metrics:
  duration: "3m 27s"
  completed: "2026-04-07T22:58:00Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 7
  files_modified: 3
---

# Phase 91 Plan 03: Browser Voice Calling Frontend Summary

Frontend browser voice calling experience with Twilio Voice SDK, inline call UI, and compliance guardrails integrated into the phone banking call page.

## Completed Tasks

### Task 1: Install SDK, create types, hooks, and field components (151b2a4)

Installed `@twilio/voice-sdk` and created the full frontend voice calling foundation:

- **voice.ts**: TypeScript types for call status, capability, DNC checks, calling hours, and call mode
- **useVoiceCapability**: TanStack Query hook checking API capability + Device.isSupported + navigator.mediaDevices; returns "browser" or "tel" mode
- **useTwilioDevice**: Full Device lifecycle hook with token management, connect/disconnect/mute, duration timer, auto-refresh on tokenWillExpire, and error handling
- **CallStatusBar**: Inline status bar with font-mono duration timer, status badge, mute toggle (aria-pressed), hang-up button (auto-focused on mount), 44px touch targets, aria-live with 2s debounce
- **CallModeIndicator**: Badge showing "Browser Call" (blue, Headphones) or "Phone" (neutral, Phone icon) with tooltips
- **DncBlockBanner**: role="alert" destructive banner with ShieldAlert icon
- **CallingHoursBanner**: role="alert" yellow banner showing message and allowed time window

### Task 2: Integrate browser calling into PhoneNumberList and call page (c14d246)

Wired the voice calling system into the existing phone banking flow:

- **PhoneNumberList**: Extended with callMode, callStatus, DNC/hours props. Renders four states per phone row: DNC blocked (banner + strikethrough), calling hours blocked (disabled), browser call (Headphones button), tel: link (preserved fallback). CallStatusBar appears inline below active call row. Microphone permission probed with getUserMedia before connecting; denial falls back to tel: with toast.
- **call.tsx**: Added useVoiceCapability and useTwilioDevice hooks. Tracks activeCallNumber, dncStatus, callingHoursCheck state. Fetches DNC check per phone and calling hours on voter claim (non-blocking). Auto-advance to recording phase on call disconnect after 500ms delay. Recording phase renders same two-panel layout for outcome selection. VoterInfoPanel refactored to use PhoneNumberList component.

### Task 3: Visual verification (checkpoint -- not executed)

Left for orchestrator human-verify checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] VoterInfoPanel refactored to use PhoneNumberList**
- **Found during:** Task 2
- **Issue:** The original VoterInfoPanel rendered inline phone buttons without using PhoneNumberList. To integrate browser calling, the panel needed to use PhoneNumberList with all its new props.
- **Fix:** Replaced inline phone number rendering in VoterInfoPanel with the PhoneNumberList component, passing all voice-related props through.
- **Files modified:** call.tsx
- **Commit:** c14d246

**2. [Rule 2 - Missing functionality] Recording phase UI support**
- **Found during:** Task 2
- **Issue:** The auto-advance from browser call creates a "recording" phase that the original page didn't render with a two-panel layout.
- **Fix:** Added a recording phase render block that shows the same voter info + survey + outcome panels, allowing outcome selection after browser call auto-advance.
- **Files modified:** call.tsx
- **Commit:** c14d246

## Threat Flags

None -- all new surface matches the plan's threat model. Client-side DNC and calling hours checks are UX convenience only; server-side TwiML handler (Plan 02) enforces compliance.

## Self-Check: PASSED

All 9 key files verified on disk. Both task commits (151b2a4, c14d246) confirmed in git log. TypeScript compiles cleanly.
