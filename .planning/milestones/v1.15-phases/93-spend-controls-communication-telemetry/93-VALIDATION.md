---
phase: 93
slug: spend-controls-communication-telemetry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 93 — Validation Strategy

> Per-phase validation contract for spend controls, telemetry persistence, and org settings UX.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + existing frontend test runner |
| **Config file** | `pyproject.toml`, `web/package.json` |
| **Quick backend command** | `uv run pytest tests/unit/test_communication_budget_service.py -x -q` |
| **Full backend command** | `uv run pytest tests/unit/test_communication_budget_models.py tests/unit/test_communication_budget_service.py tests/unit/test_org_api.py tests/unit/test_sms_api.py tests/unit/test_sms_webhooks.py tests/unit/test_call_records.py -x -q` |
| **Frontend command** | `cd web && npm test -- --runInBand src/routes/org/settings.test.tsx src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` |
| **Estimated runtime** | ~30-60 seconds backend, ~30 seconds frontend |

## Sampling Rate

- After every task-sized change, run the smallest relevant command from the matrix below.
- After every execution wave, run the full backend command plus the phase-specific frontend command.
- Before final verification, rerun all targeted backend/frontend commands and confirm budget-block copy manually in one call and one SMS flow.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 93-01-01 | 01 | 1 | BUD-01, OBS-01 | Org budget fields and ledger table persist durable communication spend facts | unit | `uv run pytest tests/unit/test_communication_budget_models.py -x -q` | ⬜ pending |
| 93-01-02 | 01 | 1 | BUD-01 | Shared budget service computes totals, pending spend, and machine-readable gate results | unit | `uv run pytest tests/unit/test_communication_budget_service.py -x -q` | ⬜ pending |
| 93-02-01 | 02 | 2 | BUD-01 | Voice and SMS sends are blocked before launch when org spend is over budget | unit | `uv run pytest tests/unit/test_sms_api.py tests/unit/test_call_records.py -x -q` | ⬜ pending |
| 93-02-02 | 02 | 2 | OBS-01 | Voice/SMS lifecycle events create and reconcile ledger rows with provisional and final cost | unit | `uv run pytest tests/unit/test_communication_budget_service.py tests/unit/test_sms_webhooks.py -x -q` | ⬜ pending |
| 93-02-03 | 02 | 2 | BUD-01 | Org API returns and updates spend-policy data for admins | unit | `uv run pytest tests/unit/test_org_api.py -x -q` | ⬜ pending |
| 93-03-01 | 03 | 3 | BUD-01 | Org settings renders spend card, threshold controls, and recent activity | frontend | `cd web && npm test -- --runInBand src/routes/org/settings.test.tsx` | ⬜ pending |
| 93-03-02 | 03 | 3 | BUD-01 | Calling and messaging flows show inline budget-block states, not toast-only failures | frontend | `cd web && npm test -- --runInBand src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx` | ⬜ pending |

## Wave 0 Requirements

- [ ] `tests/unit/test_communication_budget_models.py`
- [ ] `tests/unit/test_communication_budget_service.py`
- [ ] `tests/unit/test_org_api.py` coverage for budget fields
- [ ] targeted SMS/voice tests covering budget block behavior
- [ ] targeted org settings + phone-banking frontend tests for inline budget messaging

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spend card readability in org settings | BUD-01 | visual density check | Open `org/settings` and confirm the spend card reads as an operational admin surface, not a dashboard |
| Inline block copy during call start | BUD-01 | requires UX review in live route | Seed an over-budget org and confirm the calling UI explains the block before connect |
| Inline block copy during SMS send | BUD-01 | requires UX review in live route | Seed an over-budget org and confirm the Messages composer explains the block inline |
| Pending-cost chip behavior | OBS-01 | runtime state review | Trigger provisional spend rows and confirm pending-state copy appears in org settings |

## Validation Sign-Off

- [ ] All plans have at least one automated verification command
- [ ] Voice and SMS both exercise the same budget gate semantics
- [ ] Ledger rows capture provisional and final cost states
- [ ] Org settings exposes editable soft-budget controls and recent activity
- [ ] `nyquist_compliant: true` set before final verification

**Approval:** pending
