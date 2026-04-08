"""Unit tests for SMS webhook handlers."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.rate_limit import limiter

limiter.enabled = False


def _mock_request(form_data: dict[str, str]) -> MagicMock:
    request = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = {}
    request.state = MagicMock()
    request.state.twilio_form = form_data

    async def _form():
        return form_data

    request.form = _form
    return request


def _mock_org() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4())


@pytest.mark.asyncio
async def test_sms_inbound_callback_ignores_duplicate_delivery():
    from app.api.v1.webhooks import sms_inbound_callback

    request = _mock_request(
        {
            "MessageSid": "SM123",
            "Body": "hello",
            "From": "+15555550123",
            "To": "+15550000001",
        }
    )
    db = AsyncMock()

    with (
        patch(
            "app.api.v1.webhooks.check_idempotency",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.api.v1.webhooks._sms_service.process_inbound_message",
            new_callable=AsyncMock,
        ) as process_mock,
    ):
        result = await sms_inbound_callback(request=request, org=_mock_org(), db=db)

    assert result == ""
    process_mock.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_sms_inbound_callback_processes_message_and_commits():
    from app.api.v1.webhooks import sms_inbound_callback

    org = _mock_org()
    request = _mock_request(
        {
            "MessageSid": "SM123",
            "Body": "STOP",
            "From": "+15555550123",
            "To": "+15550000001",
        }
    )
    db = AsyncMock()

    with (
        patch(
            "app.api.v1.webhooks.check_idempotency",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch(
            "app.api.v1.webhooks._sms_service.process_inbound_message",
            new_callable=AsyncMock,
            return_value=(SimpleNamespace(), SimpleNamespace()),
        ) as process_mock,
    ):
        result = await sms_inbound_callback(request=request, org=org, db=db)

    assert result == ""
    process_mock.assert_awaited_once_with(
        db,
        org,
        from_number="+15555550123",
        to_number="+15550000001",
        body="STOP",
        message_sid="SM123",
    )
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sms_status_callback_updates_message_and_commits():
    from app.api.v1.webhooks import sms_status_callback

    request = _mock_request(
        {
            "MessageSid": "SM555",
            "MessageStatus": "delivered",
            "ErrorCode": "",
            "ErrorMessage": "",
        }
    )
    db = AsyncMock()

    with (
        patch(
            "app.api.v1.webhooks.check_idempotency",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch(
            "app.api.v1.webhooks._sms_service.update_delivery_status",
            new_callable=AsyncMock,
        ) as update_mock,
    ):
        result = await sms_status_callback(request=request, org=_mock_org(), db=db)

    assert result == ""
    update_mock.assert_awaited_once()
    assert update_mock.await_args.kwargs["twilio_message_sid"] == "SM555"
    assert update_mock.await_args.kwargs["provider_status"] == "delivered"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sms_status_callback_ignores_duplicate_delivery():
    from app.api.v1.webhooks import sms_status_callback

    request = _mock_request(
        {
            "MessageSid": "SM555",
            "MessageStatus": "failed",
        }
    )
    db = AsyncMock()

    with (
        patch(
            "app.api.v1.webhooks.check_idempotency",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch(
            "app.api.v1.webhooks._sms_service.update_delivery_status",
            new_callable=AsyncMock,
        ) as update_mock,
    ):
        result = await sms_status_callback(request=request, org=_mock_org(), db=db)

    assert result == ""
    update_mock.assert_not_called()
    db.commit.assert_not_awaited()
