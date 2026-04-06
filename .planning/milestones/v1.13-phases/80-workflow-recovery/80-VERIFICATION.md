status: passed

# Phase 80 Verification

## Result

Phase 80 verification passed.

## Passed

- Campaign and join flows now tolerate pre-existing ZITADEL project grants by resolving the existing grant ID instead of failing on legacy `400` or `409` grant-create responses.
- Import confirm no longer fails immediately during worker startup; the background task uses the real CSV pre-scan helper and preserves both serial and chunked orchestration paths.
- Phone-bank session creation now returns a clean not-found error for nonexistent `call_list_id`, and phone-bank call recording rejects invalid `result_code` values with request validation `422`.
- Survey question reorder now rejects partial question sets while preserving valid full reorder behavior.
- Volunteer self-cancel now behaves idempotently when no remaining active signup exists, matching the supported contract recorded in the production shakedown.
- `uv run pytest tests/unit/test_surveys.py tests/unit/test_campaign_service.py tests/unit/test_import_task.py tests/unit/test_phone_bank.py tests/unit/test_api_phone_banks.py tests/unit/test_api_surveys.py tests/unit/test_api_shifts.py -q` passed (`93 passed`).
- `uv run pytest tests/unit/test_join_service.py tests/unit/test_import_confirm.py -q` passed (`18 passed`).

## Residual Note

- `tests/unit/test_api_campaigns.py` currently has unrelated auth/mock setup drift and was not used as the phase 80 gate. The phase 80 fixes were verified through the changed service logic and the focused route-level regressions above.

## Exit Criteria To Close Phase

Phase 80 is ready to transition to Phase 81.
