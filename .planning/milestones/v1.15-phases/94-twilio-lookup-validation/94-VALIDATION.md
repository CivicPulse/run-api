---
phase: 94
slug: twilio-lookup-validation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-08
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for cached Twilio Lookup data, contact-edit reuse, and SMS-preflight safety.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + existing frontend test runner |
| **Config file** | `pyproject.toml`, `web/package.json` |
| **Quick backend command** | `uv run pytest tests/unit/test_phone_validation_service.py -x -q` |
| **Full backend command** | `uv run pytest tests/unit/test_phone_validation_models.py tests/unit/test_phone_validation_service.py tests/unit/test_voter_contacts.py tests/unit/test_sms_api.py tests/unit/test_sms_service.py -x -q` |
| **Frontend command** | `cd web && npm test -- --runInBand src/components/voters/ContactsTab.test.tsx src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx` |
| **Estimated runtime** | ~30-60 seconds backend, ~20-30 seconds frontend |

## Sampling Rate

- After each task-sized backend change, run the smallest relevant pytest target from the map below.
- After each execution wave, rerun the full backend command or the phase-specific frontend command.
- Before final verification, rerun all targeted backend/frontend commands and manually confirm one contact edit plus one SMS-preflight flow.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 94-01-01 | 01 | 1 | LOOK-01 | Campaign-scoped validation cache stores Twilio Lookup summary, raw payload, TTL metadata, and refresh state | unit | `uv run pytest tests/unit/test_phone_validation_models.py -x -q` | ✅ passed |
| 94-01-02 | 01 | 1 | LOOK-01 | Lookup service reuses cache, refreshes stale rows, and degrades safely on Twilio errors | unit | `uv run pytest tests/unit/test_phone_validation_service.py -x -q` | ✅ passed |
| 94-02-01 | 02 | 2 | LOOK-01 | Phone add/update/list responses surface validation summaries without blocking contact saves on lookup failure | unit | `uv run pytest tests/unit/test_voter_contacts.py -x -q` | ✅ passed |
| 94-02-02 | 02 | 2 | SMS-01, COMP-01 | SMS eligibility consumes cached lookup state and blocks unsafe line types before send | unit | `uv run pytest tests/unit/test_sms_api.py tests/unit/test_sms_service.py -x -q` | ✅ passed |
| 94-03-01 | 03 | 3 | LOOK-01 | Contacts tab renders validation badges, freshness, and refresh affordances inline with phone editing | frontend | `cd web && npm test -- src/components/voters/ContactsTab.test.tsx` | ✅ passed |
| 94-03-02 | 03 | 3 | SMS-01 | SMS messages route renders lookup-driven textability state before send | frontend | `cd web && npm test -- src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx` | ✅ passed |

## Wave 0 Requirements

- [x] `tests/unit/test_phone_validation_models.py`
- [x] `tests/unit/test_phone_validation_service.py`
- [x] `tests/unit/test_voter_contacts.py` coverage for lookup-aware phone CRUD
- [x] targeted SMS eligibility tests covering stale/mobile/unsafe lookup states
- [x] targeted frontend tests for ContactsTab and SMS-preflight lookup copy

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Validation badge readability in contact editing | LOOK-01 | visual density and hierarchy check | Open the voter contacts tab, edit a phone, and confirm the badge/summary stays subordinate to the form controls |
| Save path during lookup outage | LOOK-01 | needs runtime failure simulation | Force Lookup failure, save a contact edit, and confirm the edit succeeds while warning state remains visible |
| SMS preflight messaging for unsafe numbers | SMS-01, COMP-01 | UX review in live route | Seed a landline or review-needed cache result and confirm Messages blocks send with clear inline copy |

## Validation Sign-Off

- [x] All plans have at least one automated verification command
- [x] Lookup cache is separate from source contact data
- [x] Contact save remains available when Twilio Lookup fails
- [x] SMS safety consumes cached validation results instead of mutating contact type
- [x] `nyquist_compliant: true` set before final verification

**Approval:** verified 2026-04-08
