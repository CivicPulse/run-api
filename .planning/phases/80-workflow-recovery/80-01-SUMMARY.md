# 80-01 Summary

## Outcome

Hardened project-grant recovery for campaign and join flows:

- `app/services/zitadel.py` now treats both legacy `400 already exists` and `409 conflict` grant-create responses as idempotent, then resolves the existing grant ID.
- Existing campaign and join service compensation logic remains intact while grant resolution no longer fails on pre-existing ZITADEL project grants.
- Added focused regression coverage for the idempotent existing-grant path in `tests/unit/test_campaign_service.py`.

## Verification

- `uv run pytest tests/unit/test_campaign_service.py tests/unit/test_join_service.py -q` ✅
