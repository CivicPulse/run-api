# 63-01 Summary - Guarded Phone-Bank Session Delete API

## Outcome

Implemented guarded hard-delete for phone-bank sessions with full service + API coverage.

## What Changed

- Added `PhoneBankService.delete_session(...)` in `app/services/phone_bank.py`.
  - Rejects delete for `active` sessions.
  - Deletes `SessionCaller` assignments for the session.
  - Hard-deletes the `PhoneBankSession` row.
- Added `DELETE /api/v1/campaigns/{campaign_id}/phone-bank-sessions/{session_id}` in `app/api/v1/phone_banks.py`.
  - `204` on successful delete.
  - `422` for active-session guard failure.
  - `404` for missing session.
- Added route-level tests in `tests/unit/test_api_phone_banks.py` for `204/422/404` contract.
- Extended service-level tests in `tests/unit/test_phone_bank.py` for delete behavior.

## Verification

- `uv run ruff check app/api/v1/phone_banks.py app/services/phone_bank.py tests/unit/test_phone_bank.py tests/unit/test_api_phone_banks.py`
- `uv run pytest tests/unit/test_phone_bank.py tests/unit/test_api_phone_banks.py`

## Status

Plan 63-01 complete.
