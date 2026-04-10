from __future__ import annotations

import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.time import utcnow
from app.models.phone_validation import PhoneValidation


@pytest.mark.asyncio
async def test_get_validation_summary_reuses_fresh_cache():
    from app.services.phone_validation import PhoneValidationService

    service = PhoneValidationService()
    cache = PhoneValidation(
        campaign_id=uuid.uuid4(),
        normalized_phone_number="+15555550123",
        status="validated",
        line_type="mobile",
        sms_capable=True,
        validated_at=utcnow(),
    )
    db = AsyncMock()

    with patch.object(service, "_get_cache_row", new=AsyncMock(return_value=cache)):
        summary = await service.get_validation_summary(
            db,
            campaign_id=cache.campaign_id,
            phone_number="(555) 555-0123",
        )

    assert summary.status == "validated"
    assert summary.sms_capable is True


@pytest.mark.asyncio
async def test_get_validation_summary_refreshes_stale_cache():
    from app.services.phone_validation import PhoneValidationService

    service = PhoneValidationService()
    cache = PhoneValidation(
        campaign_id=uuid.uuid4(),
        normalized_phone_number="+15555550123",
        status="validated",
        line_type="mobile",
        sms_capable=True,
        validated_at=utcnow() - timedelta(days=91),
    )
    db = AsyncMock()

    with (
        patch.object(service, "_get_cache_row", new=AsyncMock(return_value=cache)),
        patch.object(
            service,
            "refresh_validation",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    summary=SimpleNamespace(status="validated", sms_capable=True)
                )
            ),
        ) as refresh_mock,
    ):
        summary = await service.get_validation_summary(
            db,
            campaign_id=cache.campaign_id,
            phone_number="(555) 555-0123",
            refresh_if_stale=True,
        )

    assert summary.status == "validated"
    refresh_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_validation_degrades_safely_on_lookup_failure():
    from app.services.phone_validation import PhoneValidationService

    service = PhoneValidationService()
    db = AsyncMock()
    db.add = MagicMock()

    with (
        patch.object(service, "_get_cache_row", new=AsyncMock(return_value=None)),
        patch.object(
            service,
            "_resolve_org",
            new=AsyncMock(return_value=(SimpleNamespace(), SimpleNamespace())),
        ),
        patch.object(
            service._twilio,
            "get_twilio_client",
            side_effect=RuntimeError("boom"),
        ),
    ):
        result = await service.refresh_validation(
            db,
            campaign_id=uuid.uuid4(),
            phone_number="+1 (555) 555-0123",
        )

    assert result.summary.status == "pending"
    assert result.summary.reason_code == "lookup_unavailable"
    db.flush.assert_awaited_once()
