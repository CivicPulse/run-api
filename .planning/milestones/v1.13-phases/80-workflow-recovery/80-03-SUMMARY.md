# 80-03 Summary

## Outcome

Closed the remaining workflow validation gaps:

- `app/services/phone_bank.py`, `app/api/v1/phone_banks.py`, and `app/schemas/phone_bank.py` now reject missing session `call_list_id` targets cleanly and enforce `result_code` as the phone-bank enum so bogus values return `422`.
- `app/services/survey.py` now requires reorder payloads to include every question exactly once, rejecting partial-ID submissions with `400`.
- `app/api/v1/shifts.py` now treats volunteer self-cancel as idempotent when there is no remaining active signup record, matching the supported contract from the shakedown finding.
- Added focused regressions in `tests/unit/test_phone_bank.py`, `tests/unit/test_api_phone_banks.py`, `tests/unit/test_surveys.py`, `tests/unit/test_api_surveys.py`, and `tests/unit/test_api_shifts.py`.

## Verification

- `uv run pytest tests/unit/test_phone_bank.py tests/unit/test_api_phone_banks.py tests/unit/test_surveys.py tests/unit/test_api_surveys.py tests/unit/test_api_shifts.py -q` ✅
