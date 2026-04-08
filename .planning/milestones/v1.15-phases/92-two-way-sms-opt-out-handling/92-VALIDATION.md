---
phase: 92
slug: two-way-sms-opt-out-handling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + existing frontend test runner |
| **Config file** | `pyproject.toml`, `web/package.json` |
| **Quick run command** | `uv run pytest tests/unit/test_sms_models_schemas.py tests/unit/test_sms_service.py -x -q` |
| **Full backend command** | `uv run pytest tests/unit/test_sms_models_schemas.py tests/unit/test_sms_service.py tests/unit/test_sms_api.py tests/unit/test_sms_webhooks.py -x -q` |
| **Frontend command** | `cd web && npm test -- --runInBand src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx` |
| **Estimated runtime** | ~20-40 seconds backend, ~20 seconds frontend |

---

## Sampling Rate

- **After every task commit:** run the smallest relevant backend or frontend command from the map below.
- **After every plan wave:** run the full backend command plus the phase-specific frontend test file.
- **Before verification:** run the full backend command and a targeted browser/UI check for the inbox route.
- **Max feedback latency:** 10 minutes between implementation and first test signal.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 92-01-01 | 01 | 1 | SMS-03 | T-92-01 | Conversation/message tables are campaign-scoped and protected by RLS | unit | `uv run pytest tests/unit/test_sms_models_schemas.py -x -q` | ❌ W0 | ⬜ pending |
| 92-01-02 | 01 | 1 | SMS-01, COMP-01 | T-92-02 | Eligibility and opt-out state have explicit service contracts | unit | `uv run pytest tests/unit/test_sms_service.py -x -q` | ❌ W0 | ⬜ pending |
| 92-02-01 | 02 | 2 | SMS-01 | T-92-03 | Individual send rejects non-eligible or opted-out numbers before Twilio send | unit | `uv run pytest tests/unit/test_sms_api.py -x -q` | ❌ W0 | ⬜ pending |
| 92-02-02 | 02 | 2 | SMS-02 | T-92-04 | Bulk sends enqueue via Procrastinate and expose batch status | unit | `uv run pytest tests/unit/test_sms_service.py tests/unit/test_sms_api.py -x -q` | ❌ W0 | ⬜ pending |
| 92-03-01 | 03 | 2 | SMS-03 | T-92-05 | Inbound replies thread into the correct conversation without duplicates | unit | `uv run pytest tests/unit/test_sms_webhooks.py -x -q` | ❌ W0 | ⬜ pending |
| 92-03-02 | 03 | 2 | SMS-04 | T-92-06 | STOP/START keyword handling updates SMS preference state only | unit | `uv run pytest tests/unit/test_sms_webhooks.py -x -q` | ❌ W0 | ⬜ pending |
| 92-04-01 | 04 | 3 | SMS-03, COMP-01 | — | Inbox renders list/thread/composer and blocks non-compliant sends inline | frontend | `cd web && npm test -- --runInBand src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx` | ❌ W0 | ⬜ pending |
| 92-04-02 | 04 | 3 | SMS-02 | — | Bulk-send sheet shows queued/progress/completed states | frontend | `cd web && npm test -- --runInBand src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/test_sms_models_schemas.py` — migration/model/schema coverage for the SMS domain
- [ ] `tests/unit/test_sms_service.py` — eligibility, send orchestration, threading, and opt-out service tests
- [ ] `tests/unit/test_sms_api.py` — campaign send/inbox endpoint tests
- [ ] `tests/unit/test_sms_webhooks.py` — Twilio inbound/status callback tests
- [ ] `web/src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx` — route-level inbox UI tests

*No new test framework installs should be required. Reuse existing pytest and frontend test infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Desktop inbox layout and thread readability | SMS-03 | Visual UX verification | Open the new `Messages` route in a seeded campaign and confirm two-pane list/detail layout with sticky composer |
| Mobile inbox stacking and composer accessibility | SMS-03 | Responsive behavior | Use a narrow viewport and confirm the list/detail stack matches the UI spec |
| Compliance warning copy and disabled send controls | COMP-01 | Requires reviewing actual UX copy and control states | Load an ineligible or opted-out voter and confirm the composer is disabled with the correct inline banner |
| Bulk-send operator flow | SMS-02 | Requires end-to-end state transitions | Launch a bulk send from a real segment, confirm queued/progress/completed UI states |

---

## Validation Sign-Off

- [ ] All plans have at least one automated verification command
- [ ] Webhook duplicate-delivery behavior is covered by tests
- [ ] UI gating is covered by at least one route-level frontend test
- [ ] Manual checks are limited to true UI/runtime concerns
- [ ] `nyquist_compliant: true` set in frontmatter before final verification

**Approval:** pending
